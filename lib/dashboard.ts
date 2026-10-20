import "server-only";
import { cache } from "react";
import type { Ctx } from "@/lib/context";
import { buildWeekAgenda, getWeekEvents, type CalEvent, type DayAgenda } from "@/lib/calendar";
import { getEmails, type EmailItem } from "@/lib/emails";
import { getTasks, groupTasks, type TaskGroups } from "@/lib/tasks";
import { GoogleNotConnectedError } from "@/lib/google";
import { todayISO } from "@/lib/time";

export type Loaded<T> = { ok: true; data: T } | { ok: false; notConnected: boolean; error: string };

function toFailure(e: unknown): { ok: false; notConnected: boolean; error: string } {
  return {
    ok: false,
    notConnected: e instanceof GoogleNotConnectedError,
    error: e instanceof Error ? e.message : "Error desconocido",
  };
}

export const loadCalendar = cache(async (ctx: Ctx): Promise<Loaded<{ events: CalEvent[]; week: DayAgenda[] }>> => {
  try {
    const events = await getWeekEvents(ctx);
    return { ok: true, data: { events, week: buildWeekAgenda(events, ctx.tz) } };
  } catch (e) {
    return toFailure(e);
  }
});

export const loadEmails = cache(async (ctx: Ctx): Promise<Loaded<EmailItem[]>> => {
  try {
    return { ok: true, data: await getEmails(ctx) };
  } catch (e) {
    return toFailure(e);
  }
});

export const loadTasks = cache(async (ctx: Ctx): Promise<TaskGroups> => {
  return groupTasks(await getTasks(ctx), todayISO(ctx.tz));
});

export const loadIntegrations = cache(async (ctx: Ctx) => {
  const { data } = await ctx.supabase
    .from("integrations")
    .select("proveedor, cuenta_email, ultima_sincronizacion")
    .eq("user_id", ctx.userId);
  return (data ?? []) as { proveedor: string; cuenta_email: string | null; ultima_sincronizacion: string | null }[];
});
