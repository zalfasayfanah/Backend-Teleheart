import { z } from "zod";

export const createConsultationSchema = z.object({
  complaint: z.string().optional(),
});

export const submitVitalsSchema = z.object({
  systolic: z.coerce.number().int().min(40, "Sistolik minimal 40").max(300, "Sistolik maksimal 300"),
  diastolic: z.coerce.number().int().min(30, "Diastolik minimal 30").max(200, "Diastolik maksimal 200"),
  heart_rate: z.coerce.number().int().min(30, "Detak jantung minimal 30").max(250, "Detak jantung maksimal 250"),
  spo2: z.coerce.number().int().min(50).max(100).optional(),
  weight_kg: z.coerce.number().min(1).max(500).optional(),
  height_cm: z.coerce.number().min(30).max(300).optional(),
  temperature_c: z.coerce.number().min(30).max(45).optional(),
  symptoms: z.array(z.string()).optional().default([]),
  notes: z.string().optional(),
  measured_at: z.string().optional(),
});

export type CreateConsultationInput = z.infer<typeof createConsultationSchema>;
export type SubmitVitalsInput = z.infer<typeof submitVitalsSchema>;

