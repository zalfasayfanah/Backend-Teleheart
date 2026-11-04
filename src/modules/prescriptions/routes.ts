import express from "express";
import { PrescriptionController } from "./controller.js";
import { authMiddleware } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/requireRole.js";

// Router untuk konsultasi: /api/v1/consultations/:id/prescription
export const prescriptionConsultationRouter = express.Router({ mergeParams: true });

prescriptionConsultationRouter.post(
  "/",
  authMiddleware,
  requireRole("doctor"),
  PrescriptionController.saveDraft
);

prescriptionConsultationRouter.post(
  "/issue",
  authMiddleware,
  requireRole("doctor"),
  PrescriptionController.issue
);

prescriptionConsultationRouter.get(
  "/",
  authMiddleware,
  PrescriptionController.getByConsultation
);

// Router unduh resep: /api/v1/prescriptions/:id/download
export const prescriptionRouter = express.Router();

prescriptionRouter.get(
  "/:id/download",
  authMiddleware,
  PrescriptionController.download
);

// Router verifikasi publik: /api/v1/public/prescriptions/verify/:code (Tanpa Auth)
export const publicPrescriptionRouter = express.Router();

publicPrescriptionRouter.get(
  "/verify/:code",
  PrescriptionController.verifyPublic
);
