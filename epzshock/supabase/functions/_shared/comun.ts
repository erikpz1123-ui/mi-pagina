// Utilidades compartidas por las funciones de Epzshock
import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";

// Solo la app (web y apps nativas) puede llamar a estas funciones desde un navegador
const ORIGENES = new Set([
  "https://epzshock.netlify.app",
  "capacitor://localhost", // app de iPhone
  "https://localhost",     // app de Android
]);
const origenPermitido = (o: string | null) => !!o && (ORIGENES.has(o) || /^http:\/\/localhost(:\d+)?$/.test(o));

function cabecerasCors(origen: string | null): Record<string, string> {
  return origenPermitido(origen)
    ? {
      "Access-Control-Allow-Origin": origen!,
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin",
    }
    : { "Vary": "Origin" };
}

/** Envuelve una función: CORS restringido, solo POST, tamaño máximo del cuerpo y cabeceras seguras. */
export function servir(manejador: (req: Request) => Promise<Response>, { maxBytes = 20_000 } = {}) {
  return async (req: Request): Promise<Response> => {
    const extra = { ...cabecerasCors(req.headers.get("Origin")), "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" };
    if (req.method === "OPTIONS") return new Response(null, { status: origenPermitido(req.headers.get("Origin")) ? 204 : 403, headers: extra });
    let res: Response;
    if (req.method !== "POST") res = error("Método no permitido", 405);
    else if (Number(req.headers.get("content-length") ?? 0) > maxBytes) res = error("Petición demasiado grande", 413);
    else {
      try { res = await manejador(req); } catch (e) { console.error(e); res = error("Error interno", 500); }
    }
    for (const [k, v] of Object.entries(extra)) res.headers.set(k, v);
    return res;
  };
}

export function json(datos: unknown, status = 200): Response {
  return new Response(JSON.stringify(datos), { status, headers: { "Content-Type": "application/json" } });
}

export const error = (mensaje: string, status = 400) => json({ error: mensaje }, status);

/** Cliente con la clave de servicio: salta RLS. Solo se usa dentro de estas funciones. */
export function admin(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Devuelve el usuario dueño del token de la petición, o null. */
export async function usuarioDe(req: Request): Promise<User | null> {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error: e } = await admin().auth.getUser(token);
  return e ? null : data.user;
}

export type Perfil = { id: string; rol: "entrenador" | "cliente"; nombre: string; activo: boolean };

export async function perfilDe(db: SupabaseClient, id: string): Promise<Perfil | null> {
  const { data } = await db.from("perfiles").select("id, rol, nombre, activo").eq("id", id).maybeSingle();
  return data as Perfil | null;
}

export function texto(v: unknown, min: number, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length >= min && t.length <= max ? t : null;
}

export async function cuerpo(req: Request): Promise<Record<string, unknown>> {
  try { return await req.json(); } catch { return {}; }
}

/** Huella anónima de la conexión (hash con sal): sirve para frenar spam sin guardar la IP. */
export async function huella(req: Request): Promise<string> {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "desconocida";
  const sal = Deno.env.get("SUPABASE_URL") ?? "";
  const datos = new TextEncoder().encode(`${sal}|${ip}`);
  const h = await crypto.subtle.digest("SHA-256", datos);
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}
