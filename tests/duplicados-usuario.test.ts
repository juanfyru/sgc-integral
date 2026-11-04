import { describe, expect, it } from "vitest";
import { duplicadosSinMayusculas, mensajeDuplicados } from "@/db/duplicados-usuario";

describe("duplicados de usuario sin mayúsculas", () => {
  it("agrupa los que coinciden sin mayúsculas y conserva el orden", () => {
    expect(duplicadosSinMayusculas(["admin", "gerente", "Admin", "ADMIN", "consulta"])).toEqual([["admin", "Admin", "ADMIN"]]);
    expect(duplicadosSinMayusculas(["a", "b"])).toEqual([]);
  });
  it("el mensaje nombra los duplicados y pide renombrar", () => {
    const m = mensajeDuplicados([["admin", "Admin"]]);
    expect(m).toBe("Hay cuentas duplicadas sin distinguir mayúsculas: admin, Admin. Renombre una antes de actualizar.");
  });
  it("separa varios grupos con «; »", () => {
    expect(mensajeDuplicados([["a", "A"], ["b", "B"]])).toContain("a, A; b, B.");
  });
});
