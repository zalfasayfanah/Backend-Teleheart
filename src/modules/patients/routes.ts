import { Router } from "express";
import { PatientController } from "./controller.js";
import { authMiddleware } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/requireRole.js";
import { validate } from "../../middleware/validate.js";
import {
  updatePatientProfileSchema,
  createMedicalHistorySchema,
  updateMedicalHistorySchema,
  createMedicationSchema,
  updateMedicationSchema,
  createAllergySchema,
  updateAllergySchema,
} from "./schema.js";

const patientRouter = Router();

// Semua endpoint pasien memerlukan autentikasi
patientRouter.use(authMiddleware);

// Profil Pasien Milik Sendiri (Hanya role: patient)
patientRouter.get("/me/profile", requireRole("patient"), PatientController.getOwnProfile);
patientRouter.put(
  "/me/profile",
  requireRole("patient"),
  validate({ body: updatePatientProfileSchema }),
  PatientController.updateOwnProfile
);

// Riwayat Penyakit (Medical Histories)
patientRouter.get("/me/medical-histories", requireRole("patient"), PatientController.getMedicalHistories);
patientRouter.post(
  "/me/medical-histories",
  requireRole("patient"),
  validate({ body: createMedicalHistorySchema }),
  PatientController.addMedicalHistory
);
patientRouter.put(
  "/me/medical-histories/:id",
  requireRole("patient"),
  validate({ body: updateMedicalHistorySchema }),
  PatientController.updateMedicalHistory
);
patientRouter.delete(
  "/me/medical-histories/:id",
  requireRole("patient"),
  PatientController.deleteMedicalHistory
);

// Obat Rutin (Medications)
patientRouter.get("/me/medications", requireRole("patient"), PatientController.getMedications);
patientRouter.post(
  "/me/medications",
  requireRole("patient"),
  validate({ body: createMedicationSchema }),
  PatientController.addMedication
);
patientRouter.put(
  "/me/medications/:id",
  requireRole("patient"),
  validate({ body: updateMedicationSchema }),
  PatientController.updateMedication
);
patientRouter.delete(
  "/me/medications/:id",
  requireRole("patient"),
  PatientController.deleteMedication
);

// Alergi (Allergies)
patientRouter.get("/me/allergies", requireRole("patient"), PatientController.getAllergies);
patientRouter.post(
  "/me/allergies",
  requireRole("patient"),
  validate({ body: createAllergySchema }),
  PatientController.addAllergy
);
patientRouter.put(
  "/me/allergies/:id",
  requireRole("patient"),
  validate({ body: updateAllergySchema }),
  PatientController.updateAllergy
);
patientRouter.delete(
  "/me/allergies/:id",
  requireRole("patient"),
  PatientController.deleteAllergy
);

// Akses Profil Pasien oleh Dokter (Hanya role: doctor)
patientRouter.get("/:id/profile", requireRole("doctor"), PatientController.getPatientProfileByDoctor);

export default patientRouter;

