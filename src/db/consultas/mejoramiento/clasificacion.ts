/**
 * La clasificación de un hallazgo (Fase 15B, anexo §3.3, §3.4 y §10.4): su plan y su objetivo, en `mejora_clasificacion`, al
 * lado del hallazgo y fuera del trigger del hallazgo terminado (F15B-DC3). Ponerlos, cambiarlos o quitarlos no escribe en
 * `mejora_hallazgos`, en sus hijas ni en `mejora_eventos` (que no admite filas de un hallazgo terminado): un hallazgo cerrado
 * entra, sale y cambia de plan, y su objetivo se pone, se cambia o se quita. El rastro de un plan va a su historial
 * (`mejora_plan_eventos`, con los motivos) y a la bitácora (entidad `mejora_plan`, sin los motivos); el del objetivo, a la
 * bitácora (`mejora_objetivo`, entidad `mejora_hallazgo`, con el id y el enunciado de antes y de después). Es clasificación, no
 * un turno: no avisa a nadie (F15B-DC7). La fila se borra cuando quedan nulos el plan y el objetivo.
 *
 * Orden de candados: el plan `FOR UPDATE` (o los dos de un cambio, por id ascendente), después cada hallazgo `FOR UPDATE` por id
 * ascendente (`bloquearHallazgo`: su fila no se escribe; el candado pone en fila a quienes clasifican el mismo hallazgo) y al
 * final su fila de clasificación (también `ponerObjetivo`, con el plan que tenga el hallazgo). Ningún camino toma un plan después
 * de un hallazgo. El registro y la carga de un hallazgo dentro de un plan tampoco: su transacción empieza por
 * `bloquearPlanDelRegistro`, antes que el hallazgo de origen, el anterior de una reincidencia, el reporte o el consecutivo, y el
 * candado del plan que toma después `clasificarAlNacer` es el mismo, ya suyo. No importa `lectura.ts`.
 */
import type { TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { enTransaccion, type OpcionesFlujo, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import {
  EsquemaCambiarDePlan,
  EsquemaObjetivoDelHallazgo,
  EsquemaPonerEnPlan,
  EsquemaSacarDelPlan,
} from "@/lib/esquemas/mejoramiento";
import {
  cuentaParaElPlan,
  ENTIDAD_PLAN,
  NO_CUENTA_PARA_PLAN,
  NO_ESTA_EN_UN_PLAN,
  PLAN_ANULADO,
  YA_EN_UN_PLAN,
} from "@/lib/mejoramiento/planes";
import { ErrorMejora, type HallazgoBase } from "@/lib/mejoramiento/tipos";
import { YA_CAMBIO } from "@/lib/mejoramiento/transiciones";
import { puede, requerirPermiso } from "@/lib/permisos";
import { ENTIDAD_HALLAZGO } from "./avisos";
import { bloquearHallazgo } from "./flujo";
import { legible } from "./legible";
import { bloquearPlan, bloquearPlanAbierto, dejarEventoDePlan, objetivoActivo, type PlanBase } from "./planes";

type Fila = { planId: number | null; objetivoId: number | null };

const idONulo = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/** La fila de clasificación del hallazgo sin candado: solo para saber qué plan bloquear antes de releerla. */
async function filaSinCandado(tx: TransactionSql, hallazgoId: number): Promise<Fila | null> {
  const [f] = await tx`SELECT plan_id, objetivo_id FROM mejora_clasificacion WHERE hallazgo_id = ${hallazgoId}`;
  return f ? { planId: idONulo(f.plan_id), objetivoId: idONulo(f.objetivo_id) } : null;
}

/** La fila de clasificación `FOR UPDATE`, con el plan y el hallazgo ya bloqueados. */
async function filaBloqueada(tx: TransactionSql, hallazgoId: number): Promise<Fila | null> {
  const [f] = await tx`SELECT plan_id, objetivo_id FROM mejora_clasificacion WHERE hallazgo_id = ${hallazgoId} FOR UPDATE`;
  return f ? { planId: idONulo(f.plan_id), objetivoId: idONulo(f.objetivo_id) } : null;
}

/** Escribe la clasificación: la fila nueva o la de siempre, o ninguna si quedan nulos los dos (el `CHECK` lo exige). */
async function guardarFila(tx: TransactionSql, sesion: SesionFlujo, hallazgoId: number, f: Fila, ahora: Date): Promise<void> {
  if (f.planId === null && f.objetivoId === null) {
    await tx`DELETE FROM mejora_clasificacion WHERE hallazgo_id = ${hallazgoId}`;
    return;
  }
  await tx`INSERT INTO mejora_clasificacion (hallazgo_id, plan_id, objetivo_id, actualizado_por, actualizado_en)
    VALUES (${hallazgoId}, ${f.planId}, ${f.objetivoId}, ${sesion.usuarioId}, ${ahora})
    ON CONFLICT (hallazgo_id) DO UPDATE SET plan_id = EXCLUDED.plan_id, objetivo_id = EXCLUDED.objetivo_id,
      actualizado_por = EXCLUDED.actualizado_por, actualizado_en = EXCLUDED.actualizado_en`;
}

/** El id y el enunciado de un objetivo, para el antes y el después del rastro; nulo sin objetivo. */
async function objetivoEnRastro(tx: TransactionSql, id: number | null): Promise<{ id: number; enunciado: string } | null> {
  if (id === null) return null;
  const [f] = await tx`SELECT enunciado FROM objetivos WHERE id = ${id}`;
  return { id, enunciado: (f?.enunciado as string | undefined) ?? "" };
}

/** El rastro del objetivo de un hallazgo en la bitácora: quién, cuándo, el antes y el después (anexo §3.3). */
async function dejarRastroDelObjetivo(
  tx: TransactionSql,
  sesion: SesionFlujo,
  h: { id: number; codigo: string },
  antes: number | null,
  despues: number | null,
  extra: Record<string, unknown>,
): Promise<void> {
  await registrarAuditoria(tx, {
    usuarioId: sesion.usuarioId,
    accion: "mejora_objetivo",
    entidad: ENTIDAD_HALLAZGO,
    entidadId: h.id,
    detalle: { codigo: h.codigo, antes: await objetivoEnRastro(tx, antes), despues: await objetivoEnRastro(tx, despues), ...extra },
  });
}

/** La bitácora de un hallazgo que entra a un plan: el código y el nombre del plan, el id y el código del hallazgo. */
async function auditarEntrada(tx: TransactionSql, sesion: SesionFlujo, plan: PlanBase, h: { id: number; codigo: string }, extra: Record<string, unknown>) {
  await registrarAuditoria(tx, {
    usuarioId: sesion.usuarioId,
    accion: "mejora_plan_entra",
    entidad: ENTIDAD_PLAN,
    entidadId: plan.id,
    detalle: { codigo: plan.codigo, nombre: plan.nombre, hallazgoId: h.id, hallazgo: h.codigo, ...extra },
  });
}

/** La bitácora de un hallazgo que sale de un plan, sin el motivo (queda en el historial del plan). */
async function auditarSalida(tx: TransactionSql, sesion: SesionFlujo, plan: PlanBase, h: { id: number; codigo: string }, extra: Record<string, unknown>) {
  await registrarAuditoria(tx, {
    usuarioId: sesion.usuarioId,
    accion: "mejora_plan_sale",
    entidad: ENTIDAD_PLAN,
    entidadId: plan.id,
    detalle: { codigo: plan.codigo, nombre: plan.nombre, hallazgoId: h.id, hallazgo: h.codigo, ...extra },
  });
}

/**
 * El objetivo que el plan propone al hallazgo que entra (spec 15 §17.7): el del plan, si lo tiene y sigue activo. Un objetivo
 * desactivado no se elige de nuevo (anexo §10.4): el plan lo conserva, pero ya no lo propone.
 */
async function objetivoQuePropone(tx: TransactionSql, plan: PlanBase): Promise<number | null> {
  if (plan.objetivoId === null) return null;
  const [f] = await tx`SELECT activo FROM objetivos WHERE id = ${plan.objetivoId} FOR KEY SHARE`;
  return f?.activo === true ? plan.objetivoId : null;
}

/** El hallazgo que entra a un plan: existe (`NO_EXISTE`) y cuenta (`NO_CUENTA_PARA_PLAN`). */
async function hallazgoQueEntra(tx: TransactionSql, id: number): Promise<HallazgoBase> {
  const h = await bloquearHallazgo(tx, id);
  if (!cuentaParaElPlan(h.estado)) throw new ErrorMejora(NO_CUENTA_PARA_PLAN);
  return h;
}

/**
 * Pone uno o varios hallazgos en un plan (anexo §3.4, caminos 2 y 3), en una transacción y con un evento por hallazgo: en
 * cualquier estado, también cerrado; uno anulado o rechazado, no; uno que ya está en un plan, tampoco. Con `conObjetivo` (por
 * omisión, sí) el que no tiene objetivo recibe el del plan; el que ya tiene uno lo conserva. Todo o nada.
 */
export async function ponerEnPlan(
  sesion: SesionFlujo,
  d: { planId: number; hallazgoIds: number[]; conObjetivo?: boolean },
  opciones?: OpcionesFlujo,
): Promise<void> {
  requerirPermiso(sesion, "mejora.planes");
  const leido = EsquemaPonerEnPlan.safeParse(d);
  if (!leido.success) throw new ErrorMejora(leido.error.issues[0].message);
  const v = leido.data;
  const ahora = opciones?.ahora ?? new Date();
  return legible(
    enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
      const plan = await bloquearPlan(tx, v.planId);
      if (plan.anulado) throw new ErrorMejora(PLAN_ANULADO);
      const propuesto = v.conObjetivo ? await objetivoQuePropone(tx, plan) : null;
      // Por id ascendente (el esquema los ordena): dos que añaden los mismos hallazgos no se cruzan.
      for (const id of v.hallazgoIds) {
        const h = await hallazgoQueEntra(tx, id);
        const fila = await filaBloqueada(tx, h.id);
        if (fila !== null && fila.planId !== null) throw new ErrorMejora(YA_EN_UN_PLAN);
        const suyo = fila?.objetivoId ?? null;
        const recibe = suyo === null && propuesto !== null;
        await guardarFila(tx, sesion, h.id, { planId: plan.id, objetivoId: suyo ?? propuesto }, ahora);
        await dejarEventoDePlan(tx, {
          planId: plan.id,
          hallazgoId: h.id,
          tipo: "entra",
          detalle: { hallazgo: h.codigo, ...(recibe ? { objetivoId: propuesto } : {}) },
          usuarioId: sesion.usuarioId,
          ahora,
        });
        await auditarEntrada(tx, sesion, plan, h, {});
        if (recibe) await dejarRastroDelObjetivo(tx, sesion, h, null, propuesto, { plan: plan.codigo });
      }
    }),
  );
}

/** El plan en que está el hallazgo, leído sin candado; si no está en ninguno, `NO_ESTA_EN_UN_PLAN` (o `NO_EXISTE`). */
async function planActualDe(tx: TransactionSql, hallazgoId: number): Promise<number> {
  const fila = await filaSinCandado(tx, hallazgoId);
  if (fila === null || fila.planId === null) {
    await bloquearHallazgo(tx, hallazgoId);
    throw new ErrorMejora(NO_ESTA_EN_UN_PLAN);
  }
  return fila.planId;
}

/**
 * Saca un hallazgo de su plan (anexo §3.4), con motivo: al historial del plan, no a la bitácora. En cualquier estado, también
 * anulado o rechazado (es como se vacía un plan para anularlo). Conserva su objetivo y la respuesta al ente que tuviera.
 */
export async function sacarDelPlan(sesion: SesionFlujo, d: { hallazgoId: number; motivo: string }, opciones?: OpcionesFlujo): Promise<void> {
  requerirPermiso(sesion, "mejora.planes");
  const leido = EsquemaSacarDelPlan.safeParse(d);
  if (!leido.success) throw new ErrorMejora(leido.error.issues[0].message);
  const r = leido.data;
  const ahora = opciones?.ahora ?? new Date();
  return legible(
    enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
      const plan = await bloquearPlan(tx, await planActualDe(tx, r.hallazgoId));
      const h = await bloquearHallazgo(tx, r.hallazgoId);
      const fila = await filaBloqueada(tx, h.id);
      // Entre la lectura sin candado y el candado del plan, otro lo pudo sacar o mover.
      if (fila?.planId !== plan.id) throw new ErrorMejora(YA_CAMBIO);
      await guardarFila(tx, sesion, h.id, { planId: null, objetivoId: fila.objetivoId }, ahora);
      await dejarEventoDePlan(tx, {
        planId: plan.id,
        hallazgoId: h.id,
        tipo: "sale",
        detalle: { hallazgo: h.codigo, motivo: r.motivo },
        usuarioId: sesion.usuarioId,
        ahora,
      });
      await auditarSalida(tx, sesion, plan, h, {});
    }),
  );
}

/**
 * Mueve un hallazgo de su plan a otro (anexo §3.4): salir de uno y entrar al otro en la misma transacción, con un motivo y un
 * evento en cada plan. El evento guarda el id del otro plan, no su código: quien lea el historial de uno puede no ver el otro.
 * Con `conObjetivo`, como al entrar.
 */
export async function cambiarDePlan(
  sesion: SesionFlujo,
  d: { hallazgoId: number; planId: number; motivo: string; conObjetivo?: boolean },
  opciones?: OpcionesFlujo,
): Promise<void> {
  requerirPermiso(sesion, "mejora.planes");
  const leido = EsquemaCambiarDePlan.safeParse(d);
  if (!leido.success) throw new ErrorMejora(leido.error.issues[0].message);
  const r = leido.data;
  const ahora = opciones?.ahora ?? new Date();
  return legible(
    enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
      const actual = await planActualDe(tx, r.hallazgoId);
      if (actual === r.planId) throw new ErrorMejora(YA_EN_UN_PLAN);
      const planes = new Map<number, PlanBase>();
      for (const id of [actual, r.planId].sort((a, b) => a - b)) planes.set(id, await bloquearPlan(tx, id));
      const origen = planes.get(actual)!;
      const destino = planes.get(r.planId)!;
      if (destino.anulado) throw new ErrorMejora(PLAN_ANULADO);
      const h = await hallazgoQueEntra(tx, r.hallazgoId);
      const fila = await filaBloqueada(tx, h.id);
      if (fila?.planId !== origen.id) throw new ErrorMejora(YA_CAMBIO);
      const propuesto = r.conObjetivo ? await objetivoQuePropone(tx, destino) : null;
      const recibe = fila.objetivoId === null && propuesto !== null;
      await guardarFila(tx, sesion, h.id, { planId: destino.id, objetivoId: fila.objetivoId ?? propuesto }, ahora);
      await dejarEventoDePlan(tx, {
        planId: origen.id,
        hallazgoId: h.id,
        tipo: "sale",
        detalle: { hallazgo: h.codigo, motivo: r.motivo, haciaPlanId: destino.id },
        usuarioId: sesion.usuarioId,
        ahora,
      });
      await dejarEventoDePlan(tx, {
        planId: destino.id,
        hallazgoId: h.id,
        tipo: "entra",
        detalle: { hallazgo: h.codigo, motivo: r.motivo, desdePlanId: origen.id, ...(recibe ? { objetivoId: propuesto } : {}) },
        usuarioId: sesion.usuarioId,
        ahora,
      });
      await auditarSalida(tx, sesion, origen, h, { hacia: destino.codigo });
      await auditarEntrada(tx, sesion, destino, h, { desde: origen.codigo });
      if (recibe) await dejarRastroDelObjetivo(tx, sesion, h, null, propuesto, { plan: destino.codigo });
    }),
  );
}

/**
 * Pone, cambia o quita (`null`) el objetivo de un hallazgo (anexo §10.4), en cualquier estado, también cerrado: es
 * clasificación. Un objetivo nuevo debe estar activo. Elegir el que ya tiene no escribe nada. Su rastro va a la bitácora.
 */
export async function ponerObjetivo(
  sesion: SesionFlujo,
  d: { hallazgoId: number; objetivoId: number | null },
  opciones?: OpcionesFlujo,
): Promise<void> {
  requerirPermiso(sesion, "mejora.planes");
  const leido = EsquemaObjetivoDelHallazgo.safeParse(d);
  if (!leido.success) throw new ErrorMejora(leido.error.issues[0].message);
  const r = leido.data;
  const ahora = opciones?.ahora ?? new Date();
  return legible(
    enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
      // El orden de todo camino que escribe una fila de clasificación: el plan del hallazgo, si lo tiene, antes que la fila.
      const leida = await filaSinCandado(tx, r.hallazgoId);
      const planId = leida?.planId ?? null;
      if (planId !== null) await bloquearPlan(tx, planId);
      const h = await bloquearHallazgo(tx, r.hallazgoId);
      const fila = await filaBloqueada(tx, h.id);
      // Entre la lectura sin candado y el candado del plan, otro lo pudo poner en un plan, sacar o mover.
      if ((fila?.planId ?? null) !== planId) throw new ErrorMejora(YA_CAMBIO);
      const antes = fila?.objetivoId ?? null;
      if (antes === r.objetivoId) return;
      if (r.objetivoId !== null) await objetivoActivo(tx, r.objetivoId);
      await guardarFila(tx, sesion, h.id, { planId, objetivoId: r.objetivoId }, ahora);
      await dejarRastroDelObjetivo(tx, sesion, h, antes, r.objetivoId, {});
    }),
  );
}

/**
 * El plan en que nacerá un hallazgo que se registra o se carga dentro de él (anexo §3.4, camino 1): si `planId` no es nulo, quien
 * registra tiene `mejora.planes` y el plan existe y no está anulado, lo toma `FOR UPDATE` y lo devuelve; si no, devuelve nulo, sin
 * tomar ningún candado y sin lanzar (el hallazgo nace sin plan y nadie dice por qué: el patrón de `?revision=`).
 *
 * **Es el primer candado de la transacción del registro y de la carga**, antes que cualquier otro (el `FOR KEY SHARE` del hallazgo
 * de origen y del anterior de una reincidencia, el reporte, el consecutivo): así el plan va antes que todo hallazgo, como en cada
 * camino que clasifica (§3.4), y el registro no se cruza con quien pone esos hallazgos en el mismo plan. Es la misma regla con que
 * `clasificarAlNacer` decide el plan: lo que este devuelve es el plan en que entrará el hallazgo.
 */
export async function bloquearPlanDelRegistro(tx: TransactionSql, sesion: SesionFlujo, planId: number | null): Promise<PlanBase | null> {
  if (planId === null || !puede(sesion, "mejora.planes")) return null;
  return bloquearPlanAbierto(tx, planId);
}

/**
 * La clasificación de un hallazgo que acaba de nacer (anexo §3.4, camino 1, y §10.4), dentro de la transacción de su registro
 * o de su carga y después de `nacerHallazgo`. El objetivo lo elige quien registra, si quiere: debe estar activo
 * (`OBJETIVO_INACTIVO`). El plan es el de `bloquearPlanDelRegistro`, con la misma regla; si no pasa, el hallazgo nace sin plan y
 * nadie dice por qué.
 *
 * Quien la llama con un `planId` debe haber llamado antes `bloquearPlanDelRegistro` con ese mismo plan, como primer candado de su
 * transacción: aquí se vuelve a pedir y la transacción ya lo tiene, así que no espera a nadie. Sin esa llamada previa, el plan se
 * tomaría después de los hallazgos que el registro ya bloqueó, al revés del orden de §3.4.
 */
export async function clasificarAlNacer(
  tx: TransactionSql,
  sesion: SesionFlujo,
  hallazgoId: number,
  d: { planId: number | null; objetivoId: number | null },
  ahora: Date,
): Promise<void> {
  if (d.objetivoId !== null) await objetivoActivo(tx, d.objetivoId);
  const plan = await bloquearPlanDelRegistro(tx, sesion, d.planId);
  if (!plan && d.objetivoId === null) return;
  const [f] = await tx`SELECT codigo FROM mejora_hallazgos WHERE id = ${hallazgoId}`;
  const h = { id: hallazgoId, codigo: f.codigo as string };
  await guardarFila(tx, sesion, h.id, { planId: plan?.id ?? null, objetivoId: d.objetivoId }, ahora);
  if (plan) {
    await dejarEventoDePlan(tx, {
      planId: plan.id,
      hallazgoId: h.id,
      tipo: "entra",
      detalle: { hallazgo: h.codigo, alRegistrar: true },
      usuarioId: sesion.usuarioId,
      ahora,
    });
    await auditarEntrada(tx, sesion, plan, h, { alRegistrar: true });
  }
  if (d.objetivoId !== null) await dejarRastroDelObjetivo(tx, sesion, h, null, d.objetivoId, { alRegistrar: true });
}

/** El plan y el objetivo de un hallazgo, con su código, su nombre y su enunciado; todo nulo si no tiene. */
export type Clasificacion = {
  planId: number | null;
  planCodigo: string | null;
  planNombre: string | null;
  objetivoId: number | null;
  objetivo: string | null;
};

const SIN_CLASIFICAR: Clasificacion = { planId: null, planCodigo: null, planNombre: null, objetivoId: null, objetivo: null };

/**
 * La clasificación de cada hallazgo pedido, en una consulta: cada id tiene su entrada, con todo nulo si no tiene plan ni
 * objetivo. No mira quién lee: quien llama ya decidió qué hallazgos ve y qué le muestra de su plan (quien lo ve solo por su
 * actividad lee el código y el nombre, sin enlace; F15B-DC9).
 */
export async function clasificacionDe(sql: Cliente, hallazgoIds: number[]): Promise<Map<number, Clasificacion>> {
  const ids = [...new Set(hallazgoIds.filter((id) => Number.isSafeInteger(id) && id > 0))];
  const mapa = new Map<number, Clasificacion>(ids.map((id) => [id, SIN_CLASIFICAR]));
  if (ids.length === 0) return mapa;
  const filas = await sql`SELECT c.hallazgo_id, c.plan_id, p.codigo, p.nombre, c.objetivo_id, o.enunciado
    FROM mejora_clasificacion c
    LEFT JOIN mejora_planes p ON p.id = c.plan_id
    LEFT JOIN objetivos o ON o.id = c.objetivo_id
    WHERE c.hallazgo_id = ANY(${ids}::bigint[])`;
  for (const f of filas) {
    mapa.set(Number(f.hallazgo_id), {
      planId: idONulo(f.plan_id),
      planCodigo: (f.codigo as string | null) ?? null,
      planNombre: (f.nombre as string | null) ?? null,
      objetivoId: idONulo(f.objetivo_id),
      objetivo: (f.enunciado as string | null) ?? null,
    });
  }
  return mapa;
}
