import { assertEquals } from "jsr:@std/assert@1";
import { normalizarTurnos, textoDe } from "./claude.ts";

Deno.test("une turnos seguidos y empieza por el usuario", () => {
  const r = normalizarTurnos([
    { role: "assistant", content: "Hola, soy Erik" },
    { role: "user", content: "duda 1" },
    { role: "user", content: "duda 2" },
    { role: "assistant", content: "respuesta" },
    { role: "assistant", content: "[Mensaje de Erik]: ojo" },
    { role: "user", content: "  " },
    { role: "user", content: "gracias" },
  ]);
  assertEquals(r.map((t) => t.role), ["user", "assistant", "user"]);
  assertEquals(r[0].content, "duda 1\n\nduda 2");
  assertEquals(r[1].content, "respuesta\n\n[Mensaje de Erik]: ojo");
});

Deno.test("rechazo del modelo devuelve null; texto normal se une", () => {
  // deno-lint-ignore no-explicit-any
  const base: any = { content: [{ type: "text", text: "Hola" }, { type: "thinking", thinking: "" }, { type: "text", text: "¿Qué tal?" }] };
  assertEquals(textoDe({ ...base, stop_reason: "end_turn" }), "Hola\n¿Qué tal?");
  assertEquals(textoDe({ ...base, stop_reason: "refusal" }), null);
});
