/**
 * Avisos de los documentos con revisión vencida (spec 13C §7.5 y §13.3). Agrupados: por pasada, un aviso por
 * persona y proceso con el conteo, nunca uno por documento; al líder del proceso (o a los Admin SGC si no tiene) y
 * siempre a los Admin SGC. A los días de `escalamientoDias`, uno a cada jefe de quienes tienen la tarea. Misma
 * mecánica que los trámites y la distribución: cada proceso en su transacción corta con `FOR UPDATE SKIP LOCKED`
 * sobre sus documentos, y el sistema no deja fila en `auditoria`; el rastro son los avisos y las marcas
 * `revision_aviso_en` / `revision_escalado_en`. Ningún aviso lleva un código ni un título de documento: así no
 * nombra uno restringido a quien no lo ve. Lo que está en la revisión anual abierta no se avisa: la campaña lo cubre.
 */
import type { PendingQuery, Row, TransactionSql } from "postgres";
import type { Cliente } from "@/db/cliente";
import { avisarA, jefesDe } from "@/db/consultas/avisos-vencimiento";
import type { ConfigDocumental } from "@/db/consultas/config-documental";
import { enTransaccion } from "@/db/consultas/flujo/contrato";
import { adminsActivos, lideresDeProceso } from "@/db/consultas/tramites";
import { textoResponsables } from "@/lib/tramites/tipos";
import { columnasDeVigencia, enRevisionAnualAbierta, type FilaSemaforo } from "./fragmentos";

type Contexto = { sql: Cliente; ahora: Date; escalamientoDias: number };
type Resultado = { avisados: number; escalados: number };

const NADA: Resultado = { avisados: 0, escalados: 0 };
const documentos = (n: number) => `${n} ${n === 1 ? "documento" : "documentos"}`;
const dias = (n: number) => `${n} ${n === 1 ? "día" : "días"}`;

/** Los internos vigentes con la revisión vencida que cumplen `condicion`, fuera de la revisión anual abierta. */
async function vencidos(sql: Cliente, condicion: PendingQuery<Row[]>, ahora: Date): Promise<FilaSemaforo[]> {
  const filas = await columnasDeVigencia(sql, sql`d.origen = 'interno' AND NOT ${enRevisionAnualAbierta(sql)} AND ${condicion}`, ahora);
  // Sin fecha de revisión no hay vencimiento, y uno en trámite ya tiene quién lo revise.
  return filas.filter((f) => f.vigencia.estado === "vencida");
}

async function revisarProceso(tx: TransactionSql, procesoId: number, ids: number[], c: Contexto): Promise<Resultado> {
  // Las marcas se vuelven a leer con las filas bloqueadas, y la vigencia después: lo que otra pasada ya avisó, o lo
  // que se ratificó entre la lista y el candado, no se avisa.
  const marcas = await tx`SELECT id, revision_aviso_en, revision_escalado_en FROM documentos
    WHERE id = ANY(${ids}) ORDER BY id FOR UPDATE SKIP LOCKED`;
  if (marcas.length === 0) return NADA;
  const filas = await vencidos(tx, tx`d.id = ANY(${marcas.map((m) => Number(m.id))}) AND p.id = ${procesoId}`, c.ahora);
  const marca = new Map(marcas.map((m) => [Number(m.id), m]));
  const aAvisar = filas.filter((f) => marca.get(f.documentoId)?.revision_aviso_en === null);
  const aEscalar = filas.filter(
    (f) => marca.get(f.documentoId)?.revision_escalado_en === null && -(f.vigencia.dias ?? 0) > c.escalamientoDias,
  );
  if (aAvisar.length === 0 && aEscalar.length === 0) return NADA;

  const proceso = filas[0].proceso.nombre;
  const lideres = await lideresDeProceso(procesoId, { sql: tx });
  const admins = await adminsActivos({ sql: tx });
  // Quienes tienen la tarea: por ellos llega el escalamiento a su jefe.
  const responsables = lideres.length > 0 ? lideres : admins;
  const destinatarios = [...new Set([...responsables, ...admins])];
  const hecho = { ...NADA };

  // Sin destinatario no hubo aviso: la marca queda vacía y el documento se revisa otra vez cuando lo haya.
  if (aAvisar.length > 0 && destinatarios.length > 0) {
    await avisarA(
      tx,
      {
        tipo: "vigencia.vencida",
        titulo: `${documentos(aAvisar.length)} con revisión vencida en ${proceso}`,
        enlace: `/vigencia/semaforo?estado=vencida&proceso=${procesoId}`,
        entidad: "proceso",
        entidadId: procesoId,
      },
      destinatarios.map((usuarioId) => ({
        usuarioId,
        cuerpo: `${aAvisar.length === 1 ? "Ratifíquelo" : "Ratifíquelos"} sin cambios o solicite el cambio desde el semáforo.`,
      })),
    );
    await tx`UPDATE documentos SET revision_aviso_en = ${c.ahora} WHERE id = ANY(${aAvisar.map((f) => f.documentoId)})`;
    hecho.avisados = aAvisar.length;
  }

  // Sin jefe no se escala y el documento queda para cuando lo haya.
  const jefes = aEscalar.length > 0 ? await jefesDe(tx, responsables) : new Map<number, string[]>();
  if (jefes.size > 0) {
    // Sin código, título ni enlace: el jefe no gana acceso a los documentos (spec 13A §14.3).
    await avisarA(
      tx,
      { tipo: "vigencia.escalado", titulo: `Documentos con la revisión vencida en ${proceso}`, enlace: null, entidad: "proceso", entidadId: procesoId },
      [...jefes].map(([usuarioId, subalternos]) => ({
        usuarioId,
        cuerpo: `A cargo de ${textoResponsables(subalternos)}. ${documentos(aEscalar.length)} con la revisión vencida hace más de ${dias(c.escalamientoDias)}.`,
      })),
    );
    await tx`UPDATE documentos SET revision_escalado_en = ${c.ahora} WHERE id = ANY(${aEscalar.map((f) => f.documentoId)})`;
    hecho.escalados = aEscalar.length;
  }
  return hecho;
}

/** `avisados` y `escalados` cuentan documentos, no avisos. */
export async function revisarVencimientosDeVigencia(opciones: {
  sql: Cliente;
  ahora: Date;
  config: ConfigDocumental;
}): Promise<Resultado> {
  const c: Contexto = { sql: opciones.sql, ahora: opciones.ahora, escalamientoDias: opciones.config.escalamientoDias };
  const candidatos = await vencidos(
    c.sql,
    c.sql`(d.revision_aviso_en IS NULL OR d.revision_escalado_en IS NULL)`,
    c.ahora,
  );
  const porProceso = new Map<number, number[]>();
  for (const f of candidatos) porProceso.set(f.proceso.id, [...(porProceso.get(f.proceso.id) ?? []), f.documentoId]);

  const total = { ...NADA };
  for (const [procesoId, ids] of porProceso) {
    try {
      const h = await enTransaccion(c.sql, (tx) => revisarProceso(tx, procesoId, ids, c));
      total.avisados += h.avisados;
      total.escalados += h.escalados;
    } catch (err) {
      console.error(`No se pudo revisar la vigencia vencida del proceso ${procesoId}:`, err);
    }
  }
  return total;
}
