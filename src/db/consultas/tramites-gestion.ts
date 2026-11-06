/**
 * Corrección de los datos de control mientras nadie ha aprobado (spec 13A §8.6). No es una
 * transición: el trámite sigue en su etapa y su ronda, por eso no pasa por `transicionar`. Vive
 * fuera de `flujo/`, junto a `revision.ts`, porque registra su evento con `tramites-flujo.ts`, que
 * un archivo de `flujo/` no puede importar.
 */
import type { TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { sugerirCodigo } from "@/db/consultas/codigos";
import { rotuloDeTramite, tipoDeDocumento, tramiteVisto } from "@/db/consultas/tramites";
import { registrarEvento } from "@/db/consultas/tramites-flujo";
import type { DatosCorreccion } from "@/lib/esquemas/tramites";
import { puede } from "@/lib/permisos";
import type { Etapa } from "@/lib/tramites/tipos";
import { errorDeCodigoRepetido, exigirDesignacion, exigirFormatoDeCodigo } from "./flujo/aceptacion";
import { CAMBIO_MIENTRAS, ErrorTramite, enTransaccion, type FilaTramite, type SesionFlujo } from "./flujo/contrato";
import type { Esperado } from "./revision";

const ETAPAS_CORREGIBLES: readonly Etapa[] = ["elaboracion", "revision"];

/** Solo lo que cambió, para la evidencia. null si nada cambió. */
type Correccion = { antes: Record<string, unknown>; despues: Record<string, unknown> } | null;

/** En una modificación el documento vigente no cambia: el título nuevo espera en el trámite hasta publicar. */
async function corregirModificacion(tx: TransactionSql, tramite: FilaTramite, datos: DatosCorreccion, ahora: Date): Promise<Correccion> {
  if (datos.codigo !== undefined || datos.tipoDocumentoId !== undefined)
    throw new ErrorTramite("En una modificación solo se corrige el título");
  const [documento] = await tx`SELECT titulo FROM documentos WHERE id = ${tramite.documentoId}`;
  const anterior: string = tramite.tituloPropuesto ?? documento.titulo;
  if (datos.titulo === undefined || datos.titulo === anterior) return null;
  await tx`UPDATE tramites SET titulo_propuesto = ${datos.titulo === documento.titulo ? null : datos.titulo}, actualizado_en = ${ahora}
    WHERE id = ${tramite.id}`;
  return { antes: { titulo: anterior }, despues: { titulo: datos.titulo } };
}

/** En una creación nadie ve todavía el documento: se corrige en él. Otro tipo puede pedir otro aprobador. */
async function corregirCreacion(tx: TransactionSql, tramite: FilaTramite, datos: DatosCorreccion, ahora: Date): Promise<Correccion> {
  const [documento] = await tx`SELECT d.titulo, d.codigo, d.tipo_id, t.nombre AS tipo
    FROM documentos d JOIN tipos_documento t ON t.id = d.tipo_id
    WHERE d.id = ${tramite.documentoId}`;
  const titulo = datos.titulo !== undefined && datos.titulo !== documento.titulo ? datos.titulo : null;
  const codigo = datos.codigo !== undefined && datos.codigo !== documento.codigo ? datos.codigo : null;
  const tipoNuevo = datos.tipoDocumentoId !== undefined && datos.tipoDocumentoId !== Number(documento.tipo_id) ? datos.tipoDocumentoId : null;
  if (titulo === null && codigo === null && tipoNuevo === null) return null;

  const tipoId = tipoNuevo ?? Number(documento.tipo_id);
  let nombreDelTipo: string = documento.tipo;
  if (tipoNuevo !== null) {
    const tipo = await tipoDeDocumento(tipoNuevo, { sql: tx });
    if (!tipo?.activo) throw new ErrorTramite("El tipo de documento no existe o está inactivo");
    const { elaboradorId, revisorId, aprobadorId } = tramite;
    await exigirDesignacion(
      tx,
      tramite,
      "crear",
      tipo.autoridad,
      { elaboradorId: elaboradorId ?? undefined, revisorId: revisorId ?? undefined, aprobadorId: aprobadorId ?? undefined },
      null,
    );
    nombreDelTipo = tipo.nombre;
  }
  const destino = { procesoId: tramite.procesoId, tipoDocumentoId: tipoId };
  if (codigo !== null) await exigirFormatoDeCodigo(tx, codigo, destino);

  const repetido = await tx
    .savepoint((s) => s`UPDATE documentos SET
        titulo = ${titulo ?? documento.titulo}, codigo = ${codigo ?? documento.codigo}, tipo_id = ${tipoId}, actualizado_en = ${ahora}
      WHERE id = ${tramite.documentoId}`)
    .then(
      () => false,
      (err: { constraint_name?: string }) => {
        if (err.constraint_name === "documentos_codigo_unique") return true;
        throw err;
      },
    );
  if (repetido) throw errorDeCodigoRepetido(await sugerirCodigo(destino, { sql: tx }));
  await tx`UPDATE tramites SET tipo_documento_id = ${tipoId}, actualizado_en = ${ahora} WHERE id = ${tramite.id}`;

  return {
    antes: {
      ...(titulo === null ? {} : { titulo: documento.titulo }),
      ...(codigo === null ? {} : { codigo: documento.codigo }),
      ...(tipoNuevo === null ? {} : { tipo: documento.tipo }),
    },
    despues: {
      ...(titulo === null ? {} : { titulo }),
      ...(codigo === null ? {} : { codigo }),
      ...(tipoNuevo === null ? {} : { tipo: nombreDelTipo }),
    },
  };
}

/** Corrige título, código o tipo. `esperado` es lo que vio la persona: si el trámite cambió, no se escribe. */
export async function corregirDatosDeControl(
  tramiteId: number,
  sesion: SesionFlujo,
  datos: DatosCorreccion,
  esperado: Esperado,
  opciones?: { sql?: Cliente; ahora?: Date },
): Promise<void> {
  if (!puede(sesion, "tramites.gestionar")) throw new ErrorTramite("Sin permiso para esta acción");
  const ahora = opciones?.ahora ?? new Date();
  await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    const visto = await tramiteVisto(tx, tramiteId, sesion, true);
    if (!visto?.visible) throw new ErrorTramite("El trámite no existe");
    const { tramite } = visto;
    if (tramite.etapa !== esperado.etapa || tramite.ronda !== esperado.ronda) throw new ErrorTramite(CAMBIO_MIENTRAS);
    if (!ETAPAS_CORREGIBLES.includes(tramite.etapa)) throw new ErrorTramite("Desde la aprobación los datos del documento quedan fijos");

    const correccion =
      tramite.tipo === "crear" ? await corregirCreacion(tx, tramite, datos, ahora) : await corregirModificacion(tx, tramite, datos, ahora);
    if (!correccion) throw new ErrorTramite("No hay cambios que guardar");

    await registrarEvento(tx, { tramiteId, tipo: "corregir_datos", usuarioId: sesion.usuarioId, ronda: tramite.ronda, detalle: correccion, ahora });
    const { codigo } = await rotuloDeTramite(tx, tramite);
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "tramite_corregir_datos",
      entidad: "tramite",
      entidadId: tramiteId,
      detalle: { numero: tramite.numero, codigo, documentoId: tramite.documentoId, ronda: tramite.ronda, ...correccion },
    });
  });
}
