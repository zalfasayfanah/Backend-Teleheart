import { z } from "zod";

export const registerDeviceTokenSchema = z.object({
  fcm_token: z
    .string({ required_error: "FCM token wajib diisi" })
    .min(1, "FCM token tidak boleh kosong")
    .max(500, "FCM token maksimal 500 karakter"),
  platform: z.enum(["android", "ios", "web"]).default("android"),
});

export const getNotificationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  page: z.coerce.number().int().min(1).default(1),
  is_read: z
    .enum(["true", "false"])
    .optional()
    .transform((val) => (val === undefined ? undefined : val === "true")),
});

export type RegisterDeviceTokenInput = z.infer<typeof registerDeviceTokenSchema>;
export type GetNotificationsQueryInput = z.infer<typeof getNotificationsQuerySchema>;
