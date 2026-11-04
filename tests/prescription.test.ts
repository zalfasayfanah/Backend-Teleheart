import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import crypto from "crypto";
import app from "../src/app.js";
import { supabaseAdmin } from "../src/lib/supabase.js";
import { env } from "../src/config/env.js";

describe("Prescription & Digital PDF Module Tests (Fase 9)", () => {
  const rand = crypto.randomBytes(4).toString("hex");
  const patientEmail = `rx.pat.${rand}@teleheart.com`;
  const doctorEmail = `rx.doc.${rand}@teleheart.com`;
  const strangerEmail = `rx.stranger.${rand}@teleheart.com`;

  let patientToken = "";
  let doctorToken = "";
  let strangerToken = "";

  let patientUserId = "";
  let doctorUserId = "";
  let strangerUserId = "";

  let consultationId = "";
  let prescriptionId = "";
  let verificationCode = "";

  beforeAll(async () => {
    // 1. Registrasi & Login Pasien
    const patReg = await request(app)
      .post("/api/v1/auth/register/patient")
      .send({
        full_name: "Ahmad Dani Pasien",
        nik: "320101010190" + String(Math.floor(1000 + Math.random() * 9000)),
        birth_date: "1988-05-12",
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
        full_name: "dr. Budi Santoso, Sp.JP(K)",
        str_number: "STR-RX-" + rand,
        sip_number: "SIP-503/01/RX/" + rand,
        specialization: "Spesialis Jantung dan Pembuluh Darah",
        workplace: "Klinik Jantung Utama TeleHeart",
        email: doctorEmail,
        password: "password123",
        consents: [
          { consent_type: "privacy_policy", version: "1.0" },
          { consent_type: "medical_data_processing", version: "1.0" },
        ],
      });
    doctorUserId = docReg.body?.data?.id;

    await supabaseAdmin
      .from("doctor_profiles")
      .update({ verification_status: "approved", is_online: true })
      .eq("user_id", doctorUserId);

    const docLogin = await request(app)
      .post("/api/v1/auth/login")
      .set("X-Client-Platform", "web")
      .send({ email: doctorEmail, password: "password123" });
    doctorToken = docLogin.body?.data?.access_token;

    // Set tarif dokter
    await request(app)
      .put("/api/v1/doctors/me/tariffs")
      .set("Authorization", `Bearer ${doctorToken}`)
      .send({
        tariffs: [
          { duration_minutes: 15, price: 50000 },
          { duration_minutes: 30, price: 90000 },
        ],
      });

    // 3. Registrasi Pasien Asing (Uji Otorisasi)
    const strReg = await request(app)
      .post("/api/v1/auth/register/patient")
      .send({
        full_name: "Orang Asing",
        nik: "320101010190" + String(Math.floor(1000 + Math.random() * 9000)),
        birth_date: "1995-01-01",
        gender: "female",
        email: strangerEmail,
        password: "password123",
        consents: [
          { consent_type: "privacy_policy", version: "1.0" },
          { consent_type: "medical_data_processing", version: "1.0" },
        ],
      });
    strangerUserId = strReg.body?.data?.id;

    const strLogin = await request(app)
      .post("/api/v1/auth/login")
      .set("X-Client-Platform", "mobile")
      .send({ email: strangerEmail, password: "password123" });
    strangerToken = strLogin.body?.data?.access_token;

    // 4. Buat Konsultasi Aktif (Draft -> Vitals -> Checkout -> Webhook -> Accept)
    const cRes = await request(app)
      .post("/api/v1/consultations")
      .set("Authorization", `Bearer ${patientToken}`)
      .send({ doctor_id: doctorUserId, duration_minutes: 15 });
    consultationId = cRes.body.data.id;

    await request(app)
      .post(`/api/v1/consultations/${consultationId}/vitals`)
      .set("Authorization", `Bearer ${patientToken}`)
      .send({ systolic: 130, diastolic: 85, heart_rate: 78 });

    const payRes = await request(app)
      .post(`/api/v1/consultations/${consultationId}/checkout`)
      .set("Authorization", `Bearer ${patientToken}`)
      .send({ doctor_id: doctorUserId, duration_minutes: 15 });

    await request(app)
      .post(`/api/v1/webhooks/mayar?token=${env.MAYAR_WEBHOOK_SECRET}`)
      .send({
        event: "payment.received",
        data: {
          productId: payRes.body.data.mayar_invoice_id,
          status: "SUCCESS",
          extraData: { consultationId },
        },
      });

    // Dokter menerima sesi konsultasi -> Status: active
    await request(app)
      .post(`/api/v1/consultations/${consultationId}/accept`)
      .set("Authorization", `Bearer ${doctorToken}`);
  }, 60000);

  afterAll(async () => {
    if (patientUserId) await supabaseAdmin.auth.admin.deleteUser(patientUserId);
    if (doctorUserId) await supabaseAdmin.auth.admin.deleteUser(doctorUserId);
    if (strangerUserId) await supabaseAdmin.auth.admin.deleteUser(strangerUserId);
  });

  describe("Pembuatan & Penyimpanan Draft Resep (POST /consultations/:id/prescription)", () => {
    it("Pasien ditolak saat mencoba membuat draft resep (403 FORBIDDEN)", async () => {
      const res = await request(app)
        .post(`/api/v1/consultations/${consultationId}/prescription`)
        .set("Authorization", `Bearer ${patientToken}`)
        .send({
          items: [
            {
              medicine_name: "Bisoprolol 2.5mg",
              instructions: "1x sehari pagi hari",
              quantity: "30 tablet",
            },
          ],
        });

      expect(res.status).toBe(403);
    });

    it("Orang asing ditolak saat mencoba membuat draft resep (403 FORBIDDEN)", async () => {
      const res = await request(app)
        .post(`/api/v1/consultations/${consultationId}/prescription`)
        .set("Authorization", `Bearer ${strangerToken}`)
        .send({
          items: [
            {
              medicine_name: "Bisoprolol 2.5mg",
              instructions: "1x sehari pagi hari",
              quantity: "30 tablet",
            },
          ],
        });

      expect(res.status).toBe(403);
    });

    it("Menolak pembuatan draft resep jika daftar obat kosong (422)", async () => {
      const res = await request(app)
        .post(`/api/v1/consultations/${consultationId}/prescription`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .send({
          notes: "Tanpa obat",
          items: [],
        });

      expect(res.status).toBe(422);
    });

    it("Dokter penanggung jawab berhasil menyimpan draft resep obat (201)", async () => {
      const res = await request(app)
        .post(`/api/v1/consultations/${consultationId}/prescription`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .send({
          notes: "Minum obat secara teratur, hindari makanan tinggi lemak jenuh.",
          items: [
            {
              medicine_name: "Atorvastatin 20mg",
              dosage: "20 mg",
              instructions: "1x sehari 1 tablet malam hari sesudah makan",
              quantity: "30 tablet",
              notes: "Evaluasi profil lipid setelah 1 bulan",
            },
            {
              medicine_name: "Aspirin (Cardioaspirin) 80mg",
              dosage: "80 mg",
              instructions: "1x sehari 1 tablet sesudah makan pagi",
              quantity: "30 tablet",
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.status).toBe("draft");
      expect(res.body.data.items).toHaveLength(2);

      prescriptionId = res.body.data.id;
    });

    it("Dokter penanggung jawab dapat memperbarui draft resep (201)", async () => {
      const res = await request(app)
        .post(`/api/v1/consultations/${consultationId}/prescription`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .send({
          notes: "Catatan diperbarui: kontrol tensi berkala setiap pagi.",
          items: [
            {
              medicine_name: "Atorvastatin 40mg",
              dosage: "40 mg",
              instructions: "1x sehari 1 tablet malam hari sesudah makan",
              quantity: "30 tablet",
              notes: "Dosis ditingkatkan",
            },
            {
              medicine_name: "Bisoprolol 2.5mg",
              dosage: "2.5 mg",
              instructions: "1x sehari 1 tablet pagi hari",
              quantity: "30 tablet",
            },
            {
              medicine_name: "Cardioaspirin 80mg",
              dosage: "80 mg",
              instructions: "1x sehari 1 tablet sesudah makan",
              quantity: "30 tablet",
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBe(prescriptionId);
      expect(res.body.data.items).toHaveLength(3);
    });
  });

  describe("Detail Resep (GET /consultations/:id/prescription)", () => {
    it("Dokter penanggung jawab dapat mengambil detail resep (200)", async () => {
      const res = await request(app)
        .get(`/api/v1/consultations/${consultationId}/prescription`)
        .set("Authorization", `Bearer ${doctorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(prescriptionId);
      expect(res.body.data.status).toBe("draft");
      expect(res.body.data.prescription_items).toHaveLength(3);
    });

    it("Pasien bersangkutan dapat melihat draft resep (200)", async () => {
      const res = await request(app)
        .get(`/api/v1/consultations/${consultationId}/prescription`)
        .set("Authorization", `Bearer ${patientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(prescriptionId);
    });

    it("Orang asing dilarang melihat resep (403 FORBIDDEN)", async () => {
      const res = await request(app)
        .get(`/api/v1/consultations/${consultationId}/prescription`)
        .set("Authorization", `Bearer ${strangerToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe("Penerbitan Resep Resmi & PDF (POST /consultations/:id/prescription/issue)", () => {
    it("Pasien ditolak saat mencoba menerbitkan resep (403 FORBIDDEN)", async () => {
      const res = await request(app)
        .post(`/api/v1/consultations/${consultationId}/prescription/issue`)
        .set("Authorization", `Bearer ${patientToken}`);

      expect(res.status).toBe(403);
    });

    it("Dokter penanggung jawab berhasil menerbitkan resep obat resmi (200)", async () => {
      const res = await request(app)
        .post(`/api/v1/consultations/${consultationId}/prescription/issue`)
        .set("Authorization", `Bearer ${doctorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("issued");
      expect(res.body.data.issued_at).toBeDefined();
      expect(res.body.data.verification_code).toMatch(/^TH-RX-/);
      expect(res.body.data.pdf_path).toContain(consultationId);
      expect(res.body.data.download_url).toBeDefined();

      verificationCode = res.body.data.verification_code;
    });

    it("Menolak perubahan draft pada resep yang sudah issued (400 PRESCRIPTION_ALREADY_ISSUED)", async () => {
      const res = await request(app)
        .post(`/api/v1/consultations/${consultationId}/prescription`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .send({
          items: [
            {
              medicine_name: "Obat Tambahan 10mg",
              instructions: "1x1",
              quantity: "10 tab",
            },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("PRESCRIPTION_ALREADY_ISSUED");
    });

    it("Menolak penerbitan ulang resep yang sudah issued (400 PRESCRIPTION_ALREADY_ISSUED)", async () => {
      const res = await request(app)
        .post(`/api/v1/consultations/${consultationId}/prescription/issue`)
        .set("Authorization", `Bearer ${doctorToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("PRESCRIPTION_ALREADY_ISSUED");
    });
  });

  describe("Unduh Dokumen PDF Resep (GET /prescriptions/:id/download)", () => {
    it("Pasien dapat mengambil link unduh dokumen PDF resep bertanda tangan (200)", async () => {
      const res = await request(app)
        .get(`/api/v1/prescriptions/${prescriptionId}/download`)
        .set("Authorization", `Bearer ${patientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.download_url).toBeDefined();
      expect(res.body.data.download_url).toContain("token=");
      expect(res.body.data.verification_code).toBe(verificationCode);
      expect(res.body.data.file_name).toBe(`Resep_TeleHeart_${verificationCode}.pdf`);
    });

    it("Orang asing dilarang mengunduh dokumen resep (403 FORBIDDEN)", async () => {
      const res = await request(app)
        .get(`/api/v1/prescriptions/${prescriptionId}/download`)
        .set("Authorization", `Bearer ${strangerToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe("Verifikasi Publik Keaslian Resep (GET /public/prescriptions/verify/:code)", () => {
    it("Publik/Apotek dapat memverifikasi keaslian resep secara terbuka tanpa login (200)", async () => {
      const res = await request(app)
        .get(`/api/v1/public/prescriptions/verify/${verificationCode}`);

      expect(res.status).toBe(200);
      expect(res.body.data.is_valid).toBe(true);
      expect(res.body.data.verification_code).toBe(verificationCode);
      expect(res.body.data.doctor.name).toContain("dr. Budi Santoso");
      expect(res.body.data.doctor.sip_number).toContain("SIP-503");
      expect(res.body.data.patient.name).toBe("Ahmad Dani Pasien");
      expect(res.body.data.items).toHaveLength(3);
      expect(res.body.data.items[0].medicine_name).toBe("Atorvastatin 40mg");
    });

    it("Menolak kode verifikasi palsu yang tidak ada di database (404 PRESCRIPTION_NOT_FOUND)", async () => {
      const res = await request(app)
        .get("/api/v1/public/prescriptions/verify/TH-RX-FAKE-CODE-9999");

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("PRESCRIPTION_NOT_FOUND");
    });
  });
});
