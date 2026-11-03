import { supabaseAdmin } from "../../lib/supabase.js";
import { decryptNik, maskNik } from "../../lib/crypto.js";
import { logAudit } from "../../lib/audit.js";
import { AppError } from "../../middleware/errorHandler.js";
import {
  UpdatePatientProfileInput,
  CreateMedicalHistoryInput,
  UpdateMedicalHistoryInput,
  CreateMedicationInput,
  UpdateMedicationInput,
  CreateAllergyInput,
  UpdateAllergyInput,
} from "./schema.js";

export class PatientService {
  /**
   * Mengambil Profil Lengkap Pasien Milik Sendiri
   */
  static async getOwnProfile(userId: string) {
    // 1. Ambil user & profil pasien
    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("full_name")
      .eq("id", userId)
      .single();

    if (userError || !user) {
      throw new AppError(404, "USER_NOT_FOUND", "Pengguna tidak ditemukan");
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("patient_profiles")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (profileError || !profile) {
      throw new AppError(404, "PROFILE_NOT_FOUND", "Profil pasien belum terdaftar");
    }

    // 2. Dekripsi NIK dan lakukan masking
    let nikMasked = "****************";
    try {
      const decrypted = decryptNik(profile.nik_encrypted);
      nikMasked = maskNik(decrypted);
    } catch (e) {
      console.error("Gagal mendekripsi NIK:", e);
    }

    // 3. Ambil data sublist medis
    const [medHistories, medications, allergies] = await Promise.all([
      supabaseAdmin
        .from("patient_medical_histories")
        .select("id, condition_name, diagnosed_year, notes")
        .eq("patient_id", userId)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("patient_medications")
        .select("id, medicine_name, dosage, frequency")
        .eq("patient_id", userId)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("patient_allergies")
        .select("id, allergen, reaction")
        .eq("patient_id", userId)
        .order("created_at", { ascending: false }),
    ]);

    return {
      full_name: user.full_name,
      nik_masked: nikMasked,
      birth_date: profile.birth_date,
      gender: profile.gender,
      phone: profile.phone,
      has_prior_hospital_checkup: profile.has_prior_hospital_checkup,
      medical_histories: medHistories.data || [],
      medications: medications.data || [],
      allergies: allergies.data || [],
    };
  }

  /**
   * Memperbarui Profil Pasien Sendiri (Phone, has_prior_hospital_checkup)
   */
  static async updateOwnProfile(userId: string, input: UpdatePatientProfileInput) {
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (input.phone !== undefined) updateData.phone = input.phone;
    if (input.has_prior_hospital_checkup !== undefined) {
      updateData.has_prior_hospital_checkup = input.has_prior_hospital_checkup;
    }

    const { data, error } = await supabaseAdmin
      .from("patient_profiles")
      .update(updateData)
      .eq("user_id", userId)
      .select("phone, has_prior_hospital_checkup, updated_at")
      .single();

    if (error || !data) {
      throw new AppError(400, "UPDATE_FAILED", "Gagal memperbarui profil pasien");
    }

    return data;
  }

  // ===========================================================================
  // RIWAYAT PENYAKIT (Medical Histories)
  // ===========================================================================
  static async getMedicalHistories(userId: string) {
    const { data, error } = await supabaseAdmin
      .from("patient_medical_histories")
      .select("id, condition_name, diagnosed_year, notes, created_at")
      .eq("patient_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw new AppError(500, "DATABASE_ERROR", "Gagal mengambil riwayat penyakit");
    return data || [];
  }

  static async addMedicalHistory(userId: string, input: CreateMedicalHistoryInput) {
    const { data, error } = await supabaseAdmin
      .from("patient_medical_histories")
      .insert({
        patient_id: userId,
        condition_name: input.condition_name,
        diagnosed_year: input.diagnosed_year || null,
        notes: input.notes || null,
      })
      .select("id, condition_name, diagnosed_year, notes")
      .single();

    if (error || !data) throw new AppError(500, "DATABASE_ERROR", "Gagal menambahkan riwayat penyakit");
    return data;
  }

  static async updateMedicalHistory(userId: string, id: string, input: UpdateMedicalHistoryInput) {
    const { data, error } = await supabaseAdmin
      .from("patient_medical_histories")
      .update({
        ...(input.condition_name ? { condition_name: input.condition_name } : {}),
        ...(input.diagnosed_year !== undefined ? { diagnosed_year: input.diagnosed_year } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      })
      .eq("id", id)
      .eq("patient_id", userId)
      .select("id, condition_name, diagnosed_year, notes")
      .single();

    if (error || !data) throw new AppError(404, "NOT_FOUND", "Data riwayat penyakit tidak ditemukan");
    return data;
  }

  static async deleteMedicalHistory(userId: string, id: string) {
    const { error } = await supabaseAdmin
      .from("patient_medical_histories")
      .delete()
      .eq("id", id)
      .eq("patient_id", userId);

    if (error) throw new AppError(500, "DATABASE_ERROR", "Gagal menghapus riwayat penyakit");
    return { message: "Riwayat penyakit berhasil dihapus" };
  }

  // ===========================================================================
  // OBAT RUTIN (Medications)
  // ===========================================================================
  static async getMedications(userId: string) {
    const { data, error } = await supabaseAdmin
      .from("patient_medications")
      .select("id, medicine_name, dosage, frequency, created_at")
      .eq("patient_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw new AppError(500, "DATABASE_ERROR", "Gagal mengambil data obat rutin");
    return data || [];
  }

  static async addMedication(userId: string, input: CreateMedicationInput) {
    const { data, error } = await supabaseAdmin
      .from("patient_medications")
      .insert({
        patient_id: userId,
        medicine_name: input.medicine_name,
        dosage: input.dosage || null,
        frequency: input.frequency || null,
      })
      .select("id, medicine_name, dosage, frequency")
      .single();

    if (error || !data) throw new AppError(500, "DATABASE_ERROR", "Gagal menambahkan obat rutin");
    return data;
  }

  static async updateMedication(userId: string, id: string, input: UpdateMedicationInput) {
    const { data, error } = await supabaseAdmin
      .from("patient_medications")
      .update({
        ...(input.medicine_name ? { medicine_name: input.medicine_name } : {}),
        ...(input.dosage !== undefined ? { dosage: input.dosage } : {}),
        ...(input.frequency !== undefined ? { frequency: input.frequency } : {}),
      })
      .eq("id", id)
      .eq("patient_id", userId)
      .select("id, medicine_name, dosage, frequency")
      .single();

    if (error || !data) throw new AppError(404, "NOT_FOUND", "Data obat rutin tidak ditemukan");
    return data;
  }

  static async deleteMedication(userId: string, id: string) {
    const { error } = await supabaseAdmin
      .from("patient_medications")
      .delete()
      .eq("id", id)
      .eq("patient_id", userId);

    if (error) throw new AppError(500, "DATABASE_ERROR", "Gagal menghapus obat rutin");
    return { message: "Obat rutin berhasil dihapus" };
  }

  // ===========================================================================
  // ALERGI (Allergies)
  // ===========================================================================
  static async getAllergies(userId: string) {
    const { data, error } = await supabaseAdmin
      .from("patient_allergies")
      .select("id, allergen, reaction, created_at")
      .eq("patient_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw new AppError(500, "DATABASE_ERROR", "Gagal mengambil data alergi");
    return data || [];
  }

  static async addAllergy(userId: string, input: CreateAllergyInput) {
    const { data, error } = await supabaseAdmin
      .from("patient_allergies")
      .insert({
        patient_id: userId,
        allergen: input.allergen,
        reaction: input.reaction || null,
      })
      .select("id, allergen, reaction")
      .single();

    if (error || !data) throw new AppError(500, "DATABASE_ERROR", "Gagal menambahkan alergi");
    return data;
  }

  static async updateAllergy(userId: string, id: string, input: UpdateAllergyInput) {
    const { data, error } = await supabaseAdmin
      .from("patient_allergies")
      .update({
        ...(input.allergen ? { allergen: input.allergen } : {}),
        ...(input.reaction !== undefined ? { reaction: input.reaction } : {}),
      })
      .eq("id", id)
      .eq("patient_id", userId)
      .select("id, allergen, reaction")
      .single();

    if (error || !data) throw new AppError(404, "NOT_FOUND", "Data alergi tidak ditemukan");
    return data;
  }

  static async deleteAllergy(userId: string, id: string) {
    const { error } = await supabaseAdmin
      .from("patient_allergies")
      .delete()
      .eq("id", id)
      .eq("patient_id", userId);

    if (error) throw new AppError(500, "DATABASE_ERROR", "Gagal menghapus alergi");
    return { message: "Alergi berhasil dihapus" };
  }

  // ===========================================================================
  // AKSES DOKTER KE PROFIL PASIEN (GET /patients/:id/profile)
  // ===========================================================================
  static async getPatientProfileByDoctor(patientId: string, doctorId: string, clientIp?: string) {
    // 1. Verifikasi hak akses: dokter harus memiliki penugasan atau konsultasi dengan pasien ini
    const { data: consultation } = await supabaseAdmin
      .from("consultations")
      .select("id")
      .eq("patient_id", patientId)
      .eq("doctor_id", doctorId)
      .limit(1)
      .maybeSingle();

    const { data: assignment } = await supabaseAdmin
      .from("consultation_assignments")
      .select("id")
      .eq("doctor_id", doctorId)
      .in("status", ["offered", "accepted"])
      .limit(1)
      .maybeSingle();

    if (!consultation && !assignment) {
      await logAudit({
        actor_id: doctorId,
        actor_role: "doctor",
        action: "view_patient_profile_denied",
        resource_type: "patient_profile",
        patient_id: patientId,
        ip_address: clientIp,
      });
      throw new AppError(403, "FORBIDDEN", "Anda tidak memiliki izin untuk mengakses data medis pasien ini");
    }

    // 2. Ambil data pasien (tanpa NIK dan nomor HP)
    const { data: user } = await supabaseAdmin
      .from("users")
      .select("full_name")
      .eq("id", patientId)
      .single();

    const { data: profile } = await supabaseAdmin
      .from("patient_profiles")
      .select("birth_date, gender, has_prior_hospital_checkup")
      .eq("user_id", patientId)
      .single();

    if (!user || !profile) {
      throw new AppError(404, "NOT_FOUND", "Data pasien tidak ditemukan");
    }

    const [medHistories, medications, allergies] = await Promise.all([
      supabaseAdmin
        .from("patient_medical_histories")
        .select("id, condition_name, diagnosed_year, notes")
        .eq("patient_id", patientId),
      supabaseAdmin
        .from("patient_medications")
        .select("id, medicine_name, dosage, frequency")
        .eq("patient_id", patientId),
      supabaseAdmin
        .from("patient_allergies")
        .select("id, allergen, reaction")
        .eq("patient_id", patientId),
    ]);

    // 3. Catat audit log berhasil
    await logAudit({
      actor_id: doctorId,
      actor_role: "doctor",
      action: "view_patient_profile",
      resource_type: "patient_profile",
      patient_id: patientId,
      ip_address: clientIp,
    });

    return {
      full_name: user.full_name,
      birth_date: profile.birth_date,
      gender: profile.gender,
      has_prior_hospital_checkup: profile.has_prior_hospital_checkup,
      medical_histories: medHistories.data || [],
      medications: medications.data || [],
      allergies: allergies.data || [],
    };
  }
}
