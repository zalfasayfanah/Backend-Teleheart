import { Router } from "express";
import { DoctorController } from "./controller.js";
import { ConsultationController } from "../consultations/controller.js";
import { authMiddleware } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/requireRole.js";
import { validate } from "../../middleware/validate.js";
import {
  doctorQuerySchema,
  updateDoctorProfileSchema,
  updateOnlineStatusSchema,
  updateTariffsSchema,
  verifyDoctorSchema,
} from "./schema.js";

export const doctorRouter = Router();

// Sisi Dokter Sendiri (Perlu Autentikasi Dokter)
// NOTE: Letakkan route /me/... LEBIH DULU daripada /:id agar tidak tertelan sebagai parameter ID
doctorRouter.get("/me/queue", authMiddleware, requireRole("doctor"), ConsultationController.getDoctorQueue);
doctorRouter.get("/me/profile", authMiddleware, requireRole("doctor"), DoctorController.getOwnProfile);
doctorRouter.put(
  "/me/profile",
  authMiddleware,
  requireRole("doctor"),
  validate({ body: updateDoctorProfileSchema }),
  DoctorController.updateOwnProfile
);
doctorRouter.patch(
  "/me/online",
  authMiddleware,
  requireRole("doctor"),
  validate({ body: updateOnlineStatusSchema }),
  DoctorController.updateOnlineStatus
);
doctorRouter.get("/me/tariffs", authMiddleware, requireRole("doctor"), DoctorController.getOwnTariffs);
doctorRouter.put(
  "/me/tariffs",
  authMiddleware,
  requireRole("doctor"),
  validate({ body: updateTariffsSchema }),
  DoctorController.updateOwnTariffs
);

// Pasien & Publik
doctorRouter.get("/", validate({ query: doctorQuerySchema }), DoctorController.getApprovedOnlineDoctors);
doctorRouter.get("/:id", DoctorController.getDoctorDetail);

// Router Admin Khusus Dokter
export const adminDoctorRouter = Router();
adminDoctorRouter.use(authMiddleware, requireRole("admin"));
adminDoctorRouter.patch(
  "/:id/verification",
  validate({ body: verifyDoctorSchema }),
  DoctorController.verifyDoctor
);

// Router Tarif Platform
export const platformFeeRouter = Router();
platformFeeRouter.get("/current", DoctorController.getCurrentPlatformFee);

