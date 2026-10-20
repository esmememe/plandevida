-- Panel de Vida: esquema inicial
-- Pégalo completo en Supabase > SQL Editor > New query > Run

-- =========================
-- tasks
-- =========================
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  titulo text not null,
  descripcion text,
  fecha_limite date,
  prioridad text not null default 'media' check (prioridad in ('alta', 'media', 'baja')),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'en_progreso', 'hecha')),
  proyecto text,
  created_at timestamptz not null default now()
);
create index if not exists tasks_user_fecha_idx on public.tasks (user_id, fecha_limite);

-- =========================
-- email_classifications
-- =========================
create table if not exists public.email_classifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  gmail_thread_id text not null,
  categoria text not null check (categoria in ('responder_hoy', 'esperando_respuesta', 'informativo')),
  resumen_una_linea text,
  fecha_limite_detectada timestamptz,
  -- Campos extra para mostrar y cruzar datos sin volver a llamar a Gmail
  asunto text,
  remitente text,
  menciona_reunion boolean not null default false,
  tiene_hora boolean not null default false,
  ultimo_mensaje_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, gmail_thread_id)
);

-- =========================
-- daily_briefs
-- =========================
create table if not exists public.daily_briefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  fecha date not null,
  contenido_markdown text not null,
  enviado boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists daily_briefs_user_fecha_idx on public.daily_briefs (user_id, fecha desc);

-- =========================
-- integrations
-- =========================
create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  proveedor text not null,
  refresh_token_cifrado text not null,
  cuenta_email text,
  ultima_sincronizacion timestamptz,
  unique (user_id, proveedor)
);

-- =========================
-- Row Level Security: cada fila solo es visible para su dueño
-- =========================
alter table public.tasks enable row level security;
alter table public.email_classifications enable row level security;
alter table public.daily_briefs enable row level security;
alter table public.integrations enable row level security;

do $$
declare t text;
begin
  foreach t in array array['tasks', 'email_classifications', 'daily_briefs', 'integrations'] loop
    execute format('drop policy if exists "dueno_select" on public.%I', t);
    execute format('drop policy if exists "dueno_insert" on public.%I', t);
    execute format('drop policy if exists "dueno_update" on public.%I', t);
    execute format('drop policy if exists "dueno_delete" on public.%I', t);
    execute format('create policy "dueno_select" on public.%I for select using (auth.uid() = user_id)', t);
    execute format('create policy "dueno_insert" on public.%I for insert with check (auth.uid() = user_id)', t);
    execute format('create policy "dueno_update" on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format('create policy "dueno_delete" on public.%I for delete using (auth.uid() = user_id)', t);
  end loop;
end $$;
