import { Router } from "express";
import { PaymentController } from "./controller.js";

const webhookRouter = Router();

// Endpoint publik Webhook Mayar
webhookRouter.post("/mayar", PaymentController.handleMayarWebhook);

export default webhookRouter;

