// Lectura centralizada de variables de entorno.
// Se leen al usarse (no al importar) para que el build funcione sin ellas.

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}. Revisa .env.local o la configuración de Vercel.`);
  }
  return value;
}

export const env = {
  allowedEmail: () => required("ALLOWED_EMAIL").trim().toLowerCase(),
  timezone: () => process.env.TIMEZONE || "America/Mexico_City",
  prioritySenders: () =>
    (process.env.PRIORITY_SENDERS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  appUrl: () => required("APP_URL").replace(/\/$/, ""),

  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),

  googleClientId: () => required("GOOGLE_CLIENT_ID"),
  googleClientSecret: () => required("GOOGLE_CLIENT_SECRET"),

  anthropicApiKey: () => required("ANTHROPIC_API_KEY"),
  anthropicModel: () => process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",

  // El resumen por correo es opcional: se activa solo si existe RESEND_API_KEY.
  resendEnabled: () => Boolean(process.env.RESEND_API_KEY),
  resendApiKey: () => required("RESEND_API_KEY"),
  resendFrom: () => process.env.RESEND_FROM || "Panel de Vida <onboarding@resend.dev>",

  cronSecret: () => required("CRON_SECRET"),
  tokenEncryptionKey: () => required("TOKEN_ENCRYPTION_KEY"),

  workdayStart: () => Number(process.env.WORKDAY_START ?? 8),
  workdayEnd: () => Number(process.env.WORKDAY_END ?? 20),
};
