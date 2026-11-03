import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";

// Client dengan Service Role Key (Admin Access: bypass RLS, manajemen akun, audit log)
// HANYA digunakan di sisi server/backend
export const supabaseAdmin: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// Client dengan Anon/Public Key (User Access)
export const supabaseAnon: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: false,
    },
  }
);
