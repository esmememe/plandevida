import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

// Contexto compartido por la página y el cron. Todas las consultas filtran por
// userId, así el mismo código funciona con el cliente del usuario (RLS) y con
// el cliente de servicio que usa el cron.
export type Ctx = {
  supabase: SupabaseClient;
  userId: string;
  email: string;
  tz: string;
};

export const getUserCtx = cache(async (): Promise<Ctx | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || (user.email || "").toLowerCase() !== env.allowedEmail()) return null;
  return { supabase, userId: user.id, email: user.email!, tz: env.timezone() };
});

export async function requireUserCtx(): Promise<Ctx> {
  const ctx = await getUserCtx();
  if (!ctx) throw new Error("No autenticado");
  return ctx;
}
