import { Response } from "express";

export interface ApiSuccessResponse<T> {
  data: T;
  meta?: Record<string, any>;
}

export interface ApiErrorDetail {
  field?: string;
  message: string;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: ApiErrorDetail[];
  };
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode = 200,
  meta?: Record<string, any>
): Response {
  const body: ApiSuccessResponse<T> = { data };
  if (meta) {
    body.meta = meta;
  }
  return res.status(statusCode).json(body);
}

export function sendError(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  details?: ApiErrorDetail[]
): Response {
  const body: ApiErrorResponse = {
    error: {
      code,
      message,
      ...(details && details.length > 0 ? { details } : {}),
    },
  };
  return res.status(statusCode).json(body);
}

