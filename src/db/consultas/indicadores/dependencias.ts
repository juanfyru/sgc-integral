/**
 * Lo que usó el valor de cada medición y lo que depende de una fuente (anexo 14C, §3.5): las entradas que el cierre del mes
 * exige cerradas («una medición cerrada tiene cerradas todas sus entradas») y lo que la reapertura en cascada reabre.
 *
 * - **Las entradas** de una medición son lo que su valor usó, por la versión con que se calculó o, sin resultado, por la que
 *   rige (`versionesDeCalculo`, la regla de `"fuente"`): de cada dato compartido, sus periodos que forman el de la medición
 *   (`clavesFinas`; en un desagregado, la unión de los que usa cada categoría, `valorDeDato` con `categoriaId`); de cada
 *   componente, sus mediciones que entraron al valor o lo dejaron «No aplica» (`valorDeComponente(…).mediciones`). Cuando la
 *   fuente aún no tiene lo que se espera (`falta`), son las que se esperan: los periodos del dato que existen y las mediciones
 *   del componente dentro del periodo, sin los históricos que nadie registró (nadie los debe: no frenan el cierre) ni las de
 *   otra periodicidad. Un periodo del dato pendiente que ya nadie pide (`se_pide` falso) no es entrada de nadie. Una histórica
 *   no tiene entradas: se digita completa y la historia no se propaga (§3.6).
 * - **Lo copiado coincide con la fuente** si cada variable ajena tiene lo que hoy da su fuente (`valorDeDato`, por categoría
 *   en un desagregado, y `valorDeComponente`): la misma fracción, o nada si la fuente no tiene valor. Es la comparación de la
 *   propagación (`planear`), sin el «No aplica» ni el reporte del sistema.
 * - **Lo que depende de una fuente** (`dependientesDe`): las mediciones cerradas que la tienen entre sus entradas, y las que
 *   dependen de esas, nivel a nivel. Una que no se reabre (de un indicador retirado o de otra periodicidad) no cambia, así que
 *   lo que la toma tampoco: la cascada no sigue por ella.
 *
 * Solo lee, sin candados: el cierre y la reapertura llaman con las filas ya bloqueadas. Módulo liviano: lo importan el
 * cierre y la reapertura, así que no importa `lectura`, `fichas`, `aprobacion` ni `operacion`.
 */
import type { Row } from "postgres";
import type { Cliente } from "@/db/cliente";
import { comparar, type Fraccion } from "@/lib/indicadores/formula/fraccion";
import { esAjena } from "@/lib/indicadores/origen";
import { clavesFinas, versionQueRigeEntre } from "@/lib/indicadores/periodos";
import { MAXIMO_NIVELES, type Periodicidad } from "@/lib/indicadores/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";
import {
  celdasDeFilas,
  columnasDeValor,
  elegirValores,
  esDeOtraPeriodicidad,
  listaDe,
  versionesAprobadasDe,
  versionesDeCalculo,
  type ValorGuardado,
  type VersionDeCalculo,
} from "./mediciones";
import { valorDeComponente, valorDeDato, type ValorDeComponente, type ValorDeDato } from "./propagacion";

/** Lo que se reabre en cascada: un periodo de un dato compartido o la medición de un componente. */
export type Fuente = { clase: "dato"; periodoId: number } | { clase: "medicion"; medicionId: number };

/** Una medición cerrada que depende de una fuente (`dependientesDe`). */
export type Dependiente = {
  medicionId: number;
  indicadorId: number;
  codigo: string;
  /** El nombre de la ficha vigente del indicador. */
  nombre: string;
  /** La clave del periodo («2026-08», «2026-T3»). */
  periodo: string;
  /** 1: la usa la fuente misma; 2: usa a una de nivel 1; y así. */
  nivel: number;
  seReabre: boolean;
  porQueNo: "retirado" | "otra_periodicidad" | null;
  /** La fecha de envío de la constancia ya registrada ante el ente del periodo que la contiene, si la hay. */
  constanciaEn: Date | null;
};

/** Una fuente que no tiene lo que la medición espera de ella: un dato o un componente. */
export type FuenteQueFalta = { clase: "dato"; datoId: number } | { clase: "indicador"; indicadorId: number };

/** Lo que `revisarFuentes` sabe de una medición. */
export type RevisionDeFuentes = {
  /** Los periodos de los datos que son sus entradas. */
  datos: number[];
  /** Las mediciones de sus componentes que son sus entradas. */
  mediciones: number[];
  /** Lo copiado de cada fuente coincide con lo que la fuente da hoy (siempre, si no tiene variables ajenas). */
  coincide: boolean;
  /** Las fuentes que aún no tienen lo que la medición espera, sin repetir, en el orden de sus variables. */
  faltan: FuenteQueFalta[];
};

/**
 * Lo que ya se leyó de cada fuente dentro de una misma revisión (el cierre: su resumen o su transacción): `valorDeComponente`
 * hace varias lecturas por componente, y varias mediciones toman el mismo en el mismo periodo.
 */
export type Memoria = { componentes: Map<string, Promise<ValorDeComponente>>; datos: Map<string, Promise<ValorDeDato>> };

export const memoriaNueva = (): Memoria => ({ componentes: new Map(), datos: new Map() });

const sinFuentes = (): RevisionDeFuentes => ({ datos: [], mediciones: [], coincide: true, faltan: [] });

const claveDe = (f: FuenteQueFalta) => (f.clase === "dato" ? `dato:${f.datoId}` : `indicador:${f.indicadorId}`);

/** Dos valores copiados son el mismo: los dos nulos, o la misma fracción. */
const igual = (a: Fraccion | null, b: Fraccion | null) => (a === null || b === null ? a === b : comparar(a, b) === 0);

/**
 * La versión con que se leen las entradas de la medición `m`: la de `versionesDeCalculo` (regla de `"fuente"`); si esa no es
 * de su periodicidad (un cambio mayor dejó la medición de la periodicidad vieja), la que tiene la medición (`version_id`) si
 * sí lo es; si no, ninguna.
 */
function versionDeEntradas(versiones: readonly VersionDeCalculo[], m: Row, zona: string): VersionDeCalculo | null {
  const { version } = versionesDeCalculo(versiones, m, "fuente", zona);
  if (version && !esDeOtraPeriodicidad(m.periodo as string, version)) return version;
  const propia = versiones.find((v) => v.id === Number(m.version_id));
  return propia && !esDeOtraPeriodicidad(m.periodo as string, propia) ? propia : null;
}

/**
 * Las entradas de cada medición de `medicionIds`, lo que les falta y si lo copiado coincide con sus fuentes (ver el
 * encabezado). Lee sin candado; `memoria` evita repetir la misma fuente.
 */
export async function revisarFuentes(sql: Cliente, medicionIds: readonly number[], memoria: Memoria = memoriaNueva()): Promise<Map<number, RevisionDeFuentes>> {
  const salida = new Map<number, RevisionDeFuentes>();
  const ids = [...new Set(medicionIds)];
  if (ids.length === 0) return salida;
  const zona = zonaHoraria();
  const filas = await sql`SELECT * FROM mediciones WHERE id IN ${sql(ids)}`;
  const versiones = await versionesAprobadasDe(sql, filas.map((m) => Number(m.indicador_id)));

  const conAjenas: { m: Row; version: VersionDeCalculo }[] = [];
  for (const m of filas) {
    const version = m.historica === true ? null : versionDeEntradas(versiones.get(Number(m.indicador_id)) ?? [], m, zona);
    if (version && version.variables.some((v) => esAjena(v.origen))) conAjenas.push({ m, version });
    else salida.set(Number(m.id), sinFuentes());
  }
  if (conAjenas.length === 0) return salida;

  // Los periodos de los datos que forman cada medición, y lo que cada una tiene guardado, en dos lecturas.
  const claves = new Set<string>();
  const datoIds = new Set<number>();
  for (const { m, version } of conAjenas) {
    for (const v of version.variables) {
      if (v.origen !== "compartida" || v.datoId === null || v.datoPeriodicidad === null) continue;
      datoIds.add(v.datoId);
      for (const c of clavesFinas(m.periodo as string, v.datoPeriodicidad)) claves.add(c);
    }
  }
  const [periodosDeDatos, guardados] = await Promise.all([
    datoIds.size === 0
      ? Promise.resolve([] as Row[])
      : sql`SELECT id, variable_id, periodo FROM variable_valores
          WHERE variable_id IN ${sql([...datoIds])} AND periodo = ANY(${[...claves]}::text[]) AND NOT (estado = 'pendiente' AND NOT se_pide)`,
    sql`SELECT mv.medicion_id, mv.categoria_id, ${columnasDeValor(sql)}
      FROM medicion_valores mv JOIN indicador_variables iv ON iv.id = mv.variable_id
      WHERE mv.medicion_id IN ${sql(conAjenas.map((x) => Number(x.m.id)))} AND mv.valor IS NOT NULL`,
  ]);
  const periodosDe = (datoId: number, periodo: string, datoPeriodicidad: Periodicidad) => {
    const deEste = new Set(clavesFinas(periodo, datoPeriodicidad));
    return periodosDeDatos.filter((p) => Number(p.variable_id) === datoId && deEste.has(p.periodo as string)).map((p) => Number(p.id));
  };
  const deDato = (d: Parameters<typeof valorDeDato>[1]) => {
    const clave = `${d.datoId}|${d.periodo}|${d.categoriaId ?? ""}`;
    if (!memoria.datos.has(clave)) memoria.datos.set(clave, valorDeDato(sql, d));
    return memoria.datos.get(clave)!;
  };
  const deComponente = (d: Parameters<typeof valorDeComponente>[1]) => {
    const clave = `${d.indicadorId}|${d.toma}|${d.periodo}`;
    if (!memoria.componentes.has(clave)) memoria.componentes.set(clave, valorDeComponente(sql, d));
    return memoria.componentes.get(clave)!;
  };

  // Las mediciones de un componente que se esperan cuando aún no tiene lo que el compuesto espera de él.
  const esperadas: { indicadorId: number; desde: Date; hasta: Date; para: number }[] = [];
  const parciales = new Map<number, { datos: Set<number>; mediciones: Set<number>; coincide: boolean; faltan: FuenteQueFalta[] }>();

  for (const { m, version } of conAjenas) {
    const id = Number(m.id);
    const periodo = m.periodo as string;
    const desde = new Date(m.desde as Date);
    const hasta = new Date(m.hasta as Date);
    const deLaMedicion = guardados.filter((g) => Number(g.medicion_id) === id) as unknown as (ValorGuardado & { categoria_id: unknown })[];
    const valores = elegirValores(deLaMedicion.filter((g) => g.categoria_id === null), version);
    const lista = listaDe(m);
    const celdas = lista ? celdasDeFilas(deLaMedicion, version) : null;
    const r = { datos: new Set<number>(), mediciones: new Set<number>(), coincide: true, faltan: [] as FuenteQueFalta[] };
    const falta = (f: FuenteQueFalta) => {
      if (!r.faltan.some((x) => claveDe(x) === claveDe(f))) r.faltan.push(f);
    };
    for (const v of version.variables) {
      if (v.origen === "compartida" && v.datoId !== null && v.datoPeriodicidad !== null) {
        const existentes = periodosDe(v.datoId, periodo, v.datoPeriodicidad);
        const base = { datoId: v.datoId, consolidacion: v.consolidacion, datoPeriodicidad: v.datoPeriodicidad, periodo };
        if (lista && celdas) {
          // Por categoría (anexo 14C, §5.7): la unión de los periodos que usa cada una; si a alguna le falta, los que hay.
          for (const c of lista) {
            const x = await deDato({ ...base, categoriaId: c.id });
            for (const p of x.estado === "falta" ? existentes : x.periodos) r.datos.add(p);
            if (x.estado === "falta") falta({ clase: "dato", datoId: v.datoId });
            if (!igual(celdas.get(c.id)?.[v.letra] ?? null, x.estado === "listo" ? x.valor : null)) r.coincide = false;
          }
        } else {
          const x = await deDato(base);
          for (const p of existentes) r.datos.add(p);
          if (x.estado === "falta") falta({ clase: "dato", datoId: v.datoId });
          if (!igual(valores[v.letra] ?? null, x.estado === "listo" ? x.valor : null)) r.coincide = false;
        }
      } else if (v.origen === "indicador" && v.indicadorOrigenId !== null && v.toma !== null) {
        const x = await deComponente({ indicadorId: v.indicadorOrigenId, toma: v.toma, periodo, desde, hasta });
        if (x.estado === "falta") {
          esperadas.push({ indicadorId: v.indicadorOrigenId, desde, hasta, para: id });
          falta({ clase: "indicador", indicadorId: v.indicadorOrigenId });
        } else {
          for (const e of x.mediciones) r.mediciones.add(e);
        }
        if (!igual(valores[v.letra] ?? null, x.estado === "listo" ? x.valor : null)) r.coincide = false;
      }
    }
    parciales.set(id, r);
  }

  if (esperadas.length > 0) {
    const componentes = [...new Set(esperadas.map((e) => e.indicadorId))];
    const [deLosComponentes, versionesDeComponentes] = await Promise.all([
      sql`SELECT id, indicador_id, periodo, desde, hasta, historica, no_aplica, reportada_en FROM mediciones WHERE indicador_id IN ${sql(componentes)}`,
      versionesAprobadasDe(sql, componentes),
    ]);
    for (const e of esperadas) {
      const vs = versionesDeComponentes.get(e.indicadorId) ?? [];
      for (const c of deLosComponentes) {
        if (Number(c.indicador_id) !== e.indicadorId) continue;
        const dentro = new Date(c.desde as Date).getTime() >= e.desde.getTime() && new Date(c.hasta as Date).getTime() <= e.hasta.getTime();
        // Un histórico que nadie registró no lo debe nadie; uno de otra periodicidad ya no se mide.
        const sinRegistrar = c.historica === true && c.no_aplica !== true && c.reportada_en === null;
        const rige = versionQueRigeEntre(vs, { desde: new Date(c.desde as Date) }, zona);
        if (dentro && !sinRegistrar && rige && !esDeOtraPeriodicidad(c.periodo as string, rige)) parciales.get(e.para)!.mediciones.add(Number(c.id));
      }
    }
  }
  for (const [id, r] of parciales) {
    salida.set(id, { datos: [...r.datos].sort((a, b) => a - b), mediciones: [...r.mediciones].sort((a, b) => a - b), coincide: r.coincide, faltan: r.faltan });
  }
  return salida;
}

/**
 * Lo que el valor de cada medición usó (ver el encabezado): los periodos de los datos y las mediciones de los componentes,
 * por la versión con que se calculó o, sin resultado, por la que rige. Una medición sin fuentes ajenas, o histórica, no tiene.
 */
export async function entradasDe(sql: Cliente, medicionIds: readonly number[]): Promise<Map<number, { datos: number[]; mediciones: number[] }>> {
  const r = await revisarFuentes(sql, medicionIds);
  return new Map([...r].map(([id, x]) => [id, { datos: x.datos, mediciones: x.mediciones }]));
}

/**
 * Las mediciones cerradas que tienen a `fuente` entre sus entradas, y las que dependen de esas, hasta que no aparezca
 * ninguna (`MAXIMO_NIVELES` por encima de un indicador que toma un dato: la ficha no admite más), por nivel, código y
 * periodo. Cada una en su nivel más bajo: si la alcanzan dos caminos, cuenta el más corto. `seReabre` es falso para la de un
 * indicador retirado (anexo 14C, §3.5, la excepción que aceptó el usuario) y para la de otra periodicidad que la que hoy rige
 * su periodo (no se puede calcular); de esas no se sigue: quedan como están y lo que las toma también. Con la fecha de la
 * constancia de envío al ente ya registrada del periodo que contiene a cada una (`constanciaEn`).
 */
export async function dependientesDe(sql: Cliente, fuente: Fuente): Promise<Dependiente[]> {
  const zona = zonaHoraria();
  const salida: Dependiente[] = [];
  const vistas = new Set<number>(fuente.clase === "medicion" ? [fuente.medicionId] : []);
  let actuales: Fuente[] = [fuente];
  for (let nivel = 1; actuales.length > 0 && nivel <= MAXIMO_NIVELES + 1; nivel += 1) {
    // Las candidatas del nivel: cerradas y ordinarias, de un indicador que alguna versión aprobada suya hace tomar la fuente,
    // con un periodo que contiene el de la fuente. Después se confirma con sus entradas.
    const candidatas: { m: Row; de: Fuente }[] = [];
    for (const f of actuales) {
      const filas =
        f.clase === "dato"
          ? await sql`SELECT m.*, i.codigo, i.estado AS indicador_estado FROM mediciones m
              JOIN indicadores i ON i.id = m.indicador_id
              JOIN variable_valores p ON p.id = ${f.periodoId}
              WHERE m.estado = 'cerrada' AND NOT m.historica AND m.desde <= p.desde AND m.hasta >= p.hasta
                AND EXISTS (SELECT 1 FROM indicador_versiones v JOIN indicador_variables iv ON iv.version_id = v.id
                  WHERE v.indicador_id = m.indicador_id AND v.estado = 'aprobada' AND iv.variable_compartida_id = p.variable_id)`
          : await sql`SELECT m.*, i.codigo, i.estado AS indicador_estado FROM mediciones m
              JOIN indicadores i ON i.id = m.indicador_id
              JOIN mediciones x ON x.id = ${f.medicionId}
              WHERE m.estado = 'cerrada' AND NOT m.historica AND m.desde <= x.desde AND m.hasta >= x.hasta AND m.id <> x.id
                AND EXISTS (SELECT 1 FROM indicador_versiones v JOIN indicador_variables iv ON iv.version_id = v.id
                  WHERE v.indicador_id = m.indicador_id AND v.estado = 'aprobada' AND iv.indicador_origen_id = x.indicador_id)`;
      for (const m of filas) if (!vistas.has(Number(m.id))) candidatas.push({ m, de: f });
    }
    if (candidatas.length === 0) break;
    const entradas = await revisarFuentes(sql, candidatas.map((c) => Number(c.m.id)));
    const versiones = await versionesAprobadasDe(sql, candidatas.map((c) => Number(c.m.indicador_id)));
    const siguientes: Fuente[] = [];
    for (const { m, de } of candidatas) {
      const id = Number(m.id);
      const e = entradas.get(id);
      const usa = de.clase === "dato" ? e?.datos.includes(de.periodoId) : e?.mediciones.includes(de.medicionId);
      if (!usa || vistas.has(id)) continue;
      vistas.add(id);
      const vs = versiones.get(Number(m.indicador_id)) ?? [];
      const rige = versionQueRigeEntre(vs, { desde: new Date(m.desde as Date) }, zona);
      const porQueNo: Dependiente["porQueNo"] =
        m.indicador_estado === "retirado" ? "retirado" : !rige || esDeOtraPeriodicidad(m.periodo as string, rige) ? "otra_periodicidad" : null;
      salida.push({
        medicionId: id,
        indicadorId: Number(m.indicador_id),
        codigo: m.codigo as string,
        nombre: vs[0]?.nombre ?? (m.codigo as string),
        periodo: m.periodo as string,
        nivel,
        seReabre: porQueNo === null,
        porQueNo,
        constanciaEn: null,
      });
      if (porQueNo === null) siguientes.push({ clase: "medicion", medicionId: id });
    }
    actuales = siguientes;
  }

  const constancias = await constanciasDe(sql, salida);
  for (const d of salida) d.constanciaEn = constancias.get(d.medicionId) ?? null;
  return salida.sort((a, b) => a.nivel - b.nivel || a.codigo.localeCompare(b.codigo, "es") || a.periodo.localeCompare(b.periodo) || a.medicionId - b.medicionId);
}

/**
 * De cada medición, la fecha de envío de la constancia ya registrada ante el ente del periodo externo que la contiene (anexo
 * 14B, §8), la más reciente si hubiera varias, o `null`: la lista de la reapertura lo dice, y la constancia no cambia.
 */
export async function constanciasDe(sql: Cliente, mediciones: readonly { medicionId: number; indicadorId: number }[]): Promise<Map<number, Date | null>> {
  const salida = new Map<number, Date | null>();
  if (mediciones.length === 0) return salida;
  // `fecha_envio` es una fecha: con la zona de la conexión (la de la instalación), su medianoche local.
  const filas = await sql`SELECT m.id, max(r.fecha_envio::timestamptz) AS en FROM mediciones m
    LEFT JOIN reportes_externos r ON r.indicador_id = m.indicador_id AND r.estado = 'registrada' AND r.desde <= m.desde AND r.hasta >= m.hasta
    WHERE m.id IN ${sql(mediciones.map((x) => x.medicionId))}
    GROUP BY m.id`;
  for (const f of filas) salida.set(Number(f.id), f.en === null ? null : new Date(f.en as Date));
  return salida;
}
