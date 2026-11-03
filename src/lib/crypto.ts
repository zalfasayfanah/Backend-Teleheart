import crypto from "crypto";
import { env } from "../config/env.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM standard IV length
const TAG_LENGTH = 16;

/**
 * Mendapatkan Buffer 32 byte key dari environment variable
 */
function getEncryptionKey(): Buffer {
  const hexKey = env.NIK_ENCRYPTION_KEY || "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  return Buffer.from(hexKey, "hex");
}

/**
 * Enkripsi NIK menggunakan AES-256-GCM
 * Format hasil: iv:ciphertext:authTag (hex)
 */
export function encryptNik(nik: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(nik, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return `${iv.toString("hex")}:${encrypted}:${authTag}`;
}

/**
 * Dekripsi NIK
 */
export function decryptNik(encryptedData: string): string {
  const parts = encryptedData.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted format");
  }

  const [ivHex, ciphertext, tagHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(tagHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Hash NIK menggunakan SHA-256 + PEPPER untuk pengecekan duplikasi
 */
export function hashNik(nik: string): string {
  const pepper = env.NIK_HASH_PEPPER || "teleheart_default_pepper";
  return crypto.createHmac("sha256", pepper).update(nik).digest("hex");
}

/**
 * Masking NIK: 16 digit -> 12 bintang + 4 digit terakhir
 * Contoh: 3374010101900001 -> ************0001
 */
export function maskNik(nik: string): string {
  if (!nik || nik.length < 4) return "****************";
  const lastFour = nik.slice(-4);
  return "************" + lastFour;
}

