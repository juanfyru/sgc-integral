/**
 * Los históricos de un indicador (spec 14 §8.8 y F14-DC41, Tarea 10 de la 14A): los periodos que terminaron antes de
 * aprobarse la primera versión de la ficha. Entran solo por aquí, en la tabla del año y por lote; `reportar` los rechaza.
 * Los registra el Admin SGC o quien puede medir (`puedeRegistrarHistoricos`). Cada fila se valida como un reporte
 * (`planDeReporte`, sin la confirmación por variación y sin exigir soporte) y se escribe como él (`escribirReporte`), o
 * se marca «no aplica» con su motivo (`escribirNoAplica`, sin tocar sus valores), con el evento `historico` la primera vez
 * y `correccion` después. No piden análisis, no llevan «Requiere acción de mejora»
 * ni cuentan para el incumplimiento repetido: lo decide `recalcularMedicion`.
 *
 * Una sola transacción para el lote. Candados: el indicador `FOR SHARE` y cada medición `FOR UPDATE`, en el orden de sus
 * periodos (dos lotes del mismo indicador no se interbloquean), antes de sus valores.
 */
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { enTransaccion, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { puedeRegistrarHistoricos, puedeVerIndicador } from "@/lib/alcance";
import { periodoDe } from "@/lib/indicadores-documentales/periodo";
import { DIVISION_POR_CERO, DIVISION_POR_CERO_HISTORICO, reglaDeTexto } from "@/lib/indicadores/reporte";
import { textoValor } from "@/lib/indicadores/textos";
import { ErrorIndicador } from "@/lib/indicadores/tipos";
import { ErrorPermiso, puede } from "@/lib/permisos";
import { zonaHoraria } from "@/lib/zona-horaria";
import {
  asegurarMediciones,
  conMayuscula,
  contextoDeMedicion,
  escribirNoAplica,
  escribirReporte,
  motivoValido,
  NO_EXISTE,
  planDeReporte,
  reglaDelPeriodo,
  resultadoEnTexto,
} from "./mediciones";

type Opciones = { sql?: Cliente; ahora?: Date };

/** Lo que cabe en un lote: los meses de cinco años. */
export const MAXIMO_HISTORICOS = 60;

const NO_HISTORICO = "Ese periodo no es histórico: repórtelo por «Reportar»";

/** Una fila de la tabla del año: sus valores por letra o, con `noAplica`, el motivo (sus valores no se registran). */
type FilaHistorica = { periodo: string; valores: Record<string, string>; noAplica?: boolean; motivo?: string };

const enBlanco = (valores: Record<string, string>) => Object.values(valores).every((v) => typeof v !== "string" || v.trim() === "");

/**
 * Registra (o corrige) por lote los históricos del indicador (spec §8.8). Las filas en blanco se saltan (el formulario
 * manda todas): una fila en blanco no cambia lo ya registrado. Una fila que no sirve dice su periodo y no deja nada
 * escrito del lote. Una fila «no aplica» con valores la deja de ser. Devuelve cuántas filas cambiaron.
 */
export async function registrarHistoricos(
  sesion: SesionFlujo,
  d: { indicadorId: number; filas: FilaHistorica[] },
  opciones?: Opciones,
): Promise<{ registrados: number }> {
  if (!puede(sesion, "indicadores.medir")) throw new ErrorPermiso();
  if (!Array.isArray(d.filas)) throw new ErrorIndicador("Las filas no tienen un formato válido");
  if (d.filas.length > MAXIMO_HISTORICOS) throw new ErrorIndicador(`Registre hasta ${MAXIMO_HISTORICOS} periodos a la vez`);
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const zona = zonaHoraria();
  if (!(await puedeVerIndicador(d.indicadorId, sesion, { sql }))) throw new ErrorIndicador(NO_EXISTE);
  await asegurarMediciones({ sql, ahora, indicadorId: d.indicadorId });

  const etiquetaDe = (clave: string) => conMayuscula(periodoDe(clave, zona)?.etiqueta ?? clave);
  const vistas = new Set<string>();
  const llenas: FilaHistorica[] = [];
  for (const f of d.filas) {
    if (vistas.has(f.periodo)) throw new ErrorIndicador(`${etiquetaDe(f.periodo)} está dos veces`);
    vistas.add(f.periodo);
    if (f.noAplica === true || !enBlanco(f.valores)) llenas.push(f);
  }
  if (llenas.length === 0) return { registrados: 0 };

  return enTransaccion(sql, async (tx) => {
    const [i] = await tx`SELECT id, codigo FROM indicadores WHERE id = ${d.indicadorId} FOR SHARE`;
    if (!i || !(await puedeVerIndicador(Number(i.id), sesion, { sql: tx }))) throw new ErrorIndicador(NO_EXISTE);
    const mediciones = await tx`SELECT id, periodo FROM mediciones
      WHERE indicador_id = ${i.id} AND periodo IN ${tx(llenas.map((f) => f.periodo))} ORDER BY desde, id`;
    if (mediciones.length !== llenas.length) throw new ErrorIndicador(NO_EXISTE);

    let registrados = 0;
    for (const fila of mediciones) {
      const periodo = fila.periodo as string;
      const pedida = llenas.find((f) => f.periodo === periodo)!;
      const ctx = await contextoDeMedicion(tx, sesion, Number(fila.id), true, { exigir: puedeRegistrarHistoricos });
      if (ctx.medicion.historica !== true) throw new ErrorIndicador(NO_HISTORICO);
      // Lo que no sirve de la fila dice su periodo; la división por cero, cómo salir desde la tabla del año.
      const enLaFila = async <T>(paso: () => T | Promise<T>): Promise<T> => {
        try {
          return await paso();
        } catch (err) {
          if (!(err instanceof ErrorIndicador)) throw err;
          throw new ErrorIndicador(`${etiquetaDe(periodo)}: ${err.message === DIVISION_POR_CERO ? DIVISION_POR_CERO_HISTORICO : err.message}`);
        }
      };
      const motivo = pedida.noAplica === true ? await enLaFila(() => motivoValido(pedida.motivo ?? "")) : null;
      const escrito =
        motivo !== null
          ? await escribirNoAplica(tx, ctx, motivo, {
              usuarioId: sesion.usuarioId,
              ahora,
              evento: (primera) => (primera ? "historico" : "correccion"),
            })
          : await escribirReporte(
              tx,
              ctx,
              (await enLaFila(() => planDeReporte(tx, ctx, { medicionId: ctx.medicion.id, valores: pedida.valores, parcial: false, confirmado: true })))
                .valores,
              { usuarioId: sesion.usuarioId, ahora, primerEvento: "historico" },
            );
      if (!escrito?.r.cambio) continue;
      const { r, primera, detalle } = escrito;
      registrados += 1;
      const regla = reglaDeTexto(await reglaDelPeriodo(tx, ctx.indicador.id, periodo, ctx.version));
      await registrarAuditoria(tx, {
        usuarioId: sesion.usuarioId,
        accion: "medicion_historica_registrada",
        entidad: "medicion",
        entidadId: ctx.medicion.id,
        detalle: {
          codigo: ctx.indicador.codigo,
          indicadorId: ctx.indicador.id,
          periodo,
          correccion: !primera,
          ...(motivo !== null ? { noAplica: true, motivo } : {}),
          resultado: r.resultado ? textoValor(r.resultado, ctx.version.unidad, regla) : null,
          resultadoAntes: resultadoEnTexto(ctx.medicion.resultado_exacto, ctx.version, regla),
          semaforo: r.despues,
          ...detalle,
        },
      });
    }
    return { registrados };
  });
}
