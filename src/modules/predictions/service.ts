import { supabaseAdmin } from "../../lib/supabase.js";
import { AppError } from "../../middleware/errorHandler.js";
import {
  CreatePredictionLogInput,
  GetPredictionsQueryInput,
} from "./schema.js";

export class PredictionService {
  /**
   * Menyimpan kesimpulan hasil prediksi mandiri risiko jantung pasien (dari Flutter on-device ML)
   */
  static async savePrediction(patientId: string, input: CreatePredictionLogInput) {
    const { data, error } = await supabaseAdmin
      .from("prediction_logs")
      .insert({
        patient_id: patientId,
        male: input.male ?? null,
        age: input.age ?? null,
        education: input.education ?? null,
        current_smoker: input.current_smoker ?? null,
        cigs_per_day: input.cigs_per_day ?? null,
        bp_meds: input.bp_meds ?? null,
        prevalent_stroke: input.prevalent_stroke ?? null,
        prevalent_hyp: input.prevalent_hyp ?? null,
        diabetes: input.diabetes ?? null,
        total_cholesterol: input.total_cholesterol ?? null,
        sys_bp: input.sys_bp ?? null,
        dia_bp: input.dia_bp ?? null,
        bmi: input.bmi ?? null,
        heart_rate: input.heart_rate ?? null,
        glucose: input.glucose ?? null,
        result: input.result,
        model_version: input.model_version || "v1.0",
      })
      .select()
      .single();

    if (error || !data) {
      throw new AppError(500, "DATABASE_ERROR", "Gagal menyimpan riwayat prediksi jantung");
    }

    const advice =
      input.result === "at_risk"
        ? "Hasil prediksi mengindikasikan potensi risiko penyakit jantung. Disarankan segera berkonsultasi dengan dokter spesialis jantung TeleHeart."
        : "Hasil prediksi menunjukkan risiko rendah. Tetap pertahankan pola hidup sehat dan kontrol berkala.";

    return {
      ...data,
      recommendation: advice,
    };
  }

  /**
   * Mengambil riwayat prediksi AI mandiri pasien (Hanya pasien bersangkutan yang boleh melihat)
   */
  static async getPatientPredictionHistory(
    patientId: string,
    query: GetPredictionsQueryInput
  ) {
    const { limit, page } = query;
    const offset = (page - 1) * limit;

    const { data, count, error } = await supabaseAdmin
      .from("prediction_logs")
      .select("*", { count: "exact" })
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new AppError(500, "DATABASE_ERROR", "Gagal mengambil riwayat prediksi");
    }

    return {
      history: data || [],
      total: count || 0,
      page,
      limit,
    };
  }
}
