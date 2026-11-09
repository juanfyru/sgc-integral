/** La verificación de vigencia y el retiro de un externo (spec 13C §8.4 y §8.5). */
import type { TransactionSql } from "postgres";
import { obtenerSql } from "@/db/cliente";
import { anularVigenteEn, registrarAuditoria } from "@/db/consultas/admin";
import { avisarEliminacion } from "@/db/consultas/distribucion/acuses";
import { enTransaccion, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { crearNotificacion } from "@/db/consultas/notificaciones";
import { adminsActivos, lideresDeProceso } from "@/db/consultas/tramites";
import { alcanceProcesos, puedeGestionarExterno } from "@/lib/alcance";
import { ErrorPermiso, puede } from "@/lib/permisos";
import { ErrorVigencia, RESULTADOS_VERIFICACION, type ResultadoVerificacion } from "@/lib/vigencia/tipos";
import {
  RETIRADO,
  SIN_VIGENTE,
  acotado,
  bloquear,
  exigirVerificacion,
  gestionable,
  leerSituacion,
  opcionalAcotado,
  type Opciones,
  type Situacion,
} from "./comun";
import { NO_EXISTE } from "../comun";

/**
 * El retiro dentro de una transacción ya abierta, con el externo bloqueado. Quien llama ya decidió quién puede:
 * quien lo gestiona, o la verificación que lo constató. Una edición pendiente se descarta: no hay qué adoptar.
 */
async function retirarEn(
  tx: TransactionSql,
  sesion: SesionFlujo,
  s: Situacion,
  d: { motivo: string; verificacionId: number | null },
  ahora: Date,
): Promise<void> {
  if (s.retirado) throw new ErrorVigencia(RETIRADO);
  if (!s.vigente) throw new ErrorVigencia(SIN_VIGENTE);
  if (s.borrador) await tx`UPDATE documento_versiones SET estado = 'descartado' WHERE id = ${s.borrador.id} AND estado = 'borrador'`;
  const { numero } = await anularVigenteEn(tx, s.documentoId, sesion.usuarioId, ahora, "retirado");
  await tx`UPDATE externos SET edicion_nueva_pendiente_desde = NULL, aviso_vencido_en = NULL, escalado_en = NULL
    WHERE documento_id = ${s.documentoId}`;
  await avisarEliminacion(tx, s.documentoId, s.codigo, s.titulo, ahora, sesion.usuarioId, {
    tipo: "externos.retirado",
    titulo: `${s.codigo} ${s.titulo} dejó de aplicar: el documento externo fue retirado`,
  });
  await registrarAuditoria(tx, {
    usuarioId: sesion.usuarioId,
    accion: "externo_retirado",
    entidad: "documento",
    entidadId: s.documentoId,
    detalle: { codigo: s.codigo, version: numero, motivo: d.motivo, verificacionId: d.verificacionId, borradorDescartado: s.borrador?.numero ?? null },
  });
}

/**
 * Registra la verificación de vigencia (spec 13C §8.4), sin clave: la hace el responsable técnico o quien gestiona
 * el externo. Sigue vigente: la próxima verificación cuenta desde hoy y se borra la marca de edición nueva pendiente.
 * Edición nueva: queda la marca pendiente y, si quien verifica no gestiona, se avisa a quienes pueden adoptarla.
 * Retirado: el externo se retira en la misma transacción.
 */
export async function registrarVerificacion(
  sesion: SesionFlujo,
  d: { documentoId: number; resultado: ResultadoVerificacion; fuente: string; nota: string | null; revisionAnualId?: number; impactoId?: number },
  opciones?: Opciones,
): Promise<{ verificacionId: number; retirado: boolean }> {
  if (!puede(sesion, "externos.verificar")) throw new ErrorPermiso();
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  if (!RESULTADOS_VERIFICACION.includes(d.resultado)) throw new ErrorVigencia("Elija el resultado de la verificación");
  const fuente = acotado(d.fuente, "La fuente consultada", 3, 300);
  const nota = opcionalAcotado(d.nota, "La nota", 1000);

  return enTransaccion(sql, async (tx) => {
    await bloquear(tx, d.documentoId);
    const s = await leerSituacion(tx, d.documentoId, sesion);
    if (!s) throw new ErrorVigencia(NO_EXISTE);
    const gestiona = puedeGestionarExterno(sesion, s.procesoId, await alcanceProcesos(sesion, { sql: tx }));
    if (s.responsableId !== sesion.usuarioId && !gestiona) throw new ErrorVigencia(NO_EXISTE);
    if (!s.vigente) throw new ErrorVigencia(SIN_VIGENTE);
    if (d.impactoId !== undefined) {
      const [impacto] = await tx`SELECT 1 FROM impactos_normativos
        WHERE id = ${d.impactoId} AND documento_id = ${s.documentoId} AND estado = 'pendiente'`;
      if (!impacto) throw new ErrorVigencia(NO_EXISTE);
    }
    if (d.revisionAnualId !== undefined) {
      const [revision] = await tx`SELECT 1 FROM revisiones_anuales WHERE id = ${d.revisionAnualId} AND estado = 'abierta'`;
      if (!revision) throw new ErrorVigencia("La revisión anual no está abierta");
    }

    const [fila] = await tx`INSERT INTO externo_verificaciones
        (documento_id, version_id, usuario_id, resultado, fuente_consultada, nota, revision_anual_id, impacto_id, creado_en)
      VALUES (${s.documentoId}, ${s.vigente.id}, ${sesion.usuarioId}, ${d.resultado}, ${fuente}, ${nota},
              ${d.revisionAnualId ?? null}, ${d.impactoId ?? null}, ${ahora})
      RETURNING id`;
    const verificacionId = Number(fila.id);

    if (d.resultado !== "retirado") {
      // Toda verificación reinicia el reloj (la fecha base es la última): los avisos vuelven a empezar (spec 13C §13.3).
      // La edición nueva pendiente conserva desde cuándo lo está: de ahí cuenta la tarea de adoptarla. Una «sigue
      // vigente» posterior la borra: manda la evidencia más reciente, y una falsa alarma no deja al externo en atención.
      const pendiente =
        d.resultado === "edicion_nueva"
          ? tx`COALESCE(edicion_nueva_pendiente_desde, ${ahora})`
          : tx`NULL`;
      await tx`UPDATE externos SET aviso_vencido_en = NULL, escalado_en = NULL, edicion_nueva_pendiente_desde = ${pendiente}
        WHERE documento_id = ${s.documentoId}`;
    }
    if (d.resultado === "edicion_nueva") {
      if (!gestiona) {
        const destinatarios = new Set([...(await lideresDeProceso(s.procesoId, { sql: tx })), ...(await adminsActivos({ sql: tx }))]);
        destinatarios.delete(sesion.usuarioId);
        for (const usuarioId of destinatarios) {
          await crearNotificacion(
            {
              usuarioId,
              tipo: "externos.edicion_nueva",
              titulo: `Adoptar la edición nueva de ${s.codigo} · ${s.titulo}`,
              enlace: `/vigencia/externos/${s.documentoId}`,
              entidad: "documento",
              entidadId: s.documentoId,
            },
            tx,
          );
        }
      }
    }
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "externo_verificado",
      entidad: "documento",
      entidadId: s.documentoId,
      detalle: {
        codigo: s.codigo,
        version: s.vigente.numero,
        verificacionId,
        resultado: d.resultado,
        fuente,
        nota,
        revisionAnualId: d.revisionAnualId ?? null,
        impactoId: d.impactoId ?? null,
      },
    });
    if (d.resultado === "retirado") {
      await retirarEn(tx, sesion, s, { motivo: nota ?? `Fuente consultada: ${fuente}`, verificacionId }, ahora);
    }
    return { verificacionId, retirado: d.resultado === "retirado" };
  });
}

/**
 * Retira un externo desde su página (spec 13C §8.5), con motivo y sin clave: anula la edición vigente con el motivo
 * `retirado` (las copias pasan a «por recoger», los acuses pendientes se superan) y avisa a la audiencia que dejó de
 * aplicar, sin tarea. Lo hace quien lo gestiona; desde una verificación, `registrarVerificacion`.
 */
export async function retirarExterno(
  sesion: SesionFlujo,
  d: { documentoId: number; motivo: string; verificacionId?: number },
  opciones?: Opciones,
): Promise<void> {
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const motivo = acotado(d.motivo, "El motivo", 5, 500);
  await enTransaccion(sql, async (tx) => {
    await bloquear(tx, d.documentoId);
    const s = await gestionable(tx, sesion, d.documentoId);
    if (d.verificacionId !== undefined) await exigirVerificacion(tx, s.documentoId, d.verificacionId, "retirado");
    await retirarEn(tx, sesion, s, { motivo, verificacionId: d.verificacionId ?? null }, ahora);
  });
}
