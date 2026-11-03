import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { supabaseAdmin } from "../src/lib/supabase.js";

describe("Patient Module Integration Tests", () => {
  const timestamp = Date.now();
  const patientEmail = `patient.profile.${timestamp}@teleheart.com`;
  const doctorEmail = `doctor.profile.${timestamp}@teleheart.com`;
  const nik = "320101010190" + String(timestamp).slice(-4);

  let patientToken = "";
  let doctorToken = "";
  let patientUserId = "";
  let doctorUserId = "";

  let createdHistoryId = "";
  let createdMedicationId = "";
  let createdAllergyId = "";

  beforeAll(async () => {
    const patientReg = await request(app)
      .post("/api/v1/auth/register/patient")
      .send({
        full_name: "Budi Pasien Profil",
        nik: nik,
        birth_date: "1992-08-20",
        gender: "male",
        phone: "081999888777",
        email: patientEmail,
        password: "password123",
        has_prior_hospital_checkup: false,
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

    const docReg = await request(app)
      .post("/api/v1/auth/register/doctor")
      .send({
        full_name: "dr. Hartono",
        email: doctorEmail,
        password: "password123",
        str_number: "STR-" + String(timestamp).slice(-6),
        sip_number: "SIP-999888",
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
  }, 40000);

  afterAll(async () => {
    if (patientUserId) await supabaseAdmin.auth.admin.deleteUser(patientUserId);
    if (doctorUserId) await supabaseAdmin.auth.admin.deleteUser(doctorUserId);
  });

  describe("GET /api/v1/patients/me/profile", () => {
    it("Harus mengembalikan profil pasien dengan NIK ter-masking (200)", async () => {
      const res = await request(app)
        .get("/api/v1/patients/me/profile")
        .set("Authorization", `Bearer ${patientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty("full_name", "Budi Pasien Profil");
      expect(res.body.data).toHaveProperty("nik_masked");
      expect(res.body.data.nik_masked.startsWith("************")).toBe(true);
      expect(res.body.data.nik_masked.slice(-4)).toBe(nik.slice(-4));
      expect(res.body.data.birth_date).toBe("1992-08-20");
      expect(res.body.data.gender).toBe("male");
      expect(res.body.data.phone).toBe("081999888777");
      expect(res.body.data).toHaveProperty("medical_histories");
      expect(res.body.data).toHaveProperty("medications");
      expect(res.body.data).toHaveProperty("allergies");
    });
  });

  describe("PUT /api/v1/patients/me/profile", () => {
    it("Harus berhasil memperbarui nomor HP dan status pernah periksa ke RS (200)", async () => {
      const res = await request(app)
        .put("/api/v1/patients/me/profile")
        .set("Authorization", `Bearer ${patientToken}`)
        .send({
          phone: "081223344556",
          has_prior_hospital_checkup: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.phone).toBe("081223344556");
      expect(res.body.data.has_prior_hospital_checkup).toBe(true);
    });
  });

  describe("Sublist CRUD: Riwayat Penyakit (Medical Histories)", () => {
    it("POST /api/v1/patients/me/medical-histories -> Tambah riwayat penyakit (201)", async () => {
      const res = await request(app)
        .post("/api/v1/patients/me/medical-histories")
        .set("Authorization", `Bearer ${patientToken}`)
        .send({
          condition_name: "Hipertensi Derajat 1",
          diagnosed_year: 2022,
          notes: "Rutin kontrol tiap 3 bulan",
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toHaveProperty("id");
      expect(res.body.data.condition_name).toBe("Hipertensi Derajat 1");
      createdHistoryId = res.body.data.id;
    });

    it("GET /api/v1/patients/me/medical-histories -> Ambil riwayat penyakit (200)", async () => {
      const res = await request(app)
        .get("/api/v1/patients/me/medical-histories")
        .set("Authorization", `Bearer ${patientToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.some((h: any) => h.id === createdHistoryId)).toBe(true);
    });

    it("PUT /api/v1/patients/me/medical-histories/:id -> Ubah riwayat penyakit (200)", async () => {
      const res = await request(app)
        .put(`/api/v1/patients/me/medical-histories/${createdHistoryId}`)
        .set("Authorization", `Bearer ${patientToken}`)
        .send({
          condition_name: "Hipertensi Terkontrol",
          notes: "Tekanan darah stabil",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.condition_name).toBe("Hipertensi Terkontrol");
      expect(res.body.data.notes).toBe("Tekanan darah stabil");
    });
  });

  describe("Sublist CRUD: Obat Rutin (Medications)", () => {
    it("POST /api/v1/patients/me/medications -> Tambah obat rutin (201)", async () => {
      const res = await request(app)
        .post("/api/v1/patients/me/medications")
        .set("Authorization", `Bearer ${patientToken}`)
        .send({
          medicine_name: "Amlodipine",
          dosage: "5 mg",
          frequency: "1x sehari pagi",
        });

      expect(res.status).toBe(201);
      expect(res.body.data.medicine_name).toBe("Amlodipine");
      createdMedicationId = res.body.data.id;
    });

    it("GET /api/v1/patients/me/medications -> Ambil daftar obat rutin (200)", async () => {
      const res = await request(app)
        .get("/api/v1/patients/me/medications")
        .set("Authorization", `Bearer ${patientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.some((m: any) => m.id === createdMedicationId)).toBe(true);
    });
  });

  describe("Sublist CRUD: Alergi (Allergies)", () => {
    it("POST /api/v1/patients/me/allergies -> Tambah alergi (201)", async () => {
      const res = await request(app)
        .post("/api/v1/patients/me/allergies")
        .set("Authorization", `Bearer ${patientToken}`)
        .send({
          allergen: "Penisilin",
          reaction: "Gatal-gatal dan ruam merah",
        });

      expect(res.status).toBe(201);
      expect(res.body.data.allergen).toBe("Penisilin");
      createdAllergyId = res.body.data.id;
    });

    it("GET /api/v1/patients/me/allergies -> Ambil daftar alergi (200)", async () => {
      const res = await request(app)
        .get("/api/v1/patients/me/allergies")
        .set("Authorization", `Bearer ${patientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.some((a: any) => a.id === createdAllergyId)).toBe(true);
    });
  });

  describe("Keamanan & Hak Akses Dokter", () => {
    it("Dokter mengakses profil pasien tanpa penugasan konsultasi harus ditolak 403 FORBIDDEN", async () => {
      const res = await request(app)
        .get(`/api/v1/patients/${patientUserId}/profile`)
        .set("Authorization", `Bearer ${doctorToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("Pasien mengakses endpoint dokter harus ditolak 403 FORBIDDEN", async () => {
      const res = await request(app)
        .get(`/api/v1/patients/${patientUserId}/profile`)
        .set("Authorization", `Bearer ${patientToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });
  });
});
