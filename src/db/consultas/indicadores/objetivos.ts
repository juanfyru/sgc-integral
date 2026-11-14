/**
 * Los objetivos y lo que les aportan sus indicadores en un periodo (anexo 14B, §5.2 y §7). Aquí vive, una sola vez, la
 * regla de qué medición se toma de cada indicador (`aportesDelPeriodo`): la usan el cálculo «Objetivos cumplidos»
 * (`calculos.ts`, que cuenta todo, también lo restringido, sin la ficha que pide el cálculo) y la página «Objetivos» (los
 * indicadores que la persona ve). Solo lee.
 */
import type { PendingQuery, Row } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { filtroIndicadores, type SujetoVisibilidad } from "@/lib/alcance";
import { periodoDe, type Periodo } from "@/lib/indicadores-documentales/periodo";
import { cumpleDeFila } from "@/lib/indicadores/estados";
import { deTexto } from "@/lib/indicadores/formula/fraccion";
import { estadoDeObjetivo, type EstadoDeObjetivo } from "@/lib/indicadores/objetivos";
import { versionQueRigeEntre } from "@/lib/indicadores/periodos";
import { reglaDeTexto } from "@/lib/indicadores/reporte";
import { textoValor } from "@/lib/indicadores/textos";
import type { Semaforo } from "@/lib/indicadores/tipos";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { conMayuscula, esDeOtraPeriodicidad, texto, versionesAprobadasDe, type VersionDeCalculo } from "./mediciones";

/** La medición que se toma de un indicador en el periodo, con la versión que rige su periodo y si alcanzó la meta. */
export type MedicionTomada = { medicion: Row; periodo: Periodo; version: VersionDeCalculo; cumple: boolean };

/** Un indicador que aporta a un objetivo y su medición tomada en el periodo, o `null` si ninguna cuenta. */
export type AporteAObjetivo = {
  indicadorId: number;
  objetivoId: number;
  codigo: string;
  /** El de la ficha vigente. */
  nombre: string;
  proceso: string;
  tomada: MedicionTomada | null;
};

/**
 * De cada indicador activo cuya ficha vigente (la aprobada de mayor número) apunta a un objetivo activo y que pasa
 * `donde` (sobre `i`, el indicador, y `o`, el objetivo), su última medición que termina en el periodo entre las que
 * cuentan: con resultado, sin «no aplica», con meta (`cumpleDeFila` no nulo: una anterior a la `0012` cuenta por su
 * semáforo) y de la periodicidad de la versión que rige su periodo (`esDeOtraPeriodicidad`: la que dejó un cambio mayor ya
 * no se mide). Un indicador sin ninguna que cuente sale con `tomada` nula. En el orden de los códigos.
 */
export async function aportesDelPeriodo(
  sql: Cliente,
  periodo: { desde: Date; hasta: Date },
  donde: PendingQuery<Row[]>,
): Promise<AporteAObjetivo[]> {
  // Las candidatas de cada indicador, de la más reciente a la más antigua: la regla de la versión que rige se aplica aquí.
  const filas = await sql`SELECT i.id AS indicador_id, i.codigo, p.nombre AS proceso, va.objetivo_id, va.nombre,
      m.id AS medicion_id, m.periodo, m.cumple, m.semaforo, m.resultado_exacto, m.meta_aplicada, m.meta_max_aplicada,
      (SELECT json_build_object('meta', im.meta::text, 'metaMax', im.meta_max::text) FROM indicador_metas im
        WHERE im.indicador_id = m.indicador_id AND im.periodo = m.periodo) AS programada
    FROM indicadores i
    JOIN procesos p ON p.id = i.proceso_id
    CROSS JOIN LATERAL (SELECT v.objetivo_id, v.nombre FROM indicador_versiones v
      WHERE v.indicador_id = i.id AND v.estado = 'aprobada' ORDER BY v.numero DESC LIMIT 1) va
    JOIN objetivos o ON o.id = va.objetivo_id AND o.activo
    LEFT JOIN mediciones m ON m.indicador_id = i.id AND m.hasta >= ${periodo.desde} AND m.hasta <= ${periodo.hasta}
      AND m.resultado_exacto IS NOT NULL AND NOT m.no_aplica
    WHERE i.estado = 'activo' AND ${donde}
    ORDER BY i.codigo, i.id, m.hasta DESC, m.id DESC`;
  const versiones = await versionesAprobadasDe(sql, filas.map((f) => Number(f.indicador_id)));
  const zona = zonaHoraria();
  const aportes = new Map<number, AporteAObjetivo>();
  for (const f of filas) {
    const indicadorId = Number(f.indicador_id);
    let aporte = aportes.get(indicadorId);
    if (!aporte) {
      aporte = {
        indicadorId,
        objetivoId: Number(f.objetivo_id),
        codigo: f.codigo as string,
        nombre: (f.nombre as string | null) ?? "",
        proceso: f.proceso as string,
        tomada: null,
      };
      aportes.set(indicadorId, aporte);
    }
    if (aporte.tomada || f.medicion_id === null) continue;
    const cumple = cumpleDeFila({ cumple: (f.cumple as boolean | null) ?? null, semaforo: (f.semaforo as Semaforo | null) ?? null });
    if (cumple === null) continue;
    const clave = f.periodo as string;
    const p = periodoDe(clave, zona);
    const version = p ? versionQueRigeEntre(versiones.get(indicadorId) ?? [], p, zona) : null;
    if (!p || !version || esDeOtraPeriodicidad(clave, version)) continue;
    aporte.tomada = { medicion: f, periodo: p, version, cumple };
  }
  return [...aportes.values()];
}

/** Lo que la página muestra de cada indicador de un objetivo; sin medición tomada, periodo, resultado y estado nulos. */
export type IndicadorDeObjetivo = {
  codigo: string;
  nombre: string;
  proceso: string;
  /** «Marzo de 2026»: el periodo de la medición tomada. */
  periodo: string | null;
  /** «95 %»: nunca contradice el color. */
  resultado: string | null;
  semaforo: Semaforo | null;
  cumple: boolean | null;
};

export type ObjetivoLeido = {
  id: number;
  clase: "calidad" | "institucional";
  enunciado: string;
  estado: EstadoDeObjetivo;
  indicadores: IndicadorDeObjetivo[];
};

/**
 * El resultado como lo escribe la lista (`listarIndicadores`): con la regla del periodo (la meta congelada en la medición o,
 * si no la tiene, la programada) y la unidad de la versión que lo rige.
 */
function indicadorDeObjetivo(a: AporteAObjetivo): IndicadorDeObjetivo {
  const base = { codigo: a.codigo, nombre: a.nombre, proceso: a.proceso };
  if (!a.tomada) return { ...base, periodo: null, resultado: null, semaforo: null, cumple: null };
  const { medicion: m, periodo, version: v, cumple } = a.tomada;
  const programada = m.programada as { meta: string | null; metaMax: string | null } | null;
  const regla = reglaDeTexto(
    m.meta_aplicada !== null
      ? { ...v.regla, meta: texto(m.meta_aplicada), metaMax: texto(m.meta_max_aplicada) }
      : programada && v.regla.meta !== null
        ? { ...v.regla, meta: programada.meta, metaMax: programada.metaMax }
        : v.regla,
  );
  return {
    ...base,
    periodo: conMayuscula(periodo.etiqueta),
    resultado: textoValor(deTexto(m.resultado_exacto as string), v.unidad, regla),
    semaforo: (m.semaforo as Semaforo | null) ?? null,
    cumple,
  };
}

/**
 * Los objetivos activos de la página «Objetivos» (§7), por clase (los de calidad primero) y orden; de cada uno, los
 * indicadores activos que la persona ve (`filtroIndicadores`) cuya ficha vigente lo apunta, con la medición que se toma en
 * el periodo (`aportesDelPeriodo`, la regla del cálculo «Objetivos cumplidos»), y su estado con `estadoDeObjetivo` sobre
 * ellos. No dice si hay indicadores que la persona no ve. `periodo` es una clave que entiende `periodoDe`; la lectura no
 * depende del reloj.
 */
export async function objetivosDelPeriodo(
  sesion: SujetoVisibilidad,
  periodo: string,
  opciones?: { sql?: Cliente; ahora?: Date },
): Promise<ObjetivoLeido[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const p = periodoDe(periodo, zonaHoraria());
  if (!p) throw new Error(`El periodo «${periodo}» no es válido`);
  const [objetivos, aportes] = await Promise.all([
    sql`SELECT id, clase, enunciado FROM objetivos WHERE activo ORDER BY clase <> 'calidad', orden, id`,
    aportesDelPeriodo(sql, p, filtroIndicadores(sql, sesion)),
  ]);
  const porObjetivo = new Map<number, IndicadorDeObjetivo[]>();
  for (const a of aportes) porObjetivo.set(a.objetivoId, [...(porObjetivo.get(a.objetivoId) ?? []), indicadorDeObjetivo(a)]);
  return objetivos.map((o) => {
    const indicadores = porObjetivo.get(Number(o.id)) ?? [];
    return {
      id: Number(o.id),
      clase: o.clase as ObjetivoLeido["clase"],
      enunciado: o.enunciado as string,
      estado: estadoDeObjetivo(indicadores.map((i) => i.cumple)),
      indicadores,
    };
  });
}

/** El orden de los periodos de un año en el selector: el año, sus semestres y sus trimestres, los más recientes antes. */
const DEL_ANIO = ["", "-S2", "-S1", "-T4", "-T3", "-T2", "-T1"];

/**
 * Los periodos que ofrece la página «Objetivos» (§7): del año en curso y del anterior, el año, sus dos semestres y sus
 * cuatro trimestres, del más reciente al más antiguo, sin los que no han empezado. El primero es siempre el año en curso.
 */
export function periodosDeObjetivos(ahora: Date, zona: string): { clave: string; etiqueta: string }[] {
  const anio = Number(fechaEnZona(ahora, zona).slice(0, 4));
  return [anio, anio - 1]
    .flatMap((a) => DEL_ANIO.map((sufijo) => periodoDe(`${a}${sufijo}`, zona)!))
    .filter((p) => p.desde.getTime() <= ahora.getTime())
    .map((p) => ({ clave: p.clave, etiqueta: conMayuscula(p.etiqueta) }));
}
