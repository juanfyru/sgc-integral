/**
 * La respuesta al ente desde el plan de mejoramiento (Fase 15B, anexo §3.8; spec 15 §13.4). Un hallazgo que está en un plan se
 * responde desde el plan, no desde su página (`planQueResponde`, que la respuesta de la 15A consulta): el Admin SGC registra una
 * vez la fecha de envío y el oficio, un archivo del plan, para todos los hallazgos del plan que esperan respuesta («listos»,
 * `esperaRespuesta`, la definición única), y confirma la lista que vio. Los que todavía no están listos se responden con otro
 * registro: un plan puede tener varias respuestas. Lo lee solo quien ve todo (`respuestaDelPlan`): el oficio es un solo documento
 * para todos los procesos del plan (§3.6 y §3.7).
 *
 * Orden de candados (§3.4): el plan `FOR UPDATE` primero (quien mueve un hallazgo de plan, sube o quita un archivo del plan lo toma
 * antes también) y después cada hallazgo `FOR UPDATE`, por id ascendente. Ningún camino toma el plan después de un hallazgo; la
 * respuesta de la 15A toma solo el hallazgo y mira su plan sin candado.
 *
 * Módulo liviano: no importa `lectura.ts` ni `planes-lectura.ts` (los dos lo importan) ni `registro.ts`, que lo importa: los
 * mensajes de la fecha de envío viven aquí y `registro.ts` los reexporta.
 */
import type { Row } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { enTransaccion, type OpcionesFlujo, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { puedeAbrirArchivoDeMejora, type SujetoVisibilidad } from "@/lib/alcance";
import { EsquemaRespuestaDelPlan } from "@/lib/esquemas/mejoramiento";
import { etiquetaDeEstado } from "@/lib/mejoramiento/estados";
import { fechaLargaDeDia } from "@/lib/mejoramiento/formato";
import { ORIGENES } from "@/lib/mejoramiento/origenes";
import { ENTIDAD_PLAN, LISTOS_CAMBIARON, OFICIO_AJENO_AL_PLAN, OFICIO_DE_OTRA, PLAN_ANULADO, SIN_LISTOS } from "@/lib/mejoramiento/planes";
import { ErrorMejora, TERMINALES, type EstadoHallazgo, type HallazgoBase, type ResultadoCierre } from "@/lib/mejoramiento/tipos";
import { puede, requerirPermiso } from "@/lib/permisos";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { ENTIDAD_HALLAZGO } from "./avisos";
import { bloquearHallazgo, dejarEvento } from "./flujo";
import { legible } from "./legible";
import { bloquearPlan, dejarEventoDePlan } from "./planes";

export const ENVIO_FUTURO = "La fecha de envío no puede ser futura";
export const envioAntesDeAprobar = (dia: string) =>
  `La fecha de envío no puede ser anterior a la aprobación del plan, el ${fechaLargaDeDia(dia)}`;

const EXTERNOS = ORIGENES.filter((o) => o.externo).map((o) => o.clave);

const esId = (n: number) => Number.isSafeInteger(n) && n > 0;

/**
 * «Espera respuesta» (anexo §3.8), la definición única, para el SQL sobre el hallazgo `h`: de origen externo, sin terminar, sin
 * respuesta registrada y con el plan de acción de su ronda en vigor aprobado. La usan la página del plan, el acto y la tarea.
 */
export function esperaRespuesta(sql: Cliente) {
  return sql`(h.origen IN ${sql([...EXTERNOS])} AND h.estado NOT IN ${sql([...TERMINALES])} AND h.respuesta_ente_en IS NULL
    AND EXISTS (SELECT 1 FROM mejora_rondas er_r WHERE er_r.hallazgo_id = h.id AND er_r.numero = h.ronda
      AND er_r.estado_plan = 'aprobado' AND er_r.aprobado_en IS NOT NULL))`;
}

/** Un hallazgo del plan que espera respuesta, con el día (en la zona de la instalación) en que se aprobó su plan de acción en vigor. */
type Listo = { id: number; codigo: string; fechaLimiteEnte: string | null; aprobadoEl: string };

/** Los hallazgos del plan que esperan respuesta, por id. */
async function listosDe(sql: Cliente, planId: number, zona: string): Promise<Listo[]> {
  const filas = await sql`SELECT h.id, h.codigo, to_char(h.fecha_limite_ente, 'YYYY-MM-DD') AS limite, r.aprobado_en
    FROM mejora_clasificacion c
    JOIN mejora_hallazgos h ON h.id = c.hallazgo_id
    JOIN mejora_rondas r ON r.hallazgo_id = h.id AND r.numero = h.ronda
    WHERE c.plan_id = ${planId} AND ${esperaRespuesta(sql)}
    ORDER BY h.id`;
  return filas.map((f) => ({
    id: Number(f.id),
    codigo: f.codigo as string,
    fechaLimiteEnte: (f.limite as string | null) ?? null,
    aprobadoEl: fechaEnZona(f.aprobado_en as Date, zona),
  }));
}

/** El día más reciente de una lista de días `AAAA-MM-DD`, o nulo; y el más próximo. */
const elMayor = (dias: readonly string[]) => (dias.length === 0 ? null : dias.reduce((a, b) => (b > a ? b : a)));
const elMenor = (dias: readonly string[]) => (dias.length === 0 ? null : dias.reduce((a, b) => (b < a ? b : a)));

/**
 * El bloque «Respuesta al ente» de la página del plan (maqueta 2). `listos`, los que esperan respuesta; `faltan`, los externos sin
 * terminar ni responder a los que les falta aprobar su plan de acción, con la etiqueta de su estado; `respuestas`, las registradas
 * desde el plan, con los hallazgos que incluyó cada una (también los que salieron del plan después); `vence`, la fecha del ente más
 * próxima de los listos; `desde`, el día de la aprobación más reciente de los listos (la respuesta no se envió antes); `oficios`,
 * los archivos del plan que pueden ser el oficio (los que no son ya el de otra respuesta). Las fechas, `AAAA-MM-DD`.
 */
export type RespuestaDelPlan = {
  listos: Array<{ id: number; codigo: string; fechaLimiteEnte: string | null }>;
  faltan: Array<{ id: number; codigo: string; estado: string }>;
  respuestas: Array<{ id: number; enviadaEn: string; por: string; oficio: { id: number; nombre: string }; hallazgos: string[] }>;
  vence: string | null;
  desde: string | null;
  oficios: Array<{ id: number; nombre: string }>;
};

/**
 * Lo que la página del plan muestra de la respuesta al ente (anexo §3.8), o nulo: sin `mejora.ver_todo` (quien no ve todo no lee
 * el bloque, §3.6), en un plan que no existe y en uno que no tiene ningún hallazgo de origen externo ni una respuesta registrada
 * (las respuestas ya registradas se siguen mostrando aunque sus hallazgos hayan salido del plan: son evidencia).
 */
export async function respuestaDelPlan(
  sesion: SesionFlujo,
  planId: number,
  opciones?: { sql?: Cliente; ahora?: Date },
): Promise<RespuestaDelPlan | null> {
  if (!puede(sesion, "mejora.ver_todo") || !esId(planId)) return null;
  const sql = opciones?.sql ?? obtenerSql();
  const zona = zonaHoraria();
  const [externos, respuestas] = await Promise.all([
    sql`SELECT h.id, h.codigo, h.estado, h.resultado_cierre, h.correccion_requerida, h.respuesta_ente_en IS NOT NULL AS respondido
      FROM mejora_clasificacion c JOIN mejora_hallazgos h ON h.id = c.hallazgo_id
      WHERE c.plan_id = ${planId} AND h.origen IN ${sql([...EXTERNOS])}
      ORDER BY h.id`,
    sql`SELECT r.id, to_char(r.enviada_en, 'YYYY-MM-DD') AS enviada, u.nombre AS por, a.id AS archivo_id, a.nombre_original,
        coalesce((SELECT array_agg(h.codigo ORDER BY h.id) FROM mejora_plan_respuesta_hallazgos rh
          JOIN mejora_hallazgos h ON h.id = rh.hallazgo_id WHERE rh.respuesta_id = r.id), '{}') AS hallazgos
      FROM mejora_plan_respuestas r
      JOIN usuarios u ON u.id = r.registrada_por
      JOIN archivos a ON a.id = r.archivo_id
      WHERE r.plan_id = ${planId}
      ORDER BY r.id`,
  ]);
  if (externos.length === 0 && respuestas.length === 0) return null;
  const [listos, oficios] = await Promise.all([
    listosDe(sql, planId, zona),
    sql`SELECT a.id, a.nombre_original FROM archivos a
      WHERE a.contexto = 'mejora_plan' AND a.contexto_id = ${planId} AND a.version_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM mejora_plan_respuestas r WHERE r.archivo_id = a.id)
      ORDER BY a.id`,
  ]);
  const esListo = new Set(listos.map((l) => l.id));
  const faltan = externos
    .filter((f) => !esListo.has(Number(f.id)) && f.respondido !== true && !TERMINALES.includes(f.estado as EstadoHallazgo))
    .map((f) => ({
      id: Number(f.id),
      codigo: f.codigo as string,
      estado: etiquetaDeEstado({
        estado: f.estado as EstadoHallazgo,
        resultadoCierre: (f.resultado_cierre as ResultadoCierre | null) ?? null,
        correccionRequerida: (f.correccion_requerida as boolean | null) ?? null,
      }),
    }));
  return {
    listos: listos.map((l) => ({ id: l.id, codigo: l.codigo, fechaLimiteEnte: l.fechaLimiteEnte })),
    faltan,
    respuestas: respuestas.map((r: Row) => ({
      id: Number(r.id),
      enviadaEn: r.enviada as string,
      por: r.por as string,
      oficio: { id: Number(r.archivo_id), nombre: r.nombre_original as string },
      hallazgos: r.hallazgos as string[],
    })),
    vence: elMenor(listos.flatMap((l) => (l.fechaLimiteEnte ? [l.fechaLimiteEnte] : []))),
    desde: elMayor(listos.map((l) => l.aprobadoEl)),
    oficios: oficios.map((a) => ({ id: Number(a.id), nombre: a.nombre_original as string })),
  };
}

/** El plan en que está el hallazgo, o nulo: si tiene uno, su respuesta al ente se registra desde él (anexo §3.8). Sin candado. */
export async function planQueResponde(sql: Cliente, hallazgoId: number): Promise<{ id: number; codigo: string } | null> {
  if (!esId(hallazgoId)) return null;
  const [f] = await sql`SELECT p.id, p.codigo FROM mejora_clasificacion c JOIN mejora_planes p ON p.id = c.plan_id
    WHERE c.hallazgo_id = ${hallazgoId}`;
  return f ? { id: Number(f.id), codigo: f.codigo as string } : null;
}

/** El oficio de una respuesta registrada desde un plan, con lo que la lista de archivos pinta. */
export type OficioDelPlan = { id: number; nombre: string; mime: string; tamano: number };

/**
 * Si la respuesta al ente del hallazgo se registró desde un plan, el oficio para quien puede abrirlo (los archivos del plan: quien
 * ve todo, §3.7) y nulo para los demás: el líder lee en su hallazgo la fecha y quién la registró, no el oficio, que es un solo
 * documento para todos los procesos del plan (§3.8). Nulo del todo si no se registró desde un plan. La respuesta se conserva
 * aunque el hallazgo salga del plan después.
 */
export async function respuestaDesdeUnPlan(
  sql: Cliente,
  sesion: SujetoVisibilidad,
  hallazgoId: number,
): Promise<{ oficio: OficioDelPlan | null } | null> {
  const [f] = await sql`SELECT r.plan_id, a.id, a.nombre_original, a.mime, a.tamano_bytes
    FROM mejora_plan_respuesta_hallazgos rh
    JOIN mejora_plan_respuestas r ON r.id = rh.respuesta_id
    JOIN archivos a ON a.id = r.archivo_id
    WHERE rh.hallazgo_id = ${hallazgoId}
    ORDER BY r.id DESC LIMIT 1`;
  if (!f) return null;
  const abre = await puedeAbrirArchivoDeMejora({ contexto: "mejora_plan", contextoId: Number(f.plan_id) }, sesion, { sql });
  return {
    oficio: abre ? { id: Number(f.id), nombre: f.nombre_original as string, mime: f.mime as string, tamano: Number(f.tamano_bytes) } : null,
  };
}

/** ¿Los mismos ids? Los dos ya ordenados de menor a mayor. */
const mismos = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * El Admin SGC registra la respuesta al ente desde el plan (anexo §3.8): la fecha de envío, ni futura ni anterior al día en que se
 * aprobó el más reciente de los planes de acción incluidos, y el oficio, un archivo del plan que no es ya el oficio de otra
 * respuesta. Vale para todos los hallazgos listos, que tienen que ser los que la persona vio (`vistos`): si con todo bloqueado la
 * lista no es la misma, no se registra nada (`LISTOS_CAMBIARON`, Review Focus 4). En una transacción: la respuesta y los hallazgos
 * que incluye; en cada hallazgo, lo que escribe la respuesta de la 15A (la fecha y quién, su evento `respuesta_ente` y su
 * bitácora), con el plan; y el evento `respuesta` del plan con su bitácora. El id del oficio no va al evento del hallazgo (lo lee
 * su líder, que no abre los archivos del plan); a la bitácora, sí. No avisa: no le pasa el turno a nadie.
 */
export async function registrarRespuestaDelPlan(
  sesion: SesionFlujo,
  d: { planId: number; enviadaEn: string; oficioId: number; vistos: number[] },
  opciones?: OpcionesFlujo,
): Promise<void> {
  requerirPermiso(sesion, "mejora.gestionar");
  const leido = EsquemaRespuestaDelPlan.safeParse(d);
  if (!leido.success) throw new ErrorMejora(leido.error.issues[0].message);
  const r = leido.data;
  const ahora = opciones?.ahora ?? new Date();
  const zona = zonaHoraria();
  return legible(
    enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
      const plan = await bloquearPlan(tx, r.planId);
      if (plan.anulado) throw new ErrorMejora(PLAN_ANULADO);
      // Con el plan bloqueado nadie le pone ni le saca un hallazgo: todo camino que lo hace toma antes este candado.
      const delPlan = new Set((await tx`SELECT hallazgo_id FROM mejora_clasificacion WHERE plan_id = ${plan.id}`).map((f) => Number(f.hallazgo_id)));
      if (r.vistos.some((id) => !delPlan.has(id))) throw new ErrorMejora(LISTOS_CAMBIARON);
      const bloqueados = new Map<number, HallazgoBase>();
      for (const id of r.vistos) bloqueados.set(id, await bloquearHallazgo(tx, id));
      // Con los vistos bloqueados, otra vez: uno que dejó de estar listo, o uno que se volvió listo y no se vio, cambia la lista.
      const listos = await listosDe(tx, plan.id, zona);
      if (listos.length === 0) throw new ErrorMejora(SIN_LISTOS);
      if (!mismos(listos.map((l) => l.id), r.vistos)) throw new ErrorMejora(LISTOS_CAMBIARON);
      if (r.enviadaEn > fechaEnZona(ahora, zona)) throw new ErrorMejora(ENVIO_FUTURO);
      const desde = elMayor(listos.map((l) => l.aprobadoEl)) as string;
      if (r.enviadaEn < desde) throw new ErrorMejora(envioAntesDeAprobar(desde));
      const [oficio] = await tx`SELECT id, nombre_original FROM archivos
        WHERE id = ${r.oficioId} AND contexto = 'mejora_plan' AND contexto_id = ${plan.id} AND version_id IS NULL FOR KEY SHARE`;
      if (!oficio) throw new ErrorMejora(OFICIO_AJENO_AL_PLAN);
      const [deOtra] = await tx`SELECT 1 FROM mejora_plan_respuestas WHERE archivo_id = ${r.oficioId}`;
      if (deOtra) throw new ErrorMejora(OFICIO_DE_OTRA);

      const [respuesta] = await tx`INSERT INTO mejora_plan_respuestas (plan_id, enviada_en, archivo_id, registrada_por, registrada_en)
        VALUES (${plan.id}, ${r.enviadaEn}, ${r.oficioId}, ${sesion.usuarioId}, ${ahora}) RETURNING id`;
      const respuestaId = Number(respuesta.id);
      const ids = listos.map((l) => l.id);
      await tx`INSERT INTO mejora_plan_respuesta_hallazgos (respuesta_id, hallazgo_id)
        SELECT ${respuestaId}, unnest(${tx.array(ids)}::bigint[])`;
      for (const l of listos) {
        const h = bloqueados.get(l.id) as HallazgoBase;
        await tx`UPDATE mejora_hallazgos SET respuesta_ente_en = ${r.enviadaEn}, respuesta_ente_por = ${sesion.usuarioId} WHERE id = ${h.id}`;
        await dejarEvento(tx, {
          hallazgoId: h.id,
          ronda: h.ronda,
          tipo: "respuesta_ente",
          detalle: { enviadaEn: r.enviadaEn, planId: plan.id, respuestaId },
          usuarioId: sesion.usuarioId,
          ocurrioEn: ahora,
        });
        await registrarAuditoria(tx, {
          usuarioId: sesion.usuarioId,
          accion: "mejora_respuesta_ente",
          entidad: ENTIDAD_HALLAZGO,
          entidadId: h.id,
          detalle: { codigo: h.codigo, enviadaEn: r.enviadaEn, oficioId: r.oficioId, planId: plan.id, plan: plan.codigo },
        });
      }
      const codigos = listos.map((l) => l.codigo);
      await dejarEventoDePlan(tx, {
        planId: plan.id,
        tipo: "respuesta",
        detalle: {
          respuestaId,
          enviadaEn: r.enviadaEn,
          oficioId: r.oficioId,
          oficio: oficio.nombre_original as string,
          hallazgoIds: ids,
          hallazgos: codigos,
        },
        usuarioId: sesion.usuarioId,
        ahora,
      });
      await registrarAuditoria(tx, {
        usuarioId: sesion.usuarioId,
        accion: "mejora_plan_respuesta",
        entidad: ENTIDAD_PLAN,
        entidadId: plan.id,
        detalle: { codigo: plan.codigo, nombre: plan.nombre, enviadaEn: r.enviadaEn, oficioId: r.oficioId, hallazgos: codigos },
      });
    }),
  );
}
