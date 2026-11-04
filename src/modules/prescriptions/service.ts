import crypto from "crypto";
import { supabaseAdmin } from "../../lib/supabase.js";
import { AppError } from "../../middleware/errorHandler.js";
import { StorageService } from "../../lib/storage.js";
import { PrescriptionPdfGenerator } from "../../lib/pdf.js";
import { FcmService } from "../../lib/fcm.js";
import { SavePrescriptionInput } from "./schema.js";

const PRESCRIPTION_BUCKET = "prescriptions";

export class PrescriptionService {
  /**
   * Membuat atau memperbarui draft resep obat oleh dokter yang ditugaskan
   */
  static async savePrescriptionDraft(
    doctorId: string,
    consultationId: string,
    input: SavePrescriptionInput
  ) {
    // 1. Validasi Konsultasi
    const { data: consultation, error: cErr } = await supabaseAdmin
      .from("consultations")
      .select("id, patient_id, doctor_id, status")
      .eq("id", consultationId)
      .maybeSingle();

    if (cErr || !consultation) {
      throw new AppError(404, "NOT_FOUND", "Konsultasi tidak ditemukan");
    }

    if (consultation.doctor_id !== doctorId) {
      throw new AppError(
        403,
        "FORBIDDEN",
        "Hanya dokter penanggung jawab yang berhak membuat atau mengubah resep obat"
      );
    }

    if (consultation.status !== "active" && consultation.status !== "closed") {
      throw new AppError(
        400,
        "INVALID_STATE",
        `Resep hanya dapat dibuat pada sesi aktif atau selesai (status saat ini: '${consultation.status}')`
      );
    }

    // 2. Cek apakah resep sudah ada
    const { data: existingPrescription } = await supabaseAdmin
      .from("prescriptions")
      .select("id, status")
      .eq("consultation_id", consultationId)
      .maybeSingle();

    if (existingPrescription && existingPrescription.status === "issued") {
      throw new AppError(
        400,
        "PRESCRIPTION_ALREADY_ISSUED",
        "Resep ini sudah resmi diterbitkan (issued) dan bersifat terkunci (immutable)"
      );
    }

    let prescriptionId: string;

    if (existingPrescription) {
      prescriptionId = existingPrescription.id;
      // Update resep
      await supabaseAdmin
        .from("prescriptions")
        .update({
          notes: input.notes || null,
        })
        .eq("id", prescriptionId);

      // Hapus item lama untuk digantikan item baru
      await supabaseAdmin
        .from("prescription_items")
        .delete()
        .eq("prescription_id", prescriptionId);
    } else {
      // Buat resep baru berstatus draft
      const { data: newPrescription, error: pErr } = await supabaseAdmin
        .from("prescriptions")
        .insert({
          consultation_id: consultationId,
          doctor_id: doctorId,
          patient_id: consultation.patient_id,
          notes: input.notes || null,
          status: "draft",
        })
        .select()
        .single();

      if (pErr || !newPrescription) {
        throw new AppError(500, "DATABASE_ERROR", "Gagal membuat draft resep");
      }

      prescriptionId = newPrescription.id;
    }

    // 3. Simpan item-item resep
    const itemsToInsert = input.items.map((item, index) => ({
      prescription_id: prescriptionId,
      medicine_name: item.medicine_name,
      dosage: item.dosage || null,
      instructions: item.instructions,
      quantity: item.quantity,
      notes: item.notes || null,
      sort_order: item.sort_order ?? index,
    }));

    const { data: insertedItems, error: itemsErr } = await supabaseAdmin
      .from("prescription_items")
      .insert(itemsToInsert)
      .select();

    if (itemsErr) {
      throw new AppError(500, "DATABASE_ERROR", "Gagal menyimpan rincian item resep");
    }

    return {
      id: prescriptionId,
      consultation_id: consultationId,
      doctor_id: doctorId,
      patient_id: consultation.patient_id,
      notes: input.notes || null,
      status: "draft",
      items: insertedItems,
    };
  }

  /**
   * Menerbitkan resep obat resmi (status menjadi 'issued', generate PDF & QR Code)
   */
  static async issuePrescription(doctorId: string, consultationId: string) {
    // 1. Validasi Konsultasi & Dokter
    const { data: consultation, error: cErr } = await supabaseAdmin
      .from("consultations")
      .select("id, patient_id, doctor_id, status")
      .eq("id", consultationId)
      .maybeSingle();

    if (cErr || !consultation) {
      throw new AppError(404, "NOT_FOUND", "Konsultasi tidak ditemukan");
    }

    if (consultation.doctor_id !== doctorId) {
      throw new AppError(
        403,
        "FORBIDDEN",
        "Hanya dokter penanggung jawab yang berhak menerbitkan resep obat"
      );
    }

    // 2. Ambil data resep draft beserta itemnya
    const { data: prescription, error: pErr } = await supabaseAdmin
      .from("prescriptions")
      .select(`
        id,
        status,
        notes,
        consultation_id,
        doctor_id,
        patient_id,
        prescription_items (*)
      `)
      .eq("consultation_id", consultationId)
      .maybeSingle();

    if (pErr || !prescription) {
      throw new AppError(
        404,
        "PRESCRIPTION_NOT_FOUND",
        "Draft resep tidak ditemukan. Silakan buat draft resep terlebih dahulu."
      );
    }

    if (prescription.status === "issued") {
      throw new AppError(
        400,
        "PRESCRIPTION_ALREADY_ISSUED",
        "Resep sudah diterbitkan sebelumnya"
      );
    }

    const items = (prescription as any).prescription_items || [];
    if (items.length === 0) {
      throw new AppError(
        400,
        "PRESCRIPTION_ITEMS_EMPTY",
        "Resep tidak memiliki item obat untuk diterbitkan"
      );
    }

    // Urutkan item berdasarkan sort_order
    items.sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    // 3. Ambil data profil dokter & pasien untuk dicetak ke PDF
    const [docUserRes, docProfileRes, patientUserRes, patientProfileRes] = await Promise.all([
      supabaseAdmin.from("users").select("full_name").eq("id", doctorId).maybeSingle(),
      supabaseAdmin.from("doctor_profiles").select("sip_number, specialization").eq("user_id", doctorId).maybeSingle(),
      supabaseAdmin.from("users").select("full_name").eq("id", consultation.patient_id).maybeSingle(),
      supabaseAdmin.from("patient_profiles").select("gender, birth_date").eq("user_id", consultation.patient_id).maybeSingle(),
    ]);

    const doctorName = docUserRes.data?.full_name || "dr. Spesialis Jantung";
    const doctorSip = docProfileRes.data?.sip_number || "-";
    const doctorSpec = docProfileRes.data?.specialization || "Kardiologi";

    const patientName = patientUserRes.data?.full_name || "Pasien TeleHeart";
    const patientGender = patientProfileRes.data?.gender || "-";
    const patientBirthDate = patientProfileRes.data?.birth_date || null;

    // 4. Generate Verification Code Unik (Format: TH-RX-YYYYMM-XXXX)
    const now = new Date();
    const yearMonth = now.toISOString().slice(0, 7).replace("-", "");
    const randomHex = crypto.randomBytes(3).toString("hex").toUpperCase();
    const verificationCode = `TH-RX-${yearMonth}-${randomHex}`;

    // 5. Generate PDF dengan kop resmi, QR Code, dan tabel obat
    const pdfBuffer = await PrescriptionPdfGenerator.generatePrescriptionPdf({
      verificationCode,
      consultationId,
      issuedAt: now,
      doctor: {
        fullName: doctorName,
        sipNumber: doctorSip,
        specialization: doctorSpec,
      },
      patient: {
        fullName: patientName,
        gender: patientGender,
        birthDate: patientBirthDate,
      },
      notes: prescription.notes,
      items: items.map((i: any) => ({
        medicineName: i.medicine_name,
        dosage: i.dosage,
        instructions: i.instructions,
        quantity: i.quantity,
        notes: i.notes,
      })),
    });

    // 6. Simpan PDF ke bucket privat Supabase Storage
    const storagePath = `prescriptions/${consultationId}/${verificationCode}.pdf`;
    await StorageService.uploadFile(
      PRESCRIPTION_BUCKET,
      storagePath,
      pdfBuffer,
      "application/pdf"
    );

    // 7. Update status resep menjadi 'issued'
    const issuedAt = now.toISOString();
    const { data: updatedPrescription, error: uErr } = await supabaseAdmin
      .from("prescriptions")
      .update({
        status: "issued",
        issued_at: issuedAt,
        verification_code: verificationCode,
        pdf_path: storagePath,
      })
      .eq("id", prescription.id)
      .select()
      .single();

    if (uErr || !updatedPrescription) {
      throw new AppError(500, "DATABASE_ERROR", "Gagal memperbarui status resep resmi");
    }

    // 8. Kirim notifikasi in-app & push notification ke Pasien
    await FcmService.sendInAppAndPushNotification({
      userId: consultation.patient_id,
      type: "prescription_issued",
      title: "Resep Obat Elektronik Diterbitkan",
      body: `Dokter ${doctorName} telah menerbitkan resep elektronik (${verificationCode}) untuk Anda.`,
      data: {
        consultation_id: consultationId,
        prescription_id: prescription.id,
        verification_code: verificationCode,
      },
    });

    // 9. Dapatkan short-lived signed URL untuk unduh PDF langsung
    const signedUrl = await StorageService.createSignedUrl(
      PRESCRIPTION_BUCKET,
      storagePath,
      3600 // Berlaku 1 jam
    );

    return {
      ...updatedPrescription,
      items,
      download_url: signedUrl,
    };
  }

  /**
   * Mengambil data resep berdasarkan consultation_id
   */
  static async getPrescriptionByConsultation(
    userId: string,
    userRole: string,
    consultationId: string
  ) {
    const { data: consultation, error: cErr } = await supabaseAdmin
      .from("consultations")
      .select("id, patient_id, doctor_id")
      .eq("id", consultationId)
      .maybeSingle();

    if (cErr || !consultation) {
      throw new AppError(404, "NOT_FOUND", "Konsultasi tidak ditemukan");
    }

    const isParticipant =
      consultation.patient_id === userId || consultation.doctor_id === userId;

    if (!isParticipant && userRole !== "admin") {
      throw new AppError(403, "FORBIDDEN", "Anda tidak memiliki akses ke resep konsultasi ini");
    }

    const { data: prescription, error: pErr } = await supabaseAdmin
      .from("prescriptions")
      .select(`
        id,
        consultation_id,
        doctor_id,
        patient_id,
        notes,
        status,
        issued_at,
        pdf_path,
        verification_code,
        created_at,
        prescription_items (*)
      `)
      .eq("consultation_id", consultationId)
      .maybeSingle();

    if (pErr || !prescription) {
      return null;
    }

    let downloadUrl: string | null = null;
    if (prescription.status === "issued" && prescription.pdf_path) {
      downloadUrl = await StorageService.createSignedUrl(
        PRESCRIPTION_BUCKET,
        prescription.pdf_path,
        3600
      );
    }

    return {
      ...prescription,
      download_url: downloadUrl,
    };
  }

  /**
   * Mendapatkan signed URL unduh berkas PDF resep
   */
  static async getPrescriptionDownloadUrl(
    userId: string,
    userRole: string,
    prescriptionId: string
  ) {
    const { data: prescription, error: pErr } = await supabaseAdmin
      .from("prescriptions")
      .select("id, patient_id, doctor_id, status, pdf_path, verification_code")
      .eq("id", prescriptionId)
      .maybeSingle();

    if (pErr || !prescription) {
      throw new AppError(404, "NOT_FOUND", "Resep tidak ditemukan");
    }

    const isParticipant =
      prescription.patient_id === userId || prescription.doctor_id === userId;

    if (!isParticipant && userRole !== "admin") {
      throw new AppError(403, "FORBIDDEN", "Anda tidak memiliki izin mengunduh resep ini");
    }

    if (prescription.status !== "issued" || !prescription.pdf_path) {
      throw new AppError(
        400,
        "PRESCRIPTION_NOT_ISSUED",
        "Dokumen PDF resep belum diterbitkan oleh dokter"
      );
    }

    const downloadUrl = await StorageService.createSignedUrl(
      PRESCRIPTION_BUCKET,
      prescription.pdf_path,
      3600 // 1 jam
    );

    if (!downloadUrl) {
      throw new AppError(500, "STORAGE_ERROR", "Gagal menghasilkan tautan unduh dokumen");
    }

    return {
      download_url: downloadUrl,
      verification_code: prescription.verification_code,
      file_name: `Resep_TeleHeart_${prescription.verification_code}.pdf`,
    };
  }

  /**
   * Verifikasi Keaslian Resep Secara Publik (Public Endpoint, Tanpa Login)
   */
  static async verifyPrescriptionCode(code: string) {
    if (!code || typeof code !== "string") {
      throw new AppError(400, "BAD_REQUEST", "Kode verifikasi resep wajib dicantumkan");
    }

    const { data: prescription, error: pErr } = await supabaseAdmin
      .from("prescriptions")
      .select(`
        id,
        consultation_id,
        doctor_id,
        patient_id,
        notes,
        status,
        issued_at,
        verification_code,
        prescription_items (*)
      `)
      .eq("verification_code", code.trim().toUpperCase())
      .eq("status", "issued")
      .maybeSingle();

    if (pErr || !prescription) {
      throw new AppError(
        404,
        "PRESCRIPTION_NOT_FOUND",
        "Resep tidak ditemukan atau kode verifikasi tidak valid"
      );
    }

    // Ambil data dokter dan pasien
    const [docUserRes, docProfileRes, patientUserRes] = await Promise.all([
      supabaseAdmin.from("users").select("full_name").eq("id", prescription.doctor_id).maybeSingle(),
      supabaseAdmin.from("doctor_profiles").select("sip_number, specialization").eq("user_id", prescription.doctor_id).maybeSingle(),
      supabaseAdmin.from("users").select("full_name").eq("id", prescription.patient_id).maybeSingle(),
    ]);

    const items = ((prescription as any).prescription_items || []).sort(
      (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
    );

    return {
      is_valid: true,
      verification_code: prescription.verification_code,
      issued_at: prescription.issued_at,
      doctor: {
        name: docUserRes.data?.full_name || "dr. Spesialis Jantung",
        sip_number: docProfileRes.data?.sip_number || "-",
        specialization: docProfileRes.data?.specialization || "Kardiologi",
      },
      patient: {
        name: patientUserRes.data?.full_name || "Pasien TeleHeart",
      },
      notes: prescription.notes,
      items: items.map((i: any) => ({
        medicine_name: i.medicine_name,
        dosage: i.dosage,
        instructions: i.instructions,
        quantity: i.quantity,
        notes: i.notes,
      })),
    };
  }
}

