// Elimina la cuenta del cliente y todos sus datos (lo exigen App Store y Google Play).
// Al borrar el usuario, la base de datos borra en cascada su perfil, rutinas, entrenos y mensajes.
import { admin, cors, error, json, perfilDe, usuarioDe } from "../_shared/comun.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return error("Método no permitido", 405);
  const usuario = await usuarioDe(req);
  if (!usuario) return error("Inicia sesión.", 401);
  const db = admin();
  const perfil = await perfilDe(db, usuario.id);
  if (perfil?.rol === "entrenador") return error("La cuenta del entrenador no se elimina desde la app.", 403);
  const { error: e } = await db.auth.admin.deleteUser(usuario.id);
  return e ? error("No se pudo eliminar la cuenta. Escríbele a Erik.", 500) : json({ ok: true });
});
