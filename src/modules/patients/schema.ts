import { z } from "zod";

export const updatePatientProfileSchema = z.object({
  phone: z.string().optional(),
  has_prior_hospital_checkup: z.boolean().optional(),
});

export const createMedicalHistorySchema = z.object({
  condition_name: z.string().min(1, "Nama kondisi/penyakit wajib diisi"),
  diagnosed_year: z.coerce.number().int().min(1900).max(new Date().getFullYear()).optional(),
  notes: z.string().optional(),
});

export const updateMedicalHistorySchema = z.object({
  condition_name: z.string().min(1, "Nama kondisi/penyakit wajib diisi").optional(),
  diagnosed_year: z.coerce.number().int().min(1900).max(new Date().getFullYear()).optional(),
  notes: z.string().optional(),
});

export const createMedicationSchema = z.object({
  medicine_name: z.string().min(1, "Nama obat wajib diisi"),
  dosage: z.string().optional(),
  frequency: z.string().optional(),
});

export const updateMedicationSchema = z.object({
  medicine_name: z.string().min(1, "Nama obat wajib diisi").optional(),
  dosage: z.string().optional(),
  frequency: z.string().optional(),
});

export const createAllergySchema = z.object({
  allergen: z.string().min(1, "Nama alergen wajib diisi"),
  reaction: z.string().optional(),
});

export const updateAllergySchema = z.object({
  allergen: z.string().min(1, "Nama alergen wajib diisi").optional(),
  reaction: z.string().optional(),
});

export type UpdatePatientProfileInput = z.infer<typeof updatePatientProfileSchema>;
export type CreateMedicalHistoryInput = z.infer<typeof createMedicalHistorySchema>;
export type UpdateMedicalHistoryInput = z.infer<typeof updateMedicalHistorySchema>;
export type CreateMedicationInput = z.infer<typeof createMedicationSchema>;
export type UpdateMedicationInput = z.infer<typeof updateMedicationSchema>;
export type CreateAllergyInput = z.infer<typeof createAllergySchema>;
export type UpdateAllergyInput = z.infer<typeof updateAllergySchema>;

