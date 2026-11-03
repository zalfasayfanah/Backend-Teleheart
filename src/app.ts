import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { env } from "./config/env.js";
import healthRouter from "./modules/health/routes.js";
import authRouter from "./modules/auth/routes.js";
import patientRouter from "./modules/patients/routes.js";
import {
  doctorRouter,
  adminDoctorRouter,
  platformFeeRouter,
} from "./modules/doctors/routes.js";
import consultationRouter from "./modules/consultations/routes.js";
import webhookRouter from "./modules/payments/routes.js";
import jobsRouter from "./modules/jobs/routes.js";
import { AuthController } from "./modules/auth/controller.js";
import { authMiddleware } from "./middleware/auth.js";
import { errorHandler, AppError } from "./middleware/errorHandler.js";
import { sendError } from "./lib/response.js";

const app = express();

// Middleware dasar
const allowedOrigins = env.CORS_ALLOWED_ORIGINS === "*"
  ? "*"
  : env.CORS_ALLOWED_ORIGINS.split(",").map((origin) => origin.trim());

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Router Utama API v1
const apiV1Router = express.Router();

// Mount modul-modul API v1
apiV1Router.use("/health", healthRouter);
apiV1Router.use("/auth", authRouter);
apiV1Router.use("/patients", patientRouter);
apiV1Router.use("/doctors", doctorRouter);
apiV1Router.use("/admin/doctors", adminDoctorRouter);
apiV1Router.use("/platform-fee", platformFeeRouter);
apiV1Router.use("/consultations", consultationRouter);
apiV1Router.use("/webhooks", webhookRouter);
apiV1Router.use("/jobs", jobsRouter);
apiV1Router.get("/me", authMiddleware, AuthController.getMe);

// Pasang /api/v1 dan /v1 ke Express (kompatibilitas Netlify Functions)
app.use("/api/v1", apiV1Router);
app.use("/v1", apiV1Router);

// Tangani route yang tidak terdaftar (404 Not Found)
app.use((req: Request, res: Response, next: NextFunction) => {
  next(new AppError(404, "NOT_FOUND", `Endpoint ${req.method} ${req.originalUrl} tidak ditemukan`));
});

// Centralized error handler
app.use(errorHandler);

export default app;

