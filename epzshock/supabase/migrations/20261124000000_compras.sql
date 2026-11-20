-- Epzshock — compras por transferencia (SPEI), ofertas, fechas límite y cupos.
-- El precio lo calcula SIEMPRE el servidor: un cliente no puede pagar menos manipulando su teléfono.

/* ---------- Servicios: oferta, fecha límite y cupo ---------- */
alter table public.servicios
  add column if not exists precio_antes     numeric(10, 2) check (precio_antes >= 0 and precio_antes < 1000000), -- precio normal (se muestra tachado durante la oferta)
  add column if not exists oferta_hasta     timestamptz,  -- al pasar esta fecha se cobra precio_antes
  add column if not exists disponible_hasta timestamptz,  -- al pasar esta fecha el servicio deja de verse y de venderse
  add column if not exists cupo             int check (cupo > 0 and cupo <= 10000);

-- Solo se ven los servicios activos y vigentes (el entrenador los ve todos)
drop policy if exists servicios_publicos on public.servicios;
drop policy if exists servicios_ver on public.servicios;
create policy servicios_publicos on public.servicios for select to anon
  using (activo and (disponible_hasta is null or now() < disponible_hasta));
create policy servicios_ver on public.servicios for select to authenticated
  using ((activo and (disponible_hasta is null or now() < disponible_hasta)) or privado.es_entrenador());

create or replace function privado.precio_vigente(s public.servicios) returns numeric
language sql stable as $$
  select case when s.oferta_hasta is not null and now() >= s.oferta_hasta and s.precio_antes is not null
              then s.precio_antes else s.precio end;
$$;

/* ---------- Datos para recibir transferencias ---------- */
alter table public.ajustes
  add column if not exists clabe   text check (clabe ~ '^[0-9]{18}$'),
  add column if not exists banco   text check (char_length(banco) <= 40),
  add column if not exists titular text check (char_length(titular) <= 80);

/* ---------- Compras ---------- */
create table public.compras (
  id              uuid primary key default gen_random_uuid(),
  cliente_id      uuid not null default auth.uid() references public.perfiles(id) on delete cascade,
  servicio_id     uuid references public.servicios(id) on delete set null,
  servicio_nombre text not null default '',
  monto           numeric(10, 2) not null default 0,
  referencia      text not null unique default ('EPZ-' || upper(substr(md5(gen_random_uuid()::text), 1, 6))),
  estado          text not null default 'pendiente' check (estado in ('pendiente', 'avisado', 'pagado', 'rechazado', 'cancelado')),
  creada_en       timestamptz not null default now(),
  avisado_en      timestamptz,
  confirmada_en   timestamptz
);
create index on public.compras (cliente_id, creada_en desc);
create index on public.compras (servicio_id, estado);
alter table public.compras enable row level security;
create policy compras_ver on public.compras for select to authenticated
  using (cliente_id = auth.uid() or privado.es_entrenador());
create policy compras_crear on public.compras for insert to authenticated
  with check (cliente_id = auth.uid() and privado.es_cliente_activo());
create policy compras_entrenador on public.compras for update to authenticated
  using (privado.es_entrenador()) with check (privado.es_entrenador());
grant select, insert on public.compras to authenticated;
grant update (estado, confirmada_en) on public.compras to authenticated;

-- Al crear una compra: el servidor fija precio, nombre, estado y referencia, y valida fecha, cupo y abusos
create or replace function privado.preparar_compra() returns trigger
language plpgsql security definer set search_path = public as $$
declare s servicios; ocupados int; pendientes int;
begin
  select * into s from servicios where id = new.servicio_id;
  if not found or not s.activo then raise exception 'Este servicio ya no está disponible.' using errcode = 'P0001'; end if;
  if s.disponible_hasta is not null and now() >= s.disponible_hasta then
    raise exception 'La venta de % ya cerró.', s.nombre using errcode = 'P0001'; end if;
  if s.precio is null then raise exception 'Este servicio no tiene precio: pídelo a Erik por el chat.' using errcode = 'P0001'; end if;
  if s.cupo is not null then
    select count(*) into ocupados from compras where servicio_id = s.id and estado in ('pendiente', 'avisado', 'pagado');
    if ocupados >= s.cupo then raise exception 'Se agotaron los lugares de %.', s.nombre using errcode = 'P0001'; end if;
  end if;
  select count(*) into pendientes from compras where cliente_id = new.cliente_id and estado in ('pendiente', 'avisado');
  if pendientes >= 3 then raise exception 'Tienes compras pendientes. Espera a que Erik las confirme.' using errcode = 'P0001'; end if;
  new.servicio_nombre := s.nombre;
  new.monto := privado.precio_vigente(s);
  new.estado := 'pendiente';
  new.referencia := 'EPZ-' || upper(substr(md5(gen_random_uuid()::text), 1, 6));
  new.creada_en := now(); new.avisado_en := null; new.confirmada_en := null;
  return new;
end $$;
drop trigger if exists compras_preparar on public.compras;
create trigger compras_preparar before insert on public.compras for each row execute function privado.preparar_compra();

-- El cliente avisa que ya transfirió (solo cambia su propia compra de pendiente a avisado)
create or replace function public.avisar_transferencia(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update compras set estado = 'avisado', avisado_en = now()
  where id = p_id and cliente_id = auth.uid() and estado = 'pendiente';
  if not found then raise exception 'No se encontró esa compra pendiente.' using errcode = 'P0001'; end if;
end $$;
revoke execute on function public.avisar_transferencia(uuid) from public, anon;
grant execute on function public.avisar_transferencia(uuid) to authenticated;

-- Lugares ocupados por servicio (para mostrar "quedan N lugares"), sin revelar quién compró
create or replace function public.cupos_ocupados() returns table (servicio_id uuid, ocupados bigint)
language sql stable security definer set search_path = public as $$
  select c.servicio_id, count(*) from compras c join servicios s on s.id = c.servicio_id
  where s.cupo is not null and c.estado in ('pendiente', 'avisado', 'pagado') group by c.servicio_id;
$$;
revoke execute on function public.cupos_ocupados() from public;
grant execute on function public.cupos_ocupados() to anon, authenticated;
