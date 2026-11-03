import { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { AppError } from "./errorHandler.js";
import { AuthenticatedUser } from "../types/express.js";

export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new AppError(401, "UNAUTHORIZED", "Token autentikasi tidak ditemukan");
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      throw new AppError(401, "UNAUTHORIZED", "Token autentikasi tidak valid");
    }

    // Verifikasi JWT token via Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData.user) {
      throw new AppError(401, "INVALID_TOKEN", "Token tidak valid atau telah kedaluwarsa");
    }

    const userId = authData.user.id;

    // Ambil data profil dasar dari tabel public.users
    const { data: dbUser, error: dbError } = await supabaseAdmin
      .from("users")
      .select("id, role, full_name, email, is_active")
      .eq("id", userId)
      .single();

    if (dbError || !dbUser) {
      throw new AppError(401, "USER_NOT_FOUND", "Pengguna tidak ditemukan dalam sistem");
    }

    if (!dbUser.is_active) {
      throw new AppError(403, "ACCOUNT_INACTIVE", "Akun Anda telah dinonaktifkan oleh administrator");
    }

    const userPayload: AuthenticatedUser = {
      id: dbUser.id,
      email: dbUser.email,
      role: dbUser.role,
      full_name: dbUser.full_name,
      is_active: dbUser.is_active,
      doctor_verification_status: null,
    };

    // Jika dokter, periksa status verifikasinya
    if (dbUser.role === "doctor") {
      const { data: docProfile } = await supabaseAdmin
        .from("doctor_profiles")
        .select("verification_status")
        .eq("user_id", userId)
        .single();

      if (docProfile) {
        userPayload.doctor_verification_status = docProfile.verification_status;
      }
    }

    req.user = userPayload;
    next();
  } catch (error) {
    next(error);
  }
}
