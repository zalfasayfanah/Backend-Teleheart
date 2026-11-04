import { z } from "zod";

export const getAdminUsersQuerySchema = z.object({
  role: z.enum(["patient", "doctor", "admin"]).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const getAdminTransactionsQuerySchema = z.object({
  status: z.enum(["pending", "paid", "expired", "failed", "refunded"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const getAdminAuditLogsQuerySchema = z.object({
  action: z.string().optional(),
  actor_id: z.string().uuid("actor_id harus berformat UUID").optional(),
  resource_type: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const processRefundSchema = z
  .object({
    payment_id: z.string().uuid("payment_id harus berupa UUID").optional(),
    consultation_id: z.string().uuid("consultation_id harus berupa UUID").optional(),
    reason: z
      .string({ required_error: "Alasan refund wajib diisi" })
      .min(3, "Alasan refund minimal 3 karakter")
      .max(500, "Alasan refund maksimal 500 karakter"),
  })
  .refine((data) => data.payment_id || data.consultation_id, {
    message: "Harus menyertakan setidaknya salah satu dari payment_id atau consultation_id",
  });

export type GetAdminUsersQueryInput = z.infer<typeof getAdminUsersQuerySchema>;
export type GetAdminTransactionsQueryInput = z.infer<typeof getAdminTransactionsQuerySchema>;
export type GetAdminAuditLogsQueryInput = z.infer<typeof getAdminAuditLogsQuerySchema>;
export type ProcessRefundInput = z.infer<typeof processRefundSchema>;
