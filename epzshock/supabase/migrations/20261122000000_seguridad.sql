-- Epzshock — refuerzo de seguridad
-- 1. Funciones internas fuera de la API pública (esquema privado, no expuesto por Supabase).
-- 2. Límites anti-abuso: mensajes y entrenos por cliente al día, solicitudes por conexión.
-- 3. Tamaños máximos para que nadie llene la base de datos con datos gigantes.

/* ---------- 1. Esquema privado para las funciones de permisos ---------- */
create schema if not exists privado;
revoke all on schema privado from public;
grant usage on schema privado to authenticated;

-- Las políticas guardan la referencia a la función, así que siguen funcionando tras moverlas
alter function public.es_entrenador() set schema privado;
alter function public.es_cliente_activo() set schema privado;
revoke execute on function privado.es_entrenador(), privado.es_cliente_activo() from public, anon;
grant execute on function privado.es_entrenador(), privado.es_cliente_activo() to authenticated;

create or replace function public.entrenador_actualizar_cliente(
  p_id uuid, p_activo boolean default null, p_cliente_desde date default null, p_cliente_local_id text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not privado.es_entrenador() then raise exception 'solo el entrenador' using errcode = '42501'; end if;
  update perfiles set
    activo           = coalesce(p_activo, activo),
    cliente_desde    = coalesce(p_cliente_desde, cliente_desde),
    cliente_local_id = coalesce(p_cliente_local_id, cliente_local_id)
  where id = p_id and rol = 'cliente';
end $$;

-- Función que crea Supabase al activar "RLS automático": nadie de fuera debe poder llamarla
do $$ begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'rls_auto_enable') then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;

/* ---------- 2. Límites anti-abuso ---------- */
create or replace function privado.limitar_mensajes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.autor = 'cliente' and (
    select count(*) from mensajes
    where cliente_id = new.cliente_id and autor = 'cliente' and creado_en > now() - interval '1 day'
  ) >= 60 then
    raise exception 'Llegaste al límite de mensajes por hoy. Escríbele a Erik por WhatsApp.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists mensajes_limite on public.mensajes;
create trigger mensajes_limite before insert on public.mensajes for each row execute function privado.limitar_mensajes();

create or replace function privado.limitar_entrenos() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from entrenos where cliente_id = new.cliente_id and creado_en > now() - interval '1 day') >= 40 then
    raise exception 'Demasiados entrenos registrados hoy.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists entrenos_limite on public.entrenos;
create trigger entrenos_limite before insert on public.entrenos for each row execute function privado.limitar_entrenos();

-- Solicitudes públicas: se guarda una huella anónima de la conexión (no la IP) para frenar el spam
alter table public.solicitudes add column if not exists huella text;
create index if not exists solicitudes_huella_idx on public.solicitudes (huella, creada_en);

/* ---------- 3. Tamaños máximos ---------- */
alter table public.entrenos       add constraint entrenos_tamano       check (pg_column_size(datos) < 100000);
alter table public.rutinas        add constraint rutinas_tamano        check (pg_column_size(contenido) < 300000);
alter table public.retos_detalle  add constraint retos_detalle_tamano  check (pg_column_size(datos) < 500000);
alter table public.retos_publicos add constraint retos_publicos_tamano check (pg_column_size(top) < 20000);
