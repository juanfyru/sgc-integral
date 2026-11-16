/**
 * La propagación de los valores ajenos (anexo 14C, §3.2 a §3.4 y §6.3): el valor de un dato compartido, juntado a la
 * periodicidad de cada indicador que lo usa (`valorDeDato`), y el de un componente, su resultado o su porcentaje de
 * cumplimiento en el periodo (`valorDeComponente`), se copian a cada medición abierta que los espera, en `medicion_valores`,
 * sin usuario y con su fracción exacta cuando no cabe en cuatro decimales; después el cálculo único la calcula sola
 * (`recalcularMedicion`, `sistema: "fuente"`). Es la gemela de `tomarFotos` (`fotos.ts`) para lo que reporta una persona en
 * otro lugar.
 *
 * - **A quién:** las mediciones sin cerrar y no históricas de los indicadores activos con inicio de medición cuya versión
 *   con que se calcula (`versionesDeCalculo`) es de su periodicidad y tiene variables ajenas.
 * - **Por niveles:** recorre los indicadores por nivel de dependencia (`nivelesBajo` ascendente: primero quien solo toma
 *   datos o indicadores simples) y revisa cada nivel después de escribir el anterior, así una sola llamada deja al día a un
 *   compuesto de compuestos. Las aristas son las de las fichas vigentes (`aristasDeComponentes`) y las de las versiones con
 *   que se calculan las mediciones candidatas. Con `indicadorIds`, esos y los que dependen de ellos por sus fichas vigentes
 *   (`porNiveles`).
 * - **Idempotente:** compara la fracción copiada con la de la fuente y solo escribe si difieren, o si una medición sin
 *   variables propias ya tiene todo y aún no está reportada, o si su «No aplica» del sistema dejó de ser cierto.
 * - **Escribe solo lo ajeno:** la fila de la variable en la versión con que se calcula, sin quien la reportó, y quita las
 *   que el sistema copió en otra versión para la misma letra; si la fuente dejó de tener valor, quita la fila. Nunca toca lo
 *   que digitó una persona. Lo copiado en otra versión desde **otra fuente** (un cambio mayor cambió de dónde sale la letra)
 *   no se lee como el valor de la fuente nueva (`elegirValores`): se quita sin más (`filasDeOtraFuente`), y su cifra no va al
 *   «antes» de ningún evento, que podría leer quien no ve la fuente anterior (anexo 14C, §6.5).
 * - **Quién reportó:** en un indicador sin variables propias, el sistema, al llegar el último valor (`reportada_en`, sin
 *   usuario); en un mixto, nadie más que quien mide, salvo el contagio.
 * - **El contagio** (§6.3): si un componente no aplicó en el periodo, la medición queda «No aplica» con
 *   `MOTIVO_COMPONENTE_NO_APLICA` (el motivo no lo nombra: su id va en `detalle.componente` del evento) y reportada por el
 *   sistema si no lo estaba; cuando el componente vuelve a aplicar, se quita y se recalcula, y el reporte que puso el
 *   contagio se devuelve: en un mixto lo da quien mide, y sin variables propias, el sistema cuando estén todos los valores.
 * - **Sin nada que medir** (§3.4): con todos los valores y la medición reportada, si la fórmula divide por cero, «No aplica»
 *   con `MOTIVO_NADA_QUE_MEDIR`; si después deja de dividir por cero, se quita. El contagio manda sobre él. Un «No aplica» de
 *   una persona no se toca.
 * - **El plazo** (§3.4): si la medición pasa de no pedir el análisis a pedirlo y su fecha límite ya pasó (o el plazo es 0),
 *   se cuenta otra vez desde hoy con el mismo plazo (`laFuenteMueveElPlazo`), con las marcas de aviso limpias y `venceEn` en
 *   el evento, que guarda además la fecha que tenía (`venceAntes`: contra ella se sigue juzgando el reporte). Vale igual para un dato y para un componente, y cuando el contagio se quita y un mixto vuelve a pedir el
 *   reporte de quien mide, si el contagio había llegado a tiempo (`contagioATiempo`); si llegó tarde, nada se toca.
 * - **El evento es del sistema** (`propagacion`, sin usuario): qué cambió de cada fuente (`detalle.fuentes`, con la letra,
 *   la clase, el id del dato o del indicador y el antes y el después) y los valores de todas las letras a los dos lados.
 *
 * Candados: el indicador `FOR SHARE`, después la medición `FOR UPDATE`, todo releído bajo ellos; la fuente (el dato o las
 * mediciones del componente) se lee sin candado: la medición que depende no bloquea la de su fuente. Primero se buscan sin
 * candado las mediciones a las que les cambiaría algo, y cada una va en su transacción: la que falla se registra, cuenta en
 * `fallidas` y la siguiente pasada la intenta otra vez. Corre justo después de la acción que cambia una fuente
 * (`propagarSinFallar`), en la pasada de vencimientos, antes de clasificar en el resumen y el cierre del mes, y cuando un
 * camino de lectura abre mediciones (`asegurarMedicionesConFuentes`).
 *
 * Módulo liviano: lo importan las acciones, la pasada y el cierre, así que no importa `lectura`, `fichas`, `aprobacion` ni
 * `operacion`. `valorDeComponente` vive aquí y no en `componentes.ts`, que no puede importar `mediciones` (cerraría el ciclo
 * `componentes → mediciones → maestros → componentes`).
 */
import type { Row, TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { enTransaccion } from "@/db/consultas/flujo/contrato";
import { periodoDe, type Periodo } from "@/lib/indicadores-documentales/periodo";
import { acumulado, juntadoONada } from "@/lib/indicadores/acumulado";
import { calcular } from "@/lib/indicadores/calculo";
import { porcentajeDeCumplimiento } from "@/lib/indicadores/cumplimiento";
import { cumpleDeFila } from "@/lib/indicadores/estados";
import { aTexto, comparar, deTexto, fraccion, type Fraccion } from "@/lib/indicadores/formula/fraccion";
import { nivelesBajo, porNiveles } from "@/lib/indicadores/grafo";
import { clavesFinas, contiene, periodicidadDe, versionQueRigeEntre } from "@/lib/indicadores/periodos";
import { esAjena } from "@/lib/indicadores/origen";
import { fichaDeCalculo, reglaDeTexto, valorEnTexto, type ReglaEnTexto } from "@/lib/indicadores/reporte";
import { rachasDe } from "@/lib/indicadores/resultados";
import type { Regla } from "@/lib/indicadores/semaforo";
import type { CategoriaDeMedicion } from "@/lib/indicadores/categorias";
import {
  MOTIVO_COMPONENTE_NO_APLICA,
  MOTIVO_DATO_SIN_CATEGORIA,
  MOTIVO_NADA_QUE_MEDIR,
  MOTIVO_TODAS_NO_APLICAN,
  type Consolidacion,
  type Periodicidad,
  type Semaforo,
  type Toma,
} from "@/lib/indicadores/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { aristasDeComponentes } from "./componentes";
import {
  asegurarMediciones,
  celdasDeFilas,
  celdasPorCategoria,
  columnasDeValor,
  detalleDeCategorias,
  elegirValores,
  esDeOtraPeriodicidad,
  escribirCelda,
  escribirTotal,
  filasDeOtraFuente,
  filasDeValores,
  listaDe,
  mide,
  mismoTotal,
  plazoPorLaFuente,
  primeraAprobada,
  recalcularMedicion,
  texto,
  totalDeRejilla,
  tramos,
  valoresPorLetra,
  versionesAprobadas,
  versionesAprobadasDe,
  versionesDeCalculo,
  type CambioDeCelda,
  type CambioDeFila,
  type ValorGuardado,
  type VersionDeCalculo,
} from "./mediciones";

type Opciones = { sql?: Cliente; ahora?: Date; indicadorIds?: readonly number[] };

/**
 * El valor de un dato juntado para un periodo: listo, con los periodos del dato que se juntaron, o falta alguno. Por categoría,
 * además, `sin_categoria`: todos los periodos del dato están reportados y ninguno la trae en su lista (anexo 14C, §5.7), con
 * esos periodos.
 */
export type ValorDeDato =
  | { estado: "listo"; valor: Fraccion; periodos: number[] }
  | { estado: "falta" }
  | { estado: "sin_categoria"; periodos: number[] };

/**
 * Lo que tiene un componente para el periodo de un compuesto (anexo 14C, §6.3): listo, con las mediciones del componente
 * que entraron al valor y, si es un acumulado que no empieza con el periodo del compuesto, la clave del primero que entró;
 * falta algo; o no aplicó, con las mediciones que lo deciden (las «entradas» del cierre, como las de un valor listo).
 * `incompleto` solo lo pone el modo del acumulado del año (`valorDeComponenteSobre` con `acumulado`): se saltó un periodo
 * ordinario sin dato.
 */
export type ValorDeComponente =
  | { estado: "listo"; valor: Fraccion; mediciones: number[]; desde: string | null; incompleto?: true }
  | { estado: "falta" }
  | { estado: "no_aplica"; mediciones: number[] };

/** Lo que tiene la fuente de una variable ajena para la medición. `no_aplica`, el de un componente, con su id. */
export type ValorAjeno = { estado: "listo"; valor: Fraccion } | { estado: "falta" } | { estado: "no_aplica"; fuenteId: number };

type Variable = VersionDeCalculo["variables"][number];

type DatoDelPeriodo = { datoId: number; consolidacion: Consolidacion; datoPeriodicidad: Periodicidad; periodo: string; categoriaId?: number };

// ─────────────────────────────────────────────────────────────────────────────
// La fuente: un dato compartido
// ─────────────────────────────────────────────────────────────────────────────

/** Los periodos con valor (`reportado` o `cerrado`) de los datos, sin candado: de todos sus periodos, para juntar. */
async function filasDeDatos(sql: Cliente, datoIds: readonly number[]): Promise<readonly Row[]> {
  if (datoIds.length === 0) return [];
  return sql`SELECT id, variable_id, periodo, valor, por_categoria, categorias FROM variable_valores
    WHERE variable_id IN ${sql([...new Set(datoIds)])} AND estado IN ('reportado', 'cerrado') AND valor IS NOT NULL`;
}

/** Un valor guardado en texto como fracción, o `null`. */
const fr = (v: unknown): Fraccion | null => {
  const t = texto(v);
  return t === null ? null : fraccion(t);
};

/**
 * El dato juntado sobre los periodos que forman el de la medición (`clavesFinas`), con su regla (`juntadoONada`): falta si
 * alguno no tiene valor. Con `categoriaId`, el valor de esa categoría (`por_categoria`), juntado solo con los periodos del dato
 * cuya lista la trae (anexo 14C, §5.7): un periodo que no la traía no la vuelve «falta»; si ninguno la trae, `sin_categoria`.
 * `filas` son las de `filasDeDatos`.
 */
function juntarDato(filas: readonly Row[], d: DatoDelPeriodo): ValorDeDato {
  const claves = clavesFinas(d.periodo, d.datoPeriodicidad);
  const porClave = new Map(filas.filter((f) => Number(f.variable_id) === d.datoId).map((f) => [f.periodo as string, f]));
  if (d.categoriaId === undefined) {
    const valor = juntadoONada(d.consolidacion, claves.map((c) => fr(porClave.get(c)?.valor)));
    return valor ? { estado: "listo", valor, periodos: claves.map((c) => Number(porClave.get(c)!.id)) } : { estado: "falta" };
  }
  const valores: Fraccion[] = [];
  const usados: number[] = [];
  for (const clave of claves) {
    const f = porClave.get(clave);
    if (!f) return { estado: "falta" };
    const lista = f.categorias as { id: unknown }[] | null;
    if (Array.isArray(lista) && !lista.some((c) => Number(c.id) === d.categoriaId)) continue;
    const valor = fr((f.por_categoria as Record<string, unknown> | null)?.[String(d.categoriaId)]);
    if (!valor) return { estado: "falta" };
    valores.push(valor);
    usados.push(Number(f.id));
  }
  if (valores.length === 0) return { estado: "sin_categoria", periodos: claves.map((c) => Number(porClave.get(c)!.id)) };
  const valor = juntadoONada(d.consolidacion, valores);
  return valor ? { estado: "listo", valor, periodos: usados } : { estado: "falta" };
}

/**
 * El valor de un dato compartido para el periodo `periodo` de un indicador (anexo 14C, §4.5): los periodos del dato que lo
 * forman, juntados con su regla, solo si todos están reportados o cerrados con valor; si falta alguno, `falta`. Con
 * `categoriaId`, el de esa categoría con los periodos cuya lista la trae, o `sin_categoria` (§5.7). Lee sin candado.
 */
export async function valorDeDato(sql: Cliente, d: DatoDelPeriodo): Promise<ValorDeDato> {
  return juntarDato(await filasDeDatos(sql, [d.datoId]), d);
}

const datosDe = (version: VersionDeCalculo): number[] =>
  version.variables.flatMap((v) => (v.origen === "compartida" && v.datoId !== null ? [v.datoId] : []));

// ─────────────────────────────────────────────────────────────────────────────
// La fuente: un componente
// ─────────────────────────────────────────────────────────────────────────────

const FALTA: ValorDeComponente = { estado: "falta" };

/** La regla con que se juzgó la medición `m` con la versión `v`: la de la versión con la meta que se le aplicó, si tiene. */
const reglaAplicada = (m: Row, v: VersionDeCalculo): ReglaEnTexto =>
  m.meta_aplicada === null || m.meta_aplicada === undefined ? v.regla : { ...v.regla, meta: texto(m.meta_aplicada), metaMax: texto(m.meta_max_aplicada) };

/** Lo que se toma de un resultado: el resultado mismo o su porcentaje de cumplimiento (`null` si no se puede decidir). */
const deLaToma = (toma: Toma, resultado: Fraccion, cumple: boolean | null, regla: Regla): Fraccion | null =>
  toma === "valor" ? resultado : porcentajeDeCumplimiento({ resultado, cumple, meta: regla.meta, tendencia: regla.tendencia });

/** ¿La medición tiene lo que el compuesto espera de ella: un resultado o «No aplica»? */
const conDato = (m: Row) => m.no_aplica === true || typeof m.resultado_exacto === "string";

/**
 * Lo que el componente `indicadorId` tiene para el periodo `periodo` de un compuesto (`desde` y `hasta`, los de su medición;
 * anexo 14C, §6.3), sin candado. Sus periodos esperados son los de la periodicidad que rige cada tramo del componente desde
 * su inicio de medición, dentro de `[desde, hasta]`:
 * - **misma periodicidad:** la medición de ese periodo. Con resultado, su `resultado_exacto` o su cumplimiento
 *   (`porcentajeDeCumplimiento` con su `cumple`, su meta aplicada y la tendencia de la versión con que se calculó); «No
 *   aplica», `no_aplica`; lo demás, `falta`.
 * - **más fino:** un periodo ordinario sin resultado ni «No aplica» (o aún sin abrir) es `falta`; los históricos que nadie
 *   registró se saltan. Si todos los de la versión que rige al final del tramo (su racha, `rachasDe`) son «No aplica»,
 *   `no_aplica`. Si no, su acumulado propio (`acumulado`, como `resumenAcumulado`: se juntan sus variables y se aplica su
 *   fórmula, saltando los «No aplica»), que cubre solo esa racha; su cumplimiento, contra la meta aplicada del último periodo
 *   medido. Si el componente es a su vez compuesto, cada variable que él toma vale el acumulado de su propio componente
 *   sobre exactamente los periodos suyos que entran a ese acumulado (`fijos` de `acumulado`, §6.4: el mismo tramo), nunca lo
 *   copiado mes a mes: sin los que él saltó (históricos sin registrar, «No aplica», los de antes de su inicio o de otra
 *   racha), así la letra tomada cubre los mismos meses que las suyas y que su `desde`. Si ese da `falta` o `no_aplica`, este
 *   también; y solo da `falta` por un periodo que cae dentro de uno que este usa.
 *   `desde` es la clave del primer periodo que entró cuando no empieza con el periodo del compuesto (un componente que empezó
 *   a medirse a mitad de él, un histórico sin registrar o un cambio de fórmula), o la del componente interior, la más tardía.
 * `mediciones` son las que entraron al valor, o las que lo dejaron «No aplica»: la del periodo o las de la racha, también
 * sus «No aplica».
 */
export function valorDeComponente(
  sql: Cliente,
  d: { indicadorId: number; toma: Toma; periodo: string; desde: Date; hasta: Date },
): Promise<ValorDeComponente> {
  return valorSobre(sql, { indicadorId: d.indicadorId, toma: d.toma, sobre: [{ clave: d.periodo, desde: d.desde, hasta: d.hasta }] }, new Set(), false);
}

/**
 * Lo mismo sobre varios periodos del compuesto, en orden de calendario: el acumulado propio del componente en ese tramo (anexo
 * 14C, §6.4), el que usa el acumulado del año de un compuesto (`fijosDelAcumulado`, `lectura.ts`) con los periodos que entran
 * a él. Es el mismo cálculo que hace la propagación para el componente interior de un compuesto de compuestos. Con
 * `acumulado` (solo el acumulado del año), un periodo ordinario sin dato no deja el valor en `falta`: se salta, como el
 * acumulado propio del componente, y el resultado sale `incompleto`; baja así también a los componentes de un componente
 * compuesto. Sin él, la regla del valor del periodo (§6.3): un ordinario sin dato, `falta`.
 */
export function valorDeComponenteSobre(
  sql: Cliente,
  d: { indicadorId: number; toma: Toma; sobre: readonly Cubierto[]; acumulado?: boolean },
): Promise<ValorDeComponente> {
  return valorSobre(sql, { indicadorId: d.indicadorId, toma: d.toma, sobre: d.sobre }, new Set(), d.acumulado === true);
}

/** Un periodo de quien toma al componente: el del compuesto o, para un componente interior, uno que usa el intermedio. */
export type Cubierto = { clave: string; desde: Date; hasta: Date };

/**
 * `valorDeComponente` sobre los periodos `sobre` de quien lo toma, en orden de calendario: el del compuesto o, dentro del
 * acumulado de un componente compuesto, los suyos que entran a ese acumulado. Sin volver a pasar por los indicadores de
 * `camino` (un ciclo, que la ficha no admite, no se recorre). Con `delAcumulado`, un ordinario sin dato se salta y, si es de
 * la racha que manda, el resultado sale `incompleto` (`valorDeComponenteSobre`); también un histórico sin registrar de esa
 * racha que queda después del primero que entró.
 */
async function valorSobre(
  sql: Cliente,
  d: { indicadorId: number; toma: Toma; sobre: readonly Cubierto[] },
  camino: ReadonlySet<number>,
  delAcumulado: boolean,
): Promise<ValorDeComponente> {
  if (camino.has(d.indicadorId) || d.sobre.length === 0) return FALTA;
  const zona = zonaHoraria();
  const [indicador] = await sql`SELECT inicio_medicion FROM indicadores WHERE id = ${d.indicadorId}`;
  const inicio = texto(indicador?.inicio_medicion);
  const versiones = await versionesAprobadas(sql, d.indicadorId);
  if (!inicio || versiones.length === 0) return FALTA;

  // Sus periodos dentro de los cubiertos, de la periodicidad que rige cada tramo del componente desde su inicio.
  const deSusTramos = tramos(versiones, inicio, zona);
  const vistos = new Set<string>();
  const esperados: Periodo[] = [];
  for (const c of d.sobre) {
    const gruesa = periodicidadDe(c.clave);
    if (!gruesa) return FALTA;
    for (const t of deSusTramos) {
      if (!contiene(gruesa, t.periodicidad)) continue;
      for (const clave of clavesFinas(c.clave, t.periodicidad)) {
        const p = periodoDe(clave, zona)!;
        const enSuTramo = p.desde.getTime() >= t.desde && p.desde.getTime() < t.hasta;
        const enElCubierto = p.desde.getTime() >= c.desde.getTime() && p.hasta.getTime() <= c.hasta.getTime();
        if (enSuTramo && enElCubierto && !vistos.has(clave)) {
          vistos.add(clave);
          esperados.push(p);
        }
      }
    }
  }
  esperados.sort((a, b) => a.desde.getTime() - b.desde.getTime());
  if (esperados.length === 0) return FALTA;

  const inicioCubierto = Math.min(...d.sobre.map((c) => c.desde.getTime()));
  const finCubierto = Math.max(...d.sobre.map((c) => c.hasta.getTime()));
  const filas = await sql`SELECT * FROM mediciones
    WHERE indicador_id = ${d.indicadorId} AND desde >= ${new Date(inicioCubierto)} AND hasta <= ${new Date(finCubierto)}`;
  const porClave = new Map(filas.map((m) => [m.periodo as string, m]));
  const aprobada = primeraAprobada(versiones)?.aprobadaEn ?? null;
  const entran: { periodo: Periodo; m: Row; rige: VersionDeCalculo }[] = [];
  const saltados: VersionDeCalculo[] = [];
  const historicosSaltados: { periodo: Periodo; rige: VersionDeCalculo }[] = [];
  for (const p of esperados) {
    const m = porClave.get(p.clave);
    if (!m || !conDato(m)) {
      // Un histórico que nadie registró no lo debe nadie: se salta. Un ordinario sin dato, se espera; en el acumulado del año,
      // se salta como en el del componente, y lo deja incompleto.
      const historico = m ? m.historica === true : aprobada !== null && p.hasta.getTime() < aprobada.getTime();
      if (historico) {
        historicosSaltados.push({ periodo: p, rige: versionQueRigeEntre(versiones, p, zona)! });
        continue;
      }
      if (!delAcumulado) return FALTA;
      saltados.push(versionQueRigeEntre(versiones, p, zona)!);
      continue;
    }
    entran.push({ periodo: p, m, rige: versionQueRigeEntre(versiones, p, zona)! });
  }
  if (entran.length === 0) return FALTA;

  if (d.sobre.length === 1 && esperados.length === 1 && esperados[0].clave === d.sobre[0].clave) {
    const { m, rige } = entran[0];
    if (m.no_aplica === true) return { estado: "no_aplica", mediciones: [Number(m.id)] };
    const calculada = versiones.find((v) => v.id === Number(m.version_id)) ?? rige;
    const cumple = cumpleDeFila({ cumple: (m.cumple as boolean | null) ?? null, semaforo: (m.semaforo as Semaforo | null) ?? null });
    const valor = deLaToma(d.toma, deTexto(m.resultado_exacto as string), cumple, reglaDeTexto(reglaAplicada(m, calculada)));
    return valor ? { estado: "listo", valor, mediciones: [Number(m.id)], desde: null } : FALTA;
  }

  const rigeAlFinal = versionQueRigeEntre(versiones, esperados.at(-1)!, zona)!;
  const rachas = rachasDe(versiones);
  const rachaDe = (v: VersionDeCalculo) => rachas.get(v.id)?.id ?? v.id;
  const racha = rachaDe(rigeAlFinal);
  const deLaRacha = entran.filter((e) => rachaDe(e.rige) === racha);
  // En el acumulado del año, también un histórico sin registrar de la racha que queda después del primero que entró (el de
  // antes lo dice `desde`): el acumulado propio del componente lo cuenta como faltante.
  const primero = deLaRacha[0]?.periodo.desde.getTime();
  let incompleto =
    saltados.some((v) => rachaDe(v) === racha) ||
    (delAcumulado && primero !== undefined && historicosSaltados.some((h) => rachaDe(h.rige) === racha && h.periodo.desde.getTime() > primero));
  const mediciones = deLaRacha.map((e) => Number(e.m.id));
  const medidos = deLaRacha.filter((e) => e.m.no_aplica !== true);
  if (deLaRacha.length > 0 && medidos.length === 0) return { estado: "no_aplica", mediciones };
  const ficha = fichaDeCalculo(rigeAlFinal.calculo);
  if (!ficha || medidos.length === 0) return FALTA;

  // Un componente compuesto: lo que él toma vale el acumulado de su componente sobre los periodos suyos que entran aquí
  // (los medidos de la racha), no lo copiado mes a mes.
  const fijos: Record<string, Fraccion> = {};
  const desdes: string[] = [];
  const conEl = new Set([...camino, d.indicadorId]);
  const suyos: Cubierto[] = medidos.map((e) => e.periodo);
  for (const v of rigeAlFinal.variables) {
    if (v.origen !== "indicador") continue;
    if (v.indicadorOrigenId === null || v.toma === null) return FALTA;
    const interior = await valorSobre(sql, { indicadorId: v.indicadorOrigenId, toma: v.toma, sobre: suyos }, conEl, delAcumulado);
    if (interior.estado === "falta") return FALTA;
    if (interior.estado === "no_aplica") return { estado: "no_aplica", mediciones };
    fijos[v.letra] = interior.valor;
    if (interior.desde !== null) desdes.push(interior.desde);
    if (interior.incompleto) incompleto = true;
  }

  const guardados = await sql`SELECT mv.medicion_id, ${columnasDeValor(sql)}
    FROM medicion_valores mv JOIN indicador_variables iv ON iv.id = mv.variable_id
    WHERE mv.medicion_id IN ${sql(deLaRacha.map((e) => Number(e.m.id)))} AND mv.categoria_id IS NULL AND mv.valor IS NOT NULL`;
  const valoresDe = (e: (typeof entran)[number]) =>
    elegirValores(guardados.filter((g) => Number(g.medicion_id) === Number(e.m.id)) as unknown as ValorGuardado[], e.rige);
  // `acumulado` ordena por clave como texto: con el inicio del periodo delante, el orden es el del calendario.
  const orden = (p: Periodo) => `${p.desde.toISOString()}#${p.clave}`;
  const ultimo = medidos.at(-1)!;
  const regla = reglaDeTexto(reglaAplicada(ultimo.m, ultimo.rige));
  const r = acumulado(
    deLaRacha.map((e) => ({ clave: orden(e.periodo), versionId: racha, noAplica: e.m.no_aplica === true, valores: e.m.no_aplica === true ? null : valoresDe(e) })),
    { versionId: racha, calculo: ficha, consolidacion: Object.fromEntries(rigeAlFinal.variables.map((v) => [v.letra, v.consolidacion])), esperados: [], regla },
    fijos,
  );
  const valor = r.resultado ? deLaToma(d.toma, r.resultado, r.cumple, regla) : null;
  if (!valor) return FALTA;
  // El primero que entró, si empieza después que lo cubierto (el periodo del compuesto); y el más tardío de los interiores.
  if (r.desde !== null && new Date(r.desde.slice(0, r.desde.indexOf("#"))).getTime() > inicioCubierto) {
    desdes.push(r.desde.slice(r.desde.indexOf("#") + 1));
  }
  const inicioDe = (clave: string) => periodoDe(clave, zona)?.desde.getTime() ?? 0;
  const desde = desdes.reduce<string | null>((tarde, c) => (tarde === null || inicioDe(c) > inicioDe(tarde) ? c : tarde), null);
  return { estado: "listo", valor, mediciones, desde, ...(incompleto ? { incompleto: true as const } : {}) };
}

const componentesDe = (version: VersionDeCalculo): number[] =>
  version.variables.flatMap((v) => (v.origen === "indicador" && v.indicadorOrigenId !== null ? [v.indicadorOrigenId] : []));

/** Lo que tiene la fuente de cada variable ajena de la versión para la medición `m`, por letra. `filas`, las de sus datos. */
async function ajenosDe(sql: Cliente, version: VersionDeCalculo, m: Row, filas: readonly Row[]): Promise<Map<string, ValorAjeno>> {
  const salida = new Map<string, ValorAjeno>();
  const periodo = m.periodo as string;
  for (const v of version.variables) {
    if (!esAjena(v.origen)) continue;
    if (v.origen === "compartida" && v.datoId !== null && v.datoPeriodicidad !== null) {
      const r = juntarDato(filas, { datoId: v.datoId, consolidacion: v.consolidacion, datoPeriodicidad: v.datoPeriodicidad, periodo });
      salida.set(v.letra, r.estado === "listo" ? { estado: "listo", valor: r.valor } : { estado: "falta" });
    } else if (v.origen === "indicador" && v.indicadorOrigenId !== null && v.toma !== null) {
      const r = await valorDeComponente(sql, { indicadorId: v.indicadorOrigenId, toma: v.toma, periodo, desde: new Date(m.desde as Date), hasta: new Date(m.hasta as Date) });
      salida.set(
        v.letra,
        r.estado === "listo" ? { estado: "listo", valor: r.valor } : r.estado === "no_aplica" ? { estado: "no_aplica", fuenteId: v.indicadorOrigenId } : { estado: "falta" },
      );
    } else {
      salida.set(v.letra, { estado: "falta" });
    }
  }
  return salida;
}

// ─────────────────────────────────────────────────────────────────────────────
// Qué cambia
// ─────────────────────────────────────────────────────────────────────────────

/**
 * La versión con que se calcula la medición `m` (`versionesDeCalculo`, la regla de `"fuente"`), si la propagación le toca:
 * la que rige es de su periodicidad y la que calcula es manual y tiene variables ajenas. Si no, `null`.
 */
function versionQuePropaga(m: Row, versiones: readonly VersionDeCalculo[], zona: string): VersionDeCalculo | null {
  const { rige, version } = versionesDeCalculo(versiones, m, "fuente", zona);
  if (!rige || !version || esDeOtraPeriodicidad(m.periodo as string, rige) || version.origenDato !== "manual") return null;
  return version.variables.some((v) => esAjena(v.origen)) ? version : null;
}

type Cambio = { variable: Variable; antes: Fraccion | null; despues: Fraccion | null };

type Plan = {
  cambios: Cambio[];
  /** Los valores por letra después de copiar lo ajeno. */
  valores: Record<string, Fraccion>;
  /** La medición queda reportada por el sistema: sin variables propias y con todo, o por el contagio. */
  reportar: boolean;
  /** Se le quita el reporte que le puso el contagio, que ya no rige: en un mixto, o si le faltan valores. */
  quitarReporte: boolean;
  /** El «No aplica» del sistema que se pone (con su motivo) o se quita (`motivo: null`); `null` si no cambia. */
  noAplica: { motivo: string | null } | null;
  /** El componente que no aplicó, cuando el plan pone el «No aplica» del contagio. */
  componente: number | null;
  /** Las filas (sus ids) que el sistema copió en otra versión desde otra fuente: se quitan (`filasDeOtraFuente`). */
  obsoletas: number[];
};

/**
 * Lo que la propagación le cambia a la medición `m` (`guardados`: sus valores por letra de `version`; `ajenos`: lo que tiene
 * cada fuente), o `null` si nada: cada letra ajena cuya fracción difiere de la de su fuente; el reporte del sistema en un
 * indicador sin variables propias que ya tiene todo; y el «No aplica» del sistema: el del contagio, si algún componente no
 * aplicó (con el reporte del sistema si no estaba reportada), o si no, el de nada que medir, que vale con todos los valores,
 * la medición reportada y la fórmula dividiendo por cero. Al salir del contagio, el reporte que puso vuelve a quien le toca.
 * Un «No aplica» de una persona no se toca. `obsoletas` son las filas copiadas en otra versión desde otra fuente
 * (`filasDeOtraFuente`): quitarlas también es trabajo. No consulta nada.
 */
function planear(
  m: Row,
  version: VersionDeCalculo,
  guardados: Readonly<Record<string, Fraccion>>,
  ajenos: ReadonlyMap<string, ValorAjeno>,
  obsoletas: number[],
): Plan | null {
  const valores: Record<string, Fraccion> = { ...guardados };
  const cambios: Cambio[] = [];
  for (const v of version.variables) {
    if (!esAjena(v.origen)) continue;
    const a = ajenos.get(v.letra);
    const despues = a?.estado === "listo" ? a.valor : null;
    const antes = guardados[v.letra] ?? null;
    if (despues) valores[v.letra] = despues;
    else delete valores[v.letra];
    if (antes === null ? despues !== null : despues === null || comparar(antes, despues) !== 0) cambios.push({ variable: v, antes, despues });
  }
  const todas = version.calculo.letras.every((l) => Object.hasOwn(valores, l));
  const motivo = m.no_aplica === true ? ((m.no_aplica_motivo as string | null) ?? null) : null;
  const delSistema = motivo === MOTIVO_COMPONENTE_NO_APLICA || motivo === MOTIVO_NADA_QUE_MEDIR ? motivo : null;
  const dePersona = m.no_aplica === true && delSistema === null;
  // El primer componente que no aplicó, por el orden de las variables.
  const sinAplicar = [...ajenos.values()].find((a): a is Extract<ValorAjeno, { estado: "no_aplica" }> => a.estado === "no_aplica");
  const contagio = sinAplicar !== undefined;
  const quitarReporte =
    !dePersona &&
    !contagio &&
    delSistema === MOTIVO_COMPONENTE_NO_APLICA &&
    m.reportada_en !== null &&
    m.reportada_por === null &&
    (mide(version) || !todas);
  const reportada = m.reportada_en !== null && !quitarReporte;
  const reportarPorSistema = !mide(version) && todas && !reportada;
  const ficha = fichaDeCalculo(version.calculo);
  const nadaQueMedir =
    !contagio &&
    todas &&
    (reportada || reportarPorSistema) &&
    ficha !== null &&
    calcular(ficha, valores, reglaDeTexto(version.regla)).sinResultado === "division_por_cero";
  const debido = contagio ? MOTIVO_COMPONENTE_NO_APLICA : nadaQueMedir ? MOTIVO_NADA_QUE_MEDIR : null;
  const noAplica = !dePersona && debido !== delSistema ? { motivo: debido } : null;
  const reportar = !dePersona && !reportada && (contagio || reportarPorSistema);
  if (cambios.length === 0 && !reportar && !quitarReporte && noAplica === null && obsoletas.length === 0) return null;
  return {
    cambios,
    valores,
    reportar,
    quitarReporte,
    noAplica,
    componente: noAplica?.motivo === MOTIVO_COMPONENTE_NO_APLICA ? sinAplicar!.fuenteId : null,
    obsoletas,
  };
}

/** Lo que la propagación le cambia a una medición desagregada (`planearRejilla`). */
type PropagacionDeRejilla = {
  cambios: CambioDeCelda[];
  filas: CambioDeFila[];
  /** La lista con los «No aplica» de fila de después. */
  lista: CategoriaDeMedicion[];
  /** El total que queda (`null`: ninguno); sin valor, no se toca. */
  total?: Record<string, Fraccion> | null;
  /** La medición queda reportada por el sistema: nadie la mide y ya tiene todo (o ninguna fila aplica). */
  reportar: boolean;
  /**
   * Las filas (sus ids) que dejaron de ser «No aplica» del sistema sin las celdas propias que quien mide no les debía: si no
   * está vacía, se le devuelve el reporte, como al quitarse el contagio en `planear`.
   */
  sinLoPropio: number[];
  /** El «No aplica» del sistema de la medición que se pone (con su motivo) o se quita (`motivo: null`); `null` si no cambia. */
  noAplica: { motivo: string | null } | null;
};

/**
 * Lo que la propagación le cambia a una medición desagregada `m` (anexo 14C, §5.7), o `null` si nada; no consulta nada. Por
 * cada categoría de su lista copia a su celda el valor de cada dato para esa categoría (`juntarDato` con `categoriaId`). Si,
 * con todos los periodos del dato reportados, ninguno trae la categoría, la fila queda «No aplica» con
 * `MOTIVO_DATO_SIN_CATEGORIA`; cuando el dato pasa a traerla, ese «No aplica» se quita. Nunca toca el «No aplica» que una
 * persona puso en una fila. Después el total, como en un reporte, solo en una medición reportada o en una que no mide nadie:
 * la suma de las filas que aplican (`totalDeRejilla`), ninguno si falta algo, y el «No aplica» del sistema de la medición
 * (`MOTIVO_TODAS_NO_APLICAN` si ninguna fila aplica; `MOTIVO_NADA_QUE_MEDIR` si el total divide por cero), que se quita cuando
 * deja de ser cierto; el de una persona no se toca. En un mixto reportado, una fila que deja de ser «No aplica» del sistema
 * sin sus celdas propias (quien mide no se las debía) le devuelve el reporte (`sinLoPropio`): la medición vuelve a «Por
 * reportar» en vez de quedar sin total y sin nadie que la complete. `celdas` y `guardado` son sus celdas y su total por letra
 * de `version`.
 */
function planearRejilla(
  m: Row,
  version: VersionDeCalculo,
  celdas: ReadonlyMap<number, Readonly<Record<string, Fraccion>>>,
  guardado: Readonly<Record<string, Fraccion>>,
  deDatos: readonly Row[],
): PropagacionDeRejilla | null {
  const lista = listaDe(m)!;
  const nuevas = new Map([...celdas].map(([id, v]) => [id, { ...v }]));
  const nueva = lista.map((c) => ({ ...c }));
  const cambios: CambioDeCelda[] = [];
  const filas: CambioDeFila[] = [];
  for (const [k, c] of lista.entries()) {
    const deLaFila = nuevas.get(c.id) ?? {};
    let sinCategoria = false;
    for (const v of version.variables) {
      if (v.origen !== "compartida" || v.datoId === null || v.datoPeriodicidad === null) continue;
      const r = juntarDato(deDatos, { datoId: v.datoId, consolidacion: v.consolidacion, datoPeriodicidad: v.datoPeriodicidad, periodo: m.periodo as string, categoriaId: c.id });
      if (r.estado === "sin_categoria") sinCategoria = true;
      const despues = r.estado === "listo" ? r.valor : null;
      const antes = celdas.get(c.id)?.[v.letra] ?? null;
      if (despues) deLaFila[v.letra] = despues;
      else delete deLaFila[v.letra];
      if (antes === null ? despues !== null : despues === null || comparar(antes, despues) !== 0) cambios.push({ categoria: c, variable: v, antes, despues });
    }
    nuevas.set(c.id, deLaFila);
    if (c.noAplica !== null && c.noAplica !== MOTIVO_DATO_SIN_CATEGORIA) continue;
    const debido = sinCategoria ? MOTIVO_DATO_SIN_CATEGORIA : null;
    if (debido === c.noAplica) continue;
    filas.push({ categoria: c, antes: c.noAplica, despues: debido });
    nueva[k].noAplica = debido;
  }

  const plan: PropagacionDeRejilla = { cambios, filas, lista: nueva, reportar: false, sinLoPropio: [], noAplica: null };
  const ficha = fichaDeCalculo(version.calculo);
  const reportada = m.reportada_en !== null;
  if (ficha && (reportada || !mide(version))) {
    const t = totalDeRejilla(nueva, nuevas, version, ficha);
    const total = t.clase === "total" ? t.valores : null;
    if (total === null ? Object.keys(guardado).length > 0 : !mismoTotal(total, guardado)) plan.total = total;
    const motivo = m.no_aplica === true ? ((m.no_aplica_motivo as string | null) ?? null) : null;
    const delSistema = motivo === MOTIVO_TODAS_NO_APLICAN || motivo === MOTIVO_NADA_QUE_MEDIR ? motivo : null;
    const dePersona = m.no_aplica === true && delSistema === null;
    const propias = version.variables.filter((v) => !esAjena(v.origen)).map((v) => v.letra);
    if (reportada && mide(version) && !dePersona) {
      plan.sinLoPropio = filas
        .filter((f) => f.antes === MOTIVO_DATO_SIN_CATEGORIA && f.despues === null && propias.some((l) => nuevas.get(f.categoria.id)?.[l] === undefined))
        .map((f) => f.categoria.id);
    }
    plan.reportar = !reportada && !dePersona && (t.clase === "total" || t.clase === "ninguna_aplica");
    const debido =
      t.clase === "ninguna_aplica"
        ? MOTIVO_TODAS_NO_APLICAN
        : total && calcular(ficha, total, reglaDeTexto(version.regla)).sinResultado === "division_por_cero"
          ? MOTIVO_NADA_QUE_MEDIR
          : null;
    if (!dePersona && debido !== delSistema) plan.noAplica = { motivo: debido };
  }
  if (cambios.length === 0 && filas.length === 0 && plan.total === undefined && !plan.reportar && plan.noAplica === null) return null;
  return plan;
}

// ─────────────────────────────────────────────────────────────────────────────
// Escribir
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deja en la medición el valor ajeno de una letra, en la variable de la versión con que se calcula, sin usuario: el valor
 * con cuatro decimales (truncado) y, si no cabe exacto en ellos, su fracción. Antes quita las filas que el sistema copió
 * para esa letra en otra versión; sin valor, quita también la suya.
 */
async function escribirAjeno(tx: TransactionSql, m: { id: number; indicadorId: number }, c: Cambio, ahora: Date): Promise<void> {
  const v = c.variable;
  await tx`DELETE FROM medicion_valores mv
    WHERE mv.medicion_id = ${m.id} AND mv.categoria_id IS NULL AND mv.variable_id <> ${v.id}
      AND mv.variable_id IN (SELECT iv.id FROM indicador_variables iv JOIN indicador_versiones x ON x.id = iv.version_id
        WHERE x.indicador_id = ${m.indicadorId} AND iv.letra = ${v.letra} AND iv.origen IN ('compartida', 'indicador'))`;
  if (c.despues === null) {
    await tx`DELETE FROM medicion_valores WHERE medicion_id = ${m.id} AND variable_id = ${v.id} AND categoria_id IS NULL`;
    return;
  }
  const valor = valorEnTexto(c.despues);
  const exacto = comparar(fraccion(valor)!, c.despues) === 0 ? null : aTexto(c.despues);
  const [cambiada] = await tx`UPDATE medicion_valores SET valor = ${valor}, valor_exacto = ${exacto}, reportado_por = NULL, reportado_en = ${ahora}
    WHERE medicion_id = ${m.id} AND variable_id = ${v.id} AND categoria_id IS NULL
    RETURNING id`;
  if (!cambiada) {
    await tx`INSERT INTO medicion_valores (medicion_id, variable_id, valor, valor_exacto, reportado_por, reportado_en)
      VALUES (${m.id}, ${v.id}, ${valor}, ${exacto}, NULL, ${ahora})`;
  }
}

/** Los valores en el texto del evento: una clave por letra de la versión, con `null` si no hay. */
const enTexto = (version: VersionDeCalculo, valores: Readonly<Record<string, Fraccion>>): Record<string, string | null> =>
  Object.fromEntries(version.calculo.letras.map((l) => [l, valores[l] ? valorEnTexto(valores[l]) : null]));

/**
 * ¿El último contagio de la medición (`propagacion` con `detalle.componente`) llegó en su fecha límite o antes? La misma
 * condición de «Reportes a tiempo» (`reportesDelPeriodo`): si llegó después, quien mide ya debía su reporte.
 */
async function contagioATiempo(tx: TransactionSql, medicionId: number, venceEn: Date): Promise<boolean> {
  const [c] = await tx`SELECT max(creado_en) AS en FROM medicion_eventos
    WHERE medicion_id = ${medicionId} AND tipo = 'propagacion' AND detalle ? 'componente'`;
  return c?.en !== null && c?.en !== undefined && new Date(c.en as Date).getTime() <= venceEn.getTime();
}

/**
 * ¿El «No aplica» del sistema de las filas `categorias` llegó en la fecha límite o antes? Mira el último evento `propagacion`
 * que se lo puso a cualquiera de ellas: solo si ese llegó a tiempo (y con él todos los anteriores) la respuesta es sí. La
 * regla de `contagioATiempo` para las filas de un desagregado: si alguno llegó después, quien mide ya debía su reporte.
 */
async function sinCategoriaATiempo(tx: TransactionSql, medicionId: number, categorias: readonly number[], venceEn: Date): Promise<boolean> {
  const [c] = await tx`SELECT max(e.creado_en) AS en FROM medicion_eventos e
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(e.detalle -> 'categorias', '[]'::jsonb)) AS f(fila)
    WHERE e.medicion_id = ${medicionId} AND e.tipo = 'propagacion'
      AND (f.fila ->> 'id')::bigint = ANY(${categorias as number[]}::bigint[])
      AND f.fila -> 'despues' ->> 'noAplica' = ${MOTIVO_DATO_SIN_CATEGORIA}`;
  return c?.en !== null && c?.en !== undefined && new Date(c.en as Date).getTime() <= venceEn.getTime();
}

/**
 * La propagación de una medición en su transacción, con los candados (el indicador `FOR SHARE` y la medición `FOR UPDATE`) y
 * todo releído bajo ellos (la fuente, sin candado): «valores», «no_aplica» (quedó en el «No aplica» del sistema) o `null` si
 * ya no le tocaba o nada difería. Una medición desagregada va por su rejilla (`propagarRejilla`).
 */
async function propagarEn(tx: TransactionSql, medicionId: number, ahora: Date): Promise<"valores" | "no_aplica" | null> {
  const [i] = await tx`SELECT id, estado, plazo_reporte_dias FROM indicadores
    WHERE id = (SELECT indicador_id FROM mediciones WHERE id = ${medicionId}) FOR SHARE`;
  if (!i || i.estado !== "activo") return null;
  const [m] = await tx`SELECT * FROM mediciones WHERE id = ${medicionId} FOR UPDATE`;
  if (!m || m.estado === "cerrada" || m.historica === true) return null;
  const zona = zonaHoraria();
  const indicadorId = Number(i.id);
  const version = versionQuePropaga(m, await versionesAprobadas(tx, indicadorId), zona);
  if (!version) return null;
  if (listaDe(m)) return propagarRejilla(tx, i, m, version, ahora);
  const filas = await filasDeValores(tx, medicionId);
  const guardados = elegirValores(filas, version);
  const plan = planear(m, version, guardados, await ajenosDe(tx, version, m, await filasDeDatos(tx, datosDe(version))), filasDeOtraFuente(filas, version));
  if (!plan) return null;

  if (plan.obsoletas.length > 0) await tx`DELETE FROM medicion_valores WHERE medicion_id = ${medicionId} AND id = ANY(${plan.obsoletas})`;
  for (const c of plan.cambios) await escribirAjeno(tx, { id: medicionId, indicadorId }, c, ahora);
  if (plan.reportar) await tx`UPDATE mediciones SET reportada_en = ${ahora}, reportada_por = NULL WHERE id = ${medicionId}`;
  if (plan.quitarReporte) await tx`UPDATE mediciones SET reportada_en = NULL, reportada_por = NULL WHERE id = ${medicionId}`;
  if (plan.noAplica) {
    await tx`UPDATE mediciones SET no_aplica = ${plan.noAplica.motivo !== null}, no_aplica_motivo = ${plan.noAplica.motivo} WHERE id = ${medicionId}`;
  }
  const noAplica = plan.noAplica ? plan.noAplica.motivo !== null : m.no_aplica === true;
  // El contagio que se quita le devuelve a quien mide un mixto el reporte: si había llegado a tiempo, no le debía nada.
  const devuelveATiempo = plan.quitarReporte && mide(version) && (await contagioATiempo(tx, medicionId, new Date(m.vence_en as string)));
  const marca = (no: boolean, motivo: unknown) => (plan.noAplica ? { noAplica: no, motivo: (motivo as string | null) ?? null } : {});
  await recalcularMedicion(tx, medicionId, {
    ahora,
    actorId: null,
    evento: "propagacion",
    sistema: "fuente",
    detalle: {
      fuentes: plan.cambios.map((c) => ({
        letra: c.variable.letra,
        clase: c.variable.origen === "compartida" ? "dato" : "indicador",
        id: c.variable.origen === "compartida" ? c.variable.datoId : c.variable.indicadorOrigenId,
        antes: c.antes ? valorEnTexto(c.antes) : null,
        despues: c.despues ? valorEnTexto(c.despues) : null,
      })),
      // La referencia del componente que no aplicó, nunca su nombre: quien ve el compuesto puede no verlo (anexo 14C, §6.5).
      ...(plan.componente !== null ? { componente: plan.componente } : {}),
      antes: { ...enTexto(version, guardados), ...marca(m.no_aplica === true, m.no_aplica_motivo) },
      despues: { ...enTexto(version, plan.valores), ...marca(noAplica, plan.noAplica?.motivo) },
    },
    conElResultado: plazoPorLaFuente(tx, i, m, { noAplica, devuelveATiempo, ahora }),
  });
  return plan.noAplica?.motivo ? "no_aplica" : "valores";
}

/**
 * La propagación de una medición desagregada (`planearRejilla`), con los candados ya tomados: las celdas de los datos por
 * categoría, sin usuario (`escribirCelda`); la lista con los «No aplica» de fila; el total, que escribe el sistema
 * (`escribirTotal`); el reporte del sistema, o el que se le devuelve a quien mide (con la regla del plazo de
 * `plazoPorLaFuente`), y el «No aplica» del sistema; y el cálculo único con el evento `propagacion`, sin usuario, que lleva en
 * `fuentes` el total de cada dato que cambió y en `categorias` cada celda y cada «No aplica» de fila que cambió.
 */
async function propagarRejilla(tx: TransactionSql, i: Row, m: Row, version: VersionDeCalculo, ahora: Date): Promise<"valores" | "no_aplica" | null> {
  const medicionId = Number(m.id);
  const guardados = await valoresPorLetra(tx, medicionId, version);
  const celdas = await celdasPorCategoria(tx, medicionId, version);
  const plan = planearRejilla(m, version, celdas, guardados, await filasDeDatos(tx, datosDe(version)));
  if (!plan) return null;
  for (const c of plan.cambios) {
    await escribirCelda(tx, { id: medicionId, indicadorId: Number(i.id) }, c.categoria.id, c.variable, c.despues, { usuarioId: null, ahora });
  }
  if (plan.filas.length > 0) await tx`UPDATE mediciones SET categorias = ${tx.json(plan.lista as never)} WHERE id = ${medicionId}`;
  if (plan.total !== undefined) await escribirTotal(tx, medicionId, version, plan.total, ahora);
  if (plan.reportar) await tx`UPDATE mediciones SET reportada_en = ${ahora}, reportada_por = NULL WHERE id = ${medicionId}`;
  const quitarReporte = plan.sinLoPropio.length > 0;
  if (quitarReporte) await tx`UPDATE mediciones SET reportada_en = NULL, reportada_por = NULL WHERE id = ${medicionId}`;
  if (plan.noAplica) {
    await tx`UPDATE mediciones SET no_aplica = ${plan.noAplica.motivo !== null}, no_aplica_motivo = ${plan.noAplica.motivo} WHERE id = ${medicionId}`;
  }
  const noAplica = plan.noAplica ? plan.noAplica.motivo !== null : m.no_aplica === true;
  // El reporte que se le devuelve a quien mide: si el «No aplica» de esas filas había llegado a tiempo, no le debía nada.
  const devuelveATiempo = quitarReporte && (await sinCategoriaATiempo(tx, medicionId, plan.sinLoPropio, new Date(m.vence_en as string)));
  const total = plan.total === undefined ? guardados : (plan.total ?? {});
  const marca = (no: boolean, motivo: unknown) => (plan.noAplica ? { noAplica: no, motivo: (motivo as string | null) ?? null } : {});
  const reporte = (v: boolean) => (quitarReporte ? { reportada: v } : {});
  const enTotal = (valores: Readonly<Record<string, Fraccion>>, letra: string) => (valores[letra] ? valorEnTexto(valores[letra]) : null);
  const categorias = detalleDeCategorias(listaDe(m)!, plan.cambios, plan.filas);
  await recalcularMedicion(tx, medicionId, {
    ahora,
    actorId: null,
    evento: "propagacion",
    sistema: "fuente",
    detalle: {
      fuentes: version.variables
        .filter((v) => v.origen === "compartida" && enTotal(guardados, v.letra) !== enTotal(total, v.letra))
        .map((v) => ({ letra: v.letra, clase: "dato", id: v.datoId, antes: enTotal(guardados, v.letra), despues: enTotal(total, v.letra) })),
      ...(categorias.length > 0 ? { categorias } : {}),
      antes: { ...enTexto(version, guardados), ...marca(m.no_aplica === true, m.no_aplica_motivo), ...reporte(true) },
      despues: { ...enTexto(version, total), ...marca(noAplica, plan.noAplica?.motivo), ...reporte(false) },
    },
    conElResultado: plazoPorLaFuente(tx, i, m, { noAplica, devuelveATiempo, ahora }),
  });
  return plan.noAplica?.motivo ? "no_aplica" : "valores";
}

// ─────────────────────────────────────────────────────────────────────────────
// La pasada
// ─────────────────────────────────────────────────────────────────────────────

type Candidata = { m: Row; version: VersionDeCalculo };

/**
 * De `filas` (mediciones candidatas, con todas sus columnas), las que la propagación toca (`versionQuePropaga`), agrupadas
 * por el nivel de dependencia de su indicador (`nivelesBajo`, de menor a mayor) sobre las aristas de las fichas vigentes
 * (`vigentes`) más las de las versiones con que se calculan: una medición puede calcularse con una versión que ya no es la
 * vigente y tomar un componente que esta no toma.
 */
async function porNivelDeDependencia(
  sql: Cliente,
  filas: readonly Row[],
  vigentes: ReadonlyMap<number, readonly number[]>,
  zona: string,
): Promise<Candidata[][]> {
  const versiones = await versionesAprobadasDe(sql, filas.map((f) => Number(f.indicador_id)));
  const candidatas = filas.flatMap((m) => {
    const version = versionQuePropaga(m, versiones.get(Number(m.indicador_id)) ?? [], zona);
    return version ? [{ m, version }] : [];
  });
  const aristas = new Map<number, number[]>([...vigentes].map(([id, toma]) => [id, [...toma]]));
  for (const { m, version } of candidatas) {
    const id = Number(m.indicador_id);
    const toma = componentesDe(version);
    if (toma.length > 0) aristas.set(id, [...new Set([...(aristas.get(id) ?? []), ...toma])]);
  }
  const nivel = new Map<number, number>();
  const grupos = new Map<number, Candidata[]>();
  for (const c of candidatas) {
    const id = Number(c.m.indicador_id);
    if (!nivel.has(id)) nivel.set(id, nivelesBajo(aristas, id));
    const n = nivel.get(id)!;
    grupos.set(n, [...(grupos.get(n) ?? []), c]);
  }
  return [...grupos.keys()].sort((a, b) => a - b).map((n) => grupos.get(n)!);
}

/**
 * De las candidatas de un nivel, las que la propagación cambiaría, leídas sin candado y en pocas lecturas: sus valores, los
 * periodos de sus datos y lo que tiene cada componente (`valorDeComponente`). La que no se pudo revisar también va: su
 * transacción lo vuelve a intentar y, si falla, lo registra.
 */
async function conTrabajo(sql: Cliente, candidatas: readonly Candidata[]): Promise<number[]> {
  if (candidatas.length === 0) return [];
  const [guardados, deDatos] = await Promise.all([
    sql`SELECT mv.medicion_id, mv.categoria_id, ${columnasDeValor(sql)}
      FROM medicion_valores mv JOIN indicador_variables iv ON iv.id = mv.variable_id
      WHERE mv.medicion_id IN ${sql(candidatas.map((x) => Number(x.m.id)))} AND mv.valor IS NOT NULL`,
    filasDeDatos(sql, candidatas.flatMap((x) => datosDe(x.version))),
  ]);
  const porMedicion = new Map<number, Row[]>();
  for (const g of guardados) porMedicion.set(Number(g.medicion_id), [...(porMedicion.get(Number(g.medicion_id)) ?? []), g]);
  const ids: number[] = [];
  for (const { m, version } of candidatas) {
    const id = Number(m.id);
    try {
      const filas = (porMedicion.get(id) ?? []) as unknown as (ValorGuardado & { categoria_id: unknown })[];
      // El total (o los valores de una sin desagregar) es la fila sin categoría; las celdas de una desagregada, las demás.
      const sinCategoria = filas.filter((f) => f.categoria_id === null);
      const valores = elegirValores(sinCategoria, version);
      const plan = listaDe(m)
        ? planearRejilla(m, version, celdasDeFilas(filas, version), valores, deDatos)
        : planear(m, version, valores, await ajenosDe(sql, version, m, deDatos), filasDeOtraFuente(sinCategoria, version));
      if (plan) ids.push(id);
    } catch {
      ids.push(id);
    }
  }
  return ids;
}

/**
 * Lleva el valor de cada fuente a las mediciones abiertas que lo esperan (anexo 14C, §3.3): todas, o solo las de los
 * indicadores `indicadorIds` y las de los que dependen de ellos. Nivel por nivel de dependencia: un nivel se revisa después
 * de escribir el anterior. Cada medición en su transacción; la que falla se registra, cuenta en `fallidas` y no corta la
 * pasada. `escritas` cuenta las que recibieron valores y `noAplica`, las que quedaron en el «No aplica» del sistema.
 */
export async function propagar(opciones?: Opciones): Promise<{ escritas: number; noAplica: number; fallidas: number }> {
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const total = { escritas: 0, noAplica: 0, fallidas: 0 };
  const ids = opciones?.indicadorIds;
  if (ids && ids.length === 0) return total;
  const vigentes = await aristasDeComponentes(sql);
  const alcance = ids ? [...new Set([...ids, ...porNiveles(vigentes, ids).flat()])] : null;
  const filas = await sql`SELECT m.* FROM mediciones m JOIN indicadores i ON i.id = m.indicador_id
    WHERE m.estado <> 'cerrada' AND NOT m.historica AND i.estado = 'activo' AND i.inicio_medicion IS NOT NULL
      AND EXISTS (SELECT 1 FROM indicador_versiones v JOIN indicador_variables iv ON iv.version_id = v.id
        WHERE v.indicador_id = i.id AND v.estado = 'aprobada' AND iv.origen IN ('compartida', 'indicador'))
      ${alcance ? sql`AND i.id IN ${sql(alcance)}` : sql``}
    ORDER BY m.indicador_id, m.desde, m.id`;
  if (filas.length === 0) return total;
  for (const nivel of await porNivelDeDependencia(sql, filas, vigentes, zonaHoraria())) {
    for (const id of await conTrabajo(sql, nivel)) {
      try {
        const r = await enTransaccion(sql, (tx) => propagarEn(tx, id, ahora));
        if (r === "valores") total.escritas += 1;
        else if (r === "no_aplica") total.noAplica += 1;
      } catch (err) {
        total.fallidas += 1;
        console.error(`No se pudo propagar a la medición ${id}:`, err);
      }
    }
  }
  return total;
}

/**
 * La propagación que llaman las acciones después de confirmar lo suyo: si algo falla, lo registra y no lo relanza (la
 * acción ya terminó y la pasada siguiente lo intenta otra vez).
 */
export async function propagarSinFallar(opciones?: Opciones): Promise<void> {
  try {
    await propagar(opciones);
  } catch (err) {
    console.error("No se pudieron propagar los valores ajenos:", err);
  }
}

/**
 * `asegurarMediciones` para los caminos de lectura (la página del indicador, la de reportar, la lista, la matriz y el
 * impreso): una medición que se abre toma en seguida lo que sus fuentes ya tienen (un dato reportado antes de que existiera,
 * un componente que ya tiene resultado), sin esperar a la pasada. Solo si abrió alguna, propaga a esos indicadores y a los
 * que dependen de ellos (`propagarSinFallar` con `indicadorIds`; sin indicador, a todos); si no abrió nada, no consulta más.
 * Devuelve cuántas abrió.
 */
export async function asegurarMedicionesConFuentes(opciones?: Parameters<typeof asegurarMediciones>[0]): Promise<number> {
  const abiertas = await asegurarMediciones(opciones);
  if (abiertas > 0) {
    const indicadorIds = opciones?.indicadorIds ?? (opciones?.indicadorId !== undefined ? [opciones.indicadorId] : undefined);
    await propagarSinFallar({ sql: opciones?.sql, ahora: opciones?.ahora, ...(indicadorIds ? { indicadorIds } : {}) });
  }
  return abiertas;
}
