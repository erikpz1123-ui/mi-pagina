// Solicitudes que llegan por el link de recomendación de un cliente.
// No crea cuentas: Erik las revisa y decide si envía la invitación.
import { admin, cuerpo, error, huella, json, servir, texto } from "../_shared/comun.ts";

Deno.serve(servir(async (req) => {

  const b = await cuerpo(req);
  if (b.sitio) return json({ ok: true }); // campo trampa: los bots lo rellenan
  const nombre = texto(b.nombre, 1, 80);
  const telefono = texto(b.telefono, 7, 20)?.replace(/[^\d+]/g, "");
  const mensaje = texto(b.mensaje ?? "", 0, 500) ?? "";
  const ref = texto(b.ref ?? "", 0, 16)?.toUpperCase() ?? "";
  if (!nombre || !telefono || telefono.length < 7) return error("Escribe tu nombre y un WhatsApp válido.");

  const db = admin();
  const miHuella = await huella(req);
  const haceUnaHora = new Date(Date.now() - 3600_000).toISOString();
  const haceUnDia = new Date(Date.now() - 86400_000).toISOString();
  const [{ count: porConexion }, { count: total }, { count: mismoTelefono }] = await Promise.all([
    db.from("solicitudes").select("id", { count: "exact", head: true }).eq("huella", miHuella).gte("creada_en", haceUnaHora),
    db.from("solicitudes").select("id", { count: "exact", head: true }).gte("creada_en", haceUnDia),
    db.from("solicitudes").select("id", { count: "exact", head: true }).eq("telefono", telefono).eq("estado", "pendiente"),
  ]);
  // Anti-spam: 5 por conexión por hora y 300 al día en total
  if ((porConexion ?? 0) >= 5) return error("Ya enviaste varias solicitudes. Inténtalo más tarde.", 429);
  if ((total ?? 0) >= 300) return error("Recibimos muchas solicitudes hoy. Escríbele a Erik por redes sociales.", 429);
  if ((mismoTelefono ?? 0) > 0) return json({ ok: true, repetida: true });

  let referidoPor: string | null = null;
  if (ref) {
    const { data } = await db.from("perfiles").select("id").eq("codigo_referido", ref).eq("activo", true).maybeSingle();
    referidoPor = data?.id ?? null;
  }
  const { error: e } = await db.from("solicitudes").insert({ nombre, telefono, mensaje: mensaje || null, referido_por: referidoPor, huella: miHuella });
  return e ? error("No se pudo enviar. Inténtalo de nuevo.", 500) : json({ ok: true });
}));
