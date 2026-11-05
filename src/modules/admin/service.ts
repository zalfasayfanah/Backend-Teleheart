import { supabaseAdmin } from "../../lib/supabase.js";
import { AppError } from "../../middleware/errorHandler.js";
import { logAudit } from "../../lib/audit.js";
import { FcmService } from "../../lib/fcm.js";
import { decryptNik, maskNik } from "../../lib/crypto.js";
import {
  GetAdminUsersQueryInput,
  GetAdminTransactionsQueryInput,
  GetAdminAuditLogsQueryInput,
  ProcessRefundInput,
} from "./schema.js";

export class AdminService {
  /**
   * Mengambil daftar pengguna sistem (Pasien, Dokter, Admin)
   */
  static async getUsers(query: GetAdminUsersQueryInput) {
    const { role, search, page, limit } = query;
    const offset = (page - 1) * limit;

    let dbQuery = supabaseAdmin
      .from("users")
      .select("id, email, full_name, role, is_active, created_at", { count: "exact" });

    if (role) {
      dbQuery = dbQuery.eq("role", role);
    }

    if (search && search.trim().length > 0) {
      dbQuery = dbQuery.or(`full_name.ilike.%${search.trim()}%,email.ilike.%${search.trim()}%`);
    }

    const { data: users, count, error } = await dbQuery
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new AppError(500, "DATABASE_ERROR", "Gagal mengambil daftar pengguna");
    }

    // Perkaya data dengan info profil masing-masing role
    const enrichedUsers = await Promise.all(
      (users || []).map(async (u: any) => {
        if (u.role === "doctor") {
          const { data: dProfile } = await supabaseAdmin
            .from("doctor_profiles")
            .select("sip_number, str_number, specialization, verification_status, is_online, workplace, str_file_path, sip_file_path")
            .eq("user_id", u.id)
            .maybeSingle();

          return { ...u, doctor_profile: dProfile || null };
        }

        if (u.role === "patient") {
          const { data: pProfile } = await supabaseAdmin
            .from("patient_profiles")
            .select("gender, phone, birth_date, nik_encrypted")
            .eq("user_id", u.id)
            .maybeSingle();

          let nikMasked: string | null = null;
          if (pProfile?.nik_encrypted) {
            try {
              const decrypted = decryptNik(pProfile.nik_encrypted);
              nikMasked = maskNik(decrypted);
            } catch {
              nikMasked = "************0000";
            }
          }

          return {
            ...u,
            patient_profile: pProfile
              ? {
                  gender: pProfile.gender,
                  phone: pProfile.phone,
                  birth_date: pProfile.birth_date,
                  nik_masked: nikMasked,
                }
              : null,
          };
        }

        return u;
      })
    );

    return {
      users: enrichedUsers,
      total: count || 0,
      page,
      limit,
    };
  }

  /**
   * Mengambil laporan keuangan dan transaksi (Metadata Only - Bebas Data Medis Pasien)
   */
  static async getTransactions(query: GetAdminTransactionsQueryInput) {
    const { status, page, limit } = query;
    const offset = (page - 1) * limit;

    let dbQuery = supabaseAdmin
      .from("payments")
      .select(`
        id,
        consultation_id,
        mayar_payment_id,
        payment_url,
        amount,
        status,
        payment_method,
        paid_at,
        expires_at,
        refunded_at,
        refund_note,
        created_at
      `, { count: "exact" });

    if (status) {
      dbQuery = dbQuery.eq("status", status);
    }

    const { data: transactions, count, error } = await dbQuery
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new AppError(500, "DATABASE_ERROR", "Gagal mengambil laporan transaksi keuangan");
    }

    // Hitung ringkasan akumulasi dana yang dibayar & direfund
    const { data: allPayments } = await supabaseAdmin
      .from("payments")
      .select("amount, status");

    let totalRevenue = 0;
    let totalRefunded = 0;
    let paidCount = 0;
    let refundedCount = 0;

    for (const p of allPayments || []) {
      if (p.status === "paid") {
        totalRevenue += p.amount || 0;
        paidCount++;
      } else if (p.status === "refunded") {
        totalRefunded += p.amount || 0;
        refundedCount++;
      }
    }

    return {
      transactions: transactions || [],
      total: count || 0,
      page,
      limit,
      summary: {
        total_revenue: totalRevenue,
        total_refunded: totalRefunded,
        paid_transactions: paidCount,
        refunded_transactions: refundedCount,
      },
    };
  }

  /**
   * Mengambil riwayat log audit aktivitas sistem
   */
  static async getAuditLogs(query: GetAdminAuditLogsQueryInput) {
    const { action, actor_id, resource_type, page, limit } = query;
    const offset = (page - 1) * limit;

    let dbQuery = supabaseAdmin
      .from("audit_logs")
      .select(`
        id,
        actor_id,
        actor_role,
        action,
        resource_type,
        resource_id,
        patient_id,
        metadata,
        ip_address,
        created_at
      `, { count: "exact" });

    if (action) {
      dbQuery = dbQuery.eq("action", action);
    }
    if (actor_id) {
      dbQuery = dbQuery.eq("actor_id", actor_id);
    }
    if (resource_type) {
      dbQuery = dbQuery.eq("resource_type", resource_type);
    }

    const { data: logs, count, error } = await dbQuery
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new AppError(500, "DATABASE_ERROR", "Gagal mengambil log audit aktivitas sistem");
    }

    return {
      logs: logs || [],
      total: count || 0,
      page,
      limit,
    };
  }

  /**
   * Memproses pengembalian dana (refund) transaksi oleh admin
   */
  static async processRefund(
    adminId: string,
    input: ProcessRefundInput,
    ipAddress?: string
  ) {
    const { payment_id, consultation_id, reason } = input;

    let dbQuery = supabaseAdmin.from("payments").select("*");

    if (payment_id) {
      dbQuery = dbQuery.eq("id", payment_id);
    } else if (consultation_id) {
      dbQuery = dbQuery.eq("consultation_id", consultation_id);
    }

    const { data: payment, error: pErr } = await dbQuery.maybeSingle();

    if (pErr || !payment) {
      throw new AppError(404, "NOT_FOUND", "Data pembayaran tidak ditemukan");
    }

    if (payment.status === "refunded") {
      throw new AppError(400, "ALREADY_REFUNDED", "Pembayaran ini sudah pernah di-refund sebelumnya");
    }

    if (payment.status !== "paid") {
      throw new AppError(
        400,
        "INVALID_STATE",
        `Hanya pembayaran yang berstatus 'paid' yang dapat diproses refund (status saat ini: '${payment.status}')`
      );
    }

    const now = new Date().toISOString();

    // 1. Perbarui status pembayaran menjadi 'refunded'
    const { data: updatedPayment, error: uErr } = await supabaseAdmin
      .from("payments")
      .update({
        status: "refunded",
        refunded_at: now,
        refunded_by: adminId,
        refund_note: reason,
      })
      .eq("id", payment.id)
      .select()
      .single();

    if (uErr || !updatedPayment) {
      throw new AppError(500, "DATABASE_ERROR", "Gagal memperbarui status pengembalian dana");
    }

    // 2. Ambil data konsultasi untuk mendapatkan patient_id
    const { data: consultation } = await supabaseAdmin
      .from("consultations")
      .select("id, patient_id, status")
      .eq("id", payment.consultation_id)
      .maybeSingle();

    if (consultation && consultation.status !== "closed") {
      // Batalkan konsultasi jika belum selesai
      await supabaseAdmin
        .from("consultations")
        .update({ status: "cancelled" })
        .eq("id", consultation.id);
    }

    // 3. Catat audit log untuk tindakan admin memproses refund
    await logAudit({
      actor_id: adminId,
      actor_role: "admin",
      action: "process_refund",
      resource_type: "payment",
      resource_id: payment.id,
      patient_id: consultation?.patient_id || null,
      metadata: {
        amount: payment.amount,
        consultation_id: payment.consultation_id,
        reason,
      },
      ip_address: ipAddress || null,
    });

    // 4. Kirim notifikasi ke pasien bahwa dana telah direfund
    if (consultation?.patient_id) {
      const formattedAmount = new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
      }).format(payment.amount);

      await FcmService.sendInAppAndPushNotification({
        userId: consultation.patient_id,
        type: "payment_refunded",
        title: "Pengembalian Dana Berhasil",
        body: `Dana sebesar ${formattedAmount} untuk konsultasi Anda telah diproses untuk pengembalian dana (refund). Alasan: ${reason}`,
        data: {
          consultation_id: payment.consultation_id,
          payment_id: payment.id,
          refund_note: reason,
        },
      });
    }

    return updatedPayment;
  }
}
