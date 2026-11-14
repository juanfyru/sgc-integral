/**
 * La foto de cada periodo de un indicador automático y «Volver a calcular» (anexo 14B, §4 y §5.4). Los valores que nadie
 * digita los escriben solo `tomarFotos` y `volverACalcular`, en `medicion_valores` y sin usuario; el resultado, el semáforo
 * y el estado los sigue escribiendo solo `recalcularMedicion`.
 *
 * - **Cuándo** (`cuandoSeToma`): la de estado, en la primera revisión después del fin del periodo y solo del más reciente
 *   que terminó; la de flujo, en la primera después de vencer su plazo; la histórica de un cálculo que se llena hacia
 *   atrás, sin esperar. La toman la pasada de vencimientos y, antes de clasificar, el resumen y el cierre del mes; no la
 *   apertura de periodos, que corre al leer.
 * - **Sin nada que medir** (`fotoDe`): «No aplica» con el motivo del cálculo, sin valores.
 * - **El plazo del análisis:** la foto de flujo de una medición ordinaria llega cuando vence su plazo; la fecha límite se
 *   cuenta otra vez desde la foto, con el mismo plazo de reporte, y las marcas de aviso se limpian: el análisis no nace
 *   vencido. La de estado no mueve nada.
 * - **«Volver a calcular»** (quien administra, solo un cálculo de flujo ya fotografiado, hasta el cierre y nunca sobre una
 *   reabierta): toma otra vez el cálculo; si cambió, reescribe los valores o «no aplica», deja el evento `foto` con el antes
 *   y el después y la bitácora, y sigue las reglas de una corrección. No mueve la fecha límite.
 *
 * Candados: el indicador `FOR SHARE`, después la medición `FOR UPDATE`, todo releído bajo ellos; una transacción por
 * medición: la que falla se registra y se salta.
 */
import type { Row, TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { enTransaccion, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import type { ResultadoIndicadores } from "@/lib/indicadores-documentales/metas";
import { periodoDe, type Periodo } from "@/lib/indicadores-documentales/periodo";
import {
  calculoDe,
  fotoDe,
  type AlcanceDeCalculo,
  type ClaveDeCalculo,
  type DefinicionDeCalculo,
} from "@/lib/indicadores/calculos/registro";
import { cuandoSeToma, cuentaDesdeLaFoto, fechaLimiteDesdeLaFoto } from "@/lib/indicadores/fotos";
import { fraccion, type Fraccion } from "@/lib/indicadores/formula/fraccion";
import { versionQueRigeEntre } from "@/lib/indicadores/periodos";
import { reglaDeTexto, valorEnTexto } from "@/lib/indicadores/reporte";
import { textoValor } from "@/lib/indicadores/textos";
import { ErrorIndicador } from "@/lib/indicadores/tipos";
import { ErrorPermiso, puede } from "@/lib/permisos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { tomarCalculo, type ValoresDeCalculo } from "./calculos";
import {
  contextoDeMedicion,
  esDeOtraPeriodicidad,
  NO_EXISTE,
  recalcularMedicion,
  reglaDelPeriodo,
  resultadoEnTexto,
  valoresPorLetra,
  versionesAprobadas,
  versionesAprobadasDe,
  type CondicionDePersona,
  type Contexto,
  type Recalculo,
  type VersionDeCalculo,
} from "./mediciones";

/** Cuántas fotos de un mismo indicador toma una pasada: los históricos de un cálculo que se llena hacia atrás pueden ser muchos. */
const MAXIMO_POR_INDICADOR = 12;

/** Las que leen otras mediciones van al final, en este orden: «Objetivos cumplidos» cuenta también la de «Reportes a tiempo». */
const AL_FINAL: readonly ClaveDeCalculo[] = ["reportes_a_tiempo", "objetivos_cumplidos"];

const NO_LA_CALCULA = "Este periodo no lo calcula el sistema";
const SIN_FOTO = "El sistema todavía no ha calculado este periodo";
const UNA_SOLA_VEZ = "La foto de este cálculo se toma una sola vez";
const CONGELADA = "La foto quedó congelada con el cierre: reabrirla solo deja cambiar el análisis";
const SIN_RESULTADO = "sin resultado";
const NO_APLICA = "No aplica";

/** Lo que dice `fotoDe`: los valores por letra, o «no aplica» con su motivo. */
export type Foto = ReturnType<typeof fotoDe>;

/** Una medición que espera su foto, para un `WHERE` sobre `mediciones m`: abierta, sin foto, sin datos ni «no aplica». */
const esperaFoto = (sql: Cliente) => sql`m.estado = 'abierta' AND m.foto_en IS NULL AND m.reportada_en IS NULL AND NOT m.no_aplica`;

/** La misma condición sobre la fila ya leída y bloqueada. */
const sigueEsperando = (m: Row) => m.estado === "abierta" && m.foto_en === null && m.reportada_en === null && m.no_aplica !== true;

type QueToca = { version: VersionDeCalculo; definicion: DefinicionDeCalculo; alcance: AlcanceDeCalculo; periodo: Periodo };

/**
 * La foto que le toca a la medición `m` a `ahora`, o `null`: la versión que rige su periodo es automática, de su
 * periodicidad, y su momento (`cuandoSeToma`) ya pasó.
 */
function fotoQueToca(m: Row, versiones: readonly VersionDeCalculo[], ahora: Date, zona: string): QueToca | null {
  const clave = m.periodo as string;
  const periodo = periodoDe(clave, zona);
  const version = periodo ? versionQueRigeEntre(versiones, periodo, zona) : null;
  if (!periodo || !version || esDeOtraPeriodicidad(clave, version) || version.origenDato !== "automatico") return null;
  const definicion = version.calculoAutomatico ? calculoDe(version.calculoAutomatico.clave) : null;
  if (!definicion || !version.periodicidad) return null;
  const cuando = cuandoSeToma(
    definicion,
    { hasta: periodo.hasta, venceEn: new Date(m.vence_en as string), historica: m.historica === true, periodicidad: version.periodicidad },
    ahora,
    zona,
  );
  if (cuando === null || cuando.getTime() >= ahora.getTime()) return null;
  return { version, definicion, alcance: version.calculoAutomatico!.alcance as AlcanceDeCalculo, periodo };
}

/** Los valores del sistema por letra de la versión, exactos; un valor que no es un número es un error, no una cifra. */
function valoresExactos(version: VersionDeCalculo, valores: Readonly<Record<string, string>>): Record<string, Fraccion> {
  const salida: Record<string, Fraccion> = {};
  for (const v of version.variables) {
    const f = fraccion(valores[v.letra] ?? "");
    if (!f) throw new Error(`El cálculo no dio un número para la variable ${v.letra}`);
    salida[v.letra] = f;
  }
  return salida;
}

/** Deja en la medición los valores del sistema de la versión que rige, sin usuario; sin valores (`null`), ninguno. */
async function escribirValoresDelSistema(
  tx: TransactionSql,
  medicionId: number,
  version: VersionDeCalculo,
  valores: Readonly<Record<string, Fraccion>> | null,
  ahora: Date,
): Promise<void> {
  await tx`DELETE FROM medicion_valores WHERE medicion_id = ${medicionId} AND categoria_id IS NULL`;
  if (!valores) return;
  for (const v of version.variables) {
    await tx`INSERT INTO medicion_valores (medicion_id, variable_id, valor, reportado_por, reportado_en)
      VALUES (${medicionId}, ${v.id}, ${valorEnTexto(valores[v.letra])}, NULL, ${ahora})`;
  }
}

/** Los valores y «no aplica» en el texto de los eventos: una clave por letra de la versión, con `null` si no hay. */
function enTexto(
  version: VersionDeCalculo,
  valores: Readonly<Record<string, Fraccion>> | null,
  motivo: string | null,
): Record<string, string | boolean | null> {
  return {
    ...Object.fromEntries(version.calculo.letras.map((l) => [l, valores?.[l] ? valorEnTexto(valores[l]) : null])),
    noAplica: motivo !== null,
    motivo,
  };
}

/**
 * Escribe la foto de una medición que la espera, con los candados tomados: sus valores (o «no aplica» con el motivo del
 * cálculo), quién y cuándo (`reportada_por` nulo: el sistema), cuándo se tomó (`foto_en`) y, en un cálculo de flujo de una
 * medición ordinaria, la fecha límite del análisis contada desde la foto, con las marcas de aviso limpias. Después el cálculo
 * único, con el evento `foto` sin usuario. Lo usan `tomarFotos` y las pruebas que simulan una foto.
 */
export async function escribirFoto(
  tx: TransactionSql,
  m: { id: number; historica: boolean },
  c: { version: VersionDeCalculo; definicion: DefinicionDeCalculo; alcance: string; plazoDias: number; foto: Foto; ahora: Date },
): Promise<Recalculo> {
  const antes = enTexto(c.version, await valoresPorLetra(tx, m.id, c.version), null);
  const valores = "valores" in c.foto ? valoresExactos(c.version, c.foto.valores) : null;
  const motivo = "noAplica" in c.foto ? c.foto.noAplica : null;
  await escribirValoresDelSistema(tx, m.id, c.version, valores, c.ahora);
  const vence = cuentaDesdeLaFoto({ clase: c.definicion.clase, historica: m.historica, fotoEn: c.ahora })
    ? fechaLimiteDesdeLaFoto(c.ahora, c.plazoDias, zonaHoraria())
    : null;
  await tx`UPDATE mediciones SET reportada_en = ${c.ahora}, reportada_por = NULL, foto_en = ${c.ahora},
      no_aplica = ${motivo !== null}, no_aplica_motivo = ${motivo}
      ${vence ? tx`, vence_en = ${vence}, aviso_previo_en = NULL, aviso_vencido_en = NULL, escalado_en = NULL` : tx``}
    WHERE id = ${m.id}`;
  const despues = enTexto(c.version, valores, motivo);
  return recalcularMedicion(tx, m.id, {
    ahora: c.ahora,
    actorId: null,
    evento: "foto",
    detalle: {
      calculo: c.definicion.clave,
      alcance: c.alcance,
      ...(motivo !== null ? { noAplica: motivo } : { valores: Object.fromEntries(c.version.calculo.letras.map((l) => [l, despues[l]])) }),
      ...(vence ? { venceEn: vence.toISOString() } : {}),
      antes,
      despues,
    },
  });
}

/** La foto de una medición en su transacción: «valores», «no_aplica», o `null` si bajo el candado ya no le tocaba. */
async function fotografiar(
  tx: TransactionSql,
  medicionId: number,
  ahora: Date,
  memo: Map<string, ResultadoIndicadores>,
): Promise<"valores" | "no_aplica" | null> {
  const [i] = await tx`SELECT id, proceso_id, estado, plazo_reporte_dias FROM indicadores
    WHERE id = (SELECT indicador_id FROM mediciones WHERE id = ${medicionId}) FOR SHARE`;
  if (!i || i.estado !== "activo") return null;
  const [m] = await tx`SELECT * FROM mediciones WHERE id = ${medicionId} FOR UPDATE`;
  if (!m || !sigueEsperando(m)) return null;
  const indicadorId = Number(i.id);
  const toca = fotoQueToca(m, await versionesAprobadas(tx, indicadorId), ahora, zonaHoraria());
  if (!toca) return null;
  const tomado: ValoresDeCalculo = await tomarCalculo(
    tx,
    {
      clave: toca.definicion.clave,
      alcance: toca.alcance,
      procesoId: Number(i.proceso_id),
      indicadorId,
      periodo: { clave: toca.periodo.clave, desde: toca.periodo.desde, hasta: toca.periodo.hasta },
      ahora,
    },
    memo,
  );
  const foto = fotoDe(toca.definicion, tomado);
  await escribirFoto(
    tx,
    { id: medicionId, historica: m.historica === true },
    { version: toca.version, definicion: toca.definicion, alcance: toca.alcance, plazoDias: Number(i.plazo_reporte_dias), foto, ahora },
  );
  return "noAplica" in foto ? "no_aplica" : "valores";
}

/**
 * Toma las fotos que tocan a `ahora` (anexo 14B, §5.4): de cada medición abierta, sin foto, sin datos ni «no aplica», de un
 * indicador activo, cuya versión que rige el periodo es automática y cuyo momento ya pasó; con `indicadorId`, solo las de
 * ese. A lo sumo `maximoPorIndicador` por indicador (12), de la más antigua a la más reciente: el resto, en la siguiente
 * pasada. «Reportes a tiempo» y «Objetivos cumplidos» van al final: leen otras mediciones, también las que esta pasada
 * acaba de fotografiar. `tomadas` cuenta las fotos con valores y `noAplica`, las que quedaron «No aplica».
 */
export async function tomarFotos(opciones: {
  sql: Cliente;
  ahora: Date;
  indicadorId?: number;
  maximoPorIndicador?: number;
}): Promise<{ tomadas: number; noAplica: number }> {
  const { sql, ahora } = opciones;
  const maximo = opciones.maximoPorIndicador ?? MAXIMO_POR_INDICADOR;
  const total = { tomadas: 0, noAplica: 0 };
  const filas = await sql`SELECT m.id, m.indicador_id, m.periodo, m.vence_en, m.historica
    FROM mediciones m JOIN indicadores i ON i.id = m.indicador_id
    WHERE ${esperaFoto(sql)} AND i.estado = 'activo'
      AND EXISTS (SELECT 1 FROM indicador_versiones v
        WHERE v.indicador_id = i.id AND v.estado = 'aprobada' AND v.origen_dato = 'automatico')
      ${opciones.indicadorId !== undefined ? sql`AND i.id = ${opciones.indicadorId}` : sql``}
    ORDER BY m.indicador_id, m.desde, m.id`;
  if (filas.length === 0) return total;
  const zona = zonaHoraria();
  const versiones = await versionesAprobadasDe(sql, filas.map((f) => Number(f.indicador_id)));
  const porIndicador = new Map<number, number>();
  const candidatas: { id: number; orden: number }[] = [];
  for (const f of filas) {
    const indicadorId = Number(f.indicador_id);
    const toca = fotoQueToca(f, versiones.get(indicadorId) ?? [], ahora, zona);
    const n = porIndicador.get(indicadorId) ?? 0;
    if (!toca || n >= maximo) continue;
    porIndicador.set(indicadorId, n + 1);
    candidatas.push({ id: Number(f.id), orden: AL_FINAL.indexOf(toca.definicion.clave) + 1 });
  }
  candidatas.sort((a, b) => a.orden - b.orden);
  // Una pasada, una hora, un memo: guarda resultados de la Vigencia de toda la entidad y no sale de aquí.
  const memo = new Map<string, ResultadoIndicadores>();
  for (const c of candidatas) {
    try {
      const r = await enTransaccion(sql, (tx) => fotografiar(tx, c.id, ahora, memo));
      if (r === "valores") total.tomadas += 1;
      else if (r === "no_aplica") total.noAplica += 1;
    } catch (err) {
      console.error(`No se pudo tomar la foto de la medición ${c.id}:`, err);
    }
  }
  return total;
}

// ─────────────────────────────────────────────────────────────────────────────
// Volver a calcular
// ─────────────────────────────────────────────────────────────────────────────

/** El permiso ya se exigió: quien administra vuelve a calcular sin medir ni analizar el indicador. */
const ADMINISTRA: CondicionDePersona = async () => ({ puede: true, sinMedidor: false });
const COMO_ADMINISTRADOR = { exigir: ADMINISTRA, digita: false } as const;

/** Lo que debe cumplir la medición (`contextoDeMedicion` ya rechazó la cerrada): una foto de un cálculo de flujo, sin reabrir. */
function exigirRecalculable(ctx: Contexto): { definicion: DefinicionDeCalculo; alcance: AlcanceDeCalculo } {
  const { version, medicion: m } = ctx;
  const definicion = version.origenDato === "automatico" && version.calculoAutomatico ? calculoDe(version.calculoAutomatico.clave) : null;
  if (!definicion) throw new ErrorIndicador(NO_LA_CALCULA);
  if (definicion.clase === "estado") throw new ErrorIndicador(UNA_SOLA_VEZ);
  if (m.reabierta_en !== null) throw new ErrorIndicador(CONGELADA);
  if (m.foto_en === null) throw new ErrorIndicador(SIN_FOTO);
  return { definicion, alcance: version.calculoAutomatico!.alcance as AlcanceDeCalculo };
}

/**
 * «Volver a calcular» (anexo 14B, §5.4): quien administra toma otra vez el cálculo de flujo de una medición ya fotografiada,
 * mientras no se haya cerrado ni reabierto. Si los valores o «no aplica» cambiaron, los reescribe, actualiza la hora de la
 * foto, recalcula con el evento `foto` (`recalculo: true`, el antes y el después) y deja la bitácora
 * (`medicion_foto_recalculada`, con el resultado de antes y el de después); las alertas, como en una corrección. Si nada
 * cambió, no escribe nada. Valida fuera de la transacción lo que puede y lo repite dentro, con los candados.
 */
export async function volverACalcular(
  sesion: SesionFlujo,
  medicionId: number,
  opciones?: { sql?: Cliente; ahora?: Date },
): Promise<{ cambio: boolean }> {
  if (!puede(sesion, "indicadores.administrar")) throw new ErrorPermiso();
  if (!Number.isSafeInteger(medicionId) || medicionId <= 0) throw new ErrorIndicador(NO_EXISTE);
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  exigirRecalculable(await contextoDeMedicion(sql, sesion, medicionId, false, COMO_ADMINISTRADOR));

  return enTransaccion(sql, async (tx) => {
    const ctx = await contextoDeMedicion(tx, sesion, medicionId, true, COMO_ADMINISTRADOR);
    const { definicion, alcance } = exigirRecalculable(ctx);
    const { medicion: m, version, indicador } = ctx;
    const [i] = await tx`SELECT proceso_id FROM indicadores WHERE id = ${indicador.id}`;
    const foto = fotoDe(
      definicion,
      await tomarCalculo(tx, {
        clave: definicion.clave,
        alcance,
        procesoId: Number(i.proceso_id),
        indicadorId: indicador.id,
        periodo: { clave: ctx.periodo.clave, desde: ctx.periodo.desde, hasta: ctx.periodo.hasta },
        ahora,
      }),
    );
    const valores = "valores" in foto ? valoresExactos(version, foto.valores) : null;
    const motivo = "noAplica" in foto ? foto.noAplica : null;
    const guardados = await valoresPorLetra(tx, m.id, version);
    const antes = enTexto(version, m.no_aplica === true ? null : guardados, m.no_aplica === true ? ((m.no_aplica_motivo as string | null) ?? "") : null);
    const despues = enTexto(version, valores, motivo);
    if (JSON.stringify(antes) === JSON.stringify(despues)) return { cambio: false };

    const regla = reglaDeTexto(await reglaDelPeriodo(tx, indicador.id, m.periodo as string, version));
    const resultadoAntes = m.no_aplica === true ? NO_APLICA : (resultadoEnTexto(m.resultado_exacto, version, regla) ?? SIN_RESULTADO);
    await escribirValoresDelSistema(tx, m.id, version, valores, ahora);
    await tx`UPDATE mediciones SET foto_en = ${ahora}, no_aplica = ${motivo !== null}, no_aplica_motivo = ${motivo} WHERE id = ${m.id}`;
    const r = await recalcularMedicion(tx, m.id, { ahora, actorId: sesion.usuarioId, evento: "foto", detalle: { recalculo: true, antes, despues } });
    const resultadoDespues = motivo !== null ? NO_APLICA : r.resultado ? textoValor(r.resultado, version.unidad, regla) : SIN_RESULTADO;
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "medicion_foto_recalculada",
      entidad: "medicion",
      entidadId: m.id,
      detalle: { codigo: indicador.codigo, indicadorId: indicador.id, periodo: m.periodo, antes: resultadoAntes, despues: resultadoDespues },
    });
    return { cambio: true };
  });
}
