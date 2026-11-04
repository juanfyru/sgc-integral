import { describe, expect, it } from "vitest";
import { conCandado } from "@/lib/candado";

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("conCandado", () => {
  it("misma clave: se ejecutan en serie y en orden", async () => {
    const eventos: string[] = [];
    const tarea = (id: string) => async () => {
      eventos.push(`ini ${id}`);
      await espera(30);
      eventos.push(`fin ${id}`);
      return id;
    };
    const r = await Promise.all([conCandado("a", tarea("1")), conCandado("a", tarea("2"))]);
    expect(r).toEqual(["1", "2"]);
    expect(eventos).toEqual(["ini 1", "fin 1", "ini 2", "fin 2"]);
  });
  it("claves distintas: corren en paralelo", async () => {
    const eventos: string[] = [];
    const tarea = (id: string) => async () => {
      eventos.push(`ini ${id}`);
      await espera(30);
      eventos.push(`fin ${id}`);
    };
    await Promise.all([conCandado("a", tarea("1")), conCandado("b", tarea("2"))]);
    expect(eventos.slice(0, 2)).toEqual(["ini 1", "ini 2"]);
  });
  it("un fallo no bloquea la cola y se propaga a su llamador", async () => {
    const f = conCandado("c", async () => {
      throw new Error("falla");
    });
    const g = conCandado("c", async () => "sigue");
    await expect(f).rejects.toThrow("falla");
    expect(await g).toBe("sigue");
  });
});
