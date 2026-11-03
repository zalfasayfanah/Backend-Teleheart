import { Router } from "express";
import { AuthController } from "./controller.js";
import { validate } from "../../middleware/validate.js";
import { authMiddleware } from "../../middleware/auth.js";
import {
  registerPatientSchema,
  registerDoctorSchema,
  loginSchema,
  refreshTokenSchema,
} from "./schema.js";

const authRouter = Router();

// Publik
authRouter.post("/register/patient", validate({ body: registerPatientSchema }), AuthController.registerPatient);
authRouter.post("/register/doctor", validate({ body: registerDoctorSchema }), AuthController.registerDoctor);
authRouter.post("/login", validate({ body: loginSchema }), AuthController.login);
authRouter.post("/refresh", validate({ body: refreshTokenSchema }), AuthController.refresh);

// Perlu Autentikasi
authRouter.post("/logout", authMiddleware, AuthController.logout);
authRouter.get("/me", authMiddleware, AuthController.getMe);

export default authRouter;
