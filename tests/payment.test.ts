import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import crypto from "crypto";
import app from "../src/app.js";
import { supabaseAdmin } from "../src/lib/supabase.js";
import { env } from "../src/config/env.js";

describe("Payment & Mayar Integration Tests (Fase 6)", () => {
  const rand = crypto.randomBytes(4).toString("hex");
  const patientEmail = `pay.patient.${rand}@teleheart.com`;
  const doctorEmail = `pay.doc.${rand}@teleheart.com`;
  const nik = "320101010190" + String(Math.floor(1000 + Math.random() * 9000));
  const str = "STR-" + rand.toUpperCase();

  let patientToken = "";
  let doctorToken = "";
  let patientUserId = "";
  let doctorUserId = "";
  let consultationId = "";
  let mayarInvoiceId = "";

  beforeAll(async () => {
    // 1. Registrasi & Login Pasien
    const patReg = await request(app)
      .post("/api/v1/auth/register/patient")
      .send({
        full_name: "Pasien Pembayar",
        nik: nik,
        birth_date: "1992-05-10",
        gender: "male",
        phone: "081234567890",
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
        full_name: "dr. Bayar Spesialis",
        str_number: str,
        sip_number: "SIP-PAY-" + rand,
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

    // Approve dokter via DB & atur online
    await supabaseAdmin
      .from("doctor_profiles")
      .update({
        verification_status: "approved",
        is_online: true,
      })
      .eq("user_id", doctorUserId);

    const docLogin = await request(app)
      .post("/api/v1/auth/login")
      .set("X-Client-Platform", "web")
      .send({ email: doctorEmail, password: "password123" });
    doctorToken = docLogin.body?.data?.access_token;

    // Dokter set tarif
    await request(app)
      .put("/api/v1/doctors/me/tariffs")
      .set("Authorization", `Bearer ${doctorToken}`)
      .send({
        tariffs: [
          { duration_minutes: 15, price: 60000 },
          { duration_minutes: 30, price: 100000 },
          { duration_minutes: 60, price: 180000 },
        ],
      });
  }, 45000);

  afterAll(async () => {
    if (patientUserId) await supabaseAdmin.auth.admin.deleteUser(patientUserId);
    if (doctorUserId) await supabaseAdmin.auth.admin.deleteUser(doctorUserId);
  });

  describe("Checkout Konsultasi (POST /api/v1/consultations/:id/checkout)", () => {
    it("Harus membuat draft konsultasi baru terlebih dahulu", async () => {
      const res = await request(app)
        .post("/api/v1/consultations")
        .set("Authorization", `Bearer ${patientToken}`)
        .send({
          doctor_id: doctorUserId,
          duration_minutes: 15,
          complaint: "Dada terasa sesak setelah beraktivitas",
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe("draft");
      expect(res.body.data.id).toBeDefined();
      consultationId = res.body.data.id;
    });

    it("Menolak checkout jika tanda vital belum diisi (400 VITALS_REQUIRED)", async () => {
      const res = await request(app)
        .post(`/api/v1/consultations/${consultationId}/checkout`)
        .set("Authorization", `Bearer ${patientToken}`)
        .send({
          doctor_id: doctorUserId,
          duration_minutes: 15,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VITALS_REQUIRED");
    });

    it("Mengisi tanda vital terlebih dahulu", async () => {
      const res = await request(app)
        .post(`/api/v1/consultations/${consultationId}/vitals`)
        .set("Authorization", `Bearer ${patientToken}`)
        .send({
          systolic: 125,
          diastolic: 82,
          heart_rate: 80,
          oxygen_saturation: 98,
        });

      expect(res.status).toBe(201);
    });

    it("Berhasil melakukan checkout dan mendapatkan URL pembayaran Mayar (200)", async () => {
      const res = await request(app)
        .post(`/api/v1/consultations/${consultationId}/checkout`)
        .set("Authorization", `Bearer ${patientToken}`)
        .send({
          doctor_id: doctorUserId,
          duration_minutes: 15,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("waiting_payment");
      expect(res.body.data.mayar_invoice_id).toBeDefined();
      expect(res.body.data.payment_url).toBeDefined();
      expect(res.body.data.doctor_fee).toBe(60000);
      expect(res.body.data.platform_fee).toBeGreaterThanOrEqual(0);
      expect(res.body.data.amount).toBe(res.body.data.doctor_fee + res.body.data.platform_fee);

      mayarInvoiceId = res.body.data.mayar_invoice_id;

      // Verifikasi record di tabel payments
      const { data: paymentRecord } = await supabaseAdmin
        .from("payments")
        .select("*")
        .eq("consultation_id", consultationId)
        .single();

      expect(paymentRecord).toBeDefined();
      expect(paymentRecord.status).toBe("pending");
      expect(paymentRecord.amount).toBe(res.body.data.amount);
    });
  });

  describe("Webhook Mayar Handler (POST /api/v1/webhooks/mayar)", () => {
    it("Menolak request webhook jika token tidak valid (401 UNAUTHORIZED_WEBHOOK)", async () => {
      const res = await request(app)
        .post("/api/v1/webhooks/mayar?token=invalid_token_123")
        .send({
          event: "payment.received",
          data: {
            status: "SUCCESS",
            productId: mayarInvoiceId,
          },
        });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED_WEBHOOK");
    });

    it("Mengabaikan webhook selain event payment.received", async () => {
      const validToken = env.MAYAR_WEBHOOK_SECRET;
      const res = await request(app)
        .post(`/api/v1/webhooks/mayar?token=${validToken}`)
        .send({
          event: "invoice.created",
          data: {
            status: "PENDING",
            productId: mayarInvoiceId,
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("ignored");
    });

    it("Memproses pembayaran sukses dari Mayar secara lengkap (200)", async () => {
      const validToken = env.MAYAR_WEBHOOK_SECRET;
      const res = await request(app)
        .post(`/api/v1/webhooks/mayar?token=${validToken}`)
        .send({
          event: "payment.received",
          data: {
            id: mayarInvoiceId,
            productId: mayarInvoiceId,
            status: "SUCCESS",
            paymentMethod: "QRIS",
            amount: 65000,
            customerEmail: patientEmail,
            extraData: {
              consultationId: consultationId,
            },
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("success");

      // 1. Cek status di tabel payments -> paid
      const { data: updatedPayment } = await supabaseAdmin
        .from("payments")
        .select("*")
        .eq("consultation_id", consultationId)
        .single();

      expect(updatedPayment.status).toBe("paid");
      expect(updatedPayment.paid_at).toBeDefined();
      expect(updatedPayment.payment_method).toBe("QRIS");

      // 2. Cek status di tabel consultations -> waiting_doctor
      const { data: updatedCons } = await supabaseAdmin
        .from("consultations")
        .select("*")
        .eq("id", consultationId)
        .single();

      expect(updatedCons.status).toBe("waiting_doctor");
      expect(updatedCons.response_deadline_at).toBeDefined();

      // 3. Cek penugasan dokter di tabel consultation_assignments
      const { data: assignment } = await supabaseAdmin
        .from("consultation_assignments")
        .select("*")
        .eq("consultation_id", consultationId)
        .eq("doctor_id", doctorUserId)
        .single();

      expect(assignment).toBeDefined();
      expect(assignment.status).toBe("offered");

      // 4. Cek notifikasi in-app tersimpan untuk dokter & pasien
      const { data: notifications } = await supabaseAdmin
        .from("notifications")
        .select("*")
        .in("user_id", [doctorUserId, patientUserId]);

      expect(notifications.length).toBeGreaterThanOrEqual(2);
    });

    it("Menjamin Idempotensi jika webhook dipanggil berulang kali untuk transaksi yang sama", async () => {
      const validToken = env.MAYAR_WEBHOOK_SECRET;
      const res = await request(app)
        .post(`/api/v1/webhooks/mayar?token=${validToken}`)
        .send({
          event: "payment.received",
          data: {
            id: mayarInvoiceId,
            productId: mayarInvoiceId,
            status: "SUCCESS",
            paymentMethod: "QRIS",
            extraData: {
              consultationId: consultationId,
            },
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("already_processed");
    });
  });
});
