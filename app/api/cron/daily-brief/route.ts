import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateAndSendBrief } from "@/lib/brief";
import { env } from "@/lib/env";
import { todayISO } from "@/lib/time";
import type { Ctx } from "@/lib/context";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: NextRequest) {
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${env.cronSecret()}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  // Vercel envía "Authorization: Bearer <CRON_SECRET>" en cada ejecución.
  if (!authorized(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Si no hay llave de Resend, el resumen por correo está apagado.
  if (!env.resendEnabled()) {
    return NextResponse.json({ ok: true, omitido: "Resumen por correo desactivado (falta RESEND_API_KEY)" });
  }

  const supabase = createAdminClient();
  const allowed = env.allowedEmail();
  const { data: users, error } = await supabase.auth.admin.listUsers({ perPage: 200 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const user = users.users.find((u) => (u.email || "").toLowerCase() === allowed);
  if (!user) {
    return NextResponse.json({ error: "Aún no has iniciado sesión en la app con tu correo." }, { status: 404 });
  }

  const ctx: Ctx = { supabase, userId: user.id, email: user.email!, tz: env.timezone() };

  // Evita mandar dos resúmenes el mismo día si Vercel reintenta.
  const force = request.nextUrl.searchParams.get("force") === "1";
  if (!force) {
    const { data: sent } = await supabase
      .from("daily_briefs")
      .select("id")
      .eq("user_id", ctx.userId)
      .eq("fecha", todayISO(ctx.tz))
      .eq("enviado", true)
      .limit(1);
    if (sent && sent.length > 0) return NextResponse.json({ ok: true, omitido: "Ya se envió hoy" });
  }

  try {
    await generateAndSendBrief(ctx);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("daily-brief", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
