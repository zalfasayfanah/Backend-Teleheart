export interface VitalSignsInput {
  systolic: number;
  diastolic: number;
  heart_rate: number;
  spo2?: number | null;
  symptoms?: string[];
}

export interface EmergencyReason {
  code: string;
  message: string;
}

export interface EarlyWarningResult {
  is_emergency: boolean;
  reasons: EmergencyReason[];
  emergency_numbers: string[];
}

const EMERGENCY_SYMPTOMS_MAP: Record<string, string> = {
  chest_pain: "Nyeri dada",
  severe_shortness_of_breath: "Sesak napas berat",
  fainting: "Pingsan",
  pain_radiating_arm_jaw: "Nyeri menjalar ke lengan/rahang",
};

/**
 * Mengevaluasi Tanda Vital Pasien berdasarkan Ambang Darurat Medis (PRD 7.5 & API.md 5)
 * Backend adalah Single Source of Truth
 */
export function evaluateVitalSigns(vitals: VitalSignsInput): EarlyWarningResult {
  const reasons: EmergencyReason[] = [];

  // 1. Tekanan Darah Tinggi (Krisis Hipertensi)
  if (vitals.systolic >= 180) {
    reasons.push({
      code: "SYSTOLIC_HIGH",
      message: "Tekanan darah sistolik sangat tinggi (krisis hipertensi)",
    });
  }

  if (vitals.diastolic >= 120) {
    reasons.push({
      code: "DIASTOLIC_HIGH",
      message: "Tekanan darah diastolik sangat tinggi (krisis hipertensi)",
    });
  }

  // 2. Tekanan Darah Rendah (Hipotensi)
  if (vitals.systolic < 90) {
    reasons.push({
      code: "SYSTOLIC_LOW",
      message: "Tekanan darah sistolik sangat rendah (hipotensi)",
    });
  }

  // 3. Detak Jantung (Takikardia / Bradikardia)
  if (vitals.heart_rate > 120) {
    reasons.push({
      code: "HR_HIGH",
      message: "Detak jantung sangat cepat (takikardia)",
    });
  } else if (vitals.heart_rate < 40) {
    reasons.push({
      code: "HR_LOW",
      message: "Detak jantung sangat lambat (bradikardia)",
    });
  }

  // 4. Saturasi Oksigen (SpO2)
  if (vitals.spo2 !== undefined && vitals.spo2 !== null && vitals.spo2 < 92) {
    reasons.push({
      code: "SPO2_LOW",
      message: "Saturasi oksigen sangat rendah (hipoksia)",
    });
  }

  // 5. Gejala Memicu Darurat (Red Flag Symptoms)
  if (vitals.symptoms && Array.isArray(vitals.symptoms)) {
    for (const symptom of vitals.symptoms) {
      if (EMERGENCY_SYMPTOMS_MAP[symptom]) {
        reasons.push({
          code: `SYMPTOM_${symptom}`,
          message: EMERGENCY_SYMPTOMS_MAP[symptom],
        });
      }
    }
  }

  const isEmergency = reasons.length > 0;

  return {
    is_emergency: isEmergency,
    reasons,
    emergency_numbers: ["119", "112"],
  };
}

