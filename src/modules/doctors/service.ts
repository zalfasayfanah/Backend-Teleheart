import { supabaseAdmin } from "../../lib/supabase.js";
import { logAudit } from "../../lib/audit.js";
import { AppError } from "../../middleware/errorHandler.js";
import {
  UpdateDoctorProfileInput,
  TariffItemInput,
  DoctorQueryInput,
  VerifyDoctorInput,
} from "./schema.js";

export class DoctorService {
  /**
   * Mengambil Tarif Platform yang Berlaku Saat Ini
   */
  static async getCurrentPlatformFee(): Promise<{ amount: number; effective_from: string }> {
    const nowIso = new Date().toISOString();
    const { data } = await supabaseAdmin
      .from("platform_fees")
      .select("amount, effective_from")
      .lte("effective_from", nowIso)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      return {
        amount: data.amount,
        effective_from: data.effective_from,
      };
    }

    // Default fallback Rp 5.000 jika belum ada baris di database
    return {
      amount: 5000,
      effective_from: nowIso,
    };
  }

  /**
   * Menampilkan Daftar Dokter Online & Terverifikasi (Sisi Pasien & Publik)
   */
  static async getApprovedOnlineDoctors(query: DoctorQueryInput) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const offset = (page - 1) * limit;

    const platformFee = await this.getCurrentPlatformFee();

    // 1. Ambil profil dokter yang approved dan online
    const { data: approvedProfiles, error: profileError } = await supabaseAdmin
      .from("doctor_profiles")
      .select("user_id, specialization, workplace, bio, photo_path, is_online")
      .eq("verification_status", "approved")
      .eq("is_online", true);

    if (profileError) {
      throw new AppError(500, "DATABASE_ERROR", "Gagal mengambil daftar profil dokter");
    }

    if (!approvedProfiles || approvedProfiles.length === 0) {
      return {
        data: [],
        meta: { page, limit, total: 0 },
      };
    }

    const doctorUserIds = approvedProfiles.map((p) => p.user_id);

    // 2. Ambil data user aktif (dengan filter pencarian nama jika ada)
    let userQuery = supabaseAdmin
      .from("users")
      .select("id, full_name, is_active")
      .in("id", doctorUserIds)
      .eq("is_active", true);

    if (query.q) {
      userQuery = userQuery.ilike("full_name", `%${query.q}%`);
    }

    const { data: users, error: userError } = await userQuery;
    if (userError) {
      throw new AppError(500, "DATABASE_ERROR", "Gagal mengambil data user dokter");
    }

    if (!users || users.length === 0) {
      return {
        data: [],
        meta: { page, limit, total: 0 },
      };
    }

    // Mapping user by id
    const userMap = new Map(users.map((u) => [u.id, u]));

    // Filter dokter yang usernya aktif dan cocok dengan pencarian
    const matchedDoctors = approvedProfiles.filter((p) => userMap.has(p.user_id));
    const total = matchedDoctors.length;
    const paginatedDoctors = matchedDoctors.slice(offset, offset + limit);

    // 3. Ambil tarif dan ketersediaan untuk setiap dokter
    const doctorList = await Promise.all(
      paginatedDoctors.map(async (doc) => {
        const doctorId = doc.user_id;
        const user = userMap.get(doctorId)!;

        // Cek apakah dokter sedang menangani sesi konsultasi aktif
        const { count: activeConsultations } = await supabaseAdmin
          .from("consultations")
          .select("id", { count: "exact", head: true })
          .eq("doctor_id", doctorId)
          .eq("status", "active");

        const isAvailable = (activeConsultations || 0) === 0;

        // Ambil tarif aktif milik dokter
        const { data: tariffs } = await supabaseAdmin
          .from("doctor_tariffs")
          .select("duration_minutes, price")
          .eq("doctor_id", doctorId)
          .eq("is_active", true)
          .order("duration_minutes", { ascending: true });

        const prices = (tariffs || []).map((t) => ({
          duration_minutes: t.duration_minutes,
          doctor_price: t.price,
          platform_fee: platformFee.amount,
          total_price: t.price + platformFee.amount,
        }));

        return {
          id: doctorId,
          full_name: user.full_name,
          specialization: doc.specialization,
          workplace: doc.workplace,
          photo_url: doc.photo_path || null,
          is_available: isAvailable,
          prices,
        };
      })
    );

    return {
      data: doctorList,
      meta: { page, limit, total },
    };
  }

  /**
   * Detail Dokter Berdasarkan ID
   */
  static async getDoctorDetail(doctorId: string) {
    const platformFee = await this.getCurrentPlatformFee();

    const { data: doc, error: profileError } = await supabaseAdmin
      .from("doctor_profiles")
      .select("user_id, specialization, workplace, bio, photo_path, is_online, verification_status")
      .eq("user_id", doctorId)
      .eq("verification_status", "approved")
      .maybeSingle();

    if (profileError || !doc) {
      throw new AppError(404, "DOCTOR_NOT_FOUND", "Dokter tidak ditemukan atau belum disetujui");
    }

    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("id, full_name, is_active")
      .eq("id", doctorId)
      .eq("is_active", true)
      .maybeSingle();

    if (userError || !user) {
      throw new AppError(404, "DOCTOR_NOT_FOUND", "Data dokter tidak aktif");
    }

    const { count: activeConsultations } = await supabaseAdmin
      .from("consultations")
      .select("id", { count: "exact", head: true })
      .eq("doctor_id", doctorId)
      .eq("status", "active");

    const { data: tariffs } = await supabaseAdmin
      .from("doctor_tariffs")
      .select("duration_minutes, price")
      .eq("doctor_id", doctorId)
      .eq("is_active", true)
      .order("duration_minutes", { ascending: true });

    const prices = (tariffs || []).map((t) => ({
      duration_minutes: t.duration_minutes,
      doctor_price: t.price,
      platform_fee: platformFee.amount,
      total_price: t.price + platformFee.amount,
    }));

    return {
      id: doc.user_id,
      full_name: user.full_name,
      specialization: doc.specialization,
      workplace: doc.workplace,
      bio: doc.bio,
      photo_url: doc.photo_path || null,
      is_online: doc.is_online,
      is_available: (activeConsultations || 0) === 0,
      prices,
    };
  }

  /**
   * Profil Dokter Milik Sendiri (GET /doctors/me/profile)
   */
  static async getOwnDoctorProfile(doctorId: string) {
    const { data: user } = await supabaseAdmin
      .from("users")
      .select("full_name, email")
      .eq("id", doctorId)
      .single();

    const { data: profile, error } = await supabaseAdmin
      .from("doctor_profiles")
      .select("*")
      .eq("user_id", doctorId)
      .single();

    if (error || !profile) {
      throw new AppError(404, "DOCTOR_NOT_FOUND", "Profil dokter tidak ditemukan");
    }

    return {
      id: doctorId,
      full_name: user?.full_name,
      email: user?.email,
      str_number: profile.str_number,
      sip_number: profile.sip_number,
      specialization: profile.specialization,
      workplace: profile.workplace,
      bio: profile.bio,
      photo_url: profile.photo_path || null,
      verification_status: profile.verification_status,
      rejection_reason: profile.rejection_reason || null,
      is_online: profile.is_online,
    };
  }

  /**
   * Update Profil Dokter Sendiri (PUT /doctors/me/profile)
   */
  static async updateOwnDoctorProfile(doctorId: string, input: UpdateDoctorProfileInput) {
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (input.specialization !== undefined) updateData.specialization = input.specialization;
    if (input.workplace !== undefined) updateData.workplace = input.workplace;
    if (input.bio !== undefined) updateData.bio = input.bio;

    const { data, error } = await supabaseAdmin
      .from("doctor_profiles")
      .update(updateData)
      .eq("user_id", doctorId)
      .select("specialization, workplace, bio, updated_at")
      .single();

    if (error || !data) {
      throw new AppError(400, "UPDATE_FAILED", "Gagal memperbarui profil dokter");
    }

    return data;
  }

  /**
   * Ubah Status Online Dokter (PATCH /doctors/me/online)
   */
  static async updateOnlineStatus(doctorId: string, isOnline: boolean) {
    // Periksa status verifikasi
    const { data: doc } = await supabaseAdmin
      .from("doctor_profiles")
      .select("verification_status")
      .eq("user_id", doctorId)
      .single();

    if (!doc || doc.verification_status !== "approved") {
      throw new AppError(
        403,
        "DOCTOR_NOT_APPROVED",
        "Akun dokter belum disetujui oleh admin sehingga tidak dapat mengubah status online"
      );
    }

    const { data, error } = await supabaseAdmin
      .from("doctor_profiles")
      .update({
        is_online: isOnline,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", doctorId)
      .select("is_online, last_seen_at")
      .single();

    if (error || !data) {
      throw new AppError(400, "UPDATE_FAILED", "Gagal memperbarui status online");
    }

    return data;
  }

  /**
   * Mengambil Tarif Sendiri (GET /doctors/me/tariffs)
   */
  static async getOwnTariffs(doctorId: string) {
    const { data, error } = await supabaseAdmin
      .from("doctor_tariffs")
      .select("duration_minutes, price, is_active, updated_at")
      .eq("doctor_id", doctorId)
      .order("duration_minutes", { ascending: true });

    if (error) {
      throw new AppError(500, "DATABASE_ERROR", "Gagal mengambil daftar tarif dokter");
    }

    return data || [];
  }

  /**
   * Mengatur/Mengubah Tarif Dokter (PUT /doctors/me/tariffs)
   */
  static async updateOwnTariffs(doctorId: string, tariffs: TariffItemInput[]) {
    const rows = tariffs.map((t) => ({
      doctor_id: doctorId,
      duration_minutes: t.duration_minutes,
      price: t.price,
      is_active: t.is_active !== undefined ? t.is_active : true,
      updated_at: new Date().toISOString(),
    }));

    const { data, error } = await supabaseAdmin
      .from("doctor_tariffs")
      .upsert(rows, { onConflict: "doctor_id,duration_minutes" })
      .select("duration_minutes, price, is_active");

    if (error) {
      throw new AppError(500, "DATABASE_ERROR", "Gagal memperbarui tarif dokter");
    }

    return data;
  }

  /**
   * Verifikasi Dokter oleh Admin (PATCH /admin/doctors/:id/verification)
   */
  static async verifyDoctor(doctorId: string, adminId: string, input: VerifyDoctorInput, clientIp?: string) {
    const updateData: Record<string, any> = {
      verification_status: input.status,
      verified_by: adminId,
      verified_at: new Date().toISOString(),
      rejection_reason: input.status === "rejected" ? input.rejection_reason : null,
      updated_at: new Date().toISOString(),
    };

    // Jika ditolak, otomatis offline
    if (input.status === "rejected") {
      updateData.is_online = false;
    }

    const { data: updatedDoc, error } = await supabaseAdmin
      .from("doctor_profiles")
      .update(updateData)
      .eq("user_id", doctorId)
      .select("user_id, verification_status, rejection_reason, verified_at")
      .single();

    if (error || !updatedDoc) {
      throw new AppError(404, "DOCTOR_NOT_FOUND", "Dokter tidak ditemukan");
    }

    // Catat ke audit log
    await logAudit({
      actor_id: adminId,
      actor_role: "admin",
      action: input.status === "approved" ? "approve_doctor" : "reject_doctor",
      resource_type: "doctor_profile",
      resource_id: doctorId,
      metadata: { status: input.status, reason: input.rejection_reason },
      ip_address: clientIp,
    });

    // Kirim notifikasi in-app ke dokter
    await supabaseAdmin.from("notifications").insert({
      user_id: doctorId,
      type: "doctor_verification",
      title: "Status Verifikasi Dokter",
      body:
        input.status === "approved"
          ? "Selamat! Akun dokter Anda telah disetujui. Anda sekarang dapat online dan menerima konsultasi."
          : `Mohon maaf, pendaftaran akun dokter Anda ditolak dengan alasan: ${input.rejection_reason}`,
      data: { status: input.status },
    });

    return updatedDoc;
  }
}
