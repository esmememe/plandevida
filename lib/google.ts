import "server-only";
import { env } from "@/lib/env";
import { decrypt, encrypt } from "@/lib/crypto";
import type { Ctx } from "@/lib/context";

// Solo lectura: la app nunca envía, borra ni modifica correos o eventos.
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/gmail.readonly",
];

export class GoogleNotConnectedError extends Error {
  constructor(message = "Google no está conectado") {
    super(message);
    this.name = "GoogleNotConnectedError";
  }
}

export function googleRedirectUri() {
  return `${env.appUrl()}/api/google/callback`;
}

export function buildGoogleAuthUrl(state: string, loginHint?: string) {
  const params = new URLSearchParams({
    client_id: env.googleClientId(),
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline", // para recibir refresh token
    prompt: "consent", // fuerza que Google entregue un refresh token nuevo
    include_granted_scopes: "true",
    state,
  });
  if (loginHint) params.set("login_hint", loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

export async function exchangeCodeForTokens(code: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.googleClientId(),
      client_secret: env.googleClientSecret(),
      redirect_uri: googleRedirectUri(),
      grant_type: "authorization_code",
    }),
  });
  const data = (await res.json()) as TokenResponse;
  if (!res.ok) throw new Error(data.error_description || data.error || "Error al obtener tokens de Google");
  return data;
}

export function emailFromIdToken(idToken?: string) {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8"));
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}

export async function saveGoogleIntegration(ctx: Ctx, refreshToken: string, cuentaEmail: string | null) {
  const { error } = await ctx.supabase.from("integrations").upsert(
    {
      user_id: ctx.userId,
      proveedor: "google",
      refresh_token_cifrado: encrypt(refreshToken),
      cuenta_email: cuentaEmail,
      ultima_sincronizacion: new Date().toISOString(),
    },
    { onConflict: "user_id,proveedor" },
  );
  if (error) throw new Error(`No se pudo guardar la integración: ${error.message}`);
  tokenCache.delete(ctx.userId);
}

// ---------- Access token con renovación automática ----------

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getAccessToken(ctx: Ctx, forceRefresh = false) {
  const cached = tokenCache.get(ctx.userId);
  // Renueva si faltan menos de 2 minutos para que expire.
  if (!forceRefresh && cached && cached.expiresAt - Date.now() > 120_000) return cached.token;

  const { data, error } = await ctx.supabase
    .from("integrations")
    .select("refresh_token_cifrado")
    .eq("user_id", ctx.userId)
    .eq("proveedor", "google")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new GoogleNotConnectedError();

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.googleClientId(),
      client_secret: env.googleClientSecret(),
      refresh_token: decrypt(data.refresh_token_cifrado),
      grant_type: "refresh_token",
    }),
  });
  const json = (await res.json()) as TokenResponse;
  if (!res.ok) {
    tokenCache.delete(ctx.userId);
    if (json.error === "invalid_grant") {
      throw new GoogleNotConnectedError("El permiso de Google expiró o fue revocado. Reconecta tu cuenta.");
    }
    throw new Error(json.error_description || json.error || "No se pudo renovar el acceso a Google");
  }
  tokenCache.set(ctx.userId, { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 });
  return json.access_token;
}

export async function googleGet<T>(ctx: Ctx, url: string): Promise<T> {
  let token = await getAccessToken(ctx);
  let res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (res.status === 401) {
    token = await getAccessToken(ctx, true);
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google respondió ${res.status}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export async function markSynced(ctx: Ctx) {
  await ctx.supabase
    .from("integrations")
    .update({ ultima_sincronizacion: new Date().toISOString() })
    .eq("user_id", ctx.userId)
    .eq("proveedor", "google");
}
