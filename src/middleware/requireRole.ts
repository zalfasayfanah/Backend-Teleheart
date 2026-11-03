import { Request, Response, NextFunction } from "express";
import { AppError } from "./errorHandler.js";

export function requireRole(...allowedRoles: Array<"patient" | "doctor" | "admin">) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError(401, "UNAUTHORIZED", "Autentikasi diperlukan"));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new AppError(
          403,
          "FORBIDDEN",
          "Anda tidak memiliki hak akses untuk membuka sumber daya ini"
        )
      );
    }

    next();
  };
}

