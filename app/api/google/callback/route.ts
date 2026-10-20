import { NextResponse, type NextRequest } from "next/server";
import { getUserCtx } from "@/lib/context";
import { emailFromIdToken, exchangeCodeForTokens, saveGoogleIntegration } from "@/lib/google";
import { env } from "@/lib/env";

export async function GET(request: NextRequest) {
  const base = env.appUrl();
  const ctx = await getUserCtx();
  if (!ctx) return NextResponse.redirect(`${base}/login`);

  const params = request.nextUrl.searchParams;
  const state = params.get("state");
  const code = params.get("code");
  const expected = request.cookies.get("google_oauth_state")?.value;

  const fail = (motivo: string) => {
    const res = NextResponse.redirect(`${base}/?google=error&motivo=${encodeURIComponent(motivo)}`);
    res.cookies.delete("google_oauth_state");
    return res;
  };

  if (params.get("error")) return fail("Cancelaste el permiso en Google.");
  if (!code || !state || state !== expected) return fail("La sesión de conexión expiró. Intenta de nuevo.");

  try {
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      return fail("Google no entregó un permiso permanente. Quita el acceso en myaccount.google.com/permissions y vuelve a conectar.");
    }
    await saveGoogleIntegration(ctx, tokens.refresh_token, emailFromIdToken(tokens.id_token));
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Error al conectar Google");
  }

  const res = NextResponse.redirect(`${base}/?google=ok`);
  res.cookies.delete("google_oauth_state");
  return res;
}
