/**
 * El camino de sistema (anexo 14B, §5.5): el valor de uno de los diez cálculos automáticos para un periodo. Solo lee y
 * solo cuenta: devuelve A y B crudos, en texto con punto decimal, y quien llama (la foto) decide «no aplica» con `fotoDe`
 * y los escribe.
 *
 * Los ocho documentales llaman la consulta de la pestaña de Vigencia (`indicadoresDocumentales`) con una sesión de
 * sistema del rol Administrador del SGC: cuenta todo, también lo restringido, y la cifra de la ficha es por construcción la
 * que ese rol ve en la tarjeta. Esa sesión es privada de este archivo y nunca sirve filas a una persona. «Reportes a
 * tiempo» y «Objetivos cumplidos» (§5.2) cuentan aquí, con sus reglas puras de `src/lib/indicadores/`, todos los
 * indicadores (también los restringidos): entregan un conteo, no nombres. Qué medición se toma de cada indicador para
 * «Objetivos cumplidos» lo dice `aportesDelPeriodo` (`objetivos.ts`), que comparte con la página «Objetivos».
 */
import type { Cliente } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { indicadoresDocumentales } from "@/db/consultas/vigencia/indicadores";
import type { ResultadoIndicadores } from "@/lib/indicadores-documentales/metas";
import { periodoDe } from "@/lib/indicadores-documentales/periodo";
import { alcanceAdmitido, CALCULOS, type AlcanceDeCalculo, type ClaveDeCalculo } from "@/lib/indicadores/calculos/registro";
import { reportesATiempo, type MedicionParaPlazo } from "@/lib/indicadores/calculos/reportes-a-tiempo";
import { objetivosCumplidos } from "@/lib/indicadores/objetivos";
import { alguienMideCon } from "@/lib/indicadores/origen";
import { versionQueRigeEntre } from "@/lib/indicadores/periodos";
import { MOTIVO_COMPONENTE_NO_APLICA, type OrigenDato, type Periodicidad } from "@/lib/indicadores/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { esDeOtraPeriodicidad } from "./mediciones";
import { aportesDelPeriodo, cumplenPorObjetivo } from "./objetivos";

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
  if (p.clave === "objetivos_cumplidos") return objetivosCumplidosDelPeriodo(sql, p);

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

type VersionQueRige = { rigeDesde: string | null; periodicidad: Periodicidad | null; origenDato: OrigenDato; propias: string[] };

/**
 * «Reportes de indicadores a tiempo» (§5.2): las mediciones ordinarias con fecha límite en el periodo, de la versión que
 * rige su periodo si alguien la mide (manual y con variables propias: un indicador sin ellas queda fuera, como un
 * automático; anexo 14C §3.1, F14C-DC22) y de su periodicidad, sin las que seguían sin reportar cuando el indicador se
 * retiró antes de su fecha límite. El primer reporte es el primer evento `reporte` o `no_aplica`, no `reportada_en`: una
 * corrección puede borrarla. En un mixto es el de quien mide al entregar lo suyo, aunque el dato llegue después. Tampoco
 * cuenta la que quien mide no debía (anexo 14C, §3.1 y §6.3): sin reporte suyo, sigue «No aplica» por el contagio de un
 * componente (`MOTIVO_COMPONENTE_NO_APLICA`) y el evento que la marcó (`propagacion` con `detalle.componente`; el último, si
 * hubo varios) llegó en su fecha límite o antes. Si llegó después, la persona ya debía su reporte, y cuenta como tarde.
 *
 * La fecha límite es la **del reporte** (`limite.en`), no siempre `vence_en`: cuando un cambio ajeno deja a una medición ya
 * reportada pidiendo el análisis con la fecha pasada, la fecha se cuenta otra vez para analizar (anexo 14C, §3.4) y el evento
 * guarda la que tenía (`venceAntes`: la propagación y la racha que nace de ella). Con alguno así, vale la del primero: con
 * ella se decide en qué periodo cuenta la medición y si su reporte fue a tiempo, también en las dos excepciones de arriba.
 * La fecha que se mueve porque el reporte vuelve a quien mide (al quitarse un contagio que llegó a tiempo) no deja
 * `venceAntes`: esa sí es la de su reporte.
 */
async function reportesDelPeriodo(sql: Cliente, p: PeticionDeCalculo): Promise<ValoresDeCalculo> {
  const delProceso = p.alcance === "proceso" ? sql`i.proceso_id = ${p.procesoId}` : sql`true`;
  const filas = await sql`SELECT m.periodo, limite.en AS vence_en, primero.en AS primer_reporte_en,
      (SELECT coalesce(json_agg(json_build_object('rigeDesde', v.rige_desde, 'periodicidad', v.periodicidad, 'origenDato', v.origen_dato,
            'propias', (SELECT coalesce(json_agg(vp.letra), '[]'::json) FROM indicador_variables vp WHERE vp.version_id = v.id AND vp.origen = 'propia'))
          ORDER BY v.numero DESC), '[]'::json)
        FROM indicador_versiones v WHERE v.indicador_id = m.indicador_id AND v.estado = 'aprobada') AS versiones
    FROM mediciones m
    JOIN indicadores i ON i.id = m.indicador_id
    CROSS JOIN LATERAL (SELECT min(e.creado_en) AS en FROM medicion_eventos e
      WHERE e.medicion_id = m.id AND e.tipo IN ('reporte', 'no_aplica')) primero
    CROSS JOIN LATERAL (SELECT coalesce((SELECT (a.detalle ->> 'venceAntes')::timestamptz FROM medicion_eventos a
        WHERE a.medicion_id = m.id AND a.detalle ? 'venceAntes' ORDER BY a.id LIMIT 1), m.vence_en) AS en) limite
    WHERE limite.en >= ${p.periodo.desde} AND limite.en <= ${p.periodo.hasta} AND NOT m.historica AND ${delProceso}
      AND NOT (i.estado = 'retirado' AND i.baja_en < limite.en AND (primero.en IS NULL OR primero.en > i.baja_en))
      AND NOT (primero.en IS NULL AND m.no_aplica AND m.no_aplica_motivo = ${MOTIVO_COMPONENTE_NO_APLICA}
        AND coalesce((SELECT max(c.creado_en) FROM medicion_eventos c
          WHERE c.medicion_id = m.id AND c.tipo = 'propagacion' AND c.detalle ? 'componente'), 'infinity'::timestamptz) <= limite.en)`;
  const zona = zonaHoraria();
  const medidas: MedicionParaPlazo[] = filas.flatMap((f) => {
    const clave = f.periodo as string;
    const periodo = periodoDe(clave, zona);
    const version = periodo ? versionQueRigeEntre(f.versiones as VersionQueRige[], periodo, zona) : null;
    const mide = version && alguienMideCon(version.origenDato, version.propias);
    if (!version || esDeOtraPeriodicidad(clave, version) || !mide) return [];
    return [{ venceEn: new Date(f.vence_en as Date), primerReporteEn: f.primer_reporte_en === null ? null : new Date(f.primer_reporte_en as Date) }];
  });
  const { aTiempo, total } = reportesATiempo(medidas);
  return { A: String(aTiempo), B: String(total) };
}

/**
 * «Objetivos cumplidos» (§5.2): de cada objetivo activo de la clase del alcance, la medición que se toma de cada uno de sus
 * indicadores que cuentan en el periodo (`aportesDelPeriodo` y `cumplenPorObjetivo`, la misma regla de la página
 * «Objetivos», que deja fuera las fichas que también calculan «Objetivos cumplidos»). Tampoco cuenta la ficha que pide el
 * cálculo.
 */
async function objetivosCumplidosDelPeriodo(sql: Cliente, p: PeticionDeCalculo): Promise<ValoresDeCalculo> {
  const deLaClase = p.alcance === "todos" ? sql`true` : sql`o.clase = ${p.alcance}`;
  const aportes = await aportesDelPeriodo(sql, p.periodo, sql`${deLaClase} AND i.id <> ${p.indicadorId}`);
  const { cumplidos, conMedicion } = objetivosCumplidos([...cumplenPorObjetivo(aportes).values()]);
  return { A: String(cumplidos), B: String(conMedicion) };
}
