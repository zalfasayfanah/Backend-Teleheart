import express from "express";
import { AdminController } from "./controller.js";
import { authMiddleware } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/requireRole.js";

const adminRouter = express.Router();

// Seluruh endpoint admin diproteksi ketat: Wajib login & role 'admin'
adminRouter.use(authMiddleware);
adminRouter.use(requireRole("admin"));

adminRouter.get("/users", AdminController.getUsers);
adminRouter.get("/transactions", AdminController.getTransactions);
adminRouter.get("/audit-logs", AdminController.getAuditLogs);
adminRouter.post("/refunds", AdminController.processRefund);

export default adminRouter;
