import { Request, Response, NextFunction } from "express";
import { AuthService } from "./service.js";
import { sendSuccess } from "../../lib/response.js";
import { supabaseAnon } from "../../lib/supabase.js";

export class AuthController {
  static async registerPatient(req: Request, res: Response, next: NextFunction) {
    try {
      const clientIp = req.ip || req.socket.remoteAddress;
      const result = await AuthService.registerPatient(req.body, clientIp);
      return sendSuccess(res, result, 201);
    } catch (error) {
      next(error);
    }
  }

  static async registerDoctor(req: Request, res: Response, next: NextFunction) {
    try {
      const clientIp = req.ip || req.socket.remoteAddress;
      const result = await AuthService.registerDoctor(req.body, clientIp);
      return sendSuccess(res, result, 201);
    } catch (error) {
      next(error);
    }
  }

  static async login(req: Request, res: Response, next: NextFunction) {
    try {
      const platform = req.headers["x-client-platform"] as string;
      const result = await AuthService.login(req.body, platform);
      return sendSuccess(res, result, 200);
    } catch (error) {
      next(error);
    }
  }

  static async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AuthService.refreshSession(req.body);
      return sendSuccess(res, result, 200);
    } catch (error) {
      next(error);
    }
  }

  static async logout(_req: Request, res: Response, next: NextFunction) {
    try {
      await supabaseAnon.auth.signOut();
      return sendSuccess(res, { message: "Berhasil keluar dari sesi" }, 200);
    } catch (error) {
      next(error);
    }
  }

  static async getMe(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AuthService.getMe(req.user!.id);
      return sendSuccess(res, result, 200);
    } catch (error) {
      next(error);
    }
  }
}

