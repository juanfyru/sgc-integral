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
 *   que digitó una persona.
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
 *   el evento. Vale igual para un dato y para un componente.
 * - **El evento es del sistema** (`propagacion`, sin usuario): qué cambió de cada fuente (`detalle.fuentes`, con la letra,
 *   la clase, el id del dato o del indicador y el antes y el después) y los valores de todas las letras a los dos lados.
 *
 * Candados: el indicador `FOR SHARE`, después la medición `FOR UPDATE`, todo releído bajo ellos; la fuente (el dato o las
 * mediciones del componente) se lee sin candado: la medición que depende no bloquea la de su fuente. Primero se buscan sin
 * candado las mediciones a las que les cambiaría algo, y cada una va en su transacción: la que falla se registra, cuenta en
 * `fallidas` y la siguiente pasada la intenta otra vez. Corre justo después de la acción que cambia una fuente
 * (`propagarSinFallar`), en la pasada de vencimientos y, antes de clasificar, en el resumen y el cierre del mes.
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
import { analisisCompleto, analisisExigido, cumpleDeFila } from "@/lib/indicadores/estados";
import { aTexto, comparar, deTexto, fraccion, type Fraccion } from "@/lib/indicadores/formula/fraccion";
import { nivelesBajo, porNiveles } from "@/lib/indicadores/grafo";
import { clavesFinas, contiene, periodicidadDe, versionQueRigeEntre } from "@/lib/indicadores/periodos";
import { esAjena } from "@/lib/indicadores/origen";
import { laFuenteMueveElPlazo } from "@/lib/indicadores/propagacion";
import { fichaDeCalculo, reglaDeTexto, valorEnTexto, type ReglaEnTexto } from "@/lib/indicadores/reporte";
import { rachasDe } from "@/lib/indicadores/resultados";
import type { Regla } from "@/lib/indicadores/semaforo";
import {
  MOTIVO_COMPONENTE_NO_APLICA,
  MOTIVO_NADA_QUE_MEDIR,
  type Consolidacion,
  type Periodicidad,
  type Semaforo,
  type Toma,
} from "@/lib/indicadores/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { aristasDeComponentes } from "./componentes";
import {
  analisisDe,
  columnasDeValor,
  elegirValores,
  esDeOtraPeriodicidad,
  mide,
  primeraAprobada,
  recalcularMedicion,
  texto,
  tramos,
  valoresPorLetra,
  versionesAprobadas,
  versionesAprobadasDe,
  versionesDeCalculo,
  type ValorGuardado,
  type VersionDeCalculo,
} from "./mediciones";

type Opciones = { sql?: Cliente; ahora?: Date; indicadorIds?: readonly number[] };

/** El valor de un dato juntado para un periodo: listo, con los periodos del dato que se juntaron, o falta alguno. */
export type ValorDeDato = { estado: "listo"; valor: Fraccion; periodos: number[] } | { estado: "falta" };

/**
 * Lo que tiene un componente para el periodo de un compuesto (anexo 14C, §6.3): listo, con las mediciones del componente
 * que entraron al valor y, si es un acumulado que no empieza en el primer periodo del tramo, la clave del primero que entró;
 * falta algo; o no aplicó.
 */
export type ValorDeComponente =
  | { estado: "listo"; valor: Fraccion; mediciones: number[]; desde: string | null }
  | { estado: "falta" }
  | { estado: "no_aplica" };

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
  return sql`SELECT id, variable_id, periodo, valor, por_categoria FROM variable_valores
    WHERE variable_id IN ${sql([...new Set(datoIds)])} AND estado IN ('reportado', 'cerrado') AND valor IS NOT NULL`;
}

/**
 * El dato juntado sobre los periodos que forman el de la medición (`clavesFinas`), con su regla (`juntadoONada`): falta si
 * alguno no tiene valor. Con `categoriaId`, el valor de esa categoría (`por_categoria`). `filas` son las de `filasDeDatos`.
 */
function juntarDato(filas: readonly Row[], d: DatoDelPeriodo): ValorDeDato {
  const claves = clavesFinas(d.periodo, d.datoPeriodicidad);
  const porClave = new Map(filas.filter((f) => Number(f.variable_id) === d.datoId).map((f) => [f.periodo as string, f]));
  const valorDe = (f: Row | undefined): Fraccion | null => {
    if (!f) return null;
    const t = d.categoriaId === undefined ? texto(f.valor) : texto((f.por_categoria as Record<string, unknown> | null)?.[String(d.categoriaId)]);
    return t === null ? null : fraccion(t);
  };
  const valor = juntadoONada(d.consolidacion, claves.map((c) => valorDe(porClave.get(c))));
  return valor ? { estado: "listo", valor, periodos: claves.map((c) => Number(porClave.get(c)!.id)) } : { estado: "falta" };
}

/**
 * El valor de un dato compartido para el periodo `periodo` de un indicador (anexo 14C, §4.5): los periodos del dato que lo
 * forman, juntados con su regla, solo si todos están reportados o cerrados con valor; si falta alguno, `falta`. Con
 * `categoriaId`, el de esa categoría. Lee sin candado.
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
const NO_APLICA: ValorDeComponente = { estado: "no_aplica" };

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
 *   medido. `desde` es la clave del primer periodo que entró cuando no es el primero del tramo.
 * `mediciones` son las que entraron al valor: la del periodo o las de la racha, también sus «No aplica».
 */
export async function valorDeComponente(
  sql: Cliente,
  d: { indicadorId: number; toma: Toma; periodo: string; desde: Date; hasta: Date },
): Promise<ValorDeComponente> {
  const zona = zonaHoraria();
  const gruesa = periodicidadDe(d.periodo);
  const [indicador] = await sql`SELECT inicio_medicion FROM indicadores WHERE id = ${d.indicadorId}`;
  const inicio = texto(indicador?.inicio_medicion);
  const versiones = await versionesAprobadas(sql, d.indicadorId);
  if (!gruesa || !inicio || versiones.length === 0) return FALTA;

  const dentro = (p: Periodo, t: { desde: number; hasta: number }) =>
    p.desde.getTime() >= t.desde && p.desde.getTime() < t.hasta && p.desde.getTime() >= d.desde.getTime() && p.hasta.getTime() <= d.hasta.getTime();
  const esperados = tramos(versiones, inicio, zona)
    .flatMap((t) => (contiene(gruesa, t.periodicidad) ? clavesFinas(d.periodo, t.periodicidad).map((c) => periodoDe(c, zona)!).filter((p) => dentro(p, t)) : []))
    .sort((a, b) => a.desde.getTime() - b.desde.getTime());
  if (esperados.length === 0) return FALTA;

  const filas = await sql`SELECT * FROM mediciones WHERE indicador_id = ${d.indicadorId} AND desde >= ${d.desde} AND hasta <= ${d.hasta}`;
  const porClave = new Map(filas.map((m) => [m.periodo as string, m]));
  const aprobada = primeraAprobada(versiones)?.aprobadaEn ?? null;
  const entran: { periodo: Periodo; m: Row; rige: VersionDeCalculo }[] = [];
  for (const p of esperados) {
    const m = porClave.get(p.clave);
    if (!m || !conDato(m)) {
      // Un histórico que nadie registró no lo debe nadie: se salta. Un ordinario sin dato, se espera.
      const historico = m ? m.historica === true : aprobada !== null && p.hasta.getTime() < aprobada.getTime();
      if (historico) continue;
      return FALTA;
    }
    entran.push({ periodo: p, m, rige: versionQueRigeEntre(versiones, p, zona)! });
  }
  if (entran.length === 0) return FALTA;

  if (esperados.length === 1 && esperados[0].clave === d.periodo) {
    const { m, rige } = entran[0];
    if (m.no_aplica === true) return NO_APLICA;
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
  const medidos = deLaRacha.filter((e) => e.m.no_aplica !== true);
  if (deLaRacha.length > 0 && medidos.length === 0) return NO_APLICA;
  const ficha = fichaDeCalculo(rigeAlFinal.calculo);
  if (!ficha || medidos.length === 0) return FALTA;

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
  );
  const valor = r.resultado ? deLaToma(d.toma, r.resultado, r.cumple, regla) : null;
  if (!valor) return FALTA;
  const primera = r.desde === null ? null : r.desde.slice(r.desde.indexOf("#") + 1);
  return { estado: "listo", valor, mediciones: deLaRacha.map((e) => Number(e.m.id)), desde: primera !== null && primera !== esperados[0].clave ? primera : null };
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
};

/**
 * Lo que la propagación le cambia a la medición `m` (`guardados`: sus valores por letra de `version`; `ajenos`: lo que tiene
 * cada fuente), o `null` si nada: cada letra ajena cuya fracción difiere de la de su fuente; el reporte del sistema en un
 * indicador sin variables propias que ya tiene todo; y el «No aplica» del sistema: el del contagio, si algún componente no
 * aplicó (con el reporte del sistema si no estaba reportada), o si no, el de nada que medir, que vale con todos los valores,
 * la medición reportada y la fórmula dividiendo por cero. Al salir del contagio, el reporte que puso vuelve a quien le toca.
 * Un «No aplica» de una persona no se toca. No consulta nada.
 */
function planear(m: Row, version: VersionDeCalculo, guardados: Readonly<Record<string, Fraccion>>, ajenos: ReadonlyMap<string, ValorAjeno>): Plan | null {
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
  if (cambios.length === 0 && !reportar && !quitarReporte && noAplica === null) return null;
  return { cambios, valores, reportar, quitarReporte, noAplica, componente: noAplica?.motivo === MOTIVO_COMPONENTE_NO_APLICA ? sinAplicar!.fuenteId : null };
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

/** ¿La medición pide un análisis que no tiene? El que exige su resultado (`analisisExigido`) frente al guardado. */
function pideAnalisis(d: { semaforo: Semaforo | null; cumple: boolean | null; repetido: boolean; noAplica: boolean }, m: Row): boolean {
  return !analisisCompleto(analisisExigido({ ...d, historica: false }), analisisDe(m));
}

/**
 * La propagación de una medición en su transacción, con los candados (el indicador `FOR SHARE` y la medición `FOR UPDATE`) y
 * todo releído bajo ellos (la fuente, sin candado): «valores», «no_aplica» (quedó en el «No aplica» del sistema) o `null` si
 * ya no le tocaba o nada difería.
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
  const guardados = await valoresPorLetra(tx, medicionId, version);
  const plan = planear(m, version, guardados, await ajenosDe(tx, version, m, await filasDeDatos(tx, datosDe(version))));
  if (!plan) return null;

  for (const c of plan.cambios) await escribirAjeno(tx, { id: medicionId, indicadorId }, c, ahora);
  if (plan.reportar) await tx`UPDATE mediciones SET reportada_en = ${ahora}, reportada_por = NULL WHERE id = ${medicionId}`;
  if (plan.quitarReporte) await tx`UPDATE mediciones SET reportada_en = NULL, reportada_por = NULL WHERE id = ${medicionId}`;
  if (plan.noAplica) {
    await tx`UPDATE mediciones SET no_aplica = ${plan.noAplica.motivo !== null}, no_aplica_motivo = ${plan.noAplica.motivo} WHERE id = ${medicionId}`;
  }
  const noAplica = plan.noAplica ? plan.noAplica.motivo !== null : m.no_aplica === true;
  const marca = (no: boolean, motivo: unknown) => (plan.noAplica ? { noAplica: no, motivo: (motivo as string | null) ?? null } : {});
  const semaforo = (m.semaforo as Semaforo | null) ?? null;
  const pedia = pideAnalisis(
    { semaforo, cumple: cumpleDeFila({ cumple: (m.cumple as boolean | null) ?? null, semaforo }), repetido: m.incumplimiento_repetido === true, noAplica: m.no_aplica === true },
    m,
  );
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
    // Un cambio ajeno que la deja pidiendo el análisis con la fecha ya pasada no la deja vencida (anexo 14C, §3.4).
    conElResultado: async (r) => {
      const pide = pideAnalisis({ semaforo: r.despues, cumple: r.cumple, repetido: r.repetido, noAplica }, m);
      const vence = laFuenteMueveElPlazo({
        pedia,
        pide,
        venceEn: new Date(m.vence_en as string),
        ahora,
        plazoDias: Number(i.plazo_reporte_dias),
        zona,
      });
      if (!vence) return {};
      await tx`UPDATE mediciones SET vence_en = ${vence}, aviso_previo_en = NULL, aviso_vencido_en = NULL, escalado_en = NULL
        WHERE id = ${medicionId}`;
      return { venceEn: vence.toISOString() };
    },
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
    sql`SELECT mv.medicion_id, ${columnasDeValor(sql)}
      FROM medicion_valores mv JOIN indicador_variables iv ON iv.id = mv.variable_id
      WHERE mv.medicion_id IN ${sql(candidatas.map((x) => Number(x.m.id)))} AND mv.categoria_id IS NULL AND mv.valor IS NOT NULL`,
    filasDeDatos(sql, candidatas.flatMap((x) => datosDe(x.version))),
  ]);
  const porMedicion = new Map<number, Row[]>();
  for (const g of guardados) porMedicion.set(Number(g.medicion_id), [...(porMedicion.get(Number(g.medicion_id)) ?? []), g]);
  const ids: number[] = [];
  for (const { m, version } of candidatas) {
    const id = Number(m.id);
    try {
      const valores = elegirValores((porMedicion.get(id) ?? []) as unknown as ValorGuardado[], version);
      if (planear(m, version, valores, await ajenosDe(sql, version, m, deDatos))) ids.push(id);
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
