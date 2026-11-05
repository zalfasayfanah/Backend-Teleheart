import { z } from "zod";

export const sendMessageSchema = z
  .object({
    body: z.string().optional(),
    message: z.string().optional(),
    text: z.string().optional(),
    content: z.string().optional(),
  })
  .refine(
    (data) => {
      const val = data.body || data.message || data.text || data.content;
      return typeof val === "string" && val.trim().length > 0;
    },
    { message: "Isi pesan tidak boleh kosong" }
  );

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

