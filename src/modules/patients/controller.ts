import { Request, Response, NextFunction } from "express";
import { PatientService } from "./service.js";
import { sendSuccess } from "../../lib/response.js";

export class PatientController {
  // Profil Pribadi
  static async getOwnProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await PatientService.getOwnProfile(req.user!.id);
      return sendSuccess(res, data, 200);
    } catch (error) {
      next(error);
    }
  }

  static async updateOwnProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await PatientService.updateOwnProfile(req.user!.id, req.body);
      return sendSuccess(res, data, 200);
    } catch (error) {
      next(error);
    }
  }

  // Riwayat Penyakit
  static async getMedicalHistories(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await PatientService.getMedicalHistories(req.user!.id);
      return sendSuccess(res, data, 200);
    } catch (error) {
      next(error);
    }
  }

  static async addMedicalHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await PatientService.addMedicalHistory(req.user!.id, req.body);
      return sendSuccess(res, data, 201);
    } catch (error) {
      next(error);
    }
  }

  static async updateMedicalHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const data = await PatientService.updateMedicalHistory(req.user!.id, id, req.body);
      return sendSuccess(res, data, 200);
    } catch (error) {
      next(error);
    }
  }

  static async deleteMedicalHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const data = await PatientService.deleteMedicalHistory(req.user!.id, id);
      return sendSuccess(res, data, 200);
    } catch (error) {
      next(error);
    }
  }

  // Obat Rutin
  static async getMedications(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await PatientService.getMedications(req.user!.id);
      return sendSuccess(res, data, 200);
    } catch (error) {
      next(error);
    }
  }

  static async addMedication(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await PatientService.addMedication(req.user!.id, req.body);
      return sendSuccess(res, data, 201);
    } catch (error) {
      next(error);
    }
  }

  static async updateMedication(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const data = await PatientService.updateMedication(req.user!.id, id, req.body);
      return sendSuccess(res, data, 200);
    } catch (error) {
      next(error);
    }
  }

  static async deleteMedication(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const data = await PatientService.deleteMedication(req.user!.id, id);
      return sendSuccess(res, data, 200);
    } catch (error) {
      next(error);
    }
  }

  // Alergi
  static async getAllergies(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await PatientService.getAllergies(req.user!.id);
      return sendSuccess(res, data, 200);
    } catch (error) {
      next(error);
    }
  }

  static async addAllergy(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await PatientService.addAllergy(req.user!.id, req.body);
      return sendSuccess(res, data, 201);
    } catch (error) {
      next(error);
    }
  }

  static async updateAllergy(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const data = await PatientService.updateAllergy(req.user!.id, id, req.body);
      return sendSuccess(res, data, 200);
    } catch (error) {
      next(error);
    }
  }

  static async deleteAllergy(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const data = await PatientService.deleteAllergy(req.user!.id, id);
      return sendSuccess(res, data, 200);
    } catch (error) {
      next(error);
    }
  }

  // Akses Dokter
  static async getPatientProfileByDoctor(req: Request, res: Response, next: NextFunction) {
    try {
      const patientId = req.params.id as string;
      const clientIp = req.ip || req.socket.remoteAddress;
      const data = await PatientService.getPatientProfileByDoctor(
        patientId,
        req.user!.id,
        clientIp
      );
      return sendSuccess(res, data, 200);
    } catch (error) {
      next(error);
    }
  }
}
