import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getUserCtx } from "@/lib/context";
import { buildGoogleAuthUrl } from "@/lib/google";
import { env } from "@/lib/env";

export async function GET() {
  const ctx = await getUserCtx();
  if (!ctx) return NextResponse.redirect(`${env.appUrl()}/login`);

  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(buildGoogleAuthUrl(state, ctx.email));
  res.cookies.set("google_oauth_state", state, {
    httpOnly: true,
    secure: env.appUrl().startsWith("https"),
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
