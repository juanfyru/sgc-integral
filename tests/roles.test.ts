import { describe, expect, it } from "vitest";
import { ETIQUETA_ROL, ROLES, esRol, rolesConTotpObligatorio } from "@/lib/roles";

describe("roles", () => {
  it("son exactamente los cinco del spec, en este orden", () => {
    expect(ROLES).toEqual(["admin_sgc", "gerencia", "control_interno", "lider_proceso", "consulta"]);
    expect(Object.keys(ETIQUETA_ROL)).toHaveLength(5);
  });
  it("esRol distingue válidos de inválidos", () => {
    expect(esRol("gerencia")).toBe(true);
    expect(esRol("root")).toBe(false);
    expect(esRol(null)).toBe(false);
  });
  it("rolesConTotpObligatorio lee EXIGIR_2FA_ROLES e ignora basura", () => {
    expect(rolesConTotpObligatorio({})).toEqual([]);
    expect(rolesConTotpObligatorio({ EXIGIR_2FA_ROLES: "admin_sgc, gerencia,nada" })).toEqual(["admin_sgc", "gerencia"]);
  });
});
