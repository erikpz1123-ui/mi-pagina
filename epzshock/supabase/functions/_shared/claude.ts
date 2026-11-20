// Llamadas a Claude (API de Anthropic). La clave vive solo en el servidor (secreto ANTHROPIC_API_KEY).
import Anthropic from "npm:@anthropic-ai/sdk@1";

export const MODELO = "claude-opus-5-5";
export const claude = new Anthropic(); // lee ANTHROPIC_API_KEY del entorno

export type Turno = { role: "user" | "assistant"; content: string };

/** Une turnos seguidos del mismo rol y garantiza que la conversación empiece por "user". */
export function normalizarTurnos(turnos: Turno[]): Turno[] {
  const out: Turno[] = [];
  for (const t of turnos) {
    if (!t.content.trim()) continue;
    const ultimo = out[out.length - 1];
    if (ultimo && ultimo.role === t.role) ultimo.content += "\n\n" + t.content;
    else out.push({ ...t });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

/** Extrae el texto de la respuesta; devuelve null si el modelo rechazó la petición. */
export function textoDe(respuesta: Anthropic.Beta.BetaMessage): string | null {
  if (respuesta.stop_reason === "refusal") return null;
  return respuesta.content.filter((b) => b.type === "text").map((b) => (b as Anthropic.Beta.BetaTextBlock).text).join("\n").trim();
}
