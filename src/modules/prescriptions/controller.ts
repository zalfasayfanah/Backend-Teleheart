import { Request, Response, NextFunction } from "express";
import { PrescriptionService } from "./service.js";
import { savePrescriptionSchema } from "./schema.js";
import { sendSuccess } from "../../lib/response.js";

export class PrescriptionController {
  /**
   * POST /consultations/:id/prescription
   * Menyimpan atau memperbarui draft resep dokter
   */
  static async saveDraft(req: Request, res: Response, next: NextFunction) {
    try {
      const consultationId = req.params.id as string;
      const doctorId = req.user!.id;
      const validatedInput = savePrescriptionSchema.parse(req.body);

      const result = await PrescriptionService.savePrescriptionDraft(
        doctorId,
        consultationId,
        validatedInput
      );

      sendSuccess(res, result, 201);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /consultations/:id/prescription/issue
   * Menerbitkan resep obat resmi (status 'issued', buat PDF & QR code)
   */
  static async issue(req: Request, res: Response, next: NextFunction) {
    try {
      const consultationId = req.params.id as string;
      const doctorId = req.user!.id;

      const result = await PrescriptionService.issuePrescription(
        doctorId,
        consultationId
      );

      sendSuccess(res, result, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /consultations/:id/prescription
   * Mendapatkan detail resep untuk konsultasi tertentu
   */
  static async getByConsultation(req: Request, res: Response, next: NextFunction) {
    try {
      const consultationId = req.params.id as string;
      const userId = req.user!.id;
      const userRole = req.user!.role;

      const result = await PrescriptionService.getPrescriptionByConsultation(
        userId,
        userRole,
        consultationId
      );

      sendSuccess(res, result, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /prescriptions/:id/download
   * Mendapatkan signed URL untuk mengunduh dokumen PDF resep
   */
  static async download(req: Request, res: Response, next: NextFunction) {
    try {
      const prescriptionId = req.params.id as string;
      const userId = req.user!.id;
      const userRole = req.user!.role;

      const result = await PrescriptionService.getPrescriptionDownloadUrl(
        userId,
        userRole,
        prescriptionId
      );

      sendSuccess(res, result, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /public/prescriptions/verify/:code
   * Validasi keaslian resep secara publik (tanpa token login)
   */
  static async verifyPublic(req: Request, res: Response, next: NextFunction) {
    try {
      const code = req.params.code as string;
      const result = await PrescriptionService.verifyPrescriptionCode(code);

      sendSuccess(res, result, 200);
    } catch (error) {
      next(error);
    }
  }
}
