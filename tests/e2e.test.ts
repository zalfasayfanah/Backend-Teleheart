import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import crypto from "crypto";
import app from "../src/app.js";
import { supabaseAdmin } from "../src/lib/supabase.js";
import { env } from "../src/config/env.js";

describe("TeleHeart Full End-to-End (E2E) Integration & Security Test Suite (Fase 12)", () => {
  const rand = crypto.randomBytes(4).toString("hex");

  // Email identitas pengujian
  const patientEmailA = `e2e.pat.a.${rand}@teleheart.com`;
  const patientEmailB = `e2e.pat.b.${rand}@teleheart.com`;
  const doctorEmail = `e2e.doc.${rand}@teleheart.com`;
  const pendingDocEmail = `e2e.doc.pending.${rand}@teleheart.com`;
  const adminEmail = "admin@teleheart.com";

  // Tokens & User IDs
  let patientTokenA = "";
  let patientUserIdA = "";
  let patientTokenB = "";
  let patientUserIdB = "";

  let doctorToken = "";
  let doctorUserId = "";
  let pendingDocToken = "";
  let pendingDocUserId = "";

  let adminToken = "";

  // Data Aliran Konsultasi
  let consultationId = "";
  let mayarInvoiceId = "";
  let patientMessageId = "";
  let prescriptionId = "";
  let verificationCode = "";

  beforeAll(async () => {
    // 1. Registrasi & Login Pasien A (Happy Path Patient)
    const patRegA = await request(app)
      .post("/api/v1/auth/register/patient")
      .send({
        full_name: "Ahmad Pasien E2E",
        nik: "320101010190" + String(Math.floor(1000 + Math.random() * 9000)),
        birth_date: "1992-05-10",
        gender: "male",
        email: patientEmailA,
        password: "password123",
        consents: [
          { consent_type: "privacy_policy", version: "1.0" },
          { consent_type: "medical_data_processing", version: "1.0" },
        ],
      });
    patientUserIdA = patRegA.body?.data?.id;

    const patLoginA = await request(app)
      .post("/api/v1/auth/login")
      .set("X-Client-Platform", "mobile")
      .send({ email: patientEmailA, password: "password123" });
    patientTokenA = patLoginA.body?.data?.access_token;

    // 2. Registrasi & Login Pasien B (Negative Test Attacker)
    const patRegB = await request(app)
      .post("/api/v1/auth/register/patient")
      .send({
        full_name: "Budi Pasien Asing E2E",
        nik: "320101010190" + String(Math.floor(1000 + Math.random() * 9000)),
        birth_date: "1995-08-20",
        gender: "male",
        email: patientEmailB,
        password: "password123",
        consents: [
          { consent_type: "privacy_policy", version: "1.0" },
          { consent_type: "medical_data_processing", version: "1.0" },
        ],
      });
    patientUserIdB = patRegB.body?.data?.id;

    const patLoginB = await request(app)
      .post("/api/v1/auth/login")
      .set("X-Client-Platform", "mobile")
      .send({ email: patientEmailB, password: "password123" });
    patientTokenB = patLoginB.body?.data?.access_token;

    // 3. Registrasi & Aktivasi Dokter Spesialis Jantung (Approved)
    const docReg = await request(app)
      .post("/api/v1/auth/register/doctor")
      .send({
        full_name: "dr. Sp.JP Kardio E2E",
        str_number: "STR-E2E-" + rand,
        sip_number: "SIP-E2E-" + rand,
        specialization: "Spesialis Jantung dan Pembuluh Darah",
        workplace: "Pusat Jantung Nasional",
        email: doctorEmail,
        password: "password123",
        consents: [
          { consent_type: "privacy_policy", version: "1.0" },
          { consent_type: "medical_data_processing", version: "1.0" },
        ],
      });
    doctorUserId = docReg.body?.data?.id;

    // Setujui akun dokter & aktifkan online di DB
    await supabaseAdmin
      .from("doctor_profiles")
      .update({ verification_status: "approved", is_online: true })
      .eq("user_id", doctorUserId);

    const docLogin = await request(app)
      .post("/api/v1/auth/login")
      .set("X-Client-Platform", "web")
      .send({ email: doctorEmail, password: "password123" });
    doctorToken = docLogin.body?.data?.access_token;

    // Atur tarif dokter
    await request(app)
      .put("/api/v1/doctors/me/tariffs")
      .set("Authorization", `Bearer ${doctorToken}`)
      .send({
        tariffs: [
          { duration_minutes: 15, price: 50000 },
          { duration_minutes: 30, price: 90000 },
        ],
      });

    // 4. Registrasi Dokter Belum Diverifikasi (Pending Status)
    const pendingReg = await request(app)
      .post("/api/v1/auth/register/doctor")
      .send({
        full_name: "dr. Belum Terverifikasi",
        str_number: "STR-PEND-" + rand,
        sip_number: "SIP-PEND-" + rand,
        specialization: "Dokter Umum",
        workplace: "Klinik Pratama",
        email: pendingDocEmail,
        password: "password123",
        consents: [
          { consent_type: "privacy_policy", version: "1.0" },
          { consent_type: "medical_data_processing", version: "1.0" },
        ],
      });
    pendingDocUserId = pendingReg.body?.data?.id;

    const pendingLogin = await request(app)
      .post("/api/v1/auth/login")
      .set("X-Client-Platform", "web")
      .send({ email: pendingDocEmail, password: "password123" });
    pendingDocToken = pendingLogin.body?.data?.access_token;

    // 5. Login Admin Permanen
    const adminLogin = await request(app)
      .post("/api/v1/auth/login")
      .set("X-Client-Platform", "web")
      .send({ email: adminEmail, password: "AdminTeleheart2026!" });
    adminToken = adminLogin.body?.data?.access_token;
  }, 60000);

  afterAll(async () => {
    // Bersihkan user pengujian dinamis dari database
    if (patientUserIdA) await supabaseAdmin.auth.admin.deleteUser(patientUserIdA);
    if (patientUserIdB) await supabaseAdmin.auth.admin.deleteUser(patientUserIdB);
    if (doctorUserId) await supabaseAdmin.auth.admin.deleteUser(doctorUserId);
    if (pendingDocUserId) await supabaseAdmin.auth.admin.deleteUser(pendingDocUserId);
  });

  // ==========================================
  // BAGIAN 1: SIKLUS HIDUP LENGKAP (HAPPY PATH)
  // ==========================================
  describe("1. Siklus Lengkap Konsultasi Jantung (Happy Path Lifecycle)", () => {
    it("1.1 Pasien A mengisi profil kesehatan & riwayat penyakit", async () => {
      const res = await request(app)
        .post("/api/v1/patients/me/medical-histories")
        .set("Authorization", `Bearer ${patientTokenA}`)
        .send({
          condition_name: "Hipertensi Derajat 1",
          diagnosed_year: 2023,
          notes: "Rutin minum amlodipin",
        });

      expect(res.status).toBe(201);
      expect(res.body.data.condition_name).toBe("Hipertensi Derajat 1");
    });

    it("1.2 Pasien A membuat order konsultasi baru (draft)", async () => {
      const res = await request(app)
        .post("/api/v1/consultations")
        .set("Authorization", `Bearer ${patientTokenA}`)
        .send({
          doctor_id: doctorUserId,
          duration_minutes: 15,
          complaint: "Dada terasa berdebar dan nyeri saat berolahraga",
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.status).toBe("draft");
      consultationId = res.body.data.id;
    });

    it("1.3 Pasien A mengisi tanda vital keluhan awal", async () => {
      const res = await request(app)
        .post(`/api/v1/consultations/${consultationId}/vitals`)
        .set("Authorization", `Bearer ${patientTokenA}`)
        .send({
          systolic: 135,
          diastolic: 85,
          heart_rate: 80,
          oxygen_saturation: 98,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.vital_id).toBeDefined();
    });

    it("1.4 Pasien A melakukan checkout pembayaran Mayar", async () => {
      const res = await request(app)
        .post(`/api/v1/consultations/${consultationId}/checkout`)
        .set("Authorization", `Bearer ${patientTokenA}`)
        .send({
          doctor_id: doctorUserId,
          duration_minutes: 15,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.mayar_invoice_id).toBeDefined();
      mayarInvoiceId = res.body.data.mayar_invoice_id;
    });

    it("1.5 Webhook Mayar callback menandai pembayaran lunas -> waiting_doctor", async () => {
      const res = await request(app)
        .post(`/api/v1/webhooks/mayar?token=${env.MAYAR_WEBHOOK_SECRET}`)
        .send({
          event: "payment.received",
          data: {
            productId: mayarInvoiceId,
            status: "SUCCESS",
            paymentMethod: "QRIS",
            extraData: { consultationId },
          },
        });

      expect(res.status).toBe(200);

      // Verifikasi status konsultasi berubah ke waiting_doctor
      const checkRes = await request(app)
        .get(`/api/v1/consultations/${consultationId}`)
        .set("Authorization", `Bearer ${patientTokenA}`);
      expect(checkRes.body.data.status).toBe("waiting_doctor");
    });

    it("1.6 Dokter melihat konsultasi di antrean masuk", async () => {
      const res = await request(app)
        .get("/api/v1/doctors/me/queue?type=incoming")
        .set("Authorization", `Bearer ${doctorToken}`);

      expect(res.status).toBe(200);
      const found = res.body.data.find((c: any) => c.consultation_id === consultationId);
      expect(found).toBeDefined();
    });

    it("1.7 Dokter menerima konsultasi -> status aktif (active)", async () => {
      const res = await request(app)
        .post(`/api/v1/consultations/${consultationId}/accept`)
        .set("Authorization", `Bearer ${doctorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("active");
    });

    it("1.8 Pasien & Dokter bertukar pesan chat", async () => {
      // Pasien kirim chat
      const chatPat = await request(app)
        .post(`/api/v1/consultations/${consultationId}/messages`)
        .set("Authorization", `Bearer ${patientTokenA}`)
        .send({
          body: "Selamat siang dokter, dada saya terasa agak tertekan setelah olahraga.",
        });
      expect(chatPat.status).toBe(201);
      expect(chatPat.body.data.id).toBeDefined();
      patientMessageId = chatPat.body.data.id;

      // Dokter tandai telah dibaca
      const readRes = await request(app)
        .patch(`/api/v1/consultations/${consultationId}/messages/read`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .send({ up_to_message_id: patientMessageId });
      expect(readRes.status).toBe(200);

      // Dokter membalas chat
      const chatDoc = await request(app)
        .post(`/api/v1/consultations/${consultationId}/messages`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .send({
          body: "Siang Pak Ahmad, apakah nyerinya menjalar ke lengan kiri atau leher?",
        });
      expect(chatDoc.status).toBe(201);
    });

    it("1.9 Pasien mengunggah lampiran gambar medis (ECG)", async () => {
      const tinyPng = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64"
      );

      const res = await request(app)
        .post(`/api/v1/consultations/${consultationId}/attachments`)
        .set("Authorization", `Bearer ${patientTokenA}`)
        .attach("file", tinyPng, "rekam_ecg.png");

      expect(res.status).toBe(201);
      expect(res.body.data.message_type).toBe("image");
    });

    it("1.10 Dokter membuat resep obat digital (draft)", async () => {
      const res = await request(app)
        .post(`/api/v1/consultations/${consultationId}/prescription`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .send({
          notes: "Diminum teratur setelah makan",
          items: [
            {
              medicine_name: "Bisoprolol 2.5mg",
              dosage: "2.5 mg",
              quantity: "14 tablet",
              instructions: "1x sehari pagi hari sesudah makan",
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeDefined();
      prescriptionId = res.body.data.id;
    });

    it("1.11 Dokter menerbitkan resep resmi (issued) -> PDF & QR Code terbentuk", async () => {
      const res = await request(app)
        .post(`/api/v1/consultations/${consultationId}/prescription/issue`)
        .set("Authorization", `Bearer ${doctorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("issued");
      expect(res.body.data.issued_at).toBeDefined();
      expect(res.body.data.verification_code).toMatch(/^TH-RX-/);
      expect(res.body.data.pdf_path).toBeDefined();
      expect(res.body.data.download_url).toBeDefined();

      verificationCode = res.body.data.verification_code;
    });

    it("1.12 Pasien mengunduh link PDF resep & pihak luar memvalidasi via QR Code", async () => {
      // Pasien download PDF
      const dlRes = await request(app)
        .get(`/api/v1/prescriptions/${prescriptionId}/download`)
        .set("Authorization", `Bearer ${patientTokenA}`);
      expect(dlRes.status).toBe(200);
      expect(dlRes.body.data.download_url).toBeDefined();

      // Apotek validasi QR Code publik tanpa login
      const verifyRes = await request(app)
        .get(`/api/v1/public/prescriptions/verify/${verificationCode}`);
      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.data.is_valid).toBe(true);
      expect(verifyRes.body.data.doctor.name).toContain("Kardio");
    });

    it("1.13 Dokter menutup sesi konsultasi dengan ringkasan medis -> status closed", async () => {
      const res = await request(app)
        .post(`/api/v1/consultations/${consultationId}/close`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .send({
          doctor_summary: "Konsultasi selesai, anjuran istirahat cukup dan minum obat rutin.",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("closed");
    });
  });

  // ==========================================
  // BAGIAN 2: SKENARIO NEGATIF & KEAMANAN
  // ==========================================
  describe("2. Uji Batas Keamanan & Skenario Negatif (Security Guards)", () => {
    it("2.1 Cross-Tenant: Pasien B ditolak membaca chat milik Pasien A (403)", async () => {
      const res = await request(app)
        .get(`/api/v1/consultations/${consultationId}/messages`)
        .set("Authorization", `Bearer ${patientTokenB}`);

      expect(res.status).toBe(403);
    });

    it("2.2 Cross-Tenant: Pasien B ditolak mengunduh resep milik Pasien A (403)", async () => {
      const res = await request(app)
        .get(`/api/v1/prescriptions/${prescriptionId}/download`)
        .set("Authorization", `Bearer ${patientTokenB}`);

      expect(res.status).toBe(403);
    });

    it("2.3 State Machine: Ditolak mengirim chat saat sesi sudah 'closed' (400 SESSION_NOT_ACTIVE)", async () => {
      const res = await request(app)
        .post(`/api/v1/consultations/${consultationId}/messages`)
        .set("Authorization", `Bearer ${patientTokenA}`)
        .send({
          body: "Halo dokter, boleh tanya tambahan?",
        });

      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe("SESSION_NOT_ACTIVE");
    });

    it("2.4 Platform Guard: Pasien dilarang login via Web (403 WRONG_PLATFORM)", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .set("X-Client-Platform", "web")
        .send({
          email: patientEmailA,
          password: "password123",
        });

      expect(res.status).toBe(403);
      expect(res.body.error?.code).toBe("WRONG_PLATFORM");
    });

    it("2.5 Platform Guard: Dokter dilarang login via Mobile (403 WRONG_PLATFORM)", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .set("X-Client-Platform", "mobile")
        .send({
          email: doctorEmail,
          password: "password123",
        });

      expect(res.status).toBe(403);
      expect(res.body.error?.code).toBe("WRONG_PLATFORM");
    });

    it("2.6 Admin Laporan Keuangan & Audit Log tidak membocorkan data medis klinis", async () => {
      const res = await request(app)
        .get("/api/v1/admin/transactions?limit=10")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);

      // Verifikasi kepatuhan privasi klinis pada data transaksi finansial
      res.body.data.forEach((tx: any) => {
        expect(tx.symptoms).toBeUndefined();
        expect(tx.diagnosis_icd10).toBeUndefined();
        expect(tx.medical_summary).toBeUndefined();
      });

      // Verifikasi audit log mencatat aksi konsultasi
      const auditRes = await request(app)
        .get("/api/v1/admin/audit-logs?limit=20")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(auditRes.status).toBe(200);
      expect(auditRes.body.data.length).toBeGreaterThan(0);
    });
  });
});
