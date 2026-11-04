import { describe, expect, it } from "vitest";
import { misTareas } from "@/lib/tareas";

describe("misTareas", () => {
  it("en la Fase 12 no hay fuentes: devuelve una lista vacía", async () => {
    expect(await misTareas({ usuarioId: 1, rol: "consulta" })).toEqual([]);
  });
});
