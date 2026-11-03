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

  static async checkout(req: Request, res: Response, next: NextFunction) {
    try {
      const consultationId = req.params.id as string;
      const data = await ConsultationService.checkout(consultationId, req.user!.id, req.body);
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

  static async getDoctorQueue(req: Request, res: Response, next: NextFunction) {
    try {
      const type = (req.query.type as "incoming" | "active") || "incoming";
      const data = await ConsultationService.getDoctorQueue(req.user!.id, type);
      return sendSuccess(res, data, 200);
    } catch (error) {
      next(error);
    }
  }

  static async acceptConsultation(req: Request, res: Response, next: NextFunction) {
    try {
      const consultationId = req.params.id as string;
      const data = await ConsultationService.acceptConsultation(consultationId, req.user!.id);
      return sendSuccess(res, data, 200);
    } catch (error) {
      next(error);
    }
  }

  static async rejectConsultation(req: Request, res: Response, next: NextFunction) {
    try {
      const consultationId = req.params.id as string;
      const reason = req.body?.reason;
      const data = await ConsultationService.rejectConsultation(consultationId, req.user!.id, reason);
      return sendSuccess(res, data, 200);
    } catch (error) {
      next(error);
    }
  }

  static async closeConsultation(req: Request, res: Response, next: NextFunction) {
    try {
      const consultationId = req.params.id as string;
      const doctorSummary = req.body?.doctor_summary;
      const data = await ConsultationService.closeConsultation(consultationId, req.user!.id, doctorSummary);
      return sendSuccess(res, data, 200);
    } catch (error) {
      next(error);
    }
  }

  static async getPatientHistoryForDoctor(req: Request, res: Response, next: NextFunction) {
    try {
      const patientId = req.params.id as string;
      const data = await ConsultationService.getPatientHistoryForDoctor(patientId, req.user!.id);
      return sendSuccess(res, data, 200);
    } catch (error) {
      next(error);
    }
  }
}

