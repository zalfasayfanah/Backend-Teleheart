import { z } from "zod";

export const createConsultationSchema = z.object({
  doctor_id: z.string().uuid().optional(),
  duration_minutes: z.union([z.literal(15), z.literal(30), z.literal(60)]).optional(),
  complaint: z.string().optional(),
  patient_notes: z.string().optional(),
});

export const checkoutSchema = z.object({
  doctor_id: z.string().uuid().optional(),
  duration_minutes: z.union([z.literal(15), z.literal(30), z.literal(60)]).optional(),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;

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

export const closeConsultationSchema = z.object({
  doctor_summary: z.string().optional(),
});

export const rejectConsultationSchema = z.object({
  reason: z.string().optional(),
});

export type CloseConsultationInput = z.infer<typeof closeConsultationSchema>;
export type RejectConsultationInput = z.infer<typeof rejectConsultationSchema>;

