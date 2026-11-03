import { Router, Request, Response } from "express";
import { sendSuccess } from "../../lib/response.js";

const healthRouter = Router();

healthRouter.get("/", (_req: Request, res: Response) => {
  return sendSuccess(res, {
    status: "ok",
    service: "teleheart-backend",
    timestamp: new Date().toISOString(),
  });
});

export default healthRouter;

