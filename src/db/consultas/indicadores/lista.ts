/**
 * La lista de «Indicadores» (spec 14 §12.2, maqueta 4): sus filtros desde la consulta de la página, sus filas (el último
 * periodo terminado de cada indicador visible, con su tendencia y lo pendiente) y la barra de estados, y lo que ofrecen
 * los filtros. Lee en lote; los periodos y la comparación vienen de `lectura.ts`.
 */
import type { Row } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { escaparLike } from "@/db/consultas/normograma/busqueda";
import { filtroIndicadores, participaEn, type SujetoVisibilidad } from "@/lib/alcance";
import { REPORTES_DE_LISTA, SEMAFOROS_DE_LISTA, type ReporteDeLista } from "@/lib/indicadores/filtros";
import { cumpleDeMedicion, ETIQUETA_ESTADO } from "@/lib/indicadores/estados";
import { deTexto } from "@/lib/indicadores/formula/fraccion";
import { reglaDeTexto } from "@/lib/indicadores/reporte";
import { textoMeta, textoValor } from "@/lib/indicadores/textos";
import type { EstadoIndicador, Periodicidad, Semaforo } from "@/lib/indicadores/tipos";
import { puede } from "@/lib/permisos";
import { cuenta } from "@/lib/plural";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { agrupar, aNumero, comparacionDe, conResultado, vigentes, type Opciones } from "./lectura";
import { asegurarMediciones, conMayuscula, reglaMostrada, texto, versionesAprobadasDe, type VersionDeCalculo } from "./mediciones";
import { columnasDePendiente, esPendiente, queFalta, type FaltaDePersona } from "./tareas";

/** Los valores de los filtros de estado viven en `src/lib/indicadores/filtros.ts`, con sus nombres. */
export { REPORTES_DE_LISTA, SEMAFOROS_DE_LISTA };

export type FiltroDeLista = {
  procesoId?: number;
  subprocesoId?: number;
  clasificacionId?: number;
  tipoId?: number;
  semaforo?: Semaforo | "sin-dato";
  reporte?: ReporteDeLista;
  /** Con alguna constancia de envío al ente pendiente, vencida o no (anexo 14B, §8). */
  envio?: "pendiente";
  /** Con alguna revisión por cambio de norma pendiente (anexo 14B, §9). */
  impacto?: true;
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
 * `requiere-accion`), `envio=pendiente` (anexo 14B, §8), `impacto=1` (anexo 14B, §9), `participo=1`, `texto` (o `q`,
 * hasta 100 caracteres) y `retirados=1`. Son los nombres de los enlaces de «Mis tareas» y de los avisos (Tarea 13). Lo que
 * no se entiende se ignora.
 */
export function filtroDeConsulta(q: Consulta): FiltroDeLista {
  const f: FiltroDeLista = {};
  const ids = { procesoId: idDe(q.proceso), subprocesoId: idDe(q.subproceso), clasificacionId: idDe(q.clasificacion), tipoId: idDe(q.tipo) };
  for (const [clave, valor] of Object.entries(ids)) if (valor !== undefined) f[clave as keyof typeof ids] = valor;
  const semaforo = entre(SEMAFOROS_DE_LISTA, q.semaforo);
  if (semaforo) f.semaforo = semaforo;
  const reporte = entre(REPORTES_DE_LISTA, q.reporte);
  if (reporte) f.reporte = reporte;
  if (primero(q.envio) === "pendiente") f.envio = "pendiente";
  if (marcado(q.impacto)) f.impacto = true;
  if (marcado(q.participo)) f.participo = true;
  const texto = (primero(q.texto) ?? primero(q.q))?.trim().slice(0, 100);
  if (texto) f.texto = texto;
  if (marcado(q.retirados)) f.retirados = true;
  return f;
}

/**
 * Lo contrario de `filtroDeConsulta`: los filtros como consulta de la URL (`proceso=3&semaforo=critico`), con los mismos
 * nombres. Lo usan los enlaces que llevan los filtros de la persona, como el del Excel de resultados.
 */
export function consultaDeFiltro(f: FiltroDeLista): string {
  const q = new URLSearchParams();
  const pares: [string, string | number | boolean | undefined][] = [
    ["proceso", f.procesoId],
    ["subproceso", f.subprocesoId],
    ["clasificacion", f.clasificacionId],
    ["tipo", f.tipoId],
    ["semaforo", f.semaforo],
    ["reporte", f.reporte],
    ["envio", f.envio],
    ["impacto", f.impacto ? "1" : undefined],
    ["participo", f.participo ? "1" : undefined],
    ["texto", f.texto],
    ["retirados", f.retirados ? "1" : undefined],
  ];
  for (const [clave, valor] of pares) if (valor !== undefined && valor !== false) q.set(clave, String(valor));
  return q.toString();
}

export type FilaDeLista = {
  id: number;
  codigo: string;
  nombre: string;
  proceso: string;
  subproceso: string | null;
  /** El subproceso de la versión aprobada vigente; `null` sin subproceso o sin ficha aprobada. */
  subprocesoId: number | null;
  periodicidad: Periodicidad | null;
  restringido: boolean;
  retirado: boolean;
  /** La ficha vigente la calcula el sistema (anexo 14B, §5.3): la marca «Automático». */
  automatico: boolean;
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
  /** Si el último resultado cumplió la meta (`cumpleDeFila`): Bien con `false` no alcanza la meta. */
  cumple: boolean | null;
  noAplica: boolean;
  /** Los últimos seis periodos, del más antiguo al más reciente; `null` sin dato. */
  tendencia: (number | null)[];
  flecha: "sube" | "baja" | "igual" | null;
  mejora: boolean | null;
  /** «Reportado», «Por reportar», «Falta el análisis», «Falta un dato», «Vencido hace 6 días». */
  reporte: { texto: string; vencida: boolean };
  /**
   * La constancia de envío al ente pendiente de un indicador activo con la fecha límite más antigua (anexo 14B, §8; un cambio
   * de plazo no mueve la de lo ya nacido, así que no tiene por qué ser la del periodo más antiguo): `vencido` si alguna
   * pendiente ya venció; `null` sin pendientes. Una pendiente conservada de un retirado no se persigue desde la lista (ni
   * desde las tareas ni los avisos): se termina desde la página del indicador.
   */
  envio: "pendiente" | "vencido" | null;
};

/** `noAplica` va aparte de `sinDato`: «No aplica» no es «Sin dato» (spec §8.5; Tarea 19, D-11). */
/** `bienSinAlcanzar` son los Bien que no alcanzan la meta: van también en `bien` (spec 14A §3.1). */
export type ResumenDeLista = { bien: number; bienSinAlcanzar: number; atencion: number; critico: number; sinDato: number; noAplica: number; vencidos: number };

/** `faltaDato`: una medición espera el dato que calcula el sistema (anexo 14B, §4); no cuenta como por reportar ni vencida. */
type Pendientes = {
  porReportar: boolean;
  faltaAnalisis: boolean;
  faltaDato: boolean;
  vencidas: number;
  masAntigua: { vence: Date; falta: FaltaDePersona } | null;
};

/** Días de calendario, en la zona, entre dos instantes. */
const diasEntre = (desde: Date, hasta: Date, zona: string) =>
  Math.round((Date.parse(fechaEnZona(hasta, zona)) - Date.parse(fechaEnZona(desde, zona))) / 86_400_000);

const FALTA_UN_DATO = ETIQUETA_ESTADO.falta_dato;

/**
 * Lo que dice la columna «Reporte»: lo que más urge de lo pendiente o, sin pendientes, cómo quedó el último periodo
 * (`ultima`, con la versión que lo rige: uno abierto de un automático espera su dato, no a quien lo reporte).
 */
function textoDeReporte(
  p: Pendientes | undefined,
  ultima: { m: Row; v: VersionDeCalculo } | undefined,
  ahora: Date,
  zona: string,
): FilaDeLista["reporte"] {
  if (p?.masAntigua) {
    const hace = `hace ${cuenta(diasEntre(p.masAntigua.vence, ahora, zona), "día", "días")}`;
    return { texto: p.masAntigua.falta === "analisis" ? `Análisis vencido ${hace}` : `Vencido ${hace}`, vencida: true };
  }
  if (p?.porReportar) return { texto: "Por reportar", vencida: false };
  if (p?.faltaAnalisis) return { texto: "Falta el análisis", vencida: false };
  if (p?.faltaDato) return { texto: FALTA_UN_DATO, vencida: false };
  if (!ultima) return { texto: "—", vencida: false };
  const { m } = ultima;
  if (m.estado === "cerrada") return { texto: "Cerrado", vencida: false };
  if (m.estado === "reportada") return { texto: "Reportado", vencida: false };
  if (ultima.v.origenDato === "automatico" && m.reportada_en === null && m.no_aplica !== true) return { texto: FALTA_UN_DATO, vencida: false };
  return { texto: m.historica === true ? "Por registrar" : "Por reportar", vencida: false };
}

/**
 * La lista de «Indicadores» (spec §12.2, maqueta 4): lo que la persona ve (`filtroIndicadores`), cada uno con su último
 * periodo terminado (resultado, meta, estado y los seis últimos valores) y lo pendiente de reportar o analizar, más la barra
 * de estados. Antes de leer las mediciones abre los periodos terminados de los indicadores activos que lee (`asegurarMediciones`). El filtro de reporte mira toda medición
 * pendiente, no solo la del último periodo: es el de los enlaces de «Mis tareas». La barra (`resumen`) cuenta las filas con
 * ficha aprobada que dejan los demás filtros, antes del de semáforo. Las mediciones de otra periodicidad no cuentan como
 * periodo vigente. La marca y el filtro de envío al ente (anexo 14B, §8) salen de la lectura de los indicadores. Cinco
 * lecturas además de abrir periodos, sin importar cuántos indicadores haya.
 */
export async function listarIndicadores(
  sesion: SujetoVisibilidad,
  filtro: FiltroDeLista,
  opciones?: Opciones,
): Promise<{ filas: FilaDeLista[]; resumen: ResumenDeLista }> {
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const zona = zonaHoraria();
  const administra = puede(sesion, "indicadores.administrar");
  const estados = ["activo", ...(administra ? ["borrador"] : []), ...(filtro.retirados ? ["retirado", ...(administra ? ["descartado"] : [])] : [])];
  const patron = filtro.texto ? `%${escaparLike(filtro.texto)}%` : null;
  const indicadores = await sql`
    SELECT i.id, i.codigo, i.estado, i.nivel_acceso, p.nombre AS proceso,
      va.id AS vigente_id, va.numero AS numero_vigente, va.nombre AS nombre_vigente, va.periodicidad AS periodicidad_vigente,
      va.subproceso_id, va.subproceso_nombre, vu.numero AS numero_ultima, vu.estado AS estado_ultima, vu.nombre AS nombre_ultima,
      vu.periodicidad AS periodicidad_ultima, env.vence_en AS envio_vence
    FROM indicadores i
    JOIN procesos p ON p.id = i.proceso_id
    LEFT JOIN LATERAL (
      SELECT id, numero, nombre, periodicidad, subproceso_id, subproceso_nombre, clasificacion_id, tipo_id FROM indicador_versiones
      WHERE indicador_id = i.id AND estado = 'aprobada' ORDER BY numero DESC LIMIT 1
    ) va ON true
    LEFT JOIN LATERAL (
      SELECT numero, estado, nombre, periodicidad FROM indicador_versiones WHERE indicador_id = i.id ORDER BY numero DESC LIMIT 1
    ) vu ON ${administra}
    LEFT JOIN LATERAL (
      SELECT vence_en FROM reportes_externos WHERE indicador_id = i.id AND estado = 'pendiente' ORDER BY vence_en, hasta, id LIMIT 1
    ) env ON i.estado = 'activo'
    WHERE ${filtroIndicadores(sql, sesion)} AND i.estado IN ${sql(estados)}
      ${filtro.envio ? sql`AND env.vence_en IS NOT NULL` : sql``}
      ${filtro.impacto ? sql`AND EXISTS (SELECT 1 FROM impactos_indicadores ii WHERE ii.indicador_id = i.id AND ii.estado = 'pendiente')` : sql``}
      ${filtro.procesoId ? sql`AND i.proceso_id = ${filtro.procesoId}` : sql``}
      ${filtro.subprocesoId ? sql`AND va.subproceso_id = ${filtro.subprocesoId}` : sql``}
      ${filtro.clasificacionId ? sql`AND va.clasificacion_id = ${filtro.clasificacionId}` : sql``}
      ${filtro.tipoId ? sql`AND va.tipo_id = ${filtro.tipoId}` : sql``}
      ${patron ? sql`AND (unaccent(i.codigo) ILIKE unaccent(${patron}) OR unaccent(coalesce(va.nombre, vu.nombre, '')) ILIKE unaccent(${patron}))` : sql``}
      ${filtro.participo ? sql`AND ${participaEn(sql, sesion)}` : sql``}
    ORDER BY i.codigo`;

  const ids = indicadores.filter((f) => f.vigente_id !== null).map((f) => Number(f.id));
  // Abre los periodos terminados solo de los activos que va a leer; sin indicadores no abre nada.
  await asegurarMediciones({ sql, ahora, indicadorIds: indicadores.filter((f) => f.estado === "activo").map((f) => Number(f.id)) });
  const [versiones, recientes, pendientes] =
    ids.length === 0
      ? [new Map<number, VersionDeCalculo[]>(), [], []]
      : await Promise.all([
          versionesAprobadasDe(sql, ids),
          // Las trece más recientes de cada uno: la última, sus seis de tendencia y el mismo periodo del año anterior,
          // con margen para las de otra periodicidad, que se saltan.
          sql`SELECT x.* FROM unnest(${sql.array(ids)}::bigint[]) AS u(id) CROSS JOIN LATERAL (
              SELECT m.id, m.indicador_id, m.periodo, m.hasta, m.estado, m.historica, m.no_aplica, m.reportada_en, m.resultado_exacto, m.semaforo, m.cumple,
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
    const acc = pendientesDe.get(id) ?? { porReportar: false, faltaAnalisis: false, faltaDato: false, vencidas: 0, masAntigua: null };
    pendientesDe.set(id, acc);
    // Lo que espera el dato del sistema no es de nadie: ni por reportar ni vencido.
    if (falta.falta === "dato") {
      acc.faltaDato = true;
      continue;
    }
    if (falta.falta === "reporte" || falta.faltaSoporte) acc.porReportar = true;
    if (falta.falta === "analisis") acc.faltaAnalisis = true;
    const vence = new Date(m.vence_en as string);
    if (ahora.getTime() > vence.getTime()) {
      acc.vencidas += 1;
      if (!acc.masAntigua || vence.getTime() < acc.masAntigua.vence.getTime()) acc.masAntigua = { vence, falta: falta.falta };
    }
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
    let datos: Pick<FilaDeLista, "resultado" | "meta" | "semaforo" | "cumple" | "noAplica" | "flecha" | "mejora"> = {
      resultado: null,
      meta: conFicha && vs[0] ? textoMeta(reglaDeTexto(vs[0].regla), vs[0].unidad) : null,
      semaforo: null,
      cumple: null,
      noAplica: false,
      flecha: null,
      mejora: null,
    };
    if (ultima) {
      const { m, v } = ultima;
      const regla = reglaMostrada(m, v);
      const exacto = typeof m.resultado_exacto === "string" ? deTexto(m.resultado_exacto) : null;
      const c = comparacionDe(lista, regla.tendencia, v.unidad);
      datos = {
        resultado: exacto ? textoValor(exacto, v.unidad, regla) : null,
        meta: textoMeta(regla, v.unidad),
        semaforo: (m.semaforo as Semaforo | null) ?? null,
        cumple: exacto && m.semaforo ? cumpleDeMedicion(m) : null,
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
      subprocesoId: f.subproceso_id === null || f.subproceso_id === undefined ? null : Number(f.subproceso_id),
      periodicidad: ((f.periodicidad_vigente ?? f.periodicidad_ultima) as Periodicidad | null) ?? null,
      restringido: f.nivel_acceso === "restringido",
      retirado: f.estado === "retirado",
      automatico: vs[0]?.origenDato === "automatico",
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
      reporte: textoDeReporte(pend, ultima, ahora, zona),
      envio: f.envio_vence === null || f.envio_vence === undefined ? null : new Date(f.envio_vence as string).getTime() < ahora.getTime() ? "vencido" : "pendiente",
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
  const resumen: ResumenDeLista = { bien: 0, bienSinAlcanzar: 0, atencion: 0, critico: 0, sinDato: 0, noAplica: 0, vencidos: 0 };
  for (const x of filtradas) {
    if (!x.conFicha) continue;
    if (x.fila.semaforo === "bien") {
      resumen.bien += 1;
      if (x.fila.cumple === false) resumen.bienSinAlcanzar += 1;
    } else if (x.fila.semaforo === "atencion") resumen.atencion += 1;
    else if (x.fila.semaforo === "critico") resumen.critico += 1;
    else if (x.fila.noAplica) resumen.noAplica += 1;
    else resumen.sinDato += 1;
    resumen.vencidos += x.pend?.vencidas ?? 0;
  }
  const semaforo = filtro.semaforo;
  // «Sin dato» es lo que la barra cuenta como tal: sin semáforo y no «No aplica», que va aparte (D-11, ola final M6).
  const pasaSemaforo = (x: (typeof todas)[number]) =>
    !semaforo || (x.conFicha && (semaforo === "sin-dato" ? x.fila.semaforo === null && !x.fila.noAplica : x.fila.semaforo === semaforo));
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

/** Lo que la página de un proceso o de un subproceso muestra de cada indicador (spec §12.8). */
export type FilaDeProceso = Pick<
  FilaDeLista,
  "id" | "codigo" | "nombre" | "resultado" | "semaforo" | "cumple" | "noAplica" | "periodo" | "etiquetaPeriodo" | "restringido"
>;

const filaDeProceso = (f: FilaDeLista): FilaDeProceso => ({
  id: f.id,
  codigo: f.codigo,
  nombre: f.nombre,
  resultado: f.resultado,
  semaforo: f.semaforo,
  cumple: f.cumple,
  noAplica: f.noAplica,
  periodo: f.periodo,
  etiquetaPeriodo: f.etiquetaPeriodo,
  restringido: f.restringido,
});

/** Los de la lista (los que la persona ve, con su último periodo terminado), sin borradores ni descartados: no tienen ficha aprobada. */
const conFicha = (f: FilaDeLista) => f.estado === "activo";

/**
 * Los indicadores del proceso que la persona ve, los suyos y, agrupados por subproceso, los de cada subproceso (spec
 * §12.8): la misma lectura, visibilidad y último periodo que la lista. Los grupos llevan el nombre del subproceso que
 * congeló la versión vigente y van en el orden del mapa; un grupo sin indicadores visibles no existe.
 */
export async function indicadoresDeProceso(
  sesion: SujetoVisibilidad,
  procesoId: number,
  opciones?: Opciones,
): Promise<{ propios: FilaDeProceso[]; porSubproceso: { subprocesoId: number; nombre: string; filas: FilaDeProceso[] }[] }> {
  const sql = opciones?.sql ?? obtenerSql();
  const { filas } = await listarIndicadores(sesion, { procesoId }, opciones);
  const visibles = filas.filter(conFicha);
  const propios = visibles.filter((f) => f.subprocesoId === null).map(filaDeProceso);
  const conSubproceso = visibles.filter((f) => f.subprocesoId !== null);
  if (conSubproceso.length === 0) return { propios, porSubproceso: [] };
  // Una sola lectura del catálogo para el orden del mapa.
  const orden = new Map((await sql`SELECT id, orden FROM subprocesos WHERE proceso_id = ${procesoId}`).map((s) => [Number(s.id), Number(s.orden)]));
  const grupos = new Map<number, { subprocesoId: number; nombre: string; filas: FilaDeProceso[] }>();
  for (const f of conSubproceso) {
    const id = f.subprocesoId as number;
    const grupo = grupos.get(id) ?? { subprocesoId: id, nombre: f.subproceso ?? "", filas: [] };
    grupo.filas.push(filaDeProceso(f));
    grupos.set(id, grupo);
  }
  const lugar = (id: number) => orden.get(id) ?? Number.MAX_SAFE_INTEGER;
  return { propios, porSubproceso: [...grupos.values()].sort((a, b) => lugar(a.subprocesoId) - lugar(b.subprocesoId) || a.subprocesoId - b.subprocesoId) };
}

/** Los indicadores del subproceso que la persona ve (spec §12.8). */
export async function indicadoresDeSubproceso(sesion: SujetoVisibilidad, subprocesoId: number, opciones?: Opciones): Promise<FilaDeProceso[]> {
  const { filas } = await listarIndicadores(sesion, { subprocesoId }, opciones);
  return filas.filter(conFicha).map(filaDeProceso);
}

/**
 * La lectura de indicadores de una página cuyo núcleo son los documentos (7.5): si falla, se registra y devuelve `null`,
 * y la página pinta sin esa sección.
 */
export async function sinTumbarLaPagina<T>(lectura: Promise<T>): Promise<T | null> {
  try {
    return await lectura;
  } catch (error) {
    console.error("No se pudieron leer los indicadores de la página:", error);
    return null;
  }
}
