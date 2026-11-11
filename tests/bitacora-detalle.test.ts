/**
 * Descripción legible de eventos de auditoría (Fase 8): función pura que
 * traduce (acción, entidad, detalle) a una frase en español, con fallback
 * seguro para acciones no mapeadas y sin volcar JSON crudo.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
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

/**
 * Las acciones con nombre literal que el código pasa a `registrarAuditoria` (resolución 2 de la Tarea 14 de la 13C):
 * dentro de cada llamada, los literales de la expresión de `accion` (también los dos lados de un ternario). Las que se
 * arman con una plantilla o llegan en una variable no se pueden leer así: van en `ACCIONES_ARMADAS`.
 */
function accionesLiterales(): string[] {
  const raiz = path.resolve(import.meta.dirname, "../src");
  const archivos: string[] = [];
  const recorrer = (carpeta: string) => {
    for (const nombre of readdirSync(carpeta)) {
      const ruta = path.join(carpeta, nombre);
      if (statSync(ruta).isDirectory()) recorrer(ruta);
      else if (/\.tsx?$/.test(nombre)) archivos.push(ruta);
    }
  };
  recorrer(raiz);
  const acciones = new Set<string>();
  for (const archivo of archivos) {
    const texto = readFileSync(archivo, "utf8");
    for (const llamada of texto.split("registrarAuditoria(").slice(1)) {
      const cuerpo = llamada.slice(0, Math.max(llamada.indexOf("});"), 0) || 800);
      const expresion = /\baccion\s*:\s*([^,\n]+)/.exec(cuerpo)?.[1] ?? "";
      if (expresion.trimStart().startsWith("`")) continue;
      for (const [, accion] of expresion.matchAll(/"([a-z_]+)"/g)) acciones.add(accion);
    }
  }
  return [...acciones].sort();
}

/** Las que se arman con una plantilla o una variable, con dónde se arman. */
const ACCIONES_ARMADAS = [
  // normograma/relaciones.ts: `auditarEnLasDos` las recibe como parámetro.
  "norma_relacion",
  "norma_relacion_eliminada",
  // normograma/tipos-norma.ts: `auditar(tx, sesion, accion, …)`.
  "tipo_norma_creado",
  "tipo_norma_editado",
  "tipo_norma_movido",
  "tipo_norma_alternado",
  // vigencia/comun.ts: `rechazo.accion`, de ratificaciones.ts y externos/adopcion.ts.
  "ratificacion_rechazada",
  "adopcion_rechazada",
  // codigos.ts: ACCION_EDITAR_CONTROL.
  "editar_control",
  // config-documental.ts: `auditarItem(tx, accion, …)`.
  "crear_item_verificacion",
  "editar_item_verificacion",
  "mover_item_verificacion",
  "alternar_item_verificacion",
  // `${activo ? "activar" : "desactivar"}_…`: distribucion/listas.ts, distribucion/puntos-uso.ts, estructura.ts.
  "activar_lista",
  "desactivar_lista",
  "activar_punto_uso",
  "desactivar_punto_uso",
  "activar_area",
  "desactivar_area",
  "activar_cargo",
  "desactivar_cargo",
];

describe("toda acción que el código escribe tiene frase y nombre de filtro (13C, resoluciones 2 y 14)", () => {
  const literales = accionesLiterales();

  it("el recorrido encuentra las acciones literales, también las de un ternario", () => {
    expect(literales).toEqual(
      expect.arrayContaining(["documento_ratificado", "exporto_indicadores", "norma_asociada", "norma_requisito_editado", "norma_estado", "norma_retirada", "hallazgo_validado", "publicar_version"]),
    );
    expect(literales).not.toContain("activar");
  });

  it.each([...new Set([...literales, ...ACCIONES_ARMADAS])])("%s", (accion) => {
    const frase = describirEvento({ accion, entidad: "x", entidadId: 1, detalle: {} });
    expect(frase).not.toMatch(/^Acción «/);
    expect(frase).not.toMatch(/undefined|null|NaN|\[object/);
    expect(nombreDeAccion(accion)).not.toBe(accion.replace(/_+/g, " "));
  });
});

describe("frases de la vigencia (13C)", () => {
  const e = (accion: string, detalle: Record<string, unknown>, codigoDocumento: string | null = null) =>
    describirEvento({ accion, entidad: "documento", entidadId: 5, detalle, codigoDocumento });

  it("ratificar, y el rechazo por la huella", () => {
    expect(e("documento_ratificado", { codigo: "GTH-PR-01", version: 1, nota: null, proximaRevision: "2027-11-08" })).toBe("Ratificó sin cambios GTH-PR-01 v1");
    // El código resuelto por la entidad manda sobre el del detalle (pudo cambiar después).
    expect(e("documento_ratificado", { codigo: "GTH-PR-09", version: 2 }, "GTH-PR-01")).toBe("Ratificó sin cambios GTH-PR-01 v2");
    const huellas = { huellaRegistrada: "a".repeat(64), huellaEnDisco: "b".repeat(64) };
    expect(e("ratificacion_rechazada", { codigo: "GTH-PR-01", ...huellas })).toBe(
      "No se pudo ratificar GTH-PR-01: el archivo en disco no coincide con el registrado",
    );
    expect(e("adopcion_rechazada", { codigo: "CEX-DE-01", numero: 3, ...huellas })).toBe(
      "No se pudo adoptar CEX-DE-01 v3: el archivo en disco no coincide con el registrado",
    );
  });

  it("la fecha fijada a mano y el plazo propio", () => {
    expect(e("fecha_revision_fijada", { codigo: "GTH-PR-01", fecha: "2027-03-01", nota: "Carga inicial" })).toBe(
      "Fijó la próxima revisión de GTH-PR-01 para el 1 mar 2027: Carga inicial",
    );
    expect(e("fecha_revision_quitada", { codigo: "GTH-PR-01", fecha: "2027-03-01", nota: "Carga inicial" })).toBe(
      "Quitó la fecha fijada de la próxima revisión de GTH-PR-01 (1 mar 2027)",
    );
    expect(e("plazo_revision_ajustado", { codigo: "GTH-PR-01", antes: null, despues: 24 })).toBe("Ajustó el plazo de revisión de GTH-PR-01 a 24 meses (antes, el del tipo)");
    expect(e("plazo_revision_ajustado", { codigo: "GTH-PR-01", antes: 12, despues: 1 })).toBe("Ajustó el plazo de revisión de GTH-PR-01 a 1 mes (antes, 12 meses)");
    expect(e("plazo_revision_ajustado", { codigo: "GTH-PR-01", antes: 24, despues: null })).toBe("Devolvió el plazo de revisión de GTH-PR-01 al del tipo (antes, 24 meses)");
  });

  it("los documentos externos", () => {
    expect(e("externo_registrado", {
      codigo: "CEX-DE-01", titulo: "Guía de práctica clínica HTA", entidadEmisora: "Ministerio de Salud", edicion: "2017", responsable: "Luz Dary Ortiz", norma: null,
    })).toBe("Registró el documento externo CEX-DE-01 — Guía de práctica clínica HTA (edición 2017)");
    expect(e("externo_editado", { codigo: "CEX-DE-01", antes: { responsable: "A", verificacionMeses: 12 }, despues: { responsable: "B", verificacionMeses: 6 } })).toBe(
      "Editó los datos de control del externo CEX-DE-01: responsable técnico, periodicidad de verificación",
    );
    expect(e("externo_edicion_abierta", { codigo: "CEX-DE-01", numero: 2, edicion: "2021" })).toBe("Abrió en borrador la edición 2021 de CEX-DE-01");
    expect(e("externo_edicion_editada", { codigo: "CEX-DE-01", numero: 2, edicion: "2021", fechaEdicion: "2021-05-01", resumenCambios: "Nueva tabla" })).toBe(
      "Editó la edición 2021 en borrador de CEX-DE-01",
    );
    expect(e("externo_edicion_descartada", { codigo: "CEX-DE-01", numero: 2, edicion: null })).toBe("Descartó la edición en borrador de CEX-DE-01");
    expect(e("externo_adoptado", { codigo: "CEX-DE-01", numero: 2, edicion: "2021", obsoletas: 1, acuses: 3, verificacionId: 7 })).toBe("Adoptó la edición 2021 de CEX-DE-01");
    const verificado = (resultado: string) => e("externo_verificado", { codigo: "CEX-DE-01", version: 1, verificacionId: 4, resultado, fuente: "Portal", nota: null });
    expect(verificado("vigente")).toBe("Verificó la vigencia de CEX-DE-01: sigue vigente");
    expect(verificado("edicion_nueva")).toBe("Verificó la vigencia de CEX-DE-01: hay una edición nueva");
    expect(verificado("retirado")).toBe("Verificó la vigencia de CEX-DE-01: fue retirado o derogado");
    expect(e("externo_retirado", { codigo: "CEX-DE-01", version: 1, motivo: "Derogada por la Resolución 3100", verificacionId: null, borradorDescartado: null })).toBe(
      "Retiró el documento externo CEX-DE-01: Derogada por la Resolución 3100",
    );
  });

  it("la revisión anual", () => {
    const r = (accion: string, detalle: Record<string, unknown>) => describirEvento({ accion, entidad: "revision_anual", entidadId: 4, detalle });
    expect(r("revision_anual_abierta", { anio: 2026, plazoDias: 60, ventanaMeses: 6, documentos: 48, procesos: 9, recientes: 5, enTramite: 2 })).toBe(
      "Abrió la revisión anual 2026 con 48 documentos de 9 procesos",
    );
    expect(r("revision_anual_abierta", { anio: 2026, documentos: 1, procesos: 1 })).toBe("Abrió la revisión anual 2026 con 1 documento de 1 proceso");
    expect(r("revision_anual_prorrogada", { anio: 2026, dias: 15, motivo: "Auditoría externa", venceAntes: "x", venceDespues: "y" })).toBe(
      "Prorrogó 15 días la revisión anual 2026: Auditoría externa",
    );
    const decision = (antes: unknown, despues: unknown, extra: Record<string, unknown> = {}) =>
      r("revision_anual_decision", { anio: 2026, documentoId: 5, codigo: "GTH-PR-01", versionId: 9, antes, despues, ...extra });
    expect(decision(null, { decision: "ratificar", usuarioId: 3 })).toBe("En la revisión anual 2026, GTH-PR-01 quedó «Ratificado»");
    expect(decision({ decision: "actualizar" }, { decision: "ratificar" })).toBe("En la revisión anual 2026, GTH-PR-01 quedó «Ratificado» (antes «Por actualizar»)");
    expect(decision(null, { decision: "reciente", usuarioId: null })).toBe("En la revisión anual 2026, GTH-PR-01 quedó «Revisado recientemente»");
    // Una carga deshecha saca al documento de la foto: `despues` nulo y el motivo.
    expect(decision(null, null, { motivo: "Se deshizo su carga" })).toBe("GTH-PR-01 salió de la revisión anual 2026: Se deshizo su carga");
    const normograma = (resultado: string, nota: string | null) =>
      r("revision_anual_normograma", { anio: 2026, procesoId: 3, proceso: "Gestión del Talento Humano", resultado, nota, antes: null });
    expect(normograma("sin_novedad", null)).toBe("Confirmó el normograma de Gestión del Talento Humano en la revisión anual 2026: sin novedad");
    expect(normograma("cambios", "Falta la Resolución 100")).toBe(
      "Confirmó el normograma de Gestión del Talento Humano en la revisión anual 2026: marcó cambios: Falta la Resolución 100",
    );
    expect(r("revision_anual_cerrada", { anio: 2026, totales: {}, documentos: 48, sinRevisar: 3, metodo: "clave" })).toBe(
      "Cerró la revisión anual 2026 con 48 documentos; 3 quedaron sin revisar",
    );
    expect(r("revision_anual_cerrada", { anio: 2026, documentos: 48, sinRevisar: 1 })).toBe("Cerró la revisión anual 2026 con 48 documentos; 1 quedó sin revisar");
    expect(r("revision_anual_cerrada", { anio: 2026, documentos: 48, sinRevisar: 0 })).toBe("Cerró la revisión anual 2026 con 48 documentos");
  });

  it("el informe de la revisión anual, como el acta", () => {
    const i = (accion: string, detalle: Record<string, unknown>) => describirEvento({ accion, entidad: "archivos", entidadId: 8, detalle });
    expect(i("informe_generado", { revisionId: 4, anio: 2026, huella: "a".repeat(64) })).toBe("Generó el informe de la revisión anual 2026");
    expect(i("informe_no_regenerable", { revisionId: 4, anio: 2026, motivo: "formato", archivoId: 7 })).toBe(
      "No se pudo generar el informe de la revisión anual 2026: el archivo del formato falta o cambió",
    );
    expect(i("informe_no_regenerable", { revisionId: 4, anio: 2026, huellaRegistrada: "a", huellaRegenerada: "b" })).toBe(
      "No se pudo regenerar idéntico el informe de la revisión anual 2026: no se entregó",
    );
  });
});

describe("frases del normograma (13C)", () => {
  const n = (accion: string, detalle: Record<string, unknown>) => describirEvento({ accion, entidad: "norma", entidadId: 2, detalle });
  const norma = "Resolución 3100 de 2019";

  it("alta, edición, estado, retiro y borrado", () => {
    expect(n("norma_creada", { nombre: norma, tipo: "Resolución", numero: "3100", anio: 2019, titulo: "Habilitación de servicios" })).toBe(
      "Registró la norma Resolución 3100 de 2019 — Habilitación de servicios",
    );
    const datos = { tipoNormaId: 3, tipo: "Resolución", numero: "3100", anio: 2019, fechaExpedicion: "2019-11-25", entidadEmisora: "MinSalud", titulo: "A", tema: null, enlaceOficial: null, notas: null };
    expect(n("norma_editada", { nombre: norma, antes: datos, despues: { ...datos, titulo: "B", tema: "Habilitación" } })).toBe("Editó la norma Resolución 3100 de 2019: título, tema");
    expect(n("norma_editada", { nombre: norma, antes: datos, despues: { ...datos, tipoNormaId: 4, tipo: "Decreto" } })).toBe("Editó la norma Resolución 3100 de 2019: tipo");
    expect(n("norma_estado", { nombre: "Resolución 2003 de 2014", estadoAnterior: "vigente", estadoNuevo: "derogada", fecha: "2019-11-25", nota: null, cambioId: 1, relacionId: null, impactos: 2 })).toBe(
      "Pasó Resolución 2003 de 2014 a derogada",
    );
    expect(n("norma_retirada", { nombre: "Resolución 2003 de 2014", estadoAnterior: "vigente", estadoNuevo: "retirada", motivo: "Registrada por error" })).toBe(
      "Retiró la norma Resolución 2003 de 2014: Registrada por error",
    );
    expect(n("norma_borrada", { nombre: norma, titulo: "Habilitación" })).toBe("Borró la norma Resolución 3100 de 2019");
  });

  it("las relaciones entre normas", () => {
    const relacion = { relacionId: 5, tipo: "deroga", normaId: 1, norma, afectadaId: 2, afectada: "Resolución 2003 de 2014", detalle: null, cambioId: 9 };
    expect(n("norma_relacion", { ...relacion, impactos: 2 })).toBe("Registró que Resolución 3100 de 2019 deroga a Resolución 2003 de 2014");
    expect(n("norma_relacion", { ...relacion, tipo: "reglamenta" })).toBe("Registró que Resolución 3100 de 2019 reglamenta a Resolución 2003 de 2014");
    expect(n("norma_relacion_eliminada", { ...relacion, tipo: "modifica", motivo: "Registrada por error" })).toBe(
      "Eliminó la relación «Resolución 3100 de 2019 modifica a Resolución 2003 de 2014»: Registrada por error",
    );
  });

  it("los procesos y los documentos de una norma", () => {
    const proceso = { nombre: norma, procesoId: 3, proceso: "Gestión del Talento Humano" };
    expect(n("norma_asociada", { ...proceso, requisito: "Talento humano" })).toBe("Asoció la norma Resolución 3100 de 2019 al proceso Gestión del Talento Humano");
    expect(n("norma_requisito_editado", { ...proceso, antes: null, despues: "Talento humano" })).toBe(
      "Editó el requisito de Resolución 3100 de 2019 en el proceso Gestión del Talento Humano",
    );
    expect(n("norma_desasociada", { ...proceso, requisito: null })).toBe("Quitó la norma Resolución 3100 de 2019 del proceso Gestión del Talento Humano");
    expect(n("norma_documento_enlazado", { nombre: norma, documentoId: 5, codigo: "GTH-PR-01" })).toBe("Enlazó GTH-PR-01 a la norma Resolución 3100 de 2019");
    expect(n("norma_documento_desenlazado", { nombre: norma, documentoId: 5, codigo: "GTH-PR-01" })).toBe(
      "Quitó el enlace de GTH-PR-01 con la norma Resolución 3100 de 2019",
    );
  });

  it("los tipos de norma", () => {
    const t = (accion: string, detalle: Record<string, unknown>) => describirEvento({ accion, entidad: "tipos_norma", entidadId: 10, detalle });
    expect(t("tipo_norma_creado", { nombre: "Ordenanza" })).toBe("Creó el tipo de norma «Ordenanza»");
    expect(t("tipo_norma_editado", { antes: "Ordenanza", despues: "Ordenanza departamental" })).toBe("Renombró el tipo de norma «Ordenanza» a «Ordenanza departamental»");
    expect(t("tipo_norma_movido", { nombre: "Ordenanza", direccion: "arriba" })).toBe("Movió el tipo de norma «Ordenanza» hacia arriba");
    expect(t("tipo_norma_alternado", { nombre: "Ordenanza", activo: false })).toBe("Desactivó el tipo de norma «Ordenanza»");
    expect(t("tipo_norma_alternado", { nombre: "Ordenanza", activo: true })).toBe("Activó el tipo de norma «Ordenanza»");
  });

  it("el impacto resuelto, en el documento o en el proceso", () => {
    const impacto = (resolucion: string, extra: Record<string, unknown> = {}) =>
      describirEvento({
        accion: "impacto_resuelto",
        entidad: "documento",
        entidadId: 5,
        codigoDocumento: "GTH-PR-01",
        detalle: { impactoId: 1, cambioId: 9, normaId: 2, norma: "Resolución 2003 de 2014", estadoNuevo: "derogada", codigo: "GTH-PR-01", proceso: "Gestión del Talento Humano", resolucion, nota: "No la cita", tramite: null, verificacionId: null, ...extra },
      });
    expect(impacto("no_afecta")).toBe("Resolvió el impacto de Resolución 2003 de 2014 en GTH-PR-01: no afecta");
    expect(impacto("solicitud", { tramite: "SOL-2026-014" })).toBe("Resolvió el impacto de Resolución 2003 de 2014 en GTH-PR-01: con la solicitud SOL-2026-014");
    expect(impacto("verificacion", { verificacionId: 4 })).toBe("Resolvió el impacto de Resolución 2003 de 2014 en GTH-PR-01: con la verificación del externo");
    expect(
      describirEvento({
        accion: "impacto_resuelto",
        entidad: "proceso",
        entidadId: 3,
        detalle: { norma: "Resolución 2003 de 2014", codigo: null, proceso: "Gestión del Talento Humano", resolucion: "solicitud", tramite: "SOL-2026-015" },
      }),
    ).toBe("Resolvió el impacto de Resolución 2003 de 2014 en el proceso Gestión del Talento Humano: con la solicitud SOL-2026-015");
  });
});

describe("las exportaciones de la 13C, como «Emitió el Listado Maestro»", () => {
  const x = (accion: string, detalle: Record<string, unknown>) => describirEvento({ accion, entidad: "documentos", entidadId: null, detalle });

  it("con el formato, el filtro y las filas; un proceso no se nombra por su id", () => {
    expect(x("exporto_semaforo", { formato: "excel", estado: "vencida", procesoId: 3, origen: "interno", total: 12 })).toBe(
      "Emitió el semáforo de vigencia (excel, vencidos, de un proceso, internos, 12 filas)",
    );
    expect(x("exporto_semaforo", { formato: "excel", estado: "todos", procesoId: null, origen: "todos", total: 1 })).toBe("Emitió el semáforo de vigencia (excel, 1 fila)");
    expect(x("exporto_externos", { formato: "excel", estado: "atencion", procesoId: null, responsableId: 31, texto: "bomba", total: 2 })).toBe(
      "Emitió el listado de documentos externos (excel, en atención, de un responsable, con el texto «bomba», 2 filas)",
    );
    // El detalle completo que escribe `normograma/excel/route.ts`, sin filtros y con todos.
    const sinFiltros = { formato: "excel", alcance: "Institucional", procesoId: null, tipoNormaId: null, anio: null, emisor: null, estado: "todas", texto: null, incluirRetiradas: false, total: 30 };
    expect(x("exporto_normograma", sinFiltros)).toBe("Emitió el normograma (excel, institucional, 30 filas)");
    expect(x("exporto_normograma", { ...sinFiltros, alcance: "Proceso: Gestión del Talento Humano", procesoId: 3, total: 4 })).toBe(
      "Emitió el normograma (excel, del proceso Gestión del Talento Humano, 4 filas)",
    );
    // Los mismos filtros que nombra el de los externos: el estado, el tipo (por su id, sin nombrarlo), el año, el emisor,
    // el texto y las retiradas.
    expect(x("exporto_normograma", { ...sinFiltros, tipoNormaId: 3, anio: 2019, emisor: "Ministerio de Salud", estado: "derogada", texto: "habilitación", incluirRetiradas: true, total: 2 })).toBe(
      "Emitió el normograma (excel, institucional, derogadas, de un tipo de norma, del año 2019, emitidas por Ministerio de Salud, con el texto «habilitación», con las retiradas, 2 filas)",
    );
    expect(x("exporto_indicadores", { formato: "excel", periodo: "2026-T3", procesoId: null })).toBe("Emitió los indicadores documentales (excel, tercer trimestre de 2026)");
    expect(x("exporto_indicadores", { formato: "excel", periodo: "2026-10", procesoId: 3 })).toBe("Emitió los indicadores documentales (excel, octubre de 2026, de un proceso)");
    expect(x("exporto_socializaciones", { formato: "excel", desde: "2026-01-01", hasta: "2026-12-31", procesoId: null, total: 5 })).toBe(
      "Emitió el listado de socializaciones (excel, 2026-01-01 a 2026-12-31, 5 filas)",
    );
    expect(x("exporto_socializaciones", { formato: "excel", desde: "2026-01-01", hasta: "2026-12-31", procesoId: 3, total: 2 })).toBe(
      "Emitió el listado de socializaciones (excel, 2026-01-01 a 2026-12-31, de un proceso, 2 filas)",
    );
  });
});

describe("la herencia de la 13B: hallazgos en dos pasos y la verificación que los valida", () => {
  const h = (accion: string, detalle: Record<string, unknown>) => describirEvento({ accion, entidad: "hallazgo", entidadId: 6, detalle });
  const base = { puntoId: 2, punto: "Farmacia", origen: "verificacion", verificacionId: 3, documento: "GTH-PR-01", copiaId: null, copia: null, descripcion: "Copia obsoleta" };

  it("corregir, validar y reabrir", () => {
    expect(h("hallazgo_corregido", { ...base, nota: "Se retiró la copia", reaperturas: 0 })).toBe("Marcó corregido el hallazgo de verificación en Farmacia: Se retiró la copia");
    expect(h("hallazgo_validado", { ...base, validacion: "admin", verificacionQueValida: null, nota: "Se retiró la copia", corregidoPor: 9 })).toBe(
      "Validó la corrección del hallazgo de verificación en Farmacia y lo cerró",
    );
    expect(h("hallazgo_validado", { ...base, origen: "recogida", validacion: "verificacion", verificacionQueValida: 8, nota: "x", corregidoPor: 9 })).toBe(
      "Validó con la verificación del punto la corrección del hallazgo de recogida en Farmacia y lo cerró",
    );
    expect(h("hallazgo_reabierto", { ...base, reabiertoPor: "admin", verificacionQueReabre: null, nota: "La copia sigue ahí", notaCorreccion: "x", reaperturas: 1, venceEn: "2026-11-20T04:59:59.999Z" })).toBe(
      "Reabrió el hallazgo de verificación en Farmacia: La copia sigue ahí",
    );
    expect(h("hallazgo_reabierto", { ...base, reabiertoPor: "verificacion", verificacionQueReabre: 8, nota: "Sigue igual", reaperturas: 2 })).toBe(
      "Reabrió con la verificación del punto el hallazgo de verificación en Farmacia: Sigue igual",
    );
  });

  it("cerrar directamente, y el único Administrador del SGC activo que cierra su propia corrección", () => {
    const cerrado = { ...base, estadoPrevio: "abierto", validacion: "admin", propioCorrector: false, nota: "Se repuso" };
    expect(h("hallazgo_cerrado", cerrado)).toBe("Cerró directamente el hallazgo de verificación en Farmacia: Se repuso");
    expect(h("hallazgo_cerrado", { ...cerrado, estadoPrevio: "por_validar", propioCorrector: true })).toBe(
      "Cerró directamente el hallazgo de verificación en Farmacia (único Administrador del SGC activo): Se repuso",
    );
    expect(h("hallazgo_cerrado", { ...cerrado, propioPunto: true })).toBe(
      "Cerró directamente el hallazgo de verificación en Farmacia (de su propio punto; único Administrador del SGC activo): Se repuso",
    );
    // Una fila anterior a la Tarea 13 conserva su frase.
    expect(h("hallazgo_cerrado", { origen: "recogida", nota: "Se halló" })).toBe("Cerró un hallazgo de recogida: Se halló");
  });

  it("la verificación cerrada dice las correcciones que validó y los hallazgos que reabrió", () => {
    const v = (extra: Record<string, unknown>) => describirEvento({ accion: "verificacion_cerrada", entidad: "verificacion", entidadId: 8, detalle: { punto: "Farmacia", ...extra } });
    expect(v({ conforme: false, hallazgos: 1, hallazgosValidados: 2, hallazgosReabiertos: 1 })).toBe(
      "Cerró la verificación de Farmacia: no conforme, 1 hallazgo; validó 2 correcciones y reabrió 1 hallazgo",
    );
    expect(v({ conforme: true, hallazgos: 0, hallazgosValidados: 1, hallazgosReabiertos: 0 })).toBe("Cerró la verificación de Farmacia: conforme; validó 1 corrección");
    expect(v({ conforme: false, hallazgos: 2, hallazgosValidados: 0, hallazgosReabiertos: 2 })).toBe("Cerró la verificación de Farmacia: no conforme, 2 hallazgos; reabrió 2 hallazgos");
    expect(v({ conforme: true, hallazgos: 0, hallazgosValidados: 0, hallazgosReabiertos: 0 })).toBe("Cerró la verificación de Farmacia: conforme");
  });
});

describe("nombres de filtro de la 13C", () => {
  it.each([
    ["documento_ratificado", "Ratificó sin cambios un documento"],
    ["externo_adoptado", "Adoptó la edición de un externo"],
    ["revision_anual_decision", "Registró una decisión de la revisión anual"],
    ["norma_estado", "Cambió el estado de una norma"],
    ["impacto_resuelto", "Resolvió un impacto normativo"],
    ["exporto_indicadores", "Emitió los indicadores documentales"],
    ["hallazgo_validado", "Validó la corrección de un hallazgo"],
    ["tipo_norma_alternado", "Activó o desactivó un tipo de norma"],
  ])("%s dice «%s»", (accion, frase) => {
    expect(nombreDeAccion(accion)).toBe(frase);
  });
});

describe("la configuración documental nombra cada clave que guarda", () => {
  it("las de la vigencia, las metas y la distribución, con su nombre", async () => {
    const { CLAVES_CONFIG_DOCUMENTAL } = await import("@/db/consultas/config-documental");
    const cambios = Object.fromEntries(CLAVES_CONFIG_DOCUMENTAL.map((c) => [c, { antes: "1", despues: "2" }]));
    const frase = describirEvento({ accion: "editar_config_documental", entidad: "configuracion", entidadId: null, detalle: { cambios } });
    expect(frase).toMatch(/^Editó la configuración documental: [^_]+$/);
    for (const nombre of ["días de atención del semáforo", "meta de documentos dentro del plazo", "plazo de la revisión anual", "periodicidad de verificación de externos", "plazo de corrección"]) {
      expect(frase).toContain(nombre);
    }
  });
});

describe("maestros y parámetros de indicadores", () => {
  const frase = (accion: string, detalle: Record<string, unknown>) =>
    describirEvento({ accion, entidad: "x", entidadId: 1, detalle });
  it("dicen qué maestro y qué elemento", () => {
    expect(frase("indicador_maestro_guardado", { maestro: "unidades", nombre: "Minutos", creado: true })).toBe(
      "Creó la unidad «Minutos» de indicadores",
    );
    expect(frase("indicador_maestro_guardado", { maestro: "tipos", nombre: "Eficacia", creado: false })).toBe(
      "Editó el tipo «Eficacia» de indicadores",
    );
    expect(frase("indicador_maestro_activado", { maestro: "objetivos", nombre: "Mejorar", activo: false })).toBe(
      "Desactivó el objetivo «Mejorar» de indicadores",
    );
    expect(frase("indicador_maestro_borrado", { maestro: "clasificaciones", nombre: "Otra" })).toBe(
      "Borró la clasificación «Otra» de indicadores",
    );
    expect(frase("indicador_parametros_guardados", { cambios: { a: {}, b: {} } })).toBe(
      "Guardó los parámetros de indicadores (2 cambios)",
    );
  });
});
