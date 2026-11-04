import { describe, expect, it } from "vitest";
import { PERMISOS, puede, puedeEntrarAlPanel, requerirPermiso, type Permiso } from "@/lib/permisos";
import { ROLES, type Rol } from "@/lib/roles";

const ESPERADA: Record<Permiso, Rol[]> = {
  "panel.entrar": ["admin_sgc", "gerencia", "control_interno"],
  "documentos.administrar": ["admin_sgc"],
  "documentos.ver_historial": ["admin_sgc", "control_interno"],
  "mapa.administrar": ["admin_sgc"],
  "maestro.ver": ["admin_sgc", "gerencia", "control_interno"],
  "maestro.exportar": ["admin_sgc", "control_interno"],
  "estadisticas.ver": ["admin_sgc", "gerencia", "control_interno"],
  "bitacora.ver": ["admin_sgc", "control_interno"],
  "accesos.ver": ["admin_sgc", "control_interno"],
  "usuarios.administrar": ["admin_sgc"],
  "estructura.administrar": ["admin_sgc"],
  "sesiones.administrar": ["admin_sgc"],
};

describe("matriz de permisos", () => {
  for (const permiso of PERMISOS)
    for (const rol of ROLES) {
      it(`${rol} ${ESPERADA[permiso].includes(rol) ? "sí" : "no"} puede ${permiso}`, () => {
        expect(puede({ rol }, permiso)).toBe(ESPERADA[permiso].includes(rol));
      });
    }
  it("la marca individual ver_historial concede solo ese permiso", () => {
    expect(puede({ rol: "consulta", verHistorial: true }, "documentos.ver_historial")).toBe(true);
    expect(puede({ rol: "consulta", verHistorial: true }, "documentos.administrar")).toBe(false);
  });
  it("requerirPermiso lanza ErrorPermiso con el mensaje fijo", () => {
    expect(() => requerirPermiso({ rol: "consulta" }, "usuarios.administrar")).toThrow("Sin permiso para esta acción");
    expect(() => requerirPermiso({ rol: "admin_sgc" }, "usuarios.administrar")).not.toThrow();
  });
  it("PERMISOS cubre todas las claves de la matriz", () => {
    expect([...PERMISOS].sort()).toEqual(Object.keys(ESPERADA).sort());
  });
});

describe("puedeEntrarAlPanel", () => {
  it("consulta sin marca no entra; con marca sí; gerencia sí", () => {
    expect(puedeEntrarAlPanel({ rol: "consulta" })).toBe(false);
    expect(puedeEntrarAlPanel({ rol: "consulta", verHistorial: true })).toBe(true);
    expect(puedeEntrarAlPanel({ rol: "lider_proceso", verHistorial: true })).toBe(true);
    expect(puedeEntrarAlPanel({ rol: "gerencia" })).toBe(true);
  });
});
