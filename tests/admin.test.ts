import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import crypto from "crypto";
import app from "../src/app.js";
import { supabaseAdmin } from "../src/lib/supabase.js";
import { env } from "../src/config/env.js";

describe("Admin Module & Audit Trail Integration Tests (Fase 11)", () => {
  const rand = crypto.randomBytes(4).toString("hex");
  const adminEmail = `admin.${rand}@teleheart.com`;
  const patientEmail = `admin.test.pat.${rand}@teleheart.com`;
  const doctorEmail = `admin.test.doc.${rand}@teleheart.com`;

  let adminToken = "";
  let patientToken = "";
  let doctorToken = "";

  let adminUserId = "";
  let patientUserId = "";
  let doctorUserId = "";

  let consultationId = "";
  let paymentId = "";

  beforeAll(async () => {
    // 1. Buat Akun Admin
    const { data: authAdmin } = await supabaseAdmin.auth.admin.createUser({
      email: adminEmail,
      password: "adminpassword123",
      email_confirm: true,
      user_metadata: { role: "admin", full_name: "Admin Audit" },
    });
    adminUserId = authAdmin.user!.id;

    await supabaseAdmin.from("users").insert({
      id: adminUserId,
      role: "admin",
      full_name: "Admin Audit",
      email: adminEmail,
      is_active: true,
    });

    const adminLogin = await request(app)
      .post("/api/v1/auth/login")
      .set("X-Client-Platform", "web")
      .send({ email: adminEmail, password: "adminpassword123" });
    adminToken = adminLogin.body?.data?.access_token;

    // 2. Buat Akun Pasien
    const patReg = await request(app)
      .post("/api/v1/auth/register/patient")
      .send({
        full_name: "Pasien Admin Test",
        nik: "320101010190" + String(Math.floor(1000 + Math.random() * 9000)),
        birth_date: "1992-07-20",
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

    // 3. Buat Akun Dokter
    const docReg = await request(app)
      .post("/api/v1/auth/register/doctor")
      .send({
        full_name: "dr. Admin Test Sp.JP",
        str_number: "STR-ADM-" + rand,
        sip_number: "SIP-ADM-" + rand,
        specialization: "Spesialis Jantung",
        workplace: "RS TeleHeart",
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

    // Atur tarif dokter
    await request(app)
      .put("/api/v1/doctors/me/tariffs")
      .set("Authorization", `Bearer ${doctorToken}`)
      .send({
        tariffs: [{ duration_minutes: 15, price: 50000 }],
      });

    // 4. Siapkan Konsultasi & Pembayaran untuk Pengujian Refund
    const cRes = await request(app)
      .post("/api/v1/consultations")
      .set("Authorization", `Bearer ${patientToken}`)
      .send({ doctor_id: doctorUserId, duration_minutes: 15 });
    consultationId = cRes.body.data.id;

    await request(app)
      .post(`/api/v1/consultations/${consultationId}/vitals`)
      .set("Authorization", `Bearer ${patientToken}`)
      .send({ systolic: 120, diastolic: 80, heart_rate: 72 });

    const payRes = await request(app)
      .post(`/api/v1/consultations/${consultationId}/checkout`)
      .set("Authorization", `Bearer ${patientToken}`)
      .send({ doctor_id: doctorUserId, duration_minutes: 15 });

    // Webhook bayar sukses
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

    const { data: pData } = await supabaseAdmin
      .from("payments")
      .select("id")
      .eq("consultation_id", consultationId)
      .single();

    paymentId = pData!.id;
  }, 60000);

  afterAll(async () => {
    if (adminUserId) await supabaseAdmin.auth.admin.deleteUser(adminUserId);
    if (patientUserId) await supabaseAdmin.auth.admin.deleteUser(patientUserId);
    if (doctorUserId) await supabaseAdmin.auth.admin.deleteUser(doctorUserId);
  });

  describe("Otorisasi Peran Admin (Role Guard)", () => {
    it("Pasien ditolak mengakses endpoint admin (403 FORBIDDEN)", async () => {
      const res = await request(app)
        .get("/api/v1/admin/users")
        .set("Authorization", `Bearer ${patientToken}`);

      expect(res.status).toBe(403);
    });

    it("Dokter ditolak mengakses endpoint admin (403 FORBIDDEN)", async () => {
      const res = await request(app)
        .get("/api/v1/admin/transactions")
        .set("Authorization", `Bearer ${doctorToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe("Daftar Pengguna Sistem (GET /api/v1/admin/users)", () => {
    it("Admin dapat mengambil seluruh daftar pengguna dengan pagination (200)", async () => {
      const res = await request(app)
        .get("/api/v1/admin/users?limit=10")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.meta?.total).toBeGreaterThanOrEqual(3);
    });

    it("Mendukung filter role=doctor dan membawa metadata dokter (200)", async () => {
      const res = await request(app)
        .get("/api/v1/admin/users?role=doctor")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      res.body.data.forEach((u: any) => {
        expect(u.role).toBe("doctor");
        expect(u.doctor_profile).toBeDefined();
      });
    });

    it("Mendukung filter role=patient dan memastikan NIK ter-masking (200)", async () => {
      const res = await request(app)
        .get("/api/v1/admin/users?role=patient")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const target = res.body.data.find((p: any) => p.id === patientUserId);
      expect(target).toBeDefined();
      expect(target.patient_profile?.nik_masked).toMatch(/^\*{12}[0-9]{4}$/);
    });
  });

  describe("Laporan Transaksi Keuangan (GET /api/v1/admin/transactions)", () => {
    it("Admin dapat melihat laporan transaksi pembayaran beserta ringkasan revenue (200)", async () => {
      const res = await request(app)
        .get("/api/v1/admin/transactions?limit=20")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.meta?.summary).toBeDefined();
      expect(res.body.meta?.summary.total_revenue).toBeGreaterThanOrEqual(50000);
      expect(res.body.meta?.summary.paid_transactions).toBeGreaterThanOrEqual(1);
    });

    it("Kepatuhan Privasi: Memastikan tidak ada data medis pasien yang bocor di respons transaksi", async () => {
      const res = await request(app)
        .get("/api/v1/admin/transactions")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      res.body.data.forEach((tx: any) => {
        // Pastikan tidak ada data diagnosis medis, resep, atau chat
        expect(tx.complaint).toBeUndefined();
        expect(tx.diagnosis).toBeUndefined();
        expect(tx.vital_signs).toBeUndefined();
        expect(tx.doctor_summary).toBeUndefined();
        expect(tx.chat_messages).toBeUndefined();
      });
    });
  });

  describe("Audit Trail Aktivitas Sistem (GET /api/v1/admin/audit-logs)", () => {
    it("Admin dapat mengambil riwayat log audit aktivitas (200)", async () => {
      const res = await request(app)
        .get("/api/v1/admin/audit-logs?limit=20")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.meta?.total).toBeDefined();
    });
  });

  describe("Proses Pengembalian Dana (POST /api/v1/admin/refunds)", () => {
    it("Menolak refund jika transaksi tidak ditemukan (404)", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";
      const res = await request(app)
        .post("/api/v1/admin/refunds")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          payment_id: fakeId,
          reason: "Pasien membatalkan",
        });

      expect(res.status).toBe(404);
    });

    it("Admin berhasil memproses pengembalian dana transaksi (200)", async () => {
      const res = await request(app)
        .post("/api/v1/admin/refunds")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          payment_id: paymentId,
          reason: "Dokter berhalangan hadir mendadak, pasien menyetujui refund",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(paymentId);
      expect(res.body.data.status).toBe("refunded");
      expect(res.body.data.refunded_at).toBeDefined();
      expect(res.body.data.refunded_by).toBe(adminUserId);
      expect(res.body.data.refund_note).toContain("Dokter berhalangan hadir mendadak");
    });

    it("Menolak pengembalian dana ulang jika transaksi sudah berstatus 'refunded' (400 ALREADY_REFUNDED)", async () => {
      const res = await request(app)
        .post("/api/v1/admin/refunds")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          payment_id: paymentId,
          reason: "Coba refund kedua kali",
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("ALREADY_REFUNDED");
    });

    it("Memastikan audit log mencatat aksi 'process_refund' oleh admin", async () => {
      const res = await request(app)
        .get("/api/v1/admin/audit-logs?action=process_refund")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const found = res.body.data.find((log: any) => log.resource_id === paymentId);
      expect(found).toBeDefined();
      expect(found.action).toBe("process_refund");
      expect(found.actor_id).toBe(adminUserId);
      expect(found.actor_role).toBe("admin");
    });
  });
});
