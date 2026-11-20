-- Pruebas de seguridad (RLS). Cada bloque falla con ERROR si algo no se cumple.
\set ON_ERROR_STOP on
insert into auth.users values
 ('00000000-0000-0000-0000-00000000000e','erik@x'),('00000000-0000-0000-0000-00000000000a','ana@x'),
 ('00000000-0000-0000-0000-00000000000b','luis@x'),('00000000-0000-0000-0000-00000000000c','inactivo@x');
insert into perfiles (id, rol, nombre) values ('00000000-0000-0000-0000-00000000000e','entrenador','Erik');
insert into perfiles (id, nombre, cliente_desde) values
 ('00000000-0000-0000-0000-00000000000a','Ana', current_date - interval '4 months'),
 ('00000000-0000-0000-0000-00000000000b','Luis', current_date - interval '1 month');
insert into perfiles (id, nombre, activo) values ('00000000-0000-0000-0000-00000000000c','Inactivo', false);
update perfiles set referido_por = '00000000-0000-0000-0000-00000000000a' where nombre = 'Luis';

create function pg_temp.como(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); execute 'set role authenticated'; end $$;
create function pg_temp.esperar(cond boolean, msg text) returns void language plpgsql as $$
begin if not cond then raise exception 'FALLÓ: %', msg; end if; raise notice 'ok: %', msg; end $$;

-- Datos del entrenador
select pg_temp.como('00000000-0000-0000-0000-00000000000e') \g /dev/null
insert into rutinas (cliente_id, nombre, contenido, activa_hasta) values
 ('00000000-0000-0000-0000-00000000000a','Pierna A','{}', now() + interval '7 days'),
 ('00000000-0000-0000-0000-00000000000b','Torso','{}', now() + interval '3 days'),
 ('00000000-0000-0000-0000-00000000000c','De inactivo','{}', now() + interval '3 days');
insert into rutinas (cliente_id, nombre, contenido, activa_desde, activa_hasta) values
 ('00000000-0000-0000-0000-00000000000a','Vieja','{}', now() - interval '10 days', now() - interval '1 day');
insert into retos_publicos (id, nombre, inicio, fin, top) values ('r1','Reto 30 días', current_date, current_date + 30, '[{"puesto":1,"nombre":"Ana L.","puntos":"5 %"}]');
insert into retos_detalle values ('r1', '{"ranking":"completo"}');
insert into reto_accesos values ('r1','00000000-0000-0000-0000-00000000000a');
insert into invitaciones (nombre) values ('Pedro');
insert into mensajes (cliente_id, autor, texto) values ('00000000-0000-0000-0000-00000000000a','entrenador','Hola Ana');
select pg_temp.esperar((select count(*) from perfiles) = 4, 'entrenador ve todos los perfiles') \g /dev/null
reset role;

-- Cliente Ana
select pg_temp.como('00000000-0000-0000-0000-00000000000a') \g /dev/null
select pg_temp.esperar((select count(*) from perfiles) = 1, 'Ana solo ve su perfil') \g /dev/null
select pg_temp.esperar((select array_agg(nombre) from rutinas) = '{Pierna A}', 'Ana solo ve su rutina vigente (no la vencida ni las de otros)') \g /dev/null
select pg_temp.esperar((select count(*) from retos_publicos) = 1, 'Ana ve el top público del reto') \g /dev/null
select pg_temp.esperar((select count(*) from retos_detalle) = 1, 'Ana (pagó) ve el detalle del reto') \g /dev/null
select pg_temp.esperar((select count(*) from invitaciones) = 0, 'Ana no ve invitaciones') \g /dev/null
select pg_temp.esperar((select count(*) from mensajes) = 1, 'Ana ve su chat') \g /dev/null
select pg_temp.esperar((mis_beneficios()->>'descuento_lealtad')::int = 10, 'Ana (4 meses) tiene descuento de lealtad') \g /dev/null
select pg_temp.esperar((mis_beneficios()->>'referidos_activos')::int = 1, 'Ana tiene 1 referido activo') \g /dev/null
update perfiles set nombre = 'Ana López' where id = auth.uid();
select pg_temp.esperar((select nombre from perfiles) = 'Ana López', 'Ana puede cambiar su nombre') \g /dev/null
insert into entrenos (nombre, datos) values ('Pierna A', '{}');
select pg_temp.esperar((select count(*) from entrenos) = 1, 'Ana registra su entreno') \g /dev/null
do $$ begin
  begin update perfiles set rol = 'entrenador' where id = auth.uid(); raise exception 'FALLÓ: Ana pudo cambiar su rol';
  exception when insufficient_privilege then raise notice 'ok: Ana no puede hacerse entrenadora'; end;
  begin update perfiles set cliente_desde = '2020-01-01' where id = auth.uid(); raise exception 'FALLÓ: Ana cambió su antigüedad';
  exception when insufficient_privilege then raise notice 'ok: Ana no puede falsear su antigüedad'; end;
  begin insert into rutinas (cliente_id, nombre, contenido, activa_hasta) values (auth.uid(),'Hack','{}', now() + interval '1 year');
    raise exception 'FALLÓ: Ana se creó una rutina';
  exception when insufficient_privilege then raise notice 'ok: Ana no puede crearse rutinas'; end;
  begin insert into entrenos (cliente_id, nombre, datos) values ('00000000-0000-0000-0000-00000000000b','x','{}');
    raise exception 'FALLÓ: Ana escribió un entreno de Luis';
  exception when insufficient_privilege then raise notice 'ok: Ana no puede escribir entrenos de otros'; end;
  begin insert into mensajes (cliente_id, autor, texto) values (auth.uid(),'asistente','falso');
    raise exception 'FALLÓ: Ana falsificó un mensaje';
  exception when insufficient_privilege then raise notice 'ok: Ana no puede falsificar mensajes'; end;
  begin insert into reto_accesos values ('r1', '00000000-0000-0000-0000-00000000000b');
    raise exception 'FALLÓ: Ana dio acceso a otro';
  exception when insufficient_privilege then raise notice 'ok: Ana no puede dar accesos a retos'; end;
  begin perform entrenador_actualizar_cliente(auth.uid(), true, '2020-01-01');
    raise exception 'FALLÓ: Ana usó la función del entrenador';
  exception when insufficient_privilege then raise notice 'ok: Ana no puede usar funciones del entrenador'; end;
end $$;
select pg_temp.esperar((select count(*) from rutinas) = 1, 'después de todo, Ana sigue viendo 1 rutina') \g /dev/null
reset role;

-- Cliente Luis: no pagó el reto
select pg_temp.como('00000000-0000-0000-0000-00000000000b') \g /dev/null
select pg_temp.esperar((select count(*) from retos_publicos) = 1, 'Luis ve el top público') \g /dev/null
select pg_temp.esperar((select count(*) from retos_detalle) = 0, 'Luis (no pagó) NO ve el detalle') \g /dev/null
select pg_temp.esperar((select count(*) from entrenos) = 0, 'Luis no ve entrenos de Ana') \g /dev/null
select pg_temp.esperar((select count(*) from mensajes) = 0, 'Luis no ve el chat de Ana') \g /dev/null
select pg_temp.esperar((mis_beneficios()->>'descuento_lealtad')::int = 0, 'Luis (1 mes) aún no tiene lealtad') \g /dev/null
reset role;

-- Cliente desactivado
select pg_temp.como('00000000-0000-0000-0000-00000000000c') \g /dev/null
select pg_temp.esperar((select count(*) from rutinas) = 0, 'cliente desactivado no ve rutinas') \g /dev/null
select pg_temp.esperar((select count(*) from retos_publicos) = 0, 'cliente desactivado no ve retos') \g /dev/null
reset role;

-- Anónimo (sin sesión)
set role anon;
select pg_temp.esperar((select count(*) from perfiles) = 0, 'anónimo no ve perfiles') \g /dev/null
select pg_temp.esperar((select count(*) from rutinas) = 0, 'anónimo no ve rutinas') \g /dev/null
select pg_temp.esperar((select count(*) from retos_publicos) = 0, 'anónimo no ve retos') \g /dev/null
reset role;

-- El entrenador reactiva y ajusta
select pg_temp.como('00000000-0000-0000-0000-00000000000e') \g /dev/null
select entrenador_actualizar_cliente('00000000-0000-0000-0000-00000000000c', true) \g /dev/null
reset role;
select pg_temp.como('00000000-0000-0000-0000-00000000000c') \g /dev/null
select pg_temp.esperar((select count(*) from rutinas) = 1, 'al reactivarlo vuelve a ver su rutina') \g /dev/null
reset role;
\echo TODAS LAS PRUEBAS DE SEGURIDAD PASARON
