import { periodoDe } from "@/lib/indicadores-documentales/periodo";
import { ETIQUETA_REPORTE_DE_LISTA, ETIQUETA_SEMAFORO_DE_LISTA } from "@/lib/indicadores/filtros";
import { ETIQUETA_ESTADO_NORMA, ETIQUETA_RELACION } from "@/lib/normograma/tipos";
import { cuenta } from "@/lib/plural";
import type { Accion } from "@/lib/tramites/transiciones";
import { textoDeDia } from "@/lib/vigencia/plazo";
import { ETIQUETA_DECISION, ETIQUETA_RESULTADO } from "@/lib/vigencia/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";

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
  // Distribución (13B).
  plazo_recibido_dias: "plazo para confirmar el recibido",
  plazo_recogida_dias: "plazo de recogida de copias",
  plazo_acuse_dias: "plazo del acuse de lectura",
  plazo_socializacion_dias: "plazo de socialización",
  plazo_correccion_dias: "plazo de corrección",
  verificacion_cada_dias: "días entre verificaciones",
  umbral_conformidad_pct: "umbral de conformidad",
  sello_franja_cm: "alto de la franja del sello",
  sello_qr_cm: "tamaño del código QR",
  // Vigencia, revisión anual, externos, impactos y el informe (13C).
  revision_atencion_dias: "días de atención del semáforo",
  revision_anual_plazo_dias: "plazo de la revisión anual",
  revision_anual_ventana_meses: "ventana de la revisión anual",
  externos_verificacion_meses: "periodicidad de verificación de externos",
  impacto_plazo_dias: "plazo de respuesta al impacto normativo",
  formato_informe_documento_id: "documento del formato del informe",
  formato_informe_margen_superior_cm: "espacio del encabezado del informe",
  formato_informe_margen_inferior_cm: "espacio del pie del informe",
  // Metas de los indicadores documentales (13C).
  meta_dentro_plazo_pct: "meta de documentos dentro del plazo",
  meta_aprobacion_dias: "meta de días de aprobación",
  meta_vencidos: "meta de documentos vencidos",
  meta_acuses_pct: "meta de acuses de lectura",
  meta_externos_pct: "meta de externos verificados",
  meta_etapas_plazo_pct: "meta de etapas a tiempo",
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

const ARTICULO_MAESTRO_INDICADOR: Record<string, string> = {
  tipos: "el tipo",
  clasificaciones: "la clasificación",
  unidades: "la unidad",
  objetivos: "el objetivo",
};

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

/** «SGC-IND-01, tercer trimestre de 2026»: la medición de un indicador, con su periodo en palabras. */
function medicionDe(codigo: string | null, periodo: unknown): string {
  const clave = texto(periodo);
  const etiqueta = clave ? (periodoDe(clave, zonaHoraria())?.etiqueta ?? clave) : null;
  if (!codigo) return `la medición de un indicador${etiqueta ? ` (${etiqueta})` : ""}`;
  return `${codigo}${etiqueta ? `, ${etiqueta}` : ""}`;
}

/** La etiqueta de `valor` en `mapa`, tal cual (con su mayúscula), o null si no es una de sus claves. */
function etiquetaTal(mapa: Record<string, string>, valor: unknown): string | null {
  const clave = texto(valor);
  return clave && Object.hasOwn(mapa, clave) ? mapa[clave] : null;
}

/**
 * Los filtros de la lista de indicadores que guarda el Excel de resultados, cada uno con su nombre (los ids no se nombran);
 * el semáforo y el reporte con los nombres del formulario de la lista (`filtros.ts`).
 */
function filtrosDeLista(v: unknown): (string | null)[] {
  const f = objeto(v);
  if (!f) return [];
  const semaforo = etiquetaTal(ETIQUETA_SEMAFORO_DE_LISTA, f.semaforo);
  const reporte = etiquetaTal(ETIQUETA_REPORTE_DE_LISTA, f.reporte);
  return [
    numero(f.procesoId) === null ? null : "de un proceso",
    numero(f.subprocesoId) === null ? null : "de un subproceso",
    numero(f.clasificacionId) === null ? null : "de una clasificación",
    numero(f.tipoId) === null ? null : "de un tipo",
    semaforo ? `con semáforo «${semaforo}»` : null,
    reporte ? `con reporte «${reporte}»` : null,
    f.participo === true ? "donde participa" : null,
    texto(f.texto) ? `con el texto «${texto(f.texto)}»` : null,
    f.retirados === true ? "con los retirados" : null,
  ];
}

/** «90», «96,5», «98 a 100» o «sin meta»: la meta de un periodo como la guarda `programarMeta`; `null` si no vino. */
function metaDeBitacora(v: unknown): string | null {
  const m = objeto(v);
  if (!m) return null;
  const meta = texto(m.meta);
  const maximo = texto(m.metaMax);
  if (meta === null) return "sin meta";
  const coma = (t: string) => t.replace(".", ",");
  return maximo === null || maximo === meta ? coma(meta) : `${coma(meta)} a ${coma(maximo)}`;
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

// ── 13C: vigencia, documentos externos, revisión anual y normograma. Cada frase lee solo el `detalle` que escribe su
// `registrarAuditoria` y el código resuelto por la entidad: nunca consulta nada más ni nombra lo que la fila no trae.

const objeto = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const numero = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const minuscula = (t: string) => t.charAt(0).toLocaleLowerCase("es") + t.slice(1);
/** La etiqueta de `valor` en `mapa`, en minúscula, o null si no es una de sus claves. */
function etiquetaDe(mapa: Record<string, string>, valor: unknown): string | null {
  const clave = texto(valor);
  return clave && Object.hasOwn(mapa, clave) ? minuscula(mapa[clave]) : null;
}
/** «1 mar 2027» de una fecha `yyyy-mm-dd`; otro texto, tal cual. */
function dia(v: unknown): string | null {
  const t = texto(v);
  return t && /^\d{4}-\d{2}-\d{2}$/.test(t) ? textoDeDia(t) : t;
}
/** « (excel, vencidos, 12 filas)» con las partes que haya. */
function entreParentesis(partes: (string | null)[]): string {
  const hay = partes.filter((p): p is string => p !== null);
  return hay.length > 0 ? ` (${hay.join(", ")})` : "";
}
const filas = (v: unknown) => (numero(v) === null ? null : cuenta(numero(v)!, "fila", "filas"));
/** Un filtro por proceso guarda su id: la frase dice que lo hubo, sin nombrarlo por un número. */
const deUnProceso = (v: unknown) => (numero(v) === null ? null : "de un proceso");

const MESES_DE_PLAZO = (v: unknown) => (numero(v) === null ? "el del tipo" : cuenta(numero(v)!, "mes", "meses"));

const NO_COINCIDE_EN_DISCO = "el archivo en disco no coincide con el registrado";

/** « 2021»: la edición de un externo, si el detalle la trae. */
const edicionDe = (d: Record<string, unknown>) => (texto(d.edicion) ? ` ${texto(d.edicion)}` : "");

const CAMPOS_DE_EXTERNO: Record<string, string> = {
  entidadEmisora: "entidad emisora",
  tituloOriginal: "título original",
  fuenteOficial: "fuente oficial",
  responsable: "responsable técnico",
  verificacionMeses: "periodicidad de verificación",
  norma: "norma enlazada",
};

/** Los datos de una norma que se comparan en su edición; `tipoNormaId` lo dice `tipo`. */
const CAMPOS_DE_NORMA: Record<string, string> = {
  tipo: "tipo",
  numero: "número",
  anio: "año",
  fechaExpedicion: "fecha de expedición",
  entidadEmisora: "entidad emisora",
  titulo: "título",
  tema: "tema",
  enlaceOficial: "enlace oficial",
  notas: "notas",
};

/** «: título, tema»: los campos de `nombres` cuyo valor difiere entre `antes` y `despues` (guardados completos). */
function camposDistintos(antes: unknown, despues: unknown, nombres: Record<string, string>): string {
  const a = objeto(antes);
  const b = objeto(despues);
  if (!a || !b) return "";
  const lista = Object.keys(nombres).filter((k) => JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null)).map((k) => nombres[k]);
  return lista.length > 0 ? `: ${lista.join(", ")}` : "";
}

const RESULTADO_DE_EXPORTACION: Record<string, string> = { al_dia: "al día", atencion: "en atención", vencida: "vencidos", en_tramite: "en trámite" };
const ORIGEN_DE_EXPORTACION: Record<string, string> = { interno: "internos", externo: "externos" };
/** El estado del filtro del normograma; «todas» no se dice. */
const ESTADO_DE_NORMAS: Record<string, string> = { vigente: "vigentes", modificada: "modificadas", derogada: "derogadas", retirada: "retiradas" };

/** «institucional» o «del proceso Gestión del Talento Humano», del `alcance` que guarda el Excel del normograma. */
function alcanceDeNormograma(v: unknown): string | null {
  const t = texto(v);
  if (!t) return null;
  if (t.startsWith("Proceso: ")) return `del proceso ${t.slice("Proceso: ".length)}`;
  return minuscula(t);
}

/** «la revisión anual 2026». */
const revisionDe = (d: Record<string, unknown>) => (numero(d.anio) === null ? "la revisión anual" : `la revisión anual ${numero(d.anio)}`);

/**
 * Una decisión de la revisión anual: la decisión nueva (y la anterior, si la había) o, con `despues: null`, el documento
 * que sale de la foto (una carga deshecha) con su motivo. La decisión automática «reciente» de una publicación no trae
 * autor: la fila sale a nombre del sistema.
 */
function describirDecision(d: Record<string, unknown>, cod: string | null): string {
  const revision = revisionDe(d);
  if (d.despues === null) return `${cod ?? "Un documento"} salió de ${revision}${conMotivo(d.motivo)}`;
  const despues = objeto(d.despues) ? texto(objeto(d.despues)!.decision) : null;
  const nueva = despues && Object.hasOwn(ETIQUETA_DECISION, despues) ? ETIQUETA_DECISION[despues as keyof typeof ETIQUETA_DECISION] : null;
  if (!nueva) return `Registró una decisión de ${revision}${cod ? ` sobre ${cod}` : ""}`;
  const previa = objeto(d.antes) ? texto(objeto(d.antes)!.decision) : null;
  const antes = previa && Object.hasOwn(ETIQUETA_DECISION, previa) ? ETIQUETA_DECISION[previa as keyof typeof ETIQUETA_DECISION] : null;
  return `En ${revision}, ${cod ?? "un documento"} quedó «${nueva}»${antes ? ` (antes «${antes}»)` : ""}`;
}

/** «Resolución 3100 de 2019 deroga a Resolución 2003 de 2014», o null si al detalle le falta una parte. */
function relacionEnTexto(d: Record<string, unknown>): string | null {
  const verbo = etiquetaDe(ETIQUETA_RELACION, d.tipo);
  const norma = texto(d.norma);
  const afectada = texto(d.afectada);
  return verbo && norma && afectada ? `${norma} ${verbo} ${afectada}` : null;
}

/** «la norma Resolución 3100 de 2019» o «una norma». */
const laNorma = (d: Record<string, unknown>) => (texto(d.nombre) ? `la norma ${texto(d.nombre)}` : "una norma");

const RESOLUCION_DE_IMPACTO = (d: Record<string, unknown>): string | null => {
  if (d.resolucion === "no_afecta") return "no afecta";
  if (d.resolucion === "solicitud") return `con la solicitud${texto(d.tramite) ? ` ${texto(d.tramite)}` : ""}`;
  if (d.resolucion === "verificacion") return "con la verificación del externo";
  return null;
};

/** «hallazgo de verificación en Farmacia», sin artículo: la frase pone «el» o «del». */
function hallazgoEn(d: Record<string, unknown>): string {
  const origen = d.origen === "recogida" ? " de recogida" : d.origen === "verificacion" ? " de verificación" : "";
  return `hallazgo${origen}${texto(d.punto) ? ` en ${texto(d.punto)}` : ""}`;
}

/** El cierre directo que solo se admite al único Administrador del SGC activo: su propia corrección o su propio punto. */
function marcaDeCierre(d: Record<string, unknown>): string {
  if (d.propioPunto === true) return " (de su propio punto; único Administrador del SGC activo)";
  return d.propioCorrector === true ? " (único Administrador del SGC activo)" : "";
}

/** «; validó 2 correcciones y reabrió 1 hallazgo»: lo que la verificación hizo con los hallazgos por validar del punto. */
function hallazgosDeLaVerificacion(d: Record<string, unknown>): string {
  const validados = numero(d.hallazgosValidados) ?? 0;
  const reabiertos = numero(d.hallazgosReabiertos) ?? 0;
  const partes = [
    validados > 0 ? `validó ${cuenta(validados, "corrección", "correcciones")}` : null,
    reabiertos > 0 ? `reabrió ${cuenta(reabiertos, "hallazgo", "hallazgos")}` : null,
  ].filter((p): p is string => p !== null);
  return partes.length > 0 ? `; ${partes.join(" y ")}` : "";
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
      return `Cerró la verificación de ${texto(d.punto) ?? "un punto de uso"}: ${resultadoDeVerificacion(d)}${hallazgosDeLaVerificacion(d)}`;
    case "verificacion_descartada":
      return `Descartó la verificación de ${texto(d.punto) ?? "un punto de uso"}${conMotivo(d.motivo)}`;
    case "hallazgo_cerrado":
      // Desde la Tarea 13 de la 13C el cierre directo guarda de dónde venía; una fila anterior conserva su frase.
      if (typeof d.estadoPrevio === "string") {
        return `Cerró directamente el ${hallazgoEn(d)}${marcaDeCierre(d)}${conMotivo(d.nota)}`;
      }
      return `Cerró un hallazgo${d.origen === "recogida" ? " de recogida" : d.origen === "verificacion" ? " de verificación" : ""}${conMotivo(d.nota)}`;
    case "hallazgo_corregido":
      return `Marcó corregido el ${hallazgoEn(d)}${conMotivo(d.nota)}`;
    case "hallazgo_validado":
      return d.validacion === "verificacion"
        ? `Validó con la verificación del punto la corrección del ${hallazgoEn(d)} y lo cerró`
        : `Validó la corrección del ${hallazgoEn(d)} y lo cerró`;
    case "hallazgo_reabierto":
      return d.reabiertoPor === "verificacion"
        ? `Reabrió con la verificación del punto el ${hallazgoEn(d)}${conMotivo(d.nota)}`
        : `Reabrió el ${hallazgoEn(d)}${conMotivo(d.nota)}`;
    case "exporto_socializaciones":
      return `Emitió el listado de socializaciones${entreParentesis([
        texto(d.formato),
        texto(d.desde) && texto(d.hasta) ? `${texto(d.desde)} a ${texto(d.hasta)}` : null,
        deUnProceso(d.procesoId),
        filas(d.total),
      ])}`;
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

    // ── Vigencia (13C)
    case "documento_ratificado":
      return `Ratificó sin cambios ${documentoYVersion(cod, d.version)}`;
    case "ratificacion_rechazada":
      return `No se pudo ratificar ${cod ?? "un documento"}: ${NO_COINCIDE_EN_DISCO}`;
    case "adopcion_rechazada":
      return `No se pudo adoptar ${documentoYVersion(cod, d.numero)}: ${NO_COINCIDE_EN_DISCO}`;
    case "fecha_revision_fijada":
      return `Fijó la próxima revisión de ${cod ?? "un documento"}${dia(d.fecha) ? ` para el ${dia(d.fecha)}` : ""}${conMotivo(d.nota)}`;
    case "fecha_revision_quitada":
      return `Quitó la fecha fijada de la próxima revisión de ${cod ?? "un documento"}${dia(d.fecha) ? ` (${dia(d.fecha)})` : ""}`;
    case "plazo_revision_ajustado":
      return numero(d.despues) === null
        ? `Devolvió el plazo de revisión de ${cod ?? "un documento"} al del tipo (antes, ${MESES_DE_PLAZO(d.antes)})`
        : `Ajustó el plazo de revisión de ${cod ?? "un documento"} a ${MESES_DE_PLAZO(d.despues)} (antes, ${MESES_DE_PLAZO(d.antes)})`;
    case "exporto_semaforo":
      return `Emitió el semáforo de vigencia${entreParentesis([
        texto(d.formato),
        etiquetaDe(RESULTADO_DE_EXPORTACION, d.estado),
        deUnProceso(d.procesoId),
        etiquetaDe(ORIGEN_DE_EXPORTACION, d.origen),
        filas(d.total),
      ])}`;

    // ── Documentos externos (13C)
    case "externo_registrado":
      return cod
        ? `Registró el documento externo ${cod}${texto(d.titulo) ? ` — ${texto(d.titulo)}` : ""}${texto(d.edicion) ? ` (edición ${texto(d.edicion)})` : ""}`
        : "Registró un documento externo";
    case "externo_editado":
      return `Editó los datos de control ${cod ? `del externo ${cod}` : "de un externo"}${camposEditados(d, CAMPOS_DE_EXTERNO)}`;
    case "externo_edicion_abierta":
      return `Abrió en borrador la edición${edicionDe(d)} de ${cod ?? "un externo"}`;
    case "externo_edicion_editada":
      return `Editó la edición${edicionDe(d)} en borrador de ${cod ?? "un externo"}`;
    case "externo_edicion_descartada":
      return `Descartó la edición${edicionDe(d)} en borrador de ${cod ?? "un externo"}`;
    case "externo_adoptado":
      return `Adoptó la edición${edicionDe(d)} de ${cod ?? "un externo"}`;
    case "externo_verificado": {
      const resultado = etiquetaDe(ETIQUETA_RESULTADO, d.resultado);
      return `Verificó la vigencia de ${cod ?? "un externo"}${resultado ? `: ${resultado}` : ""}`;
    }
    case "externo_retirado":
      return cod ? `Retiró el documento externo ${cod}${conMotivo(d.motivo)}` : `Retiró un documento externo${conMotivo(d.motivo)}`;
    case "exporto_externos":
      return `Emitió el listado de documentos externos${entreParentesis([
        texto(d.formato),
        etiquetaDe(RESULTADO_DE_EXPORTACION, d.estado),
        deUnProceso(d.procesoId),
        numero(d.responsableId) === null ? null : "de un responsable",
        texto(d.texto) ? `con el texto «${texto(d.texto)}»` : null,
        filas(d.total),
      ])}`;

    // ── Revisión anual (13C)
    case "revision_anual_abierta": {
      const documentos = numero(d.documentos) === null ? null : cuenta(numero(d.documentos)!, "documento", "documentos");
      const procesos = numero(d.procesos) === null ? null : cuenta(numero(d.procesos)!, "proceso", "procesos");
      return `Abrió ${revisionDe(d)}${documentos ? ` con ${documentos}${procesos ? ` de ${procesos}` : ""}` : ""}`;
    }
    case "revision_anual_prorrogada":
      return `Prorrogó ${numero(d.dias) === null ? "" : `${cuenta(numero(d.dias)!, "día", "días")} `}${revisionDe(d)}${conMotivo(d.motivo)}`;
    case "revision_anual_decision":
      return describirDecision(d, cod);
    case "revision_anual_normograma": {
      const resultado =
        d.resultado === "cambios"
          ? `: marcó cambios${conMotivo(d.nota)}`
          : d.resultado === "sin_novedad"
            ? `: sin novedad${texto(d.nota) ? ` (${texto(d.nota)})` : ""}`
            : "";
      return `Confirmó el normograma de ${texto(d.proceso) ?? "un proceso"} en ${revisionDe(d)}${resultado}`;
    }
    case "revision_anual_cerrada": {
      const documentos = numero(d.documentos) === null ? "" : ` con ${cuenta(numero(d.documentos)!, "documento", "documentos")}`;
      const sinRevisar = numero(d.sinRevisar) ?? 0;
      const quedaron = sinRevisar === 0 ? "" : `; ${sinRevisar === 1 ? "1 quedó" : `${sinRevisar} quedaron`} sin revisar`;
      return `Cerró ${revisionDe(d)}${documentos}${quedaron}`;
    }
    case "informe_generado":
      return `Generó el informe de ${revisionDe(d)}`;
    case "informe_no_regenerable":
      return d.motivo === "formato"
        ? `No se pudo generar el informe de ${revisionDe(d)}: el archivo del formato falta o cambió`
        : `No se pudo regenerar idéntico el informe de ${revisionDe(d)}: no se entregó`;
    case "exporto_indicadores":
      return `Emitió los indicadores documentales${entreParentesis([
        texto(d.formato),
        texto(d.periodo) ? (periodoDe(texto(d.periodo)!, zonaHoraria())?.etiqueta ?? texto(d.periodo)) : null,
        deUnProceso(d.procesoId),
      ])}`;

    // ── Normograma (13C)
    case "norma_creada":
      return texto(d.nombre) ? `Registró la norma ${texto(d.nombre)}${texto(d.titulo) ? ` — ${texto(d.titulo)}` : ""}` : "Registró una norma";
    case "norma_editada":
      return `Editó ${laNorma(d)}${camposDistintos(d.antes, d.despues, CAMPOS_DE_NORMA)}`;
    case "norma_estado": {
      const estado = etiquetaDe(ETIQUETA_ESTADO_NORMA, d.estadoNuevo);
      return estado ? `Pasó ${texto(d.nombre) ?? "una norma"} a ${estado}` : `Cambió el estado de ${laNorma(d)}`;
    }
    case "norma_retirada":
      return `Retiró ${laNorma(d)}${conMotivo(d.motivo)}`;
    case "norma_borrada":
      return `Borró ${laNorma(d)}`;
    case "norma_relacion": {
      const relacion = relacionEnTexto(d);
      return relacion ? `Registró que ${relacion}` : "Registró una relación entre normas";
    }
    case "norma_relacion_eliminada": {
      const relacion = relacionEnTexto(d);
      return `${relacion ? `Eliminó la relación «${relacion}»` : "Eliminó una relación entre normas"}${conMotivo(d.motivo)}`;
    }
    case "norma_asociada":
      return `Asoció ${laNorma(d)} ${texto(d.proceso) ? `al proceso ${texto(d.proceso)}` : "a un proceso"}`;
    case "norma_requisito_editado":
      return `Editó el requisito de ${texto(d.nombre) ?? "una norma"} ${texto(d.proceso) ? `en el proceso ${texto(d.proceso)}` : "en un proceso"}`;
    case "norma_desasociada":
      return `Quitó ${laNorma(d)} ${texto(d.proceso) ? `del proceso ${texto(d.proceso)}` : "de un proceso"}`;
    case "norma_documento_enlazado":
      return `Enlazó ${cod ?? "un documento"} a ${laNorma(d)}`;
    case "norma_documento_desenlazado":
      return `Quitó el enlace de ${cod ?? "un documento"} con ${laNorma(d)}`;
    case "indicador_maestro_guardado": {
      const que = ARTICULO_MAESTRO_INDICADOR[texto(d.maestro) ?? ""] ?? "el elemento";
      return `${d.creado === true ? "Creó" : "Editó"} ${que}${nombre ? ` «${nombre}»` : ""} de indicadores`;
    }
    case "indicador_maestro_activado": {
      const que = ARTICULO_MAESTRO_INDICADOR[texto(d.maestro) ?? ""] ?? "el elemento";
      return `${d.activo === true ? "Activó" : "Desactivó"} ${que}${nombre ? ` «${nombre}»` : ""} de indicadores`;
    }
    case "indicador_maestro_borrado": {
      const que = ARTICULO_MAESTRO_INDICADOR[texto(d.maestro) ?? ""] ?? "el elemento";
      return `Borró ${que}${nombre ? ` «${nombre}»` : ""} de indicadores`;
    }
    case "indicador_parametros_guardados": {
      const cambios = Object.keys(typeof d.cambios === "object" && d.cambios !== null ? d.cambios : {}).length;
      return cambios === 0
        ? "Guardó los parámetros de indicadores sin cambios"
        : `Guardó los parámetros de indicadores (${cambios} ${cambios === 1 ? "cambio" : "cambios"})`;
    }
    // ── Indicadores (14A): la ficha
    case "indicador_creado":
      return `Creó el indicador${cod ? ` ${cod}` : ""}${nombre ? ` «${nombre}»` : ""} en borrador`;
    case "indicador_borrador_guardado":
      return `Guardó el borrador de la ficha de ${cod ?? "un indicador"}${numero(d.numero) === null ? "" : ` (versión ${numero(d.numero)})`}`;
    case "indicador_cambio_abierto":
      return `Abrió un cambio en la ficha de ${cod ?? "un indicador"}${numero(d.numero) === null ? "" : ` (versión ${numero(d.numero)})`}`;
    case "indicador_enviado": {
      const clave = texto(d.rigeDesde);
      const etiqueta = clave ? (periodoDe(clave, zonaHoraria())?.etiqueta ?? clave) : null;
      // «desde el tercer trimestre de 2026», pero «desde noviembre de 2026» y «desde 2026».
      const rige = clave && etiqueta ? (/^\d{4}(-\d{2})?$/.test(clave) ? ` desde ${etiqueta}` : ` desde el ${etiqueta}`) : "";
      const tipo = d.tipoCambio === "inicial" ? "ficha nueva" : d.tipoCambio === "mayor" ? `cambio mayor${rige}` : null;
      return `Envió a aprobación la ficha de ${cod ?? "un indicador"}${entreParentesis([numero(d.numero) === null ? null : `versión ${numero(d.numero)}`, tipo])}`;
    }
    case "indicador_cambio_menor":
      return `Publicó un cambio menor en la ficha de ${cod ?? "un indicador"}${numero(d.numero) === null ? "" : ` (versión ${numero(d.numero)})`}${conMotivo(d.motivo)}`;
    case "indicador_aprobado":
      return `Aprobó la ficha de ${cod ?? "un indicador"}${numero(d.numero) === null ? "" : ` (versión ${numero(d.numero)})`}`;
    case "indicador_devuelto":
      return `Devolvió la ficha de ${cod ?? "un indicador"}${numero(d.numero) === null ? "" : ` (versión ${numero(d.numero)})`}${conMotivo(d.nota)}`;
    case "indicador_borrador_descartado":
      return `Descartó el borrador de la ficha de ${cod ?? "un indicador"}${numero(d.numero) === null ? "" : ` (versión ${numero(d.numero)})`}`;
    case "indicador_designados": {
      const funcion = texto(d.funcion);
      const quien = funcion === "analiza" ? "analiza" : funcion === "seguimiento" ? "hace seguimiento de" : "mide";
      const lista = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : []);
      const antes = lista(d.nombresAntes);
      const despues = lista(d.nombresDespues);
      return `Cambió quién ${quien} ${cod ?? "un indicador"}: ${antes.length > 0 ? antes.join(", ") : "nadie"} → ${despues.length > 0 ? despues.join(", ") : "nadie"}`;
    }
    case "indicador_operacion": {
      const antes = objeto(d.antes) ?? {};
      const despues = objeto(d.despues) ?? {};
      const campos: [string, string][] = [
        ["plazoReporteDias", "plazo de reporte"],
        ["inicioMedicion", "inicio de medición"],
        ["soporteObligatorio", "soporte obligatorio"],
        ["nivelAcceso", "nivel de acceso"],
      ];
      const cambiados = campos.filter(([clave]) => JSON.stringify(antes[clave]) !== JSON.stringify(despues[clave])).map(([, campo]) => campo);
      // Lo que tocó en las mediciones en curso (ola final, I1): la fecha límite nueva y el recálculo por el soporte.
      const enMediciones = [
        numero(d.medicionesConFechaNueva) ? `${cuenta(numero(d.medicionesConFechaNueva)!, "medición", "mediciones")} con la fecha límite nueva` : null,
        numero(d.medicionesRecalculadas) ? `${cuenta(numero(d.medicionesRecalculadas)!, "medición recalculada", "mediciones recalculadas")}` : null,
      ].filter((p): p is string => p !== null);
      return `Cambió los datos de operación de ${cod ?? "un indicador"}${cambiados.length > 0 ? `: ${cambiados.join(", ")}` : ""}${
        enMediciones.length > 0 ? ` (${enMediciones.join("; ")})` : ""
      }`;
    }
    case "indicador_duplicado":
      return `Creó el indicador${cod ? ` ${cod}` : ""} a partir de ${texto(d.origen) ?? "otro indicador"}`;
    case "indicador_retirado":
      return cod ? `Retiró el indicador ${cod}${conMotivo(d.motivo)}` : `Retiró un indicador${conMotivo(d.motivo)}`;
    case "indicador_descartado":
      return cod ? `Descartó el indicador ${cod}${conMotivo(d.motivo)}` : `Descartó un indicador${conMotivo(d.motivo)}`;
    case "indicador_borrado":
      return `Borró el indicador${cod ? ` ${cod}` : ""}, que nunca se envió a aprobación`;
    // ── Indicadores (14A): la importación de fichas aprobadas antes
    case "preparo_importacion_indicadores":
      return numero(d.loteId) === null ? "Preparó una importación de indicadores" : `Preparó la importación de indicadores n.º ${numero(d.loteId)}`;
    case "importo_indicadores": {
      const aprobadas = numero(d.aprobadas);
      const borradores = numero(d.borradores);
      if (aprobadas === null || borradores === null) return "Importó fichas de indicadores";
      const omitidas = numero(d.omitidas) ?? 0;
      const lote = numero(d.loteId) === null ? "" : ` en la importación n.º ${numero(d.loteId)}`;
      const detalle = `${aprobadas} ${aprobadas === 1 ? "aprobada" : "aprobadas"} antes de SGC Integral, ${borradores} en borrador${
        omitidas > 0 ? `; ${cuenta(omitidas, "fila omitida", "filas omitidas")}` : ""
      }`;
      return `Importó ${cuenta(aprobadas + borradores, "ficha", "fichas")} de indicadores${lote} (${detalle})`;
    }
    // ── Indicadores (14A): las mediciones
    case "medicion_guardada":
      return `Guardó sin reportar los datos de ${medicionDe(cod, d.periodo)}`;
    case "medicion_reportada": {
      const de = medicionDe(cod, d.periodo);
      const resultado = texto(d.resultado);
      return `Reportó ${de}${resultado ? `: ${resultado}` : ""}${d.sinMedidor === true ? " (sin nadie más que pudiera medirlo)" : ""}`;
    }
    case "medicion_corregida": {
      const de = medicionDe(cod, d.periodo);
      if (objeto(d.antes)?.noAplica === true && objeto(d.despues)?.noAplica === false && texto(d.resultado) === null) {
        return `Quitó «No aplica» de ${de}`;
      }
      const antes = texto(d.resultadoAntes);
      const despues = texto(d.resultado);
      return `Corrigió ${de}${antes || despues ? `: ${antes ?? "sin resultado"} → ${despues ?? "sin resultado"}` : ""}`;
    }
    case "medicion_no_aplica":
      return `Marcó «No aplica» en ${medicionDe(cod, d.periodo)}${conMotivo(d.motivo)}`;
    case "medicion_analizada":
      return `${d.primera === false ? "Editó" : "Escribió"} el análisis de ${medicionDe(cod, d.periodo)}${d.sinMedidor === true ? " (sin nadie más que pudiera analizarlo)" : ""}`;
    case "medicion_soporte_quitado":
      return `Quitó el soporte «${texto(d.nombre) ?? "?"}» de ${medicionDe(cod, d.periodo)}`;
    case "medicion_observada":
      return `Dejó una observación en ${medicionDe(cod, d.periodo)}`;
    case "medicion_observacion_respondida":
      return `Respondió una observación en ${medicionDe(cod, d.periodo)}`;
    case "medicion_historica_registrada": {
      const de = medicionDe(cod, d.periodo);
      if (d.noAplica === true) return `${d.correccion === true ? "Corrigió" : "Registró"} el histórico de ${de} como «No aplica»${conMotivo(d.motivo)}`;
      const despues = texto(d.resultado);
      if (d.correccion === true) {
        const antes = texto(d.resultadoAntes);
        return `Corrigió el histórico de ${de}${antes || despues ? `: ${antes ?? "sin resultado"} → ${despues ?? "sin resultado"}` : ""}`;
      }
      return `Registró el histórico de ${de}${despues ? `: ${despues}` : ""}`;
    }
    case "indicadores_mes_cerrado": {
      const mes = texto(d.mes);
      const etiqueta = mes ? (periodoDe(mes, zonaHoraria())?.etiqueta ?? mes) : null;
      if (!etiqueta) return "Cerró un mes en los indicadores";
      const cerradas = numero(d.cerradas);
      return `Cerró ${etiqueta} en los indicadores${cerradas === null ? "" : `: ${cuenta(cerradas, "medición cerrada", "mediciones cerradas")}`}`;
    }
    case "medicion_reabierta":
      return `Reabrió ${medicionDe(cod, d.periodo)}${d.propioMedidor === true ? ", que también mide" : ""}${conMotivo(d.justificacion)}`;
    case "medicion_cerrada_de_nuevo": {
      const mes = texto(d.mes);
      const etiqueta = mes ? (periodoDe(mes, zonaHoraria())?.etiqueta ?? mes) : null;
      return `Cerró de nuevo ${medicionDe(cod, d.periodo)}${etiqueta ? ` (cierre de ${etiqueta})` : ""}`;
    }
    case "indicador_meta_programada": {
      if (!cod) return "Programó la meta de un periodo de un indicador";
      const antes = metaDeBitacora(d.antes);
      const despues = metaDeBitacora(d.despues);
      const cambio = antes && despues ? `: ${antes} → ${despues}` : "";
      return `Programó la meta de ${medicionDe(cod, d.periodo)}${cambio}${d.tardia === true ? ", después de terminado el periodo" : ""}${conMotivo(d.justificacion)}`;
    }
    // ── Indicadores (14A): los Excel
    case "exporto_ficha_indicador":
      return `Emitió el Excel de la ficha y los resultados de ${cod ?? "un indicador"}${numero(d.anio) === null ? "" : ` (${numero(d.anio)})`}`;
    case "exporto_resultados_indicadores": {
      const anio = numero(d.anio);
      return `Emitió los resultados de los indicadores${anio === null ? "" : ` de ${anio}`}${entreParentesis(filtrosDeLista(d.filtros))}`;
    }
    case "tipo_norma_creado":
      return `Creó el tipo de norma${nombre ? ` «${nombre}»` : ""}`;
    case "tipo_norma_editado":
      return texto(d.antes) && texto(d.despues)
        ? `Renombró el tipo de norma «${texto(d.antes)}» a «${texto(d.despues)}»`
        : "Renombró un tipo de norma";
    case "tipo_norma_movido":
      return `Movió el tipo de norma${nombre ? ` «${nombre}»` : ""} ${d.direccion === "arriba" ? "hacia arriba" : "hacia abajo"}`;
    case "tipo_norma_alternado":
      return `${d.activo === true ? "Activó" : "Desactivó"} el tipo de norma${nombre ? ` «${nombre}»` : ""}`;
    case "impacto_resuelto": {
      // En la historia del documento cuando lo hay; si no, en la del proceso (`impactos.ts`).
      const donde = cod ?? (texto(d.proceso) ? `el proceso ${texto(d.proceso)}` : "un proceso");
      const como = RESOLUCION_DE_IMPACTO(d);
      return `Resolvió el impacto de ${texto(d.norma) ?? "una norma"} en ${donde}${como ? `: ${como}` : ""}`;
    }
    case "exporto_normograma":
      // Los mismos filtros que nombra el de los externos; el tipo se guarda por su id y no se nombra.
      return `Emitió el normograma${entreParentesis([
        texto(d.formato),
        alcanceDeNormograma(d.alcance),
        etiquetaDe(ESTADO_DE_NORMAS, d.estado),
        numero(d.tipoNormaId) === null ? null : "de un tipo de norma",
        numero(d.anio) === null ? null : `del año ${numero(d.anio)}`,
        texto(d.emisor) ? `emitidas por ${texto(d.emisor)}` : null,
        texto(d.texto) ? `con el texto «${texto(d.texto)}»` : null,
        d.incluirRetiradas === true ? "con las retiradas" : null,
        filas(d.total),
      ])}`;
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
  // Herencia de la 13B (13C)
  hallazgo_corregido: "Marcó corregido un hallazgo",
  hallazgo_validado: "Validó la corrección de un hallazgo",
  hallazgo_reabierto: "Reabrió un hallazgo",
  exporto_socializaciones: "Emitió el listado de socializaciones",
  // Vigencia (13C)
  documento_ratificado: "Ratificó sin cambios un documento",
  ratificacion_rechazada: "No se pudo ratificar un documento",
  adopcion_rechazada: "No se pudo adoptar una edición",
  fecha_revision_fijada: "Fijó la próxima revisión de un documento",
  fecha_revision_quitada: "Quitó la fecha fijada de un documento",
  plazo_revision_ajustado: "Ajustó el plazo de revisión de un documento",
  exporto_semaforo: "Emitió el semáforo de vigencia",
  // Documentos externos (13C)
  externo_registrado: "Registró un documento externo",
  externo_editado: "Editó los datos de control de un externo",
  externo_edicion_abierta: "Abrió en borrador la edición de un externo",
  externo_edicion_editada: "Editó la edición en borrador de un externo",
  externo_edicion_descartada: "Descartó la edición en borrador de un externo",
  externo_adoptado: "Adoptó la edición de un externo",
  externo_verificado: "Verificó la vigencia de un externo",
  externo_retirado: "Retiró un documento externo",
  exporto_externos: "Emitió el listado de documentos externos",
  // Revisión anual (13C)
  revision_anual_abierta: "Abrió la revisión anual",
  revision_anual_prorrogada: "Prorrogó la revisión anual",
  revision_anual_decision: "Registró una decisión de la revisión anual",
  revision_anual_normograma: "Confirmó el normograma en la revisión anual",
  revision_anual_cerrada: "Cerró la revisión anual",
  informe_generado: "Generó el informe de la revisión anual",
  informe_no_regenerable: "No se pudo generar un informe de la revisión anual",
  exporto_indicadores: "Emitió los indicadores documentales",
  exporto_ficha_indicador: "Emitió el Excel de un indicador",
  exporto_resultados_indicadores: "Emitió los resultados de los indicadores",
  // Normograma (13C)
  norma_creada: "Registró una norma",
  norma_editada: "Editó una norma",
  norma_estado: "Cambió el estado de una norma",
  norma_retirada: "Retiró una norma",
  norma_borrada: "Borró una norma",
  norma_relacion: "Registró una relación entre normas",
  norma_relacion_eliminada: "Eliminó una relación entre normas",
  norma_asociada: "Asoció una norma a un proceso",
  norma_requisito_editado: "Editó el requisito de una norma en un proceso",
  norma_desasociada: "Quitó una norma de un proceso",
  norma_documento_enlazado: "Enlazó un documento a una norma",
  norma_documento_desenlazado: "Quitó el enlace de un documento con una norma",
  indicador_maestro_guardado: "Guardó un elemento de los maestros de indicadores",
  indicador_maestro_activado: "Activó o desactivó un elemento de los maestros de indicadores",
  indicador_maestro_borrado: "Borró un elemento de los maestros de indicadores",
  indicador_parametros_guardados: "Guardó los parámetros de indicadores",
  indicador_creado: "Creó un indicador",
  indicador_borrador_guardado: "Guardó el borrador de una ficha de indicador",
  indicador_cambio_abierto: "Abrió un cambio en una ficha de indicador",
  indicador_enviado: "Envió una ficha de indicador a aprobación",
  indicador_cambio_menor: "Publicó un cambio menor en una ficha de indicador",
  indicador_aprobado: "Aprobó una ficha de indicador",
  indicador_devuelto: "Devolvió una ficha de indicador",
  indicador_borrador_descartado: "Descartó el borrador de una ficha de indicador",
  indicador_designados: "Cambió las personas designadas de un indicador",
  indicador_operacion: "Cambió los datos de operación de un indicador",
  indicador_duplicado: "Creó un indicador a partir de otro",
  indicador_retirado: "Retiró un indicador",
  indicador_descartado: "Descartó un indicador",
  indicador_borrado: "Borró un indicador",
  preparo_importacion_indicadores: "Preparó una importación de indicadores",
  importo_indicadores: "Importó fichas de indicadores",
  medicion_reportada: "Reportó una medición de indicador",
  medicion_corregida: "Corrigió una medición de indicador",
  medicion_no_aplica: "Marcó «No aplica» en una medición de indicador",
  medicion_guardada: "Guardó sin reportar una medición de indicador",
  medicion_analizada: "Escribió o editó el análisis de una medición de indicador",
  medicion_soporte_quitado: "Quitó un soporte de una medición de indicador",
  medicion_observada: "Dejó una observación en una medición de indicador",
  medicion_observacion_respondida: "Respondió una observación de una medición de indicador",
  medicion_historica_registrada: "Registró o corrigió un histórico de indicador",
  indicador_meta_programada: "Programó la meta de un periodo de un indicador",
  indicadores_mes_cerrado: "Cerró un mes de los indicadores",
  medicion_reabierta: "Reabrió una medición de indicador",
  medicion_cerrada_de_nuevo: "Cerró de nuevo una medición de indicador",
  tipo_norma_creado: "Creó un tipo de norma",
  tipo_norma_editado: "Renombró un tipo de norma",
  tipo_norma_movido: "Movió un tipo de norma",
  tipo_norma_alternado: "Activó o desactivó un tipo de norma",
  impacto_resuelto: "Resolvió un impacto normativo",
  exporto_normograma: "Emitió el normograma",
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
