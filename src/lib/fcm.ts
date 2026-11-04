import crypto from "crypto";
import { env } from "../config/env.js";
import { supabaseAdmin } from "./supabase.js";

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface InAppNotificationOptions {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, any>;
}

export class FcmService {
  private static cachedAccessToken: { token: string; expiresAt: number } | null = null;

  /**
   * Menghasilkan Google OAuth2 Access Token dari Service Account secara mandiri
   * Menggunakan RS256 native Node.js crypto tanpa dependensi eksternal berat
   */
  private static async getGoogleAccessToken(): Promise<string | null> {
    const projectId = env.FIREBASE_PROJECT_ID;
    const clientEmail = env.FIREBASE_CLIENT_EMAIL;
    let privateKey = env.FIREBASE_PRIVATE_KEY;

    if (!projectId || !clientEmail || !privateKey) {
      return null;
    }

    // Tangani format newlines jika private key tersimpan sebagai single line \n
    privateKey = privateKey.replace(/\\n/g, "\n");

    const now = Math.floor(Date.now() / 1000);

    // Cek cache token (masih berlaku minimal 5 menit)
    if (this.cachedAccessToken && this.cachedAccessToken.expiresAt > now + 300) {
      return this.cachedAccessToken.token;
    }

    try {
      const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
      const claimSet = Buffer.from(
        JSON.stringify({
          iss: clientEmail,
          scope: "https://www.googleapis.com/auth/firebase.messaging",
          aud: "https://oauth2.googleapis.com/token",
          exp: now + 3600,
          iat: now,
        })
      ).toString("base64url");

      const signInput = `${header}.${claimSet}`;
      const signer = crypto.createSign("RSA-SHA256");
      signer.update(signInput);
      const signature = signer.sign(privateKey, "base64url");
      const jwt = `${signInput}.${signature}`;

      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion: jwt,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.warn("⚠️ Gagal memperoleh Google OAuth Token untuk FCM:", errText);
        return null;
      }

      const tokenData = (await res.json()) as { access_token: string; expires_in: number };
      this.cachedAccessToken = {
        token: tokenData.access_token,
        expiresAt: now + (tokenData.expires_in || 3600),
      };

      return this.cachedAccessToken.token;
    } catch (err: any) {
      console.warn("⚠️ Error saat membuat JWT Service Account Firebase:", err.message);
      return null;
    }
  }

  /**
   * Mengirim push notification ke satu atau banyak token FCM
   */
  static async sendPushNotification(
    tokens: string | string[],
    title: string,
    body: string,
    dataPayload?: Record<string, string>
  ): Promise<{ success: number; failure: number; simulated?: boolean }> {
    const tokenList = Array.isArray(tokens) ? tokens : [tokens];
    const validTokens = tokenList.filter((t) => t && t.trim().length > 0);

    if (validTokens.length === 0) {
      return { success: 0, failure: 0 };
    }

    const projectId = env.FIREBASE_PROJECT_ID;
    const accessToken = await this.getGoogleAccessToken();

    // Mode Simulasi jika kredensial Firebase belum dikonfigurasi di environment
    if (!projectId || !accessToken) {
      return {
        success: validTokens.length,
        failure: 0,
        simulated: true,
      };
    }

    let successCount = 0;
    let failureCount = 0;

    // Kirim pesan via FCM HTTP v1 API
    const sendPromises = validTokens.map(async (token) => {
      try {
        const res = await fetch(
          `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              message: {
                token,
                notification: {
                  title,
                  body,
                },
                data: dataPayload || {},
              },
            }),
          }
        );

        if (res.ok) {
          successCount++;
        } else {
          failureCount++;
          // Jika token sudah expired / unregistered, bersihkan dari database
          if (res.status === 404 || res.status === 400) {
            await supabaseAdmin.from("device_tokens").delete().eq("fcm_token", token);
          }
        }
      } catch {
        failureCount++;
      }
    });

    await Promise.allSettled(sendPromises);

    return {
      success: successCount,
      failure: failureCount,
    };
  }

  /**
   * Menyimpan notifikasi in-app ke tabel notifications dan memicu push notification ke perangkat
   */
  static async sendInAppAndPushNotification(options: InAppNotificationOptions) {
    const { userId, type, title, body, data } = options;

    // 1. Simpan ke database Supabase (In-App notification)
    const { data: notification, error: nErr } = await supabaseAdmin
      .from("notifications")
      .insert({
        user_id: userId,
        type,
        title,
        body,
        data: data || {},
        is_read: false,
      })
      .select()
      .single();

    if (nErr || !notification) {
      console.error("❌ Gagal menyimpan notifikasi ke DB:", nErr);
    }

    // 2. Ambil token perangkat pengguna
    const { data: devices } = await supabaseAdmin
      .from("device_tokens")
      .select("fcm_token")
      .eq("user_id", userId);

    if (devices && devices.length > 0) {
      const fcmTokens = devices.map((d: any) => d.fcm_token);
      const stringifiedData: Record<string, string> = {};
      if (data) {
        for (const [key, val] of Object.entries(data)) {
          stringifiedData[key] = typeof val === "string" ? val : JSON.stringify(val);
        }
      }

      await this.sendPushNotification(fcmTokens, title, body, stringifiedData);
    }

    return notification;
  }
}
