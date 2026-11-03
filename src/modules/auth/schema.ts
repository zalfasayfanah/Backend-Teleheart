import { z } from "zod";

export const consentItemSchema = z.object({
  consent_type: z.enum(["privacy_policy", "medical_data_processing"], {
    errorMap: () => ({ message: "Tipe persetujuan harus privacy_policy atau medical_data_processing" }),
  }),
  version: z.string().min(1, "Versi persetujuan wajib diisi"),
});

export const registerPatientSchema = z.object({
  full_name: z.string().min(2, "Nama lengkap minimal 2 karakter"),
  nik: z.string().regex(/^\d{16}$/, "NIK harus terdiri dari 16 digit angka"),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal lahir harus YYYY-MM-DD"),
  gender: z.enum(["male", "female"], {
    errorMap: () => ({ message: "Jenis kelamin harus male atau female" }),
  }),
  phone: z.string().optional(),
  email: z.string().email("Format email tidak valid"),
  password: z.string().min(8, "Password minimal 8 karakter"),
  has_prior_hospital_checkup: z.boolean().optional().default(false),
  consents: z
    .array(consentItemSchema)
    .min(2, "Persetujuan privacy_policy dan medical_data_processing wajib disetujui")
    .refine(
      (consents) => {
        const types = consents.map((c) => c.consent_type);
        return types.includes("privacy_policy") && types.includes("medical_data_processing");
      },
      {
        message: "Kedua persetujuan (privacy_policy dan medical_data_processing) wajib ada",
      }
    ),
});

export const registerDoctorSchema = z.object({
  full_name: z.string().min(2, "Nama lengkap dokter minimal 2 karakter"),
  email: z.string().email("Format email tidak valid"),
  password: z.string().min(8, "Password minimal 8 karakter"),
  str_number: z.string().min(5, "Nomor STR wajib diisi"),
  sip_number: z.string().min(5, "Nomor SIP wajib diisi"),
  specialization: z.string().optional().default("Kardiologi"),
  workplace: z.string().optional(),
  str_file_path: z.string().optional(),
  sip_file_path: z.string().optional(),
  consents: z
    .array(consentItemSchema)
    .min(2, "Persetujuan privacy_policy dan medical_data_processing wajib disetujui")
    .refine(
      (consents) => {
        const types = consents.map((c) => c.consent_type);
        return types.includes("privacy_policy") && types.includes("medical_data_processing");
      },
      {
        message: "Kedua persetujuan wajib ada",
      }
    ),
});

export const loginSchema = z.object({
  email: z.string().email("Format email tidak valid"),
  password: z.string().min(1, "Password wajib diisi"),
});

export const refreshTokenSchema = z.object({
  refresh_token: z.string().min(1, "Refresh token wajib diisi"),
});

export type RegisterPatientInput = z.infer<typeof registerPatientSchema>;
export type RegisterDoctorInput = z.infer<typeof registerDoctorSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

