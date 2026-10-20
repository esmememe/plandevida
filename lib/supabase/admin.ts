import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

// Cliente con service role: ignora RLS. Solo se usa en el cron,
// y todas las consultas filtran explícitamente por user_id.
export function createAdminClient() {
  return createClient(env.supabaseUrl(), env.supabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
