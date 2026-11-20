// Utilidades compartidas por las funciones de Epzshock
import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(datos: unknown, status = 200): Response {
  return new Response(JSON.stringify(datos), { status, headers: { ...cors, "Content-Type": "application/json" } });
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
