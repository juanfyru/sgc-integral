import type { Accion } from "@/lib/tramites/transiciones";

export type EventoAuditoria = {
  accion: string;
  entidad: string;
  entidadId: number | null;
  detalle: Record<string, unknown>;
  codigoDocumento?: string | null;
};

const SINGULAR: Record<string, string> = {
  macroprocesos: "macroproceso",
  procesos: "proceso",
  subprocesos: "subproceso",
  tipos_documento: "tipo de documento",
  elementos_perifericos: "elemento periférico",
  areas: "área",
  cargos: "cargo",
};

/** Nombre legible de cada clave de `configuracion` que audita `editar_configuracion`. */
const NOMBRE_CLAVE_ENTIDAD: Record<string, string> = {
  nombre_entidad: "nombre",
  sigla_entidad: "sigla",
  lema: "lema",
  aviso_datos_personales: "aviso de datos personales",
  color_primario: "color primario",
  color_secundario: "color secundario",
};
const NOMBRE_CLAVE_MAPA: Record<string, string> = {
  subtitulo_mapa: "subtítulo del mapa",
  titulo_phva: "título del ciclo PHVA",
  texto_phva: "texto del ciclo PHVA",
  patron_codigo: "patrón del código",
};

/** «Editó la entidad y la marca: nombre, sigla…» según las claves guardadas (Entidad y marca o Textos del mapa). */
function describirConfiguracion(claves: unknown): string {
  const lista = Array.isArray(claves) ? claves.filter((c): c is string => typeof c === "string" && c.length > 0) : [];
  if (lista.length === 0) return "Editó la configuración";
  // Object.hasOwn: una clave como «constructor» no debe leer el prototipo.
  const nombre = (c: string) =>
    Object.hasOwn(NOMBRE_CLAVE_ENTIDAD, c) ? NOMBRE_CLAVE_ENTIDAD[c]
    : Object.hasOwn(NOMBRE_CLAVE_MAPA, c) ? NOMBRE_CLAVE_MAPA[c]
    : c.replace(/_+/g, " ").trim();
  const nombres = lista.map(nombre).join(", ");
  if (lista.every((c) => Object.hasOwn(NOMBRE_CLAVE_ENTIDAD, c))) return `Editó la entidad y la marca: ${nombres}`;
  if (lista.every((c) => Object.hasOwn(NOMBRE_CLAVE_MAPA, c))) return `Editó los textos del mapa y el código de documentos: ${nombres}`;
  return `Editó la configuración: ${nombres}`;
}

const NOMBRE_CLAVE_DOCUMENTAL: Record<string, string> = {
  formato_codigo: "formato del código",
  plazo_visto_bueno_dias: "plazo del visto bueno",
  plazo_aceptacion_dias: "plazo de aceptación",
  plazo_elaboracion_dias: "plazo de elaboración",
  plazo_ajustes_dias: "plazo de ajustes",
  plazo_revision_dias: "plazo de revisión",
  plazo_aprobacion_dias: "plazo de aprobación",
  plazo_publicacion_dias: "plazo de publicación",
  escalamiento_dias: "días para avisar al jefe",
  publicacion_directa: "publicación directa",
  formato_acta_documento_id: "documento del formato del acta",
  formato_acta_margen_superior_cm: "espacio del encabezado del acta",
  formato_acta_margen_inferior_cm: "espacio del pie del acta",
};

function describirConfigDocumental(cambios: unknown): string {
  const claves = cambios && typeof cambios === "object" ? Object.keys(cambios) : [];
  if (claves.length === 0) return "Guardó la configuración documental sin cambios";
  const partes = claves.map((c) => {
    const nombre = Object.hasOwn(NOMBRE_CLAVE_DOCUMENTAL, c) ? NOMBRE_CLAVE_DOCUMENTAL[c] : c.replace(/_+/g, " ").trim();
    if (c !== "publicacion_directa") return nombre;
    const despues = (cambios as Record<string, { despues?: unknown }>)[c]?.despues;
    return `${nombre} (${despues === "1" || despues === true ? "encendida" : "apagada"})`;
  });
  return `Editó la configuración documental: ${partes.join(", ")}`;
}

/** Lo que se hace dentro de la revisión sin mover el trámite de etapa: no pasa por `transicionar`. */
const ACCIONES_REVISION = [
  "guardar_lista",
  "crear_observacion",
  "responder_observacion",
  "cerrar_observacion",
  "reabrir_observacion",
] as const;

const ACCIONES_TRAMITE: Record<Accion | "solicitar" | "corregir_datos" | (typeof ACCIONES_REVISION)[number], string> = {
  solicitar: "Registró la solicitud",
  guardar_lista: "Guardó la lista de verificación de la solicitud",
  crear_observacion: "Escribió una observación en la solicitud",
  responder_observacion: "Respondió una observación de la solicitud",
  cerrar_observacion: "Cerró una observación de la solicitud",
  reabrir_observacion: "Reabrió una observación de la solicitud",
  dar_visto_bueno: "Dio el visto bueno a la solicitud",
  negar_visto_bueno: "Negó el visto bueno a la solicitud",
  retirar: "Retiró la solicitud",
  aceptar: "Aceptó la solicitud",
  rechazar: "Rechazó la solicitud",
  enviar_a_revision: "Envió a revisión la solicitud",
  devolver_revision: "Devolvió a elaboración la solicitud",
  concepto_favorable: "Dio concepto favorable a la solicitud",
  aprobar: "Aprobó la solicitud",
  devolver_aprobacion: "Devolvió a elaboración la solicitud",
  negar_eliminacion: "Negó la eliminación pedida en la solicitud",
  publicar: "Publicó el resultado de la solicitud",
  aprobar_y_publicar: "Aprobó y publicó el resultado de la solicitud",
  cancelar: "Canceló la solicitud",
  reasignar: "Reasignó la solicitud",
  corregir_datos: "Corrigió los datos del documento de la solicitud",
};

/** Las dos devoluciones dicen lo mismo en la bitácora; en el filtro hay que poder elegir cuál. */
const ACCIONES_TRAMITE_EN_FILTRO: Partial<Record<keyof typeof ACCIONES_TRAMITE, string>> = {
  devolver_revision: "Devolvió a elaboración la solicitud, desde la revisión",
  devolver_aprobacion: "Devolvió a elaboración la solicitud, desde la aprobación",
};

/** «Aprobó la solicitud SOL-2026-014 sobre GTH-PR-02». Una creación aún sin documento no lleva código. */
function describirTramite(accion: string, numero: string, codigo: string | null, observacion?: unknown): string {
  const clave = accion.slice("tramite_".length);
  const sobre = codigo ? ` sobre ${codigo}` : "";
  const cual = (ACCIONES_REVISION as readonly string[]).includes(clave) && typeof observacion === "number" ? ` (observación ${observacion})` : "";
  return Object.hasOwn(ACCIONES_TRAMITE, clave)
    ? `${ACCIONES_TRAMITE[clave as keyof typeof ACCIONES_TRAMITE]} ${numero}${sobre}${cual}`
    : `Acción «${accion}» sobre la solicitud ${numero}${sobre}`;
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

const DESTINO_DE_COPIA: Record<string, string> = {
  devuelta: "devuelta al SGC",
  destruida: "destruida",
  no_encontrada: "no se encontró",
};
const CAMPOS_DE_PUNTO: Record<string, string> = {
  nombre: "nombre",
  sede: "sede",
  ubicacion: "ubicación",
  responsableId: "responsable",
  procesoIds: "procesos",
};
const CAMPOS_DE_LISTA: Record<string, string> = {
  nombre: "nombre",
  descripcion: "descripción",
  miembros: "miembros",
};

function documentoYVersion(codigo: string | null, version: unknown): string {
  return `${codigo ?? "un documento"}${typeof version === "number" ? ` v${version}` : ""}`;
}

/** «la copia controlada N.º 02 de GTH-PR-02 v2» */
function copiaControlada(d: Record<string, unknown>, codigo: string | null): string {
  const numero = typeof d.numero === "number" ? ` N.º ${String(d.numero).padStart(2, "0")}` : "";
  return `la copia controlada${numero} de ${documentoYVersion(codigo, d.version)}`;
}

/** «: motivo», o nada si no se guardó. */
function conMotivo(v: unknown): string {
  const t = texto(v);
  return t ? `: ${t}` : "";
}

function versionesDeJornada(v: unknown): string {
  const lista = Array.isArray(v)
    ? v.flatMap((x) => (x && typeof x === "object" ? [documentoYVersion(texto((x as Record<string, unknown>).codigo), (x as Record<string, unknown>).version)] : []))
    : [];
  if (lista.length === 0) return "un documento";
  return lista.length === 1 ? lista[0] : `${lista.slice(0, -1).join(", ")} y ${lista[lista.length - 1]}`;
}

function asistentesDeJornada(v: unknown): string {
  const n = Array.isArray(v) ? v.length : typeof v === "number" ? v : null;
  return n === null ? "" : ` con ${n === 1 ? "1 asistente" : `${n} asistentes`}`;
}

function resultadoDeVerificacion(d: Record<string, unknown>): string {
  if (d.conforme === true) return "conforme";
  const n = typeof d.hallazgos === "number" ? d.hallazgos : 0;
  return d.conforme === false ? `no conforme${n > 0 ? `, ${n === 1 ? "1 hallazgo" : `${n} hallazgos`}` : ""}` : "sin resultado";
}

function nombreDespues(d: Record<string, unknown>): string | null {
  const despues = d.despues;
  return despues && typeof despues === "object" ? texto((despues as Record<string, unknown>).nombre) : null;
}

/** «: nombre, sede» según las claves de `despues`. */
function camposEditados(d: Record<string, unknown>, nombres: Record<string, string>): string {
  const despues = d.despues;
  if (!despues || typeof despues !== "object") return "";
  const lista = Object.keys(despues).map((k) => (Object.hasOwn(nombres, k) ? nombres[k] : k.replace(/_+/g, " ")));
  return lista.length > 0 ? `: ${lista.join(", ")}` : "";
}

function formatoYFilas(d: Record<string, unknown>): string {
  const partes = [texto(d.formato), typeof d.total === "number" ? `${d.total} ${d.total === 1 ? "fila" : "filas"}` : null].filter((p): p is string => p !== null);
  return partes.length > 0 ? ` (${partes.join(", ")})` : "";
}

const NOMBRE_DATO_DOCUMENTO: Record<string, string> = {
  codigo: "código",
  titulo: "título",
  tipo: "tipo",
  descripcion: "descripción",
  palabrasClave: "palabras clave",
  nivelAcceso: "nivel de acceso",
  asociaciones: "procesos donde aplica",
  relacionados: "documentos relacionados",
};

/** «: título, nivel de acceso», según lo que cambió; vacío en una fila anterior a la Fase 13A. */
function datosCambiados(despues: unknown): string {
  if (typeof despues !== "object" || despues === null) return "";
  const nombres = Object.keys(despues).map((d) => (Object.hasOwn(NOMBRE_DATO_DOCUMENTO, d) ? NOMBRE_DATO_DOCUMENTO[d] : d));
  return nombres.length > 0 ? `: ${nombres.join(", ")}` : "";
}

/** Acciones de mapa dinámicas: <verbo>_<singular>. */
const ACCION_DE_MAPA = /^(reordenar|activar|desactivar|borrar|crear|editar)_(.+)$/;
const VERBOS_DE_MAPA: Record<string, string> = {
  reordenar: "Reordenó",
  activar: "Activó",
  desactivar: "Desactivó",
  borrar: "Borró",
  crear: "Creó",
  editar: "Editó",
};

/**
 * Traduce un evento de auditoría a una frase en español legible. Función pura;
 * nunca vuelca JSON crudo ni interpreta el detalle como HTML. Fallback seguro
 * para acciones no mapeadas: el registro sigue siendo inteligible.
 */
export function describirEvento(e: EventoAuditoria): string {
  const d = e.detalle ?? {};
  const cod = e.codigoDocumento ?? texto(d.codigo);
  const nombre = texto(d.nombre) ?? texto(d.texto);

  switch (e.accion) {
    case "ingreso":
      return "Inició sesión";
    case "salida":
      return "Cerró sesión";
    case "crear_documento":
      return `Creó el documento ${cod ?? "?"} — ${texto(d.titulo) ?? ""}`.trimEnd();
    case "editar_documento":
      return `Editó el documento ${cod ?? "?"}${datosCambiados(d.despues)}`;
    case "editar_control":
      return `Corrigió los datos de control de ${cod ?? "un documento"}${datosCambiados(d.despues)}`;
    case "deshacer_carga":
      return `Deshizo la carga de la versión ${d.numero ?? "?"} de ${cod ?? "un documento"}: ${texto(d.motivo) ?? "sin motivo"}`;
    case "descartar_borrador":
      return `Descartó el borrador de la versión ${d.numero ?? "?"} de ${cod ?? "un documento"}`;
    case "crear_version":
      return `Creó la versión ${d.numero ?? "?"} de ${cod ?? "un documento"}`;
    case "publicar_version":
      return `Publicó la versión ${d.numero ?? "?"} de ${cod ?? "un documento"}`;
    case "editar_version":
      return `Editó una versión de ${cod ?? "un documento"}`;
    case "subir_archivo":
      return `Subió el archivo «${texto(d.nombre) ?? "?"}»`;
    case "eliminar_archivo":
      return `Eliminó el archivo «${texto(d.nombre) ?? "?"}»`;
    case "anular_documento":
      return `Anuló ${cod ?? "un documento"} (versión vigente ${d.versionAnulada ?? "?"})`;
    case "exporto_maestro":
      return `Emitió el Listado Maestro (${texto(d.formato) ?? "?"}, ${texto(d.incluir) ?? "?"})`;
    case "exporto_acuses":
      return `Emitió el cumplimiento de lectura (${texto(d.formato) ?? "?"}, ${texto(d.desde) ?? "?"} a ${texto(d.hasta) ?? "?"})`;
    case "acuses_pedidos":
      return `Pidió el acuse de lectura de ${cod ?? "un documento"} (${d.creados ?? 0} nuevos)`;
    case "copia_emitida":
      return `Emitió ${copiaControlada(d, cod)} para ${texto(d.punto) ?? "un punto de uso"}`;
    case "copia_reimpresa":
      return `Reimprimió ${copiaControlada(d, cod)} de ${texto(d.punto) ?? "un punto de uso"}${conMotivo(d.motivo)}`;
    case "copia_recibida":
      return `Confirmó el recibo de ${copiaControlada(d, cod)} en ${texto(d.punto) ?? "un punto de uso"}`;
    case "copia_recogida":
      return `Recogió ${copiaControlada(d, cod)} de ${texto(d.punto) ?? "un punto de uso"}: ${DESTINO_DE_COPIA[texto(d.destino) ?? ""] ?? "recogida"}`;
    case "copia_anulada":
      return `Anuló ${copiaControlada(d, cod)} de ${texto(d.punto) ?? "un punto de uso"}${conMotivo(d.motivo)}`;
    case "acuse_lectura":
      return `Confirmó la lectura de ${documentoYVersion(cod, d.version)}`;
    case "jornada_registrada":
      return `Registró una socialización de ${versionesDeJornada(d.versiones)}${asistentesDeJornada(d.asistentes)}`;
    case "jornada_anulada":
      return `Anuló una socialización${conMotivo(d.motivo)}`;
    case "verificacion_abierta":
      return `Abrió la verificación de ${texto(d.punto) ?? "un punto de uso"}`;
    case "verificacion_cerrada":
      return `Cerró la verificación de ${texto(d.punto) ?? "un punto de uso"}: ${resultadoDeVerificacion(d)}`;
    case "verificacion_descartada":
      return `Descartó la verificación de ${texto(d.punto) ?? "un punto de uso"}${conMotivo(d.motivo)}`;
    case "hallazgo_cerrado":
      return `Cerró un hallazgo${d.origen === "recogida" ? " de recogida" : d.origen === "verificacion" ? " de verificación" : ""}${conMotivo(d.nota)}`;
    case "crear_punto_uso":
      return `Creó el punto de uso${nombre ? ` «${nombre}»` : ""}`;
    case "editar_punto_uso":
      return `Editó el punto de uso${nombreDespues(d) ? ` «${nombreDespues(d)}»` : ""}${camposEditados(d, CAMPOS_DE_PUNTO)}`;
    case "activar_punto_uso":
      return "Activó un punto de uso";
    case "desactivar_punto_uso":
      return "Desactivó un punto de uso";
    case "crear_lista":
      return `Creó la lista de distribución${nombre ? ` «${nombre}»` : ""}`;
    case "editar_lista":
      return `Editó ${nombreDespues(d) ? `la lista de distribución «${nombreDespues(d)}»` : "una lista de distribución"}${camposEditados(d, CAMPOS_DE_LISTA)}`;
    case "activar_lista":
      return "Activó una lista de distribución";
    case "desactivar_lista":
      return "Desactivó una lista de distribución";
    case "exporto_copias":
      return `Emitió el listado de copias controladas${formatoYFilas(d)}`;
    case "exporto_verificaciones":
      return `Emitió el listado de verificaciones${formatoYFilas(d)}`;
    case "subir_logo":
      return `Cambió el logo de la entidad («${texto(d.nombre) ?? "?"}», ${d.ancho ?? "?"} × ${d.alto ?? "?"})`;
    case "quitar_logo":
      return "Quitó el logo de la entidad";
    case "cambiar_clave":
      return "Cambió su clave";
    case "aceptar_aviso_datos":
      return "Aceptó el aviso de tratamiento de datos personales";
    case "activar_segundo_factor":
      return "Activó el segundo factor";
    case "quitar_segundo_factor": {
      const afectado = texto(d.usuario);
      return afectado ? `Quitó el segundo factor de «${afectado}»` : "Desactivó el segundo factor";
    }
    case "crear_usuario":
      return `Creó el usuario «${texto(d.usuario) ?? "?"}»`;
    case "editar_usuario":
      return `Editó el usuario «${texto(d.usuario) ?? "?"}»`;
    case "desactivar_usuario":
      return `Desactivó el usuario «${texto(d.usuario) ?? "?"}»`;
    case "reactivar_usuario":
      return `Reactivó el usuario «${texto(d.usuario) ?? "?"}»`;
    case "restablecer_clave":
      return `Restableció la clave de «${texto(d.usuario) ?? "?"}»`;
    case "cerrar_sesion_forzado":
      return `Cerró la sesión de «${texto(d.usuario) ?? "?"}»`;
    case "desbloquear_usuario":
      return `Desbloqueó al usuario «${texto(d.usuario) ?? "?"}»`;
    case "crear_usuarios_lote":
      return `Creó ${d.creados ?? 0} usuarios por lote (${d.fallidos ?? 0} rechazados)`;
    case "editar_configuracion":
      return describirConfiguracion(d.claves);
    case "acta_generada":
      return `Generó el acta del trámite ${texto(d.numero) ?? "?"}`;
    case "acta_no_regenerable":
      return d.motivo === "formato"
        ? `No se pudo generar el acta del trámite ${d.tramiteId ?? "?"}: el archivo del formato falta o cambió`
        : `No se pudo regenerar idéntica el acta del trámite ${d.tramiteId ?? "?"}: no se entregó`;
    case "editar_config_documental":
      return describirConfigDocumental(d.cambios);
    case "crear_item_verificacion":
      return `Añadió un ítem a la lista de verificación: «${texto(d.texto) ?? "?"}»`;
    case "editar_item_verificacion":
      return `Editó un ítem de la lista de verificación: «${texto(d.texto) ?? "?"}»`;
    case "mover_item_verificacion":
      return `Movió un ítem de la lista de verificación ${d.direccion === "arriba" ? "hacia arriba" : "hacia abajo"}: «${texto(d.texto) ?? "?"}»`;
    case "alternar_item_verificacion":
      return `${d.activo === true ? "Activó" : "Desactivó"} un ítem de la lista de verificación: «${texto(d.texto) ?? "?"}»`;
  }

  if (e.accion.startsWith("tramite_")) return describirTramite(e.accion, texto(d.numero) ?? "?", cod, d.observacion);

  const m = ACCION_DE_MAPA.exec(e.accion);
  if (m) {
    const tipo = SINGULAR[e.entidad] ?? m[2].replace(/_/g, " ");
    const suf = nombre ? ` «${nombre}»` : "";
    return `${VERBOS_DE_MAPA[m[1]]} el ${tipo}${suf}`;
  }

  return `Acción «${e.accion}» sobre ${e.entidad}${e.entidadId ? ` #${e.entidadId}` : ""}`;
}

/** Lo que la acción de mapa escribe sin tilde o abreviado. */
const OBJETO_DE_MAPA: Record<string, string> = {
  area: "área",
  tipo_documento: "tipo de documento",
  periferico: "elemento periférico",
};

/** El nombre de cada acción en el filtro de la bitácora: sin datos de ningún evento en particular. */
const NOMBRE_DE_ACCION: Record<string, string> = {
  ingreso: "Inició sesión",
  salida: "Cerró sesión",
  crear_documento: "Creó un documento",
  editar_documento: "Editó un documento",
  editar_control: "Corrigió los datos de control de un documento",
  deshacer_carga: "Deshizo una carga",
  descartar_borrador: "Descartó un borrador",
  crear_version: "Creó una versión",
  publicar_version: "Publicó una versión",
  editar_version: "Editó una versión",
  subir_archivo: "Subió un archivo",
  eliminar_archivo: "Eliminó un archivo",
  anular_documento: "Anuló un documento",
  exporto_maestro: "Emitió el Listado Maestro",
  exporto_acuses: "Emitió el cumplimiento de lectura",
  acuses_pedidos: "Pidió acuses de lectura",
  copia_emitida: "Emitió una copia controlada",
  copia_reimpresa: "Reimprimió una copia controlada",
  copia_recibida: "Confirmó el recibo de una copia controlada",
  copia_recogida: "Recogió una copia controlada",
  copia_anulada: "Anuló una copia controlada",
  acuse_lectura: "Confirmó una lectura",
  jornada_registrada: "Registró una socialización",
  jornada_anulada: "Anuló una socialización",
  verificacion_abierta: "Abrió una verificación de punto de uso",
  verificacion_cerrada: "Cerró una verificación de punto de uso",
  verificacion_descartada: "Descartó una verificación de punto de uso",
  hallazgo_cerrado: "Cerró un hallazgo",
  crear_punto_uso: "Creó un punto de uso",
  editar_punto_uso: "Editó un punto de uso",
  activar_punto_uso: "Activó un punto de uso",
  desactivar_punto_uso: "Desactivó un punto de uso",
  crear_lista: "Creó una lista de distribución",
  editar_lista: "Editó una lista de distribución",
  activar_lista: "Activó una lista de distribución",
  desactivar_lista: "Desactivó una lista de distribución",
  exporto_copias: "Emitió el listado de copias controladas",
  exporto_verificaciones: "Emitió el listado de verificaciones",
  subir_logo: "Cambió el logo de la entidad",
  quitar_logo: "Quitó el logo de la entidad",
  cambiar_clave: "Cambió su clave",
  aceptar_aviso_datos: "Aceptó el aviso de tratamiento de datos personales",
  activar_segundo_factor: "Activó el segundo factor",
  quitar_segundo_factor: "Quitó el segundo factor",
  crear_usuario: "Creó un usuario",
  editar_usuario: "Editó un usuario",
  desactivar_usuario: "Desactivó un usuario",
  reactivar_usuario: "Reactivó un usuario",
  restablecer_clave: "Restableció una clave",
  cerrar_sesion_forzado: "Cerró la sesión de otra persona",
  desbloquear_usuario: "Desbloqueó a un usuario",
  crear_usuarios_lote: "Creó usuarios por lote",
  editar_configuracion: "Editó la configuración",
  editar_config_documental: "Editó la configuración documental",
  acta_generada: "Generó un acta",
  acta_no_regenerable: "No se pudo generar un acta",
  crear_item_verificacion: "Añadió un ítem a la lista de verificación",
  editar_item_verificacion: "Editó un ítem de la lista de verificación",
  mover_item_verificacion: "Movió un ítem de la lista de verificación",
  alternar_item_verificacion: "Activó o desactivó un ítem de la lista de verificación",
};

/** La frase legible de una acción de la bitácora. Una que no se conoce sale con su nombre, sin guiones. */
export function nombreDeAccion(accion: string): string {
  if (Object.hasOwn(NOMBRE_DE_ACCION, accion)) return NOMBRE_DE_ACCION[accion];
  if (accion.startsWith("tramite_")) {
    const clave = accion.slice("tramite_".length) as keyof typeof ACCIONES_TRAMITE;
    if (Object.hasOwn(ACCIONES_TRAMITE, clave)) return ACCIONES_TRAMITE_EN_FILTRO[clave] ?? ACCIONES_TRAMITE[clave];
  }
  const m = ACCION_DE_MAPA.exec(accion);
  if (m) return `${VERBOS_DE_MAPA[m[1]]} el ${Object.hasOwn(OBJETO_DE_MAPA, m[2]) ? OBJETO_DE_MAPA[m[2]] : m[2].replace(/_/g, " ")}`;
  return accion.replace(/_+/g, " ");
}
