import { Request, Response, NextFunction } from "express";
import { PredictionService } from "./service.js";
import {
  createPredictionLogSchema,
  getPredictionsQuerySchema,
} from "./schema.js";
import { sendSuccess } from "../../lib/response.js";

export class PredictionController {
  /**
   * POST /predictions
   * Pasien menyimpan kesimpulan hasil prediksi mandiri on-device
   */
  static async save(req: Request, res: Response, next: NextFunction) {
    try {
      const patientId = req.user!.id;
      const input = createPredictionLogSchema.parse(req.body);
      const result = await PredictionService.savePrediction(patientId, input);

      sendSuccess(res, result, 201);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /predictions/my-history
   * Pasien melihat riwayat prediksi mandiri miliknya
   */
  static async getMyHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const patientId = req.user!.id;
      const query = getPredictionsQuerySchema.parse(req.query);
      const result = await PredictionService.getPatientPredictionHistory(
        patientId,
        query
      );

      sendSuccess(res, result.history, 200, {
        total: result.total,
        page: result.page,
        limit: result.limit,
      });
    } catch (error) {
      next(error);
    }
  }
}

