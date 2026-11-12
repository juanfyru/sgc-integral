/**
 * Las alertas de resultado de una medición (spec 14 §10.3, F14-DC20 y F14-DC30). `recalcularMedicion` llama `alRecalcular`
 * en su misma transacción, con la medición bloqueada, cada vez que cambió una columna calculada; aquí se decide por el
 * último nivel alertado (`mediciones.alerta_estado`): un recálculo que no cambia el nivel (un análisis, un soporte, una
 * reapertura) no vuelve a avisar.
 *
 * Nivel de alerta: `critico` con un resultado crítico o con incumplimiento repetido (el color no cambia: lo dice el
 * texto), `atencion` con uno en atención y ninguno en lo demás (bien, sin meta, «no aplica»). Si el nivel cambió y nada se
 * había alertado, es una alerta (`indicadores.alerta`); si ya se había alertado, una corrección (`indicadores.correccion`)
 * a los destinatarios del nivel anterior y del nuevo. «Atención» va a quienes analizan y a quienes hacen seguimiento;
 * «Crítico», además, a los líderes del proceso y a los Admin SGC. Nunca a quien hizo el cambio. Un histórico no alerta ni
 * guarda nada (spec §8.8).
 *
 * Los textos salen del cálculo y de la medición, nunca del detalle de un evento: ningún aviso lleva contenido de un
 * soporte (spec §10.4 y §21). Sin fila en `auditoria`: el rastro es el evento de quien hizo el cambio.
 *
 * Los avisos entran con `crearNotificacion` y no con `avisarA`: `avisos-vencimiento` importa `estructura`, que importa
 * `admin`, que llega a `mediciones` por los soportes; desde aquí cerraría el ciclo.
 */
import type { TransactionSql } from "postgres";
import { crearNotificacion } from "@/db/consultas/notificaciones";
import { adminsActivos, lideresDeProceso } from "@/db/consultas/tramites";
import { responsablesDeAnalizar } from "@/lib/alcance";
import { periodoDe } from "@/lib/indicadores-documentales/periodo";
import { reglaDeTexto } from "@/lib/indicadores/reporte";
import { fraseDeResultado, resultadoFrenteAMeta } from "@/lib/indicadores/textos";
import { ETIQUETA_SEMAFORO, type ModoSemaforo, type Semaforo, type Tendencia } from "@/lib/indicadores/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { obtenerParametros } from "./maestros";
import type { Recalculo } from "./mediciones";

type Nivel = "atencion" | "critico";

/** El nivel de alerta del resultado: el incumplimiento repetido se alerta como crítico (spec §10.3). */
const nivelDe = (r: Recalculo): Nivel | null =>
  r.despues === "critico" || r.repetido ? "critico" : r.despues === "atencion" ? "atencion" : null;

const texto = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

/** Quienes reciben el nivel: los que analizan y hacen seguimiento; en crítico, además, los líderes del proceso y los Admin SGC. */
async function destinatarios(tx: TransactionSql, m: { indicadorId: number; procesoId: number }, nivel: Nivel | null): Promise<number[]> {
  if (nivel === null) return [];
  const siguen = await tx`SELECT DISTINCT d.usuario_id FROM indicador_designados d JOIN usuarios u ON u.id = d.usuario_id AND u.activo
    WHERE d.indicador_id = ${m.indicadorId} AND d.funcion = 'seguimiento'`;
  const ids = [...(await responsablesDeAnalizar(m.indicadorId, { sql: tx })), ...siguen.map((f) => Number(f.usuario_id))];
  if (nivel === "critico") ids.push(...(await lideresDeProceso(m.procesoId, { sql: tx })), ...(await adminsActivos({ sql: tx })));
  return ids;
}

/** «Crítico», «Atención con 3 periodos sin cumplir», «Bien»; sin semáforo, `sinSemaforo`. */
function estadoEnPalabras(semaforo: Semaforo | null, repetido: boolean, periodos: number, sinSemaforo: string): string {
  if (semaforo === null) return sinSemaforo;
  return semaforo === "atencion" && repetido ? `Atención con ${periodos} periodos sin cumplir` : ETIQUETA_SEMAFORO[semaforo];
}

export async function alRecalcular(tx: TransactionSql, r: Recalculo, c: { ahora: Date; actorId: number | null }): Promise<void> {
  if (r.historica) return;
  const nivel = nivelDe(r);
  const [m] = await tx`SELECT m.periodo, m.no_aplica, m.no_aplica_motivo, m.meta_aplicada, m.meta_max_aplicada, m.alerta_estado,
      i.codigo, i.proceso_id, p.nombre AS proceso, v.nombre, v.tendencia, v.semaforo_modo, v.umbral_atencion_pct, v.limite_critico,
      v.tolerancia, v.unidad_sufijo, v.decimales
    FROM mediciones m JOIN indicadores i ON i.id = m.indicador_id JOIN procesos p ON p.id = i.proceso_id
    JOIN indicador_versiones v ON v.id = m.version_id
    WHERE m.id = ${r.medicionId}`;
  const guardado = (m.alerta_estado as Nivel | null) ?? null;
  if (nivel === guardado) return;

  const codigo = m.codigo as string;
  const nombre = (m.nombre as string | null) ?? codigo;
  const etiqueta = periodoDe(m.periodo as string, zonaHoraria())?.etiqueta ?? (m.periodo as string);
  const periodo = etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1);
  // La regla con la meta congelada en la medición: la misma con la que se calculó.
  const regla = reglaDeTexto({
    tendencia: (m.tendencia as Tendencia | null) ?? "ascendente",
    meta: texto(m.meta_aplicada),
    metaMax: texto(m.meta_max_aplicada),
    modo: (m.semaforo_modo as ModoSemaforo | null) ?? null,
    umbralPct: m.umbral_atencion_pct === null ? null : Number(m.umbral_atencion_pct),
    limite: texto(m.limite_critico),
    tolerancia: texto(m.tolerancia),
  });
  const unidad = { sufijo: (m.unidad_sufijo as string | null) ?? "", decimales: m.decimales === null ? 0 : Number(m.decimales) };
  const noAplica = m.no_aplica === true;
  const repetidoAntes = guardado === "critico" && r.antes === "atencion";
  const periodos = r.repetido || repetidoAntes ? (await obtenerParametros({ sql: tx })).incumplimientoPeriodos : 0;
  const estado = estadoEnPalabras(r.despues, r.repetido, periodos, noAplica ? "No aplica" : r.resultado ? "Sin meta" : "Sin dato");
  const donde = { indicadorId: r.indicadorId, procesoId: Number(m.proceso_id) };
  const sinQuienCambio = (ids: number[]) => [...new Set(ids)].filter((u) => u !== c.actorId);
  const avisar = async (tipo: string, titulo: string, cuerpo: string, para: number[]) => {
    const enlace = `/indicadores/${encodeURIComponent(codigo)}`;
    for (const usuarioId of para) {
      await crearNotificacion({ usuarioId, tipo, titulo, cuerpo, enlace, entidad: "medicion", entidadId: r.medicionId }, tx);
    }
  };

  if (guardado === null) {
    const frente = resultadoFrenteAMeta({ resultado: r.resultado, semaforo: r.despues }, regla, unidad);
    const titulo = `${nombre}: ${frente ? `${frente}, ` : ""}${estado}. ${periodo}`;
    const cuerpo = `${codigo} · ${m.proceso as string}`;
    await avisar("indicadores.alerta", titulo, cuerpo, sinQuienCambio(await destinatarios(tx, donde, nivel)));
  } else {
    // El nivel crítico de un incumplimiento repetido se alertó sobre un color en atención.
    const antes = guardado === "critico" ? (repetidoAntes ? estadoEnPalabras("atencion", true, periodos, "") : "Crítico") : "Atención";
    const titulo = `Corrección: ${nombre} pasó de ${antes} a ${estado}. ${periodo}`;
    const frase = fraseDeResultado({ resultado: r.resultado, semaforo: r.despues, noAplica, motivo: texto(m.no_aplica_motivo) }, regla, unidad);
    const cuerpo = `${codigo} · ${frase}`;
    const para = sinQuienCambio([...(await destinatarios(tx, donde, guardado)), ...(await destinatarios(tx, donde, nivel))]);
    await avisar("indicadores.correccion", titulo, cuerpo, para);
  }
  await tx`UPDATE mediciones SET alerta_estado = ${nivel} WHERE id = ${r.medicionId}`;
}
