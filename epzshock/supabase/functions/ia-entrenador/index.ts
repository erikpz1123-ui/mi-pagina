// Asistente IA solo para el ENTRENADOR: crea rutinas, dietas, mensajes y planes de retos.
import Anthropic from "npm:@anthropic-ai/sdk@1";
import { admin, cors, cuerpo, error, json, perfilDe, usuarioDe } from "../_shared/comun.ts";
import { claude, MODELO, normalizarTurnos, textoDe, type Turno } from "../_shared/claude.ts";

const SISTEMA = `Eres el asistente profesional de Erik Perez, licenciado en Entrenamiento Deportivo y entrenador personal en México, dentro de su app EPZSHOCK.
Ayudas a Erik a diseñar rutinas (fuerza, hipertrofia, pérdida de grasa, explosividad, pliometría, prevención y readaptación de lesiones), planes de alimentación con alimentos de México, mensajes para clientes y retos para redes sociales.
- Responde en español, con criterio basado en evidencia y lenguaje de entrenador.
- Rutinas: nombre de cada sesión, ejercicios con series × repeticiones, descanso en segundos, indicaciones técnicas, calentamiento y progresión.
- Dietas: kcal y macros, comidas con gramos y medidas caseras, lista de la compra cuando aplique.
- Señala cuándo algo debe validarlo un médico, fisioterapeuta o nutricionista.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return error("Método no permitido", 405);

  const usuario = await usuarioDe(req);
  if (!usuario) return error("Inicia sesión.", 401);
  const perfil = await perfilDe(admin(), usuario.id);
  if (perfil?.rol !== "entrenador") return error("El asistente IA es solo para el entrenador.", 403);
  const { data: aj } = await admin().from("ajustes").select("ia_activa").eq("id", 1).single();
  if (!aj?.ia_activa) return error("La IA de pago está desactivada. Actívala en Ajustes o usa «Copiar» para pegarlo en tu Claude.", 403);

  const b = await cuerpo(req);
  const entrada = Array.isArray(b.mensajes) ? b.mensajes.slice(-30) : [];
  const turnos = normalizarTurnos(entrada
    .filter((m): m is Turno => (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string")
    .map((m) => ({ role: m.role, content: m.content.slice(0, 20000) })));
  if (!turnos.length || turnos[turnos.length - 1].role !== "user") return error("Falta tu mensaje.");

  try {
    const stream = claude.beta.messages.stream({
      model: MODELO,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      cache_control: { type: "ephemeral" },
      system: SISTEMA,
      messages: turnos,
    });
    const respuesta = textoDe(await stream.finalMessage());
    return respuesta === null ? error("Claude no pudo responder a esa petición. Reformúlala.", 422) : json({ respuesta });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return error("Límite de uso alcanzado. Espera un minuto.", 503);
    console.error("Claude", e instanceof Anthropic.APIError ? e.status : "", e);
    return error("No se pudo contactar con Claude.", 502);
  }
});
