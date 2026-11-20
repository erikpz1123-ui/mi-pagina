# Pruebas de seguridad de la base de datos

Comprueban con un Postgres real que las políticas RLS hacen lo que deben (30 casos: un cliente no puede
hacerse entrenador, ver rutinas vencidas o ajenas, ver el detalle de un reto que no pagó, falsificar mensajes, etc.).

```bash
createdb prueba
psql -d prueba -f simular_supabase.sql -f ../migrations/20261120000000_epzshock.sql
psql -d prueba -f pruebas_seguridad.sql   # termina con "TODAS LAS PRUEBAS DE SEGURIDAD PASARON"
```

`simular_supabase.sql` crea lo mínimo de Supabase (roles `anon`/`authenticated`, `auth.users`, `auth.uid()`).
No lo ejecutes en tu proyecto real de Supabase: allí ya existe.
