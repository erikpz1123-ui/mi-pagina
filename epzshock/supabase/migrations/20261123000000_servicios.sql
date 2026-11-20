-- Epzshock — catálogo de servicios y precios (planes, retos, etc.)
-- Visible para todos (también desde el link público de redes); solo el entrenador lo edita.

create table public.servicios (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null check (char_length(nombre) between 1 and 80),
  categoria   text not null default 'plan' check (categoria in ('plan', 'reto', 'otro')),
  precio      numeric(10, 2) check (precio >= 0 and precio < 1000000),
  periodo     text check (char_length(periodo) <= 30),          -- p. ej. "al mes", "4 semanas", "pago único"
  descripcion text check (char_length(descripcion) <= 500),
  incluye     text[] not null default '{}' check (coalesce(array_length(incluye, 1), 0) <= 15),
  destacado   boolean not null default false,
  orden       int not null default 0,
  activo      boolean not null default true,
  actualizado timestamptz not null default now()
);
alter table public.servicios enable row level security;
create policy servicios_publicos on public.servicios for select to anon using (activo);
create policy servicios_ver on public.servicios for select to authenticated using (activo or privado.es_entrenador());
create policy servicios_entrenador on public.servicios for all to authenticated
  using (privado.es_entrenador()) with check (privado.es_entrenador());
grant select on public.servicios to anon;
grant select, insert, update, delete on public.servicios to authenticated;

-- WhatsApp del entrenador para recibir pedidos, y el servicio que le interesa a cada solicitud
alter table public.ajustes add column if not exists whatsapp text check (char_length(whatsapp) <= 20);
alter table public.solicitudes add column if not exists servicio text check (char_length(servicio) <= 120);
