/**
 * Descripción legible de eventos de auditoría (Fase 8): función pura que
 * traduce (acción, entidad, detalle) a una frase en español, con fallback
 * seguro para acciones no mapeadas y sin volcar JSON crudo.
 */
import { describe, expect, it } from "vitest";
import { describirEvento, nombreDeAccion } from "@/lib/bitacora-detalle";

describe("nombreDeAccion", () => {
  it.each([
    ["tramite_aceptar", "Aceptó la solicitud"],
    ["tramite_guardar_lista", "Guardó la lista de verificación de la solicitud"],
    ["crear_documento", "Creó un documento"],
    ["acta_generada", "Generó un acta"],
    ["exporto_maestro", "Emitió el Listado Maestro"],
    ["editar_config_documental", "Editó la configuración documental"],
    ["crear_cargo", "Creó el cargo"],
    ["reordenar_area", "Reordenó el área"],
    ["crear_tipo_documento", "Creó el tipo de documento"],
    ["editar_periferico", "Editó el elemento periférico"],
    ["crear_constructor", "Creó el constructor"],
    ["accion_futura", "accion futura"],
    ["tramite_futura", "tramite futura"],
    ["constructor", "constructor"],
  ])("%s dice «%s»", (accion, frase) => {
    expect(nombreDeAccion(accion)).toBe(frase);
  });

  it("las dos devoluciones se distinguen en el filtro", () => {
    expect(nombreDeAccion("tramite_devolver_revision")).not.toBe(nombreDeAccion("tramite_devolver_aprobacion"));
  });
});

describe("describirEvento", () => {
  it("crear_documento usa código y título del detalle", () => {
    expect(describirEvento({
      accion: "crear_documento", entidad: "documento", entidadId: 5,
      detalle: { codigo: "GTH-PR-01", titulo: "Ingreso" },
    })).toBe("Creó el documento GTH-PR-01 — Ingreso");
  });

  it("publicar_version usa el código resuelto y el número", () => {
    expect(describirEvento({
      accion: "publicar_version", entidad: "documento_version", entidadId: 9,
      detalle: { documentoId: 5, numero: 2 }, codigoDocumento: "GTH-PR-01",
    })).toBe("Publicó la versión 2 de GTH-PR-01");
  });

  it("anular_documento describe la versión anulada", () => {
    expect(describirEvento({
      accion: "anular_documento", entidad: "documento", entidadId: 5,
      detalle: { versionAnulada: 3 }, codigoDocumento: "GTH-PR-01",
    })).toBe("Anuló GTH-PR-01 (versión vigente 3)");
  });

  it("editar_documento dice qué datos de catálogo cambiaron; una fila antigua, solo el código", () => {
    const evento = (detalle: Record<string, unknown>) =>
      describirEvento({ accion: "editar_documento", entidad: "documento", entidadId: 5, detalle, codigoDocumento: "GTH-PR-01" });
    expect(evento({ antes: { nivelAcceso: "general" }, despues: { nivelAcceso: "restringido", relacionados: [] } })).toBe(
      "Editó el documento GTH-PR-01: nivel de acceso, documentos relacionados",
    );
    expect(evento({ codigoAnterior: "GTH-PR-09", codigo: "GTH-PR-01", titulo: "Ingreso" })).toBe("Editó el documento GTH-PR-01");
  });

  it("editar_control dice qué datos de control se corrigieron", () => {
    expect(describirEvento({
      accion: "editar_control", entidad: "documento", entidadId: 5,
      detalle: { antes: { titulo: "Viejo" }, despues: { titulo: "Nuevo" } }, codigoDocumento: "GTH-PR-01",
    })).toBe("Corrigió los datos de control de GTH-PR-01: título");
  });

  it("deshacer_carga lleva la versión y el motivo", () => {
    expect(describirEvento({
      accion: "deshacer_carga", entidad: "documento", entidadId: 5,
      detalle: { numero: 4, motivo: "Se subió el archivo equivocado." }, codigoDocumento: "GTH-PR-01",
    })).toBe("Deshizo la carga de la versión 4 de GTH-PR-01: Se subió el archivo equivocado.");
  });

  it("descartar_borrador lleva la versión", () => {
    expect(describirEvento({
      accion: "descartar_borrador", entidad: "documento_version", entidadId: 9,
      detalle: { documentoId: 5, numero: 2 }, codigoDocumento: "GTH-PR-01",
    })).toBe("Descartó el borrador de la versión 2 de GTH-PR-01");
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

  it("las acciones del trámite llevan el número de solicitud y el código", () => {
    const evento = (accion: string, detalle: Record<string, unknown>) =>
      describirEvento({ accion, entidad: "tramite", entidadId: 3, detalle });
    expect(evento("tramite_solicitar", { numero: "SOL-2026-014", codigo: "GTH-PR-02" })).toBe("Registró la solicitud SOL-2026-014 sobre GTH-PR-02");
    expect(evento("tramite_dar_visto_bueno", { numero: "SOL-2026-014", codigo: "GTH-PR-02" })).toBe("Dio el visto bueno a la solicitud SOL-2026-014 sobre GTH-PR-02");
    expect(evento("tramite_negar_visto_bueno", { numero: "SOL-2026-014", codigo: null })).toBe("Negó el visto bueno a la solicitud SOL-2026-014");
    expect(evento("tramite_retirar", { numero: "SOL-2026-014" })).toBe("Retiró la solicitud SOL-2026-014");
    expect(evento("tramite_crear_observacion", { numero: "SOL-2026-014", codigo: "GTH-PR-02", observacion: 3 })).toBe("Escribió una observación en la solicitud SOL-2026-014 sobre GTH-PR-02 (observación 3)");
    expect(evento("tramite_guardar_lista", { numero: "SOL-2026-014", codigo: "GTH-PR-02", respondidos: 8 })).toBe("Guardó la lista de verificación de la solicitud SOL-2026-014 sobre GTH-PR-02");
    expect(evento("tramite_publicar", { numero: "SOL-2026-014", codigo: "GTH-PR-02" })).toBe("Publicó el resultado de la solicitud SOL-2026-014 sobre GTH-PR-02");
    expect(evento("tramite_cancelar", { numero: "SOL-2026-014", codigo: "GTH-PR-02" })).toBe("Canceló la solicitud SOL-2026-014 sobre GTH-PR-02");
    expect(evento("tramite_reasignar", { numero: "SOL-2026-014", codigo: "GTH-PR-02" })).toBe("Reasignó la solicitud SOL-2026-014 sobre GTH-PR-02");
    expect(evento("tramite_corregir_datos", { numero: "SOL-2026-014", codigo: "GTH-PR-02" })).toBe("Corrigió los datos del documento de la solicitud SOL-2026-014 sobre GTH-PR-02");
  });

  it("una acción de trámite que aún no se conoce sigue siendo inteligible", () => {
    expect(describirEvento({ accion: "tramite_nuevo", entidad: "tramite", entidadId: 3, detalle: { numero: "SOL-2026-014" } }))
      .toBe("Acción «tramite_nuevo» sobre la solicitud SOL-2026-014");
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

describe("configuración documental", () => {
  const e = (accion: string, detalle: Record<string, unknown>) =>
    describirEvento({ accion, entidad: "configuracion", entidadId: null, detalle, codigoDocumento: null });
  it("dice qué claves cambiaron y si la publicación directa quedó encendida o apagada", () => {
    expect(e("editar_config_documental", {
      cambios: { plazo_revision_dias: { antes: "5", despues: "7" }, publicacion_directa: { antes: "1", despues: "0" } },
    })).toBe("Editó la configuración documental: plazo de revisión, publicación directa (apagada)");
    expect(e("editar_config_documental", { cambios: { publicacion_directa: { antes: "0", despues: "1" } } }))
      .toBe("Editó la configuración documental: publicación directa (encendida)");
    expect(e("editar_config_documental", { cambios: {} })).toBe("Guardó la configuración documental sin cambios");
  });
  it("nombra el formato del acta y sus dos espacios", () => {
    expect(e("editar_config_documental", {
      cambios: {
        formato_acta_documento_id: { antes: "", despues: "31" },
        formato_acta_margen_superior_cm: { antes: "5.5", despues: "6" },
        formato_acta_margen_inferior_cm: { antes: "3.5", despues: "3" },
      },
    })).toBe("Editó la configuración documental: documento del formato del acta, espacio del encabezado del acta, espacio del pie del acta");
  });
  it("un acta generada", () => {
    expect(e("acta_generada", { tramiteId: 12, numero: "SOL-2026-014" })).toBe("Generó el acta del trámite SOL-2026-014");
  });
  it("un acta que no se pudo regenerar idéntica", () => {
    expect(e("acta_no_regenerable", { tramiteId: 12 })).toBe("No se pudo regenerar idéntica el acta del trámite 12: no se entregó");
  });
  it("un acta que no se pudo generar porque el archivo del formato falta o cambió", () => {
    expect(e("acta_no_regenerable", { tramiteId: 12, motivo: "formato", archivoId: 7 })).toBe("No se pudo generar el acta del trámite 12: el archivo del formato falta o cambió");
  });
  it("los ítems de la lista de verificación", () => {
    expect(e("crear_item_verificacion", { texto: "Cita la norma" })).toBe("Añadió un ítem a la lista de verificación: «Cita la norma»");
    expect(e("alternar_item_verificacion", { texto: "Cita la norma", activo: false })).toBe("Desactivó un ítem de la lista de verificación: «Cita la norma»");
    expect(e("mover_item_verificacion", { texto: "Cita la norma", direccion: "arriba" })).toBe("Movió un ítem de la lista de verificación hacia arriba: «Cita la norma»");
  });
});


describe("distribución de la 13B", () => {
  const e = (accion: string, detalle: Record<string, unknown>) =>
    describirEvento({ accion, entidad: "x", entidadId: 1, detalle });
  const copia = { codigo: "GTH-PR-02", version: 2, numero: 2, punto: "Urgencias" };

  it("las copias controladas", () => {
    expect(e("copia_emitida", copia)).toBe("Emitió la copia controlada N.º 02 de GTH-PR-02 v2 para Urgencias");
    expect(e("copia_reimpresa", { ...copia, motivo: "Se rompió" })).toBe("Reimprimió la copia controlada N.º 02 de GTH-PR-02 v2 de Urgencias: Se rompió");
    expect(e("copia_recibida", copia)).toBe("Confirmó el recibo de la copia controlada N.º 02 de GTH-PR-02 v2 en Urgencias");
    expect(e("copia_recogida", { ...copia, destino: "devuelta" })).toBe("Recogió la copia controlada N.º 02 de GTH-PR-02 v2 de Urgencias: devuelta al SGC");
    expect(e("copia_recogida", { ...copia, destino: "destruida" })).toContain("destruida");
    expect(e("copia_recogida", { ...copia, destino: "no_encontrada" })).toContain("no se encontró");
    expect(e("copia_anulada", { ...copia, motivo: "Error" })).toBe("Anuló la copia controlada N.º 02 de GTH-PR-02 v2 de Urgencias: Error");
  });
  it("sin datos no imprime undefined", () => {
    for (const a of ["copia_emitida", "copia_reimpresa", "copia_recibida", "copia_recogida", "copia_anulada", "acuse_lectura", "jornada_registrada", "jornada_anulada", "verificacion_abierta", "verificacion_cerrada", "verificacion_descartada", "hallazgo_cerrado", "crear_punto_uso", "editar_punto_uso", "activar_punto_uso", "crear_lista", "editar_lista", "desactivar_lista", "exporto_copias", "exporto_verificaciones", "exporto_acuses"]) {
      expect(e(a, {}), a).not.toMatch(/undefined|null|\[object/);
    }
  });
  it("los acuses", () => {
    expect(e("acuse_lectura", { codigo: "GTH-PR-02", version: 2, acuseId: 9 })).toBe("Confirmó la lectura de GTH-PR-02 v2");
  });
  it("las socializaciones", () => {
    expect(e("jornada_registrada", { versiones: [{ codigo: "GTH-PR-02", version: 2 }], asistentes: Array.from({ length: 18 }, (_, i) => i + 1) }))
      .toBe("Registró una socialización de GTH-PR-02 v2 con 18 asistentes");
    expect(e("jornada_registrada", { versiones: [{ codigo: "A-1", version: 1 }, { codigo: "B-2", version: 3 }], asistentes: [1] }))
      .toBe("Registró una socialización de A-1 v1 y B-2 v3 con 1 asistente");
    expect(e("jornada_anulada", { motivo: "Duplicada" })).toBe("Anuló una socialización: Duplicada");
  });
  it("las verificaciones y los hallazgos", () => {
    expect(e("verificacion_abierta", { punto: "Farmacia" })).toBe("Abrió la verificación de Farmacia");
    expect(e("verificacion_cerrada", { punto: "Farmacia", conforme: false, hallazgos: 2 })).toBe("Cerró la verificación de Farmacia: no conforme, 2 hallazgos");
    expect(e("verificacion_cerrada", { punto: "Farmacia", conforme: false, hallazgos: 1 })).toBe("Cerró la verificación de Farmacia: no conforme, 1 hallazgo");
    expect(e("verificacion_cerrada", { punto: "Farmacia", conforme: true, hallazgos: 0 })).toBe("Cerró la verificación de Farmacia: conforme");
    expect(e("verificacion_descartada", { punto: "Farmacia", motivo: "Por error" })).toBe("Descartó la verificación de Farmacia: Por error");
    expect(e("hallazgo_cerrado", { origen: "recogida", nota: "Se halló" })).toBe("Cerró un hallazgo de recogida: Se halló");
    expect(e("hallazgo_cerrado", { origen: "verificacion" })).toBe("Cerró un hallazgo de verificación");
  });
  it("los puntos de uso y las listas", () => {
    expect(e("crear_punto_uso", { nombre: "Farmacia" })).toBe("Creó el punto de uso «Farmacia»");
    expect(e("editar_punto_uso", { antes: { nombre: "A" }, despues: { nombre: "B", sede: "Norte" } })).toBe("Editó el punto de uso «B»: nombre, sede");
    expect(e("activar_punto_uso", {})).toBe("Activó un punto de uso");
    expect(e("desactivar_punto_uso", {})).toBe("Desactivó un punto de uso");
    expect(e("crear_lista", { nombre: "Médicos" })).toBe("Creó la lista de distribución «Médicos»");
    expect(e("editar_lista", { antes: { miembros: [] }, despues: { miembros: ["u:1"] } })).toBe("Editó una lista de distribución: miembros");
    expect(e("activar_lista", {})).toBe("Activó una lista de distribución");
    expect(e("desactivar_lista", {})).toBe("Desactivó una lista de distribución");
  });
  it("las exportaciones", () => {
    expect(e("exporto_copias", { formato: "excel", total: 4 })).toBe("Emitió el listado de copias controladas (excel, 4 filas)");
    expect(e("exporto_verificaciones", { formato: "excel", total: 3 })).toBe("Emitió el listado de verificaciones (excel, 3 filas)");
  });
  it("cada acción nueva tiene su nombre en el filtro", () => {
    for (const a of ["copia_emitida", "copia_reimpresa", "copia_recibida", "copia_recogida", "copia_anulada", "acuse_lectura", "jornada_registrada", "jornada_anulada", "verificacion_abierta", "verificacion_cerrada", "verificacion_descartada", "hallazgo_cerrado", "crear_punto_uso", "editar_punto_uso", "activar_punto_uso", "desactivar_punto_uso", "crear_lista", "editar_lista", "activar_lista", "desactivar_lista", "exporto_copias", "exporto_verificaciones"]) {
      expect(nombreDeAccion(a), a).not.toBe(a.replace(/_+/g, " "));
    }
    expect(nombreDeAccion("crear_punto_uso")).toBe("Creó un punto de uso");
  });
});

describe("frases con el detalle real", () => {
  const e = (accion: string, detalle: Record<string, unknown>) =>
    describirEvento({ accion, entidad: "x", entidadId: 1, detalle });
  it("exporto_acuses con lo que guarda la ruta", () => {
    expect(e("exporto_acuses", { formato: "excel", desde: "2026-10-01", hasta: "2026-10-31", procesoId: null, total: 5 }))
      .toBe("Emitió el cumplimiento de lectura (excel, 2026-10-01 a 2026-10-31)");
  });
  it("verificacion_abierta con el punto", () => {
    expect(e("verificacion_abierta", { puntoId: 3, punto: "Farmacia", items: 8, propioPunto: false })).toBe("Abrió la verificación de Farmacia");
  });
});
