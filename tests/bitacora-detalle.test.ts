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

describe("quitar_segundo_factor nombra al afectado cuando lo quita otra persona", () => {
  it("con usuario en el detalle", () => {
    expect(
      describirEvento({ accion: "quitar_segundo_factor", entidad: "usuario", entidadId: 1, detalle: { usuario: "gerente" } }),
    ).toBe("Quitó el segundo factor de «gerente»");
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

describe("describirEvento — marca de la entidad", () => {
  it("subir_logo", () => {
    expect(describirEvento({
      accion: "subir_logo", entidad: "configuracion", entidadId: null,
      detalle: { nombre: "logo.png", bytes: 10, mime: "image/png", ancho: 256, alto: 128 },
    })).toBe("Cambió el logo de la entidad («logo.png», 256 × 128)");
  });

  it("quitar_logo", () => {
    expect(describirEvento({ accion: "quitar_logo", entidad: "configuracion", entidadId: null, detalle: {} }))
      .toBe("Quitó el logo de la entidad");
  });
});

describe("describirEvento — editar_configuracion dice qué se editó", () => {
  const evento = (detalle: Record<string, unknown>) =>
    describirEvento({ accion: "editar_configuracion", entidad: "configuracion", entidadId: null, detalle });

  it("Entidad y marca: nombres legibles por clave, en el orden del detalle", () => {
    expect(evento({ claves: ["nombre_entidad", "sigla_entidad", "color_primario"] }))
      .toBe("Editó la entidad y la marca: nombre, sigla, color primario");
  });
  it("las seis claves que guarda la pantalla Entidad y marca", () => {
    expect(evento({
      claves: ["nombre_entidad", "sigla_entidad", "lema", "aviso_datos_personales", "color_primario", "color_secundario"],
    })).toBe("Editó la entidad y la marca: nombre, sigla, lema, aviso de datos personales, color primario, color secundario");
  });
  it("Textos del mapa y código de documentos", () => {
    expect(evento({ claves: ["subtitulo_mapa", "titulo_phva", "texto_phva", "patron_codigo"] }))
      .toBe("Editó los textos del mapa y el código de documentos: subtítulo del mapa, título del ciclo PHVA, texto del ciclo PHVA, patrón del código");
  });
  it("toda clave de la pantalla Textos del mapa tiene nombre legible", async () => {
    const { CLAVES_TEXTO } = await import("@/db/consultas/mapa-admin");
    expect(evento({ claves: CLAVES_TEXTO.map((c) => c.clave) })).toMatch(/^Editó los textos del mapa y el código de documentos: [^_]+$/);
  });
  it("una clave desconocida se nombra tal cual, sin guiones bajos", () => {
    expect(evento({ claves: ["lema", "zz_otra_clave"] })).toBe("Editó la configuración: lema, zz otra clave");
    expect(evento({ claves: ["constructor", "__proto__"] })).toBe("Editó la configuración: constructor, proto");
  });
  it("sin claves legibles: frase genérica, sin volcar el detalle", () => {
    expect(evento({})).toBe("Editó la configuración");
    expect(evento({ claves: [] })).toBe("Editó la configuración");
    expect(evento({ claves: "nombre_entidad" })).toBe("Editó la configuración");
    expect(evento({ claves: [7, null, { a: 1 }] })).toBe("Editó la configuración");
  });
});
