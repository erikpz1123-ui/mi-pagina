-- Epzshock — chat sin IA (costo cero) y interruptor para activar la IA de pago más adelante.
-- Con ia_activa = false los clientes escriben directo al entrenador y no se llama a la API de Claude.

alter table public.ajustes add column if not exists ia_activa boolean not null default false;

-- El cliente puede escribir sus propios mensajes (solo como "cliente", sin marcarlos como leídos ni urgentes)
create policy mensajes_cliente_escribe on public.mensajes for insert to authenticated
  with check (
    cliente_id = auth.uid()
    and autor = 'cliente'
    and leido_entrenador = false
    and necesita_entrenador = false
    and public.es_cliente_activo()
  );
