import { supabaseAdmin } from "./supabase.js";

export interface LogAuditParams {
  actor_id?: string | null;
  actor_role?: "patient" | "doctor" | "admin" | null;
  action: string;
  resource_type?: string | null;
  resource_id?: string | null;
  patient_id?: string | null;
  metadata?: Record<string, any>;
  ip_address?: string | null;
}

/**
 * Mencatat log audit akses sistem (kepatuhan regulasi privasi data medis)
 */
export async function logAudit(params: LogAuditParams) {
  try {
    let validIp: string | null = null;
    if (params.ip_address) {
      const cleaned = params.ip_address.replace(/^::ffff:/, "").trim();
      if (
        /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(cleaned) ||
        /^[0-9a-fA-F:]+$/.test(cleaned)
      ) {
        validIp = cleaned;
      }
    }

    const { data, error } = await supabaseAdmin
      .from("audit_logs")
      .insert({
        actor_id: params.actor_id || null,
        actor_role: params.actor_role || null,
        action: params.action,
        resource_type: params.resource_type || null,
        resource_id: params.resource_id || null,
        patient_id: params.patient_id || null,
        metadata: params.metadata || {},
        ip_address: validIp,
      })
      .select()
      .maybeSingle();

    if (error) {
      console.warn("⚠️ Gagal mencatat audit log:", error.message);
      return null;
    }

    return data;
  } catch (error: any) {
    console.error("⚠️ Exception saat mencatat audit log:", error?.message || error);
    return null;
  }
}

export const AuditService = {
  logAudit,
};
