/**
 * El plan de mejoramiento (Fase 15B, anexo §3.1 y §3.2): crearlo, editarlo y anularlo, su candado y su historial. Un plan no
 * tiene recorrido ni firma y nunca se borra; anulado conserva su código y su historial. Editarlo no cambia ningún hallazgo: lo
 * que el plan propone se ofrece una vez, cuando el hallazgo entra (§3.4, `clasificacion.ts`).
 *
 * Toda escritura exige `mejora.planes`, va en una transacción (`legible` alrededor), toma el plan `FOR UPDATE` antes que
 * cualquier fila de clasificación y escribe a la hora de `opciones.ahora`. Al historial del plan (`mejora_plan_eventos`, de
 * solo inserción) va todo, también el objetivo escrito y los motivos; a la bitácora (entidad `mejora_plan`, con el id del
 * plan), el código y el nombre, nunca ese texto libre (§3.10, decisión 42 de la 15A). No avisa a nadie.
 *
 * Módulo liviano: no importa el motor (`flujo.ts`) ni los avisos, para que lo pueda llamar `archivos.ts`, que importa
 * `admin.ts` (`tests/mejora-ciclos.test.ts`).
 */
import type { Row, TransactionSql } from "postgres";
import { obtenerSql } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { enTransaccion, type OpcionesFlujo, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { EsquemaAnulacionDePlan, EsquemaEdicionDePlan, EsquemaPlan } from "@/lib/esquemas/mejoramiento";
import {
  codigoDePlan,
  ENTIDAD_PLAN,
  OBJETIVO_INACTIVO,
  PLAN_ANULADO,
  PLAN_CON_HALLAZGOS,
  PLAN_NO_EXISTE,
  SIN_CAMBIOS_EN_EL_PLAN,
} from "@/lib/mejoramiento/planes";
import { ErrorMejora, type Origen } from "@/lib/mejoramiento/tipos";
import { requerirPermiso } from "@/lib/permisos";
import { legible } from "./legible";

/** Lo que se escribe de un plan (anexo §3.1). Las fechas, `AAAA-MM-DD`; la vigencia, por omisión, el año de la fecha del evento. */
export type DatosDePlan = {
  nombre: string;
  origen: Origen;
  fechaEvento: string;
  vigencia: number;
  objetivoTexto?: string | null;
  objetivoId?: number | null;
  fechaLimiteEnte?: string | null;
};

/** El plan tal como lo lee su candado: las fechas, `AAAA-MM-DD`. */
export type PlanBase = {
  id: number;
  codigo: string;
  nombre: string;
  origen: Origen;
  vigencia: number;
  fechaEvento: string;
  objetivoTexto: string | null;
  objetivoId: number | null;
  fechaLimiteEnte: string | null;
  anulado: boolean;
};

function aPlan(f: Row): PlanBase {
  return {
    id: Number(f.id),
    codigo: f.codigo as string,
    nombre: f.nombre as string,
    origen: f.origen as Origen,
    vigencia: Number(f.vigencia),
    fechaEvento: f.fecha_evento as string,
    objetivoTexto: (f.objetivo_texto as string | null) ?? null,
    objetivoId: f.objetivo_id === null ? null : Number(f.objetivo_id),
    fechaLimiteEnte: (f.fecha_limite_ente as string | null) ?? null,
    anulado: f.anulado === true,
  };
}

/** El plan `FOR UPDATE`, o nulo si no existe (también un id que no es un entero positivo). */
export async function bloquearPlanSiExiste(tx: TransactionSql, id: number): Promise<PlanBase | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const [f] = await tx`SELECT id, codigo, nombre, origen, vigencia, to_char(fecha_evento, 'YYYY-MM-DD') AS fecha_evento,
      objetivo_texto, objetivo_id, to_char(fecha_limite_ente, 'YYYY-MM-DD') AS fecha_limite_ente, anulado_en IS NOT NULL AS anulado
    FROM mejora_planes WHERE id = ${id} FOR UPDATE`;
  return f ? aPlan(f) : null;
}

/**
 * El plan `FOR UPDATE` si existe y no está anulado; si no, nulo y sin candado: uno anulado ni se bloquea. Si otro lo está
 * anulando, espera su candado y, anulado ya, no lo devuelve (PostgreSQL vuelve a mirar el `WHERE` en la fila nueva).
 */
export async function bloquearPlanAbierto(tx: TransactionSql, id: number): Promise<PlanBase | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const [f] = await tx`SELECT id, codigo, nombre, origen, vigencia, to_char(fecha_evento, 'YYYY-MM-DD') AS fecha_evento,
      objetivo_texto, objetivo_id, to_char(fecha_limite_ente, 'YYYY-MM-DD') AS fecha_limite_ente, anulado_en IS NOT NULL AS anulado
    FROM mejora_planes WHERE id = ${id} AND anulado_en IS NULL FOR UPDATE`;
  return f ? aPlan(f) : null;
}

/**
 * El primer candado de todo camino que escribe en un plan o en la clasificación de sus hallazgos: el plan `FOR UPDATE`. Anular
 * un plan y añadirle un hallazgo a la vez van en fila. Lanza `PLAN_NO_EXISTE`.
 */
export async function bloquearPlan(tx: TransactionSql, id: number): Promise<PlanBase> {
  const plan = await bloquearPlanSiExiste(tx, id);
  if (!plan) throw new ErrorMejora(PLAN_NO_EXISTE);
  return plan;
}

/**
 * El objetivo del maestro, activo: un objetivo se elige solo mientras está activo; el que ya lo tiene lo conserva aunque se
 * desactive (anexo §10.4). `FOR KEY SHARE`: no se borra mientras se cita. Uno que no existe se dice igual que uno inactivo.
 */
export async function objetivoActivo(tx: TransactionSql, id: number): Promise<{ id: number; enunciado: string }> {
  const [f] = await tx`SELECT id, enunciado, activo FROM objetivos WHERE id = ${id} FOR KEY SHARE`;
  if (!f || f.activo !== true) throw new ErrorMejora(OBJETIVO_INACTIVO);
  return { id: Number(f.id), enunciado: f.enunciado as string };
}

/** Una línea del historial del plan (solo inserción). `hallazgoId`, cuando el evento es de un hallazgo. */
export async function dejarEventoDePlan(
  tx: TransactionSql,
  e: { planId: number; hallazgoId?: number | null; tipo: string; detalle?: Record<string, unknown>; usuarioId: number; ahora: Date },
): Promise<void> {
  await tx`INSERT INTO mejora_plan_eventos (plan_id, hallazgo_id, tipo, detalle, usuario_id, creado_en)
    VALUES (${e.planId}, ${e.hallazgoId ?? null}, ${e.tipo}, ${tx.json((e.detalle ?? {}) as never)}, ${e.usuarioId}, ${e.ahora})`;
}

/**
 * El consecutivo de la vigencia, dentro de la transacción del plan, como `tomarCodigo` de los hallazgos: sin huecos (una
 * transacción revertida no lo quema, como sí lo haría una secuencia) y sin repetirse (el `ON CONFLICT` serializa a dos planes de
 * la misma vigencia). El de un plan anulado no se reutiliza: el contador nunca baja.
 */
async function tomarConsecutivo(tx: TransactionSql, vigencia: number): Promise<number> {
  const [f] = await tx`INSERT INTO mejora_plan_consecutivos (vigencia, ultimo) VALUES (${vigencia}, 1)
    ON CONFLICT (vigencia) DO UPDATE SET ultimo = mejora_plan_consecutivos.ultimo + 1
    RETURNING ultimo`;
  return Number(f.ultimo);
}

/** Crea un plan con su código `PM-AAAA-NN` (anexo §3.1), su evento `creado` y su bitácora. */
export async function crearPlan(sesion: SesionFlujo, d: DatosDePlan, opciones?: OpcionesFlujo): Promise<{ id: number; codigo: string }> {
  requerirPermiso(sesion, "mejora.planes");
  const leido = EsquemaPlan.safeParse(d);
  if (!leido.success) throw new ErrorMejora(leido.error.issues[0].message);
  const v = leido.data;
  const ahora = opciones?.ahora ?? new Date();
  return legible(
    enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
      if (v.objetivoId !== null) await objetivoActivo(tx, v.objetivoId);
      const consecutivo = await tomarConsecutivo(tx, v.vigencia);
      const codigo = codigoDePlan(v.vigencia, consecutivo);
      const [p] = await tx`INSERT INTO mejora_planes (codigo, vigencia, consecutivo, nombre, origen, fecha_evento, objetivo_texto,
          objetivo_id, fecha_limite_ente, creado_por, creado_en)
        VALUES (${codigo}, ${v.vigencia}, ${consecutivo}, ${v.nombre}, ${v.origen}, ${v.fechaEvento}, ${v.objetivoTexto},
          ${v.objetivoId}, ${v.fechaLimiteEnte}, ${sesion.usuarioId}, ${ahora})
        RETURNING id`;
      const id = Number(p.id);
      await dejarEventoDePlan(tx, {
        planId: id,
        tipo: "creado",
        detalle: {
          nombre: v.nombre,
          origen: v.origen,
          fechaEvento: v.fechaEvento,
          vigencia: v.vigencia,
          objetivoTexto: v.objetivoTexto,
          objetivoId: v.objetivoId,
          fechaLimiteEnte: v.fechaLimiteEnte,
        },
        usuarioId: sesion.usuarioId,
        ahora,
      });
      await registrarAuditoria(tx, {
        usuarioId: sesion.usuarioId,
        accion: "mejora_plan_crear",
        entidad: ENTIDAD_PLAN,
        entidadId: id,
        detalle: { codigo, nombre: v.nombre, origen: v.origen, vigencia: v.vigencia },
      });
      return { id, codigo };
    }),
  );
}

/** Lo que se edita de un plan, en el orden en que el evento y la bitácora lo nombran. */
const CAMPOS_DEL_PLAN = ["nombre", "origen", "fechaEvento", "objetivoTexto", "objetivoId", "fechaLimiteEnte"] as const;
type CampoDelPlan = (typeof CAMPOS_DEL_PLAN)[number];

/**
 * Edita todo menos el código y la vigencia (anexo §3.2): el evento `editado` guarda el antes y el después de lo que cambió; la
 * bitácora, los nombres de los campos. No cambia ningún hallazgo del plan. Un objetivo nuevo debe estar activo; el que ya tenía
 * se conserva aunque se haya desactivado.
 */
export async function editarPlan(
  sesion: SesionFlujo,
  id: number,
  d: Omit<DatosDePlan, "vigencia">,
  opciones?: OpcionesFlujo,
): Promise<void> {
  requerirPermiso(sesion, "mejora.planes");
  const leido = EsquemaEdicionDePlan.safeParse(d);
  if (!leido.success) throw new ErrorMejora(leido.error.issues[0].message);
  const v = leido.data;
  const ahora = opciones?.ahora ?? new Date();
  return legible(
    enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
      const plan = await bloquearPlan(tx, id);
      if (plan.anulado) throw new ErrorMejora(PLAN_ANULADO);
      if (v.objetivoId !== null && v.objetivoId !== plan.objetivoId) await objetivoActivo(tx, v.objetivoId);
      const antes: Partial<Record<CampoDelPlan, string | number | null>> = {};
      const despues: Partial<Record<CampoDelPlan, string | number | null>> = {};
      for (const k of CAMPOS_DEL_PLAN) {
        if (plan[k] === v[k]) continue;
        antes[k] = plan[k];
        despues[k] = v[k];
      }
      if (Object.keys(antes).length === 0) throw new ErrorMejora(SIN_CAMBIOS_EN_EL_PLAN);
      await tx`UPDATE mejora_planes SET nombre = ${v.nombre}, origen = ${v.origen}, fecha_evento = ${v.fechaEvento},
          objetivo_texto = ${v.objetivoTexto}, objetivo_id = ${v.objetivoId}, fecha_limite_ente = ${v.fechaLimiteEnte}
        WHERE id = ${plan.id}`;
      await dejarEventoDePlan(tx, { planId: plan.id, tipo: "editado", detalle: { antes, despues }, usuarioId: sesion.usuarioId, ahora });
      await registrarAuditoria(tx, {
        usuarioId: sesion.usuarioId,
        accion: "mejora_plan_editar",
        entidad: ENTIDAD_PLAN,
        entidadId: plan.id,
        detalle: { codigo: plan.codigo, nombre: v.nombre, campos: Object.keys(antes) },
      });
    }),
  );
}

/**
 * Anula un plan (anexo §3.2, F15B-DC5): con motivo y solo si en ese momento no tiene ningún hallazgo, tampoco uno anulado o
 * rechazado que se quedó en él (se vacía primero). Desde entonces no recibe hallazgos, no se edita y no admite archivos.
 */
export async function anularPlan(sesion: SesionFlujo, d: { planId: number; motivo: string }, opciones?: OpcionesFlujo): Promise<void> {
  requerirPermiso(sesion, "mejora.planes");
  const leido = EsquemaAnulacionDePlan.safeParse(d);
  if (!leido.success) throw new ErrorMejora(leido.error.issues[0].message);
  const r = leido.data;
  const ahora = opciones?.ahora ?? new Date();
  return legible(
    enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
      const plan = await bloquearPlan(tx, r.planId);
      if (plan.anulado) throw new ErrorMejora(PLAN_ANULADO);
      // Con el plan bloqueado nadie le pone un hallazgo a la vez: todo camino que lo hace toma antes este candado.
      const [conHallazgo] = await tx`SELECT 1 FROM mejora_clasificacion WHERE plan_id = ${plan.id} LIMIT 1`;
      if (conHallazgo) throw new ErrorMejora(PLAN_CON_HALLAZGOS);
      await tx`UPDATE mejora_planes SET anulado_en = ${ahora}, anulado_por = ${sesion.usuarioId}, anulado_motivo = ${r.motivo}
        WHERE id = ${plan.id}`;
      await dejarEventoDePlan(tx, { planId: plan.id, tipo: "anulado", detalle: { motivo: r.motivo }, usuarioId: sesion.usuarioId, ahora });
      await registrarAuditoria(tx, {
        usuarioId: sesion.usuarioId,
        accion: "mejora_plan_anular",
        entidad: ENTIDAD_PLAN,
        entidadId: plan.id,
        detalle: { codigo: plan.codigo, nombre: plan.nombre },
      });
    }),
  );
}
