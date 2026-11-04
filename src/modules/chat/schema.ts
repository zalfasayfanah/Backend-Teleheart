import { z } from "zod";

export const sendMessageSchema = z.object({
  body: z.string().min(1, "Isi pesan tidak boleh kosong").max(5000, "Pesan maksimal 5000 karakter"),
});

export const markMessagesReadSchema = z.object({
  up_to_message_id: z.string().uuid().optional(),
});

export const getMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().uuid().optional(),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type MarkMessagesReadInput = z.infer<typeof markMessagesReadSchema>;
export type GetMessagesQueryInput = z.infer<typeof getMessagesQuerySchema>;

