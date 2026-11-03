import { Request, Response, NextFunction } from "express";
import { ConsultationService } from "./service.js";
import { sendSuccess } from "../../lib/response.js";

export class ConsultationController {
  static async createConsultation(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await ConsultationService.createConsultation(req.user!.id, req.body);
      return sendSuccess(res, data, 201);
    } catch (error) {
      next(error);
    }
  }

  static async submitVitals(req: Request, res: Response, next: NextFunction) {
    try {
      const consultationId = req.params.id as string;
      const data = await ConsultationService.submitVitals(consultationId, req.user!.id, req.body);
      return sendSuccess(res, data, 201);
    } catch (error) {
      next(error);
    }
  }

  static async cancelConsultation(req: Request, res: Response, next: NextFunction) {
    try {
      const consultationId = req.params.id as string;
      const data = await ConsultationService.cancelConsultation(consultationId, req.user!.id);
      return sendSuccess(res, data, 200);
    } catch (error) {
      next(error);
    }
  }

  static async getConsultationDetail(req: Request, res: Response, next: NextFunction) {
    try {
      const consultationId = req.params.id as string;
      const data = await ConsultationService.getConsultationDetail(
        consultationId,
        req.user!.id,
        req.user!.role
      );
      return sendSuccess(res, data, 200);
    } catch (error) {
      next(error);
    }
  }

  static async getConsultations(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await ConsultationService.getConsultations(req.user!.id, req.user!.role);
      return sendSuccess(res, data, 200);
    } catch (error) {
      next(error);
    }
  }
}

