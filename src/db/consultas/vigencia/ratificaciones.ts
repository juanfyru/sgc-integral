/**
 * La ratificación (spec 13C §7.3): la constancia firmada de que un documento interno vigente sigue sirviendo tal
 * como está. Sigue F13A-R4: un validador de solo lectura, la clave fuera de la transacción y las comprobaciones
 * repetidas dentro, con la fila del documento bloqueada.
 */
import type { TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { registrarFirma } from "@/db/consultas/firmas";
import { ErrorFirma, enTransaccion, type OpcionesFlujo, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { alcanceProcesos, filtroAcceso, puedeRatificar } from "@/lib/alcance";
import { verificarParaFirmar, type CredencialesFirma } from "@/lib/firma";
import { huellaDeArchivo } from "@/lib/huella";
import { ETAPAS_ABIERTAS, type Autoridad } from "@/lib/tramites/tipos";
import { fechaEnZona, finDeFecha } from "@/lib/tramites/plazos";
import { sumarMeses } from "@/lib/vigencia/plazo";
import { ErrorVigencia } from "@/lib/vigencia/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";

export type Ratificacion = {
  id: number;
  versionId: number;
  version: number;
  nombre: string;
  cargo: string | null;
  nota: string | null;
  creadoEn: Date;
  proximaRevision: Date;
  revisionAnualId: number | null;
};

export const NO_EXISTE = "El documento no existe";
export const CON_TRAMITE = "El documento tiene un trámite abierto: el trámite ya es su revisión";
export const NO_PUEDE = "No puede ratificar este documento";
export const SIN_PRINCIPAL = "El documento no tiene archivo principal";
export const NO_COINCIDE = "El archivo en disco no coincide con el registrado; avise al Administrador del SGC";

type Validado = {
  versionId: number;
  numero: number;
  codigo: string;
  procesoId: number;
  autoridad: Autoridad;
  hashRegistrado: string;
  ruta: string;
};

/**
 * Lo que debe cumplirse para ratificar, sin escribir nada. Quien no ve el documento, o lo que no es un interno
 * vigente, recibe «no existe». El plazo se lee aparte, dentro de la transacción.
 */
export async function validarRatificacion(sql: Cliente, sesion: SesionFlujo, documentoId: number): Promise<Validado> {
  const [d] = await sql`
    SELECT d.codigo, t.autoridad, v.id AS version_id, v.numero,
      COALESCE(dp.proceso_id, s.proceso_id) AS proceso_id, a.ruta, a.hash_sha256,
      EXISTS (SELECT 1 FROM tramites tr WHERE tr.documento_id = d.id AND tr.etapa = ANY(${ETAPAS_ABIERTAS})) AS en_tramite
    FROM documentos d
    JOIN tipos_documento t ON t.id = d.tipo_id
    JOIN documento_versiones v ON v.documento_id = d.id AND v.estado = 'vigente'
    LEFT JOIN documento_proceso dp ON dp.documento_id = d.id AND dp.es_principal
    LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
    LEFT JOIN archivos a ON a.version_id = v.id AND a.rol = 'principal'
    WHERE d.id = ${documentoId} AND d.origen = 'interno' AND ${filtroAcceso(sql, sesion)}`;
  if (!d || d.proceso_id === null) throw new ErrorVigencia(NO_EXISTE);
  if (d.en_tramite) throw new ErrorVigencia(CON_TRAMITE);
  const procesoId = Number(d.proceso_id);
  const autoridad = d.autoridad as Autoridad;
  const alcance = await alcanceProcesos(sesion, { sql });
  if (!puedeRatificar(sesion, { procesoId, autoridad, origen: "interno", enTramite: false, vigente: true }, alcance)) {
    throw new ErrorVigencia(NO_PUEDE);
  }
  if (!d.ruta) throw new ErrorVigencia(SIN_PRINCIPAL);
  return {
    versionId: Number(d.version_id),
    numero: d.numero as number,
    codigo: d.codigo as string,
    procesoId,
    autoridad,
    hashRegistrado: d.hash_sha256 as string,
    ruta: d.ruta as string,
  };
}

/**
 * Lo que la revisión anual hace con una ratificación hecha durante su campaña. La llama `ratificar` dentro de
 * su transacción, después de insertar la fila; la Tarea 10 la llena con `registrarDecision`.
 */
export async function alRatificar(
  tx: TransactionSql,
  d: { documentoId: number; versionId: number; ratificacionId: number; usuarioId: number; ahora: Date },
): Promise<void> {
  // Sin campaña que registrar todavía: la decisión automática llega con la revisión anual.
  void tx;
  void d;
}

/** Un archivo que no se puede leer tampoco es el registrado: la huella en disco queda nula. */
async function huellaEnDisco(ruta: string): Promise<string | null> {
  try {
    return await huellaDeArchivo(ruta);
  } catch (err) {
    console.error("No se pudo leer el archivo principal al ratificar:", err);
    return null;
  }
}

/** El rechazo por la huella sale de la transacción con lo que la bitácora debe guardar. */
class HuellaDistinta extends Error {
  constructor(readonly detalle: { codigo: string; huellaRegistrada: string; huellaEnDisco: string | null }) {
    super(NO_COINCIDE);
  }
}

/**
 * Ratifica la versión vigente: firma «Ratificó» sin trámite, la fila de `ratificaciones` con la próxima revisión
 * que resulta (hoy más el plazo), y se borra la fecha fijada a mano. Sin avisos (F13C-DC3). Si el archivo en
 * disco no es el registrado, no escribe nada salvo `ratificacion_rechazada` en la bitácora.
 */
export async function ratificar(
  sesion: SesionFlujo,
  d: { documentoId: number; nota: string | null; credenciales: CredencialesFirma },
  opciones: OpcionesFlujo = {},
): Promise<{ ratificacionId: number; proximaRevision: Date; codigo: string }> {
  const sql = opciones.sql ?? obtenerSql();
  const ahora = opciones.ahora ?? new Date();
  const contexto = opciones.contexto ?? { ip: null, userAgent: null };
  const zona = zonaHoraria();
  const nota = d.nota?.trim() || null;

  await validarRatificacion(sql, sesion, d.documentoId);
  const verificar = opciones.verificar ?? verificarParaFirmar;
  const r = await verificar(sesion, d.credenciales, contexto, ahora);
  if (!r.ok) throw new ErrorFirma(r.mensaje, r.sesionCerrada, r.bloqueada);

  try {
    return await enTransaccion(sql, async (tx) => {
      const [doc] = await tx`SELECT d.meses_revision, t.meses_revision AS meses_tipo
        FROM documentos d JOIN tipos_documento t ON t.id = d.tipo_id
        WHERE d.id = ${d.documentoId} FOR UPDATE OF d`;
      if (!doc) throw new ErrorVigencia(NO_EXISTE);
      const v = await validarRatificacion(tx, sesion, d.documentoId);
      const enDisco = await huellaEnDisco(v.ruta);
      if (enDisco !== v.hashRegistrado) {
        throw new HuellaDistinta({ codigo: v.codigo, huellaRegistrada: v.hashRegistrado, huellaEnDisco: enDisco });
      }

      const meses = Number(doc.meses_revision ?? doc.meses_tipo);
      const proxima = fechaEnZona(sumarMeses(ahora, meses, zona), zona);
      const firmaId = await registrarFirma(tx, {
        tramiteId: null,
        versionId: v.versionId,
        usuarioId: sesion.usuarioId,
        firma: "ratifico",
        ronda: 0,
        hashSha256: v.hashRegistrado,
        metodo: r.metodo,
        contexto,
        ahora,
      });
      const [fila] = await tx`INSERT INTO ratificaciones (version_id, firma_id, nota, proxima_revision, revision_anual_id, creado_en)
        VALUES (${v.versionId}, ${firmaId}, ${nota}, ${proxima}, NULL, ${ahora})
        RETURNING id`;
      const ratificacionId = Number(fila.id);
      await alRatificar(tx, { documentoId: d.documentoId, versionId: v.versionId, ratificacionId, usuarioId: sesion.usuarioId, ahora });
      // `actualizado_en` no cambia: ratificar no cambia el documento.
      await tx`UPDATE documentos SET proxima_revision_fijada = NULL, fijada_por = NULL, fijada_en = NULL, fijada_nota = NULL,
          revision_aviso_en = NULL, revision_escalado_en = NULL
        WHERE id = ${d.documentoId}`;
      await registrarAuditoria(tx, {
        usuarioId: sesion.usuarioId,
        accion: "documento_ratificado",
        entidad: "documento",
        entidadId: d.documentoId,
        detalle: { codigo: v.codigo, version: v.numero, nota, proximaRevision: proxima },
      });
      return { ratificacionId, proximaRevision: finDeFecha(proxima, zona), codigo: v.codigo };
    });
  } catch (err) {
    if (!(err instanceof HuellaDistinta)) throw err;
    // Fuera de la transacción revertida: el rechazo queda en la bitácora.
    await registrarAuditoria(sql, {
      usuarioId: sesion.usuarioId,
      accion: "ratificacion_rechazada",
      entidad: "documento",
      entidadId: d.documentoId,
      detalle: err.detalle,
    });
    throw new ErrorVigencia(NO_COINCIDE);
  }
}

/** Las ratificaciones de una versión, de la más reciente a la más antigua. */
export async function ratificacionesDe(versionId: number, opciones?: { sql?: Cliente }): Promise<Ratificacion[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const zona = zonaHoraria();
  const filas = await sql`
    SELECT r.id, r.version_id, v.numero, f.nombre_firmante, f.cargo_firmante, r.nota, r.creado_en,
      r.proxima_revision::text AS proxima_revision, r.revision_anual_id
    FROM ratificaciones r
    JOIN firmas f ON f.id = r.firma_id
    JOIN documento_versiones v ON v.id = r.version_id
    WHERE r.version_id = ${versionId}
    ORDER BY r.creado_en DESC, r.id DESC`;
  return filas.map((f) => ({
    id: Number(f.id),
    versionId: Number(f.version_id),
    version: f.numero as number,
    nombre: f.nombre_firmante as string,
    cargo: (f.cargo_firmante as string | null) ?? null,
    nota: (f.nota as string | null) ?? null,
    creadoEn: new Date(f.creado_en as string),
    proximaRevision: finDeFecha(f.proxima_revision as string, zona),
    revisionAnualId: f.revision_anual_id === null ? null : Number(f.revision_anual_id),
  }));
}
