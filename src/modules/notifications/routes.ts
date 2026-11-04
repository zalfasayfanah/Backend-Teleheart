import express from "express";
import { NotificationController } from "./controller.js";
import { authMiddleware } from "../../middleware/auth.js";

const notificationRouter = express.Router();

// Seluruh endpoint notifikasi membutuhkan autentikasi
notificationRouter.use(authMiddleware);

notificationRouter.post("/token", NotificationController.registerToken);
notificationRouter.delete("/token", NotificationController.unregisterToken);
notificationRouter.get("/", NotificationController.getNotifications);
notificationRouter.patch("/read-all", NotificationController.markAllAsRead);
notificationRouter.patch("/:id/read", NotificationController.markAsRead);

export default notificationRouter;
