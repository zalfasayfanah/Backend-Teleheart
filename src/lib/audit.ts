import { supabaseAdmin } from "./supabase.js";

export interface LogAuditParams {
  actor_id?: string | null;
  actor_role?: "patient" | "doctor" | "admin" | null;
  action: string;
  resource_type?: string;
  resource_id?: string;
  patient_id?: string;
  metadata?: Record<string, any>;
  ip_address?: string | null;
}

/**
 * Mencatat log audit akses sistem (kepatuhan regulasi privasi medis)
 */
export async function logAudit(params: LogAuditParams): Promise<void> {
  try {
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: params.actor_id || null,
      actor_role: params.actor_role || null,
      action: params.action,
      resource_type: params.resource_type || null,
      resource_id: params.resource_id || null,
      patient_id: params.patient_id || null,
      metadata: params.metadata || {},
      ip_address: params.ip_address || null,
    });
  } catch (error) {
    // Audit log error tidak boleh menghentikan transaksi utama, catat di console
    console.error("Gagal mencatat audit log:", error);
  }
}

