import "server-only";
import type { CalEvent, DayAgenda } from "@/lib/calendar";
import type { EmailItem } from "@/lib/emails";
import type { TaskGroups } from "@/lib/tasks";
import { topTask } from "@/lib/tasks";
import { dateISOInTz, formatDayShort, formatTime, hoursLabel } from "@/lib/time";

export type Alert = {
  tipo: "correo_sin_evento" | "reunion_sin_detalles" | "tareas_sin_tiempo" | "dia_sobrecargado";
  texto: string;
  enlace?: string;
};

export const MINUTOS_POR_TAREA = 30;

function words(text: string) {
  return new Set(
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 5),
  );
}

export function computeAlerts(input: {
  week: DayAgenda[];
  events: CalEvent[];
  emails: EmailItem[];
  tasks: TaskGroups;
  tz: string;
}): Alert[] {
  const { week, events, emails, tasks, tz } = input;
  const alerts: Alert[] = [];
  const today = week[0];
  const lastDay = week[week.length - 1]?.fecha;

  // 1. Correos con fecha o reunión que no está en el calendario (próximos 7 días).
  for (const e of emails) {
    if (!e.fechaDetectada || e.categoria === "informativo") continue;
    const when = new Date(e.fechaDetectada);
    const dia = dateISOInTz(when, tz);
    if (dia < today.fecha || dia > lastDay) continue;
    const sameDay = events.filter((ev) =>
      ev.todoElDia
        ? dia >= dateISOInTz(new Date(ev.inicio), tz) && dia < dateISOInTz(new Date(ev.fin), tz)
        : dateISOInTz(new Date(ev.inicio), tz) === dia,
    );
    let existe: boolean;
    if (e.mencionaReunion && e.tieneHora) {
      existe = sameDay.some((ev) => !ev.todoElDia && Math.abs(new Date(ev.inicio).getTime() - when.getTime()) <= 90 * 60_000);
    } else if (e.mencionaReunion) {
      existe = sameDay.some((ev) => !ev.todoElDia);
    } else {
      const w = words(`${e.asunto} ${e.resumen}`);
      existe = sameDay.some((ev) => [...words(ev.titulo)].some((x) => w.has(x)));
    }
    if (!existe) {
      const cuando = `${formatDayShort(dia)}${e.tieneHora ? ` ${formatTime(when, tz)}` : ""}`;
      alerts.push({
        tipo: "correo_sin_evento",
        texto: `${e.mencionaReunion ? "Reunión" : "Fecha"} del ${cuando} en el correo «${e.asunto}» no aparece en tu calendario.`,
        enlace: e.url,
      });
    }
  }

  // 2. Reuniones de hoy sin enlace ni descripción.
  for (const ev of today.eventos) {
    if (!ev.enlace && !ev.tieneDescripcion) {
      alerts.push({
        tipo: "reunion_sin_detalles",
        texto: `«${ev.titulo}» a las ${formatTime(new Date(ev.inicio), tz)} no tiene enlace ni descripción.`,
        enlace: ev.htmlLink ?? undefined,
      });
    }
  }

  // 3. Tareas que vencen hoy sin tiempo libre suficiente.
  const pendientesHoy = tasks.hoy.filter((t) => t.estado !== "hecha");
  const necesarios = pendientesHoy.length * MINUTOS_POR_TAREA;
  if (pendientesHoy.length > 0 && necesarios > today.minutosLibres) {
    alerts.push({
      tipo: "tareas_sin_tiempo",
      texto: `Tienes ${pendientesHoy.length} ${pendientesHoy.length === 1 ? "tarea" : "tareas"} para hoy (~${hoursLabel(necesarios)}) y solo ${hoursLabel(today.minutosLibres)} libres en tu agenda.`,
    });
  }

  // 4. Días con más de 6 horas de reuniones.
  for (const d of week) {
    if (d.minutosReunion > 6 * 60) {
      alerts.push({
        tipo: "dia_sobrecargado",
        texto: `${d.fecha === today.fecha ? "Hoy" : formatDayShort(d.fecha)} tiene ${hoursLabel(d.minutosReunion)} de reuniones.`,
      });
    }
  }

  return alerts;
}

/** "Hoy tienes 3 reuniones, 4,5 h libres y lo más importante es «X»." */
export function todayOneLiner(today: DayAgenda, tasks: TaskGroups) {
  const n = today.eventos.length;
  const reuniones = n === 0 ? "sin reuniones" : `${n} ${n === 1 ? "reunión" : "reuniones"}`;
  const top = topTask(tasks);
  const tarea = top ? `lo más importante es «${top.titulo}»` : "no tienes tareas urgentes";
  return `Hoy tienes ${reuniones}, ${hoursLabel(today.minutosLibres)} libres y ${tarea}.`;
}
