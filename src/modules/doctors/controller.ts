import { Request, Response, NextFunction } from "express";
import { DoctorService } from "./service.js";
import { sendSuccess } from "../../lib/response.js";

export class DoctorController {
  // Pasien & Publik
  static async getApprovedOnlineDoctors(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await DoctorService.getApprovedOnlineDoctors(req.query as any);
      return sendSuccess(res, result.data, 200, result.meta);
    } catch (error) {
      next(error);
    }
  }

  static async getDoctorDetail(req: Request, res: Response, next: NextFunction) {
    try {
      const doctorId = req.params.id as string;
      const data = await DoctorService.getDoctorDetail(doctorId);
      return sendSuccess(res, data, 200);
    } catch (error) {
      next(error);
    }
  }

  // Dokter Sendiri
  static async getOwnProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await DoctorService.getOwnDoctorProfile(req.user!.id);
      return sendSuccess(res, data, 200);
    } catch (error) {
      next(error);
    }
  }

  static async updateOwnProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await DoctorService.updateOwnDoctorProfile(req.user!.id, req.body);
      return sendSuccess(res, data, 200);
    } catch (error) {
      next(error);
    }
  }

  static async updateOnlineStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await DoctorService.updateOnlineStatus(req.user!.id, req.body.is_online);
      return sendSuccess(res, data, 200);
    } catch (error) {
      next(error);
    }
  }

  static async getOwnTariffs(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await DoctorService.getOwnTariffs(req.user!.id);
      return sendSuccess(res, data, 200);
    } catch (error) {
      next(error);
    }
  }

  static async updateOwnTariffs(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await DoctorService.updateOwnTariffs(req.user!.id, req.body.tariffs);
      return sendSuccess(res, data, 200);
    } catch (error) {
      next(error);
    }
  }

  // Tarif Platform
  static async getCurrentPlatformFee(_req: Request, res: Response, next: NextFunction) {
    try {
      const data = await DoctorService.getCurrentPlatformFee();
      return sendSuccess(res, data, 200);
    } catch (error) {
      next(error);
    }
  }

  // Admin Verifikasi
  static async verifyDoctor(req: Request, res: Response, next: NextFunction) {
    try {
      const doctorId = req.params.id as string;
      const clientIp = req.ip || req.socket.remoteAddress;
      const data = await DoctorService.verifyDoctor(doctorId, req.user!.id, req.body, clientIp);
      return sendSuccess(res, data, 200);
    } catch (error) {
      next(error);
    }
  }
}

