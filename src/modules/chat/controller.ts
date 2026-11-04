import { Request, Response, NextFunction } from "express";
import { ChatService } from "./service.js";
import { sendSuccess } from "../../lib/response.js";
import { GetMessagesQueryInput } from "./schema.js";

export class ChatController {
  static async sendMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const consultationId = req.params.id as string;
      const { body } = req.body;
      const data = await ChatService.sendTextMessage(consultationId, req.user!.id, body);
      return sendSuccess(res, data, 201);
    } catch (error) {
      next(error);
    }
  }

  static async uploadAttachment(req: Request, res: Response, next: NextFunction) {
    try {
      const consultationId = req.params.id as string;
      const file = req.file;
      const data = await ChatService.uploadAttachment(consultationId, req.user!.id, file);
      return sendSuccess(res, data, 201);
    } catch (error) {
      next(error);
    }
  }

  static async getMessages(req: Request, res: Response, next: NextFunction) {
    try {
      const consultationId = req.params.id as string;
      const query = req.query as unknown as GetMessagesQueryInput;
      const data = await ChatService.getMessages(consultationId, req.user!.id, query);
      return sendSuccess(res, data.data, 200, data.meta);
    } catch (error) {
      next(error);
    }
  }

  static async markMessagesRead(req: Request, res: Response, next: NextFunction) {
    try {
      const consultationId = req.params.id as string;
      const { up_to_message_id } = req.body || {};
      const data = await ChatService.markMessagesRead(consultationId, req.user!.id, up_to_message_id);
      return sendSuccess(res, data, 200);
    } catch (error) {
      next(error);
    }
  }
}
