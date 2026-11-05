import type { Sql, TransactionSql } from "postgres";
import { obtenerSql } from "@/db/cliente";
import { filtroAcceso, type SujetoVisibilidad } from "@/lib/alcance";
import { hashearClave } from "@/lib/clave";
import { puede } from "@/lib/permisos";
import { patronDeConfiguracion } from "@/lib/tramites/codigo";
import { ErrorTramite, enTransaccion } from "./flujo/contrato";
import { ETAPAS_ABIERTAS } from "./tramites";

type Cliente = Sql | TransactionSql;

/** Quién escribe en una versión: el panel no pasa `tramiteId`; el trámite pasa el suyo. */
export type OpcionesEscritura = { tramiteId?: number; sql?: Cliente };

/**
 * Mientras una versión es de un trámite abierto, sus archivos y su control de cambios solo se
 * tocan desde ese trámite, en elaboración (spec 13A §9.1). `FOR SHARE` choca con el `FOR UPDATE`
 * de `transicionar`: lo que llega durante una firma espera a que termine, y entonces ve la etapa
 * nueva. Por eso va antes de cualquier otro candado de la transacción.
 */
export async function exigirEscrituraEnVersion(
  tx: Cliente,
  versionId: number | null,
  tramiteId?: number,
): Promise<void> {
  const [abierto] = await tx`SELECT id, etapa FROM tramites
    WHERE version_id = ${versionId} AND etapa = ANY(${ETAPAS_ABIERTAS})
    FOR SHARE`;
  if (tramiteId === undefined) {
    if (abierto) throw new ErrorTramite("Esta versión está en un trámite: se trabaja desde el trámite");
    return;
  }
  if (Number(abierto?.id) !== tramiteId || abierto.etapa !== "elaboracion") {
    throw new ErrorTramite("Este trámite ya no está en elaboración");
  }
}

/**
 * Crea el usuario admin si no existe (idempotente: arranque del contenedor y
 * dev). Busca sin distinguir mayúsculas y crea en minúsculas, como el ingreso.
 * Con forzarClave es el rescate de la instalación: deja una cuenta de
 * administración usable (rol admin_sgc, activa, sin segundo factor ni
 * sesiones) con clave nueva y cambio obligatorio.
 */
export async function asegurarAdmin(
  usuario: string,
  nombre: string,
  clave: string,
  forzarClave = false,
): Promise<"creado" | "existente" | "clave_actualizada"> {
  const sql = obtenerSql();
  const [existente] = await sql`SELECT id, usuario FROM usuarios
    WHERE lower(usuario) = lower(${usuario}) ORDER BY id LIMIT 1`;

  if (!existente) {
    await sql`INSERT INTO usuarios (usuario, nombre, hash_clave, rol, debe_cambiar_clave)
      VALUES (${usuario.toLowerCase()}, ${nombre}, ${await hashearClave(clave)}, 'admin_sgc', true)`;
    return "creado";
  }
  if (forzarClave) {
    const hash = await hashearClave(clave);
    await sql.begin(async (tx) => {
      // El rescate no puede devolver una cuenta degradada ni atada a un teléfono perdido.
      await tx`UPDATE usuarios SET hash_clave = ${hash}, rol = 'admin_sgc', activo = true,
        debe_cambiar_clave = true, intentos_fallidos = 0, bloqueos_consecutivos = 0,
        bloqueado_hasta = NULL, totp_activo = false, totp_secreto_cifrado = NULL,
        actualizado_en = now()
        WHERE id = ${existente.id}`;
      await tx`DELETE FROM codigos_recuperacion WHERE usuario_id = ${existente.id}`;
      // Restablecer la clave cierra las sesiones abiertas (diseño F11 §6).
      await tx`DELETE FROM sesiones WHERE usuario_id = ${existente.id}`;
      await tx`INSERT INTO accesos (usuario_id, usuario_texto, resultado, ip, user_agent)
        VALUES (${existente.id}, ${existente.usuario}, 'restablecimiento', NULL, NULL)`;
    });
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

/**
 * Patrón del código: sale de `formato_codigo` si es válido; si no, de la clave
 * heredada `patron_codigo` y, a falta de esta, del patrón por defecto.
 */
export async function obtenerPatronCodigo(opciones?: { sql?: Cliente }): Promise<RegExp> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`SELECT clave, valor FROM configuracion
    WHERE clave IN ('formato_codigo', 'patron_codigo')`;
  const valor = (clave: string) =>
    filas.find((f) => f.clave === clave)?.valor as string | undefined;
  return patronDeConfiguracion(valor("formato_codigo"), valor("patron_codigo"));
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

/** Crea el documento con su primera versión en borrador, dentro de la transacción dada. */
export async function crearDocumentoEn(
  tx: TransactionSql,
  datos: DatosDocumento & {
    nivelAcceso?: "general" | "restringido";
    numeroInicial?: number;
    relacionados?: number[];
  },
  usuarioId: number,
): Promise<{ documentoId: number; versionId: number }> {
  validarAsociaciones(datos.asociaciones);
  const [doc] = await tx`INSERT INTO documentos (codigo, titulo, tipo_id, descripcion, palabras_clave, nivel_acceso)
    VALUES (${datos.codigo}, ${datos.titulo}, ${datos.tipoId},
            ${datos.descripcion}, ${datos.palabrasClave}, ${datos.nivelAcceso ?? "general"})
    RETURNING id`;
  const [version] = await tx`INSERT INTO documento_versiones (documento_id, numero, estado)
    VALUES (${doc.id}, ${datos.numeroInicial ?? 1}, 'borrador') RETURNING id`;
  await insertarAsociaciones(tx, doc.id, datos.asociaciones);
  for (const relacionadoId of new Set(datos.relacionados)) {
    await tx`INSERT INTO documento_relaciones (documento_id, relacionado_id) VALUES (${doc.id}, ${relacionadoId})`;
  }
  await registrarAuditoria(tx, {
    usuarioId, accion: "crear_documento", entidad: "documento",
    entidadId: doc.id, detalle: { codigo: datos.codigo, titulo: datos.titulo },
  });
  return { documentoId: doc.id, versionId: version.id };
}

export async function crearDocumento(
  datos: DatosDocumento,
  usuarioId: number,
): Promise<{ documentoId: number; versionId: number }> {
  return await obtenerSql().begin((tx) => crearDocumentoEn(tx, datos, usuarioId));
}

/** Abre la versión siguiente en borrador. Una versión descartada libera su número. */
export async function crearVersionBorradorEn(
  tx: TransactionSql,
  documentoId: number,
  usuarioId: number,
): Promise<{ versionId: number; numero: number }> {
  const [borrador] = await tx`SELECT 1 FROM documento_versiones
    WHERE documento_id = ${documentoId} AND estado = 'borrador'`;
  if (borrador) {
    throw new Error("Ya hay una versión en borrador: publíquela o edítela");
  }
  const [{ siguiente }] = await tx`SELECT coalesce(max(numero), 0) + 1 AS siguiente
    FROM documento_versiones WHERE documento_id = ${documentoId} AND estado <> 'descartado'`;
  const [version] = await tx`INSERT INTO documento_versiones (documento_id, numero, estado)
    VALUES (${documentoId}, ${siguiente}, 'borrador') RETURNING id, numero`;
  await registrarAuditoria(tx, {
    usuarioId, accion: "crear_version", entidad: "documento_version",
    entidadId: version.id, detalle: { documentoId, numero: version.numero },
  });
  return { versionId: version.id, numero: version.numero };
}

export async function crearVersionBorrador(
  documentoId: number,
  usuarioId: number,
): Promise<{ versionId: number; numero: number }> {
  return await obtenerSql().begin((tx) => crearVersionBorradorEn(tx, documentoId, usuarioId));
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
  opciones?: OpcionesEscritura,
): Promise<void> {
  await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    await exigirEscrituraEnVersion(tx, versionId, opciones?.tramiteId);
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

/**
 * LA transacción del sistema (regla ISO 1): publicar una versión nueva vuelve
 * obsoleta la anterior en el mismo commit. El índice único parcial
 * versiones_una_vigente_idx la respalda en BD; el orden de los UPDATE importa
 * (primero obsoleto, luego vigente) para no chocar con el índice.
 */
export async function publicarVersion(
  versionId: number,
  usuarioId: number,
): Promise<{ documentoId: number; obsoletas: number }> {
  const sql = obtenerSql();
  return await sql.begin(async (tx) => {
    const [version] = await tx`SELECT id, documento_id, numero, estado, aprobo, fecha_aprobacion
      FROM documento_versiones WHERE id = ${versionId} FOR UPDATE`;
    if (!version) throw new Error("La versión no existe");
    if (version.estado !== "borrador") {
      throw new Error("Solo se puede publicar una versión en borrador");
    }
    if (!version.aprobo || !version.fecha_aprobacion) {
      throw new Error(
        "Falta la evidencia de aprobación (quién aprobó y en qué fecha)",
      );
    }
    const [principal] = await tx`SELECT 1 FROM archivos
      WHERE version_id = ${versionId} AND rol = 'principal'`;
    if (!principal) {
      throw new Error("El borrador no tiene archivo principal");
    }

    const anteriores = await tx`UPDATE documento_versiones SET estado = 'obsoleto'
      WHERE documento_id = ${version.documento_id} AND estado = 'vigente'
      RETURNING numero`;
    await tx`UPDATE documento_versiones SET estado = 'vigente' WHERE id = ${versionId}`;
    await tx`UPDATE documentos SET actualizado_en = now() WHERE id = ${version.documento_id}`;
    await registrarAuditoria(tx, {
      usuarioId, accion: "publicar_version", entidad: "documento_version",
      entidadId: versionId,
      detalle: {
        documentoId: version.documento_id,
        numero: version.numero,
        obsoletas: anteriores.map((a) => a.numero),
      },
    });
    return { documentoId: version.documento_id, obsoletas: anteriores.length };
  });
}

export async function obtenerVersionParaSubida(versionId: number) {
  const sql = obtenerSql();
  const [v] = await sql`SELECT v.id, v.numero, v.estado, d.id AS documento_id, d.codigo
    FROM documento_versiones v JOIN documentos d ON d.id = v.documento_id
    WHERE v.id = ${versionId}`;
  if (!v) return null;
  return {
    id: v.id, numero: v.numero, estado: v.estado,
    documentoId: v.documento_id, codigo: v.codigo,
  };
}

export async function registrarArchivo(
  datos: {
    versionId: number; rol: string; ruta: string; nombreOriginal: string;
    extension: string; mime: string; tamanoBytes: number; hashSha256: string;
  },
  usuarioId: number,
  opciones?: OpcionesEscritura,
): Promise<{ id: number }> {
  try {
    return await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
      await exigirEscrituraEnVersion(tx, datos.versionId, opciones?.tramiteId);
      const [archivo] = await tx`INSERT INTO archivos
          (version_id, rol, ruta, nombre_original, extension, mime, tamano_bytes, hash_sha256)
        VALUES (${datos.versionId}, ${datos.rol}, ${datos.ruta}, ${datos.nombreOriginal},
                ${datos.extension}, ${datos.mime}, ${datos.tamanoBytes}, ${datos.hashSha256})
        RETURNING id`;
      await registrarAuditoria(tx, {
        usuarioId, accion: "subir_archivo", entidad: "archivo", entidadId: archivo.id,
        detalle: { versionId: datos.versionId, rol: datos.rol, nombre: datos.nombreOriginal },
      });
      return { id: archivo.id };
    });
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      throw new Error("Ya hay un archivo principal en esta versión");
    }
    throw err;
  }
}

export async function obtenerArchivoAdmin(archivoId: number) {
  const sql = obtenerSql();
  const [a] = await sql`SELECT a.id, a.ruta, a.mime, a.nombre_original, a.version_id,
      v.estado, v.documento_id
    FROM archivos a JOIN documento_versiones v ON v.id = a.version_id
    WHERE a.id = ${archivoId}`;
  if (!a) return null;
  return {
    id: a.id, ruta: a.ruta, mime: a.mime, nombreOriginal: a.nombre_original,
    versionId: a.version_id, estadoVersion: a.estado, documentoId: a.documento_id,
  };
}

export async function eliminarArchivoBorrador(
  archivoId: number,
  usuarioId: number,
  opciones?: OpcionesEscritura,
): Promise<{ ruta: string }> {
  return await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    const [destino] = await tx`SELECT version_id FROM archivos WHERE id = ${archivoId}`;
    if (!destino) throw new Error("El archivo no existe");
    await exigirEscrituraEnVersion(tx, destino.version_id, opciones?.tramiteId);
    const [archivo] = await tx`SELECT a.id, a.ruta, a.nombre_original, v.estado
      FROM archivos a JOIN documento_versiones v ON v.id = a.version_id
      WHERE a.id = ${archivoId} FOR UPDATE`;
    if (!archivo) throw new Error("El archivo no existe");
    if (archivo.estado !== "borrador") {
      throw new Error("Solo se pueden eliminar archivos de una versión en borrador");
    }
    await tx`DELETE FROM archivos WHERE id = ${archivoId}`;
    await registrarAuditoria(tx, {
      usuarioId, accion: "eliminar_archivo", entidad: "archivo", entidadId: archivoId,
      detalle: { nombre: archivo.nombre_original },
    });
    return { ruta: archivo.ruta };
  });
}

export type FilaDocumentoAdmin = {
  id: number; codigo: string; titulo: string;
  tipoNombre: string; tipoSigla: string;
  versionVigente: number | null; versionBorrador: number | null;
  anulado: boolean; actualizadoEn: string;
};

/**
 * Lista del panel (spec 13A §12, F13A-DC13): solo lo que el sujeto puede ver. Quien
 * no administra no recibe el número del borrador ni los documentos que únicamente
 * tienen versiones en borrador o descartadas.
 */
export async function listarDocumentosAdmin(sujeto: SujetoVisibilidad): Promise<FilaDocumentoAdmin[]> {
  const sql = obtenerSql();
  const administra = puede(sujeto, "documentos.administrar");
  const filas = await sql`
    SELECT d.id, d.codigo, d.titulo, t.nombre AS tipo_nombre, t.sigla AS tipo_sigla,
      d.actualizado_en,
      (SELECT numero FROM documento_versiones WHERE documento_id = d.id AND estado = 'vigente') AS vigente,
      ${administra
        ? sql`(SELECT numero FROM documento_versiones WHERE documento_id = d.id AND estado = 'borrador')`
        : sql`NULL::integer`} AS borrador,
      EXISTS (SELECT 1 FROM documento_versiones WHERE documento_id = d.id AND estado = 'anulado') AS anulado
    FROM documentos d JOIN tipos_documento t ON t.id = d.tipo_id
    WHERE ${filtroAcceso(sql, sujeto)}
      ${administra
        ? sql``
        : sql`AND EXISTS (SELECT 1 FROM documento_versiones
            WHERE documento_id = d.id AND estado NOT IN ('borrador', 'descartado'))`}
    ORDER BY d.actualizado_en DESC`;
  return filas.map((f) => ({
    id: f.id, codigo: f.codigo, titulo: f.titulo,
    tipoNombre: f.tipo_nombre, tipoSigla: f.tipo_sigla,
    versionVigente: f.vigente, versionBorrador: f.borrador,
    anulado: f.anulado, actualizadoEn: String(f.actualizado_en),
  }));
}

export async function listarTiposActivos() {
  const sql = obtenerSql();
  const filas = await sql`SELECT id, nombre, sigla FROM tipos_documento
    WHERE activo ORDER BY orden`;
  return filas.map((f) => ({ id: f.id, nombre: f.nombre, sigla: f.sigla }));
}

export async function listarMapaParaFormulario() {
  const sql = obtenerSql();
  const filas = await sql`
    SELECT p.id, p.nombre,
      coalesce(json_agg(json_build_object('id', s.id, 'nombre', s.nombre) ORDER BY s.orden)
        FILTER (WHERE s.id IS NOT NULL), '[]') AS subprocesos
    FROM procesos p
    LEFT JOIN subprocesos s ON s.proceso_id = p.id AND s.activo
    WHERE p.activo
    GROUP BY p.id ORDER BY p.nombre`;
  return filas.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    subprocesos: f.subprocesos as Array<{ id: number; nombre: string }>,
  }));
}

export type VersionAdmin = {
  id: number; numero: number; estado: string;
  fechaElaboracion: string | null; fechaRevision: string | null;
  fechaAprobacion: string | null; elaboro: string | null;
  reviso: string | null; aprobo: string | null; resumenCambios: string | null;
  archivos: Array<{ id: number; rol: string; nombreOriginal: string; mime: string; tamanoBytes: number }>;
};

export type DocumentoAdmin = {
  id: number; codigo: string; titulo: string; tipoId: number; tipoNombre: string;
  descripcion: string | null; palabrasClave: string | null; publicado: boolean;
  asociaciones: Array<{ procesoId: number | null; subprocesoId: number | null; nombre: string; esPrincipal: boolean }>;
  versiones: VersionAdmin[];
};

/**
 * Detalle del panel: null si el sujeto no pasa la regla de acceso. Las versiones
 * en borrador o descartadas solo llegan a quien administra; a quien no le queda
 * ninguna otra versión, el documento tampoco existe (F13A-DC13).
 */
export async function obtenerDocumentoAdmin(
  codigo: string,
  sujeto: SujetoVisibilidad,
): Promise<DocumentoAdmin | null> {
  const sql = obtenerSql();
  const administra = puede(sujeto, "documentos.administrar");
  const [doc] = await sql`SELECT d.id, d.codigo, d.titulo, d.tipo_id, t.nombre AS tipo_nombre,
      d.descripcion, d.palabras_clave,
      EXISTS (SELECT 1 FROM documento_versiones WHERE documento_id = d.id AND estado <> 'borrador') AS publicado
    FROM documentos d JOIN tipos_documento t ON t.id = d.tipo_id
    WHERE d.codigo = ${codigo} AND ${filtroAcceso(sql, sujeto)}`;
  if (!doc) return null;

  const asociaciones = await sql`
    SELECT dp.proceso_id, dp.subproceso_id, dp.es_principal,
      coalesce(p.nombre, pr.nombre || ' › ' || s.nombre) AS nombre
    FROM documento_proceso dp
    LEFT JOIN procesos p ON p.id = dp.proceso_id
    LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
    LEFT JOIN procesos pr ON pr.id = s.proceso_id
    WHERE dp.documento_id = ${doc.id}
    ORDER BY dp.es_principal DESC, nombre`;

  const versiones = await sql`
    SELECT v.id, v.numero, v.estado, v.fecha_elaboracion, v.fecha_revision,
      v.fecha_aprobacion, v.elaboro, v.reviso, v.aprobo, v.resumen_cambios,
      coalesce(json_agg(json_build_object(
          'id', a.id, 'rol', a.rol, 'nombreOriginal', a.nombre_original,
          'mime', a.mime, 'tamanoBytes', a.tamano_bytes) ORDER BY a.rol)
        FILTER (WHERE a.id IS NOT NULL), '[]') AS archivos
    FROM documento_versiones v
    LEFT JOIN archivos a ON a.version_id = v.id
    WHERE v.documento_id = ${doc.id}
      ${administra ? sql`` : sql`AND v.estado NOT IN ('borrador', 'descartado')`}
    GROUP BY v.id ORDER BY v.numero DESC`;
  if (!administra && versiones.length === 0) return null;

  return {
    id: doc.id, codigo: doc.codigo, titulo: doc.titulo, tipoId: doc.tipo_id,
    tipoNombre: doc.tipo_nombre, descripcion: doc.descripcion,
    palabrasClave: doc.palabras_clave, publicado: doc.publicado,
    asociaciones: asociaciones.map((a) => ({
      procesoId: a.proceso_id, subprocesoId: a.subproceso_id,
      nombre: a.nombre, esPrincipal: a.es_principal,
    })),
    versiones: versiones.map((v) => ({
      id: v.id, numero: v.numero, estado: v.estado,
      fechaElaboracion: v.fecha_elaboracion, fechaRevision: v.fecha_revision,
      fechaAprobacion: v.fecha_aprobacion, elaboro: v.elaboro, reviso: v.reviso,
      aprobo: v.aprobo, resumenCambios: v.resumen_cambios,
      archivos: v.archivos as VersionAdmin["archivos"],
    })),
  };
}

export async function anularVigente(
  documentoId: number,
  usuarioId: number,
): Promise<void> {
  const sql = obtenerSql();
  await sql.begin(async (tx) => {
    const [anulada] = await tx`UPDATE documento_versiones SET estado = 'anulado'
      WHERE documento_id = ${documentoId} AND estado = 'vigente'
      RETURNING id, numero`;
    if (!anulada) {
      throw new Error("El documento no tiene versión vigente que anular");
    }
    await registrarAuditoria(tx, {
      usuarioId, accion: "anular_documento", entidad: "documento",
      entidadId: documentoId, detalle: { versionAnulada: anulada.numero },
    });
  });
}
