import { Router } from "express";
import multer from "multer";
import { ChatController } from "./controller.js";
import { authMiddleware } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import {
  sendMessageSchema,
  markMessagesReadSchema,
  getMessagesQuerySchema,
} from "./schema.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});

export const chatRouter = Router({ mergeParams: true });

// Semua rute chat memerlukan autentikasi login (Pasien / Dokter)
chatRouter.use(authMiddleware);

// Kirim pesan teks
chatRouter.post(
  "/",
  validate({ body: sendMessageSchema }),
  ChatController.sendMessage
);

// Ambil riwayat pesan chat
chatRouter.get(
  "/",
  validate({ query: getMessagesQuerySchema }),
  ChatController.getMessages
);

// Tandai pesan telah terbaca
chatRouter.patch(
  "/read",
  validate({ body: markMessagesReadSchema }),
  ChatController.markMessagesRead
);

export const attachmentRouter = Router({ mergeParams: true });
attachmentRouter.use(authMiddleware);

// Unggah berkas gambar medis
attachmentRouter.post(
  "/",
  upload.single("file"),
  ChatController.uploadAttachment
);

