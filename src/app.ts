import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { env } from "./config/env.js";
import healthRouter from "./modules/health/routes.js";
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

// Pasang /api/v1 ke Express
app.use("/api/v1", apiV1Router);

// Tangani route yang tidak terdaftar (404 Not Found)
app.use((req: Request, res: Response, next: NextFunction) => {
  next(new AppError(404, "NOT_FOUND", `Endpoint ${req.method} ${req.originalUrl} tidak ditemukan`));
});

// Centralized error handler
app.use(errorHandler);

export default app;
