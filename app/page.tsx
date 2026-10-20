import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { getUserCtx } from "@/lib/context";
import { formatDayLong, todayISO } from "@/lib/time";
import {
  AgendaSection,
  AlertsSection,
  ConnectionsSection,
  EmailsSection,
  TasksSection,
  TodayLineSection,
} from "@/components/sections";
import { SectionSkeleton } from "@/components/section";
import { SendBriefButton } from "@/components/send-brief-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ google?: string; motivo?: string }>;
}) {
  const ctx = await getUserCtx();
  if (!ctx) redirect("/login");
  const { google, motivo } = await searchParams;
  const fecha = formatDayLong(todayISO(ctx.tz));

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-5 sm:py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Panel de Vida</p>
          <h1 className="text-2xl font-semibold tracking-tight first-letter:uppercase">{fecha}</h1>
        </div>
        <div className="flex items-center gap-1">
          <SendBriefButton />
          <ThemeToggle />
          <form action="/auth/signout" method="post">
            <Button variant="ghost" size="icon" aria-label="Cerrar sesión" type="submit">
              <LogOut className="size-4" />
            </Button>
          </form>
        </div>
      </header>

      {google === "ok" && (
        <p className="rounded-lg border p-3 text-sm">Google quedó conectado. Tu agenda y tu correo ya se leen aquí.</p>
      )}
      {google === "error" && (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          No se pudo conectar Google. {motivo}
        </p>
      )}

      <Suspense
        fallback={<div className="h-20 animate-pulse rounded-xl border bg-card" aria-label="Cargando resumen del día" />}
      >
        <TodayLineSection ctx={ctx} />
      </Suspense>
      <Suspense fallback={<SectionSkeleton id="agenda" title="Agenda" lines={4} />}>
        <AgendaSection ctx={ctx} />
      </Suspense>
      <Suspense fallback={<SectionSkeleton id="correos" title="Correos" lines={3} />}>
        <EmailsSection ctx={ctx} />
      </Suspense>
      <Suspense fallback={<SectionSkeleton id="tareas" title="Tareas" lines={3} />}>
        <TasksSection ctx={ctx} />
      </Suspense>
      <Suspense fallback={<SectionSkeleton id="alertas" title="Alertas cruzadas" lines={2} />}>
        <AlertsSection ctx={ctx} />
      </Suspense>
      <Suspense fallback={<SectionSkeleton id="conexiones" title="Estado de conexiones" lines={2} />}>
        <ConnectionsSection ctx={ctx} />
      </Suspense>

      <footer className="pt-2 pb-6 text-center text-xs text-muted-foreground">
        Solo lectura: esta app nunca envía, borra ni modifica tus correos o eventos.
      </footer>
    </main>
  );
}
