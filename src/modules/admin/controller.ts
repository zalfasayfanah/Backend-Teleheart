import { Request, Response, NextFunction } from "express";
import { AdminService } from "./service.js";
import {
  getAdminUsersQuerySchema,
  getAdminTransactionsQuerySchema,
  getAdminAuditLogsQuerySchema,
  processRefundSchema,
} from "./schema.js";
import { sendSuccess } from "../../lib/response.js";

export class AdminController {
  /**
   * GET /admin/users
   * Daftar seluruh pengguna sistem
   */
  static async getUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const query = getAdminUsersQuerySchema.parse(req.query);
      const result = await AdminService.getUsers(query);

      sendSuccess(res, result.users, 200, {
        total: result.total,
        page: result.page,
        limit: result.limit,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/transactions
   * Laporan transaksi keuangan (Metadata Only)
   */
  static async getTransactions(req: Request, res: Response, next: NextFunction) {
    try {
      const query = getAdminTransactionsQuerySchema.parse(req.query);
      const result = await AdminService.getTransactions(query);

      sendSuccess(res, result.transactions, 200, {
        total: result.total,
        page: result.page,
        limit: result.limit,
        summary: result.summary,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/audit-logs
   * Laporan aktivitas audit trail sistem
   */
  static async getAuditLogs(req: Request, res: Response, next: NextFunction) {
    try {
      const query = getAdminAuditLogsQuerySchema.parse(req.query);
      const result = await AdminService.getAuditLogs(query);

      sendSuccess(res, result.logs, 200, {
        total: result.total,
        page: result.page,
        limit: result.limit,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /admin/refunds
   * Memproses pengembalian dana transaksi
   */
  static async processRefund(req: Request, res: Response, next: NextFunction) {
    try {
      const adminId = req.user!.id;
      const input = processRefundSchema.parse(req.body);
      const ip = req.ip || req.socket.remoteAddress;

      const result = await AdminService.processRefund(adminId, input, ip);

      sendSuccess(res, result, 200);
    } catch (error) {
      next(error);
    }
  }
}
