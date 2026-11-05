import { supabaseAdmin } from "../../lib/supabase.js";
import { AppError } from "../../middleware/errorHandler.js";
import { env } from "../../config/env.js";

export class PaymentService {
  /**
   * Menangani Webhook Notifikasi Pembayaran dari Mayar (Idempotent)
   */
  static async handleMayarWebhook(payload: any, tokenFromRequest?: string, isInternalSimulation = false) {
    // 1. Verifikasi Token Webhook (Keamanan)
    const expectedSecret = env.MAYAR_WEBHOOK_SECRET;
    if (!isInternalSimulation && expectedSecret) {
      if (!tokenFromRequest || tokenFromRequest !== expectedSecret) {
        throw new AppError(401, "UNAUTHORIZED_WEBHOOK", "Token webhook Mayar tidak valid");
      }
    }

    // 2. Filter Event yang Diterima
    // Mayar mengirimkan event: payment.received dengan data.status === "SUCCESS"
    const event = payload?.event;
    const data = payload?.data || {};

    if (event !== "payment.received") {
      return {
        status: "ignored",
        message: `Event '${event}' diabaikan, hanya memproses 'payment.received'`,
      };
    }

    if (data.status && data.status.toUpperCase() !== "SUCCESS") {
      return {
        status: "ignored",
        message: `Status pembayaran '${data.status}' bukan SUCCESS`,
      };
    }

    // 3. Cari Data Pembayaran di Database
    const invoiceId = data.productId || data.id;
    const consultationId = data.extraData?.consultationId;

    let paymentRecord = null;

    if (invoiceId) {
      const { data: pByInvoice } = await supabaseAdmin
        .from("payments")
        .select("*")
        .eq("mayar_payment_id", invoiceId)
        .maybeSingle();

      paymentRecord = pByInvoice;
    }

    if (!paymentRecord && consultationId) {
      const { data: pByCons } = await supabaseAdmin
        .from("payments")
        .select("*")
        .eq("consultation_id", consultationId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      paymentRecord = pByCons;
    }

    if (!paymentRecord) {
      throw new AppError(404, "PAYMENT_NOT_FOUND", "Data pembayaran tidak ditemukan di sistem TeleHeart");
    }

    // 4. Idempotency Check (Jika webhook terkirim lebih dari satu kali)
    if (paymentRecord.status === "paid") {
      return {
        status: "already_processed",
        message: "Pembayaran sudah diproses sebelumnya (idempotent)",
        consultation_id: paymentRecord.consultation_id,
      };
    }

    // 5. Update Status Pembayaran menjadi 'paid'
    const nowIso = new Date().toISOString();
    const paymentMethod = data.paymentMethod || data.channel || "mayar";

    const { error: payUpdateErr } = await supabaseAdmin
      .from("payments")
      .update({
        status: "paid",
        paid_at: nowIso,
        payment_method: paymentMethod,
        raw_webhook: payload,
        updated_at: nowIso,
      })
      .eq("id", paymentRecord.id);

    if (payUpdateErr) {
      throw new AppError(500, "DATABASE_ERROR", "Gagal memperbarui status pembayaran");
    }

    // 6. Update Status Konsultasi menjadi 'waiting_doctor'
    const deadlineMinutes = env.DOCTOR_RESPONSE_TIMEOUT_MINUTES || 15;
    const responseDeadlineAt = new Date(Date.now() + deadlineMinutes * 60 * 1000).toISOString();

    const { data: consultation, error: consErr } = await supabaseAdmin
      .from("consultations")
      .update({
        status: "waiting_doctor",
        response_deadline_at: responseDeadlineAt,
        updated_at: nowIso,
      })
      .eq("id", paymentRecord.consultation_id)
      .select("id, patient_id, doctor_id")
      .single();

    if (consErr || !consultation) {
      throw new AppError(500, "DATABASE_ERROR", "Gagal memperbarui status konsultasi");
    }

    // 7. Berikan Penugasan ke Dokter (Assignment)
    if (consultation.doctor_id) {
      // Periksa apakah assignment sudah ada sebelumnya
      const { data: existingAssignment } = await supabaseAdmin
        .from("consultation_assignments")
        .select("id")
        .eq("consultation_id", consultation.id)
        .eq("doctor_id", consultation.doctor_id)
        .maybeSingle();

      if (!existingAssignment) {
        await supabaseAdmin.from("consultation_assignments").insert({
          consultation_id: consultation.id,
          doctor_id: consultation.doctor_id,
          status: "offered",
          offered_at: nowIso,
          deadline_at: responseDeadlineAt,
        });
      }

      // 8. Kirim Notifikasi In-App untuk Dokter
      await supabaseAdmin.from("notifications").insert({
        user_id: consultation.doctor_id,
        type: "consultation_request",
        title: "Permintaan Konsultasi Baru",
        body: "Pasien telah menyelesaikan pembayaran. Harap konfirmasi konsultasi dalam 15 menit.",
        data: { consultation_id: consultation.id },
      });
    }

    // 9. Kirim Notifikasi In-App untuk Pasien
    await supabaseAdmin.from("notifications").insert({
      user_id: consultation.patient_id,
      type: "payment_success",
      title: "Pembayaran Diterima",
      body: `Pembayaran sebesar Rp ${paymentRecord.amount.toLocaleString("id-ID")} berhasil. Menunggu dokter mengonfirmasi konsultasi.`,
      data: { consultation_id: consultation.id },
    });

    return {
      status: "success",
      message: "Pembayaran berhasil diverifikasi dan dokter telah ditugaskan",
      consultation_id: consultation.id,
      doctor_id: consultation.doctor_id,
    };
  }
}

