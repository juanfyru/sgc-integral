/**
 * Lo que el administrador hace con un indicador (spec 14 §7.3, §7.7 y §10.4; Tarea 8 de la 14A): designar personas,
 * cambiar los datos de operación, duplicar, retirar, descartar y borrar. Escribe solo quien tiene
 * `indicadores.administrar`; el permiso se comprueba antes que cualquier otra cosa.
 *
 * Candados: el indicador primero, `FOR UPDATE`, y después sus versiones, antes de tocar las filas hijas (los triggers de
 * la 0011 leen la versión con `FOR SHARE`). Nada de lo que ya tiene datos se borra: retirar solo quita las mediciones
 * abiertas sin ningún dato, y borrar solo admite un indicador que nunca se envió a aprobación.
 */
import type { TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { avisarA } from "@/db/consultas/avisos-vencimiento";
import { enTransaccion, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { periodoDe } from "@/lib/indicadores-documentales/periodo";
import { fraccion } from "@/lib/indicadores/formula/fraccion";
import { clavesDelAnio, fechaLimiteDeReporte, marcasQueSiguen, periodicidadDe, versionQueRigeEntre } from "@/lib/indicadores/periodos";
import { rangosATexto } from "@/lib/indicadores/rangos";
import { rangosEquivalentes } from "@/lib/indicadores/semaforo";
import {
  AVISO_DESIGNACION,
  ErrorIndicador,
  FUNCIONES_DESIGNADO,
  NIVELES_ACCESO,
  type DatosOperacion,
  type EstadoIndicador,
  type FuncionDesignado,
  type ModoSemaforo,
  type Periodicidad,
  type Tendencia,
} from "@/lib/indicadores/tipos";
import { ErrorPermiso, puede, type SujetoPermiso } from "@/lib/permisos";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { versionVigente } from "./aprobacion";
import { codigoCon, COLUMNAS_VARIABLE, CONTENIDO, proponerCodigo, siguientes } from "./fichas";
import { obtenerParametros } from "./maestros";
import { conDatos, esDeOtraPeriodicidad, recalcularMedicion, versionesAprobadas } from "./mediciones";

type Opciones = { sql?: Cliente; ahora?: Date };

const INDICADOR_NO_EXISTE = "El indicador no existe";
const MAXIMO_DESIGNADOS = 20;

function exigirAdministrar(sesion: SujetoPermiso): void {
  if (!puede(sesion, "indicadores.administrar")) throw new ErrorPermiso();
}

const esCodigoRepetido = (err: unknown) =>
  (err as { code?: string }).code === "23505" && (err as { constraint_name?: string }).constraint_name === "indicadores_codigo_unico";

const ADJETIVO: Record<Periodicidad, string> = {
  mensual: "mensual",
  bimestral: "bimestral",
  trimestral: "trimestral",
  semestral: "semestral",
  anual: "anual",
};

/** El motivo de un retiro o un descarte: de 5 a 500 caracteres. */
function motivoValido(motivo: string): string {
  const m = typeof motivo === "string" ? motivo.trim() : "";
  if (m.length < 5) throw new ErrorIndicador("El motivo debe tener al menos 5 caracteres");
  if (m.length > 500) throw new ErrorIndicador("El motivo no puede pasar de 500 caracteres");
  return m;
}

type FilaIndicador = { id: number; codigo: string; estado: EstadoIndicador; procesoId: number };

/** El indicador bloqueado `FOR UPDATE`; el primer candado de toda operación. */
async function bloquearIndicador(tx: TransactionSql, indicadorId: number): Promise<FilaIndicador> {
  const [i] = await tx`SELECT id, codigo, estado, proceso_id FROM indicadores WHERE id = ${indicadorId} FOR UPDATE`;
  if (!i) throw new ErrorIndicador(INDICADOR_NO_EXISTE);
  return { id: Number(i.id), codigo: i.codigo as string, estado: i.estado as EstadoIndicador, procesoId: Number(i.proceso_id) };
}

/** Un retirado o un descartado ya no admite cambios de personas ni de operación. */
function exigirAbierto(i: FilaIndicador): void {
  if (i.estado === "retirado") throw new ErrorIndicador("Un indicador retirado no admite cambios");
  if (i.estado === "descartado") throw new ErrorIndicador("Un indicador descartado no admite cambios");
}

/** El nombre de la ficha que rige o, sin ella, el de la última versión. */
async function nombreDe(tx: TransactionSql, indicadorId: number): Promise<string | null> {
  const [v] = await tx`SELECT nombre FROM indicador_versiones WHERE indicador_id = ${indicadorId}
    ORDER BY (estado = 'aprobada') DESC, numero DESC LIMIT 1`;
  return (v?.nombre as string | null | undefined) ?? null;
}

const ascendente = (ids: readonly number[]) => [...ids].sort((a, b) => a - b);

// ─────────────────────────────────────────────────────────────────────────────
// Designados
// ─────────────────────────────────────────────────────────────────────────────

export type Designado = { id: number; nombre: string; activo: boolean };

/** Quiénes miden, analizan y hacen seguimiento: los inactivos vienen marcados para que la página lo diga. */
export async function designadosDe(indicadorId: number, opciones?: { sql?: Cliente }): Promise<Record<FuncionDesignado, Designado[]>> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`SELECT d.funcion, u.id, u.nombre, u.activo FROM indicador_designados d
    JOIN usuarios u ON u.id = d.usuario_id
    WHERE d.indicador_id = ${indicadorId} ORDER BY u.nombre, u.id`;
  const de = (funcion: FuncionDesignado): Designado[] =>
    filas.filter((f) => f.funcion === funcion).map((f) => ({ id: Number(f.id), nombre: f.nombre as string, activo: f.activo as boolean }));
  return { mide: de("mide"), analiza: de("analiza"), seguimiento: de("seguimiento") };
}

/**
 * Reemplaza la lista de una función (spec §7.3). Solo se puede designar a usuarios activos; quien ya estaba en la lista y
 * se queda conserva su fila aunque se haya desactivado. Avisa solo a quienes entran, y solo si el indicador ya existe
 * para ellos (activo): un borrador no se ve.
 */
export async function designar(
  sesion: SesionFlujo,
  d: { indicadorId: number; funcion: FuncionDesignado; usuarioIds: number[] },
  opciones?: Opciones,
): Promise<void> {
  exigirAdministrar(sesion);
  if (!FUNCIONES_DESIGNADO.includes(d.funcion)) throw new ErrorIndicador("La función no es válida");
  const ids = [...new Set(d.usuarioIds)];
  if (ids.length > MAXIMO_DESIGNADOS) throw new ErrorIndicador(`Elija hasta ${MAXIMO_DESIGNADOS} personas`);
  if (!ids.every((x) => Number.isInteger(x) && x > 0)) throw new ErrorIndicador("Las personas elegidas no son válidas");
  const ahora = opciones?.ahora ?? new Date();
  await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    const i = await bloquearIndicador(tx, d.indicadorId);
    exigirAbierto(i);
    const actuales = (await tx`SELECT usuario_id FROM indicador_designados WHERE indicador_id = ${i.id} AND funcion = ${d.funcion}`).map((f) =>
      Number(f.usuario_id),
    );
    const entran = ids.filter((x) => !actuales.includes(x));
    const salen = actuales.filter((x) => !ids.includes(x));
    if (entran.length > 0) {
      const activos = await tx`SELECT id FROM usuarios WHERE id IN ${tx(entran)} AND activo FOR KEY SHARE`;
      if (activos.length !== entran.length) throw new ErrorIndicador("Solo se puede designar a usuarios activos");
    }
    if (entran.length === 0 && salen.length === 0) return;

    if (salen.length > 0) {
      await tx`DELETE FROM indicador_designados WHERE indicador_id = ${i.id} AND funcion = ${d.funcion} AND usuario_id IN ${tx(salen)}`;
    }
    for (const usuarioId of entran) {
      await tx`INSERT INTO indicador_designados (indicador_id, usuario_id, funcion, creado_por, creado_en)
        VALUES (${i.id}, ${usuarioId}, ${d.funcion}, ${sesion.usuarioId}, ${ahora})`;
    }

    const nombres = async (lista: number[]) =>
      lista.length === 0
        ? []
        : (await tx`SELECT nombre FROM usuarios WHERE id IN ${tx(lista)} ORDER BY id`).map((u) => u.nombre as string);
    const nombre = await nombreDe(tx, i.id);
    if (entran.length > 0 && i.estado === "activo") {
      await avisarA(
        tx,
        {
          tipo: "indicadores.designacion",
          titulo: `${AVISO_DESIGNACION[d.funcion]} ${i.codigo}`,
          enlace: `/indicadores/${encodeURIComponent(i.codigo)}`,
          entidad: "indicador",
          entidadId: i.id,
        },
        entran.map((usuarioId) => ({ usuarioId, cuerpo: `${AVISO_DESIGNACION[d.funcion]} ${i.codigo}${nombre ? `: ${nombre}` : ""}` })),
      );
    }
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "indicador_designados",
      entidad: "indicador",
      entidadId: i.id,
      detalle: {
        codigo: i.codigo,
        funcion: d.funcion,
        antes: ascendente(actuales),
        despues: ascendente(ids),
        nombresAntes: await nombres(ascendente(actuales)),
        nombresDespues: await nombres(ascendente(ids)),
      },
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Datos de operación
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cambia el plazo de reporte, el inicio de medición, el soporte obligatorio y el nivel de acceso (spec §7.3): no crean
 * versión ni tocan la huella. El inicio de medición es una clave de la periodicidad de la ficha que rige y no puede dejar
 * fuera una medición que ya tiene datos. El plazo nuevo y el soporte llegan a las mediciones sin cerrar y no históricas
 * (ola final, I1): su fecha límite y sus marcas de aviso (`moverFechasLimite`) y su estado (`recalcularPorSoporte`); la
 * bitácora cuenta cuántas tocó.
 */
export async function cambiarOperacion(
  sesion: SesionFlujo,
  d: { indicadorId: number } & DatosOperacion,
  opciones?: Opciones,
): Promise<void> {
  exigirAdministrar(sesion);
  if (!Number.isInteger(d.plazoReporteDias)) throw new ErrorIndicador("El plazo de reporte debe ser un número entero");
  if (d.plazoReporteDias < 0 || d.plazoReporteDias > 90) throw new ErrorIndicador("El plazo de reporte debe estar entre 0 y 90");
  if (!NIVELES_ACCESO.includes(d.nivelAcceso)) throw new ErrorIndicador("Elija el nivel de acceso");
  const nuevo = periodoDe(d.inicioMedicion, zonaHoraria());
  if (!nuevo || periodicidadDe(d.inicioMedicion) === null) throw new ErrorIndicador("El inicio de medición no es un periodo válido");
  const soporte = d.soporteObligatorio === true;
  const ahora = opciones?.ahora ?? new Date();
  await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    const i = await bloquearIndicador(tx, d.indicadorId);
    exigirAbierto(i);
    // La periodicidad de la ficha que rige; sin ficha aprobada, la de la última versión (puede estar incompleta).
    const vigente = await versionVigente(tx, i.id);
    const [v] = vigente
      ? await tx`SELECT periodicidad FROM indicador_versiones WHERE id = ${vigente.id}`
      : await tx`SELECT periodicidad FROM indicador_versiones WHERE indicador_id = ${i.id} ORDER BY numero DESC LIMIT 1`;
    const rige = (v?.periodicidad as Periodicidad | null | undefined) ?? null;
    if (rige && periodicidadDe(d.inicioMedicion) !== rige) {
      throw new ErrorIndicador(`El inicio de medición debe ser un periodo ${ADJETIVO[rige]}`);
    }
    const [actual] = await tx`SELECT plazo_reporte_dias, inicio_medicion, soporte_obligatorio, nivel_acceso FROM indicadores WHERE id = ${i.id}`;
    const antes: DatosOperacion = {
      plazoReporteDias: Number(actual.plazo_reporte_dias),
      inicioMedicion: (actual.inicio_medicion as string | null) ?? "",
      soporteObligatorio: actual.soporte_obligatorio as boolean,
      nivelAcceso: actual.nivel_acceso as DatosOperacion["nivelAcceso"],
    };
    const despues: DatosOperacion = {
      plazoReporteDias: d.plazoReporteDias,
      inicioMedicion: d.inicioMedicion,
      soporteObligatorio: soporte,
      nivelAcceso: d.nivelAcceso,
    };
    if (JSON.stringify(antes) === JSON.stringify(despues)) return;

    // Por fechas, no por clave: una ficha anterior pudo tener otra periodicidad.
    const [hayDatos] = await tx`SELECT m.id FROM mediciones m
      WHERE m.indicador_id = ${i.id} AND m.desde < ${nuevo.desde} AND ${conDatos(tx)}
      LIMIT 1`;
    if (hayDatos) throw new ErrorIndicador("Hay mediciones con datos antes de ese periodo");
    // Las abiertas y vacías anteriores al inicio nuevo no tienen historia: no se dejan.
    const quitadas = await tx`DELETE FROM mediciones m
      WHERE m.indicador_id = ${i.id} AND m.desde < ${nuevo.desde} AND NOT ${conDatos(tx)} RETURNING m.id`;

    // Antes que las mediciones: `recalcularMedicion` lee «soporte obligatorio» del indicador.
    await tx`UPDATE indicadores SET plazo_reporte_dias = ${despues.plazoReporteDias}, inicio_medicion = ${despues.inicioMedicion},
        soporte_obligatorio = ${despues.soporteObligatorio}, nivel_acceso = ${despues.nivelAcceso}
      WHERE id = ${i.id}`;
    const conFechaNueva = antes.plazoReporteDias !== despues.plazoReporteDias ? await moverFechasLimite(tx, i.id, despues.plazoReporteDias, ahora) : 0;
    // Después del plazo: al activarlo, el soporte solo alcanza lo que sigue en plazo con la fecha límite nueva.
    const recalculadas =
      antes.soporteObligatorio !== despues.soporteObligatorio
        ? await recalcularPorSoporte(tx, i.id, { ahora, actorId: sesion.usuarioId, activado: despues.soporteObligatorio })
        : 0;
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "indicador_operacion",
      entidad: "indicador",
      entidadId: i.id,
      detalle: {
        codigo: i.codigo,
        antes,
        despues,
        ...(quitadas.length > 0 ? { medicionesQuitadas: quitadas.length } : {}),
        ...(conFechaNueva > 0 ? { medicionesConFechaNueva: conFechaNueva } : {}),
        ...(recalculadas > 0 ? { medicionesRecalculadas: recalculadas } : {}),
      },
    });
  });
}

/** Las mediciones que todavía siguen su curso: sin cerrar y no históricas (un histórico no tiene plazo ni avisos), bloqueadas. */
const enCurso = (tx: TransactionSql, indicadorId: number) =>
  tx`SELECT id, periodo, vence_en, aviso_previo_en, aviso_vencido_en, escalado_en FROM mediciones
    WHERE indicador_id = ${indicadorId} AND estado <> 'cerrada' AND NOT historica
    ORDER BY desde, id FOR UPDATE`;

/**
 * El plazo nuevo en las mediciones en curso: la fecha límite (`fechaLimiteDeReporte`, como al abrir el periodo) y las
 * marcas de aviso que ya no son ciertas con ella (`marcasQueSiguen`), para que la pasada vuelva a avisar cuando toque.
 * Quien llama tiene el indicador `FOR UPDATE`. Devuelve cuántas cambiaron de fecha.
 */
async function moverFechasLimite(tx: TransactionSql, indicadorId: number, plazo: number, ahora: Date): Promise<number> {
  const zona = zonaHoraria();
  const { avisoPrevioDias } = await obtenerParametros({ sql: tx });
  let movidas = 0;
  for (const m of await enCurso(tx, indicadorId)) {
    const periodo = periodoDe(m.periodo as string, zona);
    if (!periodo) continue;
    const vence = fechaLimiteDeReporte(periodo, plazo, zona);
    const siguen = marcasQueSiguen(vence, ahora, avisoPrevioDias, zona);
    await tx`UPDATE mediciones SET vence_en = ${vence},
        aviso_previo_en = ${siguen.previo ? (m.aviso_previo_en as Date | null) : null},
        aviso_vencido_en = ${siguen.vencido ? (m.aviso_vencido_en as Date | null) : null},
        escalado_en = ${siguen.escalado ? (m.escalado_en as Date | null) : null}
      WHERE id = ${m.id}`;
    movidas += 1;
  }
  return movidas;
}

/**
 * «Soporte obligatorio» cambió: las mediciones en curso se recalculan (evento `recalculo`, la misma persona y la misma
 * hora, recálculo de sistema `"soporte"`: con la versión con que se calcularon). El soporte rige hacia adelante (residuos
 * finales, punto 1): al **activarlo** solo alcanza las que siguen en plazo (`vence_en >= ahora`), y una ya reportada sin
 * soporte vuelve a abierta para pedirlo; las que ya vencieron se quedan como están (se reportaron cuando no se pedía y no
 * se vuelven vencidas). Al **desactivarlo**, todas: una que solo esperaba el soporte queda reportada. Las de otra
 * periodicidad no se calculan. Devuelve cuántas cambiaron.
 */
async function recalcularPorSoporte(
  tx: TransactionSql,
  indicadorId: number,
  c: { ahora: Date; actorId: number; activado: boolean },
): Promise<number> {
  const zona = zonaHoraria();
  const versiones = await versionesAprobadas(tx, indicadorId);
  let recalculadas = 0;
  for (const m of await enCurso(tx, indicadorId)) {
    if (c.activado && new Date(m.vence_en as string).getTime() < c.ahora.getTime()) continue;
    const clave = m.periodo as string;
    const periodo = periodoDe(clave, zona);
    const version = periodo ? versionQueRigeEntre(versiones, periodo, zona) : null;
    if (!version || esDeOtraPeriodicidad(clave, version)) continue;
    const r = await recalcularMedicion(tx, Number(m.id), {
      ahora: c.ahora,
      actorId: c.actorId,
      evento: "recalculo",
      detalle: { causa: "soporte_obligatorio" },
      sistema: "soporte",
    });
    if (r.cambio) recalculadas += 1;
  }
  return recalculadas;
}

// ─────────────────────────────────────────────────────────────────────────────
// Duplicar
// ─────────────────────────────────────────────────────────────────────────────

/**
 * «Crear a partir de este» (spec §7.7): un indicador nuevo en borrador, versión 1, con el contenido de la ficha vigente
 * (o de la última versión, si nunca se aprobó) y los datos de operación y los designados activos del original, para el
 * proceso elegido y con el código que se le propone. No copia mediciones ni metas programadas; el subproceso y el
 * procedimiento, que son de un proceso, solo se conservan si el proceso es el mismo. Sirve también para un retirado.
 */
export async function duplicar(
  sesion: SesionFlujo,
  d: { indicadorId: number; procesoId: number },
  opciones?: Opciones,
): Promise<{ codigo: string }> {
  exigirAdministrar(sesion);
  const ahora = opciones?.ahora ?? new Date();
  let codigo = "";
  try {
    return await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
      const origen = await bloquearIndicador(tx, d.indicadorId);
      const [proceso] = await tx`SELECT nombre, activo FROM procesos WHERE id = ${d.procesoId} FOR KEY SHARE`;
      if (!proceso || !proceso.activo) throw new ErrorIndicador("El proceso no existe o está inactivo");
      const vigente = await versionVigente(tx, origen.id);
      const [ultima] = vigente
        ? [{ id: vigente.id }]
        : await tx`SELECT id FROM indicador_versiones WHERE indicador_id = ${origen.id} ORDER BY numero DESC LIMIT 1`;
      if (!ultima) throw new ErrorIndicador("El indicador no tiene una ficha que copiar");
      const desde = Number(ultima.id);
      const mismoProceso = d.procesoId === origen.procesoId;

      codigo = await proponerCodigo(d.procesoId, { sql: tx });
      const [o] = await tx`SELECT nivel_acceso, plazo_reporte_dias, inicio_medicion, soporte_obligatorio FROM indicadores WHERE id = ${origen.id}`;
      const [i] = await tx`INSERT INTO indicadores
          (codigo, proceso_id, estado, nivel_acceso, plazo_reporte_dias, inicio_medicion, soporte_obligatorio, creado_por, creado_en)
        VALUES (${codigo}, ${d.procesoId}, 'borrador', ${o.nivel_acceso}, ${o.plazo_reporte_dias}, ${o.inicio_medicion},
          ${o.soporte_obligatorio}, ${sesion.usuarioId}, ${ahora})
        RETURNING id`;
      const indicadorId = Number(i.id);

      // `tipo_cambio` es obligatorio: la copia es una ficha nueva («inicial»). Ni firmas ni huella ni «rige desde».
      const [v] = await tx.unsafe(
        `INSERT INTO indicador_versiones (indicador_id, numero, estado, tipo_cambio, creado_por, creado_en, actualizado_en, ${CONTENIDO})
         SELECT $2, 1, 'borrador', 'inicial', $3, $4, $4, ${CONTENIDO} FROM indicador_versiones WHERE id = $1
         RETURNING id`,
        [desde, indicadorId, sesion.usuarioId, ahora],
      );
      const versionId = Number(v.id);
      await tx`SELECT id FROM indicador_versiones WHERE id = ${versionId} FOR UPDATE`;
      await tx`UPDATE indicador_versiones SET proceso_nombre = ${proceso.nombre as string}
        WHERE id = ${versionId}`;
      // La regla vieja no se copia: la copia lleva los rangos que dan los mismos colores (spec 14A §3.5).
      const [regla] = await tx`SELECT tendencia, meta, meta_max, semaforo_modo, umbral_atencion_pct, limite_critico, tolerancia
        FROM indicador_versiones WHERE id = ${versionId}`;
      if (regla.meta !== null && regla.semaforo_modo !== "rangos") {
        const equivalentes = rangosEquivalentes({
          tendencia: regla.tendencia as Tendencia,
          meta: fraccion(regla.meta as string),
          metaMax: regla.meta_max === null ? null : fraccion(regla.meta_max as string),
          modo: regla.semaforo_modo as ModoSemaforo | null,
          umbralPct: regla.umbral_atencion_pct as number | null,
          limite: regla.limite_critico === null ? null : fraccion(regla.limite_critico as string),
          tolerancia: regla.tolerancia === null ? null : fraccion(regla.tolerancia as string),
        });
        if (equivalentes !== null) {
          await tx`UPDATE indicador_versiones SET semaforo_modo = 'rangos', rangos = ${tx.json(rangosATexto(equivalentes) as never)},
              umbral_atencion_pct = NULL, limite_critico = NULL, tolerancia = NULL
            WHERE id = ${versionId}`;
        }
      }
      if (!mismoProceso) {
        await tx`UPDATE indicador_versiones SET subproceso_id = NULL, subproceso_nombre = NULL, procedimiento_documento_id = NULL
          WHERE id = ${versionId}`;
      }
      await tx.unsafe(
        `INSERT INTO indicador_variables (version_id, ${COLUMNAS_VARIABLE})
         SELECT $2, ${COLUMNAS_VARIABLE} FROM indicador_variables WHERE version_id = $1 ORDER BY orden, letra`,
        [desde, versionId],
      );
      await tx`INSERT INTO indicador_responsables (version_id, cargo_id, cargo_nombre, funcion)
        SELECT ${versionId}, cargo_id, cargo_nombre, funcion FROM indicador_responsables WHERE version_id = ${desde} ORDER BY id`;
      await tx`INSERT INTO indicador_normas (version_id, norma_id, norma_nombre)
        SELECT ${versionId}, norma_id, norma_nombre FROM indicador_normas WHERE version_id = ${desde} ORDER BY id`;
      await tx`INSERT INTO indicador_designados (indicador_id, usuario_id, funcion, creado_por, creado_en)
        SELECT ${indicadorId}, d.usuario_id, d.funcion, ${sesion.usuarioId}, ${ahora}
        FROM indicador_designados d JOIN usuarios u ON u.id = d.usuario_id AND u.activo
        WHERE d.indicador_id = ${origen.id}`;

      await registrarAuditoria(tx, {
        usuarioId: sesion.usuarioId,
        accion: "indicador_duplicado",
        entidad: "indicador",
        entidadId: indicadorId,
        detalle: {
          codigo,
          nombre: await nombreDe(tx, indicadorId),
          origen: origen.codigo,
          origenId: origen.id,
          proceso: proceso.nombre as string,
          versionId,
        },
      });
      return { codigo };
    });
  } catch (err) {
    if (esCodigoRepetido(err)) throw new ErrorIndicador(`Ya existe un indicador con el código ${codigo}`);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Retirar, descartar y borrar
// ─────────────────────────────────────────────────────────────────────────────

/** Las versiones en curso (borrador o por aprobar), bloqueadas, y su paso a `descartada`. */
async function descartarEnCurso(tx: TransactionSql, indicadorId: number, ahora: Date): Promise<number[]> {
  const filas = await tx`SELECT id FROM indicador_versiones WHERE indicador_id = ${indicadorId} AND estado IN ('borrador', 'por_aprobar')
    ORDER BY id FOR UPDATE`;
  const ids = filas.map((f) => Number(f.id));
  if (ids.length > 0) await tx`UPDATE indicador_versiones SET estado = 'descartada', actualizado_en = ${ahora} WHERE id IN ${tx(ids)}`;
  return ids;
}

/**
 * Retira un indicador activo (spec §7.7): queda `retirado` con su fecha y su motivo; sus mediciones abiertas sin ningún
 * dato se quitan (no tienen historia) y las que tienen datos siguen su curso; el cambio en curso se descarta y se avisa
 * a los designados. Es definitivo: para volver a medirlo se duplica.
 */
export async function retirar(sesion: SesionFlujo, d: { indicadorId: number; motivo: string }, opciones?: Opciones): Promise<void> {
  exigirAdministrar(sesion);
  const motivo = motivoValido(d.motivo);
  const ahora = opciones?.ahora ?? new Date();
  await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    const i = await bloquearIndicador(tx, d.indicadorId);
    if (i.estado !== "activo") throw new ErrorIndicador("Solo se puede retirar un indicador activo");
    const descartadas = await descartarEnCurso(tx, i.id, ahora);
    const quitadas = await tx`DELETE FROM mediciones m
      WHERE m.indicador_id = ${i.id} AND NOT ${conDatos(tx)}
      RETURNING m.id`;
    await tx`UPDATE indicadores SET estado = 'retirado', baja_por = ${sesion.usuarioId}, baja_en = ${ahora}, baja_motivo = ${motivo}
      WHERE id = ${i.id}`;
    const designados = await tx`SELECT DISTINCT d.usuario_id FROM indicador_designados d JOIN usuarios u ON u.id = d.usuario_id AND u.activo
      WHERE d.indicador_id = ${i.id} ORDER BY d.usuario_id`;
    const nombre = await nombreDe(tx, i.id);
    if (designados.length > 0) {
      await avisarA(
        tx,
        {
          tipo: "indicadores.retirado",
          titulo: `Retiraron el indicador ${i.codigo}`,
          enlace: `/indicadores/${encodeURIComponent(i.codigo)}`,
          entidad: "indicador",
          entidadId: i.id,
        },
        designados.map((f) => ({ usuarioId: Number(f.usuario_id), cuerpo: motivo })),
      );
    }
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "indicador_retirado",
      entidad: "indicador",
      entidadId: i.id,
      detalle: { codigo: i.codigo, nombre, motivo, medicionesQuitadas: quitadas.length, versionesDescartadas: descartadas },
    });
  });
}

/** ¿Alguna versión del indicador se envió a aprobación? Enviar deja la firma «Elaboró», que no admite borrado. */
async function seEnvioAlgunaVez(tx: TransactionSql, indicadorId: number): Promise<boolean> {
  const [f] = await tx`SELECT 1 AS hay FROM firmas f JOIN indicador_versiones v ON v.id = f.indicador_version_id
    WHERE v.indicador_id = ${indicadorId} LIMIT 1`;
  return f !== undefined;
}

/**
 * Descarta un indicador que se envió y nunca se aprobó (devuelto o abandonado): queda `descartado`, visible solo para
 * quien administra, con su versión en curso descartada, y su código sigue ocupado (spec §7.7).
 */
export async function descartarIndicador(sesion: SesionFlujo, d: { indicadorId: number; motivo: string }, opciones?: Opciones): Promise<void> {
  exigirAdministrar(sesion);
  const motivo = motivoValido(d.motivo);
  const ahora = opciones?.ahora ?? new Date();
  await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    const i = await bloquearIndicador(tx, d.indicadorId);
    if (i.estado !== "borrador") throw new ErrorIndicador("Solo se puede descartar un indicador en borrador");
    if (!(await seEnvioAlgunaVez(tx, i.id))) throw new ErrorIndicador("Este indicador nunca se envió a aprobación: bórrelo");
    const nombre = await nombreDe(tx, i.id);
    const descartadas = await descartarEnCurso(tx, i.id, ahora);
    await tx`UPDATE indicadores SET estado = 'descartado', baja_por = ${sesion.usuarioId}, baja_en = ${ahora}, baja_motivo = ${motivo}
      WHERE id = ${i.id}`;
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "indicador_descartado",
      entidad: "indicador",
      entidadId: i.id,
      detalle: { codigo: i.codigo, nombre, motivo, versionesDescartadas: descartadas },
    });
  });
}

/** Borra un indicador en borrador que nunca se envió a aprobación, con sus versiones, sus filas hijas y sus designados. */
export async function borrarIndicador(sesion: SesionFlujo, indicadorId: number, opciones?: Opciones): Promise<void> {
  exigirAdministrar(sesion);
  await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    const i = await bloquearIndicador(tx, indicadorId);
    if (i.estado !== "borrador") throw new ErrorIndicador("Solo se puede borrar un indicador en borrador");
    if (await seEnvioAlgunaVez(tx, i.id)) throw new ErrorIndicador("Este indicador ya se envió a aprobación: descártelo");
    const nombre = await nombreDe(tx, i.id);
    const versiones = (await tx`SELECT id FROM indicador_versiones WHERE indicador_id = ${i.id} ORDER BY id FOR UPDATE`).map((v) => Number(v.id));
    if (versiones.length > 0) {
      await tx`DELETE FROM indicador_variables WHERE version_id IN ${tx(versiones)}`;
      await tx`DELETE FROM indicador_responsables WHERE version_id IN ${tx(versiones)}`;
      await tx`DELETE FROM indicador_normas WHERE version_id IN ${tx(versiones)}`;
      await tx`DELETE FROM indicador_versiones WHERE id IN ${tx(versiones)}`;
    }
    await tx`DELETE FROM indicador_designados WHERE indicador_id = ${i.id}`;
    await tx`DELETE FROM indicador_metas WHERE indicador_id = ${i.id}`;
    await tx`DELETE FROM indicadores WHERE id = ${i.id}`;
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "indicador_borrado",
      entidad: "indicador",
      entidadId: i.id,
      detalle: { codigo: i.codigo, nombre },
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Lectura para el menú «Administrar»
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que los diálogos de administración necesitan; solo para quien administra, porque lleva el nombre de cada persona. */
export type PanelDeAdministracion = {
  indicadorId: number;
  codigo: string;
  estado: EstadoIndicador;
  procesoId: number;
  operacion: DatosOperacion;
  /** La periodicidad de la ficha que rige: los periodos que se ofrecen como inicio de medición son de ella. */
  periodicidad: Periodicidad | null;
  periodos: { clave: string; etiqueta: string }[];
  usuarios: { id: number; nombre: string }[];
  designados: Record<FuncionDesignado, Designado[]>;
  procesos: { id: number; sigla: string; nombre: string; codigoPropuesto: string }[];
  /** Alguna versión ya se envió a aprobación: se descarta en vez de borrarse. */
  enviado: boolean;
};

export async function panelDeAdministracion(
  sesion: SujetoPermiso,
  indicadorId: number,
  opciones?: { sql?: Cliente; ahora?: Date },
): Promise<PanelDeAdministracion | null> {
  exigirAdministrar(sesion);
  const sql = opciones?.sql ?? obtenerSql();
  const [i] = await sql`SELECT id, codigo, estado, proceso_id, plazo_reporte_dias, inicio_medicion, soporte_obligatorio, nivel_acceso
    FROM indicadores WHERE id = ${indicadorId}`;
  if (!i) return null;
  const vigente = await versionVigente(sql, indicadorId);
  const [v] = vigente
    ? await sql`SELECT periodicidad FROM indicador_versiones WHERE id = ${vigente.id}`
    : await sql`SELECT periodicidad FROM indicador_versiones WHERE indicador_id = ${indicadorId} ORDER BY numero DESC LIMIT 1`;
  const periodicidad = (v?.periodicidad as Periodicidad | null | undefined) ?? null;
  const designados = await designadosDe(indicadorId, { sql });
  const actuales = Object.values(designados).flatMap((lista) => lista.map((p) => p.id));
  const zona = zonaHoraria();
  const anio = Number(fechaEnZona(opciones?.ahora ?? new Date(), zona).slice(0, 4));
  const inicio = (i.inicio_medicion as string | null) ?? "";
  const claves = periodicidad ? [...clavesDelAnio(periodicidad, anio - 2), ...clavesDelAnio(periodicidad, anio - 1), ...clavesDelAnio(periodicidad, anio)] : [];
  // El valor guardado siempre es una opción, aunque ya no sea de la periodicidad: lo decide el servidor, no el navegador.
  if (inicio && !claves.includes(inicio)) claves.unshift(inicio);
  const [usuarios, procesos, propuestos, enviadas] = await Promise.all([
    sql`SELECT id, nombre FROM usuarios WHERE activo OR id = ANY(${actuales}) ORDER BY nombre, id`,
    sql`SELECT id, sigla, nombre FROM procesos WHERE activo ORDER BY nombre`,
    siguientes(sql),
    sql`SELECT 1 AS hay FROM firmas f JOIN indicador_versiones iv ON iv.id = f.indicador_version_id WHERE iv.indicador_id = ${indicadorId} LIMIT 1`,
  ]);
  const siguiente = new Map(propuestos.map((p) => [Number(p.id), Number(p.siguiente)]));
  return {
    indicadorId,
    codigo: i.codigo as string,
    estado: i.estado as EstadoIndicador,
    procesoId: Number(i.proceso_id),
    operacion: {
      plazoReporteDias: Number(i.plazo_reporte_dias),
      inicioMedicion: inicio,
      soporteObligatorio: i.soporte_obligatorio as boolean,
      nivelAcceso: i.nivel_acceso as DatosOperacion["nivelAcceso"],
    },
    periodicidad,
    periodos: claves.map((clave) => {
      const etiqueta = periodoDe(clave, zona)?.etiqueta ?? clave;
      const base = etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1);
      const ajeno = periodicidad !== null && periodicidadDe(clave) !== periodicidad;
      return { clave, etiqueta: ajeno ? `${base} (no es de la periodicidad de la ficha)` : base };
    }),
    usuarios: usuarios.map((u) => ({ id: Number(u.id), nombre: u.nombre as string })),
    designados,
    procesos: procesos.map((p) => ({
      id: Number(p.id),
      sigla: p.sigla as string,
      nombre: p.nombre as string,
      codigoPropuesto: codigoCon(p.sigla as string, siguiente.get(Number(p.id)) ?? 1),
    })),
    enviado: enviadas.length > 0,
  };
}

export type BajaDeIndicador = { por: string; en: Date; motivo: string };

/** Quién retiró o descartó el indicador, cuándo y por qué; `null` si sigue en pie. */
export async function bajaDeIndicador(indicadorId: number, opciones?: { sql?: Cliente }): Promise<BajaDeIndicador | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const [i] = await sql`SELECT u.nombre AS por, i.baja_en, i.baja_motivo FROM indicadores i
    LEFT JOIN usuarios u ON u.id = i.baja_por WHERE i.id = ${indicadorId} AND i.baja_en IS NOT NULL`;
  return i ? { por: (i.por as string | null) ?? "", en: new Date(i.baja_en as string), motivo: i.baja_motivo as string } : null;
}
