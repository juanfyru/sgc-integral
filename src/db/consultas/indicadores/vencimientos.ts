/**
 * Los recordatorios de los indicadores (spec 14 §10.2, F14-DC34): la pasada que `revisarVencimientos` suma después de la
 * de vigencia. Abre los periodos que terminaron (`asegurarMediciones`, indicador por indicador), toma las fotos de los
 * automáticos que ya tocan (`tomarFotos`, anexo 14B §5.4: un resultado que no cumple avisa y pide el análisis en la misma
 * pasada) y, sobre las mediciones ordinarias abiertas (`esPendiente`, sin las de otra periodicidad ni las que esperan el
 * dato del sistema: `queFalta`), manda:
 *
 * 1. El aviso previo (`aviso_previo_en`), cuando faltan los días del parámetro para la fecha límite: uno por persona.
 * 2. El de vencido (`aviso_vencido_en`), pasada la fecha límite: uno por persona a quienes miden (o a quienes analizan,
 *    si lo que falta es el análisis) y otro por proceso a sus líderes, con lo que no les llegó como responsables.
 * 3. El escalamiento (`escalado_en`), pasados los «días para avisar al jefe» de Configuración documental: a los jefes
 *    (`jefesDe`) de quienes tienen la tarea, uno por subalterno, sin código, nombre ni enlace del indicador, que puede ser
 *    restringido. El Admin SGC no recibe copia, y lo que tiene de respaldo (sin designado ni líder) no se escala: ya es
 *    su tarea «Sin responsable: designe a alguien».
 *
 * La mecánica de las pasadas de la 13A a la 13C: candidatas por marca nula, las marcas y el estado releídos bajo el
 * candado (`FOR UPDATE SKIP LOCKED`) y en la misma transacción que los avisos, y sin fila en `auditoria`: el rastro son los
 * avisos y las marcas. Lo que puede fallar (responsables, líderes, jefes) se busca antes del candado, sin escribir, un
 * indicador a la vez: el que falla se registra y se salta en esa pasada, y los demás siguen. La transacción es una por
 * paso, no por medición (la marca es de la medición y la comparten todos sus destinatarios, que reciben un solo aviso con
 * todo lo suyo), y corta: bloquea, relee, inserta los avisos y pone las marcas. Sin destinatario no hay aviso ni marca, y
 * sin jefe no hay escalamiento ni marca: la medición se revisa otra vez. `avisados` cuenta las mediciones avisadas (previo
 * y vencido) y `escalados`, las escaladas.
 */
import type { PendingQuery, Row, TransactionSql } from "postgres";
import type { Cliente } from "@/db/cliente";
import { avisarA, jefesDe } from "@/db/consultas/avisos-vencimiento";
import type { ConfigDocumental } from "@/db/consultas/config-documental";
import { enTransaccion } from "@/db/consultas/flujo/contrato";
import { lideresDeProceso } from "@/db/consultas/tramites";
import { responsablesDeAnalizar, responsablesDeMedir, sinResponsable } from "@/lib/alcance";
import { tocaAvisoPrevio } from "@/lib/indicadores/periodos";
import { cuenta } from "@/lib/plural";
import { estadoPlazo, fechaEnZona } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { asegurarConstancias } from "./constancias";
import { constanciasVencidas } from "./constancias-vencidas";
import { asegurarPeriodosDeDatos } from "./datos-periodos";
import { datosVencidos } from "./datos-vencidos";
import { tomarFotos } from "./fotos";
import { impactosDeIndicadoresVencidos } from "./impactos";
import { obtenerParametros } from "./maestros";
import { asegurarMediciones } from "./mediciones";
import { correrPaso, diaYMes } from "./pasada";
import { propagarSinFallar } from "./propagacion";
import { columnasDePendiente, esPendiente, queFalta, type FaltaDePersona as Falta } from "./tareas";

type Contexto = { sql: Cliente; ahora: Date; zona: string; escalamientoDias: number; avisoPrevioDias: number };
type Resultado = { avisados: number; escalados: number };

/**
 * Lo que falta es siempre de alguien: «Falta un dato» (un automático que espera su cálculo) no entra a ningún paso. El
 * `grupo` de `correrPaso` es el indicador.
 */
type Medicion = { id: number; grupo: number; indicadorId: number; procesoId: number; proceso: string; vence: Date; falta: Falta };

/**
 * Lo que un paso necesita de un indicador, buscado antes del candado: quienes tienen cada función (`responsables`), los
 * líderes del proceso (el aviso de vencido) y, para el escalamiento, los jefes de cada responsable que no es de respaldo.
 */
type Resuelto = {
  responsables: Record<Falta, number[]>;
  lideres: number[];
  /** Por responsable: su nombre y sus jefes. */
  jefes: Map<number, { nombre: string; jefes: number[] }>;
  respaldo: Record<Falta, boolean>;
};

/** Un paso de la pasada: la marca que pone, la ventana de tiempo (en SQL y, en la zona, en días), qué busca y qué avisa. */
type Paso = {
  nombre: string;
  sinMarca: (sql: Cliente) => PendingQuery<Row[]>;
  ventana: (sql: Cliente, c: Contexto) => PendingQuery<Row[]>;
  queda: (m: Medicion, c: Contexto) => boolean;
  busca: { lideres?: boolean; jefes?: boolean };
  /** Avisa con lo ya resuelto y devuelve las mediciones que avisó: solo ellas llevan la marca. */
  avisar: (tx: TransactionSql, ms: Medicion[], r: Map<number, Resuelto>, c: Contexto) => Promise<number[]>;
  marcar: (tx: TransactionSql, ids: number[], ahora: Date) => Promise<unknown>;
};

const DIA_MS = 86_400_000;
const dias = (n: number) => cuenta(n, "día", "días");
const indicadores = (n: number) => cuenta(n, "indicador", "indicadores");
const FUNCION: Record<Falta, "mide" | "analiza"> = { reporte: "mide", analisis: "analiza" };

/** «2 indicadores por reportar», «1 indicador por analizar», «2 indicadores por reportar y 1 por analizar». */
function queTiene(ms: Medicion[]): string {
  const reportar = ms.filter((m) => m.falta === "reporte").length;
  const analizar = ms.length - reportar;
  if (analizar === 0) return `${indicadores(reportar)} por reportar`;
  if (reportar === 0) return `${indicadores(analizar)} por analizar`;
  return `${indicadores(reportar)} por reportar y ${analizar} por analizar`;
}

/** La lista de «Indicadores» filtrada por lo que falta y por «Donde participo». */
function enlaceDeLoQueFalta(ms: Medicion[]): string {
  if (ms.every((m) => m.falta === "reporte")) return "/indicadores?reporte=por-reportar&participo=1";
  if (ms.every((m) => m.falta === "analisis")) return "/indicadores?reporte=falta-analisis&participo=1";
  return "/indicadores?participo=1";
}

const masProxima = (ms: Medicion[]) => new Date(Math.min(...ms.map((m) => m.vence.getTime())));

/** Las mediciones del paso con la marca vacía y dentro de su ventana; con `ids`, solo esas y bloqueadas. */
async function leer(sql: Cliente, c: Contexto, paso: Paso, ids?: number[]): Promise<Medicion[]> {
  const filas = await sql`SELECT ${columnasDePendiente(sql)}, i.proceso_id, p.nombre AS proceso
    FROM mediciones m JOIN indicadores i ON i.id = m.indicador_id JOIN procesos p ON p.id = i.proceso_id
    WHERE ${esPendiente(sql)} AND ${paso.sinMarca(sql)} AND ${paso.ventana(sql, c)}
      ${ids ? sql`AND m.id = ANY(${ids})` : sql``}
    ORDER BY m.id
    ${ids ? sql`FOR UPDATE OF m SKIP LOCKED` : sql``}`;
  const pendientes = queFalta(filas);
  return filas.flatMap((f) => {
    const p = pendientes.get(Number(f.id));
    if (!p || p.falta === "dato") return [];
    const m: Medicion = {
      id: Number(f.id),
      grupo: Number(f.indicador_id),
      indicadorId: Number(f.indicador_id),
      procesoId: Number(f.proceso_id),
      proceso: f.proceso as string,
      vence: new Date(f.vence_en as string),
      falta: p.falta,
    };
    return paso.queda(m, c) ? [m] : [];
  });
}

/**
 * Lo que el paso necesita de cada indicador de las candidatas, uno a la vez y en su transacción de solo lectura: el que
 * falla se registra y queda fuera de esta pasada. Las dos funciones se buscan siempre: lo que falta puede cambiar entre
 * la lista y el candado (un reporte deja pendiente el análisis).
 */
async function resolver(c: Contexto, paso: Paso, candidatas: Medicion[]): Promise<Map<number, Resuelto>> {
  const procesos = new Map(candidatas.map((m) => [m.indicadorId, m.procesoId]));
  const salida = new Map<number, Resuelto>();
  for (const [indicadorId, procesoId] of procesos) {
    try {
      salida.set(
        indicadorId,
        await enTransaccion(c.sql, async (tx) => {
          const responsables = {
            reporte: await responsablesDeMedir(indicadorId, { sql: tx }),
            analisis: await responsablesDeAnalizar(indicadorId, { sql: tx }),
          };
          const lideres = paso.busca.lideres ? await lideresDeProceso(procesoId, { sql: tx }) : [];
          const respaldo = { reporte: false, analisis: false };
          const jefes = new Map<number, { nombre: string; jefes: number[] }>();
          if (paso.busca.jefes) {
            for (const f of ["reporte", "analisis"] as const) respaldo[f] = await sinResponsable(indicadorId, FUNCION[f], { sql: tx });
            const personas = new Set([...(respaldo.reporte ? [] : responsables.reporte), ...(respaldo.analisis ? [] : responsables.analisis)]);
            for (const u of personas) {
              const deU = await jefesDe(tx, [u]);
              if (deU.size > 0) jefes.set(u, { nombre: [...deU.values()][0][0], jefes: [...deU.keys()] });
            }
          }
          return { responsables, lideres, jefes, respaldo };
        }),
      );
    } catch (err) {
      console.error(`No se pudo preparar ${paso.nombre} del indicador ${indicadorId}:`, err);
    }
  }
  return salida;
}

/** Las mediciones de cada persona que tiene a cargo lo que les falta. */
function porPersona(ms: Medicion[], r: Map<number, Resuelto>): Map<number, Medicion[]> {
  const salida = new Map<number, Medicion[]>();
  for (const m of ms) {
    for (const u of r.get(m.indicadorId)?.responsables[m.falta] ?? []) salida.set(u, [...(salida.get(u) ?? []), m]);
  }
  return salida;
}

const PREVIO: Paso = {
  nombre: "el aviso previo",
  sinMarca: (sql) => sql`m.aviso_previo_en IS NULL`,
  ventana: (sql, c) => sql`m.vence_en >= ${c.ahora} AND m.vence_en < ${new Date(c.ahora.getTime() + (c.avisoPrevioDias + 1) * DIA_MS)}`,
  queda: (m, c) => tocaAvisoPrevio(m.vence, c.ahora, c.avisoPrevioDias, c.zona),
  busca: {},
  avisar: async (tx, ms, r, c) => {
    const avisadas = new Set<number>();
    for (const [usuarioId, suyas] of porPersona(ms, r)) {
      await avisarA(
        tx,
        {
          tipo: "indicadores.por_vencer",
          titulo: `Tiene ${queTiene(suyas)} antes del ${diaYMes(masProxima(suyas), c.zona)}`,
          enlace: enlaceDeLoQueFalta(suyas),
          entidad: "usuario",
          entidadId: usuarioId,
        },
        [{ usuarioId, cuerpo: suyas.length === 1 ? "Lo encuentra en «Mis tareas»." : "Los encuentra en «Mis tareas»." }],
      );
      for (const m of suyas) avisadas.add(m.id);
    }
    return [...avisadas];
  },
  marcar: (tx, ids, ahora) => tx`UPDATE mediciones SET aviso_previo_en = ${ahora} WHERE id = ANY(${ids})`,
};

const VENCIDO: Paso = {
  nombre: "el aviso de vencido",
  sinMarca: (sql) => sql`m.aviso_vencido_en IS NULL`,
  ventana: (sql, c) => sql`m.vence_en < ${c.ahora}`,
  queda: () => true,
  busca: { lideres: true },
  avisar: async (tx, ms, r, c) => {
    const avisadas = new Set<number>();
    // A quien la tiene a cargo, todo lo suyo en un aviso.
    for (const [usuarioId, suyas] of porPersona(ms, r)) {
      const fechas = new Set(suyas.map((m) => fechaEnZona(m.vence, c.zona)));
      const cuando = `${fechas.size === 1 ? "El plazo" : "El más atrasado"} venció el ${diaYMes(masProxima(suyas), c.zona)}.`;
      await avisarA(
        tx,
        {
          tipo: "indicadores.vencido",
          titulo: `Tiene ${queTiene(suyas)} con el plazo vencido`,
          enlace: "/indicadores?reporte=vencida&participo=1",
          entidad: "usuario",
          entidadId: usuarioId,
        },
        [{ usuarioId, cuerpo: cuando }],
      );
      for (const m of suyas) avisadas.add(m.id);
    }
    // A los líderes, por proceso, lo del proceso que no les llegó como responsables.
    const procesos = new Map<number, Medicion[]>();
    for (const m of ms) procesos.set(m.procesoId, [...(procesos.get(m.procesoId) ?? []), m]);
    for (const [procesoId, delProceso] of procesos) {
      const lideres = new Set(delProceso.flatMap((m) => r.get(m.indicadorId)?.lideres ?? []));
      for (const lider of lideres) {
        const ajenas = delProceso.filter((m) => !(r.get(m.indicadorId)?.responsables[m.falta] ?? []).includes(lider));
        if (ajenas.length === 0) continue;
        const reportar = ajenas.filter((m) => m.falta === "reporte").length;
        const analizar = ajenas.length - reportar;
        const partes = [reportar > 0 ? `${reportar} por reportar` : null, analizar > 0 ? `${analizar} por analizar` : null].filter(Boolean);
        await avisarA(
          tx,
          {
            tipo: "indicadores.vencido",
            titulo: `${indicadores(ajenas.length)} de ${delProceso[0].proceso} con el plazo vencido`,
            enlace: `/indicadores?reporte=vencida&proceso=${procesoId}`,
            entidad: "proceso",
            entidadId: procesoId,
          },
          [{ usuarioId: lider, cuerpo: `${partes.join(" y ")}.` }],
        );
        for (const m of ajenas) avisadas.add(m.id);
      }
    }
    return [...avisadas];
  },
  marcar: (tx, ids, ahora) => tx`UPDATE mediciones SET aviso_vencido_en = ${ahora} WHERE id = ANY(${ids})`,
};

/** «2 reportes», «1 análisis», «2 reportes y 1 análisis» de indicadores, y el título que les corresponde. */
function loVencido(ms: Medicion[]): { que: string; titulo: string } {
  const reportes = ms.filter((m) => m.falta === "reporte").length;
  const analisis = ms.length - reportes;
  const que = [reportes > 0 ? cuenta(reportes, "reporte", "reportes") : null, analisis > 0 ? `${analisis} análisis` : null]
    .filter(Boolean)
    .join(" y ");
  const titulo = analisis === 0 ? "Reportes de indicadores vencidos" : reportes === 0 ? "Análisis de indicadores vencidos" : "Reportes y análisis de indicadores vencidos";
  return { que, titulo };
}

const ESCALAMIENTO: Paso = {
  nombre: "el escalamiento",
  sinMarca: (sql) => sql`m.escalado_en IS NULL`,
  ventana: (sql, c) => sql`m.vence_en < ${c.ahora}`,
  queda: (m, c) => estadoPlazo(m.vence, c.ahora, c.zona).dias > c.escalamientoDias,
  busca: { jefes: true },
  avisar: async (tx, ms, r, c) => {
    // A cargo de cada responsable con jefe; lo que el Admin SGC tiene de respaldo no se escala.
    const porSubalterno = new Map<number, { nombre: string; jefes: number[]; suyas: Medicion[] }>();
    for (const m of ms) {
      const resuelto = r.get(m.indicadorId);
      if (!resuelto || resuelto.respaldo[m.falta]) continue;
      for (const u of resuelto.responsables[m.falta]) {
        const jefes = resuelto.jefes.get(u);
        if (!jefes) continue;
        const actual = porSubalterno.get(u) ?? { ...jefes, suyas: [] };
        actual.suyas.push(m);
        porSubalterno.set(u, actual);
      }
    }
    const escaladas = new Set<number>();
    for (const [usuarioId, { nombre, jefes, suyas }] of porSubalterno) {
      const atraso = suyas.map((m) => estadoPlazo(m.vence, c.ahora, c.zona).dias);
      const mas = Math.max(...atraso);
      const n = suyas.length;
      const hace = atraso.every((d) => d === mas)
        ? `${n === 1 ? "Venció" : "Vencieron"} hace ${dias(mas)}.`
        : `El más atrasado venció hace ${dias(mas)}.`;
      const { que, titulo } = loVencido(suyas);
      const cuerpo = `${que} de indicadores a cargo de ${nombre} ${n === 1 ? "sigue vencido" : "siguen vencidos"}. ${hace}`;
      // Sin código, nombre ni enlace: el jefe no gana acceso a un indicador restringido (F14-DC34).
      await avisarA(
        tx,
        { tipo: "indicadores.escalado", titulo, enlace: null, entidad: "usuario", entidadId: usuarioId },
        jefes.map((jefe) => ({ usuarioId: jefe, cuerpo })),
      );
      for (const m of suyas) escaladas.add(m.id);
    }
    return [...escaladas];
  },
  marcar: (tx, ids, ahora) => tx`UPDATE mediciones SET escalado_en = ${ahora} WHERE id = ANY(${ids})`,
};

/** Un paso, con la mecánica de `correrPaso` (la misma de las constancias): sus candidatas, releídas bajo el candado, y su `resolver`. */
function correr(c: Contexto, paso: Paso): Promise<number> {
  return correrPaso(c, {
    leer: (sql, ctx, ids) => leer(sql, ctx, paso, ids),
    resolver: (ctx, candidatas) => resolver(ctx, paso, candidatas),
    avisar: paso.avisar,
    marcar: paso.marcar,
  });
}

/** Abre los periodos de cada indicador activo; el que falla se registra y los demás siguen. */
async function abrirPeriodos(sql: Cliente, ahora: Date): Promise<void> {
  const activos = await sql`SELECT id FROM indicadores WHERE estado = 'activo' AND inicio_medicion IS NOT NULL ORDER BY id`;
  for (const { id } of activos) {
    try {
      await asegurarMediciones({ sql, ahora, indicadorId: Number(id) });
    } catch (err) {
      console.error(`No se pudieron abrir los periodos del indicador ${id}:`, err);
    }
  }
}

/**
 * La pasada de los indicadores (spec 14 §10.2): abre los periodos, toma las fotos (después de abrir y antes de los avisos),
 * abre las constancias de envío al ente (anexo 14B, §8: `asegurarConstancias`) y los periodos de los datos compartidos
 * (anexo 14C, §4.3: `asegurarPeriodosDeDatos`), propaga lo que nadie propagó (anexo 14C, §3.3: `propagarSinFallar`) y manda
 * los avisos: los de las mediciones, después los de las constancias
 * (`constanciasVencidas`), los de las revisiones por cambio de norma (anexo 14B, §9: `impactosDeIndicadoresVencidos`) y al
 * final los de los datos compartidos (anexo 14C, §4.4: `datosVencidos`), que suman a sus cuentas. Un paso que falla se
 * registra y los demás siguen.
 */
export async function revisarVencimientosDeIndicadores(opciones: { sql: Cliente; ahora: Date; config: ConfigDocumental }): Promise<Resultado> {
  const { sql, ahora } = opciones;
  await abrirPeriodos(sql, ahora);
  try {
    await tomarFotos({ sql, ahora });
  } catch (err) {
    console.error("No se pudieron tomar las fotos de los indicadores automáticos:", err);
  }
  try {
    await asegurarConstancias({ sql, ahora });
  } catch (err) {
    console.error("No se pudieron abrir las constancias de envío de los indicadores:", err);
  }
  try {
    await asegurarPeriodosDeDatos({ sql, ahora });
  } catch (err) {
    console.error("No se pudieron abrir los periodos de los datos compartidos:", err);
  }
  // Lo que nadie propagó (anexo 14C, §3.3): después de las fotos y de los periodos de los datos, antes de los avisos.
  await propagarSinFallar({ sql, ahora });
  const { avisoPrevioDias } = await obtenerParametros({ sql });
  const c: Contexto = { sql, ahora, zona: zonaHoraria(), escalamientoDias: opciones.config.escalamientoDias, avisoPrevioDias };
  const total: Resultado = { avisados: 0, escalados: 0 };
  for (const [paso, clave] of [
    [PREVIO, "avisados"],
    [VENCIDO, "avisados"],
    [ESCALAMIENTO, "escalados"],
  ] as const) {
    try {
      total[clave] += await correr(c, paso);
    } catch (err) {
      console.error(`No se pudo revisar ${paso.nombre} de los indicadores:`, err);
    }
  }
  try {
    const constancias = await constanciasVencidas({ sql, ahora, zona: c.zona, escalamientoDias: c.escalamientoDias });
    total.avisados += constancias.avisados;
    total.escalados += constancias.escalados;
  } catch (err) {
    console.error("No se pudieron revisar los vencimientos de las constancias de envío:", err);
  }
  try {
    const impactos = await impactosDeIndicadoresVencidos({ sql, ahora, escalamientoDias: c.escalamientoDias });
    total.avisados += impactos.avisados;
    total.escalados += impactos.escalados;
  } catch (err) {
    console.error("No se pudieron revisar los vencimientos de las revisiones de indicadores por cambio de norma:", err);
  }
  try {
    const deDatos = await datosVencidos({ sql, ahora, escalamientoDias: c.escalamientoDias });
    total.avisados += deDatos.previos + deDatos.vencidos;
    total.escalados += deDatos.escalados;
  } catch (err) {
    console.error("No se pudieron revisar los vencimientos de los datos compartidos:", err);
  }
  return total;
}
