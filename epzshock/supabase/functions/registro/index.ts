// Registro de clientes: solo con una invitación válida creada por el entrenador.
import { admin, cors, cuerpo, error, json, texto } from "../_shared/comun.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return error("Método no permitido", 405);

  const b = await cuerpo(req);
  const codigo = texto(b.codigo, 8, 64);
  const nombre = texto(b.nombre, 1, 80);
  const email = texto(b.email, 5, 200)?.toLowerCase();
  const password = typeof b.password === "string" && b.password.length >= 8 && b.password.length <= 72 ? b.password : null;
  const telefono = texto(b.telefono ?? "", 0, 20) ?? "";
  if (!codigo || !nombre || !email || !password || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return error("Revisa tus datos: nombre, correo válido y contraseña de al menos 8 caracteres.");
  }

  const db = admin();
  const { data: inv } = await db.from("invitaciones").select("*").eq("codigo", codigo).maybeSingle();
  if (!inv || inv.usada_por || new Date(inv.expira_en) < new Date()) {
    return error("Esta invitación no es válida o ya se usó. Pide a Erik un link nuevo.", 403);
  }

  const { data: creado, error: eUsuario } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { nombre } });
  if (eUsuario || !creado.user) {
    return error(eUsuario?.message?.includes("already") ? "Ese correo ya tiene cuenta. Inicia sesión." : "No se pudo crear la cuenta.", 409);
  }
  const id = creado.user.id;

  const { error: ePerfil } = await db.from("perfiles").insert({
    id, nombre, telefono: telefono || inv.telefono || null,
    referido_por: inv.referido_por, cliente_local_id: inv.cliente_local_id,
  });
  // Reclama la invitación de forma atómica: si otra persona la usó a la vez, se deshace todo
  const { data: reclamada } = ePerfil ? { data: [] } : await db.from("invitaciones")
    .update({ usada_por: id, usada_en: new Date().toISOString() })
    .eq("codigo", codigo).is("usada_por", null).select("codigo");
  if (ePerfil || !reclamada?.length) {
    await db.auth.admin.deleteUser(id);
    return error("Esta invitación ya se usó. Pide a Erik un link nuevo.", 409);
  }
  return json({ ok: true });
});
