/**
 * El camino de sistema (anexo 14B, §5.5): el valor de uno de los diez cálculos automáticos para un periodo. Solo lee y
 * solo cuenta: devuelve A y B crudos, en texto con punto decimal, y quien llama (la foto) decide «no aplica» con `fotoDe`
 * y los escribe.
 *
 * Los ocho documentales llaman la consulta de la pestaña de Vigencia (`indicadoresDocumentales`) con una sesión de
 * sistema del rol Administrador del SGC: cuenta todo, también lo restringido, y la cifra de la ficha es por construcción la
 * que ese rol ve en la tarjeta. Esa sesión es privada de este archivo y nunca sirve filas a una persona. «Reportes a
 * tiempo» y «Objetivos cumplidos» (§5.2) cuentan aquí, con sus reglas puras de `src/lib/indicadores/`, todos los
 * indicadores (también los restringidos): entregan un conteo, no nombres.
 */
import type { Cliente } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { indicadoresDocumentales } from "@/db/consultas/vigencia/indicadores";
import type { ResultadoIndicadores } from "@/lib/indicadores-documentales/metas";
import { periodoDe } from "@/lib/indicadores-documentales/periodo";
import { alcanceAdmitido, CALCULOS, type AlcanceDeCalculo, type ClaveDeCalculo } from "@/lib/indicadores/calculos/registro";
import { reportesATiempo, type MedicionParaPlazo } from "@/lib/indicadores/calculos/reportes-a-tiempo";
import { cumpleDeFila } from "@/lib/indicadores/estados";
import { objetivosCumplidos } from "@/lib/indicadores/objetivos";
import { versionQueRigeEntre } from "@/lib/indicadores/periodos";
import type { OrigenDato, Periodicidad, Semaforo } from "@/lib/indicadores/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { esDeOtraPeriodicidad } from "./mediciones";

export type PeticionDeCalculo = {
  clave: ClaveDeCalculo;
  alcance: AlcanceDeCalculo;
  /** El proceso de la ficha: con alcance «proceso», el que se cuenta (F14B-DC13). */
  procesoId: number;
  /** La ficha que pide el cálculo: «Objetivos cumplidos» no la cuenta. */
  indicadorId: number;
  /** El de `periodoDe`: `hasta` es su último instante. */
  periodo: { clave: string; desde: Date; hasta: Date };
  /** La hora de la foto: los documentales de estado se miden a ella, como la tarjeta. */
  ahora: Date;
};

export type ValoresDeCalculo = { A: string; B?: string };

/** Quien toma los documentales: cuenta como el Administrador del SGC. No se exporta. */
const SESION_DEL_SISTEMA: SesionFlujo = Object.freeze({
  sesionId: "sistema",
  usuarioId: 0,
  usuario: "sistema",
  nombre: "El sistema",
  rol: "admin_sgc",
  verHistorial: true,
});

/**
 * Los valores crudos del cálculo `p.clave` en el periodo, con el alcance de la ficha. `memo` guarda, dentro de una pasada,
 * el resultado de la Vigencia por periodo y proceso: las fichas documentales de un mismo periodo hacen una sola consulta.
 */
export async function tomarCalculo(sql: Cliente, p: PeticionDeCalculo, memo?: Map<string, ResultadoIndicadores>): Promise<ValoresDeCalculo> {
  const def = CALCULOS[p.clave];
  if (!def || !alcanceAdmitido(def, p.alcance)) throw new Error(`El cálculo «${p.clave}» no admite el alcance «${p.alcance}»`);
  if (p.clave === "reportes_a_tiempo") return reportesDelPeriodo(sql, p);
  if (p.clave === "objetivos_cumplidos") return objetivosDelPeriodo(sql, p);

  const r = await deLaVigencia(sql, p, memo);
  if (p.clave === "conformidad_periodo") {
    return { A: String(r.conformidadDelPeriodo.numerador), B: String(r.conformidadDelPeriodo.denominador) };
  }
  const medido = r.indicadores.find((i) => i.clave === def.documental);
  if (!medido) throw new Error(`La Vigencia no trae la tarjeta del cálculo «${p.clave}»`);
  // De un conteo (vencidos), su valor; de los demás, el numerador y el denominador: el valor de la conformidad es la cifra
  // truncada de la 13B, no la razón.
  if (def.forma === "conteo") return { A: String(medido.valor ?? medido.numerador) };
  return { A: String(medido.numerador), B: String(medido.denominador) };
}

/** El resultado de la pestaña de Vigencia para el periodo, de toda la entidad o, con alcance «proceso», del de la ficha. */
async function deLaVigencia(sql: Cliente, p: PeticionDeCalculo, memo?: Map<string, ResultadoIndicadores>): Promise<ResultadoIndicadores> {
  const procesoId = p.alcance === "proceso" ? p.procesoId : undefined;
  const llave = `${p.periodo.clave}|${procesoId ?? ""}`;
  const guardado = memo?.get(llave);
  if (guardado) return guardado;
  const r = await indicadoresDocumentales(SESION_DEL_SISTEMA, { periodo: p.periodo.clave, procesoId }, { sql, ahora: p.ahora });
  // La consulta toma el periodo actual si no entiende la clave: una cifra de otro periodo no llega a una foto.
  if (!r || r.periodo.clave !== p.periodo.clave) throw new Error(`La Vigencia no dio el periodo «${p.periodo.clave}»`);
  memo?.set(llave, r);
  return r;
}

type VersionQueRige = { rigeDesde: string | null; periodicidad: Periodicidad | null; origenDato: OrigenDato };

/**
 * «Reportes de indicadores a tiempo» (§5.2): las mediciones ordinarias con fecha límite en el periodo, de la versión que
 * rige su periodo si es manual y de su periodicidad, sin las que seguían sin reportar cuando el indicador se retiró antes
 * de su fecha límite. El primer reporte es el primer evento `reporte` o `no_aplica`, no `reportada_en`: una corrección
 * puede borrarla.
 */
async function reportesDelPeriodo(sql: Cliente, p: PeticionDeCalculo): Promise<ValoresDeCalculo> {
  const delProceso = p.alcance === "proceso" ? sql`i.proceso_id = ${p.procesoId}` : sql`true`;
  const filas = await sql`SELECT m.periodo, m.vence_en, primero.en AS primer_reporte_en,
      (SELECT coalesce(json_agg(json_build_object('rigeDesde', v.rige_desde, 'periodicidad', v.periodicidad, 'origenDato', v.origen_dato)
          ORDER BY v.numero DESC), '[]'::json)
        FROM indicador_versiones v WHERE v.indicador_id = m.indicador_id AND v.estado = 'aprobada') AS versiones
    FROM mediciones m
    JOIN indicadores i ON i.id = m.indicador_id
    CROSS JOIN LATERAL (SELECT min(e.creado_en) AS en FROM medicion_eventos e
      WHERE e.medicion_id = m.id AND e.tipo IN ('reporte', 'no_aplica')) primero
    WHERE m.vence_en >= ${p.periodo.desde} AND m.vence_en <= ${p.periodo.hasta} AND NOT m.historica AND ${delProceso}
      AND NOT (i.estado = 'retirado' AND i.baja_en < m.vence_en AND (primero.en IS NULL OR primero.en > i.baja_en))`;
  const zona = zonaHoraria();
  const medidas: MedicionParaPlazo[] = filas.flatMap((f) => {
    const clave = f.periodo as string;
    const periodo = periodoDe(clave, zona);
    const version = periodo ? versionQueRigeEntre(f.versiones as VersionQueRige[], periodo, zona) : null;
    if (!version || esDeOtraPeriodicidad(clave, version) || version.origenDato !== "manual") return [];
    return [{ venceEn: new Date(f.vence_en as Date), primerReporteEn: f.primer_reporte_en === null ? null : new Date(f.primer_reporte_en as Date) }];
  });
  const { aTiempo, total } = reportesATiempo(medidas);
  return { A: String(aTiempo), B: String(total) };
}

/**
 * «Objetivos cumplidos» (§5.2): de cada indicador activo cuya ficha vigente (la aprobada de mayor número) apunta a un
 * objetivo activo de la clase del alcance, su última medición que termina en el periodo entre las que cuentan: con
 * resultado, sin «no aplica», con meta (`cumpleDeFila` no nulo: una anterior a la `0012` cuenta por su semáforo) y de la
 * periodicidad de la versión que rige su periodo (`esDeOtraPeriodicidad`: la que dejó un cambio mayor ya no se mide). No
 * cuentan la ficha que pide el cálculo ni las que también calculan «Objetivos cumplidos».
 */
async function objetivosDelPeriodo(sql: Cliente, p: PeticionDeCalculo): Promise<ValoresDeCalculo> {
  const deLaClase = p.alcance === "todos" ? sql`true` : sql`o.clase = ${p.alcance}`;
  // Las candidatas de cada indicador, de la más reciente a la más antigua: la regla de la versión que rige se aplica aquí.
  const filas = await sql`SELECT i.id AS indicador_id, va.objetivo_id, vs.versiones, m.periodo, m.cumple, m.semaforo
    FROM indicadores i
    CROSS JOIN LATERAL (SELECT v.objetivo_id FROM indicador_versiones v
      WHERE v.indicador_id = i.id AND v.estado = 'aprobada' ORDER BY v.numero DESC LIMIT 1) va
    JOIN objetivos o ON o.id = va.objetivo_id AND o.activo AND ${deLaClase}
    CROSS JOIN LATERAL (SELECT coalesce(json_agg(json_build_object('rigeDesde', v.rige_desde, 'periodicidad', v.periodicidad)
        ORDER BY v.numero DESC), '[]'::json) AS versiones
      FROM indicador_versiones v WHERE v.indicador_id = i.id AND v.estado = 'aprobada') vs
    JOIN mediciones m ON m.indicador_id = i.id AND m.hasta >= ${p.periodo.desde} AND m.hasta <= ${p.periodo.hasta}
      AND m.resultado_exacto IS NOT NULL AND NOT m.no_aplica
    WHERE i.estado = 'activo' AND i.id <> ${p.indicadorId} AND i.calculo IS DISTINCT FROM 'objetivos_cumplidos'
    ORDER BY i.id, m.hasta DESC, m.id DESC`;
  const zona = zonaHoraria();
  const tomadas = new Map<number, { objetivoId: number; cumple: boolean }>();
  for (const f of filas) {
    const indicadorId = Number(f.indicador_id);
    if (tomadas.has(indicadorId)) continue;
    const cumple = cumpleDeFila({ cumple: (f.cumple as boolean | null) ?? null, semaforo: (f.semaforo as Semaforo | null) ?? null });
    if (cumple === null) continue;
    const clave = f.periodo as string;
    const periodo = periodoDe(clave, zona);
    const version = periodo ? versionQueRigeEntre(f.versiones as Omit<VersionQueRige, "origenDato">[], periodo, zona) : null;
    if (!version || esDeOtraPeriodicidad(clave, version)) continue;
    tomadas.set(indicadorId, { objetivoId: Number(f.objetivo_id), cumple });
  }
  const porObjetivo = new Map<number, boolean[]>();
  for (const { objetivoId, cumple } of tomadas.values()) porObjetivo.set(objetivoId, [...(porObjetivo.get(objetivoId) ?? []), cumple]);
  const { cumplidos, conMedicion } = objetivosCumplidos([...porObjetivo.values()]);
  return { A: String(cumplidos), B: String(conMedicion) };
}
