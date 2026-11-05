import { describe, expect, it } from "vitest";
import type { Rol } from "@/lib/roles";
import { accionesDisponibles, evaluarTransicion, type ActorParaRegla, type TramiteParaRegla } from "@/lib/tramites/transiciones";
import { candidatosAprobador, candidatosRevisor, rolAprobador, validarDesignacion, type Persona } from "@/lib/tramites/separacion";

const base: TramiteParaRegla = { tipo: "modificar", etapa: "revision", solicitanteId: 1, elaboradorId: 2, revisorId: 3, aprobadorId: 4 };
const actor = (usuarioId: number, rol: Rol, lideraPropietario = false): ActorParaRegla => ({ usuarioId, rol, lideraPropietario });

describe("evaluarTransicion", () => {
  it.each([
    ["dar_visto_bueno",    { etapa: "visto_bueno" },                  actor(9, "lider_proceso", true), "aceptacion",  [],                    false],
    ["negar_visto_bueno",  { etapa: "visto_bueno" },                  actor(9, "lider_proceso", true), "rechazado",   [],                    false],
    ["retirar",            { etapa: "aceptacion" },                   actor(1, "lider_proceso"),       "cancelado",   [],                    false],
    ["aceptar",            { etapa: "aceptacion" },                   actor(8, "admin_sgc"),           "elaboracion", [],                    true],
    ["aceptar",            { etapa: "aceptacion", tipo: "eliminar" }, actor(8, "admin_sgc"),           "aprobacion",  [],                    false],
    ["rechazar",           { etapa: "aceptacion" },                   actor(8, "admin_sgc"),           "rechazado",   [],                    false],
    ["enviar_a_revision",  { etapa: "elaboracion" },                  actor(2, "consulta"),            "revision",    ["elaboro"],           false],
    ["devolver_revision",  { etapa: "revision" },                     actor(3, "admin_sgc"),           "elaboracion", [],                    true],
    ["concepto_favorable", { etapa: "revision" },                     actor(3, "lider_proceso"),       "aprobacion",  ["reviso"],            false],
    ["aprobar",            { etapa: "aprobacion" },                   actor(4, "gerencia"),            "publicacion", ["aprobo"],            false],
    ["devolver_aprobacion",{ etapa: "aprobacion" },                   actor(4, "gerencia"),            "elaboracion", [],                    true],
    ["negar_eliminacion",  { etapa: "aprobacion", tipo: "eliminar" }, actor(4, "gerencia"),            "rechazado",   [],                    false],
    ["publicar",           { etapa: "publicacion" },                  actor(8, "admin_sgc"),           "publicado",   ["publico"],           false],
    ["publicar",           { etapa: "publicacion", tipo: "eliminar" },actor(8, "admin_sgc"),           "eliminado",   ["publico"],           false],
    ["aprobar_y_publicar", { etapa: "aprobacion" },                   actor(4, "admin_sgc"),           "publicado",   ["aprobo", "publico"], false],
    ["aprobar_y_publicar", { etapa: "aprobacion", tipo: "eliminar" }, actor(4, "admin_sgc"),           "eliminado",   ["aprobo", "publico"], false],
    ["cancelar",           { etapa: "elaboracion" },                  actor(8, "admin_sgc"),           "cancelado",   [],                    false],
    ["reasignar",          { etapa: "revision" },                     actor(8, "admin_sgc"),           "revision",    [],                    false],
  ] as const)("%s permitido", (accion, cambios, quien, hacia, firmas, sumaRonda) => {
    expect(evaluarTransicion(accion, { ...base, ...cambios }, quien)).toEqual({ ok: true, hacia, firmas, sumaRonda });
  });

  it.each([
    ["dar_visto_bueno",     { etapa: "visto_bueno" },                  actor(9, "lider_proceso", false)], // lidera otro proceso
    ["dar_visto_bueno",     { etapa: "visto_bueno" },                  actor(8, "admin_sgc", true)],      // sin el permiso
    ["retirar",             { etapa: "elaboracion" },                  actor(1, "lider_proceso")],        // ya se aceptó
    ["retirar",             { etapa: "aceptacion" },                   actor(7, "lider_proceso")],        // no es el solicitante
    ["aceptar",             { etapa: "aceptacion" },                   actor(4, "gerencia")],
    ["enviar_a_revision",   { etapa: "elaboracion" },                  actor(3, "admin_sgc")],            // no es el elaborador
    ["enviar_a_revision",   { etapa: "revision" },                     actor(2, "consulta")],             // etapa equivocada
    ["concepto_favorable",  { etapa: "revision" },                     actor(8, "admin_sgc")],            // no es el revisor designado
    ["aprobar",             { etapa: "aprobacion" },                   actor(3, "admin_sgc")],            // no es el aprobador
    ["devolver_aprobacion", { etapa: "aprobacion", tipo: "eliminar" }, actor(4, "gerencia")],
    ["negar_eliminacion",   { etapa: "aprobacion" },                   actor(4, "gerencia")],
    ["aprobar_y_publicar",  { etapa: "aprobacion" },                   actor(4, "gerencia")],             // aprueba pero no gestiona
    ["publicar",            { etapa: "aprobacion" },                   actor(8, "admin_sgc")],
    ["cancelar",            { etapa: "publicado" },                    actor(8, "admin_sgc")],            // ya cerrado
    ["reasignar",           { etapa: "cancelado" },                    actor(8, "admin_sgc")],
  ] as const)("%s rechazado", (accion, cambios, quien) => {
    expect(evaluarTransicion(accion, { ...base, ...cambios }, quien).ok).toBe(false);
  });

  it("el motivo del rechazo sigue el orden etapa, permiso, persona", () => {
    const motivo = (a: Parameters<typeof evaluarTransicion>[0], c: Partial<TramiteParaRegla>, q: ActorParaRegla) => {
      const v = evaluarTransicion(a, { ...base, ...c }, q);
      return v.ok ? null : v.motivo;
    };
    expect(motivo("aceptar", { etapa: "revision" }, actor(4, "gerencia"))).toBe("Este trámite ya no está en esa etapa");
    expect(motivo("aceptar", { etapa: "aceptacion" }, actor(4, "gerencia"))).toBe("Sin permiso para esta acción");
    expect(motivo("concepto_favorable", { etapa: "revision" }, actor(8, "admin_sgc"))).toBe("No es la persona designada para este paso");
  });

  it("accionesDisponibles lista solo lo permitido", () => {
    expect(accionesDisponibles({ ...base, etapa: "revision" }, actor(3, "admin_sgc")).sort())
      .toEqual(["cancelar", "concepto_favorable", "devolver_revision", "reasignar"]);
    expect(accionesDisponibles({ ...base, etapa: "revision" }, actor(5, "consulta"))).toEqual([]);
  });
});

const p = (id: number, rol: Rol, activo = true): Persona => ({ id, rol, activo });

describe("separación de funciones", () => {
  it("rolAprobador sigue la autoridad y el origen", () => {
    expect(rolAprobador("estrategico", "lider_proceso")).toBe("gerencia");
    expect(rolAprobador("operativo", "lider_proceso")).toBe("admin_sgc");
    expect(rolAprobador("operativo", "consulta")).toBe("admin_sgc");
    expect(rolAprobador("operativo", "admin_sgc")).toBe("gerencia");   // lo que nace del Admin SGC lo aprueba Gerencia
  });

  it("validarDesignacion aplica S1, S2 y S3", () => {
    const d = { tipo: "modificar" as const, autoridad: "operativo" as const, solicitante: p(1, "lider_proceso"), elaborador: p(1, "lider_proceso"), revisor: p(3, "admin_sgc"), aprobador: p(3, "admin_sgc") };
    expect(validarDesignacion(d)).toBeNull();                                            // revisor y aprobador pueden coincidir
    expect(validarDesignacion({ ...d, revisor: p(1, "lider_proceso") })).toBe("Quien elabora no puede revisar");
    expect(validarDesignacion({ ...d, revisor: p(5, "consulta") })).toMatch(/Administrador del SGC o Líder/);
    expect(validarDesignacion({ ...d, elaborador: p(3, "admin_sgc"), revisor: p(6, "lider_proceso"), aprobador: p(7, "admin_sgc") })).toBe("Quien aprueba debe tener el rol Gerencia");
    expect(validarDesignacion({ ...d, aprobador: p(4, "gerencia") })).toBe("Quien aprueba debe ser Administrador del SGC");
    expect(validarDesignacion({ ...d, aprobador: p(3, "admin_sgc", false) })).toBe("El usuario designado no está activo");
    const baja = { tipo: "eliminar" as const, autoridad: "operativo" as const, solicitante: p(1, "lider_proceso"), elaborador: null, revisor: null, aprobador: p(3, "admin_sgc") };
    expect(validarDesignacion(baja)).toBeNull();
    expect(validarDesignacion({ ...baja, solicitante: p(3, "admin_sgc"), aprobador: p(8, "admin_sgc") })).toBe("Quien aprueba debe tener el rol Gerencia");
    expect(validarDesignacion({ ...baja, autoridad: "estrategico", solicitante: p(4, "gerencia"), aprobador: p(4, "gerencia") })).toBe("Quien pide la eliminación no puede aprobarla");
  });

  it("exige elaborador y revisor en crear y modificar, pero no en eliminar", () => {
    const d = { tipo: "crear" as const, autoridad: "operativo" as const, solicitante: p(1, "lider_proceso"), elaborador: p(1, "lider_proceso"), revisor: p(3, "admin_sgc"), aprobador: p(3, "admin_sgc") };
    expect(validarDesignacion({ ...d, elaborador: null })).toBe("Falta designar quién elabora");
    expect(validarDesignacion({ ...d, revisor: null })).toBe("Falta designar quién revisa");
  });

  it("solo exige estar activo a los designados que aplican", () => {
    const d = { tipo: "modificar" as const, autoridad: "operativo" as const, solicitante: p(1, "lider_proceso", false), elaborador: p(2, "lider_proceso"), revisor: p(3, "admin_sgc"), aprobador: p(3, "admin_sgc") };
    expect(validarDesignacion(d)).toBeNull();                                            // quien pidió ya no está: el trámite sigue
    expect(validarDesignacion({ ...d, elaborador: p(2, "lider_proceso", false) })).toBe("El usuario designado no está activo");
    expect(validarDesignacion({ ...d, revisor: p(5, "lider_proceso", false) })).toBe("El usuario designado no está activo");
    const baja = { tipo: "eliminar" as const, autoridad: "operativo" as const, solicitante: p(1, "lider_proceso", false), elaborador: p(2, "lider_proceso", false), revisor: p(5, "lider_proceso", false), aprobador: p(3, "admin_sgc") };
    expect(validarDesignacion(baja)).toBeNull();                                         // en eliminar solo cuenta el aprobador
    expect(validarDesignacion({ ...baja, aprobador: p(3, "admin_sgc", false) })).toBe("El usuario designado no está activo");
  });

  it("los candidatos que ofrece la pantalla son los que validarDesignacion acepta", () => {
    const usuarios = [p(1, "admin_sgc"), p(2, "admin_sgc"), p(3, "lider_proceso"), p(4, "gerencia"), p(5, "consulta"), p(6, "control_interno")];
    const ids = (lista: readonly { id: number }[]) => lista.map((u) => u.id);
    expect(ids(candidatosRevisor(usuarios, null))).toEqual([1, 2, 3]);
    expect(ids(candidatosRevisor(usuarios, 3))).toEqual([1, 2]);                         // S2
    expect(ids(candidatosAprobador(usuarios, "admin_sgc", null))).toEqual([1, 2]);
    expect(ids(candidatosAprobador(usuarios, "admin_sgc", 2))).toEqual([1]);             // S1 y S3
    expect(ids(candidatosAprobador(usuarios, "gerencia", 4))).toEqual([]);
  });

  it("quien elabora no puede aprobar", () => {
    const d = { tipo: "modificar" as const, autoridad: "estrategico" as const, solicitante: p(4, "gerencia"), elaborador: p(4, "gerencia"), revisor: p(3, "admin_sgc"), aprobador: p(4, "gerencia") };
    expect(validarDesignacion(d)).toBe("Quien elabora no puede aprobar");
  });
});
