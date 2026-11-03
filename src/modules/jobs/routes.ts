import { Router, Request, Response, NextFunction } from "express";
import { ConsultationTimeoutJob } from "../../jobs/consultationTimeoutJob.js";
import { env } from "../../config/env.js";
import { sendSuccess, sendError } from "../../lib/response.js";

const jobsRouter = Router();

jobsRouter.post("/check-timeouts", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const expectedSecret = env.JOBS_SECRET;
    const providedSecret =
      (req.headers["x-jobs-secret"] as string) ||
      (req.query.secret as string) ||
      req.headers.authorization?.replace(/^Bearer\s+/i, "");

    if (expectedSecret && providedSecret !== expectedSecret) {
      return sendError(res, 401, "UNAUTHORIZED_JOBS_SECRET", "Secret job tidak valid");
    }

    const summary = await ConsultationTimeoutJob.runAll();
    return sendSuccess(res, summary, 200);
  } catch (error) {
    next(error);
  }
});

export default jobsRouter;

