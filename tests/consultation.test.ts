import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import crypto from "crypto";
import app from "../src/app.js";
import { supabaseAdmin } from "../src/lib/supabase.js";
import { evaluateVitalSigns } from "../src/modules/consultations/vitalSignsEvaluator.js";

describe("Consultation & Vital Signs Module Tests", () => {
  const rand = crypto.randomBytes(4).toString("hex");
  const patientEmail = `patient.cons.${rand}@teleheart.com`;
  const otherPatientEmail = `other.patient.${rand}@teleheart.com`;
  const nik = "320101010190" + String(Math.floor(1000 + Math.random() * 9000));

  let patientToken = "";
  let otherPatientToken = "";
  let patientUserId = "";
  let otherPatientUserId = "";
  let createdConsultationId = "";

  beforeAll(async () => {
    // 1. Registrasi & Login Pasien Utama
    const patientReg = await request(app)
      .post("/api/v1/auth/register/patient")
      .send({
        full_name: "Pasien Konsultasi",
        nik: nik,
        birth_date: "1994-06-12",
        gender: "female",
        phone: "08123456789",
        email: patientEmail,
        password: "password123",
        consents: [
          { consent_type: "privacy_policy", version: "1.0" },
          { consent_type: "medical_data_processing", version: "1.0" },
        ],
      });
    patientUserId = patientReg.body?.data?.id;

    const patientLogin = await request(app)
      .post("/api/v1/auth/login")
      .set("X-Client-Platform", "mobile")
      .send({ email: patientEmail, password: "password123" });
    patientToken = patientLogin.body?.data?.access_token;

    // 2. Registrasi Pasien Lain (untuk uji otorisasi)
    const otherReg = await request(app)
      .post("/api/v1/auth/register/patient")
      .send({
        full_name: "Pasien Lain",
        nik: "320101010190" + String(Math.floor(1000 + Math.random() * 9000)),
        birth_date: "1993-01-01",
        gender: "male",
        email: otherPatientEmail,
        password: "password123",
        consents: [
          { consent_type: "privacy_policy", version: "1.0" },
          { consent_type: "medical_data_processing", version: "1.0" },
        ],
      });
    otherPatientUserId = otherReg.body?.data?.id;

    const otherLogin = await request(app)
      .post("/api/v1/auth/login")
      .set("X-Client-Platform", "mobile")
      .send({ email: otherPatientEmail, password: "password123" });
    otherPatientToken = otherLogin.body?.data?.access_token;
  }, 40000);

  afterAll(async () => {
    if (patientUserId) await supabaseAdmin.auth.admin.deleteUser(patientUserId);
    if (otherPatientUserId) await supabaseAdmin.auth.admin.deleteUser(otherPatientUserId);
  });

  describe("Unit Test: Evaluator Tanda Vital (Early Warning System)", () => {
    it("Tanda vital normal tidak memicu status darurat", () => {
      const result = evaluateVitalSigns({
        systolic: 120,
        diastolic: 80,
        heart_rate: 75,
        spo2: 98,
        symptoms: ["fatigue"],
      });

      expect(result.is_emergency).toBe(false);
      expect(result.reasons.length).toBe(0);
      expect(result.emergency_numbers).toContain("119");
    });

    it("Krisis hipertensi (sistolik >= 180 atau diastolik >= 120) memicu status darurat", () => {
      const result = evaluateVitalSigns({
        systolic: 185,
        diastolic: 125,
        heart_rate: 80,
      });

      expect(result.is_emergency).toBe(true);
      expect(result.reasons.some((r) => r.code === "SYSTOLIC_HIGH")).toBe(true);
      expect(result.reasons.some((r) => r.code === "DIASTOLIC_HIGH")).toBe(true);
    });

    it("Gejala red flag (nyeri dada dan pingsan) memicu status darurat", () => {
      const result = evaluateVitalSigns({
        systolic: 120,
        diastolic: 80,
        heart_rate: 80,
        symptoms: ["chest_pain", "fainting"],
      });

      expect(result.is_emergency).toBe(true);
      expect(result.reasons.some((r) => r.code === "SYMPTOM_chest_pain")).toBe(true);
      expect(result.reasons.some((r) => r.code === "SYMPTOM_fainting")).toBe(true);
    });
  });

  describe("Alur Konsultasi & Pengisian Tanda Vital", () => {
    it("POST /api/v1/consultations -> Pasien membuat draft konsultasi baru (201)", async () => {
      const res = await request(app)
        .post("/api/v1/consultations")
        .set("Authorization", `Bearer ${patientToken}`)
        .send({
          complaint: "Dada terasa berdebar sejak tadi pagi",
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toHaveProperty("id");
      expect(res.body.data.status).toBe("draft");
      createdConsultationId = res.body.data.id;
    });

    it("POST /api/v1/consultations/:id/vitals -> Pasien mengisi tanda vital (201)", async () => {
      const res = await request(app)
        .post(`/api/v1/consultations/${createdConsultationId}/vitals`)
        .set("Authorization", `Bearer ${patientToken}`)
        .send({
          systolic: 135,
          diastolic: 85,
          heart_rate: 88,
          spo2: 98,
          symptoms: ["palpitations"],
          notes: "Terasa setelah berolahraga",
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toHaveProperty("vital_id");
      expect(res.body.data).toHaveProperty("emergency");
      expect(res.body.data.emergency.is_emergency).toBe(false);
    });

    it("POST /api/v1/consultations/:id/vitals -> Menolak jika tanda vital dikirim dua kali (409 VITALS_ALREADY_SUBMITTED)", async () => {
      const res = await request(app)
        .post(`/api/v1/consultations/${createdConsultationId}/vitals`)
        .set("Authorization", `Bearer ${patientToken}`)
        .send({
          systolic: 120,
          diastolic: 80,
          heart_rate: 75,
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("VITALS_ALREADY_SUBMITTED");
    });

    it("GET /api/v1/consultations/:id -> Mengambil detail konsultasi beserta tanda vitalnya (200)", async () => {
      const res = await request(app)
        .get(`/api/v1/consultations/${createdConsultationId}`)
        .set("Authorization", `Bearer ${patientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(createdConsultationId);
      expect(res.body.data.complaint).toBe("Dada terasa berdebar sejak tadi pagi");
      expect(res.body.data.vital_signs).toBeDefined();
      expect(res.body.data.vital_signs.systolic).toBe(135);
    });

    it("Pasien lain tidak boleh mengakses konsultasi orang lain (403 FORBIDDEN)", async () => {
      const res = await request(app)
        .get(`/api/v1/consultations/${createdConsultationId}`)
        .set("Authorization", `Bearer ${otherPatientToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("POST /api/v1/consultations/:id/cancel -> Pasien membatalkan konsultasi draft (200)", async () => {
      const res = await request(app)
        .post(`/api/v1/consultations/${createdConsultationId}/cancel`)
        .set("Authorization", `Bearer ${patientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("cancelled");
    });
  });
});

