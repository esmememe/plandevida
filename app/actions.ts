"use server";

import { revalidatePath } from "next/cache";
import { requireUserCtx } from "@/lib/context";
import { parseTaskText, type Estado, type Prioridad } from "@/lib/tasks";
import { generateAndSendBrief } from "@/lib/brief";
import { env } from "@/lib/env";

type Result = { ok: true } | { ok: false; error: string };

function fail(e: unknown): Result {
  return { ok: false, error: e instanceof Error ? e.message : "Algo salió mal" };
}

const PRIORIDADES: Prioridad[] = ["alta", "media", "baja"];
const ESTADOS: Estado[] = ["pendiente", "en_progreso", "hecha"];

export async function quickAddTask(text: string): Promise<Result> {
  try {
    const clean = text.trim().slice(0, 300);
    if (!clean) return { ok: false, error: "Escribe la tarea" };
    const ctx = await requireUserCtx();
    const parsed = await parseTaskText(clean, ctx.tz);
    const { error } = await ctx.supabase.from("tasks").insert({
      user_id: ctx.userId,
      titulo: parsed.titulo.slice(0, 200) || clean,
      fecha_limite: parsed.fecha_limite,
      prioridad: PRIORIDADES.includes(parsed.prioridad) ? parsed.prioridad : "media",
      proyecto: parsed.proyecto,
    });
    if (error) throw new Error(error.message);
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export type TaskPatch = {
  titulo?: string;
  descripcion?: string | null;
  fecha_limite?: string | null;
  prioridad?: Prioridad;
  estado?: Estado;
  proyecto?: string | null;
};

export async function updateTask(id: string, patch: TaskPatch): Promise<Result> {
  try {
    const ctx = await requireUserCtx();
    const clean: TaskPatch = {};
    if (patch.titulo !== undefined) {
      const t = patch.titulo.trim().slice(0, 200);
      if (!t) return { ok: false, error: "El título no puede ir vacío" };
      clean.titulo = t;
    }
    if (patch.descripcion !== undefined) clean.descripcion = patch.descripcion?.trim() || null;
    if (patch.proyecto !== undefined) clean.proyecto = patch.proyecto?.trim() || null;
    if (patch.fecha_limite !== undefined) {
      clean.fecha_limite = patch.fecha_limite && /^\d{4}-\d{2}-\d{2}$/.test(patch.fecha_limite) ? patch.fecha_limite : null;
    }
    if (patch.prioridad && PRIORIDADES.includes(patch.prioridad)) clean.prioridad = patch.prioridad;
    if (patch.estado && ESTADOS.includes(patch.estado)) clean.estado = patch.estado;
    const { error } = await ctx.supabase.from("tasks").update(clean).eq("id", id).eq("user_id", ctx.userId);
    if (error) throw new Error(error.message);
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteTask(id: string): Promise<Result> {
  try {
    const ctx = await requireUserCtx();
    const { error } = await ctx.supabase.from("tasks").delete().eq("id", id).eq("user_id", ctx.userId);
    if (error) throw new Error(error.message);
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function sendBriefNow(): Promise<Result> {
  try {
    if (!env.resendEnabled()) {
      return { ok: false, error: "El resumen por correo está desactivado. Agrega RESEND_API_KEY en Vercel para activarlo." };
    }
    const ctx = await requireUserCtx();
    await generateAndSendBrief(ctx);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
