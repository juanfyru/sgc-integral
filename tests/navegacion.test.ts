import { describe, expect, it } from "vitest";
import { NAVEGACION, entradasVisibles, esActiva } from "@/componentes/cascaron/navegacion";

describe("navegación por módulos y rol", () => {
  it("consulta ve Inicio y Buscar; admin ve las catorce", () => {
    expect(entradasVisibles({ rol: "consulta" }).map((e) => e.href)).toEqual(["/", "/buscar"]);
    expect(entradasVisibles({ rol: "admin_sgc" })).toHaveLength(14);
  });
  it("Trámites: consulta solo si participa; gerencia y líder siempre; va después de Buscar", () => {
    const hrefs = (s: Parameters<typeof entradasVisibles>[0]) => entradasVisibles(s).map((e) => e.href);
    expect(hrefs({ rol: "consulta" })).not.toContain("/tramites");
    expect(hrefs({ rol: "control_interno" })).not.toContain("/tramites");
    expect(hrefs({ rol: "consulta", participaEnTramites: true })).toEqual(["/", "/buscar", "/tramites"]);
    expect(hrefs({ rol: "gerencia" })).toContain("/tramites");
    expect(hrefs({ rol: "lider_proceso" })).toContain("/tramites");
    expect(hrefs({ rol: "admin_sgc" }).indexOf("/tramites")).toBe(hrefs({ rol: "admin_sgc" }).indexOf("/buscar") + 1);
  });
  it("Trámites se marca en sus subrutas", () => {
    const tramites = NAVEGACION.find((e) => e.href === "/tramites")!;
    expect(esActiva(tramites, "/tramites/7")).toBe(true);
    expect(esActiva(tramites, "/tramites/nueva")).toBe(true);
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
  it("Gestión de documentos también se marca en /admin/documentos/*", () => {
    const gestion = NAVEGACION.find((e) => e.href === "/admin")!;
    expect(esActiva(gestion, "/admin/documentos/SGC-PR-01")).toBe(true);
    expect(esActiva(gestion, "/admin/documentos/nuevo")).toBe(true);
    expect(esActiva(gestion, "/admin/usuarios")).toBe(false);
  });
});

describe("Entidad y marca", () => {
  it("exige entidad.administrar: control interno no la ve", () => {
    expect(NAVEGACION.find((e) => e.href === "/admin/entidad")?.permiso).toBe("entidad.administrar");
    expect(entradasVisibles({ rol: "control_interno" }).map((e) => e.href)).not.toContain("/admin/entidad");
  });
});
