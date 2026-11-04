import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import crypto from "crypto";
import app from "../src/app.js";
import { supabaseAdmin } from "../src/lib/supabase.js";

describe("Notifications & Device Tokens Module Tests (Fase 10)", () => {
  const rand = crypto.randomBytes(4).toString("hex");
  const userEmail = `notif.user.${rand}@teleheart.com`;
  let userToken = "";
  let userId = "";
  let notificationId = "";
  const dummyFcmToken = `fcm_token_${rand}_device_android_999`;

  beforeAll(async () => {
    // 1. Registrasi & Login Pasien
    const regRes = await request(app)
      .post("/api/v1/auth/register/patient")
      .send({
        full_name: "Pasien Notifikasi",
        nik: "320101010190" + String(Math.floor(1000 + Math.random() * 9000)),
        birth_date: "1994-06-15",
        gender: "male",
        email: userEmail,
        password: "password123",
        consents: [
          { consent_type: "privacy_policy", version: "1.0" },
          { consent_type: "medical_data_processing", version: "1.0" },
        ],
      });
    userId = regRes.body?.data?.id;

    const loginRes = await request(app)
      .post("/api/v1/auth/login")
      .set("X-Client-Platform", "mobile")
      .send({ email: userEmail, password: "password123" });
    userToken = loginRes.body?.data?.access_token;

    // 2. Insert dummy notifications langsung ke database untuk pengujian get & mark read
    const { data: nData } = await supabaseAdmin
      .from("notifications")
      .insert([
        {
          user_id: userId,
          type: "consultation_accepted",
          title: "Konsultasi Dimulai",
          body: "Dokter telah menerima sesi konsultasi Anda",
          is_read: false,
        },
        {
          user_id: userId,
          type: "prescription_issued",
          title: "Resep Elektronik Terbit",
          body: "Dokter telah menerbitkan resep elektronik untuk Anda",
          is_read: false,
        },
      ])
      .select();

    if (nData && nData.length > 0) {
      notificationId = nData[0].id;
    }
  });

  afterAll(async () => {
    if (userId) await supabaseAdmin.auth.admin.deleteUser(userId);
  });

  describe("Pendaftaran & Pengelolaan Token Perangkat (Device Tokens)", () => {
    it("Menolak pendaftaran token jika fcm_token kosong (422)", async () => {
      const res = await request(app)
        .post("/api/v1/notifications/token")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ fcm_token: "" });

      expect(res.status).toBe(422);
    });

    it("Berhasil mendaftarkan FCM token perangkat baru pengguna (201)", async () => {
      const res = await request(app)
        .post("/api/v1/notifications/token")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          fcm_token: dummyFcmToken,
          platform: "android",
        });

      expect(res.status).toBe(201);
      expect(res.body.data.fcm_token).toBe(dummyFcmToken);
      expect(res.body.data.platform).toBe("android");
    });

    it("Upsert token perangkat jika didaftarkan ulang (201)", async () => {
      const res = await request(app)
        .post("/api/v1/notifications/token")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          fcm_token: dummyFcmToken,
          platform: "android",
        });

      expect(res.status).toBe(201);
      expect(res.body.data.fcm_token).toBe(dummyFcmToken);
    });
  });

  describe("Pengambilan Notifikasi In-App", () => {
    it("Pengguna dapat mengambil daftar notifikasi miliknya (200)", async () => {
      const res = await request(app)
        .get("/api/v1/notifications?limit=10")
        .set("Authorization", `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
      expect(res.body.meta?.unread_count).toBeGreaterThanOrEqual(2);
    });

    it("Mendukung filter notifikasi yang belum dibaca is_read=false (200)", async () => {
      const res = await request(app)
        .get("/api/v1/notifications?is_read=false")
        .set("Authorization", `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      res.body.data.forEach((n: any) => {
        expect(n.is_read).toBe(false);
      });
    });
  });

  describe("Menandai Notifikasi Dibaca", () => {
    it("Berhasil menandai 1 notifikasi telah dibaca (200)", async () => {
      const res = await request(app)
        .patch(`/api/v1/notifications/${notificationId}/read`)
        .set("Authorization", `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(notificationId);
      expect(res.body.data.is_read).toBe(true);
    });

    it("Berhasil menandai seluruh notifikasi telah dibaca (200)", async () => {
      const res = await request(app)
        .patch("/api/v1/notifications/read-all")
        .set("Authorization", `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.updated_count).toBeGreaterThanOrEqual(1);

      // Verifikasi ulang bahwa unread_count menjadi 0
      const checkRes = await request(app)
        .get("/api/v1/notifications?is_read=false")
        .set("Authorization", `Bearer ${userToken}`);

      expect(checkRes.body.meta?.unread_count).toBe(0);
    });
  });

  describe("Penghapusan Token Perangkat Saat Logout", () => {
    it("Berhasil menghapus token perangkat saat logout (200)", async () => {
      const res = await request(app)
        .delete("/api/v1/notifications/token")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ fcm_token: dummyFcmToken });

      expect(res.status).toBe(200);
      expect(res.body.data.success).toBe(true);
    });
  });
});
