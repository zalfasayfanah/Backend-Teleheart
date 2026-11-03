import { supabaseAdmin } from "../../lib/supabase.js";
import { AppError } from "../../middleware/errorHandler.js";
import { evaluateVitalSigns } from "./vitalSignsEvaluator.js";
import { CreateConsultationInput, SubmitVitalsInput } from "./schema.js";

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

    // 2. Buat konsultasi baru dengan status draft
    const { data: newConsultation, error } = await supabaseAdmin
      .from("consultations")
      .insert({
        patient_id: patientId,
        complaint: input.complaint || null,
        status: "draft",
      })
      .select("id, status")
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

