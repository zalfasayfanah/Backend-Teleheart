import { z } from "zod";

export const createPredictionLogSchema = z.object({
  male: z.boolean().optional().nullable(),
  age: z.coerce.number().int().min(1).max(120).optional().nullable(),
  education: z.coerce.number().int().min(1).max(4).optional().nullable(),
  current_smoker: z.boolean().optional().nullable(),
  cigs_per_day: z.coerce.number().int().min(0).max(100).optional().nullable(),
  bp_meds: z.boolean().optional().nullable(),
  prevalent_stroke: z.boolean().optional().nullable(),
  prevalent_hyp: z.boolean().optional().nullable(),
  diabetes: z.boolean().optional().nullable(),
  total_cholesterol: z.coerce.number().positive().optional().nullable(),
  sys_bp: z.coerce.number().positive().optional().nullable(),
  dia_bp: z.coerce.number().positive().optional().nullable(),
  bmi: z.coerce.number().positive().optional().nullable(),
  heart_rate: z.coerce.number().positive().optional().nullable(),
  glucose: z.coerce.number().positive().optional().nullable(),
  result: z.enum(["at_risk", "not_at_risk"], {
    required_error: "Hasil prediksi (result) wajib diisi ('at_risk' atau 'not_at_risk')",
  }),
  model_version: z.string().max(50).optional().default("v1.0"),
});

export const getPredictionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  page: z.coerce.number().int().min(1).default(1),
});

export type CreatePredictionLogInput = z.infer<typeof createPredictionLogSchema>;
export type GetPredictionsQueryInput = z.infer<typeof getPredictionsQuerySchema>;

