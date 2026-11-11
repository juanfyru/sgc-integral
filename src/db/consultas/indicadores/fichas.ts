/**
 * La ficha de indicador en borrador (spec 14 §7.1 a §7.6, Tarea 6 de la 14A): crear el indicador con su versión 1,
 * guardar el borrador, abrir un cambio sobre la ficha aprobada, leer el contenido firmado de una versión y la lista
 * básica. Escribe solo quien tiene `indicadores.administrar`.
 *
 * La versión guarda, además de la referencia a cada catálogo, el nombre que tenía al guardarse (F14-DC40):
 * `contenidoDeVersion` lee solo la versión y sus filas hijas, nunca el catálogo de hoy. Los datos de operación (§7.3)
 * viven en `indicadores` y en `indicador_designados`; aquí se escriben solo mientras el indicador está en borrador.
 *
 * Candados: el indicador y después la versión, `FOR UPDATE`, antes de tocar las filas hijas (los triggers de la 0011
 * leen la versión con `FOR SHARE`). Las filas hijas de un borrador se reemplazan; las de una aprobada, nunca.
 */
import type { TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { enTransaccion, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { filtroAcceso, filtroIndicadores, type SujetoVisibilidad } from "@/lib/alcance";
import { EsquemaFicha, type DatosFicha } from "@/lib/esquemas/indicadores";
import { periodoDe } from "@/lib/indicadores-documentales/periodo";
import { tipoDeCambio, type ContenidoFicha } from "@/lib/indicadores/ficha";
import { analizar } from "@/lib/indicadores/formula/analizar";
import { formulaDeForma } from "@/lib/indicadores/formula/formas";
import { comparar, fraccion } from "@/lib/indicadores/formula/fraccion";
import { clavesDelAnio, periodicidadDe, periodoQueContiene } from "@/lib/indicadores/periodos";
import { errorDeRegla } from "@/lib/indicadores/semaforo";
import {
  ErrorIndicador,
  PERIODICIDADES,
  type DatosOperacion,
  type EstadoIndicador,
  type EstadoVersion,
  type OpcionesFicha,
  type Periodicidad,
} from "@/lib/indicadores/tipos";
import { ErrorPermiso, puede, type SujetoPermiso } from "@/lib/permisos";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { listarMaestro, obtenerParametros } from "./maestros";

type Opciones = { sql?: Cliente; ahora?: Date };

const FICHA_NO_EXISTE = "La ficha no existe";
const INDICADOR_NO_EXISTE = "El indicador no existe";
const SOLO_BORRADOR = "Solo se puede editar una ficha en borrador";

const ADJETIVO: Record<Periodicidad, string> = {
  mensual: "mensual",
  bimestral: "bimestral",
  trimestral: "trimestral",
  semestral: "semestral",
  anual: "anual",
};

function exigirAdministrar(sesion: SujetoPermiso): void {
  if (!puede(sesion, "indicadores.administrar")) throw new ErrorPermiso();
}

const esCodigoRepetido = (err: unknown) =>
  (err as { code?: string }).code === "23505" && (err as { constraint_name?: string }).constraint_name === "indicadores_codigo_unico";

// ─────────────────────────────────────────────────────────────────────────────
// El código
// ─────────────────────────────────────────────────────────────────────────────

/** El siguiente número por proceso: 1 + el más alto ya usado con `SIGLA-IND-`, en cualquier estado (no se reusan). */
function siguientes(sql: Cliente, procesoId?: number) {
  return sql`
    SELECT p.id, p.sigla, coalesce(max(substr(i.codigo, length(p.sigla) + 6)::int), 0) + 1 AS siguiente
    FROM procesos p
    LEFT JOIN indicadores i
      ON lower(left(i.codigo, length(p.sigla) + 5)) = lower(p.sigla || '-IND-')
     AND substr(i.codigo, length(p.sigla) + 6) ~ '^[0-9]{1,6}$'
    ${procesoId === undefined ? sql`` : sql`WHERE p.id = ${procesoId}`}
    GROUP BY p.id, p.sigla`;
}

const codigoCon = (sigla: string, n: number) => `${sigla}-IND-${String(n).padStart(2, "0")}`;

/** `SIGLA-IND-NN`, con dos cifras al menos (spec §7.1). */
export async function proponerCodigo(procesoId: number, opciones?: { sql?: Cliente }): Promise<string> {
  const sql = opciones?.sql ?? obtenerSql();
  const [fila] = await siguientes(sql, procesoId);
  if (!fila) throw new ErrorIndicador("El proceso no existe");
  return codigoCon(fila.sigla as string, Number(fila.siguiente));
}

// ─────────────────────────────────────────────────────────────────────────────
// Validación
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que la ficha guarda del semáforo: solo lo que su tendencia y su modo usan. */
type Semaforo = {
  meta: string | null;
  metaMax: string | null;
  semaforoModo: "relativo" | "fijo" | null;
  umbralAtencionPct: number | null;
  limiteCritico: string | null;
  tolerancia: string | null;
};

/** La ficha que pasó las reglas que no consultan la BD. */
type FichaRevisada = { d: DatosFicha; formula: string; factor: number | null; semaforo: Semaforo };

function leer(d: DatosFicha): DatosFicha {
  const r = EsquemaFicha.safeParse(d);
  if (!r.success) throw new ErrorIndicador(r.error.issues[0].message);
  return r.data;
}

const fr = (v: string | null | undefined) => (v === null || v === undefined ? null : fraccion(v));

/** Fórmula, variables declaradas contra usadas y regla del semáforo. */
function revisar(entrada: DatosFicha): FichaRevisada {
  const d = leer(entrada);
  let formula: string;
  let factor: number | null = null;
  if (d.forma === "libre") {
    if (!d.formula) throw new ErrorIndicador("Escriba la fórmula");
    formula = d.formula;
  } else {
    // El esquema ya dejó el factor entre los de FACTORES_TASA.
    factor = d.forma === "tasa" ? (d.factor ?? 1000) : null;
    formula = formulaDeForma(d.forma, factor ?? undefined);
  }
  const analisis = analizar(formula);
  if (!analisis.ok) throw new ErrorIndicador(analisis.error);

  const declaradas = d.variables.map((v) => v.letra);
  const repetida = declaradas.find((letra, i) => declaradas.indexOf(letra) !== i);
  if (repetida) throw new ErrorIndicador(`La variable ${repetida} está repetida`);
  const sinDeclarar = analisis.variables.find((letra) => !declaradas.includes(letra));
  if (sinDeclarar) throw new ErrorIndicador(`La fórmula usa la variable ${sinDeclarar}, que no está declarada`);
  const sinUsar = declaradas.find((letra) => !analisis.variables.includes(letra));
  if (sinUsar) throw new ErrorIndicador(`La variable ${sinUsar} no se usa en la fórmula`);
  for (const v of d.variables) {
    const [min, max] = [fr(v.capturaMin), fr(v.capturaMax)];
    if (min && max && comparar(min, max) > 0) throw new ErrorIndicador(`El mínimo de captura de ${v.letra} no puede pasar del máximo`);
  }

  const conMeta = d.meta !== undefined;
  const constante = d.tendencia === "constante";
  const modo = conMeta && !constante ? (d.semaforoModo ?? null) : null;
  const semaforo: Semaforo = {
    meta: d.meta ?? null,
    metaMax: conMeta && constante ? (d.metaMax ?? null) : null,
    semaforoModo: modo,
    umbralAtencionPct: modo === "relativo" ? (d.umbralAtencionPct ?? null) : null,
    limiteCritico: modo === "fijo" ? (d.limiteCritico ?? null) : null,
    tolerancia: conMeta && constante ? (d.tolerancia ?? null) : null,
  };
  const error = errorDeRegla({
    tendencia: d.tendencia,
    meta: fr(semaforo.meta),
    metaMax: fr(semaforo.metaMax),
    modo: semaforo.semaforoModo,
    umbralPct: semaforo.umbralAtencionPct,
    limite: fr(semaforo.limiteCritico),
    tolerancia: fr(semaforo.tolerancia),
  });
  if (error) throw new ErrorIndicador(error);
  const [rMin, rMax] = [fr(d.resultadoMin), fr(d.resultadoMax)];
  if (rMin && rMax && comparar(rMin, rMax) > 0) throw new ErrorIndicador("El mínimo del resultado no puede pasar del máximo");
  return { d, formula, factor, semaforo };
}

/** Los datos de operación que se van a escribir (solo con el indicador en borrador): el inicio, de la periodicidad. */
function revisarOperacion(d: DatosFicha): void {
  if (periodicidadDe(d.inicioMedicion) !== d.periodicidad) {
    throw new ErrorIndicador(`El inicio de medición debe ser un periodo ${ADJETIVO[d.periodicidad]}`);
  }
}

/** Las referencias que ya tiene la versión: un elemento que se desactivó después sigue valiendo en ella. */
type Actual = {
  procesoId: number;
  subprocesoId: number | null;
  tipoId: number | null;
  clasificacionId: number | null;
  unidadId: number | null;
  objetivoId: number | null;
  procedimientoDocumentoId: number | null;
  cargoIds: number[];
  normaIds: number[];
};

/** Los nombres firmados, copiados de los catálogos al guardar. */
type Nombres = {
  procesoNombre: string;
  subprocesoNombre: string | null;
  tipoNombre: string;
  clasificacionNombre: string;
  objetivoNombre: string | null;
  unidadNombre: string;
  unidadSufijo: string;
  cargos: Map<number, string>;
  normas: Map<number, string>;
};

async function exigirFila(
  consulta: Promise<readonly Record<string, unknown>[]>,
  vigente: number | null,
  id: number,
  mensaje: string,
): Promise<Record<string, unknown>> {
  const [fila] = await consulta;
  if (!fila || (fila.activo === false && vigente !== id)) throw new ErrorIndicador(mensaje);
  return fila;
}

/**
 * Catálogos, norma exigida, subproceso del proceso, procedimiento, cargos y, si se van a escribir los datos de operación
 * (`conOperacion`), personas designadas activas.
 */
async function revisarContraLaBase(tx: TransactionSql, f: FichaRevisada, actual: Actual | null, conOperacion: boolean): Promise<Nombres> {
  const { d } = f;
  const proceso = await exigirFila(
    tx`SELECT nombre, activo FROM procesos WHERE id = ${d.procesoId} FOR KEY SHARE`,
    actual?.procesoId ?? null,
    d.procesoId,
    "El proceso no existe o está inactivo",
  );
  const tipo = await exigirFila(
    tx`SELECT nombre, activo FROM tipos_indicador WHERE id = ${d.tipoId} FOR KEY SHARE`,
    actual?.tipoId ?? null,
    d.tipoId,
    "El tipo no existe o está inactivo",
  );
  const clasificacion = await exigirFila(
    tx`SELECT nombre, exige_norma, activo FROM clasificaciones_indicador WHERE id = ${d.clasificacionId} FOR KEY SHARE`,
    actual?.clasificacionId ?? null,
    d.clasificacionId,
    "La clasificación no existe o está inactiva",
  );
  const unidad = await exigirFila(
    tx`SELECT nombre, sufijo, activo FROM unidades_indicador WHERE id = ${d.unidadId} FOR KEY SHARE`,
    actual?.unidadId ?? null,
    d.unidadId,
    "La unidad no existe o está inactiva",
  );
  const objetivo =
    d.objetivoId === undefined
      ? null
      : await exigirFila(
          tx`SELECT enunciado, activo FROM objetivos WHERE id = ${d.objetivoId} FOR KEY SHARE`,
          actual?.objetivoId ?? null,
          d.objetivoId,
          "El objetivo que mide no existe o está inactivo",
        );

  const normas = new Map<number, string>();
  if (d.normaIds.length > 0) {
    const filas = await tx`SELECT n.id, concat_ws(' ', tn.nombre, n.numero, 'de', n.anio::text) AS nombre, n.estado
      FROM normas n JOIN tipos_norma tn ON tn.id = n.tipo_norma_id
      WHERE n.id IN ${tx(d.normaIds)} FOR KEY SHARE OF n`;
    if (filas.length !== d.normaIds.length) throw new ErrorIndicador("La norma no existe");
    for (const n of filas) normas.set(Number(n.id), n.nombre as string);
    if (filas.some((n) => n.estado !== "vigente" && n.estado !== "modificada")) {
      throw new ErrorIndicador("Solo se pueden citar normas vigentes o modificadas");
    }
  }
  if (clasificacion.exige_norma === true && d.normaIds.length === 0) {
    throw new ErrorIndicador("Un indicador regulatorio debe citar al menos una norma");
  }

  let subprocesoNombre: string | null = null;
  if (d.subprocesoId !== undefined) {
    const [s] = await tx`SELECT proceso_id, nombre, activo FROM subprocesos WHERE id = ${d.subprocesoId} FOR KEY SHARE`;
    if (!s || Number(s.proceso_id) !== d.procesoId) throw new ErrorIndicador("El subproceso no es del proceso elegido");
    if (!s.activo && actual?.subprocesoId !== d.subprocesoId) throw new ErrorIndicador("El subproceso está inactivo");
    subprocesoNombre = s.nombre as string;
  }

  const mismoProcedimiento = actual !== null && d.procedimientoDocumentoId === actual.procedimientoDocumentoId && d.procesoId === actual.procesoId;
  if (d.procedimientoDocumentoId !== undefined && !mismoProcedimiento) {
    const [doc] = await tx`SELECT 1 FROM documento_proceso dp LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
      WHERE dp.documento_id = ${d.procedimientoDocumentoId} AND coalesce(dp.proceso_id, s.proceso_id) = ${d.procesoId}
      LIMIT 1`;
    if (!doc) throw new ErrorIndicador("El procedimiento debe ser un documento del proceso");
  }

  const cargoIds = [...new Set([...d.cargosMedir, ...d.cargosAnalizar])];
  const cargos = new Map<number, string>();
  const filasCargo = await tx`SELECT id, nombre, activo FROM cargos WHERE id IN ${tx(cargoIds)} FOR KEY SHARE`;
  for (const c of filasCargo) {
    if (c.activo || actual?.cargoIds.includes(Number(c.id))) cargos.set(Number(c.id), c.nombre as string);
  }
  if (cargos.size !== cargoIds.length) throw new ErrorIndicador("Los cargos responsables deben existir y estar activos");

  const personas = conOperacion ? [...new Set([...d.mide, ...d.analiza])] : [];
  if (personas.length > 0) {
    const activas = await tx`SELECT id FROM usuarios WHERE id IN ${tx(personas)} AND activo FOR KEY SHARE`;
    if (activas.length !== personas.length) throw new ErrorIndicador("Las personas designadas deben ser usuarios activos");
  }

  return {
    procesoNombre: proceso.nombre as string,
    subprocesoNombre,
    tipoNombre: tipo.nombre as string,
    clasificacionNombre: clasificacion.nombre as string,
    objetivoNombre: objetivo ? (objetivo.enunciado as string) : null,
    unidadNombre: unidad.nombre as string,
    unidadSufijo: unidad.sufijo as string,
    cargos,
    normas,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Escritura
// ─────────────────────────────────────────────────────────────────────────────

/** Las columnas de contenido de la versión, con sus nombres de la BD (fijos: nunca texto de la persona). */
function columnasDeContenido(tx: TransactionSql, f: FichaRevisada, n: Nombres) {
  const { d, semaforo } = f;
  return {
    nombre: d.nombre,
    proposito: d.proposito,
    requisito: d.requisito ?? null,
    tipo_id: d.tipoId,
    tipo_nombre: n.tipoNombre,
    clasificacion_id: d.clasificacionId,
    clasificacion_nombre: n.clasificacionNombre,
    objetivo_id: d.objetivoId ?? null,
    objetivo_nombre: n.objetivoNombre,
    proceso_nombre: n.procesoNombre,
    subproceso_id: d.subprocesoId ?? null,
    subproceso_nombre: n.subprocesoNombre,
    procedimiento_documento_id: d.procedimientoDocumentoId ?? null,
    punto_control: d.puntoControl ?? null,
    forma: d.forma,
    factor: f.factor,
    formula: f.formula,
    unidad_id: d.unidadId,
    unidad_nombre: n.unidadNombre,
    unidad_sufijo: n.unidadSufijo,
    decimales: d.decimales,
    periodicidad: d.periodicidad,
    tendencia: d.tendencia,
    meta: semaforo.meta,
    meta_max: semaforo.metaMax,
    semaforo_modo: semaforo.semaforoModo,
    umbral_atencion_pct: semaforo.umbralAtencionPct,
    limite_critico: semaforo.limiteCritico,
    tolerancia: semaforo.tolerancia,
    resultado_min: d.resultadoMin ?? null,
    resultado_max: d.resultadoMax ?? null,
    linea_base_valor: d.lineaBaseValor ?? null,
    linea_base_periodo: d.lineaBasePeriodo ?? null,
    linea_base_nota: d.lineaBaseNota ?? null,
    sustento_meta: d.sustentoMeta ?? null,
    ente: d.ente ?? null,
    periodicidad_externa: d.periodicidadExterna ?? null,
    plazo_externo_dias: d.plazoExternoDias ?? null,
    motivo_cambio: d.motivoCambio ?? null,
    prueba: pruebaDe(tx, d),
  };
}

/** Los valores de ejemplo de las variables declaradas; sin todos, no hay prueba. */
function pruebaDe(tx: TransactionSql, d: DatosFicha) {
  const valores = d.prueba?.valores ?? {};
  const letras = d.variables.map((v) => v.letra);
  if (!letras.every((l) => Object.hasOwn(valores, l))) return null;
  return tx.json({ valores: Object.fromEntries(letras.map((l) => [l, valores[l].replace(",", ".")])) });
}

async function escribirHijos(tx: TransactionSql, versionId: number, f: FichaRevisada, n: Nombres): Promise<void> {
  for (const [orden, v] of f.d.variables.entries()) {
    await tx`INSERT INTO indicador_variables
        (version_id, letra, nombre, descripcion, fuente, unidad, consolidacion, origen, captura_min, captura_max, admite_negativos, orden)
      VALUES (${versionId}, ${v.letra}, ${v.nombre}, ${v.descripcion ?? null}, ${v.fuente ?? null}, ${v.unidad ?? null},
        ${v.consolidacion}, 'propia', ${v.capturaMin ?? null}, ${v.capturaMax ?? null}, ${v.admiteNegativos}, ${orden + 1})`;
  }
  for (const [funcion, ids] of [["medir", f.d.cargosMedir], ["analizar", f.d.cargosAnalizar]] as const) {
    for (const cargoId of ids) {
      await tx`INSERT INTO indicador_responsables (version_id, cargo_id, cargo_nombre, funcion)
        VALUES (${versionId}, ${cargoId}, ${n.cargos.get(cargoId)!}, ${funcion})`;
    }
  }
  for (const normaId of f.d.normaIds) {
    await tx`INSERT INTO indicador_normas (version_id, norma_id, norma_nombre) VALUES (${versionId}, ${normaId}, ${n.normas.get(normaId)!})`;
  }
}

async function borrarHijos(tx: TransactionSql, versionId: number): Promise<void> {
  await tx`DELETE FROM indicador_variables WHERE version_id = ${versionId}`;
  await tx`DELETE FROM indicador_responsables WHERE version_id = ${versionId}`;
  await tx`DELETE FROM indicador_normas WHERE version_id = ${versionId}`;
}

/** «mide» y «analiza»; «seguimiento» y los cambios posteriores son de la designación (Tarea 8). */
async function escribirDesignados(tx: TransactionSql, indicadorId: number, d: DatosFicha, usuarioId: number, ahora: Date): Promise<void> {
  await tx`DELETE FROM indicador_designados WHERE indicador_id = ${indicadorId} AND funcion IN ('mide', 'analiza')`;
  for (const [funcion, ids] of [["mide", d.mide], ["analiza", d.analiza]] as const) {
    for (const persona of ids) {
      await tx`INSERT INTO indicador_designados (indicador_id, usuario_id, funcion, creado_por, creado_en)
        VALUES (${indicadorId}, ${persona}, ${funcion}, ${usuarioId}, ${ahora})`;
    }
  }
}

/** Quiénes miden y analizan, por id ascendente: lo que la bitácora guarda con antes y después (spec §7.3). */
type Designados = { mide: number[]; analiza: number[] };

const ascendente = (ids: readonly number[]) => [...ids].sort((a, b) => a - b);

async function designadosDe(tx: TransactionSql, indicadorId: number): Promise<Designados> {
  const filas = await tx`SELECT usuario_id, funcion FROM indicador_designados
    WHERE indicador_id = ${indicadorId} AND funcion IN ('mide', 'analiza')`;
  const de = (funcion: string) => ascendente(filas.filter((x) => x.funcion === funcion).map((x) => Number(x.usuario_id)));
  return { mide: de("mide"), analiza: de("analiza") };
}

const designadosDeFicha = (d: DatosFicha): Designados => ({ mide: ascendente(d.mide), analiza: ascendente(d.analiza) });

const operacionDe = (d: DatosFicha): DatosOperacion => ({
  plazoReporteDias: d.plazoReporteDias,
  inicioMedicion: d.inicioMedicion,
  soporteObligatorio: d.soporteObligatorio,
  nivelAcceso: d.nivelAcceso,
});

/** Crea el indicador en `borrador` y su versión 1 (spec §7.6.1). Sin código, propone el del proceso. */
export async function crearIndicador(
  sesion: SesionFlujo,
  d: DatosFicha,
  opciones?: Opciones,
): Promise<{ indicadorId: number; versionId: number; codigo: string }> {
  exigirAdministrar(sesion);
  const f = revisar(d);
  revisarOperacion(f.d);
  const ahora = opciones?.ahora ?? new Date();
  let codigo = f.d.codigo ?? "";
  try {
    return await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
      const nombres = await revisarContraLaBase(tx, f, null, true);
      codigo = f.d.codigo ?? (await proponerCodigo(f.d.procesoId, { sql: tx }));
      const o = operacionDe(f.d);
      const [i] = await tx`INSERT INTO indicadores
          (codigo, proceso_id, estado, nivel_acceso, plazo_reporte_dias, inicio_medicion, soporte_obligatorio, creado_por, creado_en)
        VALUES (${codigo}, ${f.d.procesoId}, 'borrador', ${o.nivelAcceso}, ${o.plazoReporteDias}, ${o.inicioMedicion},
          ${o.soporteObligatorio}, ${sesion.usuarioId}, ${ahora})
        RETURNING id`;
      const indicadorId = Number(i.id);
      const fila = {
        indicador_id: indicadorId,
        numero: 1,
        estado: "borrador",
        tipo_cambio: "inicial",
        ...columnasDeContenido(tx, f, nombres),
        creado_por: sesion.usuarioId,
        creado_en: ahora,
        actualizado_en: ahora,
      };
      const [v] = await tx`INSERT INTO indicador_versiones ${tx(fila)} RETURNING id`;
      const versionId = Number(v.id);
      await tx`SELECT id FROM indicador_versiones WHERE id = ${versionId} FOR UPDATE`;
      await escribirHijos(tx, versionId, f, nombres);
      await escribirDesignados(tx, indicadorId, f.d, sesion.usuarioId, ahora);
      await registrarAuditoria(tx, {
        usuarioId: sesion.usuarioId,
        accion: "indicador_creado",
        entidad: "indicador",
        entidadId: indicadorId,
        detalle: { codigo, nombre: f.d.nombre, proceso: nombres.procesoNombre, versionId, operacion: o, designados: designadosDeFicha(f.d) },
      });
      return { indicadorId, versionId, codigo };
    });
  } catch (err) {
    if (esCodigoRepetido(err)) throw new ErrorIndicador(`Ya existe un indicador con el código ${codigo}`);
    throw err;
  }
}

/** La versión aprobada más reciente del indicador: la ficha vigente (spec §7.6.5). */
async function idVigente(sql: Cliente, indicadorId: number): Promise<number | null> {
  const [v] = await sql`SELECT id FROM indicador_versiones WHERE indicador_id = ${indicadorId} AND estado = 'aprobada'
    ORDER BY numero DESC LIMIT 1`;
  return v ? Number(v.id) : null;
}

/**
 * Reemplaza el contenido de un borrador. Mientras el indicador está en borrador, también sus datos de operación y sus
 * designados; en el cambio de una ficha aprobada, esos campos no se leen ni se validan (se cambian en «Datos de
 * operación», Tarea 8).
 */
export async function guardarBorrador(sesion: SesionFlujo, versionId: number, d: DatosFicha, opciones?: Opciones): Promise<void> {
  exigirAdministrar(sesion);
  const f = revisar(d);
  const ahora = opciones?.ahora ?? new Date();
  let codigo = f.d.codigo ?? "";
  try {
    await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
      const [ref] = await tx`SELECT indicador_id FROM indicador_versiones WHERE id = ${versionId}`;
      if (!ref) throw new ErrorIndicador(FICHA_NO_EXISTE);
      const [ind] = await tx`SELECT id, codigo, proceso_id, estado, nivel_acceso, plazo_reporte_dias, inicio_medicion, soporte_obligatorio
        FROM indicadores WHERE id = ${ref.indicador_id} FOR UPDATE`;
      const [v] = await tx`SELECT id, indicador_id, numero, estado, subproceso_id, tipo_id, clasificacion_id, unidad_id, objetivo_id,
          procedimiento_documento_id
        FROM indicador_versiones WHERE id = ${versionId} FOR UPDATE`;
      if (!v || Number(v.indicador_id) !== Number(ind.id)) throw new ErrorIndicador(FICHA_NO_EXISTE);
      if (v.estado !== "borrador") throw new ErrorIndicador(SOLO_BORRADOR);
      const indicadorId = Number(ind.id);
      const enBorrador = ind.estado === "borrador";
      if (!enBorrador) {
        // F14-DC18 y DC40: el subproceso sí cambia (cambio menor); el proceso y el código, no.
        if (f.d.procesoId !== Number(ind.proceso_id) || (f.d.codigo !== undefined && f.d.codigo !== ind.codigo)) {
          throw new ErrorIndicador("El proceso y el código quedan fijos desde la primera aprobación");
        }
      } else {
        revisarOperacion(f.d);
      }
      const cargosActuales = await tx`SELECT DISTINCT cargo_id FROM indicador_responsables WHERE version_id = ${versionId}`;
      const normasActuales = await tx`SELECT norma_id FROM indicador_normas WHERE version_id = ${versionId}`;
      const nombres = await revisarContraLaBase(tx, f, {
        procesoId: Number(ind.proceso_id),
        subprocesoId: v.subproceso_id === null ? null : Number(v.subproceso_id),
        tipoId: v.tipo_id === null ? null : Number(v.tipo_id),
        clasificacionId: v.clasificacion_id === null ? null : Number(v.clasificacion_id),
        unidadId: v.unidad_id === null ? null : Number(v.unidad_id),
        objetivoId: v.objetivo_id === null ? null : Number(v.objetivo_id),
        procedimientoDocumentoId: v.procedimiento_documento_id === null ? null : Number(v.procedimiento_documento_id),
        cargoIds: cargosActuales.map((c) => Number(c.cargo_id)),
        normaIds: normasActuales.map((n) => Number(n.norma_id)),
      }, enBorrador);

      codigo = ind.codigo as string;
      let operacion: { antes: DatosOperacion; despues: DatosOperacion } | null = null;
      let designados: { antes: Designados; despues: Designados } | null = null;
      if (enBorrador) {
        const mismoProceso = f.d.procesoId === Number(ind.proceso_id);
        // La sigla del proceso decide el código (spec §7.1): al mudarse de proceso, un código con la del anterior se propone de nuevo.
        let elegido = f.d.codigo;
        if (!mismoProceso && elegido !== undefined) {
          const [anterior] = await tx`SELECT sigla FROM procesos WHERE id = ${ind.proceso_id}`;
          if (elegido.toLowerCase().startsWith(`${anterior.sigla as string}-IND-`.toLowerCase())) elegido = undefined;
        }
        codigo = elegido ?? (mismoProceso ? codigo : await proponerCodigo(f.d.procesoId, { sql: tx }));
        const antes: DatosOperacion = {
          plazoReporteDias: ind.plazo_reporte_dias as number,
          inicioMedicion: ind.inicio_medicion as string,
          soporteObligatorio: ind.soporte_obligatorio as boolean,
          nivelAcceso: ind.nivel_acceso as DatosOperacion["nivelAcceso"],
        };
        const despues = operacionDe(f.d);
        await tx`UPDATE indicadores SET codigo = ${codigo}, proceso_id = ${f.d.procesoId}, nivel_acceso = ${despues.nivelAcceso},
            plazo_reporte_dias = ${despues.plazoReporteDias}, inicio_medicion = ${despues.inicioMedicion},
            soporte_obligatorio = ${despues.soporteObligatorio}
          WHERE id = ${indicadorId}`;
        const designadosAntes = await designadosDe(tx, indicadorId);
        await escribirDesignados(tx, indicadorId, f.d, sesion.usuarioId, ahora);
        if (JSON.stringify(antes) !== JSON.stringify(despues)) operacion = { antes, despues };
        const designadosDespues = designadosDeFicha(f.d);
        if (JSON.stringify(designadosAntes) !== JSON.stringify(designadosDespues)) designados = { antes: designadosAntes, despues: designadosDespues };
      }

      await tx`UPDATE indicador_versiones SET ${tx({ ...columnasDeContenido(tx, f, nombres), actualizado_en: ahora })} WHERE id = ${versionId}`;
      await borrarHijos(tx, versionId);
      await escribirHijos(tx, versionId, f, nombres);

      // Un cambio sobre una ficha aprobada es mayor o menor según lo que cambió (spec §7.2); lo decide el sistema.
      const vigente = await idVigente(tx, indicadorId);
      if (vigente !== null) {
        const tipo = tipoDeCambio(await contenidoDeVersion(tx, vigente), await contenidoDeVersion(tx, versionId));
        await tx`UPDATE indicador_versiones SET tipo_cambio = ${tipo === "mayor" ? "mayor" : "menor"} WHERE id = ${versionId}`;
      }

      await registrarAuditoria(tx, {
        usuarioId: sesion.usuarioId,
        accion: "indicador_borrador_guardado",
        entidad: "indicador",
        entidadId: indicadorId,
        detalle: {
          codigo,
          nombre: f.d.nombre,
          versionId,
          numero: v.numero as number,
          ...(operacion ? { operacion } : {}),
          ...(designados ? { designados } : {}),
        },
      });
    });
  } catch (err) {
    if (esCodigoRepetido(err)) throw new ErrorIndicador(`Ya existe un indicador con el código ${codigo}`);
    throw err;
  }
}

/** Las columnas de contenido que un cambio copia de la versión vigente. Identificadores fijos. */
const CONTENIDO = [
  "nombre", "proposito", "requisito", "tipo_id", "tipo_nombre", "clasificacion_id", "clasificacion_nombre", "objetivo_id",
  "objetivo_nombre", "proceso_nombre", "subproceso_id", "subproceso_nombre", "procedimiento_documento_id", "punto_control",
  "origen_dato", "calculo", "calculo_alcance", "forma", "factor", "formula", "unidad_id", "unidad_nombre", "unidad_sufijo",
  "decimales", "periodicidad", "tendencia", "meta", "meta_max", "semaforo_modo", "umbral_atencion_pct", "limite_critico",
  "tolerancia", "resultado_min", "resultado_max", "linea_base_valor", "linea_base_periodo", "linea_base_nota", "sustento_meta",
  "ente", "periodicidad_externa", "plazo_externo_dias", "dimension_id", "prueba",
].join(", ");

const COLUMNAS_VARIABLE = [
  "letra", "nombre", "descripcion", "fuente", "unidad", "consolidacion", "origen", "variable_compartida_id",
  "indicador_origen_id", "toma", "captura_min", "captura_max", "admite_negativos", "orden",
].join(", ");

/**
 * «Editar ficha» sobre una ficha aprobada (spec §7.6.5): un borrador con el contenido vigente y el número siguiente.
 * Si ya hay un borrador o una versión por aprobar, la devuelve: un indicador tiene a lo sumo una a la vez.
 */
export async function abrirCambio(sesion: SesionFlujo, indicadorId: number, opciones?: Opciones): Promise<{ versionId: number }> {
  exigirAdministrar(sesion);
  const ahora = opciones?.ahora ?? new Date();
  return enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    const [ind] = await tx`SELECT id, codigo, estado FROM indicadores WHERE id = ${indicadorId} FOR UPDATE`;
    if (!ind) throw new ErrorIndicador(INDICADOR_NO_EXISTE);
    const [abierta] = await tx`SELECT id FROM indicador_versiones
      WHERE indicador_id = ${indicadorId} AND estado IN ('borrador', 'por_aprobar')`;
    if (abierta) return { versionId: Number(abierta.id) };
    if (ind.estado === "retirado") throw new ErrorIndicador("Un indicador retirado no admite cambios en su ficha");
    const vigente = ind.estado === "activo" ? await idVigente(tx, indicadorId) : null;
    if (vigente === null) throw new ErrorIndicador("La ficha aún no tiene una versión aprobada");

    const [{ numero }] = await tx`SELECT coalesce(max(numero), 0) + 1 AS numero FROM indicador_versiones WHERE indicador_id = ${indicadorId}`;
    // `tipo_cambio` es obligatorio: nace «menor» (la copia no cambia nada) y `guardarBorrador` lo vuelve a decidir.
    const [nueva] = await tx.unsafe(
      `INSERT INTO indicador_versiones (indicador_id, numero, estado, tipo_cambio, creado_por, creado_en, actualizado_en, ${CONTENIDO})
       SELECT indicador_id, $2, 'borrador', 'menor', $3, $4, $4, ${CONTENIDO} FROM indicador_versiones WHERE id = $1
       RETURNING id`,
      [vigente, numero, sesion.usuarioId, ahora],
    );
    const versionId = Number(nueva.id);
    await tx`SELECT id FROM indicador_versiones WHERE id = ${versionId} FOR UPDATE`;
    await tx.unsafe(
      `INSERT INTO indicador_variables (version_id, ${COLUMNAS_VARIABLE})
       SELECT $2, ${COLUMNAS_VARIABLE} FROM indicador_variables WHERE version_id = $1 ORDER BY orden, letra`,
      [vigente, versionId],
    );
    await tx`INSERT INTO indicador_responsables (version_id, cargo_id, cargo_nombre, funcion)
      SELECT ${versionId}, cargo_id, cargo_nombre, funcion FROM indicador_responsables WHERE version_id = ${vigente} ORDER BY id`;
    await tx`INSERT INTO indicador_normas (version_id, norma_id, norma_nombre)
      SELECT ${versionId}, norma_id, norma_nombre FROM indicador_normas WHERE version_id = ${vigente} ORDER BY id`;
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "indicador_cambio_abierto",
      entidad: "indicador",
      entidadId: indicadorId,
      detalle: { codigo: ind.codigo as string, versionId, numero: Number(numero), desde: vigente },
    });
    return { versionId };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Lectura
// ─────────────────────────────────────────────────────────────────────────────

const numeroONulo = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** El contenido firmado de una versión (spec §7.2): solo sus columnas y sus filas hijas, nunca el catálogo de hoy. */
export async function contenidoDeVersion(sql: Cliente, versionId: number): Promise<ContenidoFicha> {
  const [v] = await sql`SELECT * FROM indicador_versiones WHERE id = ${versionId}`;
  if (!v) throw new ErrorIndicador(FICHA_NO_EXISTE);
  const variables = await sql`SELECT letra, nombre, descripcion, fuente, unidad, consolidacion, origen, variable_compartida_id,
      indicador_origen_id, toma, captura_min, captura_max, admite_negativos
    FROM indicador_variables WHERE version_id = ${versionId} ORDER BY orden, letra`;
  const responsables = await sql`SELECT cargo_nombre, funcion FROM indicador_responsables WHERE version_id = ${versionId} ORDER BY id`;
  const normas = await sql`SELECT norma_nombre FROM indicador_normas WHERE version_id = ${versionId} ORDER BY id`;
  return {
    nombre: v.nombre,
    proposito: v.proposito,
    requisito: v.requisito,
    tipoNombre: v.tipo_nombre,
    clasificacionId: numeroONulo(v.clasificacion_id),
    clasificacionNombre: v.clasificacion_nombre,
    objetivoNombre: v.objetivo_nombre,
    procesoNombre: v.proceso_nombre,
    subprocesoNombre: v.subproceso_nombre,
    procedimientoDocumentoId: numeroONulo(v.procedimiento_documento_id),
    puntoControl: v.punto_control,
    origenDato: v.origen_dato,
    calculo: v.calculo,
    calculoAlcance: v.calculo_alcance,
    forma: v.forma,
    factor: v.factor,
    formula: v.formula,
    unidadId: numeroONulo(v.unidad_id),
    unidadNombre: v.unidad_nombre,
    unidadSufijo: v.unidad_sufijo,
    decimales: v.decimales,
    periodicidad: v.periodicidad,
    tendencia: v.tendencia,
    meta: v.meta,
    metaMax: v.meta_max,
    semaforoModo: v.semaforo_modo,
    umbralAtencionPct: v.umbral_atencion_pct,
    limiteCritico: v.limite_critico,
    tolerancia: v.tolerancia,
    resultadoMin: v.resultado_min,
    resultadoMax: v.resultado_max,
    lineaBaseValor: v.linea_base_valor,
    lineaBasePeriodo: v.linea_base_periodo,
    lineaBaseNota: v.linea_base_nota,
    sustentoMeta: v.sustento_meta,
    ente: v.ente,
    periodicidadExterna: v.periodicidad_externa,
    plazoExternoDias: v.plazo_externo_dias,
    dimensionId: numeroONulo(v.dimension_id),
    variables: variables.map((x) => ({
      letra: x.letra,
      nombre: x.nombre,
      descripcion: x.descripcion,
      fuente: x.fuente,
      unidad: x.unidad,
      consolidacion: x.consolidacion,
      origen: x.origen,
      variableCompartidaId: numeroONulo(x.variable_compartida_id),
      indicadorOrigenId: numeroONulo(x.indicador_origen_id),
      toma: x.toma,
      capturaMin: x.captura_min,
      capturaMax: x.captura_max,
      admiteNegativos: x.admite_negativos,
    })),
    responsables: responsables.map((r) => ({ cargoNombre: r.cargo_nombre, funcion: r.funcion })),
    normas: normas.map((n) => ({ normaNombre: n.norma_nombre })),
  };
}

/** Un indicador por su código, sin distinguir mayúsculas; la visibilidad la decide quien llama (`puedeVerIndicador`). */
export async function indicadorPorCodigo(
  codigo: string,
  opciones?: { sql?: Cliente },
): Promise<{ id: number; codigo: string; estado: EstadoIndicador } | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const [i] = await sql`SELECT id, codigo, estado FROM indicadores WHERE lower(codigo) = lower(${codigo})`;
  return i ? { id: Number(i.id), codigo: i.codigo as string, estado: i.estado as EstadoIndicador } : null;
}

/** Lo que el formulario necesita para volver a pintar una versión: las referencias por id y los datos de operación. */
async function valoresDeVersion(sql: Cliente, versionId: number, indicador: Record<string, unknown>): Promise<Partial<DatosFicha>> {
  const [v] = await sql`SELECT * FROM indicador_versiones WHERE id = ${versionId}`;
  const variables = await sql`SELECT letra, nombre, descripcion, fuente, unidad, consolidacion, captura_min, captura_max, admite_negativos
    FROM indicador_variables WHERE version_id = ${versionId} ORDER BY orden, letra`;
  const responsables = await sql`SELECT cargo_id, funcion FROM indicador_responsables WHERE version_id = ${versionId} ORDER BY id`;
  const normas = await sql`SELECT norma_id FROM indicador_normas WHERE version_id = ${versionId} ORDER BY id`;
  const designados = await sql`SELECT usuario_id, funcion FROM indicador_designados
    WHERE indicador_id = ${indicador.id as number} AND funcion IN ('mide', 'analiza') ORDER BY id`;
  const texto = (x: unknown) => (x === null || x === undefined ? undefined : String(x));
  const entero = (x: unknown) => (x === null || x === undefined ? undefined : Number(x));
  const deFuncion = <T extends Record<string, unknown>>(filas: readonly T[], funcion: string, columna: keyof T) =>
    filas.filter((f) => f.funcion === funcion).map((f) => Number(f[columna]));
  return {
    procesoId: Number(indicador.proceso_id),
    subprocesoId: entero(v.subproceso_id),
    codigo: indicador.codigo as string,
    nombre: texto(v.nombre),
    proposito: texto(v.proposito),
    requisito: texto(v.requisito),
    tipoId: entero(v.tipo_id),
    clasificacionId: entero(v.clasificacion_id),
    objetivoId: entero(v.objetivo_id),
    procedimientoDocumentoId: entero(v.procedimiento_documento_id),
    puntoControl: texto(v.punto_control),
    forma: v.forma ?? undefined,
    factor: entero(v.factor),
    formula: v.forma === "libre" ? texto(v.formula) : undefined,
    variables: variables.map((x) => ({
      letra: x.letra as string,
      nombre: (x.nombre as string | null) ?? "",
      descripcion: texto(x.descripcion),
      fuente: texto(x.fuente),
      unidad: texto(x.unidad),
      consolidacion: x.consolidacion,
      capturaMin: texto(x.captura_min),
      capturaMax: texto(x.captura_max),
      admiteNegativos: x.admite_negativos as boolean,
    })),
    unidadId: entero(v.unidad_id),
    decimales: entero(v.decimales),
    periodicidad: v.periodicidad ?? undefined,
    tendencia: v.tendencia ?? undefined,
    meta: texto(v.meta),
    metaMax: texto(v.meta_max),
    semaforoModo: v.semaforo_modo ?? undefined,
    umbralAtencionPct: entero(v.umbral_atencion_pct),
    limiteCritico: texto(v.limite_critico),
    tolerancia: texto(v.tolerancia),
    resultadoMin: texto(v.resultado_min),
    resultadoMax: texto(v.resultado_max),
    lineaBaseValor: texto(v.linea_base_valor),
    lineaBasePeriodo: texto(v.linea_base_periodo),
    lineaBaseNota: texto(v.linea_base_nota),
    sustentoMeta: texto(v.sustento_meta),
    cargosMedir: deFuncion(responsables, "medir", "cargo_id"),
    cargosAnalizar: deFuncion(responsables, "analizar", "cargo_id"),
    normaIds: normas.map((n) => Number(n.norma_id)),
    ente: texto(v.ente),
    periodicidadExterna: v.periodicidad_externa ?? undefined,
    plazoExternoDias: entero(v.plazo_externo_dias),
    motivoCambio: texto(v.motivo_cambio),
    prueba: v.prueba ?? undefined,
    plazoReporteDias: Number(indicador.plazo_reporte_dias),
    inicioMedicion: texto(indicador.inicio_medicion),
    soporteObligatorio: indicador.soporte_obligatorio as boolean,
    nivelAcceso: indicador.nivel_acceso as DatosOperacion["nivelAcceso"],
    mide: deFuncion(designados, "mide", "usuario_id"),
    analiza: deFuncion(designados, "analiza", "usuario_id"),
  };
}

export type FichaParaEditar = {
  indicadorId: number;
  /** La versión en curso (borrador o por aprobar) o, sin ella, la vigente. */
  versionId: number;
  estado: EstadoVersion;
  numero: number;
  actualizadoEn: Date;
  contenido: ContenidoFicha;
  operacion: DatosOperacion;
  /** La ficha aprobada más reciente; `null` si aún no tiene. */
  vigente: ContenidoFicha | null;
  /** Lo mismo que `contenido`, con las referencias por id: lo que el formulario vuelve a pintar. */
  valores: Partial<DatosFicha>;
};

/** Para quien administra: la versión que se edita del indicador, la vigente y sus datos de operación. */
export async function fichaParaEditar(sesion: SujetoVisibilidad, codigo: string, opciones?: { sql?: Cliente }): Promise<FichaParaEditar | null> {
  if (!puede(sesion, "indicadores.administrar")) return null;
  const sql = opciones?.sql ?? obtenerSql();
  const [i] = await sql`SELECT id, codigo, proceso_id, nivel_acceso, plazo_reporte_dias, inicio_medicion, soporte_obligatorio
    FROM indicadores WHERE lower(codigo) = lower(${codigo})`;
  if (!i) return null;
  const versiones = await sql`SELECT id, numero, estado, actualizado_en FROM indicador_versiones
    WHERE indicador_id = ${i.id} ORDER BY numero DESC`;
  const trabajo =
    versiones.find((v) => v.estado === "borrador" || v.estado === "por_aprobar") ??
    versiones.find((v) => v.estado === "aprobada") ??
    versiones[0];
  if (!trabajo) return null;
  const versionId = Number(trabajo.id);
  const vigenteId = await idVigente(sql, Number(i.id));
  const contenido = await contenidoDeVersion(sql, versionId);
  return {
    indicadorId: Number(i.id),
    versionId,
    estado: trabajo.estado as EstadoVersion,
    numero: trabajo.numero as number,
    actualizadoEn: trabajo.actualizado_en as Date,
    contenido,
    operacion: {
      plazoReporteDias: i.plazo_reporte_dias as number,
      inicioMedicion: i.inicio_medicion as string,
      soporteObligatorio: i.soporte_obligatorio as boolean,
      nivelAcceso: i.nivel_acceso as DatosOperacion["nivelAcceso"],
    },
    vigente: vigenteId === null ? null : vigenteId === versionId ? contenido : await contenidoDeVersion(sql, vigenteId),
    valores: await valoresDeVersion(sql, versionId, i),
  };
}

export type FilaIndicadorBasica = {
  id: number;
  codigo: string;
  nombre: string;
  proceso: string;
  estado: EstadoIndicador;
  versionEstado: EstadoVersion;
};

/**
 * Los indicadores que la persona ve (`filtroIndicadores`), con el nombre de la ficha aprobada. Quien administra ve
 * además los borradores, y el estado de la versión más reciente (un cambio en curso); a los demás, un cambio sin aprobar
 * no se les asoma. La Tarea 15 la reemplaza por la lista completa.
 */
export async function listarIndicadoresBasico(sesion: SujetoVisibilidad, opciones?: { sql?: Cliente }): Promise<FilaIndicadorBasica[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const administra = puede(sesion, "indicadores.administrar");
  const filas = await sql`
    SELECT i.id, i.codigo, i.estado, p.nombre AS proceso,
      ${administra ? sql`coalesce(va.nombre, vu.nombre)` : sql`va.nombre`} AS nombre,
      ${administra ? sql`coalesce(vu.estado, va.estado)` : sql`va.estado`} AS version_estado
    FROM indicadores i
    JOIN procesos p ON p.id = i.proceso_id
    LEFT JOIN LATERAL (
      SELECT nombre, estado FROM indicador_versiones
      WHERE indicador_id = i.id AND estado = 'aprobada' ORDER BY numero DESC LIMIT 1
    ) va ON true
    LEFT JOIN LATERAL (
      SELECT nombre, estado FROM indicador_versiones
      WHERE indicador_id = i.id ORDER BY numero DESC LIMIT 1
    ) vu ON ${administra}
    WHERE ${filtroIndicadores(sql, sesion)}
    ORDER BY i.codigo`;
  return filas.map((f) => ({
    id: Number(f.id),
    codigo: f.codigo as string,
    nombre: (f.nombre as string | null) ?? "",
    proceso: f.proceso as string,
    estado: f.estado as EstadoIndicador,
    versionEstado: f.version_estado as EstadoVersion,
  }));
}

/** «noviembre de 2026» → «Noviembre de 2026». */
const conMayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * Lo que el formulario ofrece: los catálogos activos (y, al editar, los que la versión ya usa aunque ya no lo estén), el
 * código propuesto en cada proceso, los parámetros, los periodos que se pueden elegir como inicio de medición y los entes
 * ya usados (spec §17.1). Solo para quien administra: lleva el nombre y el cargo de cada persona.
 */
export async function opcionesDeFicha(
  sesion: SujetoVisibilidad,
  opciones?: { sql?: Cliente; ahora?: Date; actuales?: Partial<DatosFicha> },
): Promise<OpcionesFicha> {
  exigirAdministrar(sesion);
  const sql = opciones?.sql ?? obtenerSql();
  const a = opciones?.actuales ?? {};
  const zona = zonaHoraria();
  const ahora = opciones?.ahora ?? new Date();
  const ids = (...xs: (number | number[] | undefined)[]) => xs.flat().filter((x): x is number => typeof x === "number");
  const [procesos, subprocesos, propuestos, tipos, clasificaciones, unidades, objetivos, cargos, normas, usuarios, documentos, parametros, entes] =
    await Promise.all([
      sql`SELECT id, sigla, nombre FROM procesos WHERE activo OR id = ANY(${ids(a.procesoId)}) ORDER BY nombre`,
      sql`SELECT id, proceso_id, nombre FROM subprocesos WHERE activo OR id = ANY(${ids(a.subprocesoId)}) ORDER BY proceso_id, orden, nombre`,
      siguientes(sql),
      listarMaestro("tipos", { sql }),
      listarMaestro("clasificaciones", { sql }),
      listarMaestro("unidades", { sql }),
      listarMaestro("objetivos", { sql }),
      sql`SELECT id, nombre FROM cargos WHERE activo OR id = ANY(${ids(a.cargosMedir, a.cargosAnalizar)}) ORDER BY nombre`,
      sql`SELECT n.id, concat_ws(' ', tn.nombre, n.numero, 'de', n.anio::text) AS nombre, n.estado
        FROM normas n JOIN tipos_norma tn ON tn.id = n.tipo_norma_id
        WHERE n.estado IN ('vigente', 'modificada') OR n.id = ANY(${ids(a.normaIds)})
        ORDER BY n.anio DESC, tn.orden, n.numero, n.id`,
      sql`SELECT id, nombre, cargo_id FROM usuarios WHERE activo OR id = ANY(${ids(a.mide, a.analiza)}) ORDER BY nombre`,
      sql`SELECT d.id, d.codigo, d.titulo, array_agg(DISTINCT coalesce(dp.proceso_id, s.proceso_id))::int[] AS procesos
        FROM documentos d
        JOIN documento_proceso dp ON dp.documento_id = d.id
        LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
        WHERE (EXISTS (SELECT 1 FROM documento_versiones dv WHERE dv.documento_id = d.id AND dv.estado = 'vigente')
               OR d.id = ANY(${ids(a.procedimientoDocumentoId)}))
          AND ${filtroAcceso(sql, sesion)}
        GROUP BY d.id ORDER BY d.codigo`,
      obtenerParametros({ sql }),
      sql`SELECT DISTINCT btrim(ente) AS ente FROM indicador_versiones WHERE btrim(coalesce(ente, '')) <> '' ORDER BY 1`,
    ]);
  const activo = (actual: number | undefined) => (f: { id: number; activo: boolean }) => f.activo || f.id === actual;
  const anio = Number(fechaEnZona(ahora, zona).slice(0, 4));
  const periodos = {} as OpcionesFicha["periodos"];
  const periodoEnCurso = {} as OpcionesFicha["periodoEnCurso"];
  for (const p of PERIODICIDADES) {
    const claves = [...clavesDelAnio(p, anio - 1), ...clavesDelAnio(p, anio)];
    if (a.inicioMedicion && periodicidadDe(a.inicioMedicion) === p && !claves.includes(a.inicioMedicion)) claves.unshift(a.inicioMedicion);
    periodos[p] = claves.map((clave) => ({ clave, etiqueta: conMayuscula(periodoDe(clave, zona)?.etiqueta ?? clave) }));
    periodoEnCurso[p] = periodoQueContiene(p, ahora, zona).clave;
  }
  return {
    procesos: procesos.map((p) => ({ id: Number(p.id), sigla: p.sigla as string, nombre: p.nombre as string })),
    subprocesos: subprocesos.map((s) => ({ id: Number(s.id), procesoId: Number(s.proceso_id), nombre: s.nombre as string })),
    codigosPropuestos: Object.fromEntries(propuestos.map((p) => [Number(p.id), codigoCon(p.sigla as string, Number(p.siguiente))])),
    tipos: tipos.filter(activo(a.tipoId)).map((t) => ({ id: t.id, nombre: t.nombre })),
    clasificaciones: clasificaciones
      .filter(activo(a.clasificacionId))
      .map((c) => ({ id: c.id, nombre: c.nombre, exigeNorma: c.exigeNorma === true })),
    unidades: unidades.filter(activo(a.unidadId)).map((u) => ({ id: u.id, nombre: u.nombre, sufijo: u.sufijo ?? "", decimales: u.decimales ?? 0 })),
    objetivos: objetivos.filter(activo(a.objetivoId)).map((o) => ({ id: o.id, nombre: o.nombre })),
    cargos: cargos.map((c) => ({ id: Number(c.id), nombre: c.nombre as string })),
    normas: normas.map((n) => ({ id: Number(n.id), nombre: n.nombre as string, estado: n.estado as string })),
    usuarios: usuarios.map((u) => ({ id: Number(u.id), nombre: u.nombre as string, cargoId: numeroONulo(u.cargo_id) })),
    usuarioActual: usuarios.some((u) => Number(u.id) === sesion.usuarioId) ? sesion.usuarioId : null,
    documentos: documentos.map((d) => ({
      id: Number(d.id),
      codigo: d.codigo as string,
      titulo: d.titulo as string,
      procesoIds: (d.procesos as (number | null)[]).filter((x): x is number => x !== null),
    })),
    entes: entes.map((e) => e.ente as string),
    umbralAtencionPct: parametros.umbralAtencionPct,
    plazoReporteDias: parametros.plazoReporteDias,
    anio,
    periodos,
    periodoEnCurso,
  };
}
