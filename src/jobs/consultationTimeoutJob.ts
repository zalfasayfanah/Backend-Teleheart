import { supabaseAdmin } from "../lib/supabase.js";
import { ConsultationService } from "../modules/consultations/service.js";

export class ConsultationTimeoutJob {
  /**
   * Memeriksa konsultasi yang menunggu respon dokter lebih dari 15 menit (Timeout)
   * Otomatis mengalihkan ke dokter pengganti atau membatalkan sesi jika batas tercapai.
   */
  static async checkWaitingDoctorTimeouts() {
    const nowIso = new Date().toISOString();

    const { data: expiredConsultations, error } = await supabaseAdmin
      .from("consultations")
      .select("id, doctor_id, reassign_count")
      .eq("status", "waiting_doctor")
      .lte("response_deadline_at", nowIso);

    if (error) {
      console.error("❌ Gagal memeriksa timeout konsultasi waiting_doctor:", error);
      return [];
    }

    const results = [];
    for (const cons of expiredConsultations || []) {
      // 1. Update assignment dokter yang tidak merespon menjadi 'timeout'
      if (cons.doctor_id) {
        await supabaseAdmin
          .from("consultation_assignments")
          .update({
            status: "timeout",
            responded_at: nowIso,
          })
          .eq("consultation_id", cons.id)
          .eq("doctor_id", cons.doctor_id)
          .eq("status", "offered");
      }

      // 2. Lakukan pengalihan ke dokter lain
      const reassignResult = await ConsultationService.reassignConsultation(
        cons.id,
        cons.doctor_id || "",
        "doctor_response_timeout"
      );

      results.push({
        consultation_id: cons.id,
        previous_doctor_id: cons.doctor_id,
        ...reassignResult,
      });
    }

    return results;
  }

  /**
   * Memeriksa konsultasi aktif yang durasinya sudah habis (Auto-Close)
   */
  static async checkActiveConsultationsExpired() {
    const nowIso = new Date().toISOString();

    const { data: expiredSessions, error } = await supabaseAdmin
      .from("consultations")
      .select("id, patient_id, doctor_id")
      .eq("status", "active")
      .lte("expires_at", nowIso);

    if (error) {
      console.error("❌ Gagal memeriksa sesi aktif yang kedaluwarsa:", error);
      return [];
    }

    const closed = [];
    for (const cons of expiredSessions || []) {
      const { error: updateErr } = await supabaseAdmin
        .from("consultations")
        .update({
          status: "closed",
          ended_at: nowIso,
          close_reason: "duration_expired",
          updated_at: nowIso,
        })
        .eq("id", cons.id);

      if (!updateErr) {
        // Kirim notifikasi ke pasien & dokter
        await supabaseAdmin.from("notifications").insert([
          {
            user_id: cons.patient_id,
            type: "consultation_closed",
            title: "Sesi Konsultasi Berakhir",
            body: "Waktu konsultasi telah selesai sesuai durasi paket yang Anda pilih.",
            data: { consultation_id: cons.id },
          },
          ...(cons.doctor_id
            ? [
                {
                  user_id: cons.doctor_id,
                  type: "consultation_closed",
                  title: "Sesi Konsultasi Berakhir",
                  body: "Waktu konsultasi dengan pasien telah berakhir otomatis.",
                  data: { consultation_id: cons.id },
                },
              ]
            : []),
        ]);

        closed.push(cons.id);
      }
    }

    return closed;
  }

  /**
   * Menjalankan seluruh pemeriksaan background job
   */
  static async runAll() {
    const timeouts = await this.checkWaitingDoctorTimeouts();
    const autoClosed = await this.checkActiveConsultationsExpired();

    return {
      timestamp: new Date().toISOString(),
      timeouts_processed: timeouts.length,
      auto_closed_sessions: autoClosed.length,
      timeout_details: timeouts,
      closed_session_ids: autoClosed,
    };
  }
}

