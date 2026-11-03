import { describe, it, expect } from "vitest";
import { supabaseAdmin } from "../src/lib/supabase.js";

describe("Supabase Schema Verification", () => {
  it("Harus terhubung ke project Supabase dan mengakses auth.admin", async () => {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });
    expect(error).toBeNull();
    expect(data).toHaveProperty("users");
  });

  const allTables = [
    "users",
    "consents",
    "patient_profiles",
    "patient_medical_histories",
    "patient_medications",
    "patient_allergies",
    "doctor_profiles",
    "doctor_tariffs",
    "platform_fees",
    "consultations",
    "consultation_assignments",
    "vital_signs",
    "chat_messages",
    "payments",
    "prescriptions",
    "prescription_items",
    "prediction_logs",
    "notifications",
    "device_tokens",
    "audit_logs",
  ];

  it.each(allTables)("Tabel '%s' harus aktif dan dapat di-query", async (tableName) => {
    const { error } = await supabaseAdmin.from(tableName).select("*").limit(1);
    expect(error, `Error querying table ${tableName}: ${error?.message}`).toBeNull();
  });
});
