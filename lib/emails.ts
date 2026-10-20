import "server-only";
import { cache } from "react";
import type { Ctx } from "@/lib/context";
import { googleGet, markSynced } from "@/lib/google";
import { generateJson } from "@/lib/anthropic";
import { env } from "@/lib/env";
import { todayISO, zonedToUtc } from "@/lib/time";

export type EmailCategory = "responder_hoy" | "esperando_respuesta" | "informativo";

export type EmailItem = {
  threadId: string;
  asunto: string;
  remitente: string;
  remitenteEmail: string;
  categoria: EmailCategory;
  resumen: string;
  fechaDetectada: string | null; // ISO UTC
  tieneHora: boolean;
  mencionaReunion: boolean;
  ultimoMensajeAt: string;
  prioritario: boolean;
  url: string;
};

type GmailThread = {
  id: string;
  messages?: {
    id: string;
    labelIds?: string[];
    internalDate: string;
    snippet?: string;
    payload?: { headers?: { name: string; value: string }[] };
  }[];
};

type ThreadMeta = {
  id: string;
  asunto: string;
  remitente: string;
  remitenteEmail: string;
  snippet: string;
  ultimoAt: Date;
  ultimoEsMio: boolean;
  noLeido: boolean;
};

const DAY = 86_400_000;

function parseFrom(value: string) {
  const m = value.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { nombre: m[1].trim() || m[2], email: m[2].trim().toLowerCase() };
  return { nombre: value.trim(), email: value.trim().toLowerCase() };
}

async function listThreadIds(ctx: Ctx, q: string, max: number) {
  const params = new URLSearchParams({ q, maxResults: String(max) });
  const data = await googleGet<{ threads?: { id: string }[] }>(
    ctx,
    `https://gmail.googleapis.com/gmail/v1/users/me/threads?${params}`,
  );
  return (data.threads ?? []).map((t) => t.id);
}

async function getThreadMeta(ctx: Ctx, id: string): Promise<ThreadMeta | null> {
  const params = new URLSearchParams({ format: "metadata" });
  params.append("metadataHeaders", "From");
  params.append("metadataHeaders", "Subject");
  const t = await googleGet<GmailThread>(ctx, `https://gmail.googleapis.com/gmail/v1/users/me/threads/${id}?${params}`);
  const msgs = (t.messages ?? []).filter((m) => !m.labelIds?.includes("DRAFT"));
  if (msgs.length === 0) return null;
  const last = msgs[msgs.length - 1];
  const first = msgs[0];
  const header = (m: typeof last, name: string) =>
    m.payload?.headers?.find((h) => h.name.toLowerCase() === name)?.value ?? "";
  // Remitente: el último mensaje que no es mío (o el primero si todos son míos).
  const lastOther = [...msgs].reverse().find((m) => !m.labelIds?.includes("SENT")) ?? first;
  const from = parseFrom(header(lastOther, "from"));
  return {
    id,
    asunto: header(first, "subject") || "(Sin asunto)",
    remitente: from.nombre,
    remitenteEmail: from.email,
    snippet: (last.snippet ?? "").slice(0, 300),
    ultimoAt: new Date(Number(last.internalDate)),
    ultimoEsMio: Boolean(last.labelIds?.includes("SENT")),
    noLeido: msgs.some((m) => m.labelIds?.includes("UNREAD")),
  };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const out: R[] = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

type AiClassification = {
  thread_id: string;
  categoria: "responder_hoy" | "informativo";
  resumen_una_linea: string;
  fecha_detectada: string | null;
  menciona_reunion: boolean;
};

async function classifyWithAi(ctx: Ctx, threads: (ThreadMeta & { prioritario: boolean; esperando: boolean })[]) {
  if (threads.length === 0) return new Map<string, AiClassification>();
  const today = todayISO(ctx.tz);
  const result = await generateJson<{ correos: AiClassification[] }>({
    system:
      "Eres un asistente que clasifica correos para una persona ocupada. Respondes en español. " +
      "Nunca inventas datos: si un correo no menciona una fecha, fecha_detectada es null. " +
      "No sugieres enviar, borrar ni modificar correos.",
    prompt:
      `Hoy es ${today} (zona horaria ${ctx.tz}).\n\n` +
      "Clasifica cada correo:\n" +
      "- responder_hoy: contiene una pregunta directa para mí, una solicitud con fecha, o viene de un remitente prioritario.\n" +
      "- informativo: boletines, notificaciones automáticas, promociones, recibos o avisos que no piden respuesta.\n\n" +
      "Para cada uno escribe un resumen de una línea (máximo 15 palabras) de lo que se pide o informa.\n" +
      "fecha_detectada: si el correo menciona una fecha límite, reunión o evento, escríbela en hora local como " +
      '"YYYY-MM-DD" o "YYYY-MM-DDTHH:mm" si tiene hora; si no hay, null. Resuelve fechas relativas ("el viernes") usando la fecha de hoy.\n' +
      "menciona_reunion: true si propone o confirma una reunión, llamada o cita.\n\n" +
      "Correos:\n" +
      JSON.stringify(
        threads.map((t) => ({
          thread_id: t.id,
          remitente: `${t.remitente} <${t.remitenteEmail}>`,
          asunto: t.asunto,
          fragmento: t.snippet,
          remitente_prioritario: t.prioritario,
        })),
      ),
    schemaName: "guardar_clasificacion",
    schemaDescription: "Guarda la clasificación de cada correo.",
    schema: {
      type: "object",
      properties: {
        correos: {
          type: "array",
          items: {
            type: "object",
            properties: {
              thread_id: { type: "string" },
              categoria: { type: "string", enum: ["responder_hoy", "informativo"] },
              resumen_una_linea: { type: "string" },
              fecha_detectada: { type: ["string", "null"] },
              menciona_reunion: { type: "boolean" },
            },
            required: ["thread_id", "categoria", "resumen_una_linea", "fecha_detectada", "menciona_reunion"],
          },
        },
      },
      required: ["correos"],
    },
    maxTokens: 4096,
  });
  return new Map(result.correos.map((c) => [c.thread_id, c]));
}

function parseLocalDate(value: string | null, tz: string) {
  if (!value) return { fecha: null, tieneHora: false };
  const m = value.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return { fecha: null, tieneHora: false };
  const tieneHora = Boolean(m[2]);
  const d = zonedToUtc(m[1], tieneHora ? Number(m[2]) : 12, tieneHora ? Number(m[3]) : 0, tz);
  return { fecha: d.toISOString(), tieneHora };
}

/** Lee Gmail (solo lectura), clasifica lo nuevo y devuelve los correos relevantes. */
export const getEmails = cache(async (ctx: Ctx): Promise<EmailItem[]> => {
  const priority = env.prioritySenders();
  const queries: Promise<string[]>[] = [
    listThreadIds(ctx, "newer_than:2d -in:sent -in:chats -in:spam -in:trash -in:drafts", 40),
    listThreadIds(ctx, "in:sent older_than:3d newer_than:21d", 25),
  ];
  if (priority.length > 0) {
    queries.push(listThreadIds(ctx, `from:(${priority.join(" OR ")}) newer_than:7d -in:spam -in:trash`, 20));
  }
  const ids = [...new Set((await Promise.all(queries)).flat())].slice(0, 70);
  const metas = (await mapLimit(ids, 8, (id) => getThreadMeta(ctx, id).catch(() => null))).filter(
    (m): m is ThreadMeta => m !== null,
  );
  await markSynced(ctx);

  const now = Date.now();
  const relevant = metas
    .map((m) => {
      const prioritario = priority.includes(m.remitenteEmail);
      const esperando = m.ultimoEsMio && now - m.ultimoAt.getTime() > 3 * DAY;
      const sinRespuesta = !m.ultimoEsMio && now - m.ultimoAt.getTime() <= 2 * DAY;
      const incluir = esperando || (!m.ultimoEsMio && (m.noLeido || sinRespuesta || prioritario));
      return { ...m, prioritario, esperando, incluir };
    })
    .filter((m) => m.incluir);

  if (relevant.length === 0) return [];

  // Reutiliza clasificaciones guardadas si el hilo no tiene mensajes nuevos.
  const { data: saved } = await ctx.supabase
    .from("email_classifications")
    .select("*")
    .eq("user_id", ctx.userId)
    .in(
      "gmail_thread_id",
      relevant.map((r) => r.id),
    );
  const savedMap = new Map((saved ?? []).map((s) => [s.gmail_thread_id as string, s]));

  const pending = relevant.filter((r) => {
    const s = savedMap.get(r.id);
    if (!s) return true;
    const savedAt = s.ultimo_mensaje_at ? new Date(s.ultimo_mensaje_at).getTime() : 0;
    return savedAt < r.ultimoAt.getTime();
  });

  const aiMap = new Map<string, AiClassification>();
  for (let i = 0; i < pending.length; i += 25) {
    const chunk = await classifyWithAi(ctx, pending.slice(i, i + 25));
    chunk.forEach((v, k) => aiMap.set(k, v));
  }

  const upserts = pending.map((r) => {
    const ai = aiMap.get(r.id);
    let categoria: EmailCategory = ai?.categoria ?? "informativo";
    if (r.prioritario) categoria = "responder_hoy";
    if (r.esperando) categoria = "esperando_respuesta";
    const { fecha, tieneHora } = parseLocalDate(ai?.fecha_detectada ?? null, ctx.tz);
    return {
      user_id: ctx.userId,
      gmail_thread_id: r.id,
      categoria,
      resumen_una_linea: ai?.resumen_una_linea ?? r.snippet.slice(0, 120),
      fecha_limite_detectada: fecha,
      tiene_hora: tieneHora,
      menciona_reunion: ai?.menciona_reunion ?? false,
      asunto: r.asunto,
      remitente: r.remitente,
      ultimo_mensaje_at: r.ultimoAt.toISOString(),
      updated_at: new Date().toISOString(),
    };
  });

  if (upserts.length > 0) {
    const { error } = await ctx.supabase
      .from("email_classifications")
      .upsert(upserts, { onConflict: "user_id,gmail_thread_id" });
    if (error) throw new Error(`No se pudo guardar la clasificación: ${error.message}`);
    upserts.forEach((u) => savedMap.set(u.gmail_thread_id, u));
  }

  const authuser = encodeURIComponent(ctx.email);
  return relevant
    .map((r): EmailItem | null => {
      const s = savedMap.get(r.id);
      if (!s) return null;
      // Si pasaron 3 días desde mi último mensaje, se mueve a "esperando".
      const categoria: EmailCategory = r.esperando ? "esperando_respuesta" : (s.categoria as EmailCategory);
      return {
        threadId: r.id,
        asunto: r.asunto,
        remitente: r.remitente,
        remitenteEmail: r.remitenteEmail,
        categoria,
        resumen: s.resumen_una_linea ?? "",
        fechaDetectada: s.fecha_limite_detectada ?? null,
        tieneHora: Boolean(s.tiene_hora),
        mencionaReunion: Boolean(s.menciona_reunion),
        ultimoMensajeAt: r.ultimoAt.toISOString(),
        prioritario: r.prioritario,
        url: `https://mail.google.com/mail/?authuser=${authuser}#all/${r.id}`,
      };
    })
    .filter((e): e is EmailItem => e !== null)
    .sort((a, b) => Number(b.prioritario) - Number(a.prioritario) || b.ultimoMensajeAt.localeCompare(a.ultimoMensajeAt));
});
