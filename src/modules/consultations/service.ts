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

    let remainingSeconds = null;
    if (cons.status === "active" && cons.expires_at) {
      remainingSeconds = Math.max(0, Math.floor((new Date(cons.expires_at).getTime() - Date.now()) / 1000));
    }

    return {
      ...cons,
      remaining_seconds: remainingSeconds,
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

  /**
   * Antrean Konsultasi Dokter (type = 'incoming' | 'active')
   */
  static async getDoctorQueue(doctorId: string, type: "incoming" | "active" = "incoming") {
    if (type === "incoming") {
      // 1. Ambil penugasan berstatus 'offered' untuk dokter ini
      const { data: assignments, error: assignErr } = await supabaseAdmin
        .from("consultation_assignments")
        .select("consultation_id, deadline_at, status")
        .eq("doctor_id", doctorId)
        .eq("status", "offered");

      if (assignErr) {
        throw new AppError(500, "DATABASE_ERROR", "Gagal mengambil antrean penugasan dokter");
      }

      if (!assignments || assignments.length === 0) {
        return [];
      }

      const consultationIds = assignments.map((a) => a.consultation_id);

      // 2. Ambil data konsultasi yang berstatus 'waiting_doctor'
      const { data: consultations, error: consErr } = await supabaseAdmin
        .from("consultations")
        .select("id, patient_id, duration_minutes, complaint, response_deadline_at, status")
        .in("id", consultationIds)
        .eq("status", "waiting_doctor");

      if (consErr) {
        throw new AppError(500, "DATABASE_ERROR", "Gagal mengambil antrean konsultasi");
      }

      const results = [];
      for (const cons of consultations || []) {
        const assign = assignments.find((a) => a.consultation_id === cons.id);

        // Ambil info pasien
        const { data: patientUser } = await supabaseAdmin
          .from("users")
          .select("id, full_name")
          .eq("id", cons.patient_id)
          .maybeSingle();

        const { data: patientProfile } = await supabaseAdmin
          .from("patient_profiles")
          .select("birth_date, gender")
          .eq("user_id", cons.patient_id)
          .maybeSingle();

        // Ambil tanda vital
        const { data: vitals } = await supabaseAdmin
          .from("vital_signs")
          .select("systolic, diastolic, heart_rate, spo2, is_emergency, measured_at")
          .eq("consultation_id", cons.id)
          .maybeSingle();

        results.push({
          consultation_id: cons.id,
          patient: {
            id: patientUser?.id,
            full_name: patientUser?.full_name,
            birth_date: patientProfile?.birth_date || null,
            gender: patientProfile?.gender || null,
          },
          duration_minutes: cons.duration_minutes,
          is_emergency: vitals?.is_emergency ?? false,
          complaint: cons.complaint,
          vitals: vitals
            ? {
                systolic: vitals.systolic,
                diastolic: vitals.diastolic,
                heart_rate: vitals.heart_rate,
                spo2: vitals.spo2,
                measured_at: vitals.measured_at,
              }
            : null,
          response_deadline_at: assign?.deadline_at || cons.response_deadline_at,
        });
      }

      return results;
    } else {
      // type === 'active'
      const { data: activeCons, error: actErr } = await supabaseAdmin
        .from("consultations")
        .select("id, patient_id, duration_minutes, complaint, started_at, expires_at, status")
        .eq("doctor_id", doctorId)
        .eq("status", "active")
        .order("started_at", { ascending: false });

      if (actErr) {
        throw new AppError(500, "DATABASE_ERROR", "Gagal mengambil konsultasi aktif dokter");
      }

      const results = [];
      for (const cons of activeCons || []) {
        const { data: patientUser } = await supabaseAdmin
          .from("users")
          .select("id, full_name")
          .eq("id", cons.patient_id)
          .maybeSingle();

        const { data: patientProfile } = await supabaseAdmin
          .from("patient_profiles")
          .select("birth_date, gender")
          .eq("user_id", cons.patient_id)
          .maybeSingle();

        const { data: vitals } = await supabaseAdmin
          .from("vital_signs")
          .select("systolic, diastolic, heart_rate, spo2, is_emergency, measured_at")
          .eq("consultation_id", cons.id)
          .maybeSingle();

        const remainingSeconds = cons.expires_at
          ? Math.max(0, Math.floor((new Date(cons.expires_at).getTime() - Date.now()) / 1000))
          : 0;

        results.push({
          consultation_id: cons.id,
          patient: {
            id: patientUser?.id,
            full_name: patientUser?.full_name,
            birth_date: patientProfile?.birth_date || null,
            gender: patientProfile?.gender || null,
          },
          duration_minutes: cons.duration_minutes,
          is_emergency: vitals?.is_emergency ?? false,
          complaint: cons.complaint,
          vitals: vitals
            ? {
                systolic: vitals.systolic,
                diastolic: vitals.diastolic,
                heart_rate: vitals.heart_rate,
                spo2: vitals.spo2,
                measured_at: vitals.measured_at,
              }
            : null,
          started_at: cons.started_at,
          expires_at: cons.expires_at,
          remaining_seconds: remainingSeconds,
        });
      }

      return results;
    }
  }

  /**
   * Dokter Menerima Permintaan Konsultasi (POST /consultations/:id/accept)
   */
  static async acceptConsultation(consultationId: string, doctorId: string) {
    // 1. Cek konsultasi
    const { data: consultation, error: consErr } = await supabaseAdmin
      .from("consultations")
      .select("*")
      .eq("id", consultationId)
      .maybeSingle();

    if (consErr || !consultation) {
      throw new AppError(404, "NOT_FOUND", "Konsultasi tidak ditemukan");
    }

    if (consultation.status !== "waiting_doctor") {
      throw new AppError(
        400,
        "INVALID_STATE",
        `Konsultasi tidak dapat diterima karena statusnya '${consultation.status}'`
      );
    }

    // 2. Cek penugasan dokter
    const { data: assignment, error: assignErr } = await supabaseAdmin
      .from("consultation_assignments")
      .select("*")
      .eq("consultation_id", consultationId)
      .eq("doctor_id", doctorId)
      .eq("status", "offered")
      .maybeSingle();

    if (assignErr || !assignment) {
      throw new AppError(403, "FORBIDDEN", "Anda tidak memiliki penugasan aktif untuk konsultasi ini");
    }

    // Cek apakah deadline respons sudah terlewati
    if (new Date() > new Date(assignment.deadline_at)) {
      throw new AppError(
        400,
        "ASSIGNMENT_EXPIRED",
        "Batas waktu konfirmasi penugasan (15 menit) telah berakhir"
      );
    }

    // 3. Update penugasan dokter menjadi accepted
    const nowIso = new Date().toISOString();
    await supabaseAdmin
      .from("consultation_assignments")
      .update({
        status: "accepted",
        responded_at: nowIso,
      })
      .eq("id", assignment.id);

    // 4. Hitung durasi dan waktu berakhir sesi konsultasi
    const durationMinutes = consultation.duration_minutes || 15;
    const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();

    const { data: updatedCons, error: updateErr } = await supabaseAdmin
      .from("consultations")
      .update({
        status: "active",
        started_at: nowIso,
        expires_at: expiresAt,
        updated_at: nowIso,
      })
      .eq("id", consultationId)
      .select()
      .single();

    if (updateErr || !updatedCons) {
      throw new AppError(500, "DATABASE_ERROR", "Gagal memperbarui status konsultasi");
    }

    // 5. Kirim notifikasi ke pasien bahwa dokter telah menerima sesi
    const { data: docUser } = await supabaseAdmin
      .from("users")
      .select("full_name")
      .eq("id", doctorId)
      .single();

    await supabaseAdmin.from("notifications").insert({
      user_id: consultation.patient_id,
      type: "consultation_accepted",
      title: "Konsultasi Dimulai",
      body: `${docUser?.full_name || "Dokter"} telah menerima sesi konsultasi Anda. Ruang chat aktif.`,
      data: { consultation_id: consultationId },
    });

    const remainingSeconds = durationMinutes * 60;

    return {
      ...updatedCons,
      remaining_seconds: remainingSeconds,
    };
  }

  /**
   * Dokter Menolak Permintaan Konsultasi (POST /consultations/:id/reject)
   */
  static async rejectConsultation(consultationId: string, doctorId: string, reason?: string) {
    const { data: consultation, error: consErr } = await supabaseAdmin
      .from("consultations")
      .select("*")
      .eq("id", consultationId)
      .maybeSingle();

    if (consErr || !consultation) {
      throw new AppError(404, "NOT_FOUND", "Konsultasi tidak ditemukan");
    }

    if (consultation.status !== "waiting_doctor") {
      throw new AppError(
        400,
        "INVALID_STATE",
        `Konsultasi tidak dapat ditolak karena statusnya '${consultation.status}'`
      );
    }

    const { data: assignment } = await supabaseAdmin
      .from("consultation_assignments")
      .select("id")
      .eq("consultation_id", consultationId)
      .eq("doctor_id", doctorId)
      .eq("status", "offered")
      .maybeSingle();

    if (!assignment) {
      throw new AppError(403, "FORBIDDEN", "Anda tidak memiliki penugasan aktif untuk konsultasi ini");
    }

    const nowIso = new Date().toISOString();
    await supabaseAdmin
      .from("consultation_assignments")
      .update({
        status: "declined",
        responded_at: nowIso,
      })
      .eq("id", assignment.id);

    // Alihkan konsultasi ke dokter pengganti lain
    return await this.reassignConsultation(consultationId, doctorId, reason || "doctor_declined");
  }

  /**
   * Mengalihkan Konsultasi ke Dokter Pengganti (Maksimal 3 Kali Reassign)
   */
  static async reassignConsultation(consultationId: string, previousDoctorId: string, reason: string) {
    const { data: consultation } = await supabaseAdmin
      .from("consultations")
      .select("*")
      .eq("id", consultationId)
      .single();

    if (!consultation) {
      throw new AppError(404, "NOT_FOUND", "Konsultasi tidak ditemukan");
    }

    const currentCount = consultation.reassign_count || 0;
    const maxReassign = env.MAX_DOCTOR_REASSIGN || 3;

    // Jika sudah mencapai batas maksimal pengalihan
    if (currentCount >= maxReassign) {
      const nowIso = new Date().toISOString();
      await supabaseAdmin
        .from("consultations")
        .update({
          status: "cancelled",
          close_reason: "no_available_replacement_doctor",
          ended_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", consultationId);

      // Notifikasi pembatalan dan proses refund ke pasien
      await supabaseAdmin.from("notifications").insert({
        user_id: consultation.patient_id,
        type: "consultation_cancelled",
        title: "Konsultasi Dibatalkan",
        body: "Mohon maaf, tidak ada dokter spesialis yang tersedia saat ini. Dana konsultasi Anda akan diproses untuk pengembalian dana (refund).",
        data: { consultation_id: consultationId },
      });

      return {
        reassigned: false,
        status: "cancelled",
        message: "Batas pengalihan tercapai. Konsultasi dibatalkan dan refund diproses.",
      };
    }

    // Cari daftar dokter yang sudah pernah ditawari konsultasi ini (agar tidak ditawari ke dokter yang sama)
    const { data: pastAssignments } = await supabaseAdmin
      .from("consultation_assignments")
      .select("doctor_id")
      .eq("consultation_id", consultationId);

    const excludedDoctorIds = new Set<string>();
    excludedDoctorIds.add(previousDoctorId);
    pastAssignments?.forEach((a) => excludedDoctorIds.add(a.doctor_id));

    // Cari dokter online, approved, dan tidak sedang menangani sesi aktif
    const { data: onlineDoctors } = await supabaseAdmin
      .from("doctor_profiles")
      .select("user_id")
      .eq("verification_status", "approved")
      .eq("is_online", true);

    const candidates = (onlineDoctors || []).filter((d) => !excludedDoctorIds.has(d.user_id));

    let chosenDoctorId: string | null = null;
    const duration = consultation.duration_minutes || 15;
    const paidDoctorFee = consultation.doctor_fee || 0;

    for (const cand of candidates) {
      // 1. Cek apakah dokter sedang ada sesi aktif
      const { data: busy } = await supabaseAdmin
        .from("consultations")
        .select("id")
        .eq("doctor_id", cand.user_id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();

      if (busy) continue;

      // 2. Cek tarif dokter pengganti: tarif harus <= harga yang sudah dibayar pasien (Asumsi PRD)
      const { data: tariff } = await supabaseAdmin
        .from("doctor_tariffs")
        .select("price")
        .eq("doctor_id", cand.user_id)
        .eq("duration_minutes", duration)
        .eq("is_active", true)
        .maybeSingle();

      const candFee = tariff?.price ?? 50000;
      if (candFee <= paidDoctorFee || paidDoctorFee === 0) {
        chosenDoctorId = cand.user_id;
        break;
      }
    }

    if (!chosenDoctorId) {
      // Tidak ada dokter pengganti yang cocok
      const nowIso = new Date().toISOString();
      await supabaseAdmin
        .from("consultations")
        .update({
          status: "cancelled",
          close_reason: "no_available_replacement_doctor",
          ended_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", consultationId);

      await supabaseAdmin.from("notifications").insert({
        user_id: consultation.patient_id,
        type: "consultation_cancelled",
        title: "Konsultasi Dibatalkan",
        body: "Mohon maaf, tidak ada dokter pengganti yang tersedia saat ini. Pembayaran Anda akan diproses untuk pengembalian dana.",
        data: { consultation_id: consultationId },
      });

      return {
        reassigned: false,
        status: "cancelled",
        message: "Tidak ada dokter pengganti yang tersedia. Konsultasi dibatalkan.",
      };
    }

    // Dokter pengganti ditemukan!
    const nowIso = new Date().toISOString();
    const deadlineMinutes = env.DOCTOR_RESPONSE_TIMEOUT_MINUTES || 15;
    const newDeadlineAt = new Date(Date.now() + deadlineMinutes * 60 * 1000).toISOString();
    const newReassignCount = currentCount + 1;

    // Update konsultasi
    await supabaseAdmin
      .from("consultations")
      .update({
        doctor_id: chosenDoctorId,
        reassign_count: newReassignCount,
        response_deadline_at: newDeadlineAt,
        updated_at: nowIso,
      })
      .eq("id", consultationId);

    // Buat penugasan baru
    await supabaseAdmin.from("consultation_assignments").insert({
      consultation_id: consultationId,
      doctor_id: chosenDoctorId,
      status: "offered",
      offered_at: nowIso,
      deadline_at: newDeadlineAt,
    });

    // Notifikasi untuk dokter baru
    await supabaseAdmin.from("notifications").insert({
      user_id: chosenDoctorId,
      type: "consultation_request",
      title: "Permintaan Konsultasi Baru (Pengalihan)",
      body: "Terdapat permintaan konsultasi yang dialihkan kepada Anda. Harap konfirmasi dalam 15 menit.",
      data: { consultation_id: consultationId },
    });

    // Notifikasi untuk pasien
    await supabaseAdmin.from("notifications").insert({
      user_id: consultation.patient_id,
      type: "consultation_reassigned",
      title: "Konsultasi Dialihkan",
      body: "Konsultasi Anda dialihkan ke dokter spesialis jantung lainnya yang sedang aktif.",
      data: { consultation_id: consultationId },
    });

    return {
      reassigned: true,
      status: "waiting_doctor",
      new_doctor_id: chosenDoctorId,
      reassign_count: newReassignCount,
      response_deadline_at: newDeadlineAt,
    };
  }

  /**
   * Dokter Menutup Sesi Konsultasi (POST /consultations/:id/close)
   */
  static async closeConsultation(consultationId: string, doctorId: string, doctorSummary?: string) {
    const { data: consultation, error: consErr } = await supabaseAdmin
      .from("consultations")
      .select("*")
      .eq("id", consultationId)
      .maybeSingle();

    if (consErr || !consultation) {
      throw new AppError(404, "NOT_FOUND", "Konsultasi tidak ditemukan");
    }

    if (consultation.status !== "active") {
      throw new AppError(
        400,
        "INVALID_STATE",
        `Hanya konsultasi aktif yang dapat ditutup (status saat ini: '${consultation.status}')`
      );
    }

    if (consultation.doctor_id !== doctorId) {
      throw new AppError(403, "FORBIDDEN", "Anda bukan dokter penanggung jawab untuk sesi konsultasi ini");
    }

    const nowIso = new Date().toISOString();
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from("consultations")
      .update({
        status: "closed",
        ended_at: nowIso,
        closed_by: doctorId,
        close_reason: "doctor_closed",
        doctor_summary: doctorSummary || null,
        updated_at: nowIso,
      })
      .eq("id", consultationId)
      .select()
      .single();

    if (updateErr || !updated) {
      throw new AppError(500, "DATABASE_ERROR", "Gagal menutup sesi konsultasi");
    }

    // Notifikasi penutupan ke pasien
    await supabaseAdmin.from("notifications").insert({
      user_id: consultation.patient_id,
      type: "consultation_closed",
      title: "Konsultasi Selesai",
      body: "Dokter telah menyelesaikan sesi konsultasi. Anda dapat melihat ringkasan medis di aplikasi.",
      data: { consultation_id: consultationId },
    });

    return updated;
  }

  /**
   * Riwayat Pasien untuk Dokter (GET /patients/:id/history)
   * Hanya menampilkan rekam medis, tanda vital, dan resep sebelumnya TANPA isi chat terdahulu (Privacy PRD)
   */
  static async getPatientHistoryForDoctor(patientId: string, doctorId: string) {
    // 1. Cek hak akses dokter: harus pernah ditawari assignment atau pernah menangani pasien ini
    const { data: assignment } = await supabaseAdmin
      .from("consultation_assignments")
      .select("id")
      .eq("doctor_id", doctorId)
      .in(
        "consultation_id",
        (
          await supabaseAdmin.from("consultations").select("id").eq("patient_id", patientId)
        ).data?.map((c) => c.id) || []
      )
      .limit(1)
      .maybeSingle();

    const { data: handled } = await supabaseAdmin
      .from("consultations")
      .select("id")
      .eq("patient_id", patientId)
      .eq("doctor_id", doctorId)
      .limit(1)
      .maybeSingle();

    if (!assignment && !handled) {
      throw new AppError(
        403,
        "FORBIDDEN",
        "Anda tidak memiliki hak akses untuk melihat riwayat pasien ini"
      );
    }

    // 2. Ambil konsultasi terdahulu pasien
    const { data: pastConsultations, error } = await supabaseAdmin
      .from("consultations")
      .select("id, doctor_id, created_at, complaint, doctor_summary, status")
      .eq("patient_id", patientId)
      .in("status", ["active", "closed"])
      .order("created_at", { ascending: false });

    if (error) {
      throw new AppError(500, "DATABASE_ERROR", "Gagal mengambil riwayat konsultasi pasien");
    }

    const historyResults = [];
    for (const cons of pastConsultations || []) {
      // Ambil nama dokter
      let docName = "Dokter TeleHeart";
      if (cons.doctor_id) {
        const { data: dUser } = await supabaseAdmin
          .from("users")
          .select("full_name")
          .eq("id", cons.doctor_id)
          .maybeSingle();
        if (dUser?.full_name) docName = dUser.full_name;
      }

      // Ambil tanda vital
      const { data: vitals } = await supabaseAdmin
        .from("vital_signs")
        .select("systolic, diastolic, heart_rate, spo2, measured_at")
        .eq("consultation_id", cons.id)
        .maybeSingle();

      // Ambil resep jika ada
      const { data: pres } = await supabaseAdmin
        .from("prescriptions")
        .select("id, status")
        .eq("consultation_id", cons.id)
        .maybeSingle();

      let prescriptionItems: any[] = [];
      if (pres) {
        const { data: items } = await supabaseAdmin
          .from("prescription_items")
          .select("medicine_name, dosage, quantity, instructions")
          .eq("prescription_id", pres.id);
        prescriptionItems = items || [];
      }

      historyResults.push({
        consultation_id: cons.id,
        date: cons.created_at,
        doctor: {
          full_name: docName,
        },
        vitals: vitals || null,
        doctor_summary: cons.doctor_summary || null,
        prescription: pres
          ? {
              id: pres.id,
              status: pres.status,
              items: prescriptionItems,
            }
          : null,
      });
    }

    return historyResults;
  }
}

