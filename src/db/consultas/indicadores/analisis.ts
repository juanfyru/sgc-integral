/**
 * El análisis de una medición (spec 14 §8.4 y §8.5, Tarea 10 de la 14A). Lo escribe quien puede analizar el indicador
 * (`puedeAnalizar`), hasta el cierre: el análisis simple en «Atención», la causa de la desviación y la acción propuesta en
 * «Crítico» o con incumplimiento repetido, y opcional si cumple o no tiene meta. Cada edición deja su evento `analisis`
 * con el antes y el después y pasa por `recalcularMedicion`, que es quien decide el estado (la deja «reportada» cuando
 * queda completa).
 *
 * Candados: los de `contextoDeMedicion` (el indicador `FOR SHARE`, la medición `FOR UPDATE`) y después la escritura.
 */
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { enTransaccion, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { puedeAnalizar, type SujetoVisibilidad } from "@/lib/alcance";
import { analisisCompleto, analisisExigido, MINIMO_ANALISIS, type AnalisisExigido } from "@/lib/indicadores/estados";
import { ErrorIndicador, MAXIMO_TEXTO_MEDICION, type Semaforo } from "@/lib/indicadores/tipos";
import { ErrorPermiso, puede } from "@/lib/permisos";
import { analisisDe, conMayuscula, contextoDeMedicion, recalcularMedicion, type Contexto } from "./mediciones";

type Opciones = { sql?: Cliente; ahora?: Date };

const SIN_DATOS = "Reporte los datos antes de escribir el análisis";
const NO_APLICA = "Una medición «No aplica» no lleva análisis: basta el motivo";

/** El análisis, la causa y la acción propuesta, en texto plano; `null` si no hay. */
export type TextosDeAnalisis = { analisis: string | null; causa: string | null; accionPropuesta: string | null };

type DatosDeAnalizar = { medicionId: number; analisis?: string; causa?: string; accionPropuesta?: string };

const CON_ANALISTA = { exigir: puedeAnalizar };

/** Lo que se le exige a la medición tal como está guardada (su semáforo y su racha). */
function exigidoDe(m: Record<string, unknown>): AnalisisExigido {
  return analisisExigido({
    semaforo: (m.semaforo as Semaforo | null) ?? null,
    repetido: m.incumplimiento_repetido === true,
    historica: m.historica === true,
    noAplica: m.no_aplica === true,
  });
}

/** El mensaje de un análisis que no alcanza lo exigido. */
function faltaDe(exigido: AnalisisExigido, m: Record<string, unknown>): string {
  if (exigido === "simple") return `Escriba el análisis (al menos ${MINIMO_ANALISIS} caracteres)`;
  return m.semaforo === "critico"
    ? "En un resultado crítico escriba la causa de la desviación y la acción propuesta"
    : "Con un incumplimiento repetido escriba la causa de la desviación y la acción propuesta";
}

/** Un campo que no llega queda como estaba; uno vacío se borra. */
function textoNuevo(valor: string | undefined, actual: string | null, nombre: string): string | null {
  if (valor === undefined) return actual;
  const t = typeof valor === "string" ? valor.trim() : "";
  if (t.length > MAXIMO_TEXTO_MEDICION) throw new ErrorIndicador(`${nombre} no puede pasar de ${MAXIMO_TEXTO_MEDICION} caracteres`);
  return t === "" ? null : t;
}

/** El antes y el después, sin escribir nada: la medición tiene resultado y lo nuevo alcanza lo exigido (`analisisCompleto`). */
function planDeAnalisis(ctx: Contexto, d: DatosDeAnalizar): { antes: TextosDeAnalisis; despues: TextosDeAnalisis } {
  const m = ctx.medicion;
  if (m.no_aplica === true) throw new ErrorIndicador(NO_APLICA);
  if (m.resultado_exacto === null || m.resultado_exacto === undefined) throw new ErrorIndicador(SIN_DATOS);
  const antes = analisisDe(m);
  const despues = {
    analisis: textoNuevo(d.analisis, antes.analisis, "El análisis"),
    causa: textoNuevo(d.causa, antes.causa, "La causa de la desviación"),
    accionPropuesta: textoNuevo(d.accionPropuesta, antes.accionPropuesta, "La acción propuesta"),
  };
  const exigido = exigidoDe(m);
  if (!analisisCompleto(exigido, despues)) throw new ErrorIndicador(faltaDe(exigido, m));
  return { antes, despues };
}

/**
 * Escribe el análisis de una medición con resultado (spec §8.4). Un campo que no llega queda como estaba y uno vacío se
 * borra, siempre que lo que quede alcance lo exigido. Lo mismo otra vez no deja nada. El Admin SGC analiza solo si nadie
 * más puede, y queda marcado (`sinMedidor`, spec §6.1).
 */
export async function analizar(sesion: SesionFlujo, d: DatosDeAnalizar, opciones?: Opciones): Promise<void> {
  if (!puede(sesion, "indicadores.medir")) throw new ErrorPermiso();
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  planDeAnalisis(await contextoDeMedicion(sql, sesion, d.medicionId, false, CON_ANALISTA), d);

  await enTransaccion(sql, async (tx) => {
    const ctx = await contextoDeMedicion(tx, sesion, d.medicionId, true, CON_ANALISTA);
    const { antes, despues } = planDeAnalisis(ctx, d);
    if (JSON.stringify(antes) === JSON.stringify(despues)) return;
    const m = ctx.medicion;
    const [previo] = await tx`SELECT 1 AS hay FROM medicion_eventos WHERE medicion_id = ${m.id} AND tipo = 'analisis' LIMIT 1`;
    await tx`UPDATE mediciones SET analisis = ${despues.analisis}, causa = ${despues.causa}, accion_propuesta = ${despues.accionPropuesta},
        analizada_por = ${sesion.usuarioId}, analizada_en = ${ahora}
      WHERE id = ${m.id}`;
    const detalle = { antes, despues, ...(ctx.capacidad.sinMedidor ? { sinMedidor: true } : {}) };
    await recalcularMedicion(tx, m.id, { ahora, actorId: sesion.usuarioId, evento: "analisis", detalle });
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "medicion_analizada",
      entidad: "medicion",
      entidadId: m.id,
      detalle: { codigo: ctx.indicador.codigo, indicadorId: ctx.indicador.id, periodo: m.periodo, primera: previo === undefined, ...detalle },
    });
  });
}

/** Lo que `FormularioAnalisis` necesita de una medición (spec §8.4), en texto para el navegador. */
export type DatosDeAnalisis = TextosDeAnalisis & {
  medicionId: number;
  periodo: string;
  /** «Tercer trimestre de 2026». */
  etiqueta: string;
  exigido: AnalisisExigido;
  semaforo: Semaforo | null;
  repetido: boolean;
};

/**
 * El análisis de la medición para editarlo, o `null` si la persona no puede analizarla (no la ve, no analiza el
 * indicador, está retirado o la medición cerrada) o si aún no tiene resultado o está marcada «No aplica».
 */
export async function datosDeAnalisis(sesion: SujetoVisibilidad, medicionId: number, opciones?: Opciones): Promise<DatosDeAnalisis | null> {
  const sql = opciones?.sql ?? obtenerSql();
  let ctx: Contexto;
  try {
    ctx = await contextoDeMedicion(sql, sesion, medicionId, false, CON_ANALISTA);
  } catch (err) {
    if (err instanceof ErrorIndicador || err instanceof ErrorPermiso) return null;
    throw err;
  }
  const m = ctx.medicion;
  if (m.no_aplica === true || m.resultado_exacto === null || m.resultado_exacto === undefined) return null;
  return {
    medicionId: m.id,
    periodo: m.periodo as string,
    etiqueta: conMayuscula(ctx.periodo.etiqueta),
    exigido: exigidoDe(m),
    semaforo: (m.semaforo as Semaforo | null) ?? null,
    repetido: m.incumplimiento_repetido === true,
    ...analisisDe(m),
  };
}
