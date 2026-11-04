import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import crypto from "crypto";
import app from "../src/app.js";
import { supabaseAdmin } from "../src/lib/supabase.js";
import { env } from "../src/config/env.js";

describe("Chat & Attachment Module Tests (Fase 8)", () => {
  const rand = crypto.randomBytes(4).toString("hex");
  const patientEmail = `chat.pat.${rand}@teleheart.com`;
  const doctorEmail = `chat.doc.${rand}@teleheart.com`;
  const strangerEmail = `chat.stranger.${rand}@teleheart.com`;

  let patientToken = "";
  let doctorToken = "";
  let strangerToken = "";

  let patientUserId = "";
  let doctorUserId = "";
  let strangerUserId = "";

  let consultationId = "";
  let patientMessageId = "";

  beforeAll(async () => {
    // 1. Registrasi & Login Pasien
    const patReg = await request(app)
      .post("/api/v1/auth/register/patient")
      .send({
        full_name: "Pasien Chat",
        nik: "320101010190" + String(Math.floor(1000 + Math.random() * 9000)),
        birth_date: "1993-08-20",
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
        full_name: "dr. Chat Sp.JP",
        str_number: "STR-CHAT-" + rand,
        sip_number: "SIP-CHAT-" + rand,
        specialization: "Spesialis Jantung dan Pembuluh Darah",
        workplace: "RS Jantung Sehat",
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
          { duration_minutes: 60, price: 160000 },
        ],
      });

    // 3. Registrasi Pasien Asing (Uji Otorisasi)
    const strReg = await request(app)
      .post("/api/v1/auth/register/patient")
      .send({
        full_name: "Pasien Asing",
        nik: "320101010190" + String(Math.floor(1000 + Math.random() * 9000)),
        birth_date: "1990-01-01",
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

    // 4. Buat Konsultasi & Aktifkan Sesi (Draft -> Vitals -> Checkout -> Webhook -> Accept)
    const cRes = await request(app)
      .post("/api/v1/consultations")
      .set("Authorization", `Bearer ${patientToken}`)
      .send({ doctor_id: doctorUserId, duration_minutes: 15 });
    consultationId = cRes.body.data.id;

    await request(app)
      .post(`/api/v1/consultations/${consultationId}/vitals`)
      .set("Authorization", `Bearer ${patientToken}`)
      .send({ systolic: 125, diastolic: 82, heart_rate: 76 });

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

  describe("Kirim Pesan Teks (POST /api/v1/consultations/:id/messages)", () => {
    it("Pasien berhasil mengirim pesan teks ke dokter (201)", async () => {
      const res = await request(app)
        .post(`/api/v1/consultations/${consultationId}/messages`)
        .set("Authorization", `Bearer ${patientToken}`)
        .send({ body: "Selamat pagi dok, dada saya terasa nyeri sejak kemarin." });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.message_type).toBe("text");
      expect(res.body.data.body).toContain("Selamat pagi dok");
      expect(res.body.data.sender_id).toBe(patientUserId);

      patientMessageId = res.body.data.id;
    });

    it("Dokter berhasil membalas pesan ke pasien (201)", async () => {
      const res = await request(app)
        .post(`/api/v1/consultations/${consultationId}/messages`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .send({ body: "Pagi, apakah nyerinya menjalar ke lengan atau leher?" });

      expect(res.status).toBe(201);
      expect(res.body.data.message_type).toBe("text");
      expect(res.body.data.sender_id).toBe(doctorUserId);
    });

    it("Orang asing tidak boleh mengirim pesan ke konsultasi orang lain (403 FORBIDDEN)", async () => {
      const res = await request(app)
        .post(`/api/v1/consultations/${consultationId}/messages`)
        .set("Authorization", `Bearer ${strangerToken}`)
        .send({ body: "Pesan dari orang asing" });

      expect(res.status).toBe(403);
    });
  });

  describe("Unggah Gambar Medis (POST /api/v1/consultations/:id/attachments)", () => {
    it("Pasien berhasil mengunggah foto hasil rekam EKG (201)", async () => {
      // Buffer gambar dummy PNG 1x1 pixel
      const dummyPng = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64"
      );

      const res = await request(app)
        .post(`/api/v1/consultations/${consultationId}/attachments`)
        .set("Authorization", `Bearer ${patientToken}`)
        .attach("file", dummyPng, "ekg_report.png");

      expect(res.status).toBe(201);
      expect(res.body.data.message_type).toBe("image");
      expect(res.body.data.attachment_url).toBeDefined();
      expect(res.body.data.attachment_url_expires_in).toBe(300);
    });

    it("Menolak berkas selain gambar seperti .txt (400 UNSUPPORTED_FILE_TYPE)", async () => {
      const dummyTxt = Buffer.from("Ini berkas teks, bukan gambar.");

      const res = await request(app)
        .post(`/api/v1/consultations/${consultationId}/attachments`)
        .set("Authorization", `Bearer ${patientToken}`)
        .attach("file", dummyTxt, "report.txt");

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("UNSUPPORTED_FILE_TYPE");
    });
  });

  describe("Ambil Riwayat Chat (GET /api/v1/consultations/:id/messages)", () => {
    it("Dokter dapat mengambil riwayat pesan secara kronologis (200)", async () => {
      const res = await request(app)
        .get(`/api/v1/consultations/${consultationId}/messages`)
        .set("Authorization", `Bearer ${doctorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBeGreaterThanOrEqual(3);

      // Verifikasi urutan kronologis (ASC: lama ke baru)
      const firstMsg = res.body.data[0];
      expect(firstMsg.body).toContain("Selamat pagi dok");

      // Verifikasi pesan gambar menyertakan signed URL
      const imgMsg = res.body.data.find((m: any) => m.message_type === "image");
      expect(imgMsg).toBeDefined();
      expect(imgMsg.attachment_url).toBeDefined();
    });

    it("Mendukung cursor pagination (before)", async () => {
      const res = await request(app)
        .get(`/api/v1/consultations/${consultationId}/messages?limit=2`)
        .set("Authorization", `Bearer ${patientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeLessThanOrEqual(2);
    });
  });

  describe("Tandai Pesan Terbaca (PATCH /api/v1/consultations/:id/messages/read)", () => {
    it("Dokter menandai pesan pasien sebagai terbaca (200)", async () => {
      const res = await request(app)
        .patch(`/api/v1/consultations/${consultationId}/messages/read`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .send({ up_to_message_id: patientMessageId });

      expect(res.status).toBe(200);
      expect(res.body.data.marked_count).toBeGreaterThanOrEqual(1);

      // Cek di DB bahwa pesan pasien sudah memiliki read_at
      const { data: checkMsg } = await supabaseAdmin
        .from("chat_messages")
        .select("read_at")
        .eq("id", patientMessageId)
        .single();

      expect(checkMsg.read_at).toBeDefined();
      expect(checkMsg.read_at).not.toBeNull();
    });
  });

  describe("Validasi Status Sesi (Negative Test Saat Sesi Tertutup)", () => {
    it("Dokter menutup konsultasi (200)", async () => {
      const res = await request(app)
        .post(`/api/v1/consultations/${consultationId}/close`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .send({ doctor_summary: "Konsultasi selesai." });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("closed");
    });

    it("Menolak pengiriman pesan jika sesi sudah ditutup (400 SESSION_NOT_ACTIVE)", async () => {
      const res = await request(app)
        .post(`/api/v1/consultations/${consultationId}/messages`)
        .set("Authorization", `Bearer ${patientToken}`)
        .send({ body: "Dok apakah saya masih bisa bertanya?" });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("SESSION_NOT_ACTIVE");
    });
  });
});

