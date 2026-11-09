import { describe, expect, it } from "vitest";
import { NAVEGACION, entradasVisibles, esActiva } from "@/componentes/cascaron/navegacion";

describe("navegación por módulos y rol", () => {
  it("consulta ve Inicio y Buscar; admin ve las diecinueve", () => {
    expect(entradasVisibles({ rol: "consulta" }).map((e) => e.href)).toEqual(["/", "/buscar"]);
    expect(entradasVisibles({ rol: "admin_sgc" })).toHaveLength(19);
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

describe("Configuración documental", () => {
  const hrefs = (rol: Parameters<typeof entradasVisibles>[0]["rol"]) => entradasVisibles({ rol }).map((e) => e.href);
  it("solo admin_sgc la ve, justo después de Tipos de documento", () => {
    for (const rol of ["gerencia", "lider_proceso", "control_interno", "consulta"] as const) {
      expect(hrefs(rol)).not.toContain("/admin/configuracion-documental");
    }
    const admin = hrefs("admin_sgc");
    expect(admin.indexOf("/admin/configuracion-documental")).toBe(admin.indexOf("/admin/tipos") + 1);
  });
});

describe("Entidad y marca", () => {
  it("exige entidad.administrar: control interno no la ve", () => {
    expect(NAVEGACION.find((e) => e.href === "/admin/entidad")?.permiso).toBe("entidad.administrar");
    expect(entradasVisibles({ rol: "control_interno" }).map((e) => e.href)).not.toContain("/admin/entidad");
  });
});

describe("Distribución en Administración", () => {
  const hrefs = (rol: Parameters<typeof entradasVisibles>[0]["rol"]) => entradasVisibles({ rol }).map((e) => e.href);
  it("Puntos de uso y Listas de distribución: solo admin_sgc, después de Estructura", () => {
    for (const rol of ["gerencia", "lider_proceso", "control_interno", "consulta"] as const) {
      expect(hrefs(rol)).not.toContain("/admin/puntos-uso");
      expect(hrefs(rol)).not.toContain("/admin/listas-distribucion");
    }
    const admin = hrefs("admin_sgc");
    expect(admin.indexOf("/admin/puntos-uso")).toBe(admin.indexOf("/admin/estructura") + 1);
    expect(admin.indexOf("/admin/listas-distribucion")).toBe(admin.indexOf("/admin/estructura") + 2);
    for (const href of ["/admin/puntos-uso", "/admin/listas-distribucion"]) {
      expect(NAVEGACION.find((e) => e.href === href)).toMatchObject({ grupo: "administracion", permiso: "distribucion.gestionar" });
    }
  });
});

describe("Distribución", () => {
  const hrefs = (s: Parameters<typeof entradasVisibles>[0]) => entradasVisibles(s).map((e) => e.href);
  it("va justo después de Trámites; consulta la ve solo si responde por un punto", () => {
    expect(hrefs({ rol: "consulta" })).not.toContain("/distribucion");
    expect(hrefs({ rol: "consulta", responsableDePuntos: true })).toEqual(["/", "/buscar", "/distribucion"]);
    for (const rol of ["admin_sgc", "gerencia", "lider_proceso"] as const) {
      const lista = hrefs({ rol });
      expect(lista.indexOf("/distribucion")).toBe(lista.indexOf("/tramites") + 1);
    }
  });
  it("control interno la ve tras Buscar, porque no tiene Trámites", () => {
    const lista = hrefs({ rol: "control_interno" });
    expect(lista.indexOf("/distribucion")).toBe(lista.indexOf("/buscar") + 1);
  });
  it("se marca en sus subrutas", () => {
    const entrada = NAVEGACION.find((e) => e.href === "/distribucion")!;
    expect(entrada).toMatchObject({ etiqueta: "Distribución", icono: "distribucion", grupo: "documentos", permiso: "distribucion.ver" });
    expect(esActiva(entrada, "/distribucion/copias/7")).toBe(true);
    expect(esActiva(entrada, "/admin/puntos-uso")).toBe(false);
  });
});

describe("Vigencia", () => {
  const hrefs = (s: Parameters<typeof entradasVisibles>[0]) => entradasVisibles(s).map((e) => e.href);
  it("la ven Admin SGC, Gerencia, Control Interno y el líder; consulta solo si es responsable técnico", () => {
    for (const rol of ["admin_sgc", "gerencia", "control_interno", "lider_proceso"] as const) {
      expect(hrefs({ rol })).toContain("/vigencia");
    }
    expect(hrefs({ rol: "consulta" })).not.toContain("/vigencia");
    expect(hrefs({ rol: "consulta", responsableTecnico: true })).toEqual(["/", "/buscar", "/vigencia"]);
  });
  it("va justo después de Distribución, en Documentos, y se marca en sus pestañas", () => {
    for (const rol of ["admin_sgc", "gerencia", "control_interno", "lider_proceso"] as const) {
      const lista = hrefs({ rol });
      expect(lista.indexOf("/vigencia")).toBe(lista.indexOf("/distribucion") + 1);
    }
    const entrada = NAVEGACION.find((e) => e.href === "/vigencia")!;
    expect(entrada).toMatchObject({
      etiqueta: "Vigencia",
      icono: "vigencia",
      grupo: "documentos",
      algunPermiso: ["vigencia.ver", "documentos.indicadores"],
      siResponsableTecnico: true,
    });
    expect(esActiva(entrada, "/vigencia/semaforo")).toBe(true);
  });
});
