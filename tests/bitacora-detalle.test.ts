/**
 * Descripción legible de eventos de auditoría (Fase 8): función pura que
 * traduce (acción, entidad, detalle) a una frase en español, con fallback
 * seguro para acciones no mapeadas y sin volcar JSON crudo.
 */
import { describe, expect, it } from "vitest";
import { describirEvento } from "@/lib/bitacora-detalle";

describe("describirEvento", () => {
  it("crear_documento usa código y título del detalle", () => {
    expect(describirEvento({
      accion: "crear_documento", entidad: "documento", entidadId: 5,
      detalle: { codigo: "PR-GTH-001", titulo: "Ingreso" },
    })).toBe("Creó el documento PR-GTH-001 — Ingreso");
  });

  it("publicar_version usa el código resuelto y el número", () => {
    expect(describirEvento({
      accion: "publicar_version", entidad: "documento_version", entidadId: 9,
      detalle: { documentoId: 5, numero: 2 }, codigoDocumento: "PR-GTH-001",
    })).toBe("Publicó la versión 2 de PR-GTH-001");
  });

  it("anular_documento describe la versión anulada", () => {
    expect(describirEvento({
      accion: "anular_documento", entidad: "documento", entidadId: 5,
      detalle: { versionAnulada: 3 }, codigoDocumento: "PR-GTH-001",
    })).toBe("Anuló PR-GTH-001 (versión vigente 3)");
  });

  it("desactivar de mapa usa el nombre", () => {
    expect(describirEvento({
      accion: "desactivar_proceso", entidad: "procesos", entidadId: 7,
      detalle: { nombre: "Vigilancia Epidemiológica" },
    })).toBe("Desactivó el proceso «Vigilancia Epidemiológica»");
  });

  it("exporto_maestro describe formato y alcance", () => {
    expect(describirEvento({
      accion: "exporto_maestro", entidad: "listado_maestro", entidadId: null,
      detalle: { formato: "excel", incluir: "vigentes", total: 42 },
    })).toBe("Emitió el Listado Maestro (excel, vigentes)");
  });

  it("acción desconocida no rompe: fallback genérico", () => {
    const frase = describirEvento({
      accion: "algo_raro", entidad: "cosa", entidadId: 1, detalle: { x: 1 },
    });
    expect(frase).toContain("algo_raro");
    expect(typeof frase).toBe("string");
  });

  it.each([
    ["cambiar_clave", "Cambió su clave"],
    ["aceptar_aviso_datos", "Aceptó el aviso de tratamiento de datos personales"],
    ["activar_segundo_factor", "Activó el segundo factor"],
    ["quitar_segundo_factor", "Desactivó el segundo factor"],
  ])("%s se describe como «%s»", (accion, texto) => {
    expect(describirEvento({ accion, entidad: "usuario", entidadId: 1, detalle: {} })).toBe(texto);
  });
});

describe("acciones de administración de usuarios", () => {
  it.each([
    ["crear_usuario", "Creó el usuario «maria»"],
    ["editar_usuario", "Editó el usuario «maria»"],
    ["desactivar_usuario", "Desactivó el usuario «maria»"],
    ["reactivar_usuario", "Reactivó el usuario «maria»"],
    ["restablecer_clave", "Restableció la clave de «maria»"],
    ["desbloquear_usuario", "Desbloqueó al usuario «maria»"],
    ["cerrar_sesion_forzado", "Cerró la sesión de «maria»"],
  ])("%s se describe como «%s»", (accion, texto) => {
    expect(describirEvento({ accion, entidad: "usuario", entidadId: 1, detalle: { usuario: "maria" } })).toBe(texto);
  });
});
