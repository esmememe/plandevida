import "server-only";
import { cache } from "react";
import type { Ctx } from "@/lib/context";
import { generateJson } from "@/lib/anthropic";
import { addDaysISO, formatDayLong, todayISO } from "@/lib/time";

export type Prioridad = "alta" | "media" | "baja";
export type Estado = "pendiente" | "en_progreso" | "hecha";

export type Task = {
  id: string;
  titulo: string;
  descripcion: string | null;
  fecha_limite: string | null;
  prioridad: Prioridad;
  estado: Estado;
  proyecto: string | null;
  created_at: string;
};

export type TaskGroups = {
  vencidas: Task[];
  hoy: Task[];
  proximos: Task[];
  masAdelante: Task[];
  sinFecha: Task[];
};

const PRIORITY_ORDER: Record<Prioridad, number> = { alta: 0, media: 1, baja: 2 };

export function sortTasks(a: Task, b: Task) {
  const done = Number(a.estado === "hecha") - Number(b.estado === "hecha");
  if (done !== 0) return done;
  const p = PRIORITY_ORDER[a.prioridad] - PRIORITY_ORDER[b.prioridad];
  if (p !== 0) return p;
  return (a.fecha_limite ?? "9999").localeCompare(b.fecha_limite ?? "9999");
}

export const getTasks = cache(async (ctx: Ctx): Promise<Task[]> => {
  const today = todayISO(ctx.tz);
  const { data, error } = await ctx.supabase
    .from("tasks")
    .select("*")
    .eq("user_id", ctx.userId)
    .or(`estado.neq.hecha,fecha_limite.gte.${today}`)
    .order("fecha_limite", { ascending: true, nullsFirst: false })
    .limit(300);
  if (error) throw new Error(error.message);
  return (data ?? []) as Task[];
});

export function groupTasks(tasks: Task[], today: string): TaskGroups {
  const limit = addDaysISO(today, 3);
  const groups: TaskGroups = { vencidas: [], hoy: [], proximos: [], masAdelante: [], sinFecha: [] };
  for (const t of tasks) {
    if (!t.fecha_limite) {
      if (t.estado !== "hecha") groups.sinFecha.push(t);
    } else if (t.fecha_limite < today) {
      if (t.estado !== "hecha") groups.vencidas.push(t);
    } else if (t.fecha_limite === today) groups.hoy.push(t);
    else if (t.fecha_limite <= limit) groups.proximos.push(t);
    else groups.masAdelante.push(t);
  }
  (Object.keys(groups) as (keyof TaskGroups)[]).forEach((k) => groups[k].sort(sortTasks));
  return groups;
}

/** La tarea más importante pendiente: vencida o de hoy, por prioridad. */
export function topTask(groups: TaskGroups) {
  const candidates = [...groups.vencidas, ...groups.hoy, ...groups.proximos].filter((t) => t.estado !== "hecha");
  return candidates.sort(sortTasks)[0] ?? null;
}

export type ParsedTask = {
  titulo: string;
  fecha_limite: string | null;
  prioridad: Prioridad;
  proyecto: string | null;
};

/** Interpreta "pagar luz el viernes" con la API de Anthropic. */
export async function parseTaskText(text: string, tz: string): Promise<ParsedTask> {
  const today = todayISO(tz);
  const parsed = await generateJson<ParsedTask>({
    system:
      "Conviertes una frase en una tarea. Respondes en español. No inventas fechas: si la frase no menciona cuándo, fecha_limite es null.",
    prompt:
      `Hoy es ${formatDayLong(today)} (${today}), zona horaria ${tz}.\n` +
      'Reglas: "hoy" = hoy; "mañana" = día siguiente; un día de la semana ("el viernes") = el próximo con ese nombre, ' +
      'hoy incluido solo si dice "este" y es hoy; "fin de mes" = último día del mes. ' +
      "La prioridad es alta si dice urgente/importante o vence hoy, baja si dice cuando pueda/algún día, si no media. " +
      'Si la frase menciona un proyecto con "#nombre" o "para <proyecto>", guárdalo en proyecto; si no, null. ' +
      "El título debe ser corto, en infinitivo y sin la fecha.\n\n" +
      `Frase: "${text}"`,
    schemaName: "crear_tarea",
    schemaDescription: "Crea la tarea interpretada.",
    schema: {
      type: "object",
      properties: {
        titulo: { type: "string" },
        fecha_limite: { type: ["string", "null"], description: "YYYY-MM-DD o null" },
        prioridad: { type: "string", enum: ["alta", "media", "baja"] },
        proyecto: { type: ["string", "null"] },
      },
      required: ["titulo", "fecha_limite", "prioridad", "proyecto"],
    },
    maxTokens: 300,
  });
  if (parsed.fecha_limite && !/^\d{4}-\d{2}-\d{2}$/.test(parsed.fecha_limite)) parsed.fecha_limite = null;
  return parsed;
}
