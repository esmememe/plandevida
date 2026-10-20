import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const base = env.appUrl();
  if (!code) return NextResponse.redirect(`${base}/login?error=1`);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return NextResponse.redirect(`${base}/login?error=1`);

  // Solo el correo autorizado puede entrar.
  if ((data.user.email || "").toLowerCase() !== env.allowedEmail()) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${base}/acceso-denegado`);
  }

  return NextResponse.redirect(`${base}/`);
}
