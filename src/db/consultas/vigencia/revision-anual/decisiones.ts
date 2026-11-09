/**
 * Lo que se decide desde la página de la campaña además de lo que registran los actos (`registro.ts`): enlazar el
 * trámite que el documento ya tiene abierto y confirmar el normograma del proceso (spec 13C §9.3 y §9.4). Lo hace quien
 * decide sobre el proceso (`puedeDecidirEn`); para los demás, el documento o el proceso no existen.
 */
import type { TransactionSql } from "postgres";
import { obtenerSql } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { avisarA } from "@/db/consultas/avisos-vencimiento";
import { enTransaccion, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { adminsActivos } from "@/db/consultas/tramites";
import { alcanceProcesos, filtroAcceso, puedeDecidirEn, puedeVerRevisionAnual } from "@/lib/alcance";
import { ETAPAS_ABIERTAS } from "@/lib/tramites/tipos";
import { ErrorVigencia } from "@/lib/vigencia/tipos";
import { NO_EXISTE } from "../comun";
import { PROCESO_NO_EXISTE, REVISION_NO_EXISTE, YA_CERRADA, type Opciones } from "./comun";
import { escribirDecision, filaDeDecision, quedoFija, type RevisionBloqueada } from "./registro";

/** La revisión, que debe estar abierta; a quien no la ve, no le existe. */
async function revisionParaDecidir(tx: TransactionSql, sesion: SesionFlujo, revisionId: number): Promise<RevisionBloqueada> {
  const [r] = await tx`SELECT id, anio, estado FROM revisiones_anuales WHERE id = ${revisionId} FOR SHARE`;
  if (!r || !puedeVerRevisionAnual(sesion)) throw new ErrorVigencia(REVISION_NO_EXISTE);
  if (r.estado !== "abierta") throw new ErrorVigencia(YA_CERRADA);
  return { id: Number(r.id), anio: Number(r.anio) };
}

/**
 * Enlaza el trámite que el documento ya tiene abierto como su decisión (spec 13C §9.3): «Actualizar» o «Eliminar» según
 * su tipo, en vez de abrir otro (`tramites_uno_abierto_idx`). Una decisión que ya quedó fija con otra cosa no cambia; la
 * «en trámite» de ese mismo trámite pasa a ser la decisión de quien lo enlaza.
 */
export async function enlazarTramiteExistente(
  sesion: SesionFlujo,
  d: { revisionId: number; documentoId: number; tramiteId: number },
  opciones?: Opciones,
): Promise<void> {
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  await enTransaccion(sql, async (tx) => {
    const revision = await revisionParaDecidir(tx, sesion, d.revisionId);
    const [doc] = await tx`SELECT COALESCE(dp.proceso_id, s.proceso_id) AS proceso_id, v.id AS version_id
      FROM documentos d
      JOIN documento_proceso dp ON dp.documento_id = d.id AND dp.es_principal
      LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
      LEFT JOIN documento_versiones v ON v.documento_id = d.id AND v.estado = 'vigente'
      WHERE d.id = ${d.documentoId} AND ${filtroAcceso(tx, sesion)}`;
    if (!doc || !puedeDecidirEn(sesion, Number(doc.proceso_id), await alcanceProcesos(sesion, { sql: tx }))) {
      throw new ErrorVigencia(NO_EXISTE);
    }
    const actual = await filaDeDecision(tx, revision.id, d.documentoId);
    if (!actual) throw new ErrorVigencia(NO_EXISTE);
    const [t] = await tx`SELECT id, tipo FROM tramites
      WHERE id = ${d.tramiteId} AND documento_id = ${d.documentoId} AND etapa = ANY(${ETAPAS_ABIERTAS})`;
    if (!t) throw new ErrorVigencia("El trámite no está abierto sobre este documento");
    const tramiteId = Number(t.id);
    if (quedoFija(actual) && actual.tramiteId !== tramiteId) throw new ErrorVigencia("La decisión de este documento ya quedó fija");
    await escribirDecision(tx, revision, actual, {
      documentoId: d.documentoId,
      versionId: doc.version_id === null ? 0 : Number(doc.version_id),
      decision: t.tipo === "eliminar" ? "eliminar" : "actualizar",
      usuarioId: sesion.usuarioId,
      ratificacionId: null,
      verificacionId: null,
      tramiteId,
      ahora,
    });
  });
}

/**
 * Confirma el normograma del proceso en la revisión (spec 13C §9.4): «sin novedad», con nota opcional, o «cambios», con
 * una nota de al menos 5 caracteres que llega a los Admin SGC para que actúen en el normograma. Se puede confirmar de
 * nuevo mientras la revisión está abierta, con antes y después en la bitácora.
 */
export async function confirmarNormograma(
  sesion: SesionFlujo,
  d: { revisionId: number; procesoId: number; resultado: "sin_novedad" | "cambios"; nota: string | null },
  opciones?: Opciones,
): Promise<void> {
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  if (d.resultado !== "sin_novedad" && d.resultado !== "cambios") throw new ErrorVigencia("Elija «Sin novedad» o «Marcar cambios»");
  const nota = d.nota?.trim() || null;
  if (d.resultado === "cambios" && (nota === null || nota.length < 5)) throw new ErrorVigencia("La nota debe tener al menos 5 caracteres");
  if (nota !== null && nota.length > 1000) throw new ErrorVigencia("La nota no puede pasar de 1000 caracteres");

  await enTransaccion(sql, async (tx) => {
    const revision = await revisionParaDecidir(tx, sesion, d.revisionId);
    if (!puedeDecidirEn(sesion, d.procesoId, await alcanceProcesos(sesion, { sql: tx }))) throw new ErrorVigencia(PROCESO_NO_EXISTE);
    const [fila] = await tx`SELECT rap.id, rap.normograma_resultado, rap.normograma_nota, p.nombre
      FROM revision_anual_procesos rap JOIN procesos p ON p.id = rap.proceso_id
      WHERE rap.revision_id = ${revision.id} AND rap.proceso_id = ${d.procesoId}
      FOR UPDATE OF rap`;
    if (!fila) throw new ErrorVigencia(PROCESO_NO_EXISTE);
    await tx`UPDATE revision_anual_procesos SET normograma_resultado = ${d.resultado}, normograma_nota = ${nota},
        normograma_por = ${sesion.usuarioId}, normograma_en = ${ahora}
      WHERE id = ${fila.id}`;
    const proceso = fila.nombre as string;
    if (d.resultado === "cambios") {
      const admins = (await adminsActivos({ sql: tx })).filter((u) => u !== sesion.usuarioId);
      if (admins.length > 0) {
        await avisarA(
          tx,
          {
            tipo: "revision.normograma_cambios",
            titulo: `${proceso}: el normograma tiene cambios por registrar (revisión anual ${revision.anio})`,
            enlace: `/vigencia/revision-anual?proceso=${d.procesoId}`,
            entidad: "revision_anual",
            entidadId: revision.id,
          },
          admins.map((usuarioId) => ({ usuarioId, cuerpo: nota! })),
        );
      }
    }
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "revision_anual_normograma",
      entidad: "revision_anual",
      entidadId: revision.id,
      detalle: {
        anio: revision.anio,
        procesoId: d.procesoId,
        proceso,
        resultado: d.resultado,
        nota,
        antes: fila.normograma_resultado === null ? null : { resultado: fila.normograma_resultado, nota: fila.normograma_nota ?? null },
      },
    });
  });
}
