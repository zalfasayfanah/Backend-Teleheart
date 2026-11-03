import { supabaseAdmin, supabaseAnon } from "../../lib/supabase.js";
import { encryptNik, hashNik } from "../../lib/crypto.js";
import { AppError } from "../../middleware/errorHandler.js";
import {
  RegisterPatientInput,
  RegisterDoctorInput,
  LoginInput,
  RefreshTokenInput,
} from "./schema.js";

export class AuthService {
  /**
   * Registrasi Pasien Baru
   */
  static async registerPatient(input: RegisterPatientInput, ipAddress?: string) {
    const nikHash = hashNik(input.nik);

    // 1. Cek apakah NIK sudah pernah terdaftar
    const { data: existingNik } = await supabaseAdmin
      .from("patient_profiles")
      .select("user_id")
      .eq("nik_hash", nikHash)
      .maybeSingle();

    if (existingNik) {
      throw new AppError(409, "NIK_TAKEN", "NIK sudah terdaftar dalam sistem");
    }

    // 2. Cek apakah email sudah terdaftar di users
    const { data: existingEmail } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("email", input.email)
      .maybeSingle();

    if (existingEmail) {
      throw new AppError(409, "EMAIL_TAKEN", "Email sudah terdaftar dalam sistem");
    }

    // 3. Buat Akun di Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true, // Set true agar user bisa langsung diuji coba (di production bisa false)
      user_metadata: {
        role: "patient",
        full_name: input.full_name,
      },
    });

    if (authError || !authData.user) {
      throw new AppError(400, "AUTH_ERROR", authError?.message || "Gagal membuat akun autentikasi");
    }

    const userId = authData.user.id;
    const nikEncrypted = encryptNik(input.nik);

    try {
      // 4. Masukkan ke tabel public.users
      const { error: userError } = await supabaseAdmin.from("users").insert({
        id: userId,
        role: "patient",
        full_name: input.full_name,
        email: input.email,
        is_active: true,
      });

      if (userError) throw userError;

      // 5. Masukkan ke tabel public.patient_profiles
      const { error: profileError } = await supabaseAdmin.from("patient_profiles").insert({
        user_id: userId,
        nik_encrypted: nikEncrypted,
        nik_hash: nikHash,
        birth_date: input.birth_date,
        gender: input.gender,
        phone: input.phone || null,
        has_prior_hospital_checkup: input.has_prior_hospital_checkup || false,
      });

      if (profileError) throw profileError;

      // 6. Catat persetujuan (consents)
      const consentRows = input.consents.map((c) => ({
        user_id: userId,
        consent_type: c.consent_type,
        version: c.version,
        ip_address: ipAddress || null,
      }));

      const { error: consentError } = await supabaseAdmin.from("consents").insert(consentRows);
      if (consentError) throw consentError;

      return {
        id: userId,
        email: input.email,
        role: "patient",
        message: "Registrasi pasien berhasil",
      };
    } catch (err: any) {
      // Rollback auth user jika database insert gagal
      await supabaseAdmin.auth.admin.deleteUser(userId);
      console.error("Gagal menyimpan profil pasien:", err);
      throw new AppError(500, "INTERNAL_ERROR", "Gagal menyimpan data pendaftaran pasien");
    }
  }

  /**
   * Registrasi Dokter Baru
   */
  static async registerDoctor(input: RegisterDoctorInput, ipAddress?: string) {
    // 1. Cek nomor STR
    const { data: existingStr } = await supabaseAdmin
      .from("doctor_profiles")
      .select("user_id")
      .eq("str_number", input.str_number)
      .maybeSingle();

    if (existingStr) {
      throw new AppError(409, "STR_TAKEN", "Nomor STR sudah terdaftar");
    }

    // 2. Cek email
    const { data: existingEmail } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("email", input.email)
      .maybeSingle();

    if (existingEmail) {
      throw new AppError(409, "EMAIL_TAKEN", "Email sudah terdaftar dalam sistem");
    }

    // 3. Buat Akun di Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: {
        role: "doctor",
        full_name: input.full_name,
      },
    });

    if (authError || !authData.user) {
      throw new AppError(400, "AUTH_ERROR", authError?.message || "Gagal membuat akun dokter");
    }

    const userId = authData.user.id;

    try {
      // 4. Masukkan ke public.users
      const { error: userError } = await supabaseAdmin.from("users").insert({
        id: userId,
        role: "doctor",
        full_name: input.full_name,
        email: input.email,
        is_active: true,
      });

      if (userError) throw userError;

      // 5. Masukkan ke public.doctor_profiles (status pending verifikasi admin)
      const { error: docError } = await supabaseAdmin.from("doctor_profiles").insert({
        user_id: userId,
        str_number: input.str_number,
        sip_number: input.sip_number,
        specialization: input.specialization || "Kardiologi",
        workplace: input.workplace || null,
        str_file_path: input.str_file_path || null,
        sip_file_path: input.sip_file_path || null,
        verification_status: "pending",
        is_online: false,
      });

      if (docError) throw docError;

      // 6. Catat consents
      const consentRows = input.consents.map((c) => ({
        user_id: userId,
        consent_type: c.consent_type,
        version: c.version,
        ip_address: ipAddress || null,
      }));

      await supabaseAdmin.from("consents").insert(consentRows);

      return {
        id: userId,
        email: input.email,
        role: "doctor",
        verification_status: "pending",
        message: "Pendaftaran dokter berhasil, menunggu verifikasi administrator",
      };
    } catch (err: any) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      console.error("Gagal menyimpan profil dokter:", err);
      throw new AppError(500, "INTERNAL_ERROR", "Gagal menyimpan data pendaftaran dokter");
    }
  }

  /**
   * Login Pengguna (Pasien / Dokter / Admin)
   */
  static async login(input: LoginInput, platformHeader?: string) {
    // 1. Validasi header platform
    if (!platformHeader || (platformHeader !== "mobile" && platformHeader !== "web")) {
      throw new AppError(
        400,
        "INVALID_PLATFORM",
        "Header 'X-Client-Platform' wajib diisi dengan nilai 'mobile' atau 'web'"
      );
    }

    // 2. Autentikasi dengan Supabase Auth
    const { data: authData, error: authError } = await supabaseAnon.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });

    if (authError || !authData.session || !authData.user) {
      if (authError?.message.toLowerCase().includes("email not confirmed")) {
        throw new AppError(401, "EMAIL_NOT_VERIFIED", "Email belum diverifikasi. Silakan periksa inbox email Anda.");
      }
      throw new AppError(401, "INVALID_CREDENTIALS", "Email atau password salah");
    }

    const userId = authData.user.id;

    // 3. Ambil profil user dari database
    const { data: dbUser, error: userError } = await supabaseAdmin
      .from("users")
      .select("id, role, full_name, email, is_active")
      .eq("id", userId)
      .single();

    if (userError || !dbUser) {
      throw new AppError(401, "USER_NOT_FOUND", "Pengguna tidak terdaftar dalam database");
    }

    if (!dbUser.is_active) {
      throw new AppError(403, "ACCOUNT_INACTIVE", "Akun Anda telah dinonaktifkan oleh administrator");
    }

    // 4. Validasi Platform sesuai aturan bisnis (PRD 5.4 / API 1.1)
    // Pasien hanya boleh login lewat mobile, dokter dan admin hanya boleh lewat web
    if (dbUser.role === "patient" && platformHeader !== "mobile") {
      throw new AppError(403, "WRONG_PLATFORM", "Pasien hanya dapat login melalui aplikasi mobile");
    }

    if ((dbUser.role === "doctor" || dbUser.role === "admin") && platformHeader !== "web") {
      throw new AppError(403, "WRONG_PLATFORM", "Dokter dan admin hanya dapat login melalui web");
    }

    // 5. Cek status verifikasi jika dokter
    let doctorVerificationStatus: "pending" | "approved" | "rejected" | null = null;
    if (dbUser.role === "doctor") {
      const { data: docData } = await supabaseAdmin
        .from("doctor_profiles")
        .select("verification_status")
        .eq("user_id", userId)
        .maybeSingle();

      doctorVerificationStatus = docData?.verification_status || "pending";
    }

    return {
      access_token: authData.session.access_token,
      refresh_token: authData.session.refresh_token,
      expires_in: authData.session.expires_in,
      user: {
        id: dbUser.id,
        role: dbUser.role,
        full_name: dbUser.full_name,
        email: dbUser.email,
      },
      doctor_verification_status: doctorVerificationStatus,
    };
  }

  /**
   * Refresh Token
   */
  static async refreshSession(input: RefreshTokenInput) {
    const { data, error } = await supabaseAnon.auth.refreshSession({
      refresh_token: input.refresh_token,
    });

    if (error || !data.session) {
      throw new AppError(401, "INVALID_TOKEN", "Refresh token tidak valid atau telah kedaluwarsa");
    }

    return {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
    };
  }

  /**
   * Info User Sesi Saat Ini
   */
  static async getMe(userId: string) {
    const { data: user, error } = await supabaseAdmin
      .from("users")
      .select("id, role, full_name, email, is_active")
      .eq("id", userId)
      .single();

    if (error || !user) {
      throw new AppError(404, "NOT_FOUND", "Pengguna tidak ditemukan");
    }

    let doctorVerificationStatus: "pending" | "approved" | "rejected" | null = null;
    if (user.role === "doctor") {
      const { data: docData } = await supabaseAdmin
        .from("doctor_profiles")
        .select("verification_status")
        .eq("user_id", userId)
        .maybeSingle();

      doctorVerificationStatus = docData?.verification_status || null;
    }

    return {
      id: user.id,
      role: user.role,
      full_name: user.full_name,
      email: user.email,
      is_active: user.is_active,
      doctor_verification_status: doctorVerificationStatus,
    };
  }
}
