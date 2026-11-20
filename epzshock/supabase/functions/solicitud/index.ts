// Solicitudes que llegan por el link de recomendación de un cliente.
// No crea cuentas: Erik las revisa y decide si envía la invitación.
import { admin, cors, cuerpo, error, json, texto } from "../_shared/comun.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return error("Método no permitido", 405);

  const b = await cuerpo(req);
  if (b.sitio) return json({ ok: true }); // campo trampa: los bots lo rellenan
  const nombre = texto(b.nombre, 1, 80);
  const telefono = texto(b.telefono, 7, 20)?.replace(/[^\d+]/g, "");
  const mensaje = texto(b.mensaje ?? "", 0, 500) ?? "";
  const ref = texto(b.ref ?? "", 0, 16)?.toUpperCase() ?? "";
  if (!nombre || !telefono || telefono.length < 7) return error("Escribe tu nombre y un WhatsApp válido.");

  const db = admin();
  const { count } = await db.from("solicitudes").select("id", { count: "exact", head: true })
    .eq("telefono", telefono).eq("estado", "pendiente");
  if ((count ?? 0) > 0) return json({ ok: true, repetida: true });

  let referidoPor: string | null = null;
  if (ref) {
    const { data } = await db.from("perfiles").select("id").eq("codigo_referido", ref).eq("activo", true).maybeSingle();
    referidoPor = data?.id ?? null;
  }
  const { error: e } = await db.from("solicitudes").insert({ nombre, telefono, mensaje: mensaje || null, referido_por: referidoPor });
  return e ? error("No se pudo enviar. Inténtalo de nuevo.", 500) : json({ ok: true });
});
