/**
 * Las lecturas del módulo de indicadores (spec 14 §8, §11 y §12): la pantalla de reporte, la medición por reportar, los
 * periodos y la tabla del año de un indicador. Solo leen: la escritura vive en `mediciones.ts`, del que esta importa sus
 * auxiliares (nunca al revés).
 */
import { obtenerSql, type Cliente } from "@/db/cliente";
import { puedeMedir, puedeVerIndicador, type SujetoVisibilidad } from "@/lib/alcance";
import { MESES, periodoDe, type Periodo } from "@/lib/indicadores-documentales/periodo";
import { analisisCompleto, analisisExigido, estadoVisible, type EstadoVisible } from "@/lib/indicadores/estados";
import { enPalabras } from "@/lib/indicadores/formula/formas";
import { aTexto, deTexto } from "@/lib/indicadores/formula/fraccion";
import { clavesDelAnio, periodicidadDe, versionQueRigeEntre } from "@/lib/indicadores/periodos";
import { reglaDeTexto, valorEnTexto, type CalculoEnTexto, type ReglaEnTexto } from "@/lib/indicadores/reporte";
import { numeroEs, rangosEnPalabras, type Regla } from "@/lib/indicadores/semaforo";
import { fraseDeResultado, textoMeta, textoValor, type Unidad } from "@/lib/indicadores/textos";
import { ErrorIndicador, type EstadoMedicion, type Semaforo } from "@/lib/indicadores/tipos";
import { ErrorPermiso } from "@/lib/permisos";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { obtenerParametros } from "./maestros";
import {
  analisisDe,
  anteriorConResultado,
  conMayuscula,
  contarSoportes,
  contextoDeMedicion,
  esDeOtraPeriodicidad,
  reglaDelPeriodo,
  texto,
  tramos,
  valoresPorLetra,
  versionesAprobadas,
  type Contexto,
  type VersionDeCalculo,
} from "./mediciones";

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
};

/**
 * La tabla del año (spec §8.5 y §12.3): una fila por periodo de la periodicidad que rige, desde el inicio de medición,
 * con sus valores, resultado, meta, estado visible y marcas; sin soportes. Vacía para quien no ve el indicador.
 */
export async function tablaDelAnio(sesion: SujetoVisibilidad, indicadorId: number, anio: number, opciones?: Opciones): Promise<FilaDelAnio[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  if (!Number.isInteger(anio) || anio < 1900 || anio > 9999) return [];
  if (!(await puedeVerIndicador(indicadorId, sesion, { sql }))) return [];
  const [i] = await sql`SELECT inicio_medicion, soporte_obligatorio FROM indicadores WHERE id = ${indicadorId}`;
  if (!i?.inicio_medicion) return [];
  const zona = zonaHoraria();
  const versiones = await versionesAprobadas(sql, indicadorId);
  const periodos = periodosDelAnio(versiones, i.inicio_medicion as string, anio, zona);
  if (periodos.length === 0) return [];
  const mediciones = await sql`SELECT * FROM mediciones WHERE indicador_id = ${indicadorId} AND periodo IN ${sql(periodos.map((p) => p.clave))}`;
  const metas = await sql`SELECT periodo, meta, meta_max FROM indicador_metas
    WHERE indicador_id = ${indicadorId} AND periodo IN ${sql(periodos.map((p) => p.clave))}`;
  const filas: FilaDelAnio[] = [];
  for (const p of periodos) {
    const version = versionQueRigeEntre(versiones, p, zona)!;
    const m = mediciones.find((x) => x.periodo === p.clave);
    const programada = metas.find((x) => x.periodo === p.clave);
    // La meta congelada si la hay; si no, la que aplicaría hoy.
    const reglaTexto: ReglaEnTexto =
      m && m.meta_aplicada !== null
        ? { ...version.regla, meta: texto(m.meta_aplicada), metaMax: texto(m.meta_max_aplicada) }
        : programada
          ? { ...version.regla, meta: texto(programada.meta), metaMax: texto(programada.meta_max) }
          : version.regla;
    const regla = reglaDeTexto(reglaTexto);
    filas.push(m ? await filaDeMedicion(sql, m, p, version, regla, i.soporte_obligatorio === true, ahora) : filaSinMedicion(p, version, regla, ahora));
  }
  return filas;
}

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

async function filaDeMedicion(
  sql: Cliente,
  m: Record<string, unknown>,
  p: Periodo,
  version: VersionDeCalculo,
  regla: Regla,
  soporteObligatorio: boolean,
  ahora: Date,
): Promise<FilaDelAnio> {
  const id = Number(m.id);
  const valores = await valoresPorLetra(sql, id, version);
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
