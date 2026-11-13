/**
 * La importación de fichas de indicador aprobadas antes de SGC Integral (spec fase 14A §5.3 a §5.8; Tarea 9): el lote,
 * su plantilla en el almacén, la vista previa y la importación con la clave de quien la hace. La hace solo quien tiene
 * `indicadores.administrar`.
 *
 * Importar sigue F13A-R4: `validarImportacion` revisa todo sin escribir (los datos de la aprobación previa, la regla, el
 * archivo por su huella, las filas contra los catálogos y los códigos de hoy, y las siglas elegidas), la clave se
 * verifica fuera de la transacción y, dentro, con el lote bloqueado (`bloquearLote`, siempre el primer candado), se
 * revisa otra vez antes de escribir nada. Entra todo o nada: las filas sin problemas ni correspondencias pendientes.
 *
 * Cada ficha nace como una ficha nueva (`escribirFichaNueva`). Las «Aprobado» llevan su lote y su aprobación previa y
 * pasan a aprobada en una sola sentencia, con la huella de su contenido firmado y aprobada en el momento de la
 * importación: así los periodos que terminaron antes son históricos (spec §5.8). Las «Propuesto» son borradores
 * normales, sin lote (Ruling 32): siguen el camino de aprobación de la app con sus firmas. El evento `importado` del lote
 * guarda cada ficha creada (código, indicador, versión y estado) y es la constancia de quién importó con su clave, no una
 * fila de `firmas` (spec §5.7). No se avisa a nadie: no hay designados.
 *
 * Deshacer (spec §5.9) es del lote entero y solo mientras ninguna de sus fichas tenga trabajo hecho en la app
 * (`condicionDeDeshacer`). Borra las fichas que el evento `importado` recuerda, por su id, y es el único camino que borra
 * una versión aprobada: la marca de transacción con el id del lote, que el trigger de la 0012 lee, se pone solo aquí.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { ErrorFirma, enTransaccion, type OpcionesFlujo, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { asignarSiglaASubproceso } from "@/db/consultas/mapa-admin";
import { resolverRutaAlmacen } from "@/lib/almacen";
import { verificarParaFirmar, type CredencialesFirma } from "@/lib/firma";
import { huellaDeFicha } from "@/lib/indicadores/ficha";
import { listaDeCodigos } from "@/lib/indicadores/importacion/formulario";
import type { FilaLeida } from "@/lib/indicadores/importacion/columnas";
import { leerPlantilla } from "@/lib/indicadores/importacion/leer";
import type { ListasDePlantilla } from "@/lib/indicadores/importacion/plantilla";
import {
  revisarLote,
  type Catalogos,
  type Correspondencias,
  type FichaImportada,
  type FilaRevisada,
  type Pendiente,
  type ReglaDeImportacion,
} from "@/lib/indicadores/importacion/revisar";
import { ErrorIndicador } from "@/lib/indicadores/tipos";
import { normalizar } from "@/lib/lote-usuarios";
import { ErrorPermiso, puede, type SujetoPermiso } from "@/lib/permisos";
import type { ArchivoServible } from "@/lib/servir-archivo";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { exigirSiglaNoReservada, validarSigla } from "@/lib/validaciones-mapa";
import { zonaHoraria } from "@/lib/zona-horaria";
import { contenidoDeVersion, errorDeFichaImportada, escribirFichaNueva, type DatosFichaNueva } from "./fichas";
import { bloquearLote, estadoDeEventos, estadoDeLote, type EstadoLote } from "./lote-importacion";
import { obtenerParametros } from "./maestros";
import { asegurarMediciones, conDatos } from "./mediciones";

export { bloquearLote, estadoDeLote, type EstadoLote } from "./lote-importacion";

type Opciones = { sql?: Cliente; ahora?: Date };

export type AprobacionPrevia = { documento: string; aprobadoPor: string; fecha: string };

export type VistaPrevia = {
  filas: FilaRevisada[];
  /** Las correspondencias que faltan, una vez por texto: valen para todas las filas que lo usan. */
  pendientes: Pendiente[];
  /** Lo que se puede elegir en cada correspondencia: los elementos activos. */
  opciones: {
    subprocesos: { id: number; procesoId: number; proceso: string; nombre: string }[];
    cargos: { id: number; nombre: string }[];
    tipos: { id: number; nombre: string }[];
    unidades: { id: number; nombre: string; sufijo: string; decimales: number }[];
    /** Para el nombre del proceso de cada fila (una ficha sin subproceso no lo trae por el subproceso). */
    procesos: { id: number; sigla: string; nombre: string }[];
  };
};

export type DatosImportacion = {
  correspondencias: Correspondencias;
  regla: ReglaDeImportacion;
  aprobacionPrevia: AprobacionPrevia;
  /** Por subproceso, la sigla que se le da (spec §5.3, paso 5). */
  siglas: Record<number, string>;
  /** Los códigos de las filas importables que la persona vio (separados por comas o espacios; se comparan como lista): si hoy son otros, no se importa. */
  codigos?: string;
  credenciales: CredencialesFirma;
};

const NO_EXISTE = "La importación no existe";
const YA_SE_HIZO = "Esta importación ya se hizo";
const SIN_PLANTILLA = "Suba primero la plantilla de la importación";
const SIN_FILAS = "No hay filas para importar";
const ARCHIVO_CAMBIADO = "El archivo de la importación cambió en el almacén: cree una importación nueva con la plantilla";
const ARCHIVO_AUSENTE = "No se encontró el archivo de la importación en el almacén";
const SIGLA_FUERA = "Solo se da sigla a un subproceso de la importación que aún no la tiene";
const VISTA_CAMBIADA = "La vista previa cambió mientras se importaba: revísela y vuelva a importar";

/** Los largos de los datos de la aprobación previa: el documento va también en el sustento de la meta (hasta 500). */
const LARGO_DOCUMENTO = 120;
const LARGO_APROBO = 200;

function exigirAdministrar(sesion: SujetoPermiso): void {
  if (!puede(sesion, "indicadores.administrar")) throw new ErrorPermiso();
}

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

// ─────────────────────────────────────────────────────────────────────────────
// El lote y su archivo
// ─────────────────────────────────────────────────────────────────────────────

/** Abre un lote vacío: lo siguiente es subirle la plantilla (`/api/importaciones-indicadores/<id>/archivo`). */
export async function crearLote(sesion: SesionFlujo, opciones?: Opciones): Promise<{ id: number }> {
  exigirAdministrar(sesion);
  const ahora = opciones?.ahora ?? new Date();
  return enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    const [l] = await tx`INSERT INTO importaciones_indicadores (cargado_por, cargado_en)
      VALUES (${sesion.usuarioId}, ${ahora}) RETURNING id`;
    const id = Number(l.id);
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "preparo_importacion_indicadores",
      entidad: "importacion_indicadores",
      entidadId: id,
      detalle: { loteId: id },
    });
    return { id };
  });
}

/**
 * Si se puede subir la plantilla del lote, antes de recibir el cuerpo: 404 si no existe (o la persona no administra
 * indicadores), 409 si ya tiene su plantilla o ya se importó. `registrarArchivo` lo vuelve a exigir con el lote bloqueado.
 */
export async function autorizarArchivoDeLote(
  loteId: number,
  sesion: SujetoPermiso,
  opciones?: { sql?: Cliente },
): Promise<{ ok: true } | { ok: false; estado: 404 | 409 }> {
  if (!puede(sesion, "indicadores.administrar")) return { ok: false, estado: 404 };
  const estado = await estadoDeLote(opciones?.sql ?? obtenerSql(), loteId);
  if (estado === null) return { ok: false, estado: 404 };
  return estado === "sin_archivo" ? { ok: true } : { ok: false, estado: 409 };
}

type ArchivoDelLote = { id: number; ruta: string; mime: string; nombreOriginal: string; huella: string };

async function archivoDelLote(sql: Cliente, loteId: number): Promise<ArchivoDelLote | null> {
  const [a] = await sql`SELECT id, ruta, mime, nombre_original, hash_sha256 FROM archivos
    WHERE contexto = 'importacion_indicadores' AND contexto_id = ${loteId} ORDER BY id LIMIT 1`;
  return a
    ? { id: Number(a.id), ruta: a.ruta as string, mime: a.mime as string, nombreOriginal: a.nombre_original as string, huella: a.hash_sha256 as string }
    : null;
}

/** La plantilla subida del lote, para descargarla; `null` (el handler responde 404) a quien no administra indicadores. */
export async function archivoDeLote(sesion: SujetoPermiso, loteId: number, opciones?: { sql?: Cliente }): Promise<ArchivoServible | null> {
  if (!puede(sesion, "indicadores.administrar")) return null;
  if (!Number.isSafeInteger(loteId) || loteId <= 0) return null;
  const a = await archivoDelLote(opciones?.sql ?? obtenerSql(), loteId);
  return a ? { ruta: a.ruta, mime: a.mime, nombreOriginal: a.nombreOriginal } : null;
}

export type ResumenDeLote = {
  id: number;
  cargadoEn: Date;
  cargadoPor: string;
  estado: EstadoLote;
  archivo: string | null;
  /** Las cifras salen del evento `importado`, nunca de la dirección: cero mientras no se importa. */
  aprobadas: number;
  borradores: number;
  omitidas: number;
  importadoEn: Date | null;
};

function aResumen(r: Record<string, unknown>, estado: EstadoLote): ResumenDeLote {
  const detalle = (r.detalle ?? {}) as { fichas?: { estado: string }[]; omitidas?: number };
  const fichas = detalle.fichas ?? [];
  const aprobadas = fichas.filter((f) => f.estado === "aprobado").length;
  return {
    id: Number(r.id),
    cargadoEn: r.cargado_en as Date,
    cargadoPor: r.cargado_por as string,
    estado,
    archivo: (r.archivo as string | null) ?? null,
    aprobadas,
    borradores: fichas.length - aprobadas,
    omitidas: Number(detalle.omitidas ?? 0),
    importadoEn: (r.importado_en as Date | null) ?? null,
  };
}

const SELECCION_DE_LOTE = (sql: Cliente) => sql`SELECT l.id, l.cargado_en, u.nombre AS cargado_por,
    (SELECT a.nombre_original FROM archivos a WHERE a.contexto = 'importacion_indicadores' AND a.contexto_id = l.id ORDER BY a.id LIMIT 1) AS archivo,
    ev.detalle, ev.creado_en AS importado_en
  FROM importaciones_indicadores l
  JOIN usuarios u ON u.id = l.cargado_por
  LEFT JOIN importacion_eventos ev ON ev.importacion_id = l.id AND ev.tipo = 'importado'`;

/** Un lote con su estado y sus cifras, para su página; `null` si no existe o la persona no administra indicadores. */
export async function resumenDeLote(sesion: SujetoPermiso, loteId: number, opciones?: { sql?: Cliente }): Promise<ResumenDeLote | null> {
  if (!puede(sesion, "indicadores.administrar")) return null;
  const sql = opciones?.sql ?? obtenerSql();
  const estado = await estadoDeLote(sql, loteId);
  if (estado === null) return null;
  const [r] = await sql`${SELECCION_DE_LOTE(sql)} WHERE l.id = ${loteId}`;
  return r ? aResumen(r, estado) : null;
}

/** Los 50 lotes más recientes, con su estado y, si ya se importaron, cuántas fichas entraron. */
export async function lotesRecientes(sesion: SujetoPermiso, opciones?: { sql?: Cliente }): Promise<ResumenDeLote[]> {
  if (!puede(sesion, "indicadores.administrar")) return [];
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`${SELECCION_DE_LOTE(sql)}
    ORDER BY l.cargado_en DESC, l.id DESC LIMIT 50`;
  const ids = filas.map((f) => Number(f.id));
  const deshechos = ids.length
    ? new Set((await sql`SELECT importacion_id FROM importacion_eventos WHERE tipo = 'deshecho' AND importacion_id IN ${sql(ids)}`).map((e) => Number(e.importacion_id)))
    : new Set<number>();
  return filas.map((r) => {
    const estado = estadoDeEventos(Boolean(r.archivo), Boolean(r.importado_en), deshechos.has(Number(r.id)));
    return aResumen(r, estado);
  });
}

type Lectura = { archivo: ArchivoDelLote; filas: FilaLeida[] };

/** Lee la plantilla del lote del almacén, comprobando que es la que se subió (su huella). `null` si aún no tiene. */
async function leerLote(sql: Cliente, loteId: number): Promise<Lectura | null> {
  const archivo = await archivoDelLote(sql, loteId);
  if (!archivo) return null;
  const absoluta = resolverRutaAlmacen(archivo.ruta);
  let bytes: Buffer;
  try {
    if (!absoluta) throw new Error("ruta");
    bytes = await readFile(absoluta);
  } catch {
    throw new ErrorIndicador(ARCHIVO_AUSENTE);
  }
  if (sha256(bytes) !== archivo.huella) throw new ErrorIndicador(ARCHIVO_CAMBIADO);
  const lectura = await leerPlantilla(bytes);
  if (!lectura.ok) throw new ErrorIndicador(lectura.error);
  return { archivo, filas: lectura.filas };
}

/** Las listas desplegables de la plantilla: los elementos activos de los maestros y del mapa. */
export async function listasDePlantilla(opciones?: { sql?: Cliente }): Promise<ListasDePlantilla> {
  const sql = opciones?.sql ?? obtenerSql();
  const [procesos, subprocesos, tipos, clasificaciones, unidades] = await Promise.all([
    sql`SELECT sigla FROM procesos WHERE activo ORDER BY orden, sigla`,
    sql`SELECT DISTINCT s.nombre FROM subprocesos s JOIN procesos p ON p.id = s.proceso_id AND p.activo WHERE s.activo ORDER BY s.nombre`,
    sql`SELECT nombre FROM tipos_indicador WHERE activo ORDER BY orden, id`,
    sql`SELECT nombre FROM clasificaciones_indicador WHERE activo ORDER BY orden, id`,
    sql`SELECT nombre FROM unidades_indicador WHERE activo ORDER BY orden, id`,
  ]);
  return {
    procesos: procesos.map((p) => p.sigla as string),
    subprocesos: subprocesos.map((s) => s.nombre as string),
    tipos: tipos.map((t) => t.nombre as string),
    clasificaciones: clasificaciones.map((c) => c.nombre as string),
    unidades: unidades.map((u) => u.nombre as string),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// La revisión de las filas
// ─────────────────────────────────────────────────────────────────────────────

type CatalogosDeImportacion = Catalogos & { procesoDe: Map<number, string> };

/** Los catálogos activos y los códigos ya usados en la app (en cualquier estado), como los lee `revisarLote`. */
async function catalogosDeImportacion(sql: Cliente): Promise<CatalogosDeImportacion> {
  const [procesos, subprocesos, tipos, clasificaciones, unidades, cargos, codigos] = await Promise.all([
    sql`SELECT id, sigla, nombre FROM procesos WHERE activo ORDER BY orden, id`,
    sql`SELECT s.id, s.proceso_id, s.nombre, s.sigla FROM subprocesos s JOIN procesos p ON p.id = s.proceso_id AND p.activo
      WHERE s.activo ORDER BY p.orden, s.orden, s.id`,
    sql`SELECT id, nombre FROM tipos_indicador WHERE activo ORDER BY orden, id`,
    sql`SELECT id, nombre FROM clasificaciones_indicador WHERE activo ORDER BY orden, id`,
    sql`SELECT id, nombre, sufijo, decimales FROM unidades_indicador WHERE activo ORDER BY orden, id`,
    sql`SELECT id, nombre FROM cargos WHERE activo ORDER BY nombre, id`,
    sql`SELECT lower(codigo) AS codigo FROM indicadores`,
  ]);
  const catalogo = (filas: readonly Record<string, unknown>[]) => filas.map((f) => ({ id: Number(f.id), nombre: f.nombre as string }));
  return {
    procesos: procesos.map((p) => ({ id: Number(p.id), sigla: p.sigla as string, nombre: p.nombre as string })),
    subprocesos: subprocesos.map((s) => ({
      id: Number(s.id),
      procesoId: Number(s.proceso_id),
      nombre: s.nombre as string,
      sigla: (s.sigla as string | null) ?? null,
    })),
    tipos: catalogo(tipos),
    clasificaciones: catalogo(clasificaciones),
    unidades: unidades.map((u) => ({ id: Number(u.id), nombre: u.nombre as string, sufijo: (u.sufijo as string | null) ?? "", decimales: Number(u.decimales ?? 0) })),
    cargos: catalogo(cargos),
    codigosUsados: new Set(codigos.map((c) => c.codigo as string)),
    procesoDe: new Map(procesos.map((p) => [Number(p.id), p.sigla as string])),
  };
}

/** La regla de rangos del lote (spec §5.5): Atención desde el n % de la meta en ascendente y hasta el m % en descendente. */
function validarRegla(r: ReglaDeImportacion): void {
  if (!Number.isInteger(r.pctAscendente) || r.pctAscendente < 1 || r.pctAscendente > 99) {
    throw new ErrorIndicador("El porcentaje de Atención en ascendente debe ser un entero entre 1 y 99");
  }
  if (!Number.isInteger(r.pctDescendente) || r.pctDescendente < 101 || r.pctDescendente > 999) {
    throw new ErrorIndicador("El porcentaje de Atención en descendente debe ser un entero entre 101 y 999");
  }
}

/** Las claves de las correspondencias, normalizadas como las busca `revisarLote`; solo ids enteros positivos. */
function normalizarCorrespondencias(c: Partial<Correspondencias> | undefined): Correspondencias {
  const de = (m: Record<string, number> | undefined) =>
    Object.fromEntries(
      Object.entries(m ?? {})
        .filter(([, id]) => Number.isSafeInteger(id) && id > 0)
        .map(([texto, id]) => [normalizar(texto), id]),
    );
  return { subprocesos: de(c?.subprocesos), cargos: de(c?.cargos), tipos: de(c?.tipos), unidades: de(c?.unidades) };
}

/** El sustento de la meta de una ficha importada: de dónde salen sus rangos (spec §5.5). */
const sustentoDeLaRegla = (regla: ReglaDeImportacion, documento: string) =>
  `Regla de ${documento}: Alerta ≥ ${regla.pctAscendente} % de la meta (ascendente) y ≤ ${regla.pctDescendente} % (descendente)`;

/**
 * Los datos de la ficha nueva de una fila importada (spec §5.4 a §5.6): el cargo responsable de medir entra también
 * como responsable de analizar, la fuente de la fila va a cada variable, el referente normativo al requisito, sin
 * designados. Con meta, los rangos de la regla del lote y su sustento; sin meta, la ficha solo se vigila. Los decimales
 * (los de la unidad) y el plazo de reporte (el de los parámetros) los da quien llama: la plantilla no los trae.
 */
export function datosDeFichaImportada(
  f: FichaImportada,
  regla: ReglaDeImportacion,
  documento: string,
  base: { decimales: number; plazoReporteDias: number },
): DatosFichaNueva {
  const cargos = f.cargoId === null ? [] : [f.cargoId];
  return {
    procesoId: f.procesoId,
    ...(f.subprocesoId === null ? {} : { subprocesoId: f.subprocesoId }),
    codigo: f.codigo,
    nombre: f.nombre,
    proposito: f.proposito,
    ...(f.requisito === null ? {} : { requisito: f.requisito }),
    tipoId: f.tipoId,
    clasificacionId: f.clasificacionId,
    forma: f.forma,
    ...(f.factor === null ? {} : { factor: f.factor }),
    ...(f.forma === "libre" ? { formula: f.formula } : {}),
    variables: f.variables.map((v) => ({
      letra: v.letra,
      nombre: v.nombre,
      ...(v.fuente === null ? {} : { fuente: v.fuente }),
      consolidacion: v.consolidacion,
      admiteNegativos: false,
    })),
    unidadId: f.unidadId,
    decimales: base.decimales,
    periodicidad: f.periodicidad,
    tendencia: f.tendencia,
    ...(f.meta === null
      ? {}
      : {
          meta: f.meta,
          semaforoModo: "rangos" as const,
          ...(f.rangos === null ? {} : { rangos: JSON.stringify(f.rangos) }),
          sustentoMeta: sustentoDeLaRegla(regla, documento),
        }),
    ...(f.nivel === null ? {} : { nivel: f.nivel }),
    ...(f.riesgoAsociado === null ? {} : { riesgoAsociado: f.riesgoAsociado }),
    cargosMedir: cargos,
    cargosAnalizar: cargos,
    normaIds: [],
    plazoReporteDias: base.plazoReporteDias,
    inicioMedicion: f.inicioMedicion,
    soporteObligatorio: false,
    nivelAcceso: "general",
    mide: [],
    analiza: [],
  };
}

type Revision = { catalogos: CatalogosDeImportacion; filas: FilaRevisada[]; plazoReporteDias: number };

/**
 * `revisarLote` con los catálogos y los códigos de hoy, en el año de la importación, y después las reglas de la ficha de
 * la app (`errorDeFichaImportada`): lo que la ficha no admitiría queda como problema de su fila, no rompe el lote.
 */
async function revisarFilas(
  sql: Cliente,
  leidas: FilaLeida[],
  corr: Correspondencias,
  regla: ReglaDeImportacion,
  ahora: Date,
  documento: string,
): Promise<Revision> {
  const [catalogos, parametros] = await Promise.all([catalogosDeImportacion(sql), obtenerParametros({ sql })]);
  const anio = Number(fechaEnZona(ahora, zonaHoraria()).slice(0, 4));
  const decimales = new Map(catalogos.unidades.map((u) => [u.id, u.decimales]));
  const filas = revisarLote(leidas, catalogos, corr, regla, anio).map((f) => {
    if (f.ficha === null) return f;
    const error = errorDeFichaImportada(
      datosDeFichaImportada(f.ficha, regla, documento, { decimales: decimales.get(f.ficha.unidadId) ?? 0, plazoReporteDias: parametros.plazoReporteDias }),
    );
    return error === null ? f : { ...f, ficha: null, problemas: [...f.problemas, error] };
  });
  return { catalogos, filas, plazoReporteDias: parametros.plazoReporteDias };
}

/** Lo que se puede elegir en cada correspondencia de la vista previa. */
function opcionesDe(c: CatalogosDeImportacion): VistaPrevia["opciones"] {
  return {
    subprocesos: c.subprocesos.map((s) => ({ id: s.id, procesoId: s.procesoId, proceso: c.procesoDe.get(s.procesoId) ?? "", nombre: s.nombre })),
    cargos: c.cargos.map((x) => ({ id: x.id, nombre: x.nombre })),
    tipos: c.tipos.map((x) => ({ id: x.id, nombre: x.nombre })),
    unidades: c.unidades.map((x) => ({ id: x.id, nombre: x.nombre, sufijo: x.sufijo, decimales: x.decimales })),
    procesos: c.procesos.map((x) => ({ id: x.id, sigla: x.sigla, nombre: x.nombre })),
  };
}

/**
 * La vista previa del lote (spec §5.3, pasos 4 y 5): qué crearía cada fila y sus problemas, con las correspondencias y
 * la regla elegidas. No escribe nada. `null` si el lote no existe, aún no tiene plantilla o la persona no administra
 * indicadores; un archivo que no se puede leer, o que cambió en el almacén, es un error con su mensaje.
 */
export async function vistaPrevia(
  sesion: SujetoPermiso,
  loteId: number,
  d: { correspondencias: Correspondencias; regla: ReglaDeImportacion },
  opciones?: Opciones,
): Promise<VistaPrevia | null> {
  if (!puede(sesion, "indicadores.administrar")) return null;
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  if ((await estadoDeLote(sql, loteId)) === null) return null;
  validarRegla(d.regla);
  const lectura = await leerLote(sql, loteId);
  if (!lectura) return null;
  const { catalogos, filas } = await revisarFilas(sql, lectura.filas, normalizarCorrespondencias(d.correspondencias), d.regla, ahora, "");
  const pendientes: Pendiente[] = [];
  for (const p of filas.flatMap((f) => f.pendientes)) {
    if (!pendientes.some((x) => x.tipo === p.tipo && normalizar(x.texto) === normalizar(p.texto))) pendientes.push(p);
  }
  return { filas, pendientes, opciones: opcionesDe(catalogos) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Importar
// ─────────────────────────────────────────────────────────────────────────────

/** Los datos de la aprobación previa, recortados (spec §5.3, paso 2): la fecha, `AAAA-MM-DD` y no posterior a hoy. */
function validarAprobacionPrevia(p: Partial<AprobacionPrevia> | undefined, ahora: Date): AprobacionPrevia {
  const documento = (p?.documento ?? "").trim();
  if (documento === "") throw new ErrorIndicador("El documento de la aprobación previa es obligatorio");
  if (documento.length > LARGO_DOCUMENTO) {
    throw new ErrorIndicador(`El documento de la aprobación previa no puede pasar de ${LARGO_DOCUMENTO} caracteres`);
  }
  const aprobadoPor = (p?.aprobadoPor ?? "").trim();
  if (aprobadoPor === "") throw new ErrorIndicador("Quién aprobó es obligatorio");
  if (aprobadoPor.length > LARGO_APROBO) throw new ErrorIndicador(`Quién aprobó no puede pasar de ${LARGO_APROBO} caracteres`);
  const fecha = (p?.fecha ?? "").trim();
  const dia = /^(\d{4})-\d{2}-\d{2}$/.exec(fecha);
  const calendario = dia ? new Date(`${fecha}T00:00:00Z`) : null;
  if (
    !dia ||
    Number(dia[1]) < 1900 ||
    !calendario ||
    Number.isNaN(calendario.getTime()) ||
    calendario.toISOString().slice(0, 10) !== fecha ||
    fecha > fechaEnZona(ahora, zonaHoraria())
  ) {
    throw new ErrorIndicador("La fecha de la aprobación previa no es válida");
  }
  return { documento, aprobadoPor, fecha };
}

type SiglaElegida = { subprocesoId: number; sigla: string };

/**
 * Las siglas elegidas (spec §5.3, paso 5): solo a un subproceso de una fila que se importa, que aún no tiene sigla y
 * cuya fila la propone; una que ya tiene la misma no se vuelve a dar. La sigla, como en el mapa: de 2 a 4 letras, no
 * reservada y libre entre procesos y subprocesos.
 */
async function validarSiglas(sql: Cliente, pedidas: Record<number, string> | undefined, r: Revision): Promise<SiglaElegida[]> {
  const proponen = new Set(r.filas.flatMap((f) => (f.ficha?.siglaParaSubproceso && f.ficha.subprocesoId !== null ? [f.ficha.subprocesoId] : [])));
  const elegidas: SiglaElegida[] = [];
  const entradas = Object.entries(pedidas ?? {})
    .map(([id, sigla]) => ({ subprocesoId: Number(id), texto: String(sigla) }))
    .sort((a, b) => a.subprocesoId - b.subprocesoId);
  for (const { subprocesoId, texto } of entradas) {
    let sigla: string;
    try {
      sigla = validarSigla(texto);
      exigirSiglaNoReservada(sigla);
    } catch (err) {
      throw new ErrorIndicador((err as Error).message);
    }
    const sub = r.catalogos.subprocesos.find((s) => s.id === subprocesoId);
    if (sub?.sigla && sub.sigla.toLowerCase() === sigla.toLowerCase()) continue;
    if (!sub || sub.sigla !== null || !proponen.has(sub.id)) throw new ErrorIndicador(SIGLA_FUERA);
    const ocupada =
      elegidas.some((e) => e.sigla.toLowerCase() === sigla.toLowerCase()) ||
      (
        await sql`SELECT 1 FROM procesos WHERE lower(sigla) = lower(${sigla})
          UNION ALL SELECT 1 FROM subprocesos WHERE lower(sigla) = lower(${sigla}) AND id <> ${subprocesoId} LIMIT 1`
      ).length > 0;
    if (ocupada) throw new ErrorIndicador(`Ya hay un proceso o subproceso con la sigla ${sigla}`);
    elegidas.push({ subprocesoId, sigla });
  }
  return elegidas;
}

type Importacion = {
  lectura: Lectura;
  revision: Revision;
  importables: (FilaRevisada & { ficha: FichaImportada })[];
  siglas: SiglaElegida[];
  previa: AprobacionPrevia;
  correspondencias: Correspondencias;
};

/** Las filas que se importarían, por su código: lo que la persona vio antes de dar su clave. */
const codigosImportables = (filas: readonly (FilaRevisada & { ficha: FichaImportada })[]) =>
  listaDeCodigos(filas.map((f) => f.ficha.codigo).join(",")).join(",");

/**
 * Lo que debe cumplirse para importar, sin escribir nada. Dentro de la transacción recibe lo que se revisó antes de la
 * clave (`antes`): comprueba que el lote sigue teniendo el mismo archivo y que las filas importables son las mismas
 * (Ruling 35: nadie firma un lote distinto del que vio).
 */
async function validarImportacion(
  sql: Cliente,
  loteId: number,
  d: Omit<DatosImportacion, "credenciales">,
  ahora: Date,
  antes?: Importacion,
): Promise<Importacion> {
  const leida = antes?.lectura;
  const estado = await estadoDeLote(sql, loteId);
  if (estado === null) throw new ErrorIndicador(NO_EXISTE);
  if (estado === "importado" || estado === "deshecho") throw new ErrorIndicador(YA_SE_HIZO);
  if (estado === "sin_archivo") throw new ErrorIndicador(SIN_PLANTILLA);
  const previa = validarAprobacionPrevia(d.aprobacionPrevia, ahora);
  validarRegla(d.regla);
  let lectura: Lectura | null;
  if (leida) {
    const actual = await archivoDelLote(sql, loteId);
    if (!actual || actual.id !== leida.archivo.id || actual.huella !== leida.archivo.huella) throw new ErrorIndicador(ARCHIVO_CAMBIADO);
    lectura = leida;
  } else {
    lectura = await leerLote(sql, loteId);
  }
  if (!lectura) throw new ErrorIndicador(SIN_PLANTILLA);
  const correspondencias = normalizarCorrespondencias(d.correspondencias);
  const revision = await revisarFilas(sql, lectura.filas, correspondencias, d.regla, ahora, previa.documento);
  const importables = revision.filas.filter((f): f is FilaRevisada & { ficha: FichaImportada } => f.ficha !== null);
  // La vista que se firmó debe ser la de hoy; va antes que las siglas para que la persona vea este mensaje (Ruling 41).
  const hoy = codigosImportables(importables);
  if ((antes && hoy !== codigosImportables(antes.importables)) || (d.codigos !== undefined && hoy !== listaDeCodigos(d.codigos).join(","))) {
    throw new ErrorIndicador(VISTA_CAMBIADA);
  }
  const siglas = await validarSiglas(sql, d.siglas, revision);
  if (importables.length === 0) throw new ErrorIndicador(SIN_FILAS);
  return { lectura, revision, importables, siglas, previa, correspondencias };
}

const esDe = (err: unknown, restriccion: string) =>
  (err as { code?: string }).code === "23505" && (err as { constraint_name?: string }).constraint_name === restriccion;

/**
 * Importa las filas sin problemas del lote, todo o nada, con la clave de quien importa (spec §5.3, paso 6). Las
 * «Aprobado» quedan activas con su versión aprobada de origen importado; las «Propuesto», en borrador. Devuelve cuántas
 * de cada una y cuántas filas se omitieron por sus problemas.
 */
export async function importarLote(
  sesion: SesionFlujo,
  loteId: number,
  d: DatosImportacion,
  opciones: OpcionesFlujo = {},
): Promise<{ aprobadas: number; borradores: number; omitidas: number }> {
  exigirAdministrar(sesion);
  const sql = opciones.sql ?? obtenerSql();
  const ahora = opciones.ahora ?? new Date();
  const contexto = opciones.contexto ?? { ip: null, userAgent: null };

  const antes = await validarImportacion(sql, loteId, d, ahora);
  const verificar = opciones.verificar ?? verificarParaFirmar;
  const r = await verificar(sesion, d.credenciales, contexto, ahora);
  if (!r.ok) throw new ErrorFirma(r.mensaje, r.sesionCerrada, r.bloqueada);

  try {
    return await enTransaccion(sql, async (tx) => {
      await bloquearLote(tx, loteId);
      const v = await validarImportacion(tx, loteId, d, ahora, antes);
      for (const s of v.siglas) await asignarSiglaASubproceso(tx, s.subprocesoId, s.sigla, sesion.usuarioId);

      const decimales = new Map(v.revision.catalogos.unidades.map((u) => [u.id, u.decimales]));
      const fichas: { codigo: string; indicadorId: number; versionId: number; estado: FichaImportada["estado"] }[] = [];
      for (const fila of v.importables) {
        const f = fila.ficha;
        const datos = datosDeFichaImportada(f, d.regla, v.previa.documento, {
          decimales: decimales.get(f.unidadId) ?? 0,
          plazoReporteDias: v.revision.plazoReporteDias,
        });
        let creada: Awaited<ReturnType<typeof escribirFichaNueva>>;
        try {
          // Solo la aprobada lleva el lote y la aprobación previa; la propuesta es un borrador normal (Ruling 32).
          const extra = { importacionId: loteId, aprobacionPrevia: f.estado === "aprobado" ? v.previa : null };
          creada = await escribirFichaNueva(tx, sesion, datos, extra, ahora);
        } catch (err) {
          if (err instanceof ErrorIndicador) throw new ErrorIndicador(`Fila ${fila.numero} (${f.codigo}): ${err.message}`);
          throw err;
        }
        if (f.estado === "aprobado") {
          // Una sola sentencia: aprobada, la versión ya no admite cambios. Se aprueba al importar (spec §5.8).
          const huella = huellaDeFicha(await contenidoDeVersion(tx, creada.versionId));
          await tx`UPDATE indicador_versiones SET estado = 'aprobada', huella = ${huella},
              elaborada_por = ${sesion.usuarioId}, elaborada_en = ${ahora}, aprobada_por = ${sesion.usuarioId}, aprobada_en = ${ahora},
              rige_desde = ${f.inicioMedicion}, actualizado_en = ${ahora}
            WHERE id = ${creada.versionId}`;
          await tx`UPDATE indicadores SET estado = 'activo' WHERE id = ${creada.indicadorId} AND estado = 'borrador'`;
          await asegurarMediciones({ sql: tx, ahora, indicadorId: creada.indicadorId });
        }
        fichas.push({ codigo: creada.codigo, indicadorId: creada.indicadorId, versionId: creada.versionId, estado: f.estado });
      }

      const aprobadas = fichas.filter((f) => f.estado === "aprobado").length;
      const borradores = fichas.length - aprobadas;
      const omitidas = v.revision.filas.length - v.importables.length;
      const codigos = fichas.map((f) => f.codigo);
      const regla = { pctAscendente: d.regla.pctAscendente, pctDescendente: d.regla.pctDescendente };
      await tx`INSERT INTO importacion_eventos (importacion_id, tipo, usuario_id, metodo, detalle, creado_en)
        VALUES (${loteId}, 'importado', ${sesion.usuarioId}, ${r.metodo}, ${tx.json({
          archivo: { id: v.lectura.archivo.id, nombre: v.lectura.archivo.nombreOriginal, huella: v.lectura.archivo.huella },
          regla,
          aprobacionPrevia: v.previa,
          correspondencias: v.correspondencias,
          siglas: v.siglas,
          codigos,
          fichas,
          omitidas,
        } as never)}, ${ahora})`;
      await registrarAuditoria(tx, {
        usuarioId: sesion.usuarioId,
        accion: "importo_indicadores",
        entidad: "importacion_indicadores",
        entidadId: loteId,
        detalle: { loteId, aprobadas, borradores, omitidas, codigos, documento: v.previa.documento, regla },
      });
      return { aprobadas, borradores, omitidas };
    });
  } catch (err) {
    // Otra importación del mismo lote entró antes: el evento es único por lote y tipo.
    if (esDe(err, "importacion_eventos_tipo_unico")) throw new ErrorIndicador(YA_SE_HIZO);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Deshacer la importación (spec §5.9)
// ─────────────────────────────────────────────────────────────────────────────

const NO_SE_HA_HECHO = "Esta importación no se ha hecho";
const YA_SE_DESHIZO = "Esta importación ya se deshizo";
const MOTIVO_MINIMO = 10;
const MOTIVO_MAXIMO = 500;

/** Por qué una ficha del lote ya no se puede borrar (spec §5.9; las dos de las propuestas, Ruling 42). */
const IMPIDE = {
  datos: "tiene datos reportados",
  designadas: "tiene personas designadas",
  posterior: "tiene una versión posterior",
  enviada: "la propuesta ya se envió a aprobación",
  modificada: "la propuesta se modificó después de importarse",
} as const;

export type Impedimento = { codigo: string; motivo: string };
export type CondicionDeDeshacer = { puede: boolean; impiden: Impedimento[] };

/** Una ficha que creó la importación, como la recuerda el evento `importado` (spec §5.7). */
type FichaDelLote = { indicadorId: number; versionId: number; estado: FichaImportada["estado"] };
type Importada = { en: Date; fichas: FichaDelLote[] };
/** Una ficha del lote que sigue en la app (una propuesta borrada en la app ya no está), con su código de hoy. */
type FichaQueSigue = FichaDelLote & { codigo: string };

const idValido = (v: unknown) => {
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

/** El evento `importado` del lote: cuándo fue y qué fichas creó. `null` si el lote no se ha importado. */
async function importadaDelLote(sql: Cliente, loteId: number): Promise<Importada | null> {
  const [e] = await sql`SELECT detalle, creado_en FROM importacion_eventos WHERE importacion_id = ${loteId} AND tipo = 'importado'`;
  if (!e) return null;
  const lista = (e.detalle as { fichas?: unknown } | null)?.fichas;
  const fichas = (Array.isArray(lista) ? lista : []).flatMap((f): FichaDelLote[] => {
    const x = (f ?? {}) as Record<string, unknown>;
    const indicadorId = idValido(x.indicadorId);
    const versionId = idValido(x.versionId);
    if (indicadorId === null || versionId === null) return [];
    return [{ indicadorId, versionId, estado: x.estado === "aprobado" ? "aprobado" : "propuesto" }];
  });
  return { en: e.creado_en as Date, fichas };
}

/**
 * Lo que impide deshacer, ficha por ficha y en el orden del lote (spec §5.9). Cuenta como dato de una medición todo lo
 * que `conDatos` cuenta (valores, «no aplica», análisis, eventos, observaciones y soportes) y la fecha de reporte; una
 * versión posterior es cualquier otra versión del indicador, en cualquier estado. De una propuesta, que es un borrador
 * normal: enviarla deja la firma «Elaboró», que no se borra (aunque la devuelvan sigue firmada), y editarla después de
 * importarla es trabajo que se perdería. Abrir periodos sin datos, sus avisos y las metas programadas no impiden nada.
 */
async function revisarDeshacer(sql: Cliente, importada: Importada): Promise<{ impiden: Impedimento[]; siguen: FichaQueSigue[] }> {
  const { fichas, en } = importada;
  const filas = await sql`SELECT x.indicador_id, i.codigo,
      EXISTS (SELECT 1 FROM mediciones m WHERE m.indicador_id = i.id AND (m.reportada_en IS NOT NULL OR ${conDatos(sql)})) AS datos,
      EXISTS (SELECT 1 FROM indicador_designados d WHERE d.indicador_id = i.id) AS designadas,
      EXISTS (SELECT 1 FROM indicador_versiones v WHERE v.indicador_id = i.id AND v.id <> x.version_id) AS posterior,
      EXISTS (SELECT 1 FROM firmas f JOIN indicador_versiones v ON v.id = f.indicador_version_id WHERE v.indicador_id = i.id) AS enviada,
      EXISTS (SELECT 1 FROM indicador_versiones v WHERE v.id = x.version_id AND v.actualizado_en > ${en}) AS modificada
    FROM unnest(${sql.array(fichas.map((f) => f.indicadorId))}::bigint[], ${sql.array(fichas.map((f) => f.versionId))}::bigint[])
      AS x(indicador_id, version_id)
    JOIN indicadores i ON i.id = x.indicador_id`;
  const porId = new Map(filas.map((r) => [Number(r.indicador_id), r]));
  const impiden: Impedimento[] = [];
  const siguen: FichaQueSigue[] = [];
  for (const f of fichas) {
    const r = porId.get(f.indicadorId);
    if (!r) continue;
    const codigo = r.codigo as string;
    siguen.push({ ...f, codigo });
    const motivos: string[] = [];
    if (r.datos) motivos.push(IMPIDE.datos);
    if (r.designadas) motivos.push(IMPIDE.designadas);
    if (f.estado === "propuesto" && r.enviada) {
      // Enviarla ya la cambió (y una versión posterior solo sale de una aprobada): basta con decirlo una vez.
      motivos.push(IMPIDE.enviada);
    } else {
      if (r.posterior) motivos.push(IMPIDE.posterior);
      if (f.estado === "propuesto" && r.modificada) motivos.push(IMPIDE.modificada);
    }
    impiden.push(...motivos.map((motivo) => ({ codigo, motivo })));
  }
  return { impiden, siguen };
}

/**
 * Si el lote se puede deshacer y, si no, qué fichas lo impiden y por qué (spec §5.9). Un lote que no está importado (sin
 * hacer, deshecho o inexistente) no se puede deshacer y no tiene impedimentos que mostrar.
 */
export async function condicionDeDeshacer(sql: Cliente, loteId: number): Promise<CondicionDeDeshacer> {
  if ((await estadoDeLote(sql, loteId)) !== "importado") return { puede: false, impiden: [] };
  const importada = await importadaDelLote(sql, loteId);
  if (!importada) return { puede: false, impiden: [] };
  const { impiden } = await revisarDeshacer(sql, importada);
  return { puede: impiden.length === 0, impiden };
}

/** El motivo, recortado: de 10 a 500 caracteres. */
function motivoDeDeshacer(v: unknown): string {
  const t = typeof v === "string" ? v.trim() : "";
  if (t.length < MOTIVO_MINIMO) throw new ErrorIndicador(`El motivo debe tener al menos ${MOTIVO_MINIMO} caracteres`);
  if (t.length > MOTIVO_MAXIMO) throw new ErrorIndicador(`El motivo no puede pasar de ${MOTIVO_MAXIMO} caracteres`);
  return t;
}

/** Lo que debe cumplirse para deshacer, sin escribir nada: el lote importado y ninguna ficha con impedimentos. */
async function validarDeshacer(sql: Cliente, loteId: number): Promise<FichaQueSigue[]> {
  const estado = await estadoDeLote(sql, loteId);
  if (estado === null) throw new ErrorIndicador(NO_EXISTE);
  if (estado === "deshecho") throw new ErrorIndicador(YA_SE_DESHIZO);
  const importada = estado === "importado" ? await importadaDelLote(sql, loteId) : null;
  if (!importada) throw new ErrorIndicador(NO_SE_HA_HECHO);
  const { impiden, siguen } = await revisarDeshacer(sql, importada);
  if (impiden.length > 0) throw new ErrorIndicador(`No se puede deshacer: ${impiden[0].codigo} ${impiden[0].motivo}`);
  return siguen;
}

/**
 * Las filas que deshacer revisa y borra, bloqueadas en el orden del módulo (el indicador, sus versiones y sus mediciones,
 * por id): quien designa, reporta, sube un soporte, observa o firma la ficha espera a que esto termine, y lo que haga
 * después ya no encuentra la ficha.
 */
async function bloquearFichas(tx: TransactionSql, fichas: readonly FichaDelLote[]): Promise<void> {
  const ids = fichas.map((f) => f.indicadorId);
  if (ids.length === 0) return;
  await tx`SELECT id FROM indicadores WHERE id IN ${tx(ids)} ORDER BY id FOR UPDATE`;
  await tx`SELECT id FROM indicador_versiones WHERE indicador_id IN ${tx(ids)} ORDER BY id FOR UPDATE`;
  await tx`SELECT id FROM mediciones WHERE indicador_id IN ${tx(ids)} ORDER BY id FOR UPDATE`;
}

/**
 * Deshace la importación del lote (spec §5.9), con motivo y la clave de quien la deshace (F13A-R4): borra sus fichas
 * (mediciones sin datos, metas programadas, variables, responsables, normas, versiones e indicadores) y libera sus
 * códigos. Quedan el registro del lote con su evento `deshecho` (quién, cuándo, motivo y códigos), la bitácora, la
 * plantilla subida y las siglas que se dieron a los subprocesos. Devuelve cuántas fichas borró.
 */
export async function deshacerImportacion(
  sesion: SesionFlujo,
  loteId: number,
  d: { motivo: string; credenciales: CredencialesFirma },
  opciones: OpcionesFlujo = {},
): Promise<{ fichas: number }> {
  exigirAdministrar(sesion);
  const motivo = motivoDeDeshacer(d.motivo);
  const sql = opciones.sql ?? obtenerSql();
  const ahora = opciones.ahora ?? new Date();
  const contexto = opciones.contexto ?? { ip: null, userAgent: null };

  await validarDeshacer(sql, loteId);
  const verificar = opciones.verificar ?? verificarParaFirmar;
  const r = await verificar(sesion, d.credenciales, contexto, ahora);
  if (!r.ok) throw new ErrorFirma(r.mensaje, r.sesionCerrada, r.bloqueada);

  try {
    return await enTransaccion(sql, async (tx) => {
      await bloquearLote(tx, loteId);
      const importada = await importadaDelLote(tx, loteId);
      if (importada) await bloquearFichas(tx, importada.fichas);
      // Con todo bloqueado, otra vez: alguien pudo reportar, designar o deshacer mientras se verificaba la clave.
      const siguen = await validarDeshacer(tx, loteId);
      const ids = siguen.map((f) => f.indicadorId);
      const versiones = siguen.map((f) => f.versionId);

      // La marca que deja borrar las versiones aprobadas de este lote: dura lo que esta transacción (spec §5.9).
      await tx`SELECT set_config('sgc.deshacer_importacion', ${String(loteId)}, true)`;
      if (ids.length > 0) {
        // Solo las mediciones sin datos: una con datos no se borra nunca, y su indicador tampoco (la FK lo impide).
        await tx`DELETE FROM mediciones m WHERE m.indicador_id IN ${tx(ids)}
          AND NOT (m.reportada_en IS NOT NULL OR ${conDatos(tx)})`;
        await tx`DELETE FROM indicador_metas WHERE indicador_id IN ${tx(ids)}`;
        await tx`DELETE FROM indicador_variables WHERE version_id IN ${tx(versiones)}`;
        await tx`DELETE FROM indicador_responsables WHERE version_id IN ${tx(versiones)}`;
        await tx`DELETE FROM indicador_normas WHERE version_id IN ${tx(versiones)}`;
        await tx`DELETE FROM indicador_versiones WHERE id IN ${tx(versiones)}`;
        await tx`DELETE FROM indicadores WHERE id IN ${tx(ids)}`;
      }

      const codigos = siguen.map((f) => f.codigo);
      await tx`INSERT INTO importacion_eventos (importacion_id, tipo, usuario_id, metodo, detalle, creado_en)
        VALUES (${loteId}, 'deshecho', ${sesion.usuarioId}, ${r.metodo}, ${tx.json({ motivo, codigos } as never)}, ${ahora})`;
      await registrarAuditoria(tx, {
        usuarioId: sesion.usuarioId,
        accion: "deshizo_importacion_indicadores",
        entidad: "importacion_indicadores",
        entidadId: loteId,
        detalle: { loteId, motivo, codigos, fichas: siguen.length },
      });
      return { fichas: siguen.length };
    });
  } catch (err) {
    // Otro «deshacer» del mismo lote entró antes: el evento es único por lote y tipo.
    if (esDe(err, "importacion_eventos_tipo_unico")) throw new ErrorIndicador(YA_SE_DESHIZO);
    throw err;
  }
}
