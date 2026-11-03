import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { supabaseAdmin } from "../src/lib/supabase.js";

describe("Doctor & Tariff Module Integration Tests", () => {
  const timestamp = Date.now();
  const doctorEmail = `doc.tariff.${timestamp}@teleheart.com`;
  const adminEmail = `admin.${timestamp}@teleheart.com`;

  let doctorToken = "";
  let adminToken = "";
  let doctorUserId = "";
  let adminUserId = "";

  beforeAll(async () => {
    // 1. Registrasi & Login Dokter
    const docReg = await request(app)
      .post("/api/v1/auth/register/doctor")
      .send({
        full_name: "dr. Andi Kardiologi",
        email: doctorEmail,
        password: "password123",
        str_number: "STR-" + String(timestamp).slice(-6),
        sip_number: "SIP-123456",
        specialization: "Spesialis Jantung",
        workplace: "RS Jantung Jakarta",
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

    // 2. Buat Akun Admin Langsung di Supabase untuk Test Verifikasi
    const { data: authAdmin } = await supabaseAdmin.auth.admin.createUser({
      email: adminEmail,
      password: "adminpassword123",
      email_confirm: true,
      user_metadata: { role: "admin", full_name: "Super Admin" },
    });
    adminUserId = authAdmin.user!.id;

    await supabaseAdmin.from("users").insert({
      id: adminUserId,
      role: "admin",
      full_name: "Super Admin",
      email: adminEmail,
      is_active: true,
    });

    const adminLogin = await request(app)
      .post("/api/v1/auth/login")
      .set("X-Client-Platform", "web")
      .send({ email: adminEmail, password: "adminpassword123" });
    adminToken = adminLogin.body?.data?.access_token;
  }, 40000);

  afterAll(async () => {
    if (doctorUserId) await supabaseAdmin.auth.admin.deleteUser(doctorUserId);
    if (adminUserId) await supabaseAdmin.auth.admin.deleteUser(adminUserId);
  });

  describe("Tarif Platform", () => {
    it("GET /api/v1/platform-fee/current -> Harus mengembalikan tarif platform aktif (200)", async () => {
      const res = await request(app).get("/api/v1/platform-fee/current");

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty("amount");
      expect(res.body.data.amount).toBeGreaterThanOrEqual(0);
      expect(res.body.data).toHaveProperty("effective_from");
    });
  });

  describe("Pengaturan Tarif Dokter", () => {
    it("PUT /api/v1/doctors/me/tariffs -> Dokter mengatur tarif konsultasi (200)", async () => {
      const res = await request(app)
        .put("/api/v1/doctors/me/tariffs")
        .set("Authorization", `Bearer ${doctorToken}`)
        .send({
          tariffs: [
            { duration_minutes: 15, price: 50000, is_active: true },
            { duration_minutes: 30, price: 90000, is_active: true },
            { duration_minutes: 60, price: 160000, is_active: false },
          ],
        });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(3);
    });

    it("GET /api/v1/doctors/me/tariffs -> Dokter mengambil daftar tarif miliknya (200)", async () => {
      const res = await request(app)
        .get("/api/v1/doctors/me/tariffs")
        .set("Authorization", `Bearer ${doctorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.some((t: any) => t.duration_minutes === 15 && t.price === 50000)).toBe(true);
    });
  });

  describe("Status Online Dokter & Verifikasi Admin", () => {
    it("Dokter yang statusnya masih 'pending' harus ditolak ketika mencoba online (403 DOCTOR_NOT_APPROVED)", async () => {
      const res = await request(app)
        .patch("/api/v1/doctors/me/online")
        .set("Authorization", `Bearer ${doctorToken}`)
        .send({ is_online: true });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("DOCTOR_NOT_APPROVED");
    });

    it("Admin menyetujui akun dokter PATCH /api/v1/admin/doctors/:id/verification (200)", async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/doctors/${doctorUserId}/verification`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "approved" });

      expect(res.status).toBe(200);
      expect(res.body.data.verification_status).toBe("approved");
    });

    it("Dokter yang sudah approved berhasil mengubah status menjadi online (200)", async () => {
      const res = await request(app)
        .patch("/api/v1/doctors/me/online")
        .set("Authorization", `Bearer ${doctorToken}`)
        .send({ is_online: true });

      expect(res.status).toBe(200);
      expect(res.body.data.is_online).toBe(true);
    });
  });

  describe("Pencarian & Detail Dokter (Sisi Pasien / Publik)", () => {
    it("GET /api/v1/doctors -> Menampilkan daftar dokter online dan approved beserta snapshot harga total (200)", async () => {
      const res = await request(app).get("/api/v1/doctors");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("data");
      expect(res.body).toHaveProperty("meta");
      expect(Array.isArray(res.body.data)).toBe(true);

      const targetDoctor = res.body.data.find((d: any) => d.id === doctorUserId);
      expect(targetDoctor).toBeDefined();
      expect(targetDoctor.full_name).toBe("dr. Andi Kardiologi");
      expect(targetDoctor.is_available).toBe(true);

      // Cek kalkulasi harga (hanya durasi yang is_active = true)
      expect(targetDoctor.prices.length).toBe(2); // 15 dan 30 menit
      const price15 = targetDoctor.prices.find((p: any) => p.duration_minutes === 15);
      expect(price15.doctor_price).toBe(50000);
      expect(price15.platform_fee).toBeGreaterThan(0);
      expect(price15.total_price).toBe(price15.doctor_price + price15.platform_fee);
    });

    it("GET /api/v1/doctors/:id -> Menampilkan detail lengkap dokter (200)", async () => {
      const res = await request(app).get(`/api/v1/doctors/${doctorUserId}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(doctorUserId);
      expect(res.body.data.specialization).toBe("Spesialis Jantung");
      expect(res.body.data.is_online).toBe(true);
    });
  });

  describe("Update Profil Dokter Sendiri", () => {
    it("PUT /api/v1/doctors/me/profile -> Dokter memperbarui bio dan tempat praktik (200)", async () => {
      const res = await request(app)
        .put("/api/v1/doctors/me/profile")
        .set("Authorization", `Bearer ${doctorToken}`)
        .send({
          workplace: "Klinik Jantung Utama",
          bio: "Dokter spesialis jantung berpengalaman 10 tahun",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.workplace).toBe("Klinik Jantung Utama");
      expect(res.body.data.bio).toContain("10 tahun");
    });
  });
});

