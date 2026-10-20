import "server-only";
import { marked } from "marked";
import type { Ctx } from "@/lib/context";
import { buildWeekAgenda, getWeekEvents, type CalEvent } from "@/lib/calendar";
import { getEmails, type EmailItem } from "@/lib/emails";
import { getTasks, groupTasks } from "@/lib/tasks";
import { computeAlerts, todayOneLiner } from "@/lib/alerts";
import { generateText } from "@/lib/anthropic";
import { sendEmail } from "@/lib/resend";
import { env } from "@/lib/env";
import { formatDayLong, formatDuration, formatTime, todayISO } from "@/lib/time";

function describeError(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

/** Junta agenda, correos, tareas y alertas, pide el resumen a Claude, lo guarda y lo envía. */
export async function generateAndSendBrief(ctx: Ctx) {
  const today = todayISO(ctx.tz);
  const avisos: string[] = [];

  let events: CalEvent[] = [];
  try {
    events = await getWeekEvents(ctx);
  } catch (e) {
    avisos.push(`No se pudo leer el calendario: ${describeError(e)}`);
  }
  let emails: EmailItem[] = [];
  try {
    emails = await getEmails(ctx);
  } catch (e) {
    avisos.push(`No se pudo leer el correo: ${describeError(e)}`);
  }
  const tasks = groupTasks(await getTasks(ctx), today);
  const week = buildWeekAgenda(events, ctx.tz);
  const alerts = computeAlerts({ week, events, emails, tasks, tz: ctx.tz });
  const hoy = week[0];

  const datos = {
    fecha: formatDayLong(today),
    hoy_en_una_linea: todayOneLiner(hoy, tasks),
    agenda_hoy: hoy.eventos.map((e) => ({
      hora: formatTime(new Date(e.inicio), ctx.tz),
      titulo: e.titulo,
      duracion: formatDuration(e.minutos),
      videollamada: Boolean(e.enlace),
      conflicto: e.conflicto,
      separacion_corta: e.separacionCorta,
    })),
    eventos_todo_el_dia: hoy.todoElDia.map((e) => e.titulo),
    horas_de_reunion_hoy: Math.round((hoy.minutosReunion / 60) * 10) / 10,
    horas_libres_hoy: Math.round((hoy.minutosLibres / 60) * 10) / 10,
    bloques_libres: hoy.libres.map((b) => `${formatTime(new Date(b.inicio), ctx.tz)}–${formatTime(new Date(b.fin), ctx.tz)}`),
    correos_responder_hoy: emails
      .filter((e) => e.categoria === "responder_hoy")
      .slice(0, 8)
      .map((e) => ({ de: e.remitente, asunto: e.asunto, resumen: e.resumen, prioritario: e.prioritario })),
    correos_esperando_respuesta: emails.filter((e) => e.categoria === "esperando_respuesta").length,
    correos_informativos: emails.filter((e) => e.categoria === "informativo").length,
    tareas_vencidas: tasks.vencidas.map((t) => ({ titulo: t.titulo, prioridad: t.prioridad, vencio: t.fecha_limite })),
    tareas_hoy: tasks.hoy.filter((t) => t.estado !== "hecha").map((t) => ({ titulo: t.titulo, prioridad: t.prioridad })),
    tareas_proximos_3_dias: tasks.proximos.map((t) => ({ titulo: t.titulo, fecha: t.fecha_limite, prioridad: t.prioridad })),
    alertas: alerts.map((a) => a.texto),
    avisos_tecnicos: avisos,
  };

  const markdown = await generateText({
    system:
      "Eres un asistente personal que escribe un resumen matutino en español de México, claro y directo, en Markdown. " +
      "Solo usas los datos que te doy; no inventas reuniones, correos ni tareas. No sugieres enviar ni borrar correos.",
    prompt:
      "Escribe el resumen de hoy con esta estructura exacta y estos encabezados (##):\n" +
      "1. ## 3 prioridades del día — lista numerada; cada una con el motivo en una frase corta.\n" +
      "2. ## Agenda — lista breve de las reuniones (hora y título); menciona conflictos o reuniones pegadas.\n" +
      "3. ## Correos para responder hoy — máximo 5, formato «Remitente: qué pide».\n" +
      "4. ## Alertas — solo si hay; si no hay, omite la sección.\n" +
      "5. ## Sugerencia — solo si el día está sobrecargado (pocas horas libres, muchas tareas o alertas): una propuesta concreta para reorganizarlo; si no, omite la sección.\n" +
      "Empieza con una línea en cursiva con el «hoy en una línea». Debe leerse en menos de 90 segundos (máximo 220 palabras). " +
      "Si hay avisos técnicos, menciónalos al final en una línea.\n\n" +
      `Datos:\n${JSON.stringify(datos, null, 2)}`,
    maxTokens: 1200,
  });

  const { data: row, error } = await ctx.supabase
    .from("daily_briefs")
    .insert({ user_id: ctx.userId, fecha: today, contenido_markdown: markdown, enviado: false })
    .select("id")
    .single();
  if (error) throw new Error(`No se pudo guardar el resumen: ${error.message}`);

  const html = renderEmailHtml(markdown, datos.fecha);
  await sendEmail({
    to: env.allowedEmail(),
    subject: `Tu día · ${datos.fecha}`,
    html,
    text: markdown,
  });

  await ctx.supabase.from("daily_briefs").update({ enviado: true }).eq("id", row.id).eq("user_id", ctx.userId);
  return { markdown };
}

function renderEmailHtml(markdown: string, fecha: string) {
  const body = marked.parse(markdown, { async: false }) as string;
  const appUrl = env.appUrl();
  return `<!doctype html>
<html lang="es">
<body style="margin:0;padding:0;background:#f4f4f4;">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#171717;">
    <div style="background:#ffffff;border:1px solid #e5e5e5;border-radius:12px;padding:24px;">
      <p style="margin:0 0 4px;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#737373;">Panel de Vida</p>
      <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;">${fecha.charAt(0).toUpperCase() + fecha.slice(1)}</h1>
      <div style="font-size:15px;line-height:1.55;">
        ${body
          .replace(/<h2>/g, '<h2 style="font-size:15px;font-weight:600;margin:20px 0 6px;padding-top:12px;border-top:1px solid #eeeeee;">')
          .replace(/<ul>/g, '<ul style="margin:0;padding-left:20px;">')
          .replace(/<ol>/g, '<ol style="margin:0;padding-left:20px;">')
          .replace(/<p>/g, '<p style="margin:0 0 8px;">')}
      </div>
      <p style="margin:24px 0 0;"><a href="${appUrl}" style="display:inline-block;background:#171717;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px;">Abrir mi panel</a></p>
    </div>
  </div>
</body>
</html>`;
}
