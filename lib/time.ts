// Utilidades de fecha y hora en la zona horaria del usuario, sin dependencias.
// Las fechas "de calendario" se manejan como texto ISO "YYYY-MM-DD".

function partsInTz(date: Date, tz: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const p: Record<string, number> = {};
  for (const part of fmt.formatToParts(date)) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  return p as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** Diferencia en ms entre la hora local de `tz` y UTC en ese instante. */
function tzOffsetMs(date: Date, tz: string) {
  const p = partsInTz(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - (date.getTime() - date.getMilliseconds());
}

/** Fecha ISO (YYYY-MM-DD) de un instante, vista en `tz`. */
export function dateISOInTz(date: Date, tz: string) {
  const p = partsInTz(date, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function todayISO(tz: string) {
  return dateISOInTz(new Date(), tz);
}

/** Convierte una fecha/hora local de `tz` a un instante UTC. */
export function zonedToUtc(dateISO: string, hour: number, minute: number, tz: string) {
  const [y, m, d] = dateISO.split("-").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, hour, minute));
  const offset = tzOffsetMs(guess, tz);
  const result = new Date(guess.getTime() - offset);
  // Segunda pasada por si el offset cambió (horario de verano).
  const offset2 = tzOffsetMs(result, tz);
  return offset2 === offset ? result : new Date(guess.getTime() - offset2);
}

export function startOfDayUtc(dateISO: string, tz: string) {
  return zonedToUtc(dateISO, 0, 0, tz);
}

export function addDaysISO(dateISO: string, days: number) {
  const [y, m, d] = dateISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function formatTime(date: Date, tz: string) {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

/** "mar 21 oct" */
export function formatDayShort(dateISO: string) {
  const [y, m, d] = dateISO.split("-").map(Number);
  const parts = new Intl.DateTimeFormat("es-MX", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).formatToParts(new Date(Date.UTC(y, m - 1, d)));
  const get = (t: string) => (parts.find((p) => p.type === t)?.value ?? "").replace(/\./g, "");
  return `${get("weekday")} ${get("day")} ${get("month")}`;
}

/** "martes 21 de octubre" */
export function formatDayLong(dateISO: string) {
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

export function hoursLabel(minutes: number) {
  const h = Math.round((minutes / 60) * 10) / 10;
  return `${h.toString().replace(".", ",")} h`;
}
