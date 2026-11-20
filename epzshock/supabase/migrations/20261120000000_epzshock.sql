-- Epzshock — esquema de la nube (Supabase / Postgres)
-- Principio: la seguridad la impone la base de datos (RLS), no la app.
--   · Entrenador (Erik): ve y gestiona todo.
--   · Cliente: solo ve lo suyo, rutinas vigentes, top público de retos y el detalle
--     de los retos que pagó. Nunca puede cambiarse el rol, la antigüedad ni el referido.

create extension if not exists pgcrypto;

/* ============ Perfiles ============ */
create table public.perfiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  rol              text not null default 'cliente' check (rol in ('entrenador', 'cliente')),
  nombre           text not null check (char_length(nombre) between 1 and 80),
  telefono         text check (char_length(telefono) <= 20),
  cliente_desde    date not null default current_date,
  codigo_referido  text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  referido_por     uuid references public.perfiles(id) on delete set null,
  cliente_local_id text,                       -- id del cliente en la app del entrenador
  activo           boolean not null default true,
  creado_en        timestamptz not null default now()
);

create or replace function public.es_entrenador() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles where id = auth.uid() and rol = 'entrenador');
$$;

create or replace function public.es_cliente_activo() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles where id = auth.uid() and rol = 'cliente' and activo);
$$;

alter table public.perfiles enable row level security;
create policy perfiles_ver on public.perfiles for select to authenticated
  using (id = auth.uid() or public.es_entrenador());
create policy perfiles_editar_propio on public.perfiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
-- El cliente solo puede cambiar su nombre y teléfono (privilegios por columna)
revoke insert, update, delete on public.perfiles from anon, authenticated;
grant update (nombre, telefono) on public.perfiles to authenticated;

-- El entrenador cambia estado / antigüedad / vínculo con su app mediante esta función
create or replace function public.entrenador_actualizar_cliente(
  p_id uuid, p_activo boolean default null, p_cliente_desde date default null, p_cliente_local_id text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_entrenador() then raise exception 'solo el entrenador' using errcode = '42501'; end if;
  update perfiles set
    activo           = coalesce(p_activo, activo),
    cliente_desde    = coalesce(p_cliente_desde, cliente_desde),
    cliente_local_id = coalesce(p_cliente_local_id, cliente_local_id)
  where id = p_id and rol = 'cliente';
end $$;

/* ============ Ajustes (descuentos y límites) ============ */
create table public.ajustes (
  id                     int primary key default 1 check (id = 1),
  descuento_lealtad      int not null default 10 check (descuento_lealtad between 0 and 50),
  meses_lealtad          int not null default 3  check (meses_lealtad between 1 and 24),
  descuento_amigo        int not null default 10 check (descuento_amigo between 0 and 50),
  premio_referidor       int not null default 10 check (premio_referidor between 0 and 50),
  mensajes_ia_dia        int not null default 20 check (mensajes_ia_dia between 0 and 200)
);
insert into public.ajustes (id) values (1) on conflict do nothing;
alter table public.ajustes enable row level security;
create policy ajustes_ver on public.ajustes for select to authenticated using (true);
create policy ajustes_editar on public.ajustes for update to authenticated
  using (public.es_entrenador()) with check (public.es_entrenador());

/* ============ Invitaciones (registro solo por link del entrenador) ============ */
create table public.invitaciones (
  codigo           text primary key default encode(gen_random_bytes(9), 'hex'),
  nombre           text not null check (char_length(nombre) between 1 and 80),
  telefono         text,
  cliente_local_id text,
  referido_por     uuid references public.perfiles(id) on delete set null,
  creada_en        timestamptz not null default now(),
  expira_en        timestamptz not null default now() + interval '14 days',
  usada_por        uuid references public.perfiles(id) on delete set null,
  usada_en         timestamptz
);
alter table public.invitaciones enable row level security;
create policy invitaciones_entrenador on public.invitaciones for all to authenticated
  using (public.es_entrenador()) with check (public.es_entrenador());

/* ============ Solicitudes que llegan por link de recomendación ============ */
create table public.solicitudes (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null check (char_length(nombre) between 1 and 80),
  telefono      text not null check (char_length(telefono) between 7 and 20),
  mensaje       text check (char_length(mensaje) <= 500),
  referido_por  uuid references public.perfiles(id) on delete set null,
  estado        text not null default 'pendiente' check (estado in ('pendiente', 'aceptada', 'descartada')),
  creada_en     timestamptz not null default now()
);
alter table public.solicitudes enable row level security;
create policy solicitudes_entrenador on public.solicitudes for all to authenticated
  using (public.es_entrenador()) with check (public.es_entrenador());

/* ============ Rutinas asignadas con vigencia ============ */
create table public.rutinas (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null references public.perfiles(id) on delete cascade,
  nombre        text not null check (char_length(nombre) between 1 and 120),
  contenido     jsonb not null,
  activa_desde  timestamptz not null default now(),
  activa_hasta  timestamptz not null,
  creada_en     timestamptz not null default now(),
  check (activa_hasta > activa_desde)
);
create index on public.rutinas (cliente_id, activa_hasta);
alter table public.rutinas enable row level security;
create policy rutinas_cliente_vigentes on public.rutinas for select to authenticated
  using (cliente_id = auth.uid() and public.es_cliente_activo()
         and now() >= activa_desde and now() < activa_hasta);
create policy rutinas_entrenador on public.rutinas for all to authenticated
  using (public.es_entrenador()) with check (public.es_entrenador());

/* ============ Entrenos que registran los clientes (sincronización offline) ============ */
create table public.entrenos (
  id          uuid primary key default gen_random_uuid(),   -- lo genera el teléfono: reenvíos idempotentes
  cliente_id  uuid not null default auth.uid() references public.perfiles(id) on delete cascade,
  rutina_id   uuid references public.rutinas(id) on delete set null,
  nombre      text not null check (char_length(nombre) <= 120),
  datos       jsonb not null,
  fecha       timestamptz not null default now(),
  creado_en   timestamptz not null default now()
);
create index on public.entrenos (cliente_id, fecha desc);
alter table public.entrenos enable row level security;
create policy entrenos_cliente_ver on public.entrenos for select to authenticated
  using (cliente_id = auth.uid() or public.es_entrenador());
create policy entrenos_cliente_crear on public.entrenos for insert to authenticated
  with check (cliente_id = auth.uid() and public.es_cliente_activo());
create policy entrenos_entrenador_borrar on public.entrenos for delete to authenticated
  using (public.es_entrenador());

/* ============ Chat de ayuda ============ */
create table public.mensajes (
  id                bigint generated always as identity primary key,
  cliente_id        uuid not null references public.perfiles(id) on delete cascade,
  autor             text not null check (autor in ('cliente', 'asistente', 'entrenador')),
  texto             text not null check (char_length(texto) between 1 and 4000),
  necesita_entrenador boolean not null default false,
  leido_entrenador  boolean not null default false,
  creado_en         timestamptz not null default now()
);
create index on public.mensajes (cliente_id, creado_en);
alter table public.mensajes enable row level security;
create policy mensajes_ver on public.mensajes for select to authenticated
  using (cliente_id = auth.uid() or public.es_entrenador());
-- Los clientes escriben solo a través de la función chat-ayuda (servidor); el entrenador responde directo
create policy mensajes_entrenador_escribe on public.mensajes for insert to authenticated
  with check (public.es_entrenador() and autor = 'entrenador');
create policy mensajes_entrenador_marca on public.mensajes for update to authenticated
  using (public.es_entrenador()) with check (public.es_entrenador());

/* ============ Retos ============ */
create table public.retos_publicos (
  id          text primary key,              -- id del reto en la app del entrenador
  nombre      text not null,
  premio      text,
  reglas      text,
  inicio      date not null,
  fin         date not null,
  hashtag     text,
  unidad      text,
  estado      text not null default 'activo',
  top         jsonb not null default '[]',   -- top 5 visible para todos
  ganador     text,
  actualizado timestamptz not null default now()
);
create table public.retos_detalle (
  reto_id     text primary key references public.retos_publicos(id) on delete cascade,
  datos       jsonb not null                 -- ranking completo y muro: solo quien pagó
);
create table public.reto_accesos (
  reto_id     text references public.retos_publicos(id) on delete cascade,
  cliente_id  uuid references public.perfiles(id) on delete cascade,
  primary key (reto_id, cliente_id)
);
alter table public.retos_publicos enable row level security;
alter table public.retos_detalle  enable row level security;
alter table public.reto_accesos   enable row level security;
create policy retos_publicos_ver on public.retos_publicos for select to authenticated
  using (public.es_cliente_activo() or public.es_entrenador());
create policy retos_publicos_entrenador on public.retos_publicos for all to authenticated
  using (public.es_entrenador()) with check (public.es_entrenador());
create policy retos_detalle_pagados on public.retos_detalle for select to authenticated
  using (public.es_entrenador() or (public.es_cliente_activo() and exists (
    select 1 from public.reto_accesos a where a.reto_id = retos_detalle.reto_id and a.cliente_id = auth.uid())));
create policy retos_detalle_entrenador on public.retos_detalle for all to authenticated
  using (public.es_entrenador()) with check (public.es_entrenador());
create policy reto_accesos_ver on public.reto_accesos for select to authenticated
  using (cliente_id = auth.uid() or public.es_entrenador());
create policy reto_accesos_entrenador on public.reto_accesos for all to authenticated
  using (public.es_entrenador()) with check (public.es_entrenador());

/* ============ Beneficios del cliente (lealtad y referidos) ============ */
create or replace function public.mis_beneficios() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'meses',              (extract(year from age(current_date, p.cliente_desde)) * 12
                           + extract(month from age(current_date, p.cliente_desde)))::int,
    'meses_lealtad',      a.meses_lealtad,
    'descuento_lealtad',  case when age(current_date, p.cliente_desde) >= make_interval(months => a.meses_lealtad)
                               then a.descuento_lealtad else 0 end,
    'codigo_referido',    p.codigo_referido,
    'descuento_amigo',    a.descuento_amigo,
    'premio_referidor',   a.premio_referidor,
    'referidos_activos',  (select count(*) from perfiles r where r.referido_por = p.id and r.activo)
  )
  from perfiles p cross join ajustes a
  where p.id = auth.uid();
$$;

revoke execute on function public.entrenador_actualizar_cliente(uuid, boolean, date, text) from public, anon;
revoke execute on function public.mis_beneficios() from public, anon;
grant execute on function public.entrenador_actualizar_cliente(uuid, boolean, date, text) to authenticated;
grant execute on function public.mis_beneficios() to authenticated;

/* ============ Permisos explícitos (no dependen de la configuración del proyecto) ============ */
-- RLS decide qué filas ve cada quien; estos permisos solo abren las tablas a usuarios con sesión.
grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.ajustes, public.invitaciones, public.solicitudes, public.rutinas, public.entrenos,
  public.mensajes, public.retos_publicos, public.retos_detalle, public.reto_accesos
  to authenticated;
grant select on public.perfiles to authenticated;
grant update (nombre, telefono) on public.perfiles to authenticated;
grant usage, select on all sequences in schema public to authenticated;
