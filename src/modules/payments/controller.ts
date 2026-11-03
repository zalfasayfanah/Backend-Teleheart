import { Request, Response, NextFunction } from "express";
import { PaymentService } from "./service.js";
import { sendSuccess } from "../../lib/response.js";

export class PaymentController {
  /**
   * Webhook endpoint untuk menerima notifikasi pembayaran sukses dari Mayar
   */
  static async handleMayarWebhook(req: Request, res: Response, next: NextFunction) {
    try {
      // Ambil token keamanan dari query parameter atau custom header
      const token =
        (req.query.token as string) ||
        (req.headers["x-mayar-token"] as string) ||
        (req.headers["authorization"]?.replace(/^Bearer\s+/i, ""));

      const result = await PaymentService.handleMayarWebhook(req.body, token);
      return sendSuccess(res, result, 200);
    } catch (error) {
      next(error);
    }
  }
}

