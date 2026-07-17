import { describe, expect, it } from "vitest";
import { hashearClave, verificarClave } from "@/lib/clave";

describe("clave (Argon2id)", () => {
  it("verifica la clave correcta y rechaza la incorrecta", async () => {
    const hash = await hashearClave("Fatima-2026");
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verificarClave(hash, "Fatima-2026")).toBe(true);
    expect(await verificarClave(hash, "otra")).toBe(false);
  });

  it("dos hashes de la misma clave difieren (salt aleatoria)", async () => {
    expect(await hashearClave("x")).not.toBe(await hashearClave("x"));
  });

  it("no lanza ante un hash corrupto: devuelve false", async () => {
    expect(await verificarClave("basura", "x")).toBe(false);
  });
});
