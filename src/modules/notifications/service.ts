import { supabaseAdmin } from "../../lib/supabase.js";
import { AppError } from "../../middleware/errorHandler.js";
import {
  RegisterDeviceTokenInput,
  GetNotificationsQueryInput,
} from "./schema.js";

export class NotificationService {
  /**
   * Mendaftarkan atau memperbarui token FCM perangkat pengguna
   */
  static async registerToken(userId: string, input: RegisterDeviceTokenInput) {
    const { fcm_token, platform } = input;

    const { data, error } = await supabaseAdmin
      .from("device_tokens")
      .upsert(
        {
          user_id: userId,
          fcm_token: fcm_token.trim(),
          platform,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "fcm_token" }
      )
      .select()
      .single();

    if (error || !data) {
      throw new AppError(500, "DATABASE_ERROR", "Gagal mendaftarkan token perangkat");
    }

    return data;
  }

  /**
   * Menghapus token perangkat saat logout
   */
  static async unregisterToken(userId: string, fcmToken: string) {
    const { error } = await supabaseAdmin
      .from("device_tokens")
      .delete()
      .eq("user_id", userId)
      .eq("fcm_token", fcmToken.trim());

    if (error) {
      throw new AppError(500, "DATABASE_ERROR", "Gagal menghapus token perangkat");
    }

    return { success: true };
  }

  /**
   * Mengambil daftar notifikasi in-app pengguna
   */
  static async getNotifications(userId: string, query: GetNotificationsQueryInput) {
    const { limit, page, is_read } = query;
    const offset = (page - 1) * limit;

    let dbQuery = supabaseAdmin
      .from("notifications")
      .select("*", { count: "exact" })
      .eq("user_id", userId);

    if (is_read !== undefined) {
      dbQuery = dbQuery.eq("is_read", is_read);
    }

    const { data: notifications, count, error } = await dbQuery
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new AppError(500, "DATABASE_ERROR", "Gagal mengambil daftar notifikasi");
    }

    // Hitung jumlah notifikasi yang belum dibaca
    const { count: unreadCount } = await supabaseAdmin
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_read", false);

    return {
      notifications: notifications || [],
      total: count || 0,
      unread_count: unreadCount || 0,
      page,
      limit,
    };
  }

  /**
   * Menandai 1 notifikasi telah dibaca
   */
  static async markAsRead(userId: string, notificationId: string) {
    const { data, error } = await supabaseAdmin
      .from("notifications")
      .update({ is_read: true })
      .eq("id", notificationId)
      .eq("user_id", userId)
      .select()
      .maybeSingle();

    if (error || !data) {
      throw new AppError(404, "NOT_FOUND", "Notifikasi tidak ditemukan");
    }

    return data;
  }

  /**
   * Menandai semua notifikasi pengguna telah dibaca
   */
  static async markAllAsRead(userId: string) {
    const { data, error } = await supabaseAdmin
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("is_read", false)
      .select("id");

    if (error) {
      throw new AppError(500, "DATABASE_ERROR", "Gagal memperbarui notifikasi");
    }

    return {
      updated_count: data?.length || 0,
    };
  }
}
