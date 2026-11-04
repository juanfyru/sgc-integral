import { describe, expect, it } from "vitest";
import { NAVEGACION, entradasVisibles, esActiva } from "@/componentes/cascaron/navegacion";

describe("navegación por módulos y rol", () => {
  it("consulta ve Inicio y Buscar; admin ve las trece", () => {
    expect(entradasVisibles({ rol: "consulta" }).map((e) => e.href)).toEqual(["/", "/buscar"]);
    expect(entradasVisibles({ rol: "admin_sgc" })).toHaveLength(13);
  });
  it("gerencia no ve Gestión de documentos pero sí Listado Maestro y Estadísticas", () => {
    const hrefs = entradasVisibles({ rol: "gerencia" }).map((e) => e.href);
    expect(hrefs).not.toContain("/admin");
    expect(hrefs).toContain("/admin/maestro");
    expect(hrefs).toContain("/admin/estadisticas");
  });
  it("la marca ver_historial abre Gestión de documentos a consulta", () => {
    expect(entradasVisibles({ rol: "consulta", verHistorial: true }).map((e) => e.href)).toContain("/admin");
  });
  it("esActiva: Inicio y Gestión son exactas; Usuarios por prefijo", () => {
    const por = (href: string) => NAVEGACION.find((e) => e.href === href)!;
    expect(esActiva(por("/"), "/buscar")).toBe(false);
    expect(esActiva(por("/admin"), "/admin/usuarios")).toBe(false);
    expect(esActiva(por("/admin/usuarios"), "/admin/usuarios/5")).toBe(true);
  });
});

describe("Entidad y marca", () => {
  it("exige entidad.administrar: control interno no la ve", () => {
    expect(NAVEGACION.find((e) => e.href === "/admin/entidad")?.permiso).toBe("entidad.administrar");
    expect(entradasVisibles({ rol: "control_interno" }).map((e) => e.href)).not.toContain("/admin/entidad");
  });
});
