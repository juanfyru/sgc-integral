/**
 * El borrador de un trámite: quién lee y escribe sus archivos, y su control de cambios (spec
 * 13A §6.5 y §9.1). Esta ruta sirve el borrador mientras el trámite está abierto; al cerrarse,
 * cada archivo se rige por el estado de su versión.
 */
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { tipoDeDocumento, tramiteVisto, type TipoDeDocumento } from "@/db/consultas/tramites";
import type { ArchivoServible } from "@/lib/servir-archivo";
import { ROLES_ARCHIVO, type RolArchivo } from "@/lib/subida";
import { evaluarTransicion } from "@/lib/tramites/transiciones";
import { esEtapaDeTrabajo } from "@/lib/tramites/tipos";
import { ErrorTramite, enTransaccion, type SesionFlujo } from "./flujo/contrato";

export type AutorizacionArchivo =
  | { ok: true; versionId: number; codigo: string; numero: number }
  | { ok: false; estado: 404 | 409 };

export type ArchivoDeBorrador = {
  id: number;
  rol: RolArchivo;
  nombreOriginal: string;
  mime: string;
  tamanoBytes: number;
  hashSha256: string;
};

export type ObservacionAbierta = { numero: number; texto: string; respuesta: string | null };

export type Borrador = {
  archivos: ArchivoDeBorrador[];
  controlCambios: string | null;
  plantilla: TipoDeDocumento["plantilla"];
  observaciones: ObservacionAbierta[];
};

const NO_ENCONTRADO: AutorizacionArchivo = { ok: false, estado: 404 };
const ROLES_DEL_BORRADOR: string[] = [...ROLES_ARCHIVO];

/** `escribir` distingue 404 de 409: el elaborador sabe que el trámite existe; los demás, no. */
export async function autorizarArchivoDeTramite(
  tramiteId: number,
  sesion: SesionFlujo,
  operacion: "leer" | "escribir",
  opciones?: { sql?: Cliente },
): Promise<AutorizacionArchivo> {
  const visto = await tramiteVisto(opciones?.sql ?? obtenerSql(), tramiteId, sesion);
  if (!visto?.visible) return NO_ENCONTRADO;
  const { tramite, codigo, versionNumero } = visto;
  if (!esEtapaDeTrabajo(tramite.etapa) || tramite.versionId === null || codigo === null || versionNumero === null)
    return NO_ENCONTRADO;
  if (operacion === "escribir") {
    if (tramite.elaboradorId !== sesion.usuarioId) return NO_ENCONTRADO;
    if (tramite.etapa !== "elaboracion") return { ok: false, estado: 409 };
  }
  return { ok: true, versionId: tramite.versionId, codigo, numero: versionNumero };
}

/** Solo el borrador: ni un acta, ni la versión vigente que una eliminación tiene por versión. */
export async function archivoDeTramite(
  tramiteId: number,
  archivoId: number,
  opciones?: { sql?: Cliente },
): Promise<ArchivoServible | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const [a] = await sql`SELECT a.ruta, a.mime, a.nombre_original
    FROM archivos a
    JOIN tramites t ON t.version_id = a.version_id
    JOIN documento_versiones v ON v.id = a.version_id AND v.estado = 'borrador'
    WHERE t.id = ${tramiteId} AND a.id = ${archivoId} AND a.rol = ANY(${ROLES_DEL_BORRADOR})`;
  return a ? { ruta: a.ruta, mime: a.mime, nombreOriginal: a.nombre_original } : null;
}

export async function guardarControlCambios(
  tramiteId: number,
  sesion: SesionFlujo,
  texto: string,
  opciones?: { sql?: Cliente },
): Promise<void> {
  await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    // Con la fila bloqueada, para que un envío a revisión en otra pestaña no quede con otro texto.
    const visto = await tramiteVisto(tx, tramiteId, sesion, true);
    if (!visto?.visible) throw new ErrorTramite("El trámite no existe");
    const { tramite, lideraPropietario } = visto;
    // Quien puede enviar a revisión es quien escribe el borrador: el elaborador, en elaboración.
    const veredicto = evaluarTransicion("enviar_a_revision", tramite, { usuarioId: sesion.usuarioId, rol: sesion.rol, lideraPropietario });
    if (!veredicto.ok) throw new ErrorTramite(veredicto.motivo);

    const resumenCambios = texto.trim();
    const [version] = await tx`UPDATE documento_versiones SET resumen_cambios = ${resumenCambios}
      WHERE id = ${tramite.versionId} AND estado = 'borrador'
      RETURNING documento_id, numero`;
    if (!version) throw new ErrorTramite("Solo se puede editar una versión en borrador");
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "editar_version",
      entidad: "documento_version",
      entidadId: tramite.versionId,
      detalle: { documentoId: Number(version.documento_id), numero: version.numero, tramite: tramite.numero, resumenCambios },
    });
  });
}

/** Lo que muestra el bloque del borrador. Quien llama ya comprobó que la persona ve el trámite. */
export async function borradorDeTramite(tramiteId: number, opciones?: { sql?: Cliente }): Promise<Borrador> {
  const sql = opciones?.sql ?? obtenerSql();
  const [t] = await sql`SELECT v.resumen_cambios, COALESCE(t.tipo_documento_id, d.tipo_id) AS tipo_id
    FROM tramites t
    JOIN documento_versiones v ON v.id = t.version_id
    LEFT JOIN documentos d ON d.id = t.documento_id
    WHERE t.id = ${tramiteId}`;
  if (!t) throw new Error("El trámite no tiene versión");
  const [archivos, observaciones, tipo] = await Promise.all([
    sql`SELECT a.id, a.rol, a.nombre_original, a.mime, a.tamano_bytes, a.hash_sha256
      FROM archivos a JOIN tramites t ON t.version_id = a.version_id
      WHERE t.id = ${tramiteId} AND a.rol = ANY(${ROLES_DEL_BORRADOR})
      ORDER BY array_position(${ROLES_DEL_BORRADOR}::text[], a.rol), a.id`,
    sql`SELECT numero, texto, respuesta FROM tramite_observaciones
      WHERE tramite_id = ${tramiteId} AND estado = 'abierta'
      ORDER BY numero`,
    t.tipo_id === null ? null : tipoDeDocumento(Number(t.tipo_id), { sql }),
  ]);
  return {
    archivos: archivos.map((a) => ({
      id: Number(a.id),
      rol: a.rol,
      nombreOriginal: a.nombre_original,
      mime: a.mime,
      tamanoBytes: Number(a.tamano_bytes),
      hashSha256: a.hash_sha256,
    })),
    controlCambios: t.resumen_cambios,
    plantilla: tipo?.plantilla ?? null,
    observaciones: observaciones.map((o) => ({ numero: o.numero, texto: o.texto, respuesta: o.respuesta })),
  };
}
