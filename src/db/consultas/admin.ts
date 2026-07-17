import type { Sql, TransactionSql } from "postgres";
import { obtenerSql } from "@/db/cliente";
import { hashearClave } from "@/lib/clave";

type Cliente = Sql | TransactionSql;

/**
 * Crea el usuario admin si no existe (idempotente: arranque del contenedor y
 * dev). Con forzarClave restablece la clave — el camino de "la olvidé",
 * ejecutando el script en el NAS.
 */
export async function asegurarAdmin(
  usuario: string,
  nombre: string,
  clave: string,
  forzarClave = false,
): Promise<"creado" | "existente" | "clave_actualizada"> {
  const sql = obtenerSql();
  const [existente] = await sql`SELECT id FROM usuarios WHERE usuario = ${usuario}`;

  if (!existente) {
    await sql`INSERT INTO usuarios (usuario, nombre, hash_clave)
      VALUES (${usuario}, ${nombre}, ${await hashearClave(clave)})`;
    return "creado";
  }
  if (forzarClave) {
    await sql`UPDATE usuarios SET hash_clave = ${await hashearClave(clave)}, activo = true
      WHERE id = ${existente.id}`;
    return "clave_actualizada";
  }
  return "existente";
}

export async function registrarAuditoria(
  sql: Cliente,
  e: {
    usuarioId: number | null;
    accion: string;
    entidad: string;
    entidadId?: number | null;
    detalle?: unknown;
  },
): Promise<void> {
  await sql`INSERT INTO auditoria (usuario_id, accion, entidad, entidad_id, detalle)
    VALUES (${e.usuarioId}, ${e.accion}, ${e.entidad}, ${e.entidadId ?? null},
            ${sql.json((e.detalle ?? {}) as never)})`;
}

export type AsociacionEntrada = {
  procesoId?: number;
  subprocesoId?: number;
  esPrincipal: boolean;
};

export type DatosDocumento = {
  codigo: string;
  titulo: string;
  tipoId: number;
  descripcion: string | null;
  palabrasClave: string | null;
  asociaciones: AsociacionEntrada[];
};

const PATRON_CODIGO_DEFECTO = "^[A-Z]{2,4}-[A-Z]{2,4}-\\d{3}$";

/** Patrón del código, configurable sin migración (pendiente la convención oficial). */
export async function obtenerPatronCodigo(): Promise<RegExp> {
  const sql = obtenerSql();
  const [fila] = await sql`SELECT valor FROM configuracion WHERE clave = 'patron_codigo'`;
  return new RegExp(fila?.valor ?? PATRON_CODIGO_DEFECTO);
}

function validarAsociaciones(asociaciones: AsociacionEntrada[]) {
  const principales = asociaciones.filter((a) => a.esPrincipal).length;
  if (asociaciones.length === 0 || principales !== 1) {
    throw new Error(
      "El documento necesita al menos una asociación y exactamente una principal",
    );
  }
}

async function insertarAsociaciones(
  tx: Cliente,
  documentoId: number,
  asociaciones: AsociacionEntrada[],
) {
  for (const a of asociaciones) {
    await tx`INSERT INTO documento_proceso (documento_id, proceso_id, subproceso_id, es_principal)
      VALUES (${documentoId}, ${a.procesoId ?? null}, ${a.subprocesoId ?? null}, ${a.esPrincipal})`;
  }
}

export async function crearDocumento(
  datos: DatosDocumento,
  usuarioId: number,
): Promise<{ documentoId: number; versionId: number }> {
  validarAsociaciones(datos.asociaciones);
  const sql = obtenerSql();
  return await sql.begin(async (tx) => {
    const [doc] = await tx`INSERT INTO documentos (codigo, titulo, tipo_id, descripcion, palabras_clave)
      VALUES (${datos.codigo}, ${datos.titulo}, ${datos.tipoId},
              ${datos.descripcion}, ${datos.palabrasClave})
      RETURNING id`;
    const [version] = await tx`INSERT INTO documento_versiones (documento_id, numero, estado)
      VALUES (${doc.id}, 1, 'borrador') RETURNING id`;
    await insertarAsociaciones(tx, doc.id, datos.asociaciones);
    await registrarAuditoria(tx, {
      usuarioId, accion: "crear_documento", entidad: "documento",
      entidadId: doc.id, detalle: { codigo: datos.codigo, titulo: datos.titulo },
    });
    return { documentoId: doc.id, versionId: version.id };
  });
}

export async function crearVersionBorrador(
  documentoId: number,
  usuarioId: number,
): Promise<{ versionId: number; numero: number }> {
  const sql = obtenerSql();
  return await sql.begin(async (tx) => {
    const [borrador] = await tx`SELECT 1 FROM documento_versiones
      WHERE documento_id = ${documentoId} AND estado = 'borrador'`;
    if (borrador) {
      throw new Error("Ya hay una versión en borrador: publíquela o edítela");
    }
    const [{ siguiente }] = await tx`SELECT coalesce(max(numero), 0) + 1 AS siguiente
      FROM documento_versiones WHERE documento_id = ${documentoId}`;
    const [version] = await tx`INSERT INTO documento_versiones (documento_id, numero, estado)
      VALUES (${documentoId}, ${siguiente}, 'borrador') RETURNING id, numero`;
    await registrarAuditoria(tx, {
      usuarioId, accion: "crear_version", entidad: "documento_version",
      entidadId: version.id, detalle: { documentoId, numero: version.numero },
    });
    return { versionId: version.id, numero: version.numero };
  });
}

export type DatosVersion = {
  fechaElaboracion: string | null;
  fechaRevision: string | null;
  fechaAprobacion: string | null;
  elaboro: string | null;
  reviso: string | null;
  aprobo: string | null;
  resumenCambios: string | null;
};

export async function editarVersionBorrador(
  versionId: number,
  datos: DatosVersion,
  usuarioId: number,
): Promise<void> {
  const sql = obtenerSql();
  await sql.begin(async (tx) => {
    const [actualizada] = await tx`UPDATE documento_versiones SET
        fecha_elaboracion = ${datos.fechaElaboracion},
        fecha_revision = ${datos.fechaRevision},
        fecha_aprobacion = ${datos.fechaAprobacion},
        elaboro = ${datos.elaboro}, reviso = ${datos.reviso}, aprobo = ${datos.aprobo},
        resumen_cambios = ${datos.resumenCambios}
      WHERE id = ${versionId} AND estado = 'borrador'
      RETURNING id`;
    if (!actualizada) {
      throw new Error("Solo se puede editar una versión en borrador");
    }
    await registrarAuditoria(tx, {
      usuarioId, accion: "editar_version", entidad: "documento_version",
      entidadId: versionId, detalle: datos,
    });
  });
}

export async function editarMetadatos(
  documentoId: number,
  datos: DatosDocumento,
  usuarioId: number,
): Promise<void> {
  validarAsociaciones(datos.asociaciones);
  const sql = obtenerSql();
  await sql.begin(async (tx) => {
    const [actual] = await tx`SELECT codigo FROM documentos WHERE id = ${documentoId}`;
    if (!actual) throw new Error("El documento no existe");
    if (datos.codigo !== actual.codigo) {
      const [publicada] = await tx`SELECT 1 FROM documento_versiones
        WHERE documento_id = ${documentoId} AND estado <> 'borrador' LIMIT 1`;
      if (publicada) {
        throw new Error("El código es inmutable: el documento ya fue publicado");
      }
    }
    await tx`UPDATE documentos SET codigo = ${datos.codigo}, titulo = ${datos.titulo},
        tipo_id = ${datos.tipoId}, descripcion = ${datos.descripcion},
        palabras_clave = ${datos.palabrasClave}, actualizado_en = now()
      WHERE id = ${documentoId}`;
    await tx`DELETE FROM documento_proceso WHERE documento_id = ${documentoId}`;
    await insertarAsociaciones(tx, documentoId, datos.asociaciones);
    await registrarAuditoria(tx, {
      usuarioId, accion: "editar_documento", entidad: "documento",
      entidadId: documentoId,
      detalle: { codigoAnterior: actual.codigo, codigo: datos.codigo, titulo: datos.titulo },
    });
  });
}
