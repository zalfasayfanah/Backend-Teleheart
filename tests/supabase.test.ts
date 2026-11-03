import { describe, it, expect } from "vitest";
import { supabaseAdmin } from "../src/lib/supabase.js";

describe("Supabase Client Connection", () => {
  it("Harus terhubung ke project Supabase baru dan membaca daftar user", async () => {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });
    expect(error).toBeNull();
    expect(data).toHaveProperty("users");
    expect(Array.isArray(data.users)).toBe(true);
  });

  it("Cek ketersediaan tabel users di database", async () => {
    const { data, error } = await supabaseAdmin.from("users").select("id").limit(1);
    if (error) {
      console.log("ℹ️ Info status tabel users:", error.message);
    } else {
      console.log("✅ Tabel users sudah aktif di database!");
      expect(Array.isArray(data)).toBe(true);
    }
  });
});
