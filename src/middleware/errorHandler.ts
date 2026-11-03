import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { sendError } from "../lib/response.js";

export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public details?: any[];

  constructor(statusCode: number, code: string, message: string, details?: any[]) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof AppError) {
    return sendError(res, err.statusCode, err.code, err.message, err.details);
  }

  if (err instanceof ZodError) {
    const details = err.errors.map((e) => ({
      field: e.path.join("."),
      message: e.message,
    }));
    return sendError(res, 422, "VALIDATION_ERROR", "Data tidak valid", details);
  }

  // Kesalahan format JSON body dari Express json parser
  if ("type" in err && (err as any).type === "entity.parse.failed") {
    return sendError(res, 400, "BAD_REQUEST", "Format JSON dalam request tidak valid");
  }

  console.error("Unhandled Internal Server Error:", err);
  return sendError(
    res,
    500,
    "INTERNAL_ERROR",
    "Terjadi kesalahan internal pada server"
  );
}

