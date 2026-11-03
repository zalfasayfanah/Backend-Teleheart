import { z } from "zod";

export const updateDoctorProfileSchema = z.object({
  specialization: z.string().min(2, "Spesialisasi minimal 2 karakter").optional(),
  workplace: z.string().optional(),
  bio: z.string().optional(),
});

export const updateOnlineStatusSchema = z.object({
  is_online: z.boolean({ required_error: "Status is_online wajib diisi" }),
});

export const tariffItemSchema = z.object({
  duration_minutes: z.union([z.literal(15), z.literal(30), z.literal(60)], {
    errorMap: () => ({ message: "Durasi konsultasi hanya boleh 15, 30, atau 60 menit" }),
  }),
  price: z.coerce.number().int().min(0, "Tarif tidak boleh negatif"),
  is_active: z.boolean().optional().default(true),
});

export const updateTariffsSchema = z.object({
  tariffs: z.array(tariffItemSchema).min(1, "Minimal satu tarif harus disertakan"),
});

export const doctorQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().optional(),
});

export const verifyDoctorSchema = z
  .object({
    status: z.enum(["approved", "rejected"], {
      errorMap: () => ({ message: "Status verifikasi harus 'approved' atau 'rejected'" }),
    }),
    rejection_reason: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.status === "rejected" && (!data.rejection_reason || data.rejection_reason.trim() === "")) {
        return false;
      }
      return true;
    },
    {
      message: "Alasan penolakan (rejection_reason) wajib diisi jika status rejected",
      path: ["rejection_reason"],
    }
  );

export type UpdateDoctorProfileInput = z.infer<typeof updateDoctorProfileSchema>;
export type UpdateOnlineStatusInput = z.infer<typeof updateOnlineStatusSchema>;
export type TariffItemInput = z.infer<typeof tariffItemSchema>;
export type UpdateTariffsInput = z.infer<typeof updateTariffsSchema>;
export type DoctorQueryInput = z.infer<typeof doctorQuerySchema>;
export type VerifyDoctorInput = z.infer<typeof verifyDoctorSchema>;

