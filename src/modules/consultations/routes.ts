import { Router } from "express";
import { ConsultationController } from "./controller.js";
import { authMiddleware } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/requireRole.js";
import { validate } from "../../middleware/validate.js";
import { createConsultationSchema, submitVitalsSchema, checkoutSchema } from "./schema.js";

const consultationRouter = Router();

// Semua endpoint konsultasi butuh login
consultationRouter.use(authMiddleware);

// Pasien membuat sesi konsultasi baru (draft)
consultationRouter.post(
  "/",
  requireRole("patient"),
  validate({ body: createConsultationSchema }),
  ConsultationController.createConsultation
);

// Pasien mengirim tanda vital (hanya saat draft)
consultationRouter.post(
  "/:id/vitals",
  requireRole("patient"),
  validate({ body: submitVitalsSchema }),
  ConsultationController.submitVitals
);

// Pasien melakukan checkout pembayaran via Mayar
consultationRouter.post(
  "/:id/checkout",
  requireRole("patient"),
  validate({ body: checkoutSchema }),
  ConsultationController.checkout
);

// Pasien membatalkan konsultasi (hanya draft atau waiting_payment)
consultationRouter.post(
  "/:id/cancel",
  requireRole("patient"),
  ConsultationController.cancelConsultation
);

// Pasien / Dokter melihat daftar konsultasi
consultationRouter.get("/", ConsultationController.getConsultations);

// Pasien / Dokter melihat detail konsultasi
consultationRouter.get("/:id", ConsultationController.getConsultationDetail);

export default consultationRouter;

