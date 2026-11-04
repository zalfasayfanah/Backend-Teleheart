import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import crypto from "crypto";
import app from "../src/app.js";
import { supabaseAdmin } from "../src/lib/supabase.js";

describe("Heart Risk Prediction Logs Module Tests (Fase 10)", () => {
  const rand = crypto.randomBytes(4).toString("hex");
  const patientEmail = `pred.pat.${rand}@teleheart.com`;
  const doctorEmail = `pred.doc.${rand}@teleheart.com`;

  let patientToken = "";
  let doctorToken = "";
  let patientUserId = "";
  let doctorUserId = "";

  beforeAll(async () => {
    // 1. Registrasi & Login Pasien
    const patReg = await request(app)
      .post("/api/v1/auth/register/patient")
      .send({
        full_name: "Pasien Prediksi Jantung",
        nik: "320101010190" + String(Math.floor(1000 + Math.random() * 9000)),
        birth_date: "1980-04-10",
        gender: "male",
        email: patientEmail,
        password: "password123",
        consents: [
          { consent_type: "privacy_policy", version: "1.0" },
          { consent_type: "medical_data_processing", version: "1.0" },
        ],
      });
    patientUserId = patReg.body?.data?.id;

    const patLogin = await request(app)
      .post("/api/v1/auth/login")
      .set("X-Client-Platform", "mobile")
      .send({ email: patientEmail, password: "password123" });
    patientToken = patLogin.body?.data?.access_token;

    // 2. Registrasi & Login Dokter
    const docReg = await request(app)
      .post("/api/v1/auth/register/doctor")
      .send({
        full_name: "dr. Jantung Sehat",
        str_number: "STR-PRED-" + rand,
        sip_number: "SIP-PRED-" + rand,
        specialization: "Spesialis Jantung",
        workplace: "RS Harapan",
        email: doctorEmail,
        password: "password123",
        consents: [
          { consent_type: "privacy_policy", version: "1.0" },
          { consent_type: "medical_data_processing", version: "1.0" },
        ],
      });
    doctorUserId = docReg.body?.data?.id;

    const docLogin = await request(app)
      .post("/api/v1/auth/login")
      .set("X-Client-Platform", "web")
      .send({ email: doctorEmail, password: "password123" });
    doctorToken = docLogin.body?.data?.access_token;
  });

  afterAll(async () => {
    if (patientUserId) await supabaseAdmin.auth.admin.deleteUser(patientUserId);
    if (doctorUserId) await supabaseAdmin.auth.admin.deleteUser(doctorUserId);
  });

  describe("Penyimpanan Log Prediksi Mandiri (POST /predictions)", () => {
    it("Menolak jika parameter 'result' kosong (422)", async () => {
      const res = await request(app)
        .post("/api/v1/predictions")
        .set("Authorization", `Bearer ${patientToken}`)
        .send({
          age: 45,
          sys_bp: 140,
        });

      expect(res.status).toBe(422);
    });

    it("Menolak jika pengguna yang memanggil adalah dokter (403 FORBIDDEN)", async () => {
      const res = await request(app)
        .post("/api/v1/predictions")
        .set("Authorization", `Bearer ${doctorToken}`)
        .send({
          result: "at_risk",
          age: 45,
        });

      expect(res.status).toBe(403);
    });

    it("Pasien berhasil menyimpan log prediksi risiko jantung dengan hasil 'at_risk' (201)", async () => {
      const res = await request(app)
        .post("/api/v1/predictions")
        .set("Authorization", `Bearer ${patientToken}`)
        .send({
          male: true,
          age: 46,
          education: 3,
          current_smoker: true,
          cigs_per_day: 15,
          bp_meds: false,
          prevalent_stroke: false,
          prevalent_hyp: true,
          diabetes: false,
          total_cholesterol: 245.5,
          sys_bp: 145.0,
          dia_bp: 92.0,
          bmi: 27.8,
          heart_rate: 82.0,
          glucose: 105.0,
          result: "at_risk",
          model_version: "v1.0-flutter-tflite",
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.patient_id).toBe(patientUserId);
      expect(res.body.data.result).toBe("at_risk");
      expect(res.body.data.recommendation).toContain("potensi risiko penyakit jantung");
    });

    it("Pasien berhasil menyimpan log prediksi dengan hasil 'not_at_risk' (201)", async () => {
      const res = await request(app)
        .post("/api/v1/predictions")
        .set("Authorization", `Bearer ${patientToken}`)
        .send({
          male: true,
          age: 28,
          current_smoker: false,
          sys_bp: 115.0,
          dia_bp: 75.0,
          bmi: 22.1,
          result: "not_at_risk",
        });

      expect(res.status).toBe(201);
      expect(res.body.data.result).toBe("not_at_risk");
      expect(res.body.data.recommendation).toContain("risiko rendah");
    });
  });

  describe("Akses Riwayat Prediksi Mandiri (GET /predictions/my-history)", () => {
    it("Pasien dapat melihat riwayat prediksi risiko jantung miliknya (200)", async () => {
      const res = await request(app)
        .get("/api/v1/predictions/my-history?limit=10")
        .set("Authorization", `Bearer ${patientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
      expect(res.body.meta?.total).toBeGreaterThanOrEqual(2);
    });

    it("Dokter dilarang keras mengakses riwayat prediksi mandiri pasien (403 FORBIDDEN)", async () => {
      const res = await request(app)
        .get("/api/v1/predictions/my-history")
        .set("Authorization", `Bearer ${doctorToken}`);

      expect(res.status).toBe(403);
    });
  });
});

