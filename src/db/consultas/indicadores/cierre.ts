/**
 * El cierre del mes y la reapertura de una medición (spec 14 §8.7, §9 y §19.4; F14-DC3, F14-DC9 y F14-DC31; Tarea 12 de
 * la 14A; anexo 14C, §3.5). Todo es de quien administra, sin clave.
 *
 * - «Cerrar hasta marzo» alcanza toda medición sin cerrar cuyo periodo terminó en marzo o antes, salvo las que siguen
 *   dentro de su plazo de reporte, los históricos sin registrar (F14-DC3) y las de otra periodicidad que dejó un cambio
 *   mayor (`esDeOtraPeriodicidad`). Las cierra como están: la reportada con su resultado, la vacía como «Sin dato» y la que
 *   tiene datos sin el análisis exigido con la marca «sin análisis». También las de un indicador retirado, que siguen su
 *   curso hasta el cierre. Un histórico no tiene plazo: registrado, lo cierra el cierre que lo alcance.
 * - **Una medición cerrada tiene cerradas todas sus entradas** (anexo 14C, §3.5): las que usó su valor (`revisarFuentes`,
 *   `dependencias.ts`). No se cierra («espera») la que tiene una entrada que no está cerrada ni se cierra en este mismo
 *   cierre (un dato o un componente en plazo, o uno que a su vez espera: la espera se contagia hacia arriba, por niveles y
 *   hasta que no cambie), ni la de un indicador activo cuyo valor copiado ya no coincide con el de su fuente. La de un
 *   indicador retirado no recibe la propagación: no se le pide que coincida.
 * - **El cierre cierra los periodos de los datos** que terminaron en el mes o antes: los reportados, y los pendientes que se
 *   piden y ya vencieron, sin valor («Sin dato»); un pendiente en plazo espera, y uno que ya nadie pide (`se_pide` falso) no
 *   lo cierra nadie ni lo debe nadie.
 * - Cerrar no es un cálculo: escribe `estado`, `cierre_id` y `sin_analisis` sin pasar por `recalcularMedicion`.
 * - Un cierre no se modifica (trigger): su resumen se calcula antes de insertarlo, sobre las mediciones ya bloqueadas, y
 *   el `UPDATE … RETURNING` debe alcanzar exactamente las que cuenta.
 * - Reabrir es el único cambio que el trigger admite en una medición cerrada (quién, cuándo y por qué); después
 *   `recalcularMedicion`, el único camino de cálculo (spec §8.2), decide si queda reportada o abierta y deja el evento
 *   `reapertura` (`reabrirLaMedicion`, `reapertura.ts`). Con dependientes cerrados, la reapertura va en cascada
 *   (`reabrirEnCascada`). Se cierra otra vez con el siguiente cierre o con «Cerrar de nuevo», si sus fuentes están cerradas.
 *
 * Candados (los mismos de la reapertura en cascada, `reapertura.ts`): antes que nada el candado consultivo del cierre
 * (`serializarCierreYReapertura`, la primera sentencia de la transacción del cierre, de la cascada, de la reapertura directa y
 * de «Cerrar de nuevo» una medición o un periodo de un dato); después los periodos de los datos `FOR UPDATE`, por id; los indicadores `FOR SHARE`, por id; y las
 * mediciones `FOR UPDATE`, por indicador, periodo e id (el orden de `registrarHistoricos` dentro de un indicador): así un
 * cierre no se interbloquea con un reporte ni con un lote de históricos. Las fuentes se leen sin candado: lo que el cierre
 * revisa de ellas está bloqueado por él o cerrado, y el candado consultivo impide que una reapertura lo cambie mientras tanto
 * (sin él, el cierre podía ver cerrada una entrada que la cascada reabría a la vez y cerrar lo que la usa). Toda lectura que
 * decide va después del candado, en la misma transacción; lo que se lee antes solo elige el camino y se vuelve a leer dentro.
 */
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { enTransaccion, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { componentesVisibles, puedeVerIndicador, puedeVerSoportes, responsablesDeMedir, type SujetoVisibilidad } from "@/lib/alcance";
import { periodoDe, type Periodo } from "@/lib/indicadores-documentales/periodo";
import { analisisCompleto, analisisExigido, cumpleDeMedicion } from "@/lib/indicadores/estados";
import { mesPorOmisionDe, PATRON_MES } from "@/lib/indicadores/cierre";
import { historialDeCorreccion, type EntradaDeHistorial, type EventoDeMedicion } from "@/lib/indicadores/historial";
import { esperaUnDato } from "@/lib/indicadores/origen";
import { versionQueRigeEntre } from "@/lib/indicadores/periodos";
import { ErrorIndicador, type Semaforo, type TipoEvento } from "@/lib/indicadores/tipos";
import { ErrorPermiso, puede, type SujetoPermiso } from "@/lib/permisos";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { serializarCierreYReapertura } from "./candado-del-cierre";
import { componentesOcultos, letrasOcultasEnAlguna, nombresDeComponentes } from "./componentes";
import { asegurarPeriodosDeDatos } from "./datos-periodos";
import { dependientesDe, memoriaNueva, revisarFuentes, type FuenteQueFalta, type RevisionDeFuentes } from "./dependencias";
import { tomarFotos } from "./fotos";
import { analisisDe, asegurarMediciones, contextoDeMedicion, esDeOtraPeriodicidad, mide, NO_EXISTE, versionesAprobadas, type VersionDeCalculo } from "./mediciones";
import { sinRespuestaPorProceso } from "./observaciones";
import { propagarSinFallar } from "./propagacion";
import {
  COMO_ADMINISTRADOR,
  fuenteEnTexto,
  justificacionDe,
  LO_QUE_SE_REABRE_CAMBIO,
  OCULTA,
  reabrirEnCascada,
  reabrirLaMedicion,
} from "./reapertura";

export type { EntradaDeHistorial } from "@/lib/indicadores/historial";

type Opciones = { sql?: Cliente; ahora?: Date };

const MES_INVALIDO = "El mes no es válido";
const NO_TERMINO = "Ese mes no ha terminado";
const YA_CERRADO = "Ese mes ya está cerrado";
const SOLO_CERRADA = "Solo se reabre una medición cerrada";
const NO_REABIERTA = "Solo se cierra de nuevo una medición reabierta";
const FUENTE_ABIERTA = "Su fuente sigue abierta: ciérrela primero";
const NO_COINCIDE_AL_CERRAR = "Lo copiado de sus fuentes aún no está al día: vuelva a intentarlo en un momento";

/** Las cuentas de un proceso en el resumen (spec §9.2). */
export type CuentasDeProceso = {
  proceso: string;
  reportadas: number;
  sinDato: number;
  noAplica: number;
  sinAnalisis: number;
  observacionesSinRespuesta: number;
};

export type ResumenDeCierre = {
  mes: string;
  yaCerrado: boolean;
  aCerrar: number;
  reportadas: number;
  /**
   * Las que quedarán «Sin dato», con quién debía: quienes miden, si faltó lo propio; «Los responsables del dato «…»», si
   * faltó un dato; «El indicador …», si faltó el resultado de un componente; «El sistema», en una automática. Por proceso,
   * código y periodo.
   */
  sinDato: { codigo: string; nombre: string; proceso: string; periodo: string; quien: string[] }[];
  noAplica: number;
  sinAnalisis: number;
  observacionesSinRespuesta: number;
  /** No se cierran: siguen dentro de su plazo de reporte (F14-DC3). */
  enPlazo: number;
  /** No se cierran: históricos sin registrar (F14-DC3). */
  historicosSinRegistrar: number;
  /** Las mismas cuentas por proceso, ordenadas por su nombre; sin los procesos que quedan en cero. */
  porProceso: CuentasDeProceso[];
  /**
   * Los periodos de los datos compartidos que terminaron en el mes o antes (anexo 14C, §3.5): los que se cierran (con los que
   * se cierran sin valor) y los pendientes que siguen en plazo.
   */
  datos: { seCierran: number; sinDato: number; esperan: number };
  /** No se cierran: esperan una fuente que no está cerrada ni se cierra con este cierre, o lo copiado de ella no coincide. */
  esperanEntrada: { codigo: string; periodo: string; espera: string }[];
};

/** Lo que guarda `cierres_indicadores.resumen`: las cuentas del resumen previo, tal como quedaron al cerrar. */
type Cuentas = {
  cerradas: number;
  reportadas: number;
  sinDato: number;
  noAplica: number;
  sinAnalisis: number;
  observacionesSinRespuesta: number;
  enPlazo: number;
  historicosSinRegistrar: number;
  porProceso: CuentasDeProceso[];
};

function exigirAdministrar(sesion: SujetoPermiso): void {
  if (!puede(sesion, "indicadores.administrar")) throw new ErrorPermiso();
}

// ─────────────────────────────────────────────────────────────────────────────
// El mes
// ─────────────────────────────────────────────────────────────────────────────

/** El mes `AAAA-MM`, si ya terminó; si no, el error de negocio que corresponde. */
function mesTerminado(mes: unknown, ahora: Date): Periodo {
  const periodo = typeof mes === "string" && PATRON_MES.test(mes) ? periodoDe(mes, zonaHoraria()) : null;
  if (!periodo) throw new ErrorIndicador(MES_INVALIDO);
  if (periodo.hasta.getTime() >= ahora.getTime()) throw new ErrorIndicador(NO_TERMINO);
  return periodo;
}

/** `cierres_indicadores.mes` guarda el último día del mes cerrado. */
const ultimoDia = (periodo: Periodo) => fechaEnZona(periodo.hasta, zonaHoraria());

async function estaCerrado(sql: Cliente, periodo: Periodo): Promise<boolean> {
  return (await sql`SELECT 1 AS hay FROM cierres_indicadores WHERE mes = ${ultimoDia(periodo)}`).length > 0;
}

/** El mes que se propone cerrar (spec §9.1), según el último cerrado de la base. */
export async function mesPorOmision(opciones?: Opciones): Promise<string | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const [u] = await sql`SELECT to_char(max(mes), 'YYYY-MM') AS mes FROM cierres_indicadores`;
  return mesPorOmisionDe((u?.mes as string | null) ?? null, opciones?.ahora ?? new Date(), zonaHoraria());
}

// ─────────────────────────────────────────────────────────────────────────────
// Qué alcanza un cierre
// ─────────────────────────────────────────────────────────────────────────────

/** Cómo queda una medición alcanzada: los cuatro grupos del resumen, que se reparten todas. */
type Grupo = "reportada" | "sin_dato" | "no_aplica" | "sin_analisis";

type Alcanzada = {
  id: number;
  indicadorId: number;
  codigo: string;
  procesoId: number;
  proceso: string;
  periodo: string;
  estado: string;
  grupo: Grupo;
  /** La versión que rige su periodo: dice si la mide alguien o la calcula el sistema. */
  version: VersionDeCalculo;
  reportada: boolean;
  historica: boolean;
  /** Su indicador está activo: recibe la propagación, y lo copiado debe coincidir con su fuente. */
  activo: boolean;
};

/** Quién debía el dato de una medición automática que se cierra «Sin dato». */
const EL_SISTEMA = "El sistema";
/** Lo que espera una medición cuyo valor copiado ya no coincide con el de su fuente (la pasada aún no lo copia). */
const NO_COINCIDE = "Lo copiado de sus fuentes aún no está al día";

/** Un periodo de un dato que se cierra: con valor, o sin él (`sinDato`). */
type DatoQueSeCierra = { id: number; estado: string; sinDato: boolean };

type Clasificacion = {
  alcanzadas: Alcanzada[];
  enPlazo: number;
  historicosSinRegistrar: number;
  /** Las versiones aprobadas de cada indicador leído (la primera es la vigente). */
  versiones: Map<number, VersionDeCalculo[]>;
  /** Las que no se cierran porque esperan una fuente, con lo que esperan, por código y periodo. */
  esperan: { codigo: string; periodo: string; espera: string }[];
  datos: { cierran: DatoQueSeCierra[]; esperan: number };
  /** Las entradas y lo que les falta a las alcanzadas (`revisarFuentes`). */
  revisiones: Map<number, RevisionDeFuentes>;
};

/**
 * «No aplica»; sin resultado, «Sin dato»; con resultado y sin el análisis que se le exige (`analisisCompleto`, la regla
 * de la tabla del año), «sin análisis»; lo demás, reportada (también la que solo espera el soporte obligatorio).
 */
function grupoDe(m: Record<string, unknown>): Grupo {
  if (m.no_aplica === true) return "no_aplica";
  if (m.resultado_exacto === null || m.resultado_exacto === undefined) return "sin_dato";
  const exigido = analisisExigido({
    semaforo: (m.semaforo as Semaforo | null) ?? null,
    cumple: cumpleDeMedicion(m),
    repetido: m.incumplimiento_repetido === true,
    historica: m.historica === true,
    noAplica: false,
  });
  return analisisCompleto(exigido, analisisDe(m)) ? "reportada" : "sin_analisis";
}

/**
 * Los periodos de los datos que terminaron en `hasta` o antes y siguen sin cerrar (con `bloquear`, `FOR UPDATE` y por id: el
 * primer candado del cierre): los que se cierran (reportados, y pendientes que se piden y vencieron, sin valor) y cuántos
 * pendientes que se piden siguen en plazo. Un pendiente que ya nadie pide no se cierra ni cuenta (anexo 14C, nota 1 de la
 * Tarea 16): nadie lo debe y ninguna medición lo tiene de entrada.
 */
async function periodosDeDatosDelCierre(sql: Cliente, hasta: Date, ahora: Date, bloquear: boolean): Promise<Clasificacion["datos"]> {
  const filas = await sql`SELECT id, estado, se_pide, vence_en FROM variable_valores WHERE hasta <= ${hasta} AND estado <> 'cerrado'
    ORDER BY id ${bloquear ? sql`FOR UPDATE` : sql``}`;
  const salida: Clasificacion["datos"] = { cierran: [], esperan: 0 };
  for (const p of filas) {
    const id = Number(p.id);
    if (p.estado === "reportado") salida.cierran.push({ id, estado: "reportado", sinDato: false });
    else if (p.se_pide !== true) continue;
    else if (new Date(p.vence_en as string).getTime() >= ahora.getTime()) salida.esperan += 1;
    else salida.cierran.push({ id, estado: p.estado as string, sinDato: true });
  }
  return salida;
}

/**
 * Las mediciones sin cerrar cuyo periodo terminó en `hasta` o antes, repartidas en lo que el cierre alcanza (por grupo)
 * y lo que deja abierto, y los periodos de los datos que se cierran. Una sola regla para el resumen previo y el cierre; con
 * `bloquear`, dentro de la transacción del cierre, con los candados del encabezado. Al bloquear, solo las de los indicadores
 * ya bloqueados: una que aparezca entre las dos sentencias (un periodo que una lectura abre en medio; una reapertura no,
 * porque espera al candado consultivo) la alcanza el siguiente cierre. Las que el cierre alcanzaría pasan después por `apartarLasQueEsperan`.
 */
async function clasificar(sql: Cliente, hasta: Date, ahora: Date, bloquear: boolean): Promise<Clasificacion> {
  const zona = zonaHoraria();
  const versiones = new Map<number, VersionDeCalculo[]>();
  const datos = await periodosDeDatosDelCierre(sql, hasta, ahora, bloquear);
  const salida: Clasificacion = { alcanzadas: [], enPlazo: 0, historicosSinRegistrar: 0, versiones, esperan: [], datos, revisiones: new Map() };
  let bloqueados: number[] | null = null;
  if (bloquear) {
    bloqueados = (
      await sql`SELECT id FROM indicadores
        WHERE id IN (SELECT indicador_id FROM mediciones WHERE hasta <= ${hasta} AND estado <> 'cerrada')
        ORDER BY id FOR SHARE`
    ).map((f) => Number(f.id));
    if (bloqueados.length === 0) return salida;
  }
  const filas = await sql`SELECT m.id, m.indicador_id, m.periodo, m.desde, m.estado, m.historica, m.no_aplica, m.reportada_en, m.vence_en,
      m.resultado_exacto, m.semaforo, m.cumple, m.incumplimiento_repetido, m.analisis, m.causa, m.accion_propuesta,
      i.codigo, i.estado AS indicador_estado, p.id AS proceso_id, p.nombre AS proceso
    FROM mediciones m JOIN indicadores i ON i.id = m.indicador_id JOIN procesos p ON p.id = i.proceso_id
    WHERE m.hasta <= ${hasta} AND m.estado <> 'cerrada'
      ${bloqueados ? sql`AND m.indicador_id = ANY(${sql.array(bloqueados)}::bigint[])` : sql``}
    ORDER BY m.indicador_id, m.desde, m.id
    ${bloquear ? sql`FOR UPDATE OF m` : sql``}`;
  const candidatas: Alcanzada[] = [];
  for (const m of filas) {
    const indicadorId = Number(m.indicador_id);
    if (!versiones.has(indicadorId)) versiones.set(indicadorId, await versionesAprobadas(sql, indicadorId));
    const clave = m.periodo as string;
    // El inicio guardado del periodo: el mismo que daría `periodoDe`, sin recalcularlo en la zona.
    const version = versionQueRigeEntre(versiones.get(indicadorId)!, { desde: new Date(m.desde as string) }, zona);
    if (!version || esDeOtraPeriodicidad(clave, version)) continue;
    const historica = m.historica === true;
    if (historica && m.no_aplica !== true && m.reportada_en === null) {
      salida.historicosSinRegistrar += 1;
      continue;
    }
    if (!historica && new Date(m.vence_en as string).getTime() >= ahora.getTime()) {
      salida.enPlazo += 1;
      continue;
    }
    candidatas.push({
      id: Number(m.id),
      indicadorId,
      codigo: m.codigo as string,
      procesoId: Number(m.proceso_id),
      proceso: m.proceso as string,
      periodo: clave,
      estado: m.estado as string,
      grupo: grupoDe(m),
      version,
      reportada: m.reportada_en !== null,
      historica,
      activo: m.indicador_estado === "activo",
    });
  }
  await apartarLasQueEsperan(sql, salida, candidatas);
  return salida;
}

/**
 * De las `candidatas` (las que el cierre alcanzaría), aparta las que esperan una fuente (anexo 14C, §3.5) y deja las demás en
 * `c.alcanzadas`. Una espera si alguna de sus entradas (`revisarFuentes`) no está cerrada ni se cierra con este cierre: un
 * periodo de un dato que no está entre los que se cierran, o una medición de un componente que no es una de las que se
 * cierran; o si su indicador está activo y lo copiado ya no coincide con su fuente. La espera se contagia: la que toma a una
 * que espera, espera; se repasa por niveles hasta que nada cambie (a lo sumo tantas vueltas como niveles admite la ficha,
 * `MAXIMO_NIVELES`, más la del dato). Todo en memoria, con las filas ya bloqueadas, antes del `UPDATE` que cierra.
 */
async function apartarLasQueEsperan(sql: Cliente, c: Clasificacion, candidatas: readonly Alcanzada[]): Promise<void> {
  const revisiones = await revisarFuentes(sql, candidatas.map((a) => a.id), memoriaNueva());
  c.revisiones = revisiones;
  const datosDeEntrada = [...new Set([...revisiones.values()].flatMap((r) => r.datos))];
  const medicionesDeEntrada = [...new Set([...revisiones.values()].flatMap((r) => r.mediciones))];
  const zona = zonaHoraria();
  const etiqueta = (clave: string) => periodoDe(clave, zona)?.etiqueta ?? clave;
  const deDatos = new Map(
    datosDeEntrada.length === 0
      ? []
      : (
          await sql`SELECT vv.id, vv.estado, vv.periodo, d.nombre FROM variable_valores vv JOIN variables_compartidas d ON d.id = vv.variable_id
            WHERE vv.id IN ${sql(datosDeEntrada)}`
        ).map((f) => [Number(f.id), { cerrado: f.estado === "cerrado", texto: `El dato «${f.nombre as string}», ${etiqueta(f.periodo as string)}` }]),
  );
  const deMediciones = new Map(
    medicionesDeEntrada.length === 0
      ? []
      : (
          await sql`SELECT m.id, m.estado, m.periodo, i.codigo FROM mediciones m JOIN indicadores i ON i.id = m.indicador_id
            WHERE m.id IN ${sql(medicionesDeEntrada)}`
        ).map((f) => [Number(f.id), { cerrada: f.estado === "cerrada", texto: `El indicador ${f.codigo as string}, ${etiqueta(f.periodo as string)}` }]),
  );
  const datosQueSeCierran = new Set(c.datos.cierran.map((d) => d.id));
  const seCierran = new Set(candidatas.map((a) => a.id));
  const espera = new Map<number, string>();
  for (let cambio = true; cambio; ) {
    cambio = false;
    for (const a of candidatas) {
      if (!seCierran.has(a.id)) continue;
      const r = revisiones.get(a.id);
      if (!r) continue;
      const dato = r.datos.find((id) => !datosQueSeCierran.has(id) && deDatos.get(id)?.cerrado !== true);
      const medicion = dato === undefined ? r.mediciones.find((id) => !seCierran.has(id) && deMediciones.get(id)?.cerrada !== true) : undefined;
      const motivo =
        dato !== undefined
          ? (deDatos.get(dato)?.texto ?? NO_COINCIDE)
          : medicion !== undefined
            ? (deMediciones.get(medicion)?.texto ?? NO_COINCIDE)
            : a.activo && !r.coincide
              ? NO_COINCIDE
              : null;
      if (motivo === null) continue;
      seCierran.delete(a.id);
      espera.set(a.id, motivo);
      cambio = true;
    }
  }
  c.alcanzadas = candidatas.filter((a) => seCierran.has(a.id));
  c.esperan = candidatas
    .filter((a) => !seCierran.has(a.id))
    .map((a) => ({ codigo: a.codigo, periodo: a.periodo, espera: espera.get(a.id)! }))
    .sort((x, y) => x.codigo.localeCompare(y.codigo, "es") || x.periodo.localeCompare(y.periodo));
}

/**
 * Las cuentas del resumen, en total y por proceso. `observaciones` son las que siguen sin respuesta en mediciones cuyo
 * periodo terminó en el mes o antes, por proceso (`sinRespuestaPorProceso`); su total es la suma.
 */
function cuentas(c: Clasificacion, observaciones: { procesoId: number; proceso: string; n: number }[]): Cuentas {
  const de = (g: Grupo, procesoId?: number) =>
    c.alcanzadas.filter((a) => a.grupo === g && (procesoId === undefined || a.procesoId === procesoId)).length;
  const procesos = new Map<number, string>([
    ...c.alcanzadas.map((a) => [a.procesoId, a.proceso] as const),
    ...observaciones.map((o) => [o.procesoId, o.proceso] as const),
  ]);
  const porProceso = [...procesos]
    .map(([id, proceso]) => ({
      proceso,
      reportadas: de("reportada", id),
      sinDato: de("sin_dato", id),
      noAplica: de("no_aplica", id),
      sinAnalisis: de("sin_analisis", id),
      observacionesSinRespuesta: observaciones.find((o) => o.procesoId === id)?.n ?? 0,
    }))
    .filter((p) => p.reportadas + p.sinDato + p.noAplica + p.sinAnalisis + p.observacionesSinRespuesta > 0)
    .sort((x, y) => x.proceso.localeCompare(y.proceso, "es"));
  return {
    cerradas: c.alcanzadas.length,
    reportadas: de("reportada"),
    sinDato: de("sin_dato"),
    noAplica: de("no_aplica"),
    sinAnalisis: de("sin_analisis"),
    observacionesSinRespuesta: observaciones.reduce((n, o) => n + o.n, 0),
    enPlazo: c.enPlazo,
    historicosSinRegistrar: c.historicosSinRegistrar,
    porProceso,
  };
}

async function nombresDe(sql: Cliente, ids: number[]): Promise<string[]> {
  if (ids.length === 0) return [];
  return (await sql`SELECT nombre FROM usuarios WHERE id IN ${sql(ids)} ORDER BY nombre, id`).map((f) => f.nombre as string);
}

/**
 * Quién debía lo que falta a las alcanzadas que se cierran «Sin dato» (anexo 14C, §3.5), con la regla única de «Falta un
 * dato» (`esperaUnDato`): si la medición esperaba un valor que no digita quien la mide, el sistema (un automático) o quienes
 * debían las fuentes que faltan («Los responsables del dato «…»», «El indicador …»); si no, quienes la miden (faltó lo
 * propio). Sin fuentes que falten, también quienes la miden: un caso que no debería darse.
 */
async function quienDebia(sql: Cliente, c: Clasificacion): Promise<Map<number, string[]>> {
  const salida = new Map<number, string[]>();
  const sinDato = c.alcanzadas.filter((a) => a.grupo === "sin_dato");
  const faltan = sinDato.flatMap((a) => c.revisiones.get(a.id)?.faltan ?? []);
  const datos = faltan.flatMap((f) => (f.clase === "dato" ? [f.datoId] : []));
  const indicadores = faltan.flatMap((f) => (f.clase === "indicador" ? [f.indicadorId] : []));
  const nombreDeDato = new Map(
    datos.length === 0 ? [] : (await sql`SELECT id, nombre FROM variables_compartidas WHERE id IN ${sql([...new Set(datos)])}`).map((f) => [Number(f.id), f.nombre as string]),
  );
  const codigoDe = new Map(
    indicadores.length === 0 ? [] : (await sql`SELECT id, codigo FROM indicadores WHERE id IN ${sql([...new Set(indicadores)])}`).map((f) => [Number(f.id), f.codigo as string]),
  );
  const deLaFuente = (f: FuenteQueFalta) =>
    f.clase === "dato" ? `Los responsables del dato «${nombreDeDato.get(f.datoId) ?? "?"}»` : `El indicador ${codigoDe.get(f.indicadorId) ?? "?"}`;
  const quienesMiden = new Map<number, string[]>();
  for (const a of sinDato) {
    const lasQueFaltan = c.revisiones.get(a.id)?.faltan ?? [];
    const espera = esperaUnDato({
      origenDato: a.version.origenDato,
      mide: mide(a.version),
      noAplica: false,
      historica: a.historica,
      reportada: a.reportada,
      faltanAjenas: lasQueFaltan.length > 0,
    });
    if (espera && a.version.origenDato === "automatico") {
      salida.set(a.id, [EL_SISTEMA]);
      continue;
    }
    if (espera && lasQueFaltan.length > 0) {
      salida.set(a.id, lasQueFaltan.map(deLaFuente));
      continue;
    }
    // Por medición: un indicador que pasó a automático tiene periodos de antes, que debía quien mide.
    if (!quienesMiden.has(a.indicadorId)) quienesMiden.set(a.indicadorId, await nombresDe(sql, await responsablesDeMedir(a.indicadorId, { sql })));
    salida.set(a.id, quienesMiden.get(a.indicadorId)!);
  }
  return salida;
}

/**
 * Abre (F14-DC12) los periodos terminados de los indicadores activos que el cierre de `periodo` puede alcanzar (los que se
 * miden desde ese mes o antes), uno por uno (`indicadorIds`): el que falla se registra y el resumen o el cierre siguen; su
 * periodo lo alcanza un cierre posterior, cuando se abra. Abre también los periodos de los datos que se piden (anexo 14C,
 * §3.5: `asegurarPeriodosDeDatos`). Después toma las fotos pendientes de los automáticos (anexo 14B, §4 y §5.4), antes de
 * clasificar: una medición no se cierra «Sin dato» si su foto ya tocaba. La foto que pide un análisis y mueve su plazo (la
 * de flujo, o la de estado que llegó con su fecha límite vencida: `laFotoMueveElPlazo`) lo cuenta desde ella, así que sigue
 * en plazo y la alcanza un cierre posterior; la que cumple la meta o queda «No aplica» conserva su fecha y la cierra este
 * mismo cierre. Al final propaga lo que nadie propagó (anexo 14C, §3.3: `propagarSinFallar`), con la misma regla del plazo
 * (`laFuenteMueveElPlazo`): el cierre clasifica con lo que queda después de propagar.
 */
async function abrirPeriodosDelCierre(sql: Cliente, periodo: Periodo, ahora: Date): Promise<void> {
  const zona = zonaHoraria();
  const activos = await sql`SELECT id, inicio_medicion FROM indicadores WHERE estado = 'activo' AND inicio_medicion IS NOT NULL ORDER BY id`;
  const alcanzables = activos.filter((f) => {
    const inicio = periodoDe(f.inicio_medicion as string, zona);
    return inicio !== null && inicio.desde.getTime() <= periodo.hasta.getTime();
  });
  await asegurarMediciones({ sql, ahora, indicadorIds: alcanzables.map((f) => Number(f.id)) });
  await asegurarPeriodosDeDatos({ sql, ahora });
  try {
    await tomarFotos({ sql, ahora });
  } catch (err) {
    console.error("No se pudieron tomar las fotos de los indicadores automáticos antes del cierre:", err);
  }
  await propagarSinFallar({ sql, ahora });
}

/**
 * El resumen previo del cierre de `mes` (spec §9.2): cuántas mediciones se cerrarán y cómo, las que quedarán sin dato
 * con quién debía (`quienDebia`), las observaciones sin respuesta, los grupos que no se cierran (en plazo, históricos sin
 * registrar y las que esperan una fuente, con lo que esperan) y los periodos de los datos que se cierran. Abre antes los
 * periodos que hayan terminado (de las mediciones y de los datos), toma las fotos pendientes y propaga lo que nadie propagó
 * (F14-DC12, anexo 14B §4 y anexo 14C §3.3, `abrirPeriodosDelCierre`). No escribe nada más.
 */
export async function resumenDeCierre(sesion: SujetoPermiso, mes: string, opciones?: Opciones): Promise<ResumenDeCierre> {
  exigirAdministrar(sesion);
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const periodo = mesTerminado(mes, ahora);
  await abrirPeriodosDelCierre(sql, periodo, ahora);
  const c = await clasificar(sql, periodo.hasta, ahora, false);
  const n = cuentas(c, await sinRespuestaPorProceso(sql, { hasta: periodo.hasta }));
  const quien = await quienDebia(sql, c);
  const sinDato: ResumenDeCierre["sinDato"] = c.alcanzadas
    .filter((a) => a.grupo === "sin_dato")
    .map((a) => ({
      codigo: a.codigo,
      nombre: c.versiones.get(a.indicadorId)?.[0]?.nombre ?? a.codigo,
      proceso: a.proceso,
      periodo: a.periodo,
      quien: quien.get(a.id) ?? [],
    }));
  sinDato.sort((x, y) => x.proceso.localeCompare(y.proceso, "es") || x.codigo.localeCompare(y.codigo, "es") || x.periodo.localeCompare(y.periodo));
  return {
    mes: periodo.clave,
    yaCerrado: await estaCerrado(sql, periodo),
    aCerrar: n.cerradas,
    reportadas: n.reportadas,
    sinDato,
    noAplica: n.noAplica,
    sinAnalisis: n.sinAnalisis,
    observacionesSinRespuesta: n.observacionesSinRespuesta,
    enPlazo: n.enPlazo,
    historicosSinRegistrar: n.historicosSinRegistrar,
    porProceso: n.porProceso,
    datos: { seCierran: c.datos.cierran.length, sinDato: c.datos.cierran.filter((d) => d.sinDato).length, esperan: c.datos.esperan },
    esperanEntrada: c.esperan,
  };
}

const mesRepetido = (err: unknown) =>
  (err as { code?: string }).code === "23505" && (err as { constraint_name?: string }).constraint_name === "cierres_indicadores_mes_unique";

/**
 * Cierra `mes` (spec §9): en una transacción, la fila del cierre con las cuentas del resumen, cada medición alcanzada a
 * `cerrada` con su evento `cierre` y cada periodo de un dato que se cierra a `cerrado` (sin valor, «Sin dato», el pendiente
 * que venció), con su evento `cierre` en su historial (anexo 14C, §3.5). Rechaza un mes que no ha terminado o que ya se
 * cerró (también si otro cierre del mismo mes gana la carrera: el `23505` de su índice único).
 */
export async function cerrarMes(sesion: SesionFlujo, mes: string, opciones?: Opciones): Promise<{ cierreId: number; cerradas: number }> {
  exigirAdministrar(sesion);
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const periodo = mesTerminado(mes, ahora);
  if (await estaCerrado(sql, periodo)) throw new ErrorIndicador(YA_CERRADO);
  await abrirPeriodosDelCierre(sql, periodo, ahora);
  try {
    return await enTransaccion(sql, async (tx) => {
      await serializarCierreYReapertura(tx);
      if (await estaCerrado(tx, periodo)) throw new ErrorIndicador(YA_CERRADO);
      const c = await clasificar(tx, periodo.hasta, ahora, true);
      const resumen = cuentas(c, await sinRespuestaPorProceso(tx, { hasta: periodo.hasta }));
      const [cierre] = await tx`INSERT INTO cierres_indicadores (mes, cerrado_por, cerrado_en, resumen)
        VALUES (${ultimoDia(periodo)}, ${sesion.usuarioId}, ${ahora}, ${tx.json(resumen as never)}) RETURNING id`;
      const cierreId = Number(cierre.id);
      const ids = c.alcanzadas.map((a) => a.id);
      if (ids.length > 0) {
        const lote = () => tx`unnest(
          ${tx.array(ids)}::bigint[],
          ${tx.array(c.alcanzadas.map((a) => a.estado))}::text[],
          ${tx.array(c.alcanzadas.map((a) => a.grupo === "sin_analisis"))}::boolean[]
        ) AS x(id, estado, sin_analisis)`;
        const cerradas = await tx`UPDATE mediciones m SET estado = 'cerrada', cierre_id = ${cierreId}, sin_analisis = x.sin_analisis
          FROM ${lote()} WHERE m.id = x.id AND m.estado <> 'cerrada' RETURNING m.id`;
        if (cerradas.length !== resumen.cerradas) {
          throw new Error(`El cierre alcanzó ${cerradas.length} de las ${resumen.cerradas} mediciones del resumen: no se cerró nada`);
        }
        await tx`INSERT INTO medicion_eventos (medicion_id, tipo, usuario_id, detalle, creado_en)
          SELECT x.id, 'cierre', ${sesion.usuarioId},
            jsonb_build_object('cierreId', ${cierreId}::bigint, 'mes', ${periodo.clave}::text, 'sinAnalisis', x.sin_analisis,
              'antes', jsonb_build_object('estado', x.estado), 'despues', jsonb_build_object('estado', 'cerrada')),
            ${ahora}
          FROM ${lote()} ORDER BY x.id`;
      }
      const datos = c.datos.cierran;
      if (datos.length > 0) {
        const lote = () => tx`unnest(
          ${tx.array(datos.map((d) => d.id))}::bigint[],
          ${tx.array(datos.map((d) => d.estado))}::text[],
          ${tx.array(datos.map((d) => d.sinDato))}::boolean[]
        ) AS x(id, estado, sin_dato)`;
        const cerrados = await tx`UPDATE variable_valores vv SET estado = 'cerrado', cierre_id = ${cierreId}
          FROM ${lote()} WHERE vv.id = x.id AND vv.estado <> 'cerrado' RETURNING vv.id`;
        if (cerrados.length !== datos.length) {
          throw new Error(`El cierre alcanzó ${cerrados.length} de los ${datos.length} periodos de datos que contó: no se cerró nada`);
        }
        await tx`INSERT INTO variable_eventos (valor_id, tipo, usuario_id, detalle, creado_en)
          SELECT x.id, 'cierre', ${sesion.usuarioId},
            jsonb_build_object('cierreId', ${cierreId}::bigint, 'mes', ${periodo.clave}::text, 'sinDato', x.sin_dato,
              'antes', jsonb_build_object('estado', x.estado), 'despues', jsonb_build_object('estado', 'cerrado')),
            ${ahora}
          FROM ${lote()} ORDER BY x.id`;
      }
      await registrarAuditoria(tx, {
        usuarioId: sesion.usuarioId,
        accion: "indicadores_mes_cerrado",
        entidad: "cierre_indicadores",
        entidadId: cierreId,
        detalle: { mes: periodo.clave, ...resumen },
      });
      return { cierreId, cerradas: resumen.cerradas };
    });
  } catch (err) {
    if (mesRepetido(err)) throw new ErrorIndicador(YA_CERRADO);
    throw err;
  }
}

/** Los cierres hechos, del mes más reciente al más antiguo. Quien llama comprueba que la persona administra. */
export async function cierres(opciones?: { sql?: Cliente }): Promise<{ id: number; mes: string; cerradoPor: string; cerradoEn: Date; cerradas: number }[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`SELECT c.id, to_char(c.mes, 'YYYY-MM') AS mes, u.nombre, c.cerrado_en, c.resumen->>'cerradas' AS cerradas
    FROM cierres_indicadores c JOIN usuarios u ON u.id = c.cerrado_por
    ORDER BY c.mes DESC`;
  return filas.map((f) => ({
    id: Number(f.id),
    mes: f.mes as string,
    cerradoPor: f.nombre as string,
    cerradoEn: new Date(f.cerrado_en as string),
    cerradas: Number(f.cerradas ?? 0),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Reabrir y cerrar de nuevo
// ─────────────────────────────────────────────────────────────────────────────

function soloCerrada(m: Record<string, unknown>): void {
  if (m.estado !== "cerrada") throw new ErrorIndicador(SOLO_CERRADA);
}

const idValido = (id: number) => Number.isSafeInteger(id) && id > 0;

/**
 * Reabre una medición cerrada (spec §8.7, F14-DC31) con justificación y sin clave: queda «Corregida», vuelve a
 * `reportada` o a `abierta` y se avisa a quienes miden (`reabrirLaMedicion`, `reapertura.ts`). Un indicador retirado no se
 * reabre: nadie podría corregirlo. Si otras mediciones cerradas la usaron (es la de un componente), va en cascada
 * (`reabrirEnCascada`, anexo 14C §3.5): se reabren también. Con `vistas` (lo que listó el diálogo: la medición sola si no
 * listó dependientes; la acción lo exige) va siempre por la cascada, que lo compara con lo que reabriría y, si no es lo
 * mismo, no reabre nada. Sin `vistas` (la semilla, los tests) y sin dependientes, en su transacción, tras el candado
 * consultivo del cierre; si una aparece entre la lectura y los candados, no reabre nada (`LO_QUE_SE_REABRE_CAMBIO`).
 */
export async function reabrirMedicion(
  sesion: SesionFlujo,
  d: { medicionId: number; justificacion: string; vistas?: readonly number[] },
  opciones?: Opciones,
): Promise<void> {
  exigirAdministrar(sesion);
  const justificacion = justificacionDe(d.justificacion);
  if (!idValido(d.medicionId)) throw new ErrorIndicador(NO_EXISTE);
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  soloCerrada((await contextoDeMedicion(sql, sesion, d.medicionId, false, COMO_ADMINISTRADOR)).medicion);
  const fuente = { clase: "medicion" as const, medicionId: d.medicionId };
  if (d.vistas !== undefined || (await dependientesDe(sql, fuente)).length > 0) {
    await reabrirEnCascada(sesion, { fuente, justificacion, ...(d.vistas !== undefined ? { vistas: d.vistas } : {}) }, { sql, ahora });
    return;
  }
  await enTransaccion(sql, async (tx) => {
    await serializarCierreYReapertura(tx);
    const ctx = await contextoDeMedicion(tx, sesion, d.medicionId, true, COMO_ADMINISTRADOR);
    soloCerrada(ctx.medicion);
    if ((await dependientesDe(tx, fuente)).length > 0) throw new ErrorIndicador(LO_QUE_SE_REABRE_CAMBIO);
    await reabrirLaMedicion(tx, sesion, ctx, { justificacion, ahora });
  });
}

/**
 * «Cerrar de nuevo» (F14-DC31): la reabierta vuelve a `cerrada` con el último cierre, como esté (sin dato, sin análisis o
 * corregida), con su evento `cierre`. También la de un indicador que se retiró mientras estaba reabierta. Con la regla del
 * cierre (anexo 14C, §3.5): no si alguna de sus entradas no está cerrada (primero se cierra la fuente), ni, en un indicador
 * activo, si lo copiado no coincide con su fuente; para eso propaga antes lo de su indicador, como el cierre.
 */
export async function cerrarDeNuevo(sesion: SesionFlujo, medicionId: number, opciones?: Opciones): Promise<void> {
  exigirAdministrar(sesion);
  if (!idValido(medicionId)) throw new ErrorIndicador(NO_EXISTE);
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  // Lo que nadie propagó, fuera de la transacción (como `abrirPeriodosDelCierre`): lo que decide se lee dentro.
  const [suyo] = await sql`SELECT indicador_id FROM mediciones WHERE id = ${medicionId}`;
  if (suyo) await propagarSinFallar({ sql, ahora, indicadorIds: [Number(suyo.indicador_id)] });
  await enTransaccion(sql, async (tx) => {
    await serializarCierreYReapertura(tx);
    // Los candados a mano: `contextoDeMedicion` rechaza un indicador retirado.
    const [i] = await tx`SELECT id, codigo, estado FROM indicadores WHERE id = (SELECT indicador_id FROM mediciones WHERE id = ${medicionId}) FOR SHARE`;
    const [m] = await tx`SELECT * FROM mediciones WHERE id = ${medicionId} FOR UPDATE`;
    if (!i || !m || !(await puedeVerIndicador(Number(i.id), sesion, { sql: tx }))) throw new ErrorIndicador(NO_EXISTE);
    if (m.estado === "cerrada" || m.reabierta_en === null) throw new ErrorIndicador(NO_REABIERTA);
    const entradas = (await revisarFuentes(tx, [Number(m.id)])).get(Number(m.id));
    if (entradas && (entradas.datos.length > 0 || entradas.mediciones.length > 0)) {
      const datos = entradas.datos.length === 0 ? [] : await tx`SELECT 1 FROM variable_valores WHERE id IN ${tx(entradas.datos)} AND estado <> 'cerrado'`;
      const mediciones =
        entradas.mediciones.length === 0 ? [] : await tx`SELECT 1 FROM mediciones WHERE id IN ${tx(entradas.mediciones)} AND estado <> 'cerrada'`;
      if (datos.length > 0 || mediciones.length > 0) throw new ErrorIndicador(FUENTE_ABIERTA);
    }
    // El retirado no recibe la propagación: a él no se le pide que coincida, como en el cierre.
    if (i.estado === "activo" && entradas && !entradas.coincide) throw new ErrorIndicador(NO_COINCIDE_AL_CERRAR);
    const [c] = await tx`SELECT id, to_char(mes, 'YYYY-MM') AS mes FROM cierres_indicadores ORDER BY mes DESC LIMIT 1`;
    if (!c) throw new ErrorIndicador(NO_REABIERTA);
    const cierreId = Number(c.id);
    const sinAnalisis = grupoDe(m) === "sin_analisis";
    await tx`UPDATE mediciones SET estado = 'cerrada', cierre_id = ${cierreId}, sin_analisis = ${sinAnalisis} WHERE id = ${m.id}`;
    const detalle = { cierreId, mes: c.mes as string, deNuevo: true, sinAnalisis, antes: { estado: m.estado as string }, despues: { estado: "cerrada" } };
    await tx`INSERT INTO medicion_eventos (medicion_id, tipo, usuario_id, detalle, creado_en)
      VALUES (${m.id}, 'cierre', ${sesion.usuarioId}, ${tx.json(detalle)}, ${ahora})`;
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "medicion_cerrada_de_nuevo",
      entidad: "medicion",
      entidadId: Number(m.id),
      detalle: { codigo: i.codigo, indicadorId: Number(i.id), periodo: m.periodo, mes: c.mes, cierreId, ...(sinAnalisis ? { sinAnalisis: true } : {}) },
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// El historial de «Corregida»
// ─────────────────────────────────────────────────────────────────────────────

/**
 * El historial de las mediciones corregidas (reabiertas alguna vez) de `medicionIds`, por medición (spec §8.7 y §6.4):
 * desde la primera reapertura, para quien ve el indicador; los eventos de los soportes, solo para quien ve los soportes.
 * Las demás no salen. Una reapertura en cascada (`detalle.porFuente`, anexo 14C §3.5) dice por qué fuente fue, resuelto al
 * leer con la visibilidad de quien lee (`fuenteEnTexto`): «Por un cambio en …» con su nombre a quien la ve, y a quien no,
 * «Por un cambio en un componente» o «Por un cambio en una de sus fuentes» (un dato). De un componente que quien lee no ve
 * (§6.5, `componentesOcultos`), el antes y el después de sus letras no se pintan (las que alguna versión toma de él) y su
 * propagación se lee «El sistema actualizó un componente»; el motivo del contagio lo nombra solo a quien lo ve.
 */
export async function historialDeCorregidas(
  sesion: SujetoVisibilidad,
  indicadorId: number,
  medicionIds: readonly number[],
  opciones?: { sql?: Cliente },
): Promise<Map<number, EntradaDeHistorial[]>> {
  const sql = opciones?.sql ?? obtenerSql();
  const salida = new Map<number, EntradaDeHistorial[]>();
  if (medicionIds.length === 0 || !(await puedeVerIndicador(indicadorId, sesion, { sql }))) return salida;
  const corregidas = await sql`SELECT id, version_id FROM mediciones
    WHERE indicador_id = ${indicadorId} AND corregida AND id IN ${sql([...medicionIds])}`;
  if (corregidas.length === 0) return salida;
  const versiones = await versionesAprobadas(sql, indicadorId);
  const conSoportes = await puedeVerSoportes(indicadorId, sesion, { sql });
  const eventos = await sql`SELECT e.id, e.medicion_id, e.tipo, e.detalle, e.creado_en, u.nombre
    FROM medicion_eventos e LEFT JOIN usuarios u ON u.id = e.usuario_id
    WHERE e.medicion_id IN ${sql(corregidas.map((c) => Number(c.id)))} ${conSoportes ? sql`` : sql`AND e.tipo <> 'soporte'`}
    ORDER BY e.medicion_id, e.id`;
  const fuentes = new Map<number, string>();
  const leidas = new Map<string, Awaited<ReturnType<typeof fuenteEnTexto>>>();
  for (const e of eventos) {
    const ref = e.tipo === "reapertura" ? (e.detalle as { porFuente?: { clase?: unknown; id?: unknown } } | null)?.porFuente : undefined;
    if (!ref || (ref.clase !== "dato" && ref.clase !== "medicion") || typeof ref.id !== "number") continue;
    const clave = `${ref.clase}:${ref.id}`;
    if (!leidas.has(clave)) leidas.set(clave, await fuenteEnTexto(sql, { clase: ref.clase, id: ref.id }));
    const f = leidas.get(clave);
    fuentes.set(Number(e.id), `Por un cambio en ${f && (await f.ve(sesion)) ? f.texto : OCULTA[ref.clase]}`);
  }
  // Lo que quien lee no ve de los componentes (anexo 14C, §6.5), y el nombre de los que sí ve y dejaron un contagio.
  const ocultos = await componentesOcultos(sql, sesion, versiones);
  const contagiaron = eventos.flatMap((e) => {
    const id = (e.detalle as { componente?: unknown } | null)?.componente;
    return e.tipo === "propagacion" && typeof id === "number" && !ocultos.has(id) ? [id] : [];
  });
  const componentes = {
    ocultos,
    letras: letrasOcultasEnAlguna(versiones, ocultos),
    nombres: await nombresDeComponentes(sql, [...(await componentesVisibles(sql, sesion, contagiaron))]),
  };
  for (const c of corregidas) {
    const id = Number(c.id);
    const version = versiones.find((v) => v.id === Number(c.version_id)) ?? versiones[0];
    if (!version) continue;
    const propios: EventoDeMedicion[] = eventos
      .filter((e) => Number(e.medicion_id) === id)
      .map((e) => ({
        id: Number(e.id),
        tipo: e.tipo as TipoEvento,
        quien: (e.nombre as string | null) ?? null,
        creadoEn: new Date(e.creado_en as string),
        detalle: typeof e.detalle === "object" && e.detalle !== null ? (e.detalle as Record<string, unknown>) : {},
      }));
    const nombres = Object.fromEntries(version.variables.map((v) => [v.letra, v.nombre]));
    salida.set(id, historialDeCorreccion(propios, { unidad: version.unidad, nombres, conSoportes, fuentes, componentes }));
  }
  return salida;
}
