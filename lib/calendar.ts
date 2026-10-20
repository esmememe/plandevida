import "server-only";
import { cache } from "react";
import type { Ctx } from "@/lib/context";
import { googleGet, markSynced } from "@/lib/google";
import { env } from "@/lib/env";
import { addDaysISO, dateISOInTz, startOfDayUtc, todayISO, zonedToUtc } from "@/lib/time";

export type CalEvent = {
  id: string;
  titulo: string;
  inicio: string; // ISO UTC
  fin: string; // ISO UTC
  todoElDia: boolean;
  enlace: string | null; // videollamada
  htmlLink: string | null;
  tieneDescripcion: boolean;
  ubicacion: string | null;
  ocupado: boolean;
};

export type AgendaEvent = CalEvent & {
  minutos: number;
  conflicto: boolean;
  separacionCorta: boolean;
};

export type FreeBlock = { inicio: string; fin: string; minutos: number };

export type DayAgenda = {
  fecha: string; // YYYY-MM-DD
  eventos: AgendaEvent[]; // con hora, ordenados
  todoElDia: CalEvent[];
  libres: FreeBlock[]; // bloques > 45 min
  minutosReunion: number;
  minutosLibres: number; // todo el tiempo libre dentro del horario laboral
};

type GoogleEvent = {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  hangoutLink?: string;
  transparency?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
  attendees?: { self?: boolean; responseStatus?: string }[];
};

const VIDEO_RE = /https?:\/\/[^\s"<>]*(zoom\.us|meet\.google\.com|teams\.microsoft\.com|teams\.live\.com|webex\.com|whereby\.com)[^\s"<>]*/i;

function videoLink(e: GoogleEvent) {
  if (e.hangoutLink) return e.hangoutLink;
  const ep = e.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video" && p.uri);
  if (ep?.uri) return ep.uri;
  const fromText = `${e.location ?? ""} ${e.description ?? ""}`.match(VIDEO_RE);
  return fromText ? fromText[0] : null;
}

function normalize(e: GoogleEvent, tz: string): CalEvent | null {
  if (e.status === "cancelled") return null;
  const declined = e.attendees?.some((a) => a.self && a.responseStatus === "declined");
  if (declined) return null;
  const allDay = !e.start.dateTime;
  const inicio = allDay ? startOfDayUtc(e.start.date!, tz) : new Date(e.start.dateTime!);
  const fin = allDay ? startOfDayUtc(e.end.date!, tz) : new Date(e.end.dateTime!);
  return {
    id: e.id,
    titulo: e.summary?.trim() || "(Sin título)",
    inicio: inicio.toISOString(),
    fin: fin.toISOString(),
    todoElDia: allDay,
    enlace: videoLink(e),
    htmlLink: e.htmlLink ?? null,
    tieneDescripcion: Boolean(e.description?.trim()),
    ubicacion: e.location ?? null,
    ocupado: e.transparency !== "transparent",
  };
}

/** Eventos de hoy y los próximos 6 días (7 en total). Se cachea por petición. */
export const getWeekEvents = cache(async (ctx: Ctx): Promise<CalEvent[]> => {
  const today = todayISO(ctx.tz);
  const timeMin = startOfDayUtc(today, ctx.tz).toISOString();
  const timeMax = startOfDayUtc(addDaysISO(today, 7), ctx.tz).toISOString();
  const items: GoogleEvent[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
      timeZone: ctx.tz,
    });
    if (pageToken) params.set("pageToken", pageToken);
    const data = await googleGet<{ items?: GoogleEvent[]; nextPageToken?: string }>(
      ctx,
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    );
    items.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  await markSynced(ctx);
  return items.map((e) => normalize(e, ctx.tz)).filter((e): e is CalEvent => e !== null);
});

const MIN = 60_000;

export function buildDayAgenda(events: CalEvent[], fecha: string, tz: string, now = new Date()): DayAgenda {
  const dayStart = startOfDayUtc(fecha, tz).getTime();
  const dayEnd = startOfDayUtc(addDaysISO(fecha, 1), tz).getTime();

  const todoElDia = events.filter(
    (e) => e.todoElDia && new Date(e.inicio).getTime() < dayEnd && new Date(e.fin).getTime() > dayStart,
  );
  const timed = events
    .filter((e) => !e.todoElDia && dateISOInTz(new Date(e.inicio), tz) === fecha)
    .sort((a, b) => a.inicio.localeCompare(b.inicio));

  const eventos: AgendaEvent[] = timed.map((e) => ({
    ...e,
    minutos: Math.round((new Date(e.fin).getTime() - new Date(e.inicio).getTime()) / MIN),
    conflicto: false,
    separacionCorta: false,
  }));

  // Conflictos (traslapes) y separaciones de menos de 15 minutos.
  const busy = eventos.filter((e) => e.ocupado);
  for (let i = 0; i < busy.length; i++) {
    for (let j = i + 1; j < busy.length; j++) {
      const a = busy[i];
      const b = busy[j];
      const aStart = new Date(a.inicio).getTime();
      const aEnd = new Date(a.fin).getTime();
      const bStart = new Date(b.inicio).getTime();
      const bEnd = new Date(b.fin).getTime();
      if (bStart < aEnd && aStart < bEnd) {
        a.conflicto = true;
        b.conflicto = true;
      }
    }
  }
  for (let i = 0; i < busy.length - 1; i++) {
    const gap = (new Date(busy[i + 1].inicio).getTime() - new Date(busy[i].fin).getTime()) / MIN;
    if (gap >= 0 && gap < 15) {
      busy[i].separacionCorta = true;
      busy[i + 1].separacionCorta = true;
    }
  }

  // Intervalos ocupados combinados
  const merged: [number, number][] = [];
  for (const e of busy) {
    const s = new Date(e.inicio).getTime();
    const f = new Date(e.fin).getTime();
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], f);
    else merged.push([s, f]);
  }
  const minutosReunion = Math.round(merged.reduce((acc, [s, f]) => acc + (f - s), 0) / MIN);

  // Tiempo libre dentro del horario laboral (para hoy, desde ahora).
  let workStart = zonedToUtc(fecha, env.workdayStart(), 0, tz).getTime();
  const workEnd = zonedToUtc(fecha, env.workdayEnd(), 0, tz).getTime();
  if (fecha === dateISOInTz(now, tz)) workStart = Math.max(workStart, now.getTime());

  const libres: FreeBlock[] = [];
  let minutosLibres = 0;
  let cursor = workStart;
  for (const [s, f] of [...merged, [workEnd, workEnd] as [number, number]]) {
    const gapEnd = Math.min(s, workEnd);
    if (gapEnd > cursor) {
      const minutos = Math.round((gapEnd - cursor) / MIN);
      minutosLibres += minutos;
      if (minutos > 45) {
        libres.push({ inicio: new Date(cursor).toISOString(), fin: new Date(gapEnd).toISOString(), minutos });
      }
    }
    cursor = Math.max(cursor, f);
    if (cursor >= workEnd) break;
  }

  return { fecha, eventos, todoElDia, libres, minutosReunion, minutosLibres };
}

export function buildWeekAgenda(events: CalEvent[], tz: string, now = new Date()): DayAgenda[] {
  const today = todayISO(tz);
  return Array.from({ length: 7 }, (_, i) => buildDayAgenda(events, addDaysISO(today, i), tz, now));
}
