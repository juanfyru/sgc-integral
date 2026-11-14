/**
 * Los recordatorios de las constancias de envío al ente (anexo 14B, §8): vencen, avisan y escalan como una medición, sin
 * aviso previo. Sobre las constancias pendientes de indicadores activos cuya fecha límite ya pasó, dos pasos:
 *
 * 1. El de vencido (`aviso_vencido_en`): uno por persona a quienes tienen la tarea (quienes miden, con el respaldo de
 *    siempre: `responsablesDeMedir`) y otro por proceso a sus líderes, con lo que no les llegó como responsables.
 * 2. El escalamiento (`escalado_en`), pasados los «días para avisar al jefe» de Configuración documental: a los jefes
 *    (`jefesDe`) de quienes tienen la tarea, uno por subalterno, sin código, nombre ni enlace del indicador, que puede ser
 *    restringido. Lo que el Admin SGC tiene de respaldo (sin designado ni líder) no se escala.
 *
 * La mecánica de la pasada de las mediciones (`vencimientos.ts`), en paralelo y sin tocarla: candidatas por marca nula, lo
 * que puede fallar (responsables, líderes, jefes) buscado antes del candado, un indicador a la vez (el que falla se registra
 * y se salta), y en una transacción corta por paso el candado (`FOR UPDATE SKIP LOCKED`), lo releído, los avisos y las
 * marcas. Sin destinatario no hay aviso ni marca, y sin jefe no hay escalamiento ni marca. Sin fila en `auditoria`: el
 * rastro son los avisos y las marcas. `avisados` cuenta las constancias avisadas y `escalados`, las escaladas.
 */
import type { PendingQuery, Row, TransactionSql } from "postgres";
import type { Cliente } from "@/db/cliente";
import { avisarA, jefesDe } from "@/db/consultas/avisos-vencimiento";
import { enTransaccion } from "@/db/consultas/flujo/contrato";
import { lideresDeProceso } from "@/db/consultas/tramites";
import { responsablesDeMedir, sinResponsable } from "@/lib/alcance";
import { MESES } from "@/lib/indicadores-documentales/periodo";
import { cuenta } from "@/lib/plural";
import { estadoPlazo, fechaEnZona } from "@/lib/tramites/plazos";

type Contexto = { sql: Cliente; ahora: Date; zona: string; escalamientoDias: number };
type Resultado = { avisados: number; escalados: number };

type Pendiente = { id: number; indicadorId: number; procesoId: number; proceso: string; vence: Date };

/** Lo que un paso necesita de un indicador, buscado antes del candado. */
type Resuelto = {
  responsables: number[];
  lideres: number[];
  /** Por responsable: su nombre y sus jefes. */
  jefes: Map<number, { nombre: string; jefes: number[] }>;
  /** La tarea la tiene el Admin SGC de respaldo: no se escala. */
  respaldo: boolean;
};

type Paso = {
  nombre: string;
  sinMarca: (sql: Cliente) => PendingQuery<Row[]>;
  queda: (c: Pendiente, ctx: Contexto) => boolean;
  busca: { lideres?: boolean; jefes?: boolean };
  /** Avisa con lo ya resuelto y devuelve las constancias que avisó: solo ellas llevan la marca. */
  avisar: (tx: TransactionSql, cs: Pendiente[], r: Map<number, Resuelto>, ctx: Contexto) => Promise<number[]>;
  marcar: (tx: TransactionSql, ids: number[], ahora: Date) => Promise<unknown>;
};

const reportes = (n: number) => cuenta(n, "reporte al ente", "reportes al ente");
const dias = (n: number) => cuenta(n, "día", "días");
const ENLACE = "/indicadores?envio=pendiente";

/** «15 de octubre», el día en la zona de la instalación. */
function diaYMes(d: Date, zona: string): string {
  const [, mes, dia] = fechaEnZona(d, zona).split("-").map(Number);
  return `${dia} de ${MESES[mes - 1]}`;
}

/** «El plazo venció el 15 de octubre.»; con fechas distintas, la del más atrasado. */
function cuandoVencio(cs: Pendiente[], zona: string): string {
  const fechas = new Set(cs.map((c) => fechaEnZona(c.vence, zona)));
  const primera = new Date(Math.min(...cs.map((c) => c.vence.getTime())));
  return `${fechas.size === 1 ? "El plazo" : "El más atrasado"} venció el ${diaYMes(primera, zona)}.`;
}

/** Las constancias del paso con la marca vacía y ya vencidas; con `ids`, solo esas y bloqueadas. */
async function leer(sql: Cliente, ctx: Contexto, paso: Paso, ids?: number[]): Promise<Pendiente[]> {
  const filas = await sql`SELECT r.id, r.indicador_id, r.vence_en, i.proceso_id, p.nombre AS proceso
    FROM reportes_externos r JOIN indicadores i ON i.id = r.indicador_id JOIN procesos p ON p.id = i.proceso_id
    WHERE r.estado = 'pendiente' AND i.estado = 'activo' AND ${paso.sinMarca(sql)} AND r.vence_en < ${ctx.ahora}
      ${ids ? sql`AND r.id = ANY(${ids})` : sql``}
    ORDER BY r.id
    ${ids ? sql`FOR UPDATE OF r SKIP LOCKED` : sql``}`;
  return filas
    .map((f) => ({
      id: Number(f.id),
      indicadorId: Number(f.indicador_id),
      procesoId: Number(f.proceso_id),
      proceso: f.proceso as string,
      vence: new Date(f.vence_en as string),
    }))
    .filter((c) => paso.queda(c, ctx));
}

/** Lo que el paso necesita de cada indicador de las candidatas, uno a la vez: el que falla se registra y queda fuera. */
async function resolver(ctx: Contexto, paso: Paso, candidatas: Pendiente[]): Promise<Map<number, Resuelto>> {
  const procesos = new Map(candidatas.map((c) => [c.indicadorId, c.procesoId]));
  const salida = new Map<number, Resuelto>();
  for (const [indicadorId, procesoId] of procesos) {
    try {
      salida.set(
        indicadorId,
        await enTransaccion(ctx.sql, async (tx) => {
          const responsables = await responsablesDeMedir(indicadorId, { sql: tx });
          const lideres = paso.busca.lideres ? await lideresDeProceso(procesoId, { sql: tx }) : [];
          const respaldo = paso.busca.jefes ? await sinResponsable(indicadorId, "mide", { sql: tx }) : false;
          const jefes = new Map<number, { nombre: string; jefes: number[] }>();
          if (paso.busca.jefes && !respaldo) {
            for (const u of responsables) {
              const deU = await jefesDe(tx, [u]);
              if (deU.size > 0) jefes.set(u, { nombre: [...deU.values()][0][0], jefes: [...deU.keys()] });
            }
          }
          return { responsables, lideres, jefes, respaldo };
        }),
      );
    } catch (err) {
      console.error(`No se pudo preparar ${paso.nombre} de las constancias del indicador ${indicadorId}:`, err);
    }
  }
  return salida;
}

const VENCIDO: Paso = {
  nombre: "el aviso de vencido",
  sinMarca: (sql) => sql`r.aviso_vencido_en IS NULL`,
  queda: () => true,
  busca: { lideres: true },
  avisar: async (tx, cs, r, ctx) => {
    const avisadas = new Set<number>();
    // A quien la tiene a cargo, todo lo suyo en un aviso.
    const porPersona = new Map<number, Pendiente[]>();
    for (const c of cs) for (const u of r.get(c.indicadorId)?.responsables ?? []) porPersona.set(u, [...(porPersona.get(u) ?? []), c]);
    for (const [usuarioId, suyas] of porPersona) {
      await avisarA(
        tx,
        {
          tipo: "indicadores.envio_vencido",
          titulo: `Tiene ${reportes(suyas.length)} con el plazo vencido`,
          enlace: `${ENLACE}&participo=1`,
          entidad: "usuario",
          entidadId: usuarioId,
        },
        [{ usuarioId, cuerpo: cuandoVencio(suyas, ctx.zona) }],
      );
      for (const c of suyas) avisadas.add(c.id);
    }
    // A los líderes, por proceso, lo del proceso que no les llegó como responsables.
    const procesos = new Map<number, Pendiente[]>();
    for (const c of cs) procesos.set(c.procesoId, [...(procesos.get(c.procesoId) ?? []), c]);
    for (const [procesoId, delProceso] of procesos) {
      const lideres = new Set(delProceso.flatMap((c) => r.get(c.indicadorId)?.lideres ?? []));
      for (const lider of lideres) {
        const ajenas = delProceso.filter((c) => !(r.get(c.indicadorId)?.responsables ?? []).includes(lider));
        if (ajenas.length === 0) continue;
        await avisarA(
          tx,
          {
            tipo: "indicadores.envio_vencido",
            titulo: `${reportes(ajenas.length)} de ${delProceso[0].proceso} con el plazo vencido`,
            enlace: `${ENLACE}&proceso=${procesoId}`,
            entidad: "proceso",
            entidadId: procesoId,
          },
          [{ usuarioId: lider, cuerpo: cuandoVencio(ajenas, ctx.zona) }],
        );
        for (const c of ajenas) avisadas.add(c.id);
      }
    }
    return [...avisadas];
  },
  marcar: (tx, ids, ahora) => tx`UPDATE reportes_externos SET aviso_vencido_en = ${ahora} WHERE id = ANY(${ids})`,
};

const ESCALAMIENTO: Paso = {
  nombre: "el escalamiento",
  sinMarca: (sql) => sql`r.escalado_en IS NULL`,
  queda: (c, ctx) => estadoPlazo(c.vence, ctx.ahora, ctx.zona).dias > ctx.escalamientoDias,
  busca: { jefes: true },
  avisar: async (tx, cs, r, ctx) => {
    // A cargo de cada responsable con jefe; lo que el Admin SGC tiene de respaldo no se escala.
    const porSubalterno = new Map<number, { nombre: string; jefes: number[]; suyas: Pendiente[] }>();
    for (const c of cs) {
      const resuelto = r.get(c.indicadorId);
      if (!resuelto || resuelto.respaldo) continue;
      for (const u of resuelto.responsables) {
        const jefes = resuelto.jefes.get(u);
        if (!jefes) continue;
        const actual = porSubalterno.get(u) ?? { ...jefes, suyas: [] };
        actual.suyas.push(c);
        porSubalterno.set(u, actual);
      }
    }
    const escaladas = new Set<number>();
    for (const [usuarioId, { nombre, jefes, suyas }] of porSubalterno) {
      const atraso = suyas.map((c) => estadoPlazo(c.vence, ctx.ahora, ctx.zona).dias);
      const mas = Math.max(...atraso);
      const n = suyas.length;
      const hace = atraso.every((d) => d === mas) ? `${n === 1 ? "Venció" : "Vencieron"} hace ${dias(mas)}.` : `El más atrasado venció hace ${dias(mas)}.`;
      const cuerpo = `${reportes(n)} a cargo de ${nombre} ${n === 1 ? "sigue vencido" : "siguen vencidos"}. ${hace}`;
      // Sin código, nombre ni enlace: el jefe no gana acceso a un indicador restringido (F14-DC34).
      await avisarA(
        tx,
        { tipo: "indicadores.envio_escalado", titulo: "Reportes al ente vencidos", enlace: null, entidad: "usuario", entidadId: usuarioId },
        jefes.map((jefe) => ({ usuarioId: jefe, cuerpo })),
      );
      for (const c of suyas) escaladas.add(c.id);
    }
    return [...escaladas];
  },
  marcar: (tx, ids, ahora) => tx`UPDATE reportes_externos SET escalado_en = ${ahora} WHERE id = ANY(${ids})`,
};

/** Un paso: las candidatas, lo que necesitan (antes del candado) y, en su transacción, el candado, lo releído, los avisos y las marcas. */
async function correr(ctx: Contexto, paso: Paso): Promise<number> {
  const candidatas = await leer(ctx.sql, ctx, paso);
  if (candidatas.length === 0) return 0;
  const resueltos = await resolver(ctx, paso, candidatas);
  const ids = candidatas.filter((c) => resueltos.has(c.indicadorId)).map((c) => c.id);
  if (ids.length === 0) return 0;
  return enTransaccion(ctx.sql, async (tx) => {
    // Lo que otra pasada ya avisó, o lo que se registró entre la lista y el candado, no se avisa.
    const bajoCandado = await leer(tx, ctx, paso, ids);
    if (bajoCandado.length === 0) return 0;
    const avisadas = await paso.avisar(tx, bajoCandado, resueltos, ctx);
    if (avisadas.length > 0) await paso.marcar(tx, avisadas, ctx.ahora);
    return avisadas.length;
  });
}

/** Los dos pasos; uno que falla se registra y el otro sigue. */
export async function constanciasVencidas(c: Contexto): Promise<Resultado> {
  const total: Resultado = { avisados: 0, escalados: 0 };
  for (const [paso, clave] of [
    [VENCIDO, "avisados"],
    [ESCALAMIENTO, "escalados"],
  ] as const) {
    try {
      total[clave] += await correr(c, paso);
    } catch (err) {
      console.error(`No se pudo revisar ${paso.nombre} de las constancias de envío:`, err);
    }
  }
  return total;
}
