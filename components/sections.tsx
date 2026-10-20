import { ArrowUpRight, Clock } from "lucide-react";
import type { Ctx } from "@/lib/context";
import { loadCalendar, loadEmails, loadIntegrations, loadTasks } from "@/lib/dashboard";
import { computeAlerts, todayOneLiner } from "@/lib/alerts";
import { buildWeekAgenda } from "@/lib/calendar";
import { AgendaView } from "@/components/agenda-view";
import { TasksView } from "@/components/tasks-view";
import { ConnectGooglePrompt, ErrorNote, Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { dateISOInTz, formatDayShort, formatTime, todayISO } from "@/lib/time";
import type { EmailItem } from "@/lib/emails";

export async function TodayLineSection({ ctx }: { ctx: Ctx }) {
  const [cal, tasks] = await Promise.all([loadCalendar(ctx), loadTasks(ctx)]);
  const week = cal.ok ? cal.data.week : buildWeekAgenda([], ctx.tz);
  return (
    <section id="hoy" aria-label="Hoy en una línea" className="rounded-xl border bg-card p-4 sm:p-5">
      <p className="text-lg leading-snug font-medium text-balance sm:text-xl">{todayOneLiner(week[0], tasks)}</p>
      {!cal.ok && <p className="mt-1 text-xs text-muted-foreground">Sin datos del calendario todavía.</p>}
    </section>
  );
}

export async function AgendaSection({ ctx }: { ctx: Ctx }) {
  const cal = await loadCalendar(ctx);
  return (
    <Section id="agenda" title="Agenda">
      {cal.ok ? (
        <AgendaView week={cal.data.week} tz={ctx.tz} />
      ) : cal.notConnected ? (
        <ConnectGooglePrompt message={cal.error === "Google no está conectado" ? undefined : cal.error} />
      ) : (
        <ErrorNote message={`No se pudo leer el calendario. ${cal.error}`} />
      )}
    </Section>
  );
}

function EmailCard({ e, tz }: { e: EmailItem; tz: string }) {
  return (
    <li>
      <a
        href={e.url}
        target="_blank"
        rel="noreferrer"
        className="group block rounded-lg border p-3 transition-colors hover:bg-accent"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 truncate text-sm font-medium">{e.remitente}</p>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {dateISOInTz(new Date(e.ultimoMensajeAt), tz) === todayISO(tz)
              ? formatTime(new Date(e.ultimoMensajeAt), tz)
              : formatDayShort(dateISOInTz(new Date(e.ultimoMensajeAt), tz))}
          </span>
        </div>
        <p className="mt-0.5 truncate text-sm text-muted-foreground">{e.asunto}</p>
        {e.resumen && <p className="mt-1.5 text-sm leading-snug">{e.resumen}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {e.prioritario && <Badge variant="default">Prioritario</Badge>}
          {e.fechaDetectada && (
            <Badge>
              <Clock className="mr-1 size-3" />
              {formatDayShort(dateISOInTz(new Date(e.fechaDetectada), tz))}
              {e.tieneHora ? ` ${formatTime(new Date(e.fechaDetectada), tz)}` : ""}
            </Badge>
          )}
          <ArrowUpRight className="ml-auto size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
      </a>
    </li>
  );
}

export async function EmailsSection({ ctx }: { ctx: Ctx }) {
  const res = await loadEmails(ctx);
  if (!res.ok) {
    return (
      <Section id="correos" title="Correos">
        {res.notConnected ? (
          <ConnectGooglePrompt message={res.error === "Google no está conectado" ? undefined : res.error} />
        ) : (
          <ErrorNote message={`No se pudieron leer o clasificar los correos. ${res.error}`} />
        )}
      </Section>
    );
  }
  const responder = res.data.filter((e) => e.categoria === "responder_hoy");
  const esperando = res.data.filter((e) => e.categoria === "esperando_respuesta");
  const informativos = res.data.filter((e) => e.categoria === "informativo").length;

  return (
    <Section
      id="correos"
      title="Correos"
      action={<span className="text-xs text-muted-foreground">Últimas 48 h</span>}
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Responder hoy · {responder.length}
          </h3>
          {responder.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nada urgente por responder.</p>
          ) : (
            <ul className="grid gap-2 md:grid-cols-2">
              {responder.map((e) => (
                <EmailCard key={e.threadId} e={e} tz={ctx.tz} />
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Esperando respuesta · {esperando.length}
          </h3>
          {esperando.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nadie te debe respuesta de hace más de 3 días.</p>
          ) : (
            <ul className="grid gap-2 md:grid-cols-2">
              {esperando.map((e) => (
                <EmailCard key={e.threadId} e={e} tz={ctx.tz} />
              ))}
            </ul>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground tabular-nums">{informativos}</span>{" "}
          {informativos === 1 ? "correo informativo" : "correos informativos"} (boletines y notificaciones).
        </p>
      </div>
    </Section>
  );
}

export async function TasksSection({ ctx }: { ctx: Ctx }) {
  const groups = await loadTasks(ctx);
  return (
    <Section id="tareas" title="Tareas">
      <TasksView groups={groups} today={todayISO(ctx.tz)} />
    </Section>
  );
}

export async function AlertsSection({ ctx }: { ctx: Ctx }) {
  const [cal, emails, tasks] = await Promise.all([loadCalendar(ctx), loadEmails(ctx), loadTasks(ctx)]);
  const events = cal.ok ? cal.data.events : [];
  const week = cal.ok ? cal.data.week : buildWeekAgenda([], ctx.tz);
  const alerts = computeAlerts({ week, events, emails: emails.ok ? emails.data : [], tasks, tz: ctx.tz });
  return (
    <Section id="alertas" title="Alertas cruzadas">
      {alerts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {cal.ok ? "Todo cuadra: calendario, correo y tareas sin choques." : "Conecta Google para cruzar tus datos."}
        </p>
      ) : (
        <ul className="space-y-2">
          {alerts.map((a, i) => (
            <li key={i} className="flex items-start gap-2 rounded-lg border p-3 text-sm">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-foreground" />
              <span className="flex-1 leading-snug">{a.texto}</span>
              {a.enlace && (
                <a
                  href={a.enlace}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  Abrir
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function since(iso: string | null, tz: string) {
  if (!iso) return "Nunca";
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return "Hace un momento";
  if (mins < 60) return `Hace ${mins} min`;
  if (mins < 24 * 60) return `Hace ${Math.round(mins / 60)} h`;
  return `${formatDayShort(dateISOInTz(d, tz))} ${formatTime(d, tz)}`;
}

export async function ConnectionsSection({ ctx }: { ctx: Ctx }) {
  const rows = await loadIntegrations(ctx);
  const google = rows.find((r) => r.proveedor === "google");
  const services = [
    { nombre: "Anthropic (IA)", ok: Boolean(process.env.ANTHROPIC_API_KEY) },
    { nombre: "Resend (correo del resumen)", ok: Boolean(process.env.RESEND_API_KEY) },
  ];
  return (
    <Section id="conexiones" title="Estado de conexiones">
      <ul className="divide-y rounded-lg border text-sm">
        <li className="flex flex-wrap items-center justify-between gap-2 p-3">
          <div>
            <p className="font-medium">Google Calendar y Gmail</p>
            <p className="text-xs text-muted-foreground">
              {google
                ? `${google.cuenta_email ?? "Conectado"} · Última sincronización: ${since(google.ultima_sincronizacion, ctx.tz)}`
                : "Sin conectar"}
            </p>
          </div>
          <a
            href="/api/google/connect"
            className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium hover:bg-accent"
          >
            {google ? "Reconectar" : "Conectar"}
          </a>
        </li>
        {services.map((s) => (
          <li key={s.nombre} className="flex items-center justify-between gap-2 p-3">
            <p className="font-medium">{s.nombre}</p>
            <Badge variant={s.ok ? "muted" : "outline"}>{s.ok ? "Configurado" : "Falta la llave"}</Badge>
          </li>
        ))}
      </ul>
    </Section>
  );
}
