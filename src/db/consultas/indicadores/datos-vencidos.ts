/**
 * Los recordatorios de los periodos de los datos compartidos (anexo 14C, §4.4), con los parámetros de §10.2 del spec 14.
 * Sobre lo que se pide de un dato (`periodoQueSePide`), tres pasos:
 *
 * 1. El aviso previo (`aviso_previo_en`), cuando faltan los días del parámetro (`ind_aviso_previo_dias`) para la fecha
 *    límite: uno por persona a quienes tienen la tarea (`responsablesDeDato`).
 * 2. El de vencido (`aviso_vencido_en`), pasada la fecha límite: uno por persona a quienes tienen la tarea y otro por
 *    proceso a los líderes del proceso dueño, con lo que no les llegó como responsables.
 * 3. El escalamiento (`escalado_en`), pasados los «días para avisar al jefe» de Configuración documental: a los jefes
 *    (`jefesDe`) de quienes tienen la tarea, uno por subalterno, sin el nombre ni el enlace del dato. Lo que el Admin SGC
 *    tiene de respaldo (sin responsable ni líder activos: `sinResponsableDeDato`) no se escala.
 *
 * La mecánica de las pasadas de las mediciones y de las constancias, con el mismo `correrPaso` (`pasada.ts`), cuyo `grupo`
 * aquí es el dato: candidatas por marca nula, lo que puede fallar (responsables, líderes, jefes) buscado antes del candado,
 * un dato a la vez (el que falla se registra y se salta), y en una transacción corta por paso el candado (`FOR UPDATE SKIP
 * LOCKED`), lo releído, los avisos y las marcas. Sin destinatario no hay aviso ni marca, y sin jefe no hay escalamiento ni
 * marca. Sin fila en `auditoria`: el rastro son los avisos y las marcas.
 */
import type { PendingQuery, Row, TransactionSql } from "postgres";
import type { Cliente } from "@/db/cliente";
import { avisarA, jefesDe } from "@/db/consultas/avisos-vencimiento";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import { enTransaccion } from "@/db/consultas/flujo/contrato";
import { lideresDeProceso } from "@/db/consultas/tramites";
import { responsablesDeDato, sinResponsableDeDato } from "@/lib/alcance";
import { tocaAvisoPrevio } from "@/lib/indicadores/periodos";
import { cuenta } from "@/lib/plural";
import { estadoPlazo, fechaEnZona } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { periodoQueSePide } from "./datos-periodos";
import { obtenerParametros } from "./maestros";
import { correrPaso, diaYMes } from "./pasada";

type Contexto = { sql: Cliente; ahora: Date; zona: string; escalamientoDias: number; avisoPrevioDias: number };
type Resultado = { previos: number; vencidos: number; escalados: number };

/** Un periodo del dato que se pide; el `grupo` de `correrPaso` es el dato. */
type Pendiente = { id: number; grupo: number; datoId: number; procesoId: number; proceso: string; vence: Date };

/** Lo que un paso necesita de un dato, buscado antes del candado. */
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
  ventana: (sql: Cliente, c: Contexto) => PendingQuery<Row[]>;
  queda: (p: Pendiente, c: Contexto) => boolean;
  busca: { lideres?: boolean; jefes?: boolean };
  /** Avisa con lo ya resuelto y devuelve los periodos que avisó: solo ellos llevan la marca. */
  avisar: (tx: TransactionSql, ps: Pendiente[], r: Map<number, Resuelto>, c: Contexto) => Promise<number[]>;
  marcar: (tx: TransactionSql, ids: number[], ahora: Date) => Promise<unknown>;
};

const DIA_MS = 86_400_000;
const datos = (n: number) => cuenta(n, "dato compartido", "datos compartidos");
const dias = (n: number) => cuenta(n, "día", "días");

/** La página del dato si todos son del mismo; si no, «Datos compartidos». */
const enlaceDe = (ps: Pendiente[]) => (new Set(ps.map((p) => p.datoId)).size === 1 ? `/indicadores/datos/${ps[0].datoId}` : "/indicadores/datos");

const masProxima = (ps: Pendiente[]) => new Date(Math.min(...ps.map((p) => p.vence.getTime())));

/** «El plazo venció el 10 de noviembre.»; con fechas distintas, la del más atrasado. */
function cuandoVencio(ps: Pendiente[], zona: string): string {
  const fechas = new Set(ps.map((p) => fechaEnZona(p.vence, zona)));
  return `${fechas.size === 1 ? "El plazo" : "El más atrasado"} venció el ${diaYMes(masProxima(ps), zona)}.`;
}

/** Los periodos del paso con la marca vacía y dentro de su ventana; con `ids`, solo esos y bloqueados. */
async function leer(sql: Cliente, c: Contexto, paso: Paso, ids?: number[]): Promise<Pendiente[]> {
  const filas = await sql`SELECT vv.id, vv.variable_id, vv.vence_en, d.proceso_id, p.nombre AS proceso
    FROM variable_valores vv JOIN variables_compartidas d ON d.id = vv.variable_id JOIN procesos p ON p.id = d.proceso_id
    WHERE ${periodoQueSePide(sql)} AND ${paso.sinMarca(sql)} AND ${paso.ventana(sql, c)}
      ${ids ? sql`AND vv.id = ANY(${ids})` : sql``}
    ORDER BY vv.id
    ${ids ? sql`FOR UPDATE OF vv SKIP LOCKED` : sql``}`;
  return filas
    .map((f) => ({
      id: Number(f.id),
      grupo: Number(f.variable_id),
      datoId: Number(f.variable_id),
      procesoId: Number(f.proceso_id),
      proceso: f.proceso as string,
      vence: new Date(f.vence_en as string),
    }))
    .filter((p) => paso.queda(p, c));
}

/** Lo que el paso necesita de cada dato de las candidatas, uno a la vez: el que falla se registra y queda fuera. */
async function resolver(c: Contexto, paso: Paso, candidatas: Pendiente[]): Promise<Map<number, Resuelto>> {
  const procesos = new Map(candidatas.map((p) => [p.datoId, p.procesoId]));
  const salida = new Map<number, Resuelto>();
  for (const [datoId, procesoId] of procesos) {
    try {
      salida.set(
        datoId,
        await enTransaccion(c.sql, async (tx) => {
          const responsables = await responsablesDeDato(tx, datoId);
          const lideres = paso.busca.lideres ? await lideresDeProceso(procesoId, { sql: tx }) : [];
          const respaldo = paso.busca.jefes ? await sinResponsableDeDato(tx, datoId) : false;
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
      console.error(`No se pudo preparar ${paso.nombre} del dato compartido ${datoId}:`, err);
    }
  }
  return salida;
}

/** Los periodos de cada persona que tiene la tarea. */
function porPersona(ps: Pendiente[], r: Map<number, Resuelto>): Map<number, Pendiente[]> {
  const salida = new Map<number, Pendiente[]>();
  for (const p of ps) for (const u of r.get(p.datoId)?.responsables ?? []) salida.set(u, [...(salida.get(u) ?? []), p]);
  return salida;
}

const PREVIO: Paso = {
  nombre: "el aviso previo",
  sinMarca: (sql) => sql`vv.aviso_previo_en IS NULL`,
  ventana: (sql, c) => sql`vv.vence_en >= ${c.ahora} AND vv.vence_en < ${new Date(c.ahora.getTime() + (c.avisoPrevioDias + 1) * DIA_MS)}`,
  queda: (p, c) => tocaAvisoPrevio(p.vence, c.ahora, c.avisoPrevioDias, c.zona),
  busca: {},
  avisar: async (tx, ps, r, c) => {
    const avisados = new Set<number>();
    for (const [usuarioId, suyos] of porPersona(ps, r)) {
      await avisarA(
        tx,
        {
          tipo: "indicadores.dato_por_vencer",
          titulo: `Tiene ${datos(suyos.length)} por reportar antes del ${diaYMes(masProxima(suyos), c.zona)}`,
          enlace: enlaceDe(suyos),
          entidad: "usuario",
          entidadId: usuarioId,
        },
        [{ usuarioId, cuerpo: suyos.length === 1 ? "Lo encuentra en «Mis tareas»." : "Los encuentra en «Mis tareas»." }],
      );
      for (const p of suyos) avisados.add(p.id);
    }
    return [...avisados];
  },
  marcar: (tx, ids, ahora) => tx`UPDATE variable_valores SET aviso_previo_en = ${ahora} WHERE id = ANY(${ids})`,
};

const VENCIDO: Paso = {
  nombre: "el aviso de vencido",
  sinMarca: (sql) => sql`vv.aviso_vencido_en IS NULL`,
  ventana: (sql, c) => sql`vv.vence_en < ${c.ahora}`,
  queda: () => true,
  busca: { lideres: true },
  avisar: async (tx, ps, r, c) => {
    const avisados = new Set<number>();
    // A quien tiene la tarea, todo lo suyo en un aviso.
    for (const [usuarioId, suyos] of porPersona(ps, r)) {
      await avisarA(
        tx,
        {
          tipo: "indicadores.dato_vencido",
          titulo: `Tiene ${datos(suyos.length)} por reportar con el plazo vencido`,
          enlace: enlaceDe(suyos),
          entidad: "usuario",
          entidadId: usuarioId,
        },
        [{ usuarioId, cuerpo: cuandoVencio(suyos, c.zona) }],
      );
      for (const p of suyos) avisados.add(p.id);
    }
    // A los líderes del proceso dueño, por proceso, lo que no les llegó como responsables.
    const procesos = new Map<number, Pendiente[]>();
    for (const p of ps) procesos.set(p.procesoId, [...(procesos.get(p.procesoId) ?? []), p]);
    for (const [procesoId, delProceso] of procesos) {
      const lideres = new Set(delProceso.flatMap((p) => r.get(p.datoId)?.lideres ?? []));
      for (const lider of lideres) {
        const ajenos = delProceso.filter((p) => !(r.get(p.datoId)?.responsables ?? []).includes(lider));
        if (ajenos.length === 0) continue;
        await avisarA(
          tx,
          {
            tipo: "indicadores.dato_vencido",
            titulo: `${datos(ajenos.length)} de ${delProceso[0].proceso} con el plazo vencido`,
            enlace: enlaceDe(ajenos),
            entidad: "proceso",
            entidadId: procesoId,
          },
          [{ usuarioId: lider, cuerpo: cuandoVencio(ajenos, c.zona) }],
        );
        for (const p of ajenos) avisados.add(p.id);
      }
    }
    return [...avisados];
  },
  marcar: (tx, ids, ahora) => tx`UPDATE variable_valores SET aviso_vencido_en = ${ahora} WHERE id = ANY(${ids})`,
};

const ESCALAMIENTO: Paso = {
  nombre: "el escalamiento",
  sinMarca: (sql) => sql`vv.escalado_en IS NULL`,
  ventana: (sql, c) => sql`vv.vence_en < ${c.ahora}`,
  queda: (p, c) => estadoPlazo(p.vence, c.ahora, c.zona).dias > c.escalamientoDias,
  busca: { jefes: true },
  avisar: async (tx, ps, r, c) => {
    // A cargo de cada responsable con jefe; lo que el Admin SGC tiene de respaldo no se escala.
    const porSubalterno = new Map<number, { nombre: string; jefes: number[]; suyos: Pendiente[] }>();
    for (const p of ps) {
      const resuelto = r.get(p.datoId);
      if (!resuelto || resuelto.respaldo) continue;
      for (const u of resuelto.responsables) {
        const jefes = resuelto.jefes.get(u);
        if (!jefes) continue;
        const actual = porSubalterno.get(u) ?? { ...jefes, suyos: [] };
        actual.suyos.push(p);
        porSubalterno.set(u, actual);
      }
    }
    const escalados = new Set<number>();
    for (const [usuarioId, { nombre, jefes, suyos }] of porSubalterno) {
      const atraso = suyos.map((p) => estadoPlazo(p.vence, c.ahora, c.zona).dias);
      const mas = Math.max(...atraso);
      const n = suyos.length;
      const hace = atraso.every((d) => d === mas) ? `${n === 1 ? "Venció" : "Vencieron"} hace ${dias(mas)}.` : `El más atrasado venció hace ${dias(mas)}.`;
      const cuerpo = `${datos(n)} a cargo de ${nombre} ${n === 1 ? "sigue vencido" : "siguen vencidos"}. ${hace}`;
      // Sin el nombre ni el enlace del dato, como el de las mediciones (F14-DC34).
      await avisarA(
        tx,
        { tipo: "indicadores.dato_escalado", titulo: "Datos compartidos vencidos", enlace: null, entidad: "usuario", entidadId: usuarioId },
        jefes.map((jefe) => ({ usuarioId: jefe, cuerpo })),
      );
      for (const p of suyos) escalados.add(p.id);
    }
    return [...escalados];
  },
  marcar: (tx, ids, ahora) => tx`UPDATE variable_valores SET escalado_en = ${ahora} WHERE id = ANY(${ids})`,
};

/** Un paso, con la mecánica de `correrPaso`: sus candidatas, releídas bajo el candado, y su `resolver`. */
function correr(c: Contexto, paso: Paso): Promise<number> {
  return correrPaso(c, {
    leer: (sql, ctx, ids) => leer(sql, ctx, paso, ids),
    resolver: (ctx, candidatas) => resolver(ctx, paso, candidatas),
    avisar: paso.avisar,
    marcar: paso.marcar,
  });
}

/**
 * Los tres pasos sobre los periodos de los datos; uno que falla se registra y los demás siguen. Cuenta periodos. Los días
 * del escalamiento son los de Configuración documental; quien ya los tiene (la pasada) los pasa en `escalamientoDias`.
 */
export async function datosVencidos(c: { sql: Cliente; ahora: Date; escalamientoDias?: number }): Promise<Resultado> {
  const { avisoPrevioDias } = await obtenerParametros({ sql: c.sql });
  const escalamientoDias = c.escalamientoDias ?? (await obtenerConfigDocumental({ sql: c.sql })).escalamientoDias;
  const ctx: Contexto = { sql: c.sql, ahora: c.ahora, zona: zonaHoraria(), escalamientoDias, avisoPrevioDias };
  const total: Resultado = { previos: 0, vencidos: 0, escalados: 0 };
  for (const [paso, clave] of [
    [PREVIO, "previos"],
    [VENCIDO, "vencidos"],
    [ESCALAMIENTO, "escalados"],
  ] as const) {
    try {
      total[clave] += await correr(ctx, paso);
    } catch (err) {
      console.error(`No se pudo revisar ${paso.nombre} de los datos compartidos:`, err);
    }
  }
  return total;
}
