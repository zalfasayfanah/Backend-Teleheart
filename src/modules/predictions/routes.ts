import express from "express";
import { PredictionController } from "./controller.js";
import { authMiddleware } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/requireRole.js";

const predictionRouter = express.Router();

// Semua endpoint prediksi hanya boleh diakses oleh pasien (Dokter & Admin dilarang sesuai PRD)
predictionRouter.use(authMiddleware);
predictionRouter.use(requireRole("patient"));

predictionRouter.post("/", PredictionController.save);
predictionRouter.get("/my-history", PredictionController.getMyHistory);

export default predictionRouter;
