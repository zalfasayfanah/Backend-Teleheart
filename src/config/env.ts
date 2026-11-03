import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(8888),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  
  SUPABASE_URL: z.string().url().default("https://cndxpqotturhmgsadfqi.supabase.co"),
  SUPABASE_ANON_KEY: z.string().min(1).default("sb_publishable_waahzjYMS4ELHyjYSNWNiA_CU4OagtO"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().default(""),

  MAYAR_API_KEY: z.string().optional().default(""),
  MAYAR_BASE_URL: z.string().optional().default("https://api.mayar.id/hl/v1"),
  MAYAR_WEBHOOK_SECRET: z.string().optional().default(""),

  FIREBASE_PROJECT_ID: z.string().optional().default(""),
  FIREBASE_CLIENT_EMAIL: z.string().optional().default(""),
  FIREBASE_PRIVATE_KEY: z.string().optional().default(""),

  NIK_ENCRYPTION_KEY: z.string().optional().default(""),
  NIK_HASH_PEPPER: z.string().optional().default(""),
  JOBS_SECRET: z.string().optional().default(""),

  CORS_ALLOWED_ORIGINS: z.string().default("*"),
  APP_BASE_URL: z.string().default("http://localhost:3000"),

  DOCTOR_RESPONSE_TIMEOUT_MINUTES: z.coerce.number().default(15),
  MAX_DOCTOR_REASSIGN: z.coerce.number().default(3),
  PAYMENT_INVOICE_TTL_MINUTES: z.coerce.number().default(60),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("❌ Kesalahan konfigurasi Environment Variables:", parsedEnv.error.format());
  throw new Error("Invalid environment variables");
}

export const env = parsedEnv.data;
