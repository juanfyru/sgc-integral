/**
 * Los cuatro maestros de la ficha de indicador (tipos, clasificaciones, unidades y objetivos; spec 14 §12.6 y §16) y los
 * cinco parámetros de `configuracion` (§12.6). Los administra quien tiene `indicadores.administrar`. Un elemento que
 * alguna versión usa no se borra: se desactiva y deja de ofrecerse.
 */
import type { TransactionSql } from "postgres";
import type { z } from "zod";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { enTransaccion, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { ErrorIndicador } from "@/lib/indicadores/tipos";
import {
  EsquemaParametrosIndicadores,
  ESQUEMAS_MAESTRO,
} from "@/lib/esquemas/indicadores-maestros";
import { ErrorPermiso, puede } from "@/lib/permisos";

type Opciones = { sql?: Cliente };

export type Maestro = "tipos" | "clasificaciones" | "unidades" | "objetivos";
export const MAESTROS: readonly Maestro[] = ["tipos", "clasificaciones", "unidades", "objetivos"];

export type Aprueba = "gerencia" | "lider";
export type ClaseObjetivo = "calidad" | "institucional";

/** Lo que se envía para crear (sin `id`) o editar (con `id`) un elemento; cada maestro con su forma. */
export type DatosMaestro =
  | { id?: number; nombre: string }
  | { id?: number; nombre: string; aprueba: Aprueba; exigeNorma: boolean }
  | { id?: number; nombre: string; sufijo: string; decimales: number }
  | { id?: number; clase: ClaseObjetivo; enunciado: string };

export type FilaMaestro = {
  id: number;
  /** En los objetivos, su enunciado. */
  nombre: string;
  orden: number;
  activo: boolean;
  /** Versiones de ficha que lo usan. */
  usos: number;
  aprueba?: Aprueba;
  exigeNorma?: boolean;
  sufijo?: string;
  decimales?: number;
  clase?: ClaseObjetivo;
  enunciado?: string;
};

/** Nombres de tabla y de columna fijos: nunca texto de la persona en un identificador. */
const TABLA: Record<Maestro, { tabla: string; columnaUso: string; etiqueta: string; articulo: string }> = {
  tipos: { tabla: "tipos_indicador", columnaUso: "tipo_id", etiqueta: "tipo", articulo: "el" },
  clasificaciones: { tabla: "clasificaciones_indicador", columnaUso: "clasificacion_id", etiqueta: "clasificación", articulo: "la" },
  unidades: { tabla: "unidades_indicador", columnaUso: "unidad_id", etiqueta: "unidad", articulo: "la" },
  objetivos: { tabla: "objetivos", columnaUso: "objetivo_id", etiqueta: "objetivo", articulo: "el" },
};

function exigirAdministrar(sesion: SesionFlujo): void {
  if (!puede(sesion, "indicadores.administrar")) throw new ErrorPermiso();
}

function exigirMaestro(m: Maestro): void {
  if (!Object.hasOwn(TABLA, m)) throw new ErrorIndicador("El maestro no existe");
}

function validar<T extends z.ZodType>(esquema: T, datos: unknown): z.infer<T> {
  const r = esquema.safeParse(datos);
  if (!r.success) throw new ErrorIndicador(r.error.issues[0].message);
  return r.data;
}

const ORDEN = {
  tipos: (sql: Cliente, solo: boolean) => sql`
    SELECT x.id, x.nombre, x.orden, x.activo,
      (SELECT count(*) FROM indicador_versiones v WHERE v.tipo_id = x.id)::int AS usos
    FROM tipos_indicador x ${solo ? sql`WHERE x.activo` : sql``} ORDER BY x.orden, x.id`,
  clasificaciones: (sql: Cliente, solo: boolean) => sql`
    SELECT x.id, x.nombre, x.orden, x.activo, x.aprueba, x.exige_norma,
      (SELECT count(*) FROM indicador_versiones v WHERE v.clasificacion_id = x.id)::int AS usos
    FROM clasificaciones_indicador x ${solo ? sql`WHERE x.activo` : sql``} ORDER BY x.orden, x.id`,
  unidades: (sql: Cliente, solo: boolean) => sql`
    SELECT x.id, x.nombre, x.orden, x.activo, x.sufijo, x.decimales,
      (SELECT count(*) FROM indicador_versiones v WHERE v.unidad_id = x.id)::int AS usos
    FROM unidades_indicador x ${solo ? sql`WHERE x.activo` : sql``} ORDER BY x.orden, x.id`,
  objetivos: (sql: Cliente, solo: boolean) => sql`
    SELECT x.id, x.enunciado AS nombre, x.enunciado, x.clase, x.orden, x.activo,
      (SELECT count(*) FROM indicador_versiones v WHERE v.objetivo_id = x.id)::int AS usos
    FROM objetivos x ${solo ? sql`WHERE x.activo` : sql``} ORDER BY x.orden, x.id`,
};

/** En el orden del maestro; `usos` cuenta las versiones de ficha que lo citan. */
export async function listarMaestro(
  m: Maestro,
  opciones?: Opciones & { soloActivos?: boolean },
): Promise<FilaMaestro[]> {
  exigirMaestro(m);
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await ORDEN[m](sql, opciones?.soloActivos === true);
  return filas.map((f) => {
    const fila: FilaMaestro = { id: Number(f.id), nombre: f.nombre, orden: f.orden, activo: f.activo, usos: f.usos };
    if (m === "clasificaciones") Object.assign(fila, { aprueba: f.aprueba, exigeNorma: f.exige_norma });
    if (m === "unidades") Object.assign(fila, { sufijo: f.sufijo, decimales: f.decimales });
    if (m === "objetivos") Object.assign(fila, { clase: f.clase, enunciado: f.enunciado });
    return fila;
  });
}

/** Todas las que cambian un maestro toman el mismo candado: el orden se calcula sobre una sola vista. */
const bloquear = (tx: TransactionSql, m: Maestro) => tx.unsafe(`LOCK TABLE ${TABLA[m].tabla} IN SHARE ROW EXCLUSIVE MODE`);

async function filaBloqueada(tx: TransactionSql, m: Maestro, id: number): Promise<Record<string, unknown>> {
  const [fila] = await tx.unsafe(`SELECT * FROM ${TABLA[m].tabla} WHERE id = $1 FOR UPDATE`, [id]);
  if (!fila) throw new ErrorIndicador(`${TABLA[m].articulo === "el" ? "El" : "La"} ${TABLA[m].etiqueta} no existe`);
  return fila;
}

async function exigirNombreLibre(tx: TransactionSql, m: Maestro, nombre: string, salvo: number | null): Promise<void> {
  if (m === "objetivos") return;
  const [otro] = await tx.unsafe(
    `SELECT nombre FROM ${TABLA[m].tabla} WHERE lower(nombre) = lower($1) ${salvo === null ? "" : "AND id <> $2"} LIMIT 1`,
    salvo === null ? [nombre] : [nombre, salvo],
  );
  if (otro) throw new ErrorIndicador(`Ya existe «${otro.nombre}»`);
}

/** Lo que la fila guarda, en la forma de la bitácora. */
function datosDeFila(m: Maestro, f: Record<string, unknown>): Record<string, unknown> {
  if (m === "clasificaciones") return { nombre: f.nombre, aprueba: f.aprueba, exigeNorma: f.exige_norma };
  if (m === "unidades") return { nombre: f.nombre, sufijo: f.sufijo, decimales: f.decimales };
  if (m === "objetivos") return { clase: f.clase, enunciado: f.enunciado };
  return { nombre: f.nombre };
}

function nombreParaMostrar(m: Maestro, d: Record<string, unknown>): string {
  return String(m === "objetivos" ? d.enunciado : d.nombre);
}

export async function guardarEnMaestro(
  sesion: SesionFlujo,
  m: Maestro,
  d: DatosMaestro,
  opciones?: Opciones,
): Promise<{ id: number }> {
  exigirAdministrar(sesion);
  exigirMaestro(m);
  const { id: idDado, ...resto } = d as { id?: number } & Record<string, unknown>;
  const datos = validar(ESQUEMAS_MAESTRO[m], resto) as Record<string, unknown>;
  const id = idDado ?? null;
  if (id !== null && (!Number.isInteger(id) || id <= 0)) throw new ErrorIndicador("El elemento no existe");
  const entidad = TABLA[m].tabla;

  return enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    await bloquear(tx, m);
    if (m !== "objetivos") await exigirNombreLibre(tx, m, String(datos.nombre), id);
    let antes: Record<string, unknown> | null = null;
    let nuevoId: number;
    if (id === null) {
      let fila;
      if (m === "tipos") {
        [fila] = await tx`INSERT INTO tipos_indicador (nombre, orden) VALUES (${datos.nombre as string}, (SELECT coalesce(max(orden), 0) + 1 FROM tipos_indicador)) RETURNING id`;
      } else if (m === "clasificaciones") {
        [fila] = await tx`INSERT INTO clasificaciones_indicador (nombre, aprueba, exige_norma, orden)
          VALUES (${datos.nombre as string}, ${datos.aprueba as string}, ${datos.exigeNorma as boolean}, (SELECT coalesce(max(orden), 0) + 1 FROM clasificaciones_indicador)) RETURNING id`;
      } else if (m === "unidades") {
        [fila] = await tx`INSERT INTO unidades_indicador (nombre, sufijo, decimales, orden)
          VALUES (${datos.nombre as string}, ${datos.sufijo as string}, ${datos.decimales as number}, (SELECT coalesce(max(orden), 0) + 1 FROM unidades_indicador)) RETURNING id`;
      } else {
        [fila] = await tx`INSERT INTO objetivos (clase, enunciado, orden)
          VALUES (${datos.clase as string}, ${datos.enunciado as string}, (SELECT coalesce(max(orden), 0) + 1 FROM objetivos)) RETURNING id`;
      }
      nuevoId = Number(fila.id);
    } else {
      antes = datosDeFila(m, await filaBloqueada(tx, m, id));
      nuevoId = id;
      if (m === "tipos") {
        await tx`UPDATE tipos_indicador SET nombre = ${datos.nombre as string} WHERE id = ${id}`;
      } else if (m === "clasificaciones") {
        await tx`UPDATE clasificaciones_indicador SET nombre = ${datos.nombre as string}, aprueba = ${datos.aprueba as string},
          exige_norma = ${datos.exigeNorma as boolean} WHERE id = ${id}`;
      } else if (m === "unidades") {
        await tx`UPDATE unidades_indicador SET nombre = ${datos.nombre as string}, sufijo = ${datos.sufijo as string},
          decimales = ${datos.decimales as number} WHERE id = ${id}`;
      } else {
        await tx`UPDATE objetivos SET clase = ${datos.clase as string}, enunciado = ${datos.enunciado as string} WHERE id = ${id}`;
      }
    }
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "indicador_maestro_guardado",
      entidad,
      entidadId: nuevoId,
      detalle: { maestro: m, nombre: nombreParaMostrar(m, datos), creado: id === null, antes, despues: datos },
    });
    return { id: nuevoId };
  });
}

export async function activarEnMaestro(
  sesion: SesionFlujo,
  m: Maestro,
  id: number,
  activo: boolean,
  opciones?: Opciones,
): Promise<void> {
  exigirAdministrar(sesion);
  exigirMaestro(m);
  await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    await bloquear(tx, m);
    const fila = await filaBloqueada(tx, m, id);
    if (fila.activo === activo) return;
    await tx.unsafe(`UPDATE ${TABLA[m].tabla} SET activo = $1 WHERE id = $2`, [activo, id]);
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "indicador_maestro_activado",
      entidad: TABLA[m].tabla,
      entidadId: id,
      detalle: { maestro: m, nombre: nombreParaMostrar(m, datosDeFila(m, fila)), activo },
    });
  });
}

export async function borrarDeMaestro(sesion: SesionFlujo, m: Maestro, id: number, opciones?: Opciones): Promise<void> {
  exigirAdministrar(sesion);
  exigirMaestro(m);
  await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    await bloquear(tx, m);
    const fila = await filaBloqueada(tx, m, id);
    const [uso] = await tx.unsafe(`SELECT 1 FROM indicador_versiones WHERE ${TABLA[m].columnaUso} = $1 LIMIT 1`, [id]);
    if (uso) throw new ErrorIndicador("No se puede borrar: lo usa algún indicador. Desactívelo.");
    await tx.unsafe(`DELETE FROM ${TABLA[m].tabla} WHERE id = $1`, [id]);
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "indicador_maestro_borrado",
      entidad: TABLA[m].tabla,
      entidadId: id,
      detalle: { maestro: m, nombre: nombreParaMostrar(m, datosDeFila(m, fila)) },
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Parámetros (`configuracion`)
// ─────────────────────────────────────────────────────────────────────────────

export type ParametrosIndicadores = {
  umbralAtencionPct: number;
  avisoPrevioDias: number;
  plazoReporteDias: number;
  incumplimientoPeriodos: number;
  variacionConfirmarPct: number;
};

export const PARAMETROS_DEFECTO: ParametrosIndicadores = {
  umbralAtencionPct: 70,
  avisoPrevioDias: 3,
  plazoReporteDias: 10,
  incumplimientoPeriodos: 3,
  variacionConfirmarPct: 30,
};

export const CAMPOS_PARAMETROS: ReadonlyArray<{
  campo: keyof ParametrosIndicadores; clave: string; minimo: number; maximo: number;
}> = [
  { campo: "umbralAtencionPct", clave: "ind_umbral_atencion_pct", minimo: 1, maximo: 99 },
  { campo: "avisoPrevioDias", clave: "ind_aviso_previo_dias", minimo: 0, maximo: 30 },
  { campo: "plazoReporteDias", clave: "ind_plazo_reporte_dias", minimo: 0, maximo: 90 },
  { campo: "incumplimientoPeriodos", clave: "ind_incumplimiento_periodos", minimo: 2, maximo: 12 },
  { campo: "variacionConfirmarPct", clave: "ind_variacion_confirmar_pct", minimo: 5, maximo: 500 },
];

/** Un valor ausente, que no es un entero o que sale de su rango cae al de omisión. */
export async function obtenerParametros(opciones?: Opciones): Promise<ParametrosIndicadores> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`SELECT clave, valor FROM configuracion WHERE clave = ANY(${CAMPOS_PARAMETROS.map((c) => c.clave)})`;
  const valores = new Map(filas.map((f) => [f.clave as string, String(f.valor).trim()]));
  const resultado = { ...PARAMETROS_DEFECTO };
  for (const c of CAMPOS_PARAMETROS) {
    const crudo = valores.get(c.clave);
    if (crudo === undefined || !/^\d{1,6}$/.test(crudo)) continue;
    const n = Number(crudo);
    if (n >= c.minimo && n <= c.maximo) resultado[c.campo] = n;
  }
  return resultado;
}

export async function guardarParametros(
  sesion: SesionFlujo,
  p: Omit<ParametrosIndicadores, "umbralAtencionPct"> & { umbralAtencionPct?: number },
  opciones?: Opciones,
): Promise<void> {
  exigirAdministrar(sesion);
  const nuevos = validar(EsquemaParametrosIndicadores, p);
  await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    const actuales = await obtenerParametros({ sql: tx });
    const cambios: Record<string, { antes: string; despues: string }> = {};
    for (const c of CAMPOS_PARAMETROS) {
      const valor = nuevos[c.campo] ?? actuales[c.campo];
      await tx`INSERT INTO configuracion (clave, valor) VALUES (${c.clave}, ${String(valor)})
        ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor`;
      if (actuales[c.campo] !== valor) cambios[c.clave] = { antes: String(actuales[c.campo]), despues: String(valor) };
    }
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "indicador_parametros_guardados",
      entidad: "configuracion",
      entidadId: null,
      detalle: { cambios },
    });
  });
}
