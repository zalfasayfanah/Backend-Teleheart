import { supabaseAdmin } from "../../lib/supabase.js";
import { AppError } from "../../middleware/errorHandler.js";
import { evaluateVitalSigns } from "./vitalSignsEvaluator.js";
import { CreateConsultationInput, SubmitVitalsInput, CheckoutInput } from "./schema.js";
import { mayarClient } from "../../lib/mayar.js";
import { env } from "../../config/env.js";

export class ConsultationService {
  /**
   * Pasien Memulai Pemeriksaan (Status: draft)
   */
  static async createConsultation(patientId: string, input: CreateConsultationInput) {
    // 1. Cek apakah ada konsultasi berjalan (waiting_payment, waiting_doctor, active)
    const { data: ongoing } = await supabaseAdmin
      .from("consultations")
      .select("id, status")
      .eq("patient_id", patientId)
      .in("status", ["waiting_payment", "waiting_doctor", "active"])
      .limit(1)
      .maybeSingle();

    if (ongoing) {
      throw new AppError(
        409,
        "ACTIVE_CONSULTATION_EXISTS",
        "Anda memiliki konsultasi yang sedang berjalan",
        [{ field: "consultation_id", message: ongoing.id }]
      );
    }

    let doctorFee = 0;
    let platformFee = 0;
    let totalAmount = 0;
    const duration = input.duration_minutes || 15;

    // Jika dokter dipilih dari awal, hitung snapshot tarifnya
    if (input.doctor_id) {
      const { data: tariff } = await supabaseAdmin
        .from("doctor_tariffs")
        .select("price")
        .eq("doctor_id", input.doctor_id)
        .eq("duration_minutes", duration)
        .eq("is_active", true)
        .maybeSingle();

      doctorFee = tariff?.price ?? 50000;

      const { data: fee } = await supabaseAdmin
        .from("platform_fees")
        .select("amount")
        .lte("effective_from", new Date().toISOString())
        .order("effective_from", { ascending: false })
        .limit(1)
        .maybeSingle();

      platformFee = fee?.amount ?? 5000;
      totalAmount = doctorFee + platformFee;
    }

    // 2. Buat konsultasi baru dengan status draft
    const { data: newConsultation, error } = await supabaseAdmin
      .from("consultations")
      .insert({
        patient_id: patientId,
        doctor_id: input.doctor_id || null,
        duration_minutes: duration,
        doctor_fee: doctorFee,
        platform_fee: platformFee,
        total_amount: totalAmount,
        complaint: input.complaint || input.patient_notes || null,
        status: "draft",
      })
      .select("id, status, doctor_id, duration_minutes, doctor_fee, platform_fee, total_amount, complaint")
      .single();

    if (error || !newConsultation) {
      throw new AppError(500, "DATABASE_ERROR", "Gagal membuat sesi konsultasi");
    }

    return newConsultation;
  }

  /**
   * Pasien Mengirim Tanda Vital (Hanya saat status draft)
   */
  static async submitVitals(consultationId: string, patientId: string, input: SubmitVitalsInput) {
    // 1. Cek konsultasi milik pasien dan statusnya harus draft
    const { data: consultation, error: consError } = await supabaseAdmin
      .from("consultations")
      .select("id, status, patient_id")
      .eq("id", consultationId)
      .maybeSingle();

    if (consError || !consultation) {
      throw new AppError(404, "NOT_FOUND", "Konsultasi tidak ditemukan");
    }

    if (consultation.patient_id !== patientId) {
      throw new AppError(403, "FORBIDDEN", "Anda bukan pemilik sesi konsultasi ini");
    }

    if (consultation.status !== "draft") {
      throw new AppError(
        400,
        "INVALID_STATE",
        "Tanda vital hanya dapat dikirim saat konsultasi berstatus draft"
      );
    }

    // 2. Cek apakah tanda vital sudah pernah diisi untuk konsultasi ini
    const { data: existingVitals } = await supabaseAdmin
      .from("vital_signs")
      .select("id")
      .eq("consultation_id", consultationId)
      .maybeSingle();

    if (existingVitals) {
      throw new AppError(
        409,
        "VITALS_ALREADY_SUBMITTED",
        "Tanda vital sudah pernah dikirim untuk konsultasi ini"
      );
    }

    // 3. Evaluasi tanda vital (Early Warning System)
    const evaluation = evaluateVitalSigns(input);
    const emergencyReasonCodes = evaluation.reasons.map((r) => r.code);

    // 4. Simpan ke database
    const { data: vitalSign, error: vitalError } = await supabaseAdmin
      .from("vital_signs")
      .insert({
        consultation_id: consultationId,
        patient_id: patientId,
        systolic: input.systolic,
        diastolic: input.diastolic,
        heart_rate: input.heart_rate,
        spo2: input.spo2 || null,
        weight_kg: input.weight_kg || null,
        height_cm: input.height_cm || null,
        temperature_c: input.temperature_c || null,
        symptoms: input.symptoms || [],
        notes: input.notes || null,
        is_emergency: evaluation.is_emergency,
        emergency_reasons: emergencyReasonCodes,
        measured_at: input.measured_at || new Date().toISOString(),
      })
      .select("id")
      .single();

    if (vitalError || !vitalSign) {
      throw new AppError(500, "DATABASE_ERROR", "Gagal menyimpan data tanda vital");
    }

    return {
      vital_id: vitalSign.id,
      emergency: evaluation,
    };
  }

  /**
   * Batalkan Konsultasi (Hanya saat status draft atau waiting_payment)
   */
  static async cancelConsultation(consultationId: string, patientId: string) {
    const { data: consultation } = await supabaseAdmin
      .from("consultations")
      .select("id, status, patient_id")
      .eq("id", consultationId)
      .maybeSingle();

    if (!consultation) {
      throw new AppError(404, "NOT_FOUND", "Konsultasi tidak ditemukan");
    }

    if (consultation.patient_id !== patientId) {
      throw new AppError(403, "FORBIDDEN", "Anda bukan pemilik sesi konsultasi ini");
    }

    if (consultation.status !== "draft" && consultation.status !== "waiting_payment") {
      throw new AppError(
        400,
        "INVALID_STATE",
        "Hanya konsultasi berstatus draft atau menunggu pembayaran yang dapat dibatalkan"
      );
    }

    const { data: updated, error } = await supabaseAdmin
      .from("consultations")
      .update({
        status: "cancelled",
        close_reason: "patient_cancelled",
        ended_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", consultationId)
      .select("id, status")
      .single();

    if (error || !updated) {
      throw new AppError(500, "DATABASE_ERROR", "Gagal membatalkan konsultasi");
    }

    return updated;
  }

  /**
   * Detail Konsultasi (Untuk Pasien & Dokter Terkait)
   */
  static async getConsultationDetail(consultationId: string, userId: string, role: string) {
    const { data: cons, error } = await supabaseAdmin
      .from("consultations")
      .select("*")
      .eq("id", consultationId)
      .maybeSingle();

    if (error || !cons) {
      throw new AppError(404, "NOT_FOUND", "Konsultasi tidak ditemukan");
    }

    // Cek hak akses
    if (role === "patient" && cons.patient_id !== userId) {
      throw new AppError(403, "FORBIDDEN", "Anda tidak memiliki akses ke konsultasi ini");
    }

    if (role === "doctor" && cons.doctor_id !== userId) {
      // Periksa apakah dokter pernah ditawari assignment konsultasi ini
      const { data: assignment } = await supabaseAdmin
        .from("consultation_assignments")
        .select("id")
        .eq("consultation_id", consultationId)
        .eq("doctor_id", userId)
        .maybeSingle();

      if (!assignment) {
        throw new AppError(403, "FORBIDDEN", "Anda tidak memiliki akses ke konsultasi ini");
      }
    }

    // Ambil tanda vital jika ada
    const { data: vitals } = await supabaseAdmin
      .from("vital_signs")
      .select("*")
      .eq("consultation_id", consultationId)
      .maybeSingle();

    // Ambil data pembayaran jika ada
    const { data: payment } = await supabaseAdmin
      .from("payments")
      .select("id, mayar_payment_id, payment_url, amount, status, payment_method, expires_at, paid_at")
      .eq("consultation_id", consultationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Ambil info dokter jika sudah dipilih
    let doctorInfo = null;
    if (cons.doctor_id) {
      const { data: docUser } = await supabaseAdmin
        .from("users")
        .select("id, full_name")
        .eq("id", cons.doctor_id)
        .maybeSingle();

      const { data: docProfile } = await supabaseAdmin
        .from("doctor_profiles")
        .select("specialization, photo_path")
        .eq("user_id", cons.doctor_id)
        .maybeSingle();

      if (docUser) {
        doctorInfo = {
          id: docUser.id,
          full_name: docUser.full_name,
          specialization: docProfile?.specialization || "Kardiologi",
          photo_url: docProfile?.photo_path || null,
        };
      }
    }

    return {
      ...cons,
      doctor: doctorInfo,
      vital_signs: vitals || null,
      payment: payment || null,
    };
  }

  /**
   * Pasien Melakukan Checkout Pembayaran Konsultasi (Integrasi Mayar)
   */
  static async checkout(consultationId: string, patientId: string, input?: CheckoutInput) {
    // 1. Ambil data konsultasi
    const { data: consultation, error: consError } = await supabaseAdmin
      .from("consultations")
      .select("*")
      .eq("id", consultationId)
      .maybeSingle();

    if (consError || !consultation) {
      throw new AppError(404, "NOT_FOUND", "Konsultasi tidak ditemukan");
    }

    if (consultation.patient_id !== patientId) {
      throw new AppError(403, "FORBIDDEN", "Anda bukan pemilik sesi konsultasi ini");
    }

    if (consultation.status !== "draft" && consultation.status !== "waiting_payment") {
      throw new AppError(
        400,
        "INVALID_STATE",
        `Tidak dapat checkout konsultasi dengan status '${consultation.status}'`
      );
    }

    // 2. Cek kelengkapan tanda vital (Tanda vital wajib diisi sebelum pembayaran)
    const { data: vitals } = await supabaseAdmin
      .from("vital_signs")
      .select("id")
      .eq("consultation_id", consultationId)
      .maybeSingle();

    if (!vitals) {
      throw new AppError(
        400,
        "VITALS_REQUIRED",
        "Harap isi tanda vital terlebih dahulu sebelum melakukan pembayaran"
      );
    }

    // 3. Tentukan Dokter & Durasi
    const doctorId = input?.doctor_id || consultation.doctor_id;
    const duration = input?.duration_minutes || consultation.duration_minutes || 15;

    if (!doctorId) {
      throw new AppError(400, "DOCTOR_REQUIRED", "Harap pilih dokter terlebih dahulu");
    }

    // Periksa ketersediaan dokter
    const { data: doctorProfile } = await supabaseAdmin
      .from("doctor_profiles")
      .select("verification_status, is_online, specialization")
      .eq("user_id", doctorId)
      .maybeSingle();

    if (!doctorProfile || doctorProfile.verification_status !== "approved") {
      throw new AppError(400, "DOCTOR_NOT_APPROVED", "Dokter yang dipilih belum diverifikasi oleh admin");
    }

    if (!doctorProfile.is_online) {
      throw new AppError(400, "DOCTOR_OFFLINE", "Dokter sedang offline, silakan pilih dokter lain");
    }

    // 4. Hitung snapshot tarif
    const { data: tariff } = await supabaseAdmin
      .from("doctor_tariffs")
      .select("price")
      .eq("doctor_id", doctorId)
      .eq("duration_minutes", duration)
      .eq("is_active", true)
      .maybeSingle();

    const doctorFee = tariff?.price ?? 50000;

    const { data: platformFeeRecord } = await supabaseAdmin
      .from("platform_fees")
      .select("amount")
      .lte("effective_from", new Date().toISOString())
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle();

    const platformFee = platformFeeRecord?.amount ?? 5000;
    const totalAmount = doctorFee + platformFee;

    // 5. Ambil data pasien untuk Mayar invoice
    const { data: patientUser } = await supabaseAdmin
      .from("users")
      .select("full_name, email")
      .eq("id", patientId)
      .single();

    const { data: patientProfile } = await supabaseAdmin
      .from("patient_profiles")
      .select("phone")
      .eq("user_id", patientId)
      .maybeSingle();

    // 6. Buat invoice Mayar
    const invoice = await mayarClient.createInvoice({
      consultationId: consultation.id,
      amount: totalAmount,
      customerName: patientUser?.full_name || "Pasien TeleHeart",
      customerEmail: patientUser?.email || "pasien@teleheart.id",
      customerMobile: patientProfile?.phone || undefined,
      description: `Konsultasi Spesialis Jantung (${duration} Menit)`,
      items: [
        {
          description: `Jasa Dokter Spesialis Jantung (${duration} Menit)`,
          quantity: 1,
          rate: doctorFee,
        },
        {
          description: "Biaya Layanan Platform TeleHeart",
          quantity: 1,
          rate: platformFee,
        },
      ],
    });

    // 7. Simpan ke tabel payments
    const expiresAt = typeof invoice.expiredAt === "number"
      ? new Date(invoice.expiredAt).toISOString()
      : (invoice.expiredAt || new Date(Date.now() + env.PAYMENT_INVOICE_TTL_MINUTES * 60 * 1000).toISOString());

    // Cek apakah payment sudah ada sebelumnya
    const { data: existingPayment } = await supabaseAdmin
      .from("payments")
      .select("id")
      .eq("consultation_id", consultationId)
      .maybeSingle();

    let paymentRecord;
    if (existingPayment) {
      const { data: updatedPay, error: payUpdateErr } = await supabaseAdmin
        .from("payments")
        .update({
          mayar_payment_id: invoice.id,
          payment_url: invoice.paymentUrl,
          amount: totalAmount,
          status: "pending",
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingPayment.id)
        .select()
        .single();

      if (payUpdateErr) {
        throw new AppError(500, "DATABASE_ERROR", "Gagal memperbarui status pembayaran");
      }
      paymentRecord = updatedPay;
    } else {
      const { data: newPay, error: payInsertErr } = await supabaseAdmin
        .from("payments")
        .insert({
          consultation_id: consultationId,
          mayar_payment_id: invoice.id,
          payment_url: invoice.paymentUrl,
          amount: totalAmount,
          status: "pending",
          expires_at: expiresAt,
        })
        .select()
        .single();

      if (payInsertErr || !newPay) {
        throw new AppError(500, "DATABASE_ERROR", "Gagal mencatat data pembayaran");
      }
      paymentRecord = newPay;
    }

    // 8. Update konsultasi: status -> waiting_payment
    await supabaseAdmin
      .from("consultations")
      .update({
        doctor_id: doctorId,
        duration_minutes: duration,
        doctor_fee: doctorFee,
        platform_fee: platformFee,
        total_amount: totalAmount,
        status: "waiting_payment",
        updated_at: new Date().toISOString(),
      })
      .eq("id", consultationId);

    return {
      consultation_id: consultationId,
      payment_id: paymentRecord.id,
      mayar_invoice_id: invoice.id,
      payment_url: invoice.paymentUrl,
      amount: totalAmount,
      doctor_fee: doctorFee,
      platform_fee: platformFee,
      duration_minutes: duration,
      status: "waiting_payment",
      expires_at: expiresAt,
    };
  }

  /**
   * Riwayat Konsultasi Pengguna
   */
  static async getConsultations(userId: string, role: string) {
    let query = supabaseAdmin
      .from("consultations")
      .select("*")
      .order("created_at", { ascending: false });

    if (role === "patient") {
      query = query.eq("patient_id", userId);
    } else if (role === "doctor") {
      query = query.eq("doctor_id", userId);
    }

    const { data, error } = await query;
    if (error) {
      throw new AppError(500, "DATABASE_ERROR", "Gagal mengambil daftar konsultasi");
    }

    return data || [];
  }
}

