/**
 * Las lecturas del módulo de indicadores (spec 14 §8, §11 y §12): la pantalla de reporte y la medición por reportar, la
 * tabla del año y los resultados de un indicador (acumulado y series de las gráficas), el indicador con lo que la persona
 * puede hacer, la lista con sus filtros y su barra de estados, y la matriz del año. Solo leen (salvo abrir los periodos
 * terminados, que es idempotente): la escritura vive en `mediciones.ts`, del que esta importa sus auxiliares (nunca al
 * revés). Lo que se lee de varios indicadores va en lote (`versionesAprobadasDe`, `leerPeriodos`): el número de
 * sentencias no depende de cuántos haya.
 */
import type { Row } from "postgres";
import type { EstadoDePunto, PuntoDeSerie } from "@/componentes/ui/geometria-tubos";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { escaparLike } from "@/db/consultas/normograma/busqueda";
import {
  filtroIndicadores,
  participaEn,
  puedeAnalizar,
  puedeMedir,
  puedeObservar,
  puedeVerIndicador,
  puedeVerSoportes,
  type SujetoVisibilidad,
} from "@/lib/alcance";
import { MESES, periodoDe, type Periodo } from "@/lib/indicadores-documentales/periodo";
import { acumulado } from "@/lib/indicadores/acumulado";
import { analisisCompleto, analisisExigido, estadoVisible, type EstadoVisible } from "@/lib/indicadores/estados";
import { enPalabras } from "@/lib/indicadores/formula/formas";
import { aDecimal, aTexto, comparar, deTexto, type Fraccion } from "@/lib/indicadores/formula/fraccion";
import { clavesDelAnio, mesesDe, mismoDelAnioAnterior, periodicidadDe, versionQueRigeEntre } from "@/lib/indicadores/periodos";
import { fichaDeCalculo, reglaDeTexto, valorEnTexto, type CalculoEnTexto, type ReglaEnTexto } from "@/lib/indicadores/reporte";
import {
  anioDeClave,
  etiquetaDeComparacion,
  mesesEnPalabras,
  nombreCorto,
  rachasDe,
  repartirMeses,
  rotuloDelAcumulado,
  textoDelLimite,
} from "@/lib/indicadores/resultados";
import { limiteDeCritico, numeroEs, numeroExacto, rangosEnPalabras, type Regla } from "@/lib/indicadores/semaforo";
import { comparacion, fraseDeResultado, textoMeta, textoValor, type Unidad } from "@/lib/indicadores/textos";
import {
  ErrorIndicador,
  ETIQUETA_SEMAFORO,
  type EstadoIndicador,
  type EstadoMedicion,
  type Periodicidad,
  type Semaforo,
} from "@/lib/indicadores/tipos";
import { ErrorPermiso, puede } from "@/lib/permisos";
import { cuenta } from "@/lib/plural";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { fichaDeVersion, operacionDeIndicador, versionVigente, type FichaLeida, type OperacionLeida } from "./aprobacion";
import { indicadorPorCodigo } from "./fichas";
import { obtenerParametros } from "./maestros";
import {
  analisisDe,
  anteriorConResultado,
  asegurarMediciones,
  conMayuscula,
  contarSoportes,
  contextoDeMedicion,
  elegirValores,
  esDeOtraPeriodicidad,
  reglaDelPeriodo,
  texto,
  tramos,
  valoresPorLetra,
  versionesAprobadas,
  versionesAprobadasDe,
  type Contexto,
  type ValorGuardado,
  type VersionDeCalculo,
} from "./mediciones";
import { columnasDePendiente, esPendiente, queFalta, type Falta } from "./tareas";

type Opciones = { sql?: Cliente; ahora?: Date };

/** «10 de octubre de 2026», el día en la zona de la instalación. */
function diaEnPalabras(d: Date): string {
  const [anio, mes, dia] = fechaEnZona(d, zonaHoraria()).split("-").map(Number);
  return `${dia} de ${MESES[mes - 1]} de ${anio}`;
}

export type VariableDeReporte = {
  letra: string;
  nombre: string;
  descripcion: string | null;
  fuente: string | null;
  capturaMin: string | null;
  capturaMax: string | null;
  admiteNegativos: boolean;
  /** Lo guardado, con punto decimal; `null` si no hay. */
  valor: string | null;
};

/** Lo que la pantalla de reporte necesita (spec §8.2 y §12.5), todo en texto para el navegador. */
export type DatosDeReporte = {
  medicionId: number;
  indicadorId: number;
  codigo: string;
  nombre: string;
  periodo: string;
  /** «Tercer trimestre de 2026». */
  etiqueta: string;
  /** «10 de octubre de 2026». */
  vence: string;
  vencida: boolean;
  estado: EstadoMedicion;
  historica: boolean;
  noAplica: boolean;
  motivo: string | null;
  reportada: boolean;
  soporteObligatorio: boolean;
  soportes: number;
  /** El Admin SGC mide porque nadie más puede (spec §6.1). */
  sinMedidor: boolean;
  variables: VariableDeReporte[];
  calculo: CalculoEnTexto;
  formulaEnPalabras: string;
  regla: ReglaEnTexto;
  unidad: Unidad;
  rangos: string | null;
  /** La fracción exacta guardada («60/1»), o `null`. */
  resultado: string | null;
  semaforo: Semaforo | null;
  /** La medición anterior con resultado, para la confirmación por variación; la etiqueta, en minúscula. */
  anterior: { clave: string; etiqueta: string; resultado: string } | null;
  variacionPct: number;
};

/** La medición de `periodo` del indicador `codigo` para reportarla; `null` si no existe o la persona no puede medirla. */
export async function medicionParaReportar(
  sesion: SujetoVisibilidad,
  codigo: string,
  periodo: string,
  opciones?: Opciones,
): Promise<DatosDeReporte | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  if (periodicidadDe(periodo) === null) return null;
  const [m] = await sql`SELECT m.id FROM mediciones m JOIN indicadores i ON i.id = m.indicador_id
    WHERE lower(i.codigo) = lower(${codigo}) AND m.periodo = ${periodo}`;
  if (!m) return null;
  let ctx: Contexto;
  try {
    // Una medición cerrada se muestra (sin formulario) a quien podría medirla; lo demás no existe para la persona.
    ctx = await contextoDeMedicion(sql, sesion, Number(m.id), false, { admiteCerrada: true });
  } catch (err) {
    if (err instanceof ErrorIndicador || err instanceof ErrorPermiso) return null;
    throw err;
  }
  return datosDeReporte(sql, ctx, ahora);
}

async function datosDeReporte(sql: Cliente, ctx: Contexto, ahora: Date): Promise<DatosDeReporte> {
  const { medicion: m, version, indicador } = ctx;
  const guardados = await valoresPorLetra(sql, m.id, version);
  const regla = await reglaDelPeriodo(sql, indicador.id, m.periodo as string, version);
  const anterior = await anteriorConResultado(sql, indicador.id, m.desde);
  const { variacionConfirmarPct } = await obtenerParametros({ sql });
  const vence = new Date(m.vence_en as string);
  const nombres = Object.fromEntries(version.variables.map((v) => [v.letra, v.nombre]));
  return {
    medicionId: m.id,
    indicadorId: indicador.id,
    codigo: indicador.codigo,
    nombre: version.nombre ?? indicador.codigo,
    periodo: m.periodo as string,
    etiqueta: conMayuscula(ctx.periodo.etiqueta),
    vence: diaEnPalabras(vence),
    vencida: m.historica !== true && ahora.getTime() > vence.getTime(),
    estado: m.estado as EstadoMedicion,
    historica: m.historica === true,
    noAplica: m.no_aplica === true,
    motivo: (m.no_aplica_motivo as string | null) ?? null,
    reportada: m.reportada_en !== null,
    soporteObligatorio: indicador.soporteObligatorio,
    soportes: await contarSoportes(sql, m.id),
    sinMedidor: ctx.capacidad.sinMedidor,
    variables: version.variables.map((v) => ({
      letra: v.letra,
      nombre: v.nombre,
      descripcion: v.descripcion,
      fuente: v.fuente,
      capturaMin: v.capturaMin,
      capturaMax: v.capturaMax,
      admiteNegativos: v.admiteNegativos,
      valor: guardados[v.letra] ? valorEnTexto(guardados[v.letra]) : null,
    })),
    calculo: version.calculo,
    formulaEnPalabras: enPalabras(version.calculo.formula, nombres),
    regla,
    unidad: version.unidad,
    rangos: rangosEnPalabras(reglaDeTexto(regla), version.unidad),
    resultado: (m.resultado_exacto as string | null) ?? null,
    semaforo: (m.semaforo as Semaforo | null) ?? null,
    anterior: anterior ? { clave: anterior.clave, etiqueta: anterior.etiqueta, resultado: aTexto(anterior.valor) } : null,
    variacionPct: variacionConfirmarPct,
  };
}

/** La medición abierta más antigua que la persona puede reportar del indicador (la del botón «Reportar»), o `null`. */
export async function proximaPorReportar(
  sesion: SujetoVisibilidad,
  indicadorId: number,
  opciones?: { sql?: Cliente },
): Promise<{ periodo: string; etiqueta: string } | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const [i] = await sql`SELECT estado FROM indicadores WHERE id = ${indicadorId}`;
  if (i?.estado !== "activo" || !(await puedeVerIndicador(indicadorId, sesion, { sql }))) return null;
  if (!(await puedeMedir(indicadorId, sesion, { sql })).puede) return null;
  const filas = await sql`SELECT periodo FROM mediciones
    WHERE indicador_id = ${indicadorId} AND estado = 'abierta' AND NOT historica AND NOT no_aplica AND reportada_en IS NULL
    ORDER BY desde`;
  const zona = zonaHoraria();
  const versiones = filas.length > 0 ? await versionesAprobadas(sql, indicadorId) : [];
  for (const f of filas) {
    const clave = f.periodo as string;
    const periodo = periodoDe(clave, zona);
    const version = periodo ? versionQueRigeEntre(versiones, periodo, zona) : null;
    if (periodo && version && !esDeOtraPeriodicidad(clave, version)) return { periodo: clave, etiqueta: periodo.etiqueta };
  }
  return null;
}

/**
 * Los periodos de `anio` que se miden: los de la periodicidad que rige cada tramo, desde el inicio de medición. Lo usan la
 * tabla del año y las metas por periodo.
 */
export function periodosDelAnio(versiones: readonly VersionDeCalculo[], inicioMedicion: string, anio: number, zona: string): Periodo[] {
  if (!periodoDe(inicioMedicion, zona)) return [];
  const periodos: Periodo[] = [];
  for (const t of tramos(versiones, inicioMedicion, zona)) {
    for (const clave of clavesDelAnio(t.periodicidad, anio)) {
      const p = periodoDe(clave, zona)!;
      if (p.desde.getTime() >= t.desde && p.desde.getTime() < t.hasta) periodos.push(p);
    }
  }
  return periodos;
}

export type FilaDelAnio = {
  periodo: string;
  /** «Primer trimestre de 2026». */
  etiqueta: string;
  medicionId: number | null;
  /** «por_venir»: el periodo no ha terminado; «sin_dato»: terminó y no tiene medición. */
  estado: EstadoVisible | "por_venir" | "sin_dato";
  vencida: boolean;
  /** «10 de abril de 2026»; `null` sin medición. */
  vence: string | null;
  historica: boolean;
  noAplica: boolean;
  motivo: string | null;
  /** Por letra de la versión que rige el periodo, con el nombre que tiene en ella y coma decimal; `null` si no hay. */
  valores: { letra: string; nombre: string; valor: string | null }[];
  /** «60 %»: nunca contradice el color. */
  resultado: string | null;
  semaforo: Semaforo | null;
  /** «≥ 90 %», «sin meta». */
  meta: string;
  /** La columna «Cumple» (spec §8.3): `null` sin resultado o sin meta. */
  cumple: boolean | null;
  frase: string | null;
  requiereAccion: boolean;
  repetido: boolean;
  corregida: boolean;
  metaTardia: boolean;
  sinAnalisis: boolean;
  analisis: string | null;
  causa: string | null;
  accionPropuesta: string | null;
  /**
   * Una medición de una periodicidad que ya no rige (la deja un cambio mayor, con datos o cerrada, `esDeOtraPeriodicidad`):
   * se muestra, marcada, pero no se reporta, ni se analiza ni se reabre.
   */
  deOtraPeriodicidad?: boolean;
};

const anioValido = (anio: number) => Number.isInteger(anio) && anio >= 1900 && anio <= 9999;

/** Una fracción como número para dibujar: las gráficas trabajan con números; el veredicto ya se decidió con la fracción. */
const aNumero = (f: Fraccion) => Number(aDecimal(f, 6, "redondear"));

/** La página de un indicador (como `rutaDeIndicador`, que vive en la capa de las páginas). */
const rutaDe = (codigo: string) => `/indicadores/${encodeURIComponent(codigo)}`;

function agrupar<T>(filas: readonly T[], clave: (f: T) => number): Map<number, T[]> {
  const salida = new Map<number, T[]>();
  for (const f of filas) {
    const k = clave(f);
    const lista = salida.get(k);
    if (lista) lista.push(f);
    else salida.set(k, [f]);
  }
  return salida;
}

// ─────────────────────────────────────────────────────────────────────────────
// Los periodos de uno o varios indicadores, en lote
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que hace falta de un indicador para leer sus periodos. */
type Base = { id: number; inicio: string | null; soporteObligatorio: boolean; versiones: VersionDeCalculo[] };

/** Los indicadores de `ids` con sus versiones aprobadas, en tres lecturas. */
async function basesDe(sql: Cliente, ids: readonly number[]): Promise<Base[]> {
  if (ids.length === 0) return [];
  const [filas, versiones] = await Promise.all([
    sql`SELECT id, inicio_medicion, soporte_obligatorio FROM indicadores WHERE id IN ${sql([...ids])}`,
    versionesAprobadasDe(sql, ids),
  ]);
  return filas.map((f) => ({
    id: Number(f.id),
    inicio: texto(f.inicio_medicion),
    soporteObligatorio: f.soporte_obligatorio === true,
    versiones: versiones.get(Number(f.id)) ?? [],
  }));
}

/**
 * Un periodo leído: su fila de la tabla del año y lo que el acumulado, las gráficas y la matriz necesitan además (la
 * versión que lo rige, su regla, el resultado y los valores exactos).
 */
type PeriodoLeido = {
  periodo: Periodo;
  version: VersionDeCalculo;
  regla: Regla;
  resultado: Fraccion | null;
  valores: Record<string, Fraccion>;
  fila: FilaDelAnio;
};

/**
 * Los periodos de los años `desde` a `hasta` de cada indicador, con su medición, en tres lecturas para todos (mediciones,
 * metas programadas y valores): los de la periodicidad que rige cada tramo (`periodosDelAnio`) y, además, las mediciones
 * de otra periodicidad que tienen datos o están cerradas: se muestran, marcadas, sin pisar a las de la que rige.
 * La meta de cada periodo es la congelada si la hay; si no, la que aplicaría hoy.
 */
async function leerPeriodos(
  sql: Cliente,
  bases: readonly Base[],
  anios: { desde: number; hasta: number },
  ahora: Date,
): Promise<Map<number, PeriodoLeido[]>> {
  const zona = zonaHoraria();
  const salida = new Map<number, PeriodoLeido[]>();
  const rigen = new Map<number, Periodo[]>();
  for (const b of bases) {
    salida.set(b.id, []);
    if (!b.inicio || b.versiones.length === 0) continue;
    const periodos: Periodo[] = [];
    for (let anio = anios.desde; anio <= anios.hasta; anio++) periodos.push(...periodosDelAnio(b.versiones, b.inicio, anio, zona));
    rigen.set(b.id, periodos);
  }
  const ids = [...rigen.keys()];
  if (ids.length === 0) return salida;
  const inicio = periodoDe(String(anios.desde), zona)!.desde;
  const fin = periodoDe(String(anios.hasta + 1), zona)!.desde;
  const [mediciones, metas] = await Promise.all([
    sql`SELECT * FROM mediciones WHERE indicador_id IN ${sql(ids)} AND desde >= ${inicio} AND desde < ${fin}`,
    sql`SELECT indicador_id, periodo, meta, meta_max FROM indicador_metas
      WHERE indicador_id IN ${sql(ids)} AND left(periodo, 4)::int BETWEEN ${anios.desde} AND ${anios.hasta}`,
  ]);
  const valores =
    mediciones.length === 0
      ? []
      : await sql`SELECT mv.id, mv.medicion_id, mv.variable_id, iv.letra, mv.valor, mv.reportado_en
          FROM medicion_valores mv JOIN indicador_variables iv ON iv.id = mv.variable_id
          WHERE mv.medicion_id IN ${sql(mediciones.map((m) => Number(m.id)))} AND mv.categoria_id IS NULL AND mv.valor IS NOT NULL`;
  const valoresDe = agrupar(valores, (v) => Number(v.medicion_id));
  const medicionesDe = agrupar(mediciones, (m) => Number(m.indicador_id));
  const programadas = new Map(metas.map((x) => [`${x.indicador_id}|${x.periodo}`, x]));

  for (const b of bases) {
    const periodos = rigen.get(b.id);
    if (!periodos) continue;
    const propias = medicionesDe.get(b.id) ?? [];
    const porClave = new Map(propias.map((m) => [m.periodo as string, m]));
    const leer = (p: Periodo, version: VersionDeCalculo, m: Row | null, otra: boolean): PeriodoLeido => {
      const programada = programadas.get(`${b.id}|${p.clave}`);
      const reglaTexto: ReglaEnTexto =
        m && m.meta_aplicada !== null
          ? { ...version.regla, meta: texto(m.meta_aplicada), metaMax: texto(m.meta_max_aplicada) }
          : programada
            ? { ...version.regla, meta: texto(programada.meta), metaMax: texto(programada.meta_max) }
            : version.regla;
      const regla = reglaDeTexto(reglaTexto);
      const exactos = m ? elegirValores((valoresDe.get(Number(m.id)) ?? []) as unknown as ValorGuardado[], version) : {};
      const fila = m ? filaDeMedicion(m, p, version, regla, exactos, b.soporteObligatorio, ahora) : filaSinMedicion(p, version, regla, ahora);
      return {
        periodo: p,
        version,
        regla,
        resultado: m && typeof m.resultado_exacto === "string" ? deTexto(m.resultado_exacto) : null,
        valores: exactos,
        fila: otra ? { ...fila, deOtraPeriodicidad: true } : fila,
      };
    };
    const leidos = periodos.map((p) => leer(p, versionQueRigeEntre(b.versiones, p, zona)!, porClave.get(p.clave) ?? null, false));
    const claves = new Set(periodos.map((p) => p.clave));
    for (const m of propias) {
      const clave = m.periodo as string;
      const p = claves.has(clave) ? null : periodoDe(clave, zona);
      const rige = p ? versionQueRigeEntre(b.versiones, p, zona) : null;
      if (!p || !rige || !esDeOtraPeriodicidad(clave, rige)) continue;
      if (m.estado === "abierta" && m.reportada_en === null && m.no_aplica !== true) continue;
      leidos.push(leer(p, b.versiones.find((v) => v.id === Number(m.version_id)) ?? rige, m, true));
    }
    const otra = (l: PeriodoLeido) => Number(l.fila.deOtraPeriodicidad === true);
    salida.set(
      b.id,
      leidos.sort((x, y) => x.periodo.desde.getTime() - y.periodo.desde.getTime() || otra(x) - otra(y)),
    );
  }
  return salida;
}

/**
 * La tabla del año (spec §8.5 y §12.3): una fila por periodo de la periodicidad que rige, desde el inicio de medición,
 * con sus valores, resultado, meta, estado visible y marcas, y las mediciones que quedaron de otra periodicidad con datos
 * (marcadas); sin soportes. Vacía para quien no ve el indicador.
 */
export async function tablaDelAnio(sesion: SujetoVisibilidad, indicadorId: number, anio: number, opciones?: Opciones): Promise<FilaDelAnio[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  if (!anioValido(anio) || !(await puedeVerIndicador(indicadorId, sesion, { sql }))) return [];
  const leidos = await leerPeriodos(sql, await basesDe(sql, [indicadorId]), { desde: anio, hasta: anio }, ahora);
  return (leidos.get(indicadorId) ?? []).map((l) => l.fila);
}

// ─────────────────────────────────────────────────────────────────────────────
// El acumulado del año
// ─────────────────────────────────────────────────────────────────────────────

/**
 * El acumulado del año (spec §8.10) en texto: el resultado, su estado, el valor reunido de cada variable y el rótulo
 * («Acumulado parcial: falta julio», «Acumulado desde julio, versión 2»), con el número y la meta que dibuja el tubo.
 */
export type ResumenAcumulado = {
  texto: string | null;
  semaforo: Semaforo | null;
  valores: Record<string, string>;
  rotulo: string | null;
  valor: number | null;
  meta: { valor: number; texto: string } | null;
};

const SIN_ACUMULADO: ResumenAcumulado = { texto: null, semaforo: null, valores: {}, rotulo: null, valor: null, meta: null };

/**
 * El acumulado de un año con los periodos que rigen en él, en orden (`acumulado`, la función pura de la Tarea 4). Manda
 * la racha (`rachasDe`) del último periodo terminado del año, no la de la ficha vigente: un año anterior se acumula con la
 * suya. Se juzga contra la meta del último periodo medido de esa racha. Es el mismo cálculo en la página y en la columna
 * «Año» de la matriz.
 */
function resumenAcumulado(leidos: readonly PeriodoLeido[], versiones: readonly VersionDeCalculo[], ahora: Date): ResumenAcumulado {
  const terminados = leidos.filter((l) => l.periodo.hasta.getTime() < ahora.getTime());
  const ultimo = terminados.at(-1);
  const ficha = ultimo ? fichaDeCalculo(ultimo.version.calculo) : null;
  if (!ultimo || !ficha) return SIN_ACUMULADO;
  const rachas = rachasDe(versiones);
  const rachaDe = (l: PeriodoLeido) => rachas.get(l.version.id)?.id ?? l.version.id;
  const racha = rachaDe(ultimo);
  const medido = [...terminados].reverse().find((l) => rachaDe(l) === racha && l.resultado !== null);
  const regla = (medido ?? ultimo).regla;
  // `acumulado` ordena por clave como texto: con el inicio del periodo delante, el orden es el del calendario aunque la
  // periodicidad cambie dentro del año (meses y trimestres de una misma racha).
  const orden = (l: PeriodoLeido) => `${l.periodo.desde.toISOString()}#${l.periodo.clave}`;
  const clave = (o: string) => o.slice(o.indexOf("#") + 1);
  const r = acumulado(
    leidos
      .filter((l) => l.fila.medicionId !== null)
      .map((l) => ({ clave: orden(l), versionId: rachaDe(l), noAplica: l.fila.noAplica, valores: l.resultado !== null ? l.valores : null })),
    {
      versionId: racha,
      calculo: ficha,
      consolidacion: Object.fromEntries(ultimo.version.variables.map((v) => [v.letra, v.consolidacion])),
      esperados: terminados.map(orden),
      regla,
    },
  );
  const unidad = ultimo.version.unidad;
  const desdeOtraRacha = terminados.some((l) => rachaDe(l) !== racha) && r.desde !== null;
  return {
    texto: r.resultado ? textoValor(r.resultado, unidad, regla) : null,
    semaforo: r.semaforo,
    valores: Object.fromEntries(Object.entries(r.valores).map(([letra, v]) => [letra, numeroEs(v, 4, "truncar")])),
    rotulo: rotuloDelAcumulado(
      r.faltan.map(clave),
      desdeOtraRacha ? { clave: clave(r.desde!), numero: rachas.get(ultimo.version.id)?.numero ?? ultimo.version.numero } : null,
    ),
    valor: r.resultado ? aNumero(r.resultado) : null,
    meta: regla.meta ? { valor: aNumero(regla.meta), texto: `Meta ${numeroExacto(regla.meta, unidad.decimales)}${unidad.sufijo}` } : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Los resultados del año: tabla, acumulado y gráficas
// ─────────────────────────────────────────────────────────────────────────────

export type SerieDeVariable = { letra: string; nombre: string; serie: PuntoDeSerie[] };

export type ResultadosDelAnio = {
  filas: FilaDelAnio[];
  acumulado: ResumenAcumulado;
  /** Los periodos de la gráfica principal, de la periodicidad que rige cada tramo. */
  serie: PuntoDeSerie[];
  /** Una serie por variable: la unión de las letras del rango, con el nombre de la versión más reciente que la tiene. */
  variables: SerieDeVariable[];
  /** Los años con mediciones, para elegir el de la tabla y el rango «todo». */
  anios: number[];
  /** Lo que la gráfica dibuja además de la serie: la meta de cada periodo, el límite de crítico y la franja del rango. */
  grafica: { meta: (number | null)[]; limite: { valor: number; texto: string } | null; rango: { min: number; max: number } | null; unidad: Unidad };
};

/** «Por reportar», «Por registrar», «Sin dato»: el estado de un periodo terminado que no tiene resultado. */
function nombreSinDato(f: FilaDelAnio): string {
  if (f.estado === "por_reportar") return f.historica ? "Por registrar" : f.vencida ? "Por reportar, vencida" : "Por reportar";
  return f.estado === "falta_dato" ? "Falta un dato" : "Sin dato";
}

const POR_VENIR = { valor: null, texto: "por venir", estado: "futuro", nombreEstado: "Por venir" } as const;

/** El periodo como punto de la gráfica (spec §11): «s. d.» y «n. a.» son huecos, nunca cero; lo que no ha terminado, tenue. */
function puntoDe(l: PeriodoLeido): PuntoDeSerie {
  const f = l.fila;
  const base = { clave: l.periodo.clave, etiqueta: l.periodo.etiqueta };
  if (f.estado === "por_venir") return { ...base, ...POR_VENIR };
  if (f.noAplica) return { ...base, valor: null, texto: "n. a.", estado: "no-aplica", nombreEstado: "No aplica" };
  if (l.resultado !== null && f.resultado !== null) {
    return {
      ...base,
      valor: aNumero(l.resultado),
      texto: f.resultado,
      estado: f.semaforo ?? "sin-meta",
      nombreEstado: f.semaforo ? ETIQUETA_SEMAFORO[f.semaforo] : "Sin meta",
    };
  }
  return { ...base, valor: null, texto: "s. d.", estado: "sin-dato", nombreEstado: nombreSinDato(f) };
}

/** El valor de una variable en un periodo, para su gráfica pequeña: solo de lo reportado; sin estado (las variables no lo tienen). */
function puntoDeVariable(l: PeriodoLeido, letra: string): PuntoDeSerie {
  const base = { clave: l.periodo.clave, etiqueta: l.periodo.etiqueta };
  if (l.fila.estado === "por_venir") return { ...base, ...POR_VENIR };
  if (l.fila.noAplica) return { ...base, valor: null, texto: "n. a.", estado: "no-aplica", nombreEstado: "No aplica" };
  if (!l.version.calculo.letras.includes(letra)) {
    return { ...base, valor: null, texto: "n. a.", estado: "no-aplica", nombreEstado: "La ficha de este periodo no tiene esta variable" };
  }
  const v = l.resultado !== null ? l.valores[letra] : undefined;
  if (v) return { ...base, valor: aNumero(v), texto: numeroEs(v, 4, "truncar"), estado: "sin-meta", nombreEstado: "" };
  return { ...base, valor: null, texto: "s. d.", estado: "sin-dato", nombreEstado: "Sin dato" };
}

function seriesDeVariables(leidos: readonly PeriodoLeido[]): SerieDeVariable[] {
  // El orden es el de la primera aparición; el nombre, el de la versión más reciente que tiene la letra.
  const nombres = new Map<string, string>();
  for (const l of leidos) for (const v of l.version.variables) nombres.set(v.letra, v.nombre);
  return [...nombres].map(([letra, nombre]) => ({ letra, nombre, serie: leidos.map((l) => puntoDeVariable(l, letra)) }));
}

/** La meta de cada periodo y, del último con meta, el límite de crítico y la franja de una meta en rango. */
function referencias(leidos: readonly PeriodoLeido[], versiones: readonly VersionDeCalculo[]): ResultadosDelAnio["grafica"] {
  const conMeta = [...leidos].reverse().find((l) => l.regla.meta !== null);
  const limite = conMeta ? limiteDeCritico(conMeta.regla) : null;
  const r = conMeta?.regla;
  return {
    meta: leidos.map((l) => (l.regla.meta ? aNumero(l.regla.meta) : null)),
    limite: conMeta && limite ? { valor: aNumero(limite), texto: textoDelLimite(limite, conMeta.regla, conMeta.version.unidad) } : null,
    rango:
      r && r.tendencia === "constante" && r.meta && r.metaMax && comparar(r.meta, r.metaMax) !== 0
        ? { min: aNumero(r.meta), max: aNumero(r.metaMax) }
        : null,
    unidad: (leidos.at(-1)?.version ?? versiones[0])?.unidad ?? { sufijo: "", decimales: 0 },
  };
}

/**
 * Los resultados de `anio` de un indicador (spec §12.3, maqueta 2): las filas de la tabla del año, su acumulado, la serie
 * de la gráfica principal y una por variable, los años con mediciones y las referencias de la gráfica. Con `desde`, la
 * serie y las variables abarcan desde ese año (el rango «dos años» o «todo»); la tabla y el acumulado siguen siendo los de
 * `anio`. Las mediciones de otra periodicidad salen en la tabla, no en las gráficas ni en el acumulado. Vacío para quien
 * no ve el indicador. No abre periodos: quien llama asegura antes (`asegurarMediciones`).
 */
export async function resultadosDelAnio(
  sesion: SujetoVisibilidad,
  indicadorId: number,
  anio: number,
  opciones?: Opciones & { desde?: number },
): Promise<ResultadosDelAnio> {
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const vacio: ResultadosDelAnio = {
    filas: [],
    acumulado: SIN_ACUMULADO,
    serie: [],
    variables: [],
    anios: [],
    grafica: { meta: [], limite: null, rango: null, unidad: { sufijo: "", decimales: 0 } },
  };
  if (!anioValido(anio) || !(await puedeVerIndicador(indicadorId, sesion, { sql }))) return vacio;
  const [base] = await basesDe(sql, [indicadorId]);
  if (!base) return vacio;
  const desde = opciones?.desde !== undefined && anioValido(opciones.desde) ? Math.min(opciones.desde, anio) : anio;
  const [leidos, anios] = await Promise.all([
    leerPeriodos(sql, [base], { desde, hasta: anio }, ahora),
    sql`SELECT DISTINCT left(periodo, 4)::int AS anio FROM mediciones WHERE indicador_id = ${indicadorId} ORDER BY 1`,
  ]);
  const todos = leidos.get(indicadorId) ?? [];
  const rigen = todos.filter((l) => l.fila.deOtraPeriodicidad !== true);
  return {
    filas: todos.filter((l) => anioDeClave(l.periodo.clave) === anio).map((l) => l.fila),
    acumulado: resumenAcumulado(
      rigen.filter((l) => anioDeClave(l.periodo.clave) === anio),
      base.versiones,
      ahora,
    ),
    serie: rigen.map(puntoDe),
    variables: seriesDeVariables(rigen),
    anios: anios.map((f) => Number(f.anio)),
    grafica: referencias(rigen, base.versiones),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// El indicador: el último resultado y lo que la persona puede hacer
// ─────────────────────────────────────────────────────────────────────────────

/** El último resultado en grande (spec §8.3 y §12.3): la cifra, su estado, la frase y la comparación. */
export type UltimoResultado = {
  periodo: string;
  /** «Tercer trimestre de 2026». */
  etiqueta: string;
  resultado: string | null;
  semaforo: Semaforo | null;
  noAplica: boolean;
  frase: string;
  comparacion: { texto: string; flecha: "sube" | "baja" | "igual"; mejora: boolean | null } | null;
  requiereAccion: boolean;
  repetido: boolean;
};

export type PermisosDeIndicador = { puedeMedir: boolean; puedeAnalizar: boolean; puedeObservar: boolean; veSoportes: boolean; administra: boolean };

/** Lo que la página, el impreso y el Excel de un indicador leen de él (Tareas 15 y 16). */
export type VistaDeIndicador = {
  id: number;
  codigo: string;
  estado: EstadoIndicador;
  /** La ficha vigente. */
  ficha: FichaLeida;
  operacion: OperacionLeida;
  ultimo: UltimoResultado | null;
  permisos: PermisosDeIndicador;
};

/** Las mediciones que cuentan como periodo vigente: no las que quedaron de otra periodicidad (`esDeOtraPeriodicidad`). */
function vigentes(filas: readonly Row[], versiones: readonly VersionDeCalculo[], zona: string): { m: Row; p: Periodo; v: VersionDeCalculo }[] {
  return filas.flatMap((m) => {
    const p = periodoDe(m.periodo as string, zona);
    const v = p ? versionQueRigeEntre(versiones, p, zona) : null;
    return p && v && !esDeOtraPeriodicidad(m.periodo as string, v) ? [{ m, p, v }] : [];
  });
}

const conResultado = (m: Row) => typeof m.resultado_exacto === "string" && m.no_aplica !== true;

/**
 * La comparación de un resultado (spec §8.3) con el periodo anterior medido y con el mismo del año anterior, entre las
 * mediciones vigentes (de la más reciente a la más antigua; la primera es la que se compara).
 */
function comparacionDe(lista: readonly { m: Row }[], tendencia: Regla["tendencia"], unidad: Unidad) {
  const [actual, ...antes] = lista;
  if (!actual || !conResultado(actual.m)) return null;
  const clave = actual.m.periodo as string;
  const previo = antes.find((x) => conResultado(x.m));
  const mismo = antes.find((x) => x.m.periodo === mismoDelAnioAnterior(clave) && conResultado(x.m));
  const referencia = (x: { m: Row } | undefined) =>
    x ? { valor: deTexto(x.m.resultado_exacto as string), etiqueta: etiquetaDeComparacion(x.m.periodo as string, anioDeClave(clave)) } : null;
  return comparacion(deTexto(actual.m.resultado_exacto as string), referencia(previo), mismo === previo ? null : referencia(mismo), tendencia, unidad);
}

/** El último periodo vigente con dato (resultado o «no aplica») del indicador, con su frase y su comparación. */
async function ultimoResultado(sql: Cliente, indicadorId: number, versiones: readonly VersionDeCalculo[]): Promise<UltimoResultado | null> {
  const filas = await sql`SELECT * FROM mediciones WHERE indicador_id = ${indicadorId} AND (resultado_exacto IS NOT NULL OR no_aplica)
    ORDER BY hasta DESC LIMIT 14`;
  const lista = vigentes(filas, versiones, zonaHoraria());
  const ultimo = lista[0];
  if (!ultimo) return null;
  const { m, p } = ultimo;
  const version = versiones.find((v) => v.id === Number(m.version_id)) ?? ultimo.v;
  const regla = reglaDeTexto({ ...version.regla, meta: texto(m.meta_aplicada), metaMax: texto(m.meta_max_aplicada) });
  const resultado = typeof m.resultado_exacto === "string" ? deTexto(m.resultado_exacto) : null;
  const semaforo = (m.semaforo as Semaforo | null) ?? null;
  const noAplica = m.no_aplica === true;
  return {
    periodo: m.periodo as string,
    etiqueta: conMayuscula(p.etiqueta),
    resultado: resultado ? textoValor(resultado, version.unidad, regla) : null,
    semaforo,
    noAplica,
    frase: fraseDeResultado({ resultado, semaforo, noAplica, motivo: texto(m.no_aplica_motivo) }, regla, version.unidad),
    comparacion: comparacionDe(lista, regla.tendencia, version.unidad),
    requiereAccion: m.requiere_accion === true,
    repetido: m.incumplimiento_repetido === true,
  };
}

/**
 * Un indicador para su página (spec §12.3): la ficha vigente, los datos de operación, el último resultado y lo que la
 * persona puede hacer con él. Medir y analizar, solo en un indicador activo. `null` si no existe para la persona (no lo
 * ve, spec §6.4) o no tiene ficha aprobada.
 */
export async function obtenerIndicador(sesion: SujetoVisibilidad, codigo: string, opciones?: Opciones): Promise<VistaDeIndicador | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const i = await indicadorPorCodigo(codigo, { sql });
  if (!i || !(await puedeVerIndicador(i.id, sesion, { sql }))) return null;
  const vigente = await versionVigente(sql, i.id);
  const ficha = vigente ? await fichaDeVersion(sesion, vigente.id, { sql }) : null;
  if (!ficha) return null;
  const activo = i.estado === "activo";
  const [operacion, versiones, mide, analiza, observa, soportes] = await Promise.all([
    operacionDeIndicador(i.id, { sql }),
    versionesAprobadas(sql, i.id),
    activo ? puedeMedir(i.id, sesion, { sql }) : null,
    activo ? puedeAnalizar(i.id, sesion, { sql }) : null,
    puedeObservar(i.id, sesion, { sql }),
    puedeVerSoportes(i.id, sesion, { sql }),
  ]);
  return {
    id: i.id,
    codigo: i.codigo,
    estado: i.estado,
    ficha,
    operacion,
    ultimo: await ultimoResultado(sql, i.id, versiones),
    permisos: {
      puedeMedir: mide?.puede === true,
      puedeAnalizar: analiza?.puede === true,
      puedeObservar: observa,
      veSoportes: soportes,
      administra: puede(sesion, "indicadores.administrar"),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// La lista
// ─────────────────────────────────────────────────────────────────────────────

export const SEMAFOROS_DE_LISTA = ["bien", "atencion", "critico", "sin-dato"] as const;
export const REPORTES_DE_LISTA = ["por-reportar", "falta-analisis", "vencida", "requiere-accion"] as const;

export type FiltroDeLista = {
  procesoId?: number;
  subprocesoId?: number;
  clasificacionId?: number;
  tipoId?: number;
  semaforo?: Semaforo | "sin-dato";
  reporte?: (typeof REPORTES_DE_LISTA)[number];
  participo?: boolean;
  texto?: string;
  retirados?: boolean;
};

type Consulta = Record<string, string | string[] | undefined>;
const primero = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);
const idDe = (v: string | string[] | undefined): number | undefined => {
  const t = primero(v);
  return t && /^\d{1,15}$/.test(t) && Number(t) > 0 ? Number(t) : undefined;
};
const marcado = (v: string | string[] | undefined) => ["1", "on", "true"].includes(primero(v) ?? "");
const entre = <T extends string>(valores: readonly T[], v: string | string[] | undefined): T | undefined =>
  (valores as readonly string[]).includes(primero(v) ?? "") ? (primero(v) as T) : undefined;

/**
 * Los filtros de la lista desde la consulta de la página (spec §12.2): `proceso`, `subproceso`, `clasificacion` y `tipo`
 * (ids), `semaforo` (`bien`, `atencion`, `critico`, `sin-dato`), `reporte` (`por-reportar`, `falta-analisis`, `vencida`,
 * `requiere-accion`), `participo=1`, `texto` (o `q`, hasta 100 caracteres) y `retirados=1`. Son los nombres de los enlaces
 * de «Mis tareas» y de los avisos (Tarea 13). Lo que no se entiende se ignora.
 */
export function filtroDeConsulta(q: Consulta): FiltroDeLista {
  const f: FiltroDeLista = {};
  const ids = { procesoId: idDe(q.proceso), subprocesoId: idDe(q.subproceso), clasificacionId: idDe(q.clasificacion), tipoId: idDe(q.tipo) };
  for (const [clave, valor] of Object.entries(ids)) if (valor !== undefined) f[clave as keyof typeof ids] = valor;
  const semaforo = entre(SEMAFOROS_DE_LISTA, q.semaforo);
  if (semaforo) f.semaforo = semaforo;
  const reporte = entre(REPORTES_DE_LISTA, q.reporte);
  if (reporte) f.reporte = reporte;
  if (marcado(q.participo)) f.participo = true;
  const texto = (primero(q.texto) ?? primero(q.q))?.trim().slice(0, 100);
  if (texto) f.texto = texto;
  if (marcado(q.retirados)) f.retirados = true;
  return f;
}

export type FilaDeLista = {
  id: number;
  codigo: string;
  nombre: string;
  proceso: string;
  subproceso: string | null;
  periodicidad: Periodicidad | null;
  restringido: boolean;
  retirado: boolean;
  /** Quien administra ve también borradores y descartados: sin ficha aprobada, sin periodo y fuera de la barra. */
  estado: EstadoIndicador;
  /** Un cambio sobre la ficha aprobada, que solo se le muestra a quien administra. */
  cambioEnCurso: "borrador" | "por_aprobar" | null;
  /** El último periodo terminado (`2026-T3`); `null` sin mediciones. */
  periodo: string | null;
  /** «Tercer trimestre de 2026». */
  etiquetaPeriodo: string | null;
  resultado: string | null;
  meta: string | null;
  semaforo: Semaforo | null;
  noAplica: boolean;
  /** Los últimos seis periodos, del más antiguo al más reciente; `null` sin dato. */
  tendencia: (number | null)[];
  flecha: "sube" | "baja" | "igual" | null;
  mejora: boolean | null;
  /** «Reportado», «Por reportar», «Falta el análisis», «Vencido hace 6 días». */
  reporte: { texto: string; vencida: boolean };
};

export type ResumenDeLista = { bien: number; atencion: number; critico: number; sinDato: number; vencidos: number };

type Pendientes = { porReportar: boolean; faltaAnalisis: boolean; vencidas: number; masAntigua: { vence: Date; falta: Falta } | null };

/** Días de calendario, en la zona, entre dos instantes. */
const diasEntre = (desde: Date, hasta: Date, zona: string) =>
  Math.round((Date.parse(fechaEnZona(hasta, zona)) - Date.parse(fechaEnZona(desde, zona))) / 86_400_000);

/** Lo que dice la columna «Reporte»: lo que más urge de lo pendiente o, sin pendientes, cómo quedó el último periodo. */
function textoDeReporte(p: Pendientes | undefined, ultima: Row | undefined, ahora: Date, zona: string): FilaDeLista["reporte"] {
  if (p?.masAntigua) {
    const hace = `hace ${cuenta(diasEntre(p.masAntigua.vence, ahora, zona), "día", "días")}`;
    return { texto: p.masAntigua.falta === "analisis" ? `Análisis vencido ${hace}` : `Vencido ${hace}`, vencida: true };
  }
  if (p?.porReportar) return { texto: "Por reportar", vencida: false };
  if (p?.faltaAnalisis) return { texto: "Falta el análisis", vencida: false };
  if (!ultima) return { texto: "—", vencida: false };
  if (ultima.estado === "cerrada") return { texto: "Cerrado", vencida: false };
  if (ultima.estado === "reportada") return { texto: "Reportado", vencida: false };
  return { texto: ultima.historica === true ? "Por registrar" : "Por reportar", vencida: false };
}

/**
 * La lista de «Indicadores» (spec §12.2, maqueta 4): lo que la persona ve (`filtroIndicadores`), cada uno con su último
 * periodo terminado (resultado, meta, estado y los seis últimos valores) y lo pendiente de reportar o analizar, más la barra
 * de estados. Antes de leer abre los periodos terminados (`asegurarMediciones`). El filtro de reporte mira toda medición
 * pendiente, no solo la del último periodo: es el de los enlaces de «Mis tareas». La barra (`resumen`) cuenta las filas con
 * ficha aprobada que dejan los demás filtros, antes del de semáforo. Las mediciones de otra periodicidad no cuentan como
 * periodo vigente. Cinco lecturas además de abrir periodos, sin importar cuántos indicadores haya.
 */
export async function listarIndicadores(
  sesion: SujetoVisibilidad,
  filtro: FiltroDeLista,
  opciones?: Opciones,
): Promise<{ filas: FilaDeLista[]; resumen: ResumenDeLista }> {
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const zona = zonaHoraria();
  await asegurarMediciones({ sql, ahora });
  const administra = puede(sesion, "indicadores.administrar");
  const estados = ["activo", ...(administra ? ["borrador"] : []), ...(filtro.retirados ? ["retirado", ...(administra ? ["descartado"] : [])] : [])];
  const patron = filtro.texto ? `%${escaparLike(filtro.texto)}%` : null;
  const indicadores = await sql`
    SELECT i.id, i.codigo, i.estado, i.nivel_acceso, p.nombre AS proceso,
      va.id AS vigente_id, va.numero AS numero_vigente, va.nombre AS nombre_vigente, va.periodicidad AS periodicidad_vigente,
      va.subproceso_nombre, vu.numero AS numero_ultima, vu.estado AS estado_ultima, vu.nombre AS nombre_ultima,
      vu.periodicidad AS periodicidad_ultima
    FROM indicadores i
    JOIN procesos p ON p.id = i.proceso_id
    LEFT JOIN LATERAL (
      SELECT id, numero, nombre, periodicidad, subproceso_id, subproceso_nombre, clasificacion_id, tipo_id FROM indicador_versiones
      WHERE indicador_id = i.id AND estado = 'aprobada' ORDER BY numero DESC LIMIT 1
    ) va ON true
    LEFT JOIN LATERAL (
      SELECT numero, estado, nombre, periodicidad FROM indicador_versiones WHERE indicador_id = i.id ORDER BY numero DESC LIMIT 1
    ) vu ON ${administra}
    WHERE ${filtroIndicadores(sql, sesion)} AND i.estado IN ${sql(estados)}
      ${filtro.procesoId ? sql`AND i.proceso_id = ${filtro.procesoId}` : sql``}
      ${filtro.subprocesoId ? sql`AND va.subproceso_id = ${filtro.subprocesoId}` : sql``}
      ${filtro.clasificacionId ? sql`AND va.clasificacion_id = ${filtro.clasificacionId}` : sql``}
      ${filtro.tipoId ? sql`AND va.tipo_id = ${filtro.tipoId}` : sql``}
      ${patron ? sql`AND (unaccent(i.codigo) ILIKE unaccent(${patron}) OR unaccent(coalesce(va.nombre, vu.nombre, '')) ILIKE unaccent(${patron}))` : sql``}
      ${filtro.participo ? sql`AND ${participaEn(sql, sesion)}` : sql``}
    ORDER BY i.codigo`;

  const ids = indicadores.filter((f) => f.vigente_id !== null).map((f) => Number(f.id));
  const [versiones, recientes, pendientes] =
    ids.length === 0
      ? [new Map<number, VersionDeCalculo[]>(), [], []]
      : await Promise.all([
          versionesAprobadasDe(sql, ids),
          // Las trece más recientes de cada uno: la última, sus seis de tendencia y el mismo periodo del año anterior,
          // con margen para las de otra periodicidad, que se saltan.
          sql`SELECT x.* FROM unnest(${sql.array(ids)}::bigint[]) AS u(id) CROSS JOIN LATERAL (
              SELECT m.id, m.indicador_id, m.periodo, m.hasta, m.estado, m.historica, m.no_aplica, m.resultado_exacto, m.semaforo,
                m.meta_aplicada, m.meta_max_aplicada, m.requiere_accion,
                (SELECT json_build_object('meta', im.meta::text, 'metaMax', im.meta_max::text) FROM indicador_metas im
                  WHERE im.indicador_id = m.indicador_id AND im.periodo = m.periodo) AS programada
              FROM mediciones m WHERE m.indicador_id = u.id ORDER BY m.hasta DESC LIMIT 13
            ) x`,
          sql`SELECT ${columnasDePendiente(sql)} FROM mediciones m JOIN indicadores i ON i.id = m.indicador_id
            WHERE ${esPendiente(sql)} AND m.indicador_id IN ${sql(ids)}`,
        ]);

  const faltas = queFalta(pendientes);
  const pendientesDe = new Map<number, Pendientes>();
  for (const m of pendientes) {
    const falta = faltas.get(Number(m.id));
    if (!falta) continue;
    const id = Number(m.indicador_id);
    const acc = pendientesDe.get(id) ?? { porReportar: false, faltaAnalisis: false, vencidas: 0, masAntigua: null };
    if (falta.falta === "reporte" || falta.faltaSoporte) acc.porReportar = true;
    if (falta.falta === "analisis") acc.faltaAnalisis = true;
    const vence = new Date(m.vence_en as string);
    if (ahora.getTime() > vence.getTime()) {
      acc.vencidas += 1;
      if (!acc.masAntigua || vence.getTime() < acc.masAntigua.vence.getTime()) acc.masAntigua = { vence, falta: falta.falta };
    }
    pendientesDe.set(id, acc);
  }
  const recientesDe = agrupar(recientes, (m) => Number(m.indicador_id));

  const todas = indicadores.map((f) => {
    const id = Number(f.id);
    const conFicha = f.vigente_id !== null;
    const vs = versiones.get(id) ?? [];
    const lista = vigentes(
      [...(recientesDe.get(id) ?? [])].sort((a, b) => new Date(b.hasta as string).getTime() - new Date(a.hasta as string).getTime()),
      vs,
      zona,
    );
    const ultima = lista[0];
    const pend = pendientesDe.get(id);
    let datos: Pick<FilaDeLista, "resultado" | "meta" | "semaforo" | "noAplica" | "flecha" | "mejora"> = {
      resultado: null,
      meta: conFicha && vs[0] ? textoMeta(reglaDeTexto(vs[0].regla), vs[0].unidad) : null,
      semaforo: null,
      noAplica: false,
      flecha: null,
      mejora: null,
    };
    if (ultima) {
      const { m, v } = ultima;
      const programada = m.programada as { meta: string | null; metaMax: string | null } | null;
      const regla = reglaDeTexto(
        m.meta_aplicada !== null
          ? { ...v.regla, meta: texto(m.meta_aplicada), metaMax: texto(m.meta_max_aplicada) }
          : programada
            ? { ...v.regla, meta: programada.meta, metaMax: programada.metaMax }
            : v.regla,
      );
      const exacto = typeof m.resultado_exacto === "string" ? deTexto(m.resultado_exacto) : null;
      const c = comparacionDe(lista, regla.tendencia, v.unidad);
      datos = {
        resultado: exacto ? textoValor(exacto, v.unidad, regla) : null,
        meta: textoMeta(regla, v.unidad),
        semaforo: (m.semaforo as Semaforo | null) ?? null,
        noAplica: m.no_aplica === true,
        flecha: c?.flecha ?? null,
        mejora: c?.mejora ?? null,
      };
    }
    const fila: FilaDeLista = {
      id,
      codigo: f.codigo as string,
      nombre: (f.nombre_vigente ?? f.nombre_ultima ?? "") as string,
      proceso: f.proceso as string,
      subproceso: texto(f.subproceso_nombre),
      periodicidad: ((f.periodicidad_vigente ?? f.periodicidad_ultima) as Periodicidad | null) ?? null,
      restringido: f.nivel_acceso === "restringido",
      retirado: f.estado === "retirado",
      estado: f.estado as EstadoIndicador,
      cambioEnCurso:
        administra && conFicha && Number(f.numero_ultima) > Number(f.numero_vigente) && (f.estado_ultima === "borrador" || f.estado_ultima === "por_aprobar")
          ? (f.estado_ultima as "borrador" | "por_aprobar")
          : null,
      periodo: ultima ? (ultima.m.periodo as string) : null,
      etiquetaPeriodo: ultima ? conMayuscula(ultima.p.etiqueta) : null,
      ...datos,
      tendencia: lista
        .slice(0, 6)
        .reverse()
        .map(({ m }) => (conResultado(m) ? aNumero(deTexto(m.resultado_exacto as string)) : null)),
      reporte: textoDeReporte(pend, ultima?.m, ahora, zona),
    };
    const requiereAccion = ultima?.m.requiere_accion === true;
    return { fila, conFicha, pend, requiereAccion };
  });

  const pasaReporte = (x: (typeof todas)[number]) => {
    if (!filtro.reporte) return true;
    if (!x.conFicha) return false;
    if (filtro.reporte === "por-reportar") return x.pend?.porReportar === true;
    if (filtro.reporte === "falta-analisis") return x.pend?.faltaAnalisis === true;
    if (filtro.reporte === "vencida") return (x.pend?.vencidas ?? 0) > 0;
    return x.requiereAccion;
  };
  const filtradas = todas.filter(pasaReporte);
  const resumen: ResumenDeLista = { bien: 0, atencion: 0, critico: 0, sinDato: 0, vencidos: 0 };
  for (const x of filtradas) {
    if (!x.conFicha) continue;
    if (x.fila.semaforo === "bien") resumen.bien += 1;
    else if (x.fila.semaforo === "atencion") resumen.atencion += 1;
    else if (x.fila.semaforo === "critico") resumen.critico += 1;
    else resumen.sinDato += 1;
    resumen.vencidos += x.pend?.vencidas ?? 0;
  }
  const semaforo = filtro.semaforo;
  const pasaSemaforo = (x: (typeof todas)[number]) =>
    !semaforo || (x.conFicha && (semaforo === "sin-dato" ? x.fila.semaforo === null : x.fila.semaforo === semaforo));
  return { filas: filtradas.filter(pasaSemaforo).map((x) => x.fila), resumen };
}

export type OpcionesDeLista = {
  procesos: { id: number; nombre: string; sigla: string }[];
  subprocesos: { id: number; procesoId: number; nombre: string }[];
  clasificaciones: { id: number; nombre: string }[];
  tipos: { id: number; nombre: string }[];
  /** Los años con mediciones de lo que la persona ve, de menor a mayor. */
  anios: number[];
};

/** Lo que ofrecen los filtros de la lista y de la matriz: los catálogos activos y los años con mediciones visibles. */
export async function opcionesDeLista(sesion: SujetoVisibilidad, opciones?: { sql?: Cliente }): Promise<OpcionesDeLista> {
  const sql = opciones?.sql ?? obtenerSql();
  const [procesos, subprocesos, clasificaciones, tipos, anios] = await Promise.all([
    sql`SELECT id, nombre, sigla FROM procesos WHERE activo ORDER BY nombre`,
    sql`SELECT s.id, s.proceso_id, s.nombre FROM subprocesos s JOIN procesos p ON p.id = s.proceso_id AND p.activo
      WHERE s.activo ORDER BY s.nombre`,
    sql`SELECT id, nombre FROM clasificaciones_indicador WHERE activo ORDER BY orden, nombre`,
    sql`SELECT id, nombre FROM tipos_indicador WHERE activo ORDER BY orden, nombre`,
    sql`SELECT DISTINCT left(m.periodo, 4)::int AS anio FROM mediciones m JOIN indicadores i ON i.id = m.indicador_id
      WHERE ${filtroIndicadores(sql, sesion)} ORDER BY 1`,
  ]);
  const catalogo = (f: Row) => ({ id: Number(f.id), nombre: f.nombre as string });
  return {
    procesos: procesos.map((f) => ({ ...catalogo(f), sigla: f.sigla as string })),
    subprocesos: subprocesos.map((f) => ({ ...catalogo(f), procesoId: Number(f.proceso_id) })),
    clasificaciones: clasificaciones.map(catalogo),
    tipos: tipos.map(catalogo),
    anios: anios.map((f) => Number(f.anio)),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// La matriz del año
// ─────────────────────────────────────────────────────────────────────────────

/** Una celda de la matriz (spec §12.7): los meses que ocupa, el valor, su estado, el nombre accesible entero y su enlace. */
export type CeldaDeMatriz = {
  desdeMes: number;
  hastaMes: number;
  /** «86 %», «s. d.», «n. a.», «—» (por venir); vacío donde no se mide. */
  texto: string;
  estado: EstadoDePunto | "vacia";
  /** «marzo: 86 %, Bien». */
  nombre: string;
  /** La fila de la medición en la tabla del año, que abre toda persona que ve el indicador; `null` sin medición. */
  enlace: string | null;
};

export type FilaDeMatriz = { codigo: string; nombre: string; celdas: CeldaDeMatriz[]; anio: CeldaDeMatriz };
export type MatrizLeida = { procesos: { id: number; nombre: string; filas: FilaDeMatriz[] }[] };

function celdaDe(l: PeriodoLeido, ruta: string): CeldaDeMatriz {
  const [desdeMes, hastaMes] = mesesDe(l.periodo.clave);
  const n = nombreCorto(l.periodo.clave);
  const f = l.fila;
  const enlace = f.medicionId !== null ? `${ruta}#periodo-${l.periodo.clave}` : null;
  const celda = { desdeMes, hastaMes, enlace };
  if (f.estado === "por_venir") return { ...celda, texto: "—", estado: "futuro", nombre: `${n}: por venir`, enlace: null };
  if (f.noAplica) return { ...celda, texto: "n. a.", estado: "no-aplica", nombre: `${n}: no aplica` };
  if (f.resultado !== null) {
    return { ...celda, texto: f.resultado, estado: f.semaforo ?? "sin-meta", nombre: `${n}: ${f.resultado}, ${f.semaforo ? ETIQUETA_SEMAFORO[f.semaforo] : "sin meta"}` };
  }
  return { ...celda, texto: "s. d.", estado: "sin-dato", nombre: `${n}: sin dato` };
}

function celdaDelAnio(a: ResumenAcumulado, anio: number, ruta: string): CeldaDeMatriz {
  const valor = a.texto ? `${a.texto}, ${a.semaforo ? ETIQUETA_SEMAFORO[a.semaforo] : "sin meta"}` : "sin dato";
  return {
    desdeMes: 1,
    hastaMes: 12,
    texto: a.texto ?? "—",
    estado: a.semaforo ?? (a.texto ? "sin-meta" : "sin-dato"),
    nombre: `Año ${anio}: ${valor}${a.rotulo ? `. ${a.rotulo}` : ""}`,
    enlace: ruta,
  };
}

/**
 * La matriz del año (spec §12.7, maqueta 5): una fila por indicador visible que se mide ese año (uno activo con periodos
 * en él, o cualquiera con mediciones de ese año), agrupadas por proceso; cada periodo ocupa sus meses (`mesesDe`), lo que
 * no se mide queda en una celda vacía y la columna «Año» es el acumulado, el mismo de la página. Antes de leer abre los
 * periodos terminados. Seis lecturas además de abrir periodos, sin importar cuántos indicadores haya.
 */
export async function matrizDelAnio(
  sesion: SujetoVisibilidad,
  f: { anio: number; procesoId?: number; clasificacionId?: number },
  opciones?: Opciones,
): Promise<MatrizLeida> {
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  if (!anioValido(f.anio)) return { procesos: [] };
  await asegurarMediciones({ sql, ahora });
  const filas = await sql`
    SELECT i.id, i.codigo, i.estado, i.inicio_medicion, i.soporte_obligatorio, i.proceso_id, p.nombre AS proceso, va.nombre
    FROM indicadores i
    JOIN procesos p ON p.id = i.proceso_id
    JOIN LATERAL (
      SELECT nombre, clasificacion_id FROM indicador_versiones WHERE indicador_id = i.id AND estado = 'aprobada' ORDER BY numero DESC LIMIT 1
    ) va ON true
    WHERE ${filtroIndicadores(sql, sesion)} AND i.estado IN ('activo', 'retirado')
      ${f.procesoId ? sql`AND i.proceso_id = ${f.procesoId}` : sql``}
      ${f.clasificacionId ? sql`AND va.clasificacion_id = ${f.clasificacionId}` : sql``}
    ORDER BY p.orden, p.nombre, p.id, i.codigo`;
  if (filas.length === 0) return { procesos: [] };
  const versiones = await versionesAprobadasDe(
    sql,
    filas.map((x) => Number(x.id)),
  );
  const bases: Base[] = filas.map((x) => ({
    id: Number(x.id),
    inicio: texto(x.inicio_medicion),
    soporteObligatorio: x.soporte_obligatorio === true,
    versiones: versiones.get(Number(x.id)) ?? [],
  }));
  const leidos = await leerPeriodos(sql, bases, { desde: f.anio, hasta: f.anio }, ahora);
  const procesos: MatrizLeida["procesos"] = [];
  for (const x of filas) {
    const id = Number(x.id);
    const propios = leidos.get(id) ?? [];
    const rigen = propios.filter((l) => l.fila.deOtraPeriodicidad !== true);
    if (!propios.some((l) => l.fila.medicionId !== null) && !(x.estado === "activo" && rigen.length > 0)) continue;
    const codigo = x.codigo as string;
    const ruta = `${rutaDe(codigo)}?vista=resultados&anio=${f.anio}`;
    const celdas = repartirMeses(
      // La periodicidad que rige pisa a la que quedó de otra; entre las que rigen, la versión más nueva.
      propios.map((l) => ({ celda: celdaDe(l, ruta), prioridad: (l.fila.deOtraPeriodicidad ? 0 : 10_000) + l.version.numero })),
      (desdeMes, hastaMes): CeldaDeMatriz => ({ desdeMes, hastaMes, texto: "", estado: "vacia", nombre: `${mesesEnPalabras(desdeMes, hastaMes)}: no se mide`, enlace: null }),
    );
    const fila: FilaDeMatriz = {
      codigo,
      nombre: (x.nombre as string | null) ?? codigo,
      celdas,
      anio: celdaDelAnio(resumenAcumulado(rigen, versiones.get(id) ?? [], ahora), f.anio, ruta),
    };
    const procesoId = Number(x.proceso_id);
    const grupo = procesos.at(-1);
    if (grupo && grupo.id === procesoId) grupo.filas.push(fila);
    else procesos.push({ id: procesoId, nombre: x.proceso as string, filas: [fila] });
  }
  return { procesos };
}

// ─────────────────────────────────────────────────────────────────────────────
// Las filas de la tabla del año
// ─────────────────────────────────────────────────────────────────────────────

function filaSinMedicion(p: Periodo, version: VersionDeCalculo, regla: Regla, ahora: Date): FilaDelAnio {
  return {
    periodo: p.clave,
    etiqueta: conMayuscula(p.etiqueta),
    medicionId: null,
    estado: p.hasta.getTime() >= ahora.getTime() ? "por_venir" : "sin_dato",
    vencida: false,
    vence: null,
    historica: false,
    noAplica: false,
    motivo: null,
    valores: version.variables.map((v) => ({ letra: v.letra, nombre: v.nombre, valor: null })),
    resultado: null,
    semaforo: null,
    meta: textoMeta(regla, version.unidad),
    cumple: null,
    frase: null,
    requiereAccion: false,
    repetido: false,
    corregida: false,
    metaTardia: false,
    sinAnalisis: false,
    analisis: null,
    causa: null,
    accionPropuesta: null,
  };
}

function filaDeMedicion(
  m: Record<string, unknown>,
  p: Periodo,
  version: VersionDeCalculo,
  regla: Regla,
  valores: Readonly<Record<string, Fraccion>>,
  soporteObligatorio: boolean,
  ahora: Date,
): FilaDelAnio {
  const id = Number(m.id);
  const resultado = typeof m.resultado_exacto === "string" ? deTexto(m.resultado_exacto) : null;
  const semaforo = (m.semaforo as Semaforo | null) ?? null;
  const historica = m.historica === true;
  const noAplica = m.no_aplica === true;
  const conAnalisis = analisisCompleto(
    analisisExigido({ semaforo, repetido: m.incumplimiento_repetido === true, historica, noAplica }),
    analisisDe(m),
  );
  const datos = noAplica || resultado !== null;
  // Con los datos y el análisis, lo que deja abierta una medición es el soporte que falta: se muestra por reportar.
  const faltaSoporte = datos && conAnalisis && m.estado === "abierta" && soporteObligatorio && !historica && !noAplica;
  const vence = new Date(m.vence_en as string);
  const visible = estadoVisible(
    {
      estado: m.estado as EstadoMedicion,
      vence,
      historica,
      datosCompletos: datos && !faltaSoporte,
      faltaDatoAjeno: false,
      faltaAnalisis: datos && !conAnalisis,
    },
    ahora,
  );
  const motivo = (m.no_aplica_motivo as string | null) ?? null;
  return {
    periodo: p.clave,
    etiqueta: conMayuscula(p.etiqueta),
    medicionId: id,
    estado: visible.estado,
    vencida: visible.vencida,
    vence: diaEnPalabras(vence),
    historica,
    noAplica,
    motivo,
    valores: version.variables.map((v) => ({
      letra: v.letra,
      nombre: v.nombre,
      valor: valores[v.letra] ? numeroEs(valores[v.letra], 4, "truncar") : null,
    })),
    resultado: resultado ? textoValor(resultado, version.unidad, regla) : null,
    semaforo,
    meta: textoMeta(regla, version.unidad),
    cumple: resultado && semaforo ? semaforo === "bien" : null,
    frase: datos ? fraseDeResultado({ resultado, semaforo, noAplica, motivo }, regla, version.unidad) : null,
    requiereAccion: m.requiere_accion === true,
    repetido: m.incumplimiento_repetido === true,
    corregida: m.corregida === true,
    metaTardia: m.meta_tardia === true,
    sinAnalisis: m.sin_analisis === true,
    analisis: (m.analisis as string | null) ?? null,
    causa: (m.causa as string | null) ?? null,
    accionPropuesta: (m.accion_propuesta as string | null) ?? null,
  };
}
