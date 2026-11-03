import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { supabaseAdmin } from "../src/lib/supabase.js";

describe("Auth Module Integration Tests", () => {
  const timestamp = Date.now();
  const testPatientEmail = `test.patient.${timestamp}@teleheart.com`;
  const testDoctorEmail = `test.doctor.${timestamp}@teleheart.com`;
  const testNik = "337401010190" + String(timestamp).slice(-4);
  const testStr = "STR-" + String(timestamp).slice(-6);

  let patientToken = "";
  let doctorToken = "";
  let createdPatientUserId = "";
  let createdDoctorUserId = "";

  afterAll(async () => {
    // Cleanup data uji coba
    if (createdPatientUserId) {
      await supabaseAdmin.auth.admin.deleteUser(createdPatientUserId);
    }
    if (createdDoctorUserId) {
      await supabaseAdmin.auth.admin.deleteUser(createdDoctorUserId);
    }
  });

  describe("POST /api/v1/auth/register/patient", () => {
    it("Harus gagal jika NIK kurang dari 16 digit atau data tidak lengkap (422)", async () => {
      const res = await request(app)
        .post("/api/v1/auth/register/patient")
        .send({
          full_name: "Budi Santoso",
          nik: "123", // invalid NIK
          birth_date: "1990-01-01",
          gender: "male",
          email: "invalid-email",
          password: "short",
          consents: [],
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(res.body.error.details.length).toBeGreaterThan(0);
    });

    it("Harus berhasil mendaftarkan pasien baru (201)", async () => {
      const res = await request(app)
        .post("/api/v1/auth/register/patient")
        .send({
          full_name: "Budi Pasien Test",
          nik: testNik,
          birth_date: "1990-05-15",
          gender: "male",
          phone: "081234567890",
          email: testPatientEmail,
          password: "password123",
          consents: [
            { consent_type: "privacy_policy", version: "1.0" },
            { consent_type: "medical_data_processing", version: "1.0" },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toHaveProperty("id");
      expect(res.body.data.email).toBe(testPatientEmail);
      expect(res.body.data.role).toBe("patient");
      createdPatientUserId = res.body.data.id;
    });

    it("Harus menolak pendaftaran jika email atau NIK sudah terdaftar (409)", async () => {
      const res = await request(app)
        .post("/api/v1/auth/register/patient")
        .send({
          full_name: "Duplikat Pasien",
          nik: testNik, // NIK sama
          birth_date: "1990-05-15",
          gender: "male",
          email: `duplicate.${testPatientEmail}`,
          password: "password123",
          consents: [
            { consent_type: "privacy_policy", version: "1.0" },
            { consent_type: "medical_data_processing", version: "1.0" },
          ],
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("NIK_TAKEN");
    });
  });

  describe("POST /api/v1/auth/register/doctor", () => {
    it("Harus berhasil mendaftarkan dokter baru dengan status pending (201)", async () => {
      const res = await request(app)
        .post("/api/v1/auth/register/doctor")
        .send({
          full_name: "dr. Siti Kardiologi",
          email: testDoctorEmail,
          password: "password123",
          str_number: testStr,
          sip_number: "SIP-456789",
          specialization: "Spesialis Jantung",
          workplace: "RS Harapan Sehat",
          consents: [
            { consent_type: "privacy_policy", version: "1.0" },
            { consent_type: "medical_data_processing", version: "1.0" },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.role).toBe("doctor");
      expect(res.body.data.verification_status).toBe("pending");
      createdDoctorUserId = res.body.data.id;
    });
  });

  describe("POST /api/v1/auth/login", () => {
    it("Harus gagal login jika header X-Client-Platform tidak dikirim (400)", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: testPatientEmail,
          password: "password123",
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_PLATFORM");
    });

    it("Pasien harus ditolak login jika menggunakan platform web (403 WRONG_PLATFORM)", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .set("X-Client-Platform", "web")
        .send({
          email: testPatientEmail,
          password: "password123",
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("WRONG_PLATFORM");
    });

    it("Dokter harus ditolak login jika menggunakan platform mobile (403 WRONG_PLATFORM)", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .set("X-Client-Platform", "mobile")
        .send({
          email: testDoctorEmail,
          password: "password123",
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("WRONG_PLATFORM");
    });

    it("Pasien berhasil login dengan platform mobile (200)", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .set("X-Client-Platform", "mobile")
        .send({
          email: testPatientEmail,
          password: "password123",
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty("access_token");
      expect(res.body.data).toHaveProperty("refresh_token");
      expect(res.body.data.user.role).toBe("patient");

      patientToken = res.body.data.access_token;
    });

    it("Dokter berhasil login dengan platform web dan membawa verification_status (200)", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .set("X-Client-Platform", "web")
        .send({
          email: testDoctorEmail,
          password: "password123",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.user.role).toBe("doctor");
      expect(res.body.data.doctor_verification_status).toBe("pending");

      doctorToken = res.body.data.access_token;
    });
  });

  describe("GET /api/v1/auth/me & GET /api/v1/me", () => {
    it("Harus ditolak 401 jika tanpa Authorization header", async () => {
      const res = await request(app).get("/api/v1/auth/me");
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
    });

    it("Pasien dapat membaca info akun miliknya sendiri dengan Bearer token (200)", async () => {
      const res = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${patientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.email).toBe(testPatientEmail);
      expect(res.body.data.role).toBe("patient");
    });

    it("Dokter dapat membaca info akun miliknya sendiri di /api/v1/me (200)", async () => {
      const res = await request(app)
        .get("/api/v1/me")
        .set("Authorization", `Bearer ${doctorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.email).toBe(testDoctorEmail);
      expect(res.body.data.role).toBe("doctor");
      expect(res.body.data.doctor_verification_status).toBe("pending");
    });
  });
});

