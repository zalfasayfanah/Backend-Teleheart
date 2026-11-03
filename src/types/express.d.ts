import { UserRole } from "../modules/auth/schema.js";

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: "patient" | "doctor" | "admin";
  full_name: string;
  is_active: boolean;
  doctor_verification_status?: "pending" | "approved" | "rejected" | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

