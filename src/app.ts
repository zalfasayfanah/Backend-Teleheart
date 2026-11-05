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
import adminRouter from "./modules/admin/routes.js";
import consultationRouter from "./modules/consultations/routes.js";
import {
  prescriptionRouter,
  publicPrescriptionRouter,
} from "./modules/prescriptions/routes.js";
import notificationRouter from "./modules/notifications/routes.js";
import predictionRouter from "./modules/predictions/routes.js";
import webhookRouter from "./modules/payments/routes.js";
import { mockPayRouter } from "./modules/payments/mockPayRoutes.js";
import jobsRouter from "./modules/jobs/routes.js";
import { AuthController } from "./modules/auth/controller.js";
import { authMiddleware } from "./middleware/auth.js";
import { errorHandler, AppError } from "./middleware/errorHandler.js";
import { sendError } from "./lib/response.js";

const app = express();

// Middleware dasar: Konfigurasi CORS Komprehensif (Flutter Web, Mobile, Portal Dokter)
const configuredOrigins = env.CORS_ALLOWED_ORIGINS === "*"
  ? ["*"]
  : env.CORS_ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean);

const isOriginAllowed = (origin: string | undefined): boolean => {
  // 1. Izinkan request tanpa header origin (mobile native apps, Postman, server-to-server)
  if (!origin) return true;

  // 2. Jika disetel wildcard '*'
  if (configuredOrigins.includes("*")) return true;

  // 3. Izinkan localhost & 127.0.0.1 dengan port berapa pun (Flutter Web, Vite, React, Next.js dev server)
  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  if (isLocalhost) return true;

  // 4. Izinkan domain yang terdaftar di environment variable CORS_ALLOWED_ORIGINS
  if (configuredOrigins.includes(origin)) return true;

  // 5. Izinkan domain staging Netlify / Vercel
  if (/^https:\/\/.*\.netlify\.app$/.test(origin) || /^https:\/\/.*\.vercel\.app$/.test(origin)) {
    return true;
  }

  return false;
};

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    callback(null, isOriginAllowed(origin));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Client-Platform",
    "X-Requested-With",
    "Accept",
    "Origin",
    "x-jobs-secret",
    "x-mayar-signature",
  ],
  exposedHeaders: ["Content-Disposition", "Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
  maxAge: 86400, // Cache preflight selama 24 jam untuk performa browser
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

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
apiV1Router.use("/admin", adminRouter);
apiV1Router.use("/platform-fee", platformFeeRouter);
apiV1Router.use("/consultations", consultationRouter);
apiV1Router.use("/prescriptions", prescriptionRouter);
apiV1Router.use("/public/prescriptions", publicPrescriptionRouter);
apiV1Router.use("/notifications", notificationRouter);
apiV1Router.use("/predictions", predictionRouter);
apiV1Router.use("/webhooks", webhookRouter);
apiV1Router.use("/payments", webhookRouter);
apiV1Router.use("/mock-pay", mockPayRouter);
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

