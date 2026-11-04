import { Request, Response, NextFunction } from "express";
import { NotificationService } from "./service.js";
import {
  registerDeviceTokenSchema,
  getNotificationsQuerySchema,
} from "./schema.js";
import { sendSuccess } from "../../lib/response.js";

export class NotificationController {
  /**
   * POST /notifications/token
   * Mendaftarkan atau memperbarui token perangkat FCM
   */
  static async registerToken(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const input = registerDeviceTokenSchema.parse(req.body);
      const result = await NotificationService.registerToken(userId, input);

      sendSuccess(res, result, 201);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /notifications/token
   * Menghapus token perangkat saat logout
   */
  static async unregisterToken(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const fcmToken = req.body?.fcm_token || "";
      const result = await NotificationService.unregisterToken(userId, fcmToken);

      sendSuccess(res, result, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /notifications
   * Mengambil daftar notifikasi pengguna
   */
  static async getNotifications(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const query = getNotificationsQuerySchema.parse(req.query);
      const result = await NotificationService.getNotifications(userId, query);

      sendSuccess(res, result.notifications, 200, {
        total: result.total,
        unread_count: result.unread_count,
        page: result.page,
        limit: result.limit,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /notifications/:id/read
   * Menandai 1 notifikasi telah dibaca
   */
  static async markAsRead(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const id = req.params.id as string;
      const result = await NotificationService.markAsRead(userId, id);

      sendSuccess(res, result, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /notifications/read-all
   * Menandai seluruh notifikasi telah dibaca
   */
  static async markAllAsRead(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const result = await NotificationService.markAllAsRead(userId);

      sendSuccess(res, result, 200);
    } catch (error) {
      next(error);
    }
  }
}

