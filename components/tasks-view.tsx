"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Pencil, Trash2, X } from "lucide-react";
import type { Task, TaskGroups } from "@/lib/tasks";
import { deleteTask, quickAddTask, updateTask, type TaskPatch } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatDayShort } from "@/lib/time";

export function TasksView({ groups, today }: { groups: TaskGroups; today: string }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await quickAddTask(text);
      if (res.ok) setText("");
      else setError(res.error);
    });
  }

  const sections: { key: keyof TaskGroups; title: string; empty?: string }[] = [
    { key: "vencidas", title: "Vencidas", empty: "Nada vencido." },
    { key: "hoy", title: "Hoy", empty: "Nada para hoy." },
    { key: "proximos", title: "Próximos 3 días", empty: "Nada en los próximos días." },
    { key: "masAdelante", title: "Más adelante" },
    { key: "sinFecha", title: "Sin fecha" },
  ];

  return (
    <div className="space-y-5">
      <form onSubmit={onAdd} className="flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='Ej. "pagar luz el viernes" o "enviar propuesta mañana, urgente"'
          aria-label="Nueva tarea"
          disabled={pending}
          maxLength={300}
        />
        <Button type="submit" disabled={pending || !text.trim()}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : "Agregar"}
        </Button>
      </form>
      {error && <p className="text-sm text-muted-foreground">{error}</p>}

      {sections.map(({ key, title, empty }) => {
        const list = groups[key];
        if (list.length === 0 && !empty) return null;
        return (
          <div key={key} className="space-y-2">
            <h3 className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {title}
              {list.length > 0 && <span className="tabular-nums">· {list.length}</span>}
            </h3>
            {list.length === 0 ? (
              <p className="text-sm text-muted-foreground">{empty}</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {list.map((t) => (
                  <TaskRow key={t.id} task={t} today={today} overdue={key === "vencidas"} />
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TaskRow({ task, today, overdue }: { task: Task; today: string; overdue: boolean }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const done = task.estado === "hecha";

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Error");
    });

  if (editing) {
    return (
      <li className="p-3">
        <TaskEditor
          task={task}
          pending={pending}
          onCancel={() => setEditing(false)}
          onSave={(patch) =>
            run(async () => {
              const res = await updateTask(task.id, patch);
              if (res.ok) setEditing(false);
              return res;
            })
          }
        />
        {error && <p className="mt-2 text-sm text-muted-foreground">{error}</p>}
      </li>
    );
  }

  return (
    <li className={cn("flex items-start gap-3 p-3", pending && "opacity-60")}>
      <button
        type="button"
        aria-label={done ? "Marcar como pendiente" : "Marcar como hecha"}
        onClick={() => run(() => updateTask(task.id, { estado: done ? "pendiente" : "hecha" }))}
        className={cn(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border transition-colors",
          done ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/50 hover:border-foreground",
        )}
      >
        {done && <Check className="size-3.5" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm leading-snug", done && "text-muted-foreground line-through")}>{task.titulo}</p>
        {task.descripcion && <p className="mt-0.5 text-xs text-muted-foreground">{task.descripcion}</p>}
        <div className="mt-1.5 flex flex-wrap gap-1">
          {task.fecha_limite && (
            <Badge variant={overdue ? "default" : "outline"}>
              {task.fecha_limite === today ? "Hoy" : formatDayShort(task.fecha_limite)}
            </Badge>
          )}
          <Badge variant={task.prioridad === "alta" ? "default" : "muted"}>Prioridad {task.prioridad}</Badge>
          {task.estado === "en_progreso" && <Badge>En progreso</Badge>}
          {task.proyecto && <Badge variant="muted">{task.proyecto}</Badge>}
        </div>
        {error && <p className="mt-1 text-xs text-muted-foreground">{error}</p>}
      </div>
      <div className="flex shrink-0 gap-0.5">
        <Button variant="ghost" size="icon-sm" aria-label="Editar tarea" onClick={() => setEditing(true)}>
          <Pencil className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Borrar tarea"
          onClick={() => {
            if (confirm(`¿Borrar "${task.titulo}"?`)) run(() => deleteTask(task.id));
          }}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </li>
  );
}

function TaskEditor({
  task,
  pending,
  onSave,
  onCancel,
}: {
  task: Task;
  pending: boolean;
  onSave: (patch: TaskPatch) => void;
  onCancel: () => void;
}) {
  const [titulo, setTitulo] = useState(task.titulo);
  const [descripcion, setDescripcion] = useState(task.descripcion ?? "");
  const [fecha, setFecha] = useState(task.fecha_limite ?? "");
  const [prioridad, setPrioridad] = useState(task.prioridad);
  const [estado, setEstado] = useState(task.estado);
  const [proyecto, setProyecto] = useState(task.proyecto ?? "");

  return (
    <form
      className="grid gap-2 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ titulo, descripcion, fecha_limite: fecha || null, prioridad, estado, proyecto });
      }}
    >
      <Input className="sm:col-span-2" value={titulo} onChange={(e) => setTitulo(e.target.value)} aria-label="Título" />
      <Input
        className="sm:col-span-2"
        value={descripcion}
        onChange={(e) => setDescripcion(e.target.value)}
        placeholder="Descripción (opcional)"
        aria-label="Descripción"
      />
      <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} aria-label="Fecha límite" />
      <Input value={proyecto} onChange={(e) => setProyecto(e.target.value)} placeholder="Proyecto" aria-label="Proyecto" />
      <Select value={prioridad} onChange={(e) => setPrioridad(e.target.value as Task["prioridad"])} aria-label="Prioridad">
        <option value="alta">Prioridad alta</option>
        <option value="media">Prioridad media</option>
        <option value="baja">Prioridad baja</option>
      </Select>
      <Select value={estado} onChange={(e) => setEstado(e.target.value as Task["estado"])} aria-label="Estado">
        <option value="pendiente">Pendiente</option>
        <option value="en_progreso">En progreso</option>
        <option value="hecha">Hecha</option>
      </Select>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : "Guardar"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          <X className="size-3.5" /> Cancelar
        </Button>
      </div>
    </form>
  );
}
