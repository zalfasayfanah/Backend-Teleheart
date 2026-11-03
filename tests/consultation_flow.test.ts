import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import crypto from "crypto";
import app from "../src/app.js";
import { supabaseAdmin } from "../src/lib/supabase.js";
import { env } from "../src/config/env.js";

describe("Consultation Flow, Doctor Queue & Lifecycle Tests (Fase 7)", () => {
  const rand = crypto.randomBytes(4).toString("hex");
  const patientEmail = `flow.patient.${rand}@teleheart.com`;
  const doc1Email = `flow.doc1.${rand}@teleheart.com`;
  const doc2Email = `flow.doc2.${rand}@teleheart.com`;
  const strangerDocEmail = `flow.docstranger.${rand}@teleheart.com`;

  let patientToken = "";
  let doc1Token = "";
  let doc2Token = "";
  let strangerDocToken = "";

  let patientUserId = "";
  let doc1UserId = "";
  let doc2UserId = "";
  let strangerDocUserId = "";

  let consultationId = "";
  let mayarInvoiceId = "";

  beforeAll(async () => {
    // 1. Registrasi & Login Pasien
    const patReg = await request(app)
      .post("/api/v1/auth/register/patient")
      .send({
        full_name: "Pasien Alur Konsultasi",
        nik: "320101010190" + String(Math.floor(1000 + Math.random() * 9000)),
        birth_date: "1991-03-15",
        gender: "female",
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

    // Helper pendaftaran & aktivasi dokter
    async function createApprovedDoctor(email: string, name: string, strSuffix: string) {
      const reg = await request(app)
        .post("/api/v1/auth/register/doctor")
        .send({
          full_name: name,
          str_number: "STR-" + strSuffix + "-" + rand,
          sip_number: "SIP-" + strSuffix + "-" + rand,
          specialization: "Spesialis Jantung dan Pembuluh Darah",
          workplace: "RS Jantung Sehat",
          email: email,
          password: "password123",
          consents: [
            { consent_type: "privacy_policy", version: "1.0" },
            { consent_type: "medical_data_processing", version: "1.0" },
          ],
        });
      const docId = reg.body?.data?.id;

      await supabaseAdmin
        .from("doctor_profiles")
        .update({ verification_status: "approved", is_online: true })
        .eq("user_id", docId);

      const login = await request(app)
        .post("/api/v1/auth/login")
        .set("X-Client-Platform", "web")
        .send({ email: email, password: "password123" });
      const token = login.body?.data?.access_token;

      // Set tarif dokter
      await request(app)
        .put("/api/v1/doctors/me/tariffs")
        .set("Authorization", `Bearer ${token}`)
        .send({
          tariffs: [
            { duration_minutes: 15, price: 50000 },
            { duration_minutes: 30, price: 90000 },
            { duration_minutes: 60, price: 160000 },
          ],
        });

      return { docId, token };
    }

    // Buat Dokter 1
    const doc1 = await createApprovedDoctor(doc1Email, "dr. Pertama Sp.JP", "DOC1");
    doc1UserId = doc1.docId;
    doc1Token = doc1.token;

    // Buat Dokter 2 (Pengganti)
    const doc2 = await createApprovedDoctor(doc2Email, "dr. Kedua Sp.JP", "DOC2");
    doc2UserId = doc2.docId;
    doc2Token = doc2.token;

    // Buat Dokter Asing (untuk uji otorisasi riwayat)
    const stranger = await createApprovedDoctor(strangerDocEmail, "dr. Asing Sp.JP", "STRANGER");
    strangerDocUserId = stranger.docId;
    strangerDocToken = stranger.token;
  }, 60000);

  afterAll(async () => {
    if (patientUserId) await supabaseAdmin.auth.admin.deleteUser(patientUserId);
    if (doc1UserId) await supabaseAdmin.auth.admin.deleteUser(doc1UserId);
    if (doc2UserId) await supabaseAdmin.auth.admin.deleteUser(doc2UserId);
    if (strangerDocUserId) await supabaseAdmin.auth.admin.deleteUser(strangerDocUserId);
  });

  describe("Persiapan Konsultasi & Pembayaran Lunas", () => {
    it("Pasien membuat draft, mengisi tanda vital, dan checkout Mayar (200)", async () => {
      // 1. Buat draft
      const draftRes = await request(app)
        .post("/api/v1/consultations")
        .set("Authorization", `Bearer ${patientToken}`)
        .send({
          doctor_id: doc1UserId,
          duration_minutes: 15,
          complaint: "Nyeri dada sebelah kiri sejak kemarin",
        });
      expect(draftRes.status).toBe(201);
      consultationId = draftRes.body.data.id;

      // 2. Input vitals
      await request(app)
        .post(`/api/v1/consultations/${consultationId}/vitals`)
        .set("Authorization", `Bearer ${patientToken}`)
        .send({
          systolic: 130,
          diastolic: 85,
          heart_rate: 88,
          oxygen_saturation: 98,
        });

      // 3. Checkout
      const checkoutRes = await request(app)
        .post(`/api/v1/consultations/${consultationId}/checkout`)
        .set("Authorization", `Bearer ${patientToken}`)
        .send({ doctor_id: doc1UserId, duration_minutes: 15 });
      expect(checkoutRes.status).toBe(200);
      mayarInvoiceId = checkoutRes.body.data.mayar_invoice_id;

      // 4. Webhook Mayar sukses
      const webhookRes = await request(app)
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
      expect(webhookRes.status).toBe(200);
      expect(webhookRes.body.data.status).toBe("success");
    });
  });

  describe("Antrean Dokter (GET /api/v1/doctors/me/queue)", () => {
    it("Dokter 1 dapat melihat permintaan konsultasi yang masuk (type=incoming)", async () => {
      const res = await request(app)
        .get("/api/v1/doctors/me/queue?type=incoming")
        .set("Authorization", `Bearer ${doc1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);

      const target = res.body.data.find((q: any) => q.consultation_id === consultationId);
      expect(target).toBeDefined();
      expect(target.patient.full_name).toBe("Pasien Alur Konsultasi");
      expect(target.vitals.systolic).toBe(130);
      expect(target.response_deadline_at).toBeDefined();
    });

    it("Dokter 2 tidak memiliki antrean masuk (karena ditugaskan ke Dokter 1)", async () => {
      const res = await request(app)
        .get("/api/v1/doctors/me/queue?type=incoming")
        .set("Authorization", `Bearer ${doc2Token}`);

      expect(res.status).toBe(200);
      const target = res.body.data.find((q: any) => q.consultation_id === consultationId);
      expect(target).toBeUndefined();
    });
  });

  describe("Penerimaan Konsultasi (POST /api/v1/consultations/:id/accept)", () => {
    it("Dokter asing tidak boleh menerima penugasan dokter lain (403 FORBIDDEN)", async () => {
      const res = await request(app)
        .post(`/api/v1/consultations/${consultationId}/accept`)
        .set("Authorization", `Bearer ${strangerDocToken}`);

      expect(res.status).toBe(403);
    });

    it("Dokter 1 menerima konsultasi -> status berpindah ke 'active' (200)", async () => {
      const res = await request(app)
        .post(`/api/v1/consultations/${consultationId}/accept`)
        .set("Authorization", `Bearer ${doc1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("active");
      expect(res.body.data.started_at).toBeDefined();
      expect(res.body.data.expires_at).toBeDefined();
      expect(res.body.data.remaining_seconds).toBeGreaterThan(0);

      // Cek antrean aktif Dokter 1
      const queueRes = await request(app)
        .get("/api/v1/doctors/me/queue?type=active")
        .set("Authorization", `Bearer ${doc1Token}`);

      expect(queueRes.status).toBe(200);
      const activeItem = queueRes.body.data.find((q: any) => q.consultation_id === consultationId);
      expect(activeItem).toBeDefined();
      expect(activeItem.remaining_seconds).toBeGreaterThan(0);
    });

    it("Konsultasi yang sudah aktif tidak dapat diterima ulang (400 INVALID_STATE)", async () => {
      const res = await request(app)
        .post(`/api/v1/consultations/${consultationId}/accept`)
        .set("Authorization", `Bearer ${doc1Token}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_STATE");
    });
  });

  describe("Penutupan Konsultasi (POST /api/v1/consultations/:id/close)", () => {
    it("Dokter 1 menutup sesi konsultasi dan memberikan kesimpulan medis (200)", async () => {
      const summaryText = "Pasien mengalami angina stabil ringan. Diberikan edukasi istirahat dan kurangi kafein.";
      const res = await request(app)
        .post(`/api/v1/consultations/${consultationId}/close`)
        .set("Authorization", `Bearer ${doc1Token}`)
        .send({ doctor_summary: summaryText });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("closed");
      expect(res.body.data.doctor_summary).toBe(summaryText);
      expect(res.body.data.ended_at).toBeDefined();
      expect(res.body.data.closed_by).toBe(doc1UserId);
    });
  });

  describe("Riwayat Pasien untuk Dokter (GET /api/v1/patients/:id/history)", () => {
    it("Dokter 1 dapat melihat riwayat pemeriksaan pasien yang pernah ditangani (200)", async () => {
      const res = await request(app)
        .get(`/api/v1/patients/${patientUserId}/history`)
        .set("Authorization", `Bearer ${doc1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);

      const hist = res.body.data.find((h: any) => h.consultation_id === consultationId);
      expect(hist).toBeDefined();
      expect(hist.vitals.systolic).toBe(130);
      expect(hist.doctor_summary).toContain("angina stabil");
      // Memastikan privasi: tidak ada chat_messages di history
      expect(hist.chat_messages).toBeUndefined();
    });

    it("Dokter asing ditolak saat mencoba melihat riwayat pasien (403 FORBIDDEN)", async () => {
      const res = await request(app)
        .get(`/api/v1/patients/${patientUserId}/history`)
        .set("Authorization", `Bearer ${strangerDocToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe("Alur Penolakan & Pengalihan Dokter (Reassign Flow)", () => {
    let reassignConsId = "";
    let reassignInvId = "";

    it("Ketika Dokter 1 menolak, sesi otomatis dialihkan ke Dokter 2 yang online (200)", async () => {
      // 1. Buat konsultasi baru untuk Dokter 1
      const cRes = await request(app)
        .post("/api/v1/consultations")
        .set("Authorization", `Bearer ${patientToken}`)
        .send({ doctor_id: doc1UserId, duration_minutes: 15 });
      reassignConsId = cRes.body.data.id;

      // 2. Vitals
      await request(app)
        .post(`/api/v1/consultations/${reassignConsId}/vitals`)
        .set("Authorization", `Bearer ${patientToken}`)
        .send({ systolic: 120, diastolic: 80, heart_rate: 72 });

      // 3. Checkout & Webhook
      const payRes = await request(app)
        .post(`/api/v1/consultations/${reassignConsId}/checkout`)
        .set("Authorization", `Bearer ${patientToken}`)
        .send({ doctor_id: doc1UserId, duration_minutes: 15 });
      reassignInvId = payRes.body.data.mayar_invoice_id;

      await request(app)
        .post(`/api/v1/webhooks/mayar?token=${env.MAYAR_WEBHOOK_SECRET}`)
        .send({
          event: "payment.received",
          data: {
            productId: reassignInvId,
            status: "SUCCESS",
            extraData: { consultationId: reassignConsId },
          },
        });

      // 4. Dokter 1 menolak konsultasi
      const rejectRes = await request(app)
        .post(`/api/v1/consultations/${reassignConsId}/reject`)
        .set("Authorization", `Bearer ${doc1Token}`)
        .send({ reason: "Sedang ada tindakan medis mendesak di RS" });

      expect(rejectRes.status).toBe(200);
      expect(rejectRes.body.data.reassigned).toBe(true);
      expect(rejectRes.body.data.new_doctor_id).toBe(doc2UserId);

      // 5. Cek antrean Dokter 2: sekarang konsultasi ada di Dokter 2!
      const doc2Queue = await request(app)
        .get("/api/v1/doctors/me/queue?type=incoming")
        .set("Authorization", `Bearer ${doc2Token}`);

      expect(doc2Queue.status).toBe(200);
      const found = doc2Queue.body.data.find((q: any) => q.consultation_id === reassignConsId);
      expect(found).toBeDefined();
    });
  });

  describe("Background Timeout Job (POST /api/v1/jobs/check-timeouts)", () => {
    it("Menolak eksekusi job jika x-jobs-secret salah (401)", async () => {
      const res = await request(app)
        .post("/api/v1/jobs/check-timeouts")
        .set("x-jobs-secret", "invalid_secret");

      expect(res.status).toBe(401);
    });

    it("Berhasil menjalankan background check timeouts dengan secret yang valid (200)", async () => {
      const res = await request(app)
        .post("/api/v1/jobs/check-timeouts")
        .set("x-jobs-secret", env.JOBS_SECRET || "");

      expect(res.status).toBe(200);
      expect(res.body.data.timestamp).toBeDefined();
      expect(res.body.data.timeouts_processed).toBeTypeOf("number");
      expect(res.body.data.auto_closed_sessions).toBeTypeOf("number");
    });
  });
});

