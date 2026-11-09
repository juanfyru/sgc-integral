/**
 * La campaña vencida (spec 13C §9.6 y §13.3), para `revisarVencimientosDeVigencia`: por cada proceso de la revisión
 * abierta con pendientes, pasado `vence_en`, un aviso `revision.vencida` a quienes tienen su tarea (sus líderes o, si
 * no tiene, los Admin SGC) y, a los días de `escalamientoDias`, uno `revision.escalado` a sus jefes. Misma mecánica que
 * las demás pasadas: cada proceso en su transacción corta con `FOR UPDATE SKIP LOCKED` sobre su fila, las marcas se
 * vuelven a leer bajo el candado y van con el aviso, sin `auditoria`. Ningún aviso nombra un documento: el proceso y el
 * conteo. Las marcas se reinician al prorrogar.
 */
import type { TransactionSql } from "postgres";
import { avisarA, jefesDe } from "@/db/consultas/avisos-vencimiento";
import { enTransaccion } from "@/db/consultas/flujo/contrato";
import type { ContextoVencimientos } from "@/db/consultas/normograma/vencidos";
import { adminsActivos, lideresDeProceso } from "@/db/consultas/tramites";
import { cuenta } from "@/lib/plural";
import { estadoPlazo } from "@/lib/tramites/plazos";
import { textoResponsables } from "@/lib/tramites/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { pendientesPorProceso } from "./comun";

type Resultado = { avisados: number; escalados: number };
const NADA: Resultado = { avisados: 0, escalados: 0 };

/** Quienes tienen la tarea del proceso: sus líderes activos o, si no tiene, los Admin SGC (F13A-DC2). */
export async function responsablesDelProceso(tx: TransactionSql, procesoId: number): Promise<number[]> {
  const lideres = await lideresDeProceso(procesoId, { sql: tx });
  return lideres.length > 0 ? lideres : adminsActivos({ sql: tx });
}

type Revision = { id: number; anio: number; vencidaHace: number };

async function revisarProceso(tx: TransactionSql, r: Revision, procesoId: number, c: ContextoVencimientos): Promise<Resultado> {
  const [marca] = await tx`SELECT id, aviso_vencido_en, escalado_en FROM revision_anual_procesos
    WHERE revision_id = ${r.id} AND proceso_id = ${procesoId}
    FOR UPDATE SKIP LOCKED`;
  if (!marca) return NADA;
  // Bajo el candado: lo que se decidió entre la lista y aquí ya no cuenta.
  const [p] = await pendientesPorProceso(tx, r.id, tx`rap.proceso_id = ${procesoId}`);
  if (!p || p.pendientes === 0) return NADA;
  const avisar = marca.aviso_vencido_en === null;
  const escalar = marca.escalado_en === null && r.vencidaHace > c.escalamientoDias;
  if (!avisar && !escalar) return NADA;

  const responsables = await responsablesDelProceso(tx, procesoId);
  const hecho = { ...NADA };
  // Sin destinatario no hubo aviso: la marca queda vacía y el proceso se revisa otra vez cuando lo haya.
  if (avisar && responsables.length > 0) {
    await avisarA(
      tx,
      {
        tipo: "revision.vencida",
        titulo: `La revisión anual ${r.anio} venció con ${cuenta(p.pendientes, "pendiente", "pendientes")} en ${p.nombre}`,
        enlace: `/vigencia/revision-anual?proceso=${procesoId}`,
        entidad: "proceso",
        entidadId: procesoId,
      },
      responsables.map((usuarioId) => ({ usuarioId, cuerpo: "Decida sobre los documentos que faltan y confirme el normograma del proceso." })),
    );
    await tx`UPDATE revision_anual_procesos SET aviso_vencido_en = ${c.ahora} WHERE id = ${marca.id}`;
    hecho.avisados = 1;
  }

  // Sin jefe no se escala y el proceso queda para cuando lo haya. Sin enlace: el jefe no gana acceso (spec 13A §14.3).
  const jefes = escalar ? await jefesDe(tx, responsables) : new Map<number, string[]>();
  if (jefes.size > 0) {
    await avisarA(
      tx,
      { tipo: "revision.escalado", titulo: `Revisión anual ${r.anio} vencida en ${p.nombre}`, enlace: null, entidad: "proceso", entidadId: procesoId },
      [...jefes].map(([usuarioId, subalternos]) => ({
        usuarioId,
        cuerpo: `A cargo de ${textoResponsables(subalternos)}. ${cuenta(p.pendientes, "pendiente", "pendientes")} con la revisión vencida hace más de ${cuenta(c.escalamientoDias, "día", "días")}.`,
      })),
    );
    await tx`UPDATE revision_anual_procesos SET escalado_en = ${c.ahora} WHERE id = ${marca.id}`;
    hecho.escalados = 1;
  }
  return hecho;
}

/** La pasada de la campaña vencida; `avisados` y `escalados` cuentan procesos. */
export async function revisionVencida(c: ContextoVencimientos): Promise<Resultado> {
  const [r] = await c.sql`SELECT id, anio, vence_en FROM revisiones_anuales WHERE estado = 'abierta' AND vence_en < ${c.ahora}`;
  if (!r) return NADA;
  const plazo = estadoPlazo(new Date(r.vence_en as string), c.ahora, zonaHoraria());
  if (plazo.estado !== "vencido") return NADA;
  const revision: Revision = { id: Number(r.id), anio: Number(r.anio), vencidaHace: plazo.dias };
  const candidatos = await pendientesPorProceso(c.sql, revision.id, c.sql`(rap.aviso_vencido_en IS NULL OR rap.escalado_en IS NULL)`);

  const total = { ...NADA };
  for (const p of candidatos) {
    if (p.pendientes === 0) continue;
    try {
      const h = await enTransaccion(c.sql, (tx) => revisarProceso(tx, revision, p.procesoId, c));
      total.avisados += h.avisados;
      total.escalados += h.escalados;
    } catch (err) {
      console.error(`No se pudo revisar la revisión anual vencida del proceso ${p.procesoId}:`, err);
    }
  }
  return total;
}
