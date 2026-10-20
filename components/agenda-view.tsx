"use client";

import { useState } from "react";
import { Video } from "lucide-react";
import type { DayAgenda } from "@/lib/calendar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDayShort, formatDuration, formatTime, hoursLabel } from "@/lib/time";

type Item =
  | { kind: "event"; start: string; data: DayAgenda["eventos"][number] }
  | { kind: "free"; start: string; data: DayAgenda["libres"][number] };

export function AgendaView({ week, tz }: { week: DayAgenda[]; tz: string }) {
  const [selected, setSelected] = useState(0);
  const day = week[selected];
  const items: Item[] = [
    ...day.eventos.map((e) => ({ kind: "event" as const, start: e.inicio, data: e })),
    ...day.libres.map((f) => ({ kind: "free" as const, start: f.inicio, data: f })),
  ].sort((a, b) => a.start.localeCompare(b.start));

  return (
    <div className="space-y-4">
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Elegir día">
        {week.map((d, i) => (
          <button
            key={d.fecha}
            role="tab"
            aria-selected={i === selected}
            onClick={() => setSelected(i)}
            className={cn(
              "flex min-w-16 flex-col items-center rounded-md border px-2 py-1.5 text-xs transition-colors",
              i === selected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <span className="font-medium">{i === 0 ? "Hoy" : formatDayShort(d.fecha).split(" ")[0]}</span>
            <span className="tabular-nums">{formatDayShort(d.fecha).split(" ").slice(1).join(" ")}</span>
            <span className={cn("mt-0.5 tabular-nums", i === selected ? "opacity-80" : "")}>
              {d.eventos.length} ev
            </span>
          </button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        {hoursLabel(day.minutosReunion)} en reuniones · {hoursLabel(day.minutosLibres)} libres
        {selected === 0 ? " desde ahora" : ""}
      </p>

      {day.todoElDia.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {day.todoElDia.map((e) => (
            <Badge key={e.id} variant="muted">
              Todo el día · {e.titulo}
            </Badge>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nada en el calendario para este día.</p>
      ) : (
        <ol className="relative space-y-2 border-l border-border pl-4">
          {items.map((item) =>
            item.kind === "event" ? (
              <li key={`e-${item.data.id}`} className="relative">
                <span
                  className={cn(
                    "absolute top-3 -left-[21px] size-2.5 rounded-full border-2 border-background",
                    item.data.conflicto ? "bg-foreground" : "bg-muted-foreground",
                  )}
                />
                <div
                  className={cn(
                    "rounded-lg border p-3",
                    item.data.conflicto && "border-foreground/60 border-2",
                    !item.data.ocupado && "opacity-70",
                  )}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <p className="text-sm tabular-nums text-muted-foreground">
                      {formatTime(new Date(item.data.inicio), tz)}–{formatTime(new Date(item.data.fin), tz)}
                      <span className="ml-2">{formatDuration(item.data.minutos)}</span>
                    </p>
                    <div className="flex gap-1">
                      {item.data.conflicto && <Badge variant="default">Conflicto</Badge>}
                      {item.data.separacionCorta && !item.data.conflicto && <Badge>Menos de 15 min entre eventos</Badge>}
                    </div>
                  </div>
                  <p className="mt-1 font-medium leading-snug">
                    {item.data.htmlLink ? (
                      <a href={item.data.htmlLink} target="_blank" rel="noreferrer" className="hover:underline">
                        {item.data.titulo}
                      </a>
                    ) : (
                      item.data.titulo
                    )}
                  </p>
                  {item.data.enlace && (
                    <a
                      href={item.data.enlace}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    >
                      <Video className="size-3.5" /> Unirse a la videollamada
                    </a>
                  )}
                </div>
              </li>
            ) : (
              <li key={`f-${item.data.inicio}`} className="relative">
                <span className="absolute top-3 -left-[21px] size-2.5 rounded-full border-2 border-background bg-border" />
                <div className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
                  <span className="tabular-nums">
                    {formatTime(new Date(item.data.inicio), tz)}–{formatTime(new Date(item.data.fin), tz)}
                  </span>{" "}
                  · Tiempo disponible ({formatDuration(item.data.minutos)})
                </div>
              </li>
            ),
          )}
        </ol>
      )}
    </div>
  );
}
