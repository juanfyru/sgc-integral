/**
 * La campaña de la revisión anual (spec 13C §9.1): abrirla con la foto de los documentos vigentes y sus decisiones
 * automáticas, prorrogarla y leerla. Las abre y las prorroga el Admin SGC (`revision_anual.gestionar`); hay a lo sumo
 * una abierta (índice único parcial) y una por año.
 */
import { obtenerSql } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { avisarA } from "@/db/consultas/avisos-vencimiento";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import { enTransaccion, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { requerirPermiso } from "@/lib/permisos";
import { cuenta } from "@/lib/plural";
import { fechaEnZona, fechaLimite } from "@/lib/tramites/plazos";
import { sumarMeses, textoFecha } from "@/lib/vigencia/plazo";
import { ErrorVigencia, type Decision } from "@/lib/vigencia/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { columnasDeVigencia } from "../fragmentos";
import {
  PENDIENTE,
  REVISION_NO_EXISTE,
  YA_ABIERTA,
  YA_CERRADA,
  leerRevisiones,
  pendientesPorProceso,
  type Opciones,
  type ProrrogaGuardada,
  type Revision,
} from "./comun";
import { responsablesDelProceso } from "./vencidos";

const ENLACE = "/vigencia/revision-anual";

function enteroEntre(valor: number, minimo: number, maximo: number, mensaje: string): number {
  if (!Number.isInteger(valor) || valor < minimo || valor > maximo) throw new ErrorVigencia(mensaje);
  return valor;
}

/** La revisión abierta, si la hay. */
export async function revisionAbierta(opciones?: Opciones): Promise<Revision | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const [r] = await leerRevisiones(sql, sql`ra.estado = 'abierta'`);
  return r ?? null;
}

/** Todas las revisiones, de la más reciente a la más antigua. */
export async function listarRevisiones(opciones?: Opciones): Promise<Revision[]> {
  const sql = opciones?.sql ?? obtenerSql();
  return leerRevisiones(sql, sql`true`);
}

/** Una revisión sin cifras ni nombres: lo que la pestaña lista a cualquiera que la ve, también al líder. */
export type RevisionEnIndice = { id: number; anio: number; estado: "abierta" | "cerrada"; cerradaEn: Date | null };

/**
 * Las revisiones de la más reciente a la más antigua, sin cifras ni nombres (resolución 3 de la Tarea 11): lo que cada
 * persona ve de una sale de `obtenerRevision`, recortado a su alcance.
 */
export async function indiceDeRevisiones(opciones?: Opciones): Promise<RevisionEnIndice[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`SELECT id, anio, estado, cerrada_en FROM revisiones_anuales ORDER BY anio DESC, id DESC`;
  return filas.map((f) => ({
    id: Number(f.id),
    anio: Number(f.anio),
    estado: f.estado as RevisionEnIndice["estado"],
    cerradaEn: f.cerrada_en === null ? null : new Date(f.cerrada_en as string),
  }));
}

/** Los choques de los índices únicos: la carrera entre dos aperturas, o un año que ya tuvo su revisión. */
function traducirChoque(anio: number) {
  return (err: { constraint_name?: string }): never => {
    if (err.constraint_name === "revisiones_una_abierta_idx") throw new ErrorVigencia(YA_ABIERTA);
    if (err.constraint_name === "revisiones_anuales_anio_unique") throw new ErrorVigencia(`Ya hay una revisión anual de ${anio}`);
    throw err;
  };
}

/**
 * Abre la revisión anual de `anio` (del año anterior al siguiente al de hoy), con su plazo en días y la ventana de
 * «revisado recientemente» en meses. En una transacción toma la foto: todo documento con versión vigente de un proceso
 * activo, sin filtro de acceso (la foto es institucional), con una fila por proceso propietario y su conteo, y las
 * decisiones automáticas: «en trámite» con el trámite que tenga abierto, «revisado recientemente» si su fecha base cae
 * dentro de la ventana, y pendiente el resto. Avisa a los líderes de esos procesos, a Gerencia y a Control Interno; las
 * tareas son calculadas.
 */
export async function abrirRevision(
  sesion: SesionFlujo,
  d: { anio: number; plazoDias: number; ventanaMeses: number },
  opciones?: Opciones,
): Promise<{ revisionId: number }> {
  requerirPermiso(sesion, "revision_anual.gestionar");
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const zona = zonaHoraria();
  const actual = Number(fechaEnZona(ahora, zona).slice(0, 4));
  const anio = enteroEntre(d.anio, actual - 1, actual + 1, `El año debe estar entre ${actual - 1} y ${actual + 1}`);
  const plazoDias = enteroEntre(d.plazoDias, 7, 365, "El plazo debe estar entre 7 y 365 días");
  const ventanaMeses = enteroEntre(d.ventanaMeses, 0, 24, "La ventana debe estar entre 0 y 24 meses");
  const config = await obtenerConfigDocumental({ sql });

  return enTransaccion(sql, async (tx) => {
    const [abierta] = await tx`SELECT 1 FROM revisiones_anuales WHERE estado = 'abierta'`;
    if (abierta) throw new ErrorVigencia(YA_ABIERTA);
    const venceEn = fechaLimite(ahora, plazoDias, zona);
    const [fila] = await tx`INSERT INTO revisiones_anuales (anio, plazo_dias, ventana_meses, abierta_por, abierta_en, vence_en)
      VALUES (${anio}, ${plazoDias}, ${ventanaMeses}, ${sesion.usuarioId}, ${ahora}, ${venceEn})
      RETURNING id`.catch(traducirChoque(anio));
    const revisionId = Number(fila.id);

    const foto = await columnasDeVigencia(tx, tx`p.activo`, ahora, { config });
    const desde = fechaEnZona(sumarMeses(ahora, -ventanaMeses, zona), zona);
    const decisiones = foto.map((f) => {
      const reciente = f.ultimaRevision !== null && fechaEnZona(f.ultimaRevision.fecha, zona) >= desde;
      const decision: Decision = f.tramite ? "en_tramite" : reciente ? "reciente" : PENDIENTE;
      return { documentoId: f.documentoId, versionId: f.version.id, decision, tramiteId: f.tramite?.id ?? 0, procesoId: f.proceso.id };
    });
    if (decisiones.length > 0) {
      await tx`INSERT INTO revision_anual_decisiones (revision_id, documento_id, version_id, decision, tramite_id, creado_en, actualizado_en)
        SELECT ${revisionId}, x.documento_id, x.version_id, x.decision, NULLIF(x.tramite_id, 0), ${ahora}, ${ahora}
        FROM unnest(
          ${tx.array(decisiones.map((x) => x.documentoId))}::bigint[],
          ${tx.array(decisiones.map((x) => x.versionId))}::bigint[],
          ${tx.array(decisiones.map((x) => x.decision))}::text[],
          ${tx.array(decisiones.map((x) => x.tramiteId))}::bigint[]
        ) AS x(documento_id, version_id, decision, tramite_id)`;
    }
    const porProceso = new Map<number, number>();
    for (const x of decisiones) porProceso.set(x.procesoId, (porProceso.get(x.procesoId) ?? 0) + 1);
    const procesoIds = [...porProceso.keys()];
    if (procesoIds.length > 0) {
      await tx`INSERT INTO revision_anual_procesos (revision_id, proceso_id, documentos)
        SELECT ${revisionId}, x.proceso_id, x.documentos
        FROM unnest(${tx.array(procesoIds)}::bigint[], ${tx.array(procesoIds.map((p) => porProceso.get(p)!))}::int[]) AS x(proceso_id, documentos)`;
    }

    const cuantas = (decision: Decision) => decisiones.filter((x) => x.decision === decision).length;
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "revision_anual_abierta",
      entidad: "revision_anual",
      entidadId: revisionId,
      detalle: {
        anio,
        plazoDias,
        ventanaMeses,
        venceEn,
        documentos: decisiones.length,
        procesos: procesoIds.length,
        recientes: cuantas("reciente"),
        enTramite: cuantas("en_tramite"),
      },
    });

    // A los líderes de los procesos de la foto, a Gerencia y a Control Interno; nadie se avisa a sí mismo.
    const lideres = await tx`SELECT DISTINCT u.id FROM usuario_procesos up
      JOIN usuarios u ON u.id = up.usuario_id AND u.activo AND u.rol = 'lider_proceso'
      JOIN procesos p ON p.id = up.proceso_id AND p.activo
      WHERE up.proceso_id = ANY(${procesoIds})`;
    const direccion = await tx`SELECT id FROM usuarios WHERE activo AND rol IN ('gerencia', 'control_interno')`;
    const cuerpos = new Map<number, string>();
    for (const u of direccion) cuerpos.set(Number(u.id), "Siga el avance de la revisión en Vigencia.");
    for (const u of lideres) cuerpos.set(Number(u.id), "La tarea de cada proceso suyo está en «Mis tareas».");
    cuerpos.delete(sesion.usuarioId);
    if (cuerpos.size > 0) {
      await avisarA(
        tx,
        {
          tipo: "revision.abierta",
          titulo: `Se abrió la revisión anual ${anio}: decida sobre los documentos de sus procesos antes del ${textoFecha(venceEn, zona)}`,
          enlace: ENLACE,
          entidad: "revision_anual",
          entidadId: revisionId,
        },
        [...cuerpos].map(([usuarioId, cuerpo]) => ({ usuarioId, cuerpo })),
      );
    }
    return { revisionId };
  });
}

/**
 * Prorroga la revisión abierta `dias` días (de 1 a 365) con un motivo: mueve `vence_en` (desde el vencimiento o, si ya
 * pasó, desde hoy), guarda la prórroga, reinicia
 * las marcas de aviso de sus procesos (la pasada de vencimientos vuelve a avisar si vence otra vez) y avisa a quienes
 * tienen pendientes, con sus procesos y el conteo: el motivo no va en el aviso.
 */
export async function prorrogarRevision(
  sesion: SesionFlujo,
  d: { revisionId: number; dias: number; motivo: string },
  opciones?: Opciones,
): Promise<void> {
  requerirPermiso(sesion, "revision_anual.gestionar");
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const zona = zonaHoraria();
  const dias = enteroEntre(d.dias, 1, 365, "La prórroga debe ser de 1 a 365 días");
  const motivo = d.motivo.trim();
  if (motivo.length < 5) throw new ErrorVigencia("El motivo debe tener al menos 5 caracteres");
  if (motivo.length > 500) throw new ErrorVigencia("El motivo no puede pasar de 500 caracteres");

  await enTransaccion(sql, async (tx) => {
    const [r] = await tx`SELECT anio, estado, vence_en FROM revisiones_anuales WHERE id = ${d.revisionId} FOR UPDATE`;
    if (!r) throw new ErrorVigencia(REVISION_NO_EXISTE);
    if (r.estado !== "abierta") throw new ErrorVigencia(YA_CERRADA);
    const antes = new Date(r.vence_en as string);
    // Ya vencida, cuenta desde hoy: el plazo nuevo nunca queda en el pasado.
    const despues = fechaLimite(antes.getTime() > ahora.getTime() ? antes : ahora, dias, zona);
    const [quien] = await tx`SELECT nombre FROM usuarios WHERE id = ${sesion.usuarioId}`;
    const prorroga: ProrrogaGuardada = { fecha: ahora.toISOString(), dias, motivo, porId: sesion.usuarioId, por: quien.nombre as string };
    await tx`UPDATE revisiones_anuales SET vence_en = ${despues}, prorrogas = prorrogas || ${tx.json([prorroga])}::jsonb
      WHERE id = ${d.revisionId}`;
    await tx`UPDATE revision_anual_procesos SET aviso_vencido_en = NULL, escalado_en = NULL WHERE revision_id = ${d.revisionId}`;
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "revision_anual_prorrogada",
      entidad: "revision_anual",
      entidadId: d.revisionId,
      detalle: { anio: Number(r.anio), dias, motivo, venceAntes: antes, venceDespues: despues },
    });

    const porPersona = new Map<number, string[]>();
    for (const p of await pendientesPorProceso(tx, d.revisionId)) {
      if (p.pendientes === 0) continue;
      for (const usuarioId of await responsablesDelProceso(tx, p.procesoId)) {
        porPersona.set(usuarioId, [...(porPersona.get(usuarioId) ?? []), `${p.nombre} (${cuenta(p.pendientes, "pendiente", "pendientes")})`]);
      }
    }
    porPersona.delete(sesion.usuarioId);
    if (porPersona.size > 0) {
      await avisarA(
        tx,
        {
          tipo: "revision.prorrogada",
          titulo: `La revisión anual ${Number(r.anio)} se prorrogó hasta el ${textoFecha(despues, zona)}`,
          enlace: ENLACE,
          entidad: "revision_anual",
          entidadId: d.revisionId,
        },
        [...porPersona].map(([usuarioId, procesos]) => ({ usuarioId, cuerpo: `Le falta: ${procesos.join(", ")}.` })),
      );
    }
  });
}
