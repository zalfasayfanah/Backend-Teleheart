import { describe, it, expect } from "vitest";
import { encryptNik, decryptNik, hashNik, maskNik } from "../src/lib/crypto.js";

describe("Crypto & NIK utilities", () => {
  const sampleNik = "3374010101900001";

  it("Enkripsi dan dekripsi NIK harus mengembalikan nilai asli", () => {
    const encrypted = encryptNik(sampleNik);
    expect(encrypted).not.toBe(sampleNik);

    const decrypted = decryptNik(encrypted);
    expect(decrypted).toBe(sampleNik);
  });

  it("Hash NIK harus konsisten untuk NIK yang sama", () => {
    const hash1 = hashNik(sampleNik);
    const hash2 = hashNik(sampleNik);
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64); // SHA-256 hex string length
  });

  it("Masking NIK harus menghasilkan 12 bintang + 4 digit terakhir", () => {
    const masked = maskNik(sampleNik);
    expect(masked).toBe("************0001");
  });
});

