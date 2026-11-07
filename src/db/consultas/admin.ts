import type { Sql, TransactionSql } from "postgres";
import { obtenerSql } from "@/db/cliente";
import { retirarAcusesFueraDeAudiencia } from "@/db/consultas/distribucion/acuses";
import { filtroAcceso, type SujetoVisibilidad } from "@/lib/alcance";
import { ROLES_ARCHIVO_LISTA } from "@/lib/subida";
import { hashearClave } from "@/lib/clave";
import { puede } from "@/lib/permisos";
import { ETAPAS_ABIERTAS, NUMERO_MAXIMO_DE_VERSION, type OrigenAprobacion } from "@/lib/tramites/tipos";
import {
  ACCION_EDITAR_CONTROL,
  codigoAbandonado,
  errorDeCodigoRepetido,
  exigirFormatoDeCodigo,
  sugerirCodigo,
  type DestinoDeCodigo,
} from "./codigos";
import { alDejarDeSerVigente } from "./distribucion/version-vigencia";
import { obtenerConfigDocumental } from "./config-documental";
import { ErrorTramite, enTransaccion } from "./flujo/contrato";

type Cliente = Sql | TransactionSql;

/** Quién escribe en una versión: el panel no pasa `tramiteId`; el trámite pasa el suyo. */
export type OpcionesEscritura = { tramiteId?: number; sql?: Cliente };

type EscrituraDesdeTramite = { tramiteId: number; usuarioId: number };

function desdeTramite(opciones: OpcionesEscritura | undefined, usuarioId: number): EscrituraDesdeTramite | undefined {
  return opciones?.tramiteId === undefined ? undefined : { tramiteId: opciones.tramiteId, usuarioId };
}

const VERSION_EN_TRAMITE = "Esta versión está en un trámite: se trabaja desde el trámite";

/**
 * Mientras una versión es de un trámite abierto, sus archivos y su control de cambios solo se
 * tocan desde ese trámite, por su elaborador, en elaboración (spec 13A §9.1). `FOR SHARE` choca
 * con el `FOR UPDATE` de `transicionar`: lo que llega durante una firma o una reasignación espera
 * a que termine, y entonces ve el trámite nuevo. Por eso va antes de cualquier otro candado de la
 * transacción.
 */
export async function exigirEscrituraEnVersion(
  tx: Cliente,
  versionId: number | null,
  desde?: EscrituraDesdeTramite,
): Promise<void> {
  const [abierto] = await tx`SELECT id, etapa, elaborador_id FROM tramites
    WHERE version_id = ${versionId} AND etapa = ANY(${ETAPAS_ABIERTAS})
    FOR SHARE`;
  if (!desde) {
    if (abierto) throw new ErrorTramite(VERSION_EN_TRAMITE);
    return;
  }
  if (Number(abierto?.id) !== desde.tramiteId || abierto.etapa !== "elaboracion") {
    throw new ErrorTramite("Este trámite ya no está en elaboración");
  }
  if (Number(abierto.elaborador_id) !== desde.usuarioId) {
    throw new ErrorTramite("Ya no es quien elabora este trámite");
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

/** Lo que además se fija al dar de alta un documento. */
export type DatosAlta = DatosDocumento & {
  numeroInicial?: number;
  nivelAcceso?: "general" | "restringido";
  relacionados?: number[];
};

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

async function insertarRelacionados(tx: Cliente, documentoId: number, relacionados: number[] = []) {
  const unicos = [...new Set(relacionados)];
  if (unicos.includes(documentoId)) throw new ErrorTramite("Un documento no se relaciona consigo mismo");
  const existentes = await tx`SELECT id FROM documentos WHERE id = ANY(${unicos})`;
  if (existentes.length !== unicos.length) throw new ErrorTramite("Un documento relacionado no existe");
  for (const relacionadoId of unicos) {
    await tx`INSERT INTO documento_relaciones (documento_id, relacionado_id) VALUES (${documentoId}, ${relacionadoId})`;
  }
}

/** La relación es simétrica, venga de donde venga la fila: la ficha la lee desde sus dos puntas. */
async function relacionadosDe(sql: Cliente, documentoId: number): Promise<number[]> {
  const filas = await sql`SELECT DISTINCT CASE WHEN documento_id = ${documentoId} THEN relacionado_id ELSE documento_id END AS id
    FROM documento_relaciones
    WHERE documento_id = ${documentoId} OR relacionado_id = ${documentoId}`;
  return filas.map((f) => Number(f.id));
}

/** Lo que sigue marcado conserva su fila, en el sentido que tenga: solo se borra lo desmarcado y se añade lo nuevo. */
async function reemplazarRelacionados(tx: Cliente, documentoId: number, relacionados: number[]): Promise<void> {
  await tx`DELETE FROM documento_relaciones
    WHERE (documento_id = ${documentoId} AND NOT relacionado_id = ANY(${relacionados}))
      OR (relacionado_id = ${documentoId} AND NOT documento_id = ANY(${relacionados}))`;
  const yaEstan = new Set(await relacionadosDe(tx, documentoId));
  await insertarRelacionados(tx, documentoId, relacionados.filter((id) => !yaEstan.has(id)));
}

/** Crea el documento con su primera versión en borrador, dentro de la transacción dada. */
export async function crearDocumentoEn(
  tx: TransactionSql,
  datos: DatosAlta,
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
  await insertarRelacionados(tx, doc.id, datos.relacionados);
  await registrarAuditoria(tx, {
    usuarioId, accion: "crear_documento", entidad: "documento",
    entidadId: doc.id, detalle: { codigo: datos.codigo, titulo: datos.titulo },
  });
  return { documentoId: doc.id, versionId: version.id };
}

const CARGA_CERRADA = "La carga de documentos ya aprobados está cerrada: use un trámite";
const YA_VIGENTE = "Este documento ya tiene una versión vigente: el cambio se pide por trámite";
const TRAMITE_ABIERTO = "Este documento tiene un trámite abierto";
const CONTROL_EN_TRAMITE = `${TRAMITE_ABIERTO}: sus datos de control se corrigen desde el trámite`;

async function exigirCargaAbierta(tx: Cliente): Promise<void> {
  const { publicacionDirecta } = await obtenerConfigDocumental({ sql: tx });
  if (!publicacionDirecta) throw new Error(CARGA_CERRADA);
}

function exigirNumeroDeVersion(numero: number): void {
  if (!Number.isInteger(numero) || numero < 1 || numero > NUMERO_MAXIMO_DE_VERSION) {
    throw new Error(`La versión debe ser un entero de 1 a ${NUMERO_MAXIMO_DE_VERSION}`);
  }
}

/** En qué punto está un documento: de esto depende lo que el panel le permite (spec 13A §8.6 y §13). */
export type SituacionDocumento = {
  /** Tuvo una versión aprobada: `vigente`, `obsoleto` o `anulado`. Una descartada no cuenta. */
  publicado: boolean;
  anulado: boolean;
  origenVigente: OrigenAprobacion | null;
  /** Su trámite `crear` terminó en `cancelado` sin publicar nada: se pide otro trámite. */
  creacionCancelada: boolean;
  tramiteAbierto: { id: number; numero: string } | null;
};

async function leerSituacion(sql: Cliente, documentoId: number): Promise<SituacionDocumento> {
  const [s] = await sql`SELECT
      EXISTS (SELECT 1 FROM documento_versiones WHERE documento_id = ${documentoId} AND estado IN ('vigente', 'obsoleto', 'anulado')) AS publicado,
      EXISTS (SELECT 1 FROM documento_versiones WHERE documento_id = ${documentoId} AND estado = 'anulado') AS anulado,
      (SELECT origen_aprobacion FROM documento_versiones WHERE documento_id = ${documentoId} AND estado = 'vigente') AS origen_vigente,
      EXISTS (SELECT 1 FROM tramites WHERE documento_id = ${documentoId} AND tipo = 'crear' AND etapa = 'cancelado') AS creacion_cancelada,
      (SELECT json_build_object('id', id, 'numero', numero) FROM tramites
        WHERE documento_id = ${documentoId} AND etapa = ANY(${ETAPAS_ABIERTAS})) AS tramite_abierto`;
  return {
    publicado: s.publicado,
    anulado: s.anulado,
    origenVigente: s.origen_vigente,
    creacionCancelada: s.creacion_cancelada && !s.publicado,
    tramiteAbierto: s.tramite_abierto,
  };
}

/**
 * El primer candado de toda acción del panel sobre un documento: un solo orden, documento y luego versión.
 * El `FOR UPDATE` detiene a otra acción del panel y también a quien abra un trámite sobre él, porque la
 * llave foránea de `tramites` espera este candado. `tramites` se lee sin bloquear: `transicionar` toma el
 * trámite antes que el documento, y al revés habría un interbloqueo.
 */
async function bloquearDocumento(tx: TransactionSql, documentoId: number): Promise<void> {
  const [documento] = await tx`SELECT id FROM documentos WHERE id = ${documentoId} FOR UPDATE`;
  if (!documento) throw new Error("El documento no existe");
}

/** La situación va en otra sentencia que el candado: así su foto es posterior a quien lo tenía. */
async function situacionBloqueada(tx: TransactionSql, documentoId: number): Promise<SituacionDocumento> {
  await bloquearDocumento(tx, documentoId);
  return leerSituacion(tx, documentoId);
}

/** Por qué el camino directo no da de alta este documento; null si puede (spec 13A §13.1 y §11.3). */
export function impedimentoDeRegistro(situacion: SituacionDocumento): string | null {
  if (situacion.anulado) return "Este documento fue eliminado: su código no se reutiliza";
  if (situacion.creacionCancelada) return "Esta creación se canceló: pida un trámite nuevo";
  if (situacion.origenVigente) return YA_VIGENTE;
  if (situacion.tramiteAbierto) return TRAMITE_ABIERTO;
  return null;
}

/**
 * Por qué no se deshace la versión vigente; null si se puede (spec 13A §13.2). Con una versión anulada
 * el documento no se podría registrar de nuevo: desde el dato no se distingue de uno eliminado (R26).
 */
export function impedimentoDeDeshacer(situacion: SituacionDocumento): string | null {
  if (situacion.origenVigente !== "fuera") return "Solo se deshace una carga registrada fuera de la plataforma";
  if (situacion.anulado) return "Este documento tiene una versión anulada: la corrección se pide por trámite";
  if (situacion.tramiteAbierto) return TRAMITE_ABIERTO;
  return null;
}

/** Lo que el camino directo permite: el servidor y la pantalla leen las mismas reglas. */
export function caminoDirecto(situacion: SituacionDocumento, cargaAbierta: boolean): { registrable: boolean; deshacible: boolean } {
  return {
    registrable: cargaAbierta && impedimentoDeRegistro(situacion) === null,
    deshacible: cargaAbierta && impedimentoDeDeshacer(situacion) === null,
  };
}

export async function exigirDocumentoRegistrable(tx: TransactionSql, documentoId: number): Promise<void> {
  const impedimento = impedimentoDeRegistro(await situacionBloqueada(tx, documentoId));
  if (impedimento) throw new Error(impedimento);
}

async function documentoDeVersion(tx: TransactionSql, versionId: number): Promise<number> {
  const [version] = await tx`SELECT documento_id FROM documento_versiones WHERE id = ${versionId}`;
  if (!version) throw new Error("La versión no existe");
  return Number(version.documento_id);
}

/** Lo que advierte el botón de publicar: un documento restringido no lo ve todo el hospital (spec 13A §12). */
export function avisoDePublicar(nivelAcceso: "general" | "restringido"): string {
  const queda = "Quedará vigente, con la aprobación registrada fuera de la plataforma";
  return nivelAcceso === "general"
    ? `${queda}, y visible para todo el hospital.`
    : `${queda}. Solo lo verán el Administrador del SGC, Gerencia, Control Interno y las personas asignadas a sus procesos.`;
}

/** Por qué no se edita cada grupo de datos de control; null si se puede (spec 13A §8.6). */
export type EdicionDeControl = { codigoYTipo: string | null; titulo: string | null };

/** Lo que publicar exige: al cambiar, el formulario empieza de nuevo y no queda en pantalla un error ya resuelto. */
export function claveDePublicar({ aprobo, fechaAprobacion, archivos }: Pick<VersionAdmin, "aprobo" | "fechaAprobacion" | "archivos">): string {
  return JSON.stringify([aprobo, fechaAprobacion, archivos.some((a) => a.rol === "principal")]);
}

export function edicionDeControl(situacion: SituacionDocumento, cargaAbierta: boolean): EdicionDeControl {
  if (situacion.tramiteAbierto) return { codigoYTipo: CONTROL_EN_TRAMITE, titulo: CONTROL_EN_TRAMITE };
  if (!situacion.publicado) return { codigoYTipo: null, titulo: null };
  return {
    codigoYTipo: "El código y el tipo no cambian: el documento ya fue publicado",
    titulo:
      cargaAbierta && situacion.origenVigente === "fuera" ? null : "El título de un documento vigente se cambia con un trámite",
  };
}

async function procesoDeAsociacion(tx: Cliente, { procesoId, subprocesoId }: AsociacionEntrada): Promise<number> {
  if (procesoId !== undefined) return procesoId;
  const [subproceso] = await tx`SELECT proceso_id FROM subprocesos WHERE id = ${subprocesoId ?? 0}`;
  return Number(subproceso?.proceso_id ?? 0);
}

/** El código que el panel quiere usar: con el formato configurado y sin que otro lo haya dejado. */
async function exigirCodigoDisponible(tx: Cliente, codigo: string, destino: DestinoDeCodigo, documentoId?: number): Promise<void> {
  await exigirFormatoDeCodigo(tx, codigo, destino);
  if (await codigoAbandonado(codigo, null, { sql: tx, documentoId })) throw errorDeCodigoRepetido(await sugerirCodigo(destino, { sql: tx }));
}

/** Una carga deshecha conserva su código: no se registra con otro, se reactiva desde su página (spec 13A §13.2). */
async function exigirQueNoSeaCargaDeshecha(tx: TransactionSql, codigo: string): Promise<void> {
  const [documento] = await tx`SELECT d.id FROM documentos d WHERE d.codigo = ${codigo}
    AND EXISTS (SELECT 1 FROM documento_versiones v WHERE v.documento_id = d.id AND v.estado = 'descartado')`;
  if (!documento || impedimentoDeRegistro(await leerSituacion(tx, Number(documento.id))) !== null) return;
  throw new Error(`${codigo} ya existe y su carga se deshizo: se reactiva desde la página del documento`);
}

/** Si el código ya existe lo dice en palabras. Va en un savepoint: tras un 23505 la transacción no admite más consultas. */
async function conCodigoUnico<T>(tx: TransactionSql, destino: DestinoDeCodigo, fn: (s: TransactionSql) => Promise<T>): Promise<T> {
  try {
    return (await tx.savepoint(fn)) as T;
  } catch (err) {
    if ((err as { constraint_name?: string }).constraint_name !== "documentos_codigo_unique") throw err;
    throw errorDeCodigoRepetido(await sugerirCodigo(destino, { sql: tx }));
  }
}

/** Registra un documento aprobado fuera de la plataforma: entra en borrador, con su número real de versión. */
export async function crearDocumento(
  datos: DatosAlta,
  usuarioId: number,
): Promise<{ documentoId: number; versionId: number }> {
  validarAsociaciones(datos.asociaciones);
  exigirNumeroDeVersion(datos.numeroInicial ?? 1);
  return await obtenerSql().begin(async (tx) => {
    await exigirCargaAbierta(tx);
    const principal = datos.asociaciones.find((a) => a.esPrincipal) as AsociacionEntrada;
    const destino = { procesoId: await procesoDeAsociacion(tx, principal), tipoDocumentoId: datos.tipoId };
    await exigirCodigoDisponible(tx, datos.codigo, destino);
    await exigirQueNoSeaCargaDeshecha(tx, datos.codigo);
    return conCodigoUnico(tx, destino, (s) => crearDocumentoEn(s, datos, usuarioId));
  });
}

/**
 * Abre un borrador en la versión siguiente, o en `numero` si no choca con lo ya publicado. Una versión
 * descartada libera su número.
 */
export async function crearVersionBorradorEn(
  tx: TransactionSql,
  documentoId: number,
  usuarioId: number,
  numero?: number,
): Promise<{ versionId: number; numero: number }> {
  const [borrador] = await tx`SELECT 1 FROM documento_versiones
    WHERE documento_id = ${documentoId} AND estado = 'borrador'`;
  if (borrador) {
    throw new Error("Ya hay una versión en borrador: publíquela o edítela");
  }
  const [{ siguiente }] = await tx`SELECT coalesce(max(numero), 0) + 1 AS siguiente
    FROM documento_versiones WHERE documento_id = ${documentoId} AND estado <> 'descartado'`;
  if (numero !== undefined && numero < siguiente) throw new Error(`La versión debe ser ${siguiente} o mayor`);
  const [version] = await tx`INSERT INTO documento_versiones (documento_id, numero, estado)
    VALUES (${documentoId}, ${numero ?? siguiente}, 'borrador') RETURNING id, numero`;
  await registrarAuditoria(tx, {
    usuarioId, accion: "crear_version", entidad: "documento_version",
    entidadId: version.id, detalle: { documentoId, numero: version.numero },
  });
  return { versionId: version.id, numero: version.numero };
}

/** Registra de nuevo un documento sin versión vigente: el que se cargó mal y se deshizo. */
export async function crearVersionBorrador(
  documentoId: number,
  usuarioId: number,
  numero?: number,
): Promise<{ versionId: number; numero: number }> {
  if (numero !== undefined) exigirNumeroDeVersion(numero);
  return await obtenerSql().begin(async (tx) => {
    await exigirCargaAbierta(tx);
    await exigirDocumentoRegistrable(tx, documentoId);
    return crearVersionBorradorEn(tx, documentoId, usuarioId, numero);
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
  opciones?: { sql?: Cliente },
): Promise<void> {
  await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    await exigirEscrituraEnVersion(tx, versionId);
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

export type DatosCatalogo = {
  descripcion: string | null;
  palabrasClave: string | null;
  asociaciones: AsociacionEntrada[];
  relacionados: number[];
  nivelAcceso: "general" | "restringido";
};

/** Los datos de catálogo con nombres y códigos, que es lo que la bitácora debe decir. */
async function leerCatalogo(tx: Cliente, documentoId: number) {
  const [d] = await tx`SELECT d.descripcion, d.palabras_clave, d.nivel_acceso,
      (SELECT coalesce(json_agg(r.codigo ORDER BY r.codigo), '[]') FROM documentos r
        WHERE EXISTS (SELECT 1 FROM documento_relaciones dr
          WHERE (dr.documento_id = d.id AND dr.relacionado_id = r.id) OR (dr.relacionado_id = d.id AND dr.documento_id = r.id))) AS relacionados,
      (SELECT coalesce(json_agg(a.nombre ORDER BY a.nombre), '[]') FROM (
        SELECT coalesce(p.nombre, ps.nombre || ' › ' || s.nombre) || CASE WHEN dp.es_principal THEN ' (propietario)' ELSE '' END AS nombre
        FROM documento_proceso dp
        LEFT JOIN procesos p ON p.id = dp.proceso_id
        LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
        LEFT JOIN procesos ps ON ps.id = s.proceso_id
        WHERE dp.documento_id = d.id) a) AS asociaciones
    FROM documentos d WHERE d.id = ${documentoId}`;
  return {
    descripcion: d.descripcion as string | null,
    palabrasClave: d.palabras_clave as string | null,
    nivelAcceso: d.nivel_acceso as string,
    asociaciones: d.asociaciones as string[],
    relacionados: d.relacionados as string[],
  };
}

/** El propietario es parte del código; en una creación en curso lo sigue `tramites.proceso_id`. */
async function exigirPropietarioIntacto(
  tx: TransactionSql,
  documentoId: number,
  principal: AsociacionEntrada | undefined,
  situacion: SituacionDocumento,
): Promise<void> {
  const [actual] = await tx`SELECT proceso_id, subproceso_id FROM documento_proceso
    WHERE documento_id = ${documentoId} AND es_principal`;
  const mismo =
    Number(actual?.proceso_id ?? 0) === (principal?.procesoId ?? 0) &&
    Number(actual?.subproceso_id ?? 0) === (principal?.subprocesoId ?? 0);
  if (mismo) return;
  if (situacion.publicado) throw new Error("El proceso propietario no cambia: es parte del código");
  if (situacion.tramiteAbierto) throw new Error("El proceso propietario de esta creación se corrige desde el trámite");
}

/** Lo que no es parte del contenido aprobado: se edita siempre, con trámite abierto o sin él (spec 13A §8.6). */
export async function editarCatalogo(
  documentoId: number,
  datos: DatosCatalogo,
  usuarioId: number,
  opciones?: { sql?: Cliente; ahora?: Date },
): Promise<void> {
  validarAsociaciones(datos.asociaciones);
  await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    const situacion = await situacionBloqueada(tx, documentoId);
    await exigirPropietarioIntacto(tx, documentoId, datos.asociaciones.find((a) => a.esPrincipal), situacion);
    const antes = await leerCatalogo(tx, documentoId);
    await tx`UPDATE documentos SET descripcion = ${datos.descripcion}, palabras_clave = ${datos.palabrasClave},
        nivel_acceso = ${datos.nivelAcceso}
      WHERE id = ${documentoId}`;
    await tx`DELETE FROM documento_proceso WHERE documento_id = ${documentoId}`;
    await insertarAsociaciones(tx, documentoId, datos.asociaciones);
    await reemplazarRelacionados(tx, documentoId, datos.relacionados);
    // Lo restringido o un cambio de procesos puede dejar fuera de la audiencia a quien ya tenía la tarea.
    await retirarAcusesFueraDeAudiencia(tx, documentoId, opciones?.ahora ?? new Date(), "salio_de_audiencia");
    const despues = await leerCatalogo(tx, documentoId);

    const cambiaron = (Object.keys(antes) as (keyof typeof antes)[]).filter(
      (dato) => JSON.stringify(antes[dato]) !== JSON.stringify(despues[dato]),
    );
    if (cambiaron.length === 0) return;
    const solo = (catalogo: typeof antes) => Object.fromEntries(cambiaron.map((dato) => [dato, catalogo[dato]]));
    await tx`UPDATE documentos SET actualizado_en = now() WHERE id = ${documentoId}`;
    await registrarAuditoria(tx, {
      usuarioId, accion: "editar_documento", entidad: "documento", entidadId: documentoId,
      detalle: { antes: solo(antes), despues: solo(despues) },
    });
  });
}

/**
 * Lo que identifica al documento (spec 13A §8.6). Sin versión publicada se corrige todo; después, solo
 * el título de lo cargado mientras la carga esté abierta. El código anterior queda en `detalle.antes`:
 * de ahí lo leen `codigoAbandonado` y `todosLosCodigos`, para que nadie más lo use.
 */
export async function editarControl(
  documentoId: number,
  datos: { codigo: string; titulo: string; tipoId: number },
  usuarioId: number,
): Promise<void> {
  await obtenerSql().begin(async (tx) => {
    const { publicacionDirecta } = await obtenerConfigDocumental({ sql: tx });
    const situacion = await situacionBloqueada(tx, documentoId);
    if (situacion.tramiteAbierto) throw new Error(CONTROL_EN_TRAMITE);
    const [actual] = await tx`SELECT d.codigo, d.titulo, d.tipo_id, t.nombre AS tipo
      FROM documentos d JOIN tipos_documento t ON t.id = d.tipo_id WHERE d.id = ${documentoId}`;
    const cambiaCodigo = datos.codigo !== actual.codigo;
    const cambiaTipo = datos.tipoId !== Number(actual.tipo_id);
    const cambiaTitulo = datos.titulo !== actual.titulo;
    if (!cambiaCodigo && !cambiaTipo && !cambiaTitulo) return;

    const permitido = edicionDeControl(situacion, publicacionDirecta);
    if ((cambiaCodigo || cambiaTipo) && permitido.codigoYTipo) throw new Error(permitido.codigoYTipo);
    if (cambiaTitulo && permitido.titulo) throw new Error(permitido.titulo);

    const [tipo] = await tx`SELECT nombre, activo FROM tipos_documento WHERE id = ${datos.tipoId}`;
    if (cambiaTipo && !tipo?.activo) throw new Error("El tipo de documento no existe o está inactivo");
    const [propietario] = await tx`SELECT coalesce(dp.proceso_id, s.proceso_id) AS proceso_id FROM documento_proceso dp
      LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
      WHERE dp.documento_id = ${documentoId} AND dp.es_principal`;
    const destino = { procesoId: Number(propietario?.proceso_id ?? 0), tipoDocumentoId: datos.tipoId };
    if (cambiaCodigo) await exigirCodigoDisponible(tx, datos.codigo, destino, documentoId);
    await conCodigoUnico(tx, destino, (s) => s`UPDATE documentos SET codigo = ${datos.codigo}, titulo = ${datos.titulo},
        tipo_id = ${datos.tipoId}, actualizado_en = now()
      WHERE id = ${documentoId}`);

    const antes: Record<string, unknown> = {};
    const despues: Record<string, unknown> = {};
    const anotar = (dato: string, de: unknown, a: unknown) => {
      antes[dato] = de;
      despues[dato] = a;
    };
    if (cambiaCodigo) anotar("codigo", actual.codigo, datos.codigo);
    if (cambiaTitulo) anotar("titulo", actual.titulo, datos.titulo);
    if (cambiaTipo) anotar("tipo", actual.tipo, tipo.nombre);
    await registrarAuditoria(tx, {
      usuarioId, accion: ACCION_EDITAR_CONTROL, entidad: "documento", entidadId: documentoId,
      detalle: { antes, despues },
    });
  });
}

/**
 * LA transacción del sistema (regla ISO 1): publicar una versión nueva vuelve
 * obsoleta la anterior en el mismo commit. El índice único parcial
 * versiones_una_vigente_idx la respalda en BD; el orden de los UPDATE importa
 * (primero obsoleto, luego vigente) para no chocar con el índice. La evidencia
 * de aprobación ya debe estar en la versión: la exige
 * versiones_vigente_con_aprobacion.
 */
export async function aplicarPublicacion(
  tx: TransactionSql,
  versionId: number,
  origen: "plataforma" | "fuera",
  usuarioId: number,
  ahora: Date = new Date(),
): Promise<{ documentoId: number; numero: number; obsoletas: number[] }> {
  const [version] = await tx`SELECT documento_id, numero, estado
    FROM documento_versiones WHERE id = ${versionId} FOR UPDATE`;
  if (version?.estado !== "borrador") {
    throw new Error("Solo se puede publicar una versión en borrador");
  }
  const documentoId = Number(version.documento_id);
  const anteriores = await tx`UPDATE documento_versiones SET estado = 'obsoleto'
    WHERE documento_id = ${documentoId} AND estado = 'vigente'
    RETURNING id, numero`;
  for (const anterior of anteriores) {
    await alDejarDeSerVigente(tx, Number(anterior.id), "nueva_version", ahora, { nuevaVersionId: versionId, actorId: usuarioId });
  }
  await tx`UPDATE documento_versiones
    SET estado = 'vigente', origen_aprobacion = ${origen}, publicado_en = ${ahora}
    WHERE id = ${versionId}`;
  await tx`UPDATE documentos SET actualizado_en = ${ahora} WHERE id = ${documentoId}`;
  const obsoletas = anteriores.map((a) => a.numero as number);
  await registrarAuditoria(tx, {
    usuarioId, accion: "publicar_version", entidad: "documento_version",
    entidadId: versionId,
    detalle: { documentoId, numero: version.numero, obsoletas },
  });
  return { documentoId, numero: version.numero, obsoletas };
}

/**
 * El camino directo del panel: evidencia escrita a mano, aprobada fuera de la plataforma. Solo da de
 * alta: nunca publica sobre una versión vigente, y una versión de un trámite se publica desde él.
 */
export async function publicarVersion(
  versionId: number,
  usuarioId: number,
): Promise<{ documentoId: number; obsoletas: number }> {
  const sql = obtenerSql();
  return await sql.begin(async (tx) => {
    await exigirCargaAbierta(tx);
    await exigirDocumentoRegistrable(tx, await documentoDeVersion(tx, versionId));
    const [version] = await tx`SELECT estado, aprobo, fecha_aprobacion
      FROM documento_versiones WHERE id = ${versionId} FOR UPDATE`;
    if (version.estado !== "borrador") {
      throw new Error("Solo se puede publicar una versión en borrador");
    }
    const [deTramite] = await tx`SELECT 1 FROM tramites WHERE version_id = ${versionId} LIMIT 1`;
    if (deTramite) throw new Error("Esta versión es de un trámite: se publica desde el trámite");
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

    const { documentoId, obsoletas } = await aplicarPublicacion(tx, versionId, "fuera", usuarioId);
    return { documentoId, obsoletas: obsoletas.length };
  });
}

/**
 * Devuelve a `descartado` una versión cargada por error: conserva sus archivos, queda en la bitácora y
 * libera su número. El documento conserva su código y queda listo para registrarse de nuevo (spec 13A §13.2).
 */
export function deshacerCarga(documentoId: number, motivo: string, usuarioId: number, ahora: Date = new Date()): Promise<void> {
  return obtenerSql().begin((tx) => deshacerCargaEn(tx, documentoId, motivo, usuarioId, ahora)) as Promise<void>;
}

export async function deshacerCargaEn(
  tx: TransactionSql,
  documentoId: number,
  motivo: string,
  usuarioId: number,
  ahora: Date = new Date(),
): Promise<void> {
  const razon = motivo.trim();
  if (!razon) throw new Error("Escriba el motivo");
  await exigirCargaAbierta(tx);
  const impedimento = impedimentoDeDeshacer(await situacionBloqueada(tx, documentoId));
  if (impedimento) throw new Error(impedimento);
  const [version] = await tx`UPDATE documento_versiones SET estado = 'descartado'
    WHERE documento_id = ${documentoId} AND estado = 'vigente'
    RETURNING id, numero`;
  await alDejarDeSerVigente(tx, Number(version.id), "carga_deshecha", ahora, { actorId: usuarioId });
  await tx`UPDATE documentos SET actualizado_en = now() WHERE id = ${documentoId}`;
  await registrarAuditoria(tx, {
    usuarioId, accion: "deshacer_carga", entidad: "documento", entidadId: documentoId,
    detalle: { versionId: version.id, numero: version.numero, motivo: razon },
  });
}

/**
 * Con la carga cerrada también se puede: un borrador pendiente impide aceptar una solicitud sobre su
 * documento, y sin esta salida el documento quedaría bloqueado (R24).
 */
export async function descartarBorrador(versionId: number, usuarioId: number): Promise<void> {
  await obtenerSql().begin(async (tx) => {
    const documentoId = await documentoDeVersion(tx, versionId);
    await bloquearDocumento(tx, documentoId);
    const [abierto] = await tx`SELECT 1 FROM tramites WHERE version_id = ${versionId} AND etapa = ANY(${ETAPAS_ABIERTAS})`;
    if (abierto) throw new ErrorTramite(VERSION_EN_TRAMITE);
    const [version] = await tx`UPDATE documento_versiones SET estado = 'descartado'
      WHERE id = ${versionId} AND estado = 'borrador'
      RETURNING numero`;
    if (!version) throw new Error("Solo se descarta una versión en borrador");
    await tx`UPDATE documentos SET actualizado_en = now() WHERE id = ${documentoId}`;
    await registrarAuditoria(tx, {
      usuarioId, accion: "descartar_borrador", entidad: "documento_version", entidadId: versionId,
      detalle: { documentoId, numero: version.numero },
    });
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
    versionId: number | null; rol: string; ruta: string; nombreOriginal: string;
    extension: string; mime: string; tamanoBytes: number; hashSha256: string;
    /** Solo las evidencias: `versionId` es nulo y el contexto dice a qué cuelgan. */
    contexto?: string; contextoId?: number | null;
  },
  usuarioId: number,
  opciones?: OpcionesEscritura,
): Promise<{ id: number }> {
  try {
    return await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
      if (datos.versionId === null) {
        if (!datos.contexto || datos.contexto === "version" || datos.contextoId == null) {
          throw new Error("Una evidencia necesita su contexto");
        }
        const [evidencia] = await tx`INSERT INTO archivos
            (version_id, contexto, contexto_id, rol, ruta, nombre_original, extension, mime, tamano_bytes, hash_sha256)
          VALUES (NULL, ${datos.contexto}, ${datos.contextoId}, ${datos.rol}, ${datos.ruta}, ${datos.nombreOriginal},
                  ${datos.extension}, ${datos.mime}, ${datos.tamanoBytes}, ${datos.hashSha256})
          RETURNING id`;
        await registrarAuditoria(tx, {
          usuarioId, accion: "subir_archivo", entidad: "archivo", entidadId: evidencia.id,
          detalle: {
            contexto: datos.contexto, contextoId: datos.contextoId, rol: datos.rol, nombre: datos.nombreOriginal,
          },
        });
        return { id: evidencia.id };
      }
      await exigirEscrituraEnVersion(tx, datos.versionId, desdeTramite(opciones, usuarioId));
      // Choca con el `FOR UPDATE` de publicar: lo que esperaba el candado ve la versión ya publicada.
      const [version] = await tx`SELECT estado FROM documento_versiones WHERE id = ${datos.versionId} FOR SHARE`;
      if (version?.estado !== "borrador") throw new ErrorTramite("Solo se pueden subir archivos a una versión en borrador");
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

export async function obtenerArchivoAdmin(archivoId: number, opciones?: { sql?: Cliente }) {
  const sql = opciones?.sql ?? obtenerSql();
  const [a] = await sql`SELECT a.id, a.ruta, a.mime, a.nombre_original, a.version_id,
      v.estado, v.documento_id
    FROM archivos a JOIN documento_versiones v ON v.id = a.version_id
    WHERE a.id = ${archivoId} AND a.rol = ANY(${ROLES_ARCHIVO_LISTA})`;
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
    if (!destino) throw new ErrorTramite("El archivo no existe");
    await exigirEscrituraEnVersion(tx, destino.version_id, desdeTramite(opciones, usuarioId));
    const [archivo] = await tx`SELECT a.id, a.ruta, a.nombre_original, v.estado
      FROM archivos a JOIN documento_versiones v ON v.id = a.version_id
      WHERE a.id = ${archivoId} FOR UPDATE`;
    if (!archivo) throw new ErrorTramite("El archivo no existe");
    if (archivo.estado !== "borrador") {
      throw new ErrorTramite("Solo se pueden eliminar archivos de una versión en borrador");
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
  anulado: boolean;
  /** Todas sus versiones están descartadas: una creación cancelada, o una carga deshecha o descartada. */
  descartado: boolean;
  actualizadoEn: string;
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
      EXISTS (SELECT 1 FROM documento_versiones WHERE documento_id = d.id AND estado = 'anulado') AS anulado,
      NOT EXISTS (SELECT 1 FROM documento_versiones WHERE documento_id = d.id AND estado <> 'descartado') AS descartado
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
    anulado: f.anulado, descartado: f.descartado, actualizadoEn: String(f.actualizado_en),
  }));
}

/** Uno con todas sus versiones descartadas se lista para poder revisarlo, pero no es un documento del SGC. */
export function documentosEnElSgc(filas: FilaDocumentoAdmin[]): number {
  return filas.filter((f) => !f.descartado).length;
}

/** Sin versión vigente ni borrador, el estado del documento es el de lo que queda de él. */
export function estadoSinVersionActiva(fila: FilaDocumentoAdmin): "anulado" | "descartado" | "obsoleto" {
  return fila.anulado ? "anulado" : fila.descartado ? "descartado" : "obsoleto";
}

export type OpcionDocumento = { id: number; codigo: string; titulo: string };

/** Lo que se puede relacionar: los documentos vigentes y lo que ya lo estaba, nunca el propio documento. */
export function documentosRelacionables(
  filas: FilaDocumentoAdmin[],
  documento?: { id: number; relacionados: number[] },
): OpcionDocumento[] {
  return filas
    .filter((f) => f.id !== documento?.id && (f.versionVigente !== null || documento?.relacionados.includes(f.id)))
    .map(({ id, codigo, titulo }) => ({ id, codigo, titulo }))
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
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
  /** null en lo que nunca se publicó: un borrador, o uno que se descartó sin publicarse. */
  origenAprobacion: OrigenAprobacion | null;
  fechaElaboracion: string | null; fechaRevision: string | null;
  fechaAprobacion: string | null; elaboro: string | null;
  reviso: string | null; aprobo: string | null; resumenCambios: string | null;
  archivos: Array<{ id: number; rol: string; nombreOriginal: string; mime: string; tamanoBytes: number }>;
  /** El trámite abierto al que pertenece la versión: mientras dure, se trabaja desde él. */
  tramite: { id: number; numero: string } | null;
  /**
   * Los trámites que cerraron la versión: el que la publicó y, si después se eliminó el documento, el que
   * la anuló, cada uno con su acta; o el que se canceló y la dejó descartada, que no tiene acta.
   */
  cierres: { id: number; etapa: "publicado" | "eliminado" | "cancelado" }[];
};

export type DocumentoAdmin = {
  id: number; codigo: string; titulo: string; tipoId: number; tipoNombre: string;
  descripcion: string | null; palabrasClave: string | null;
  nivelAcceso: "general" | "restringido";
  asociaciones: Array<{ procesoId: number | null; subprocesoId: number | null; nombre: string; esPrincipal: boolean }>;
  relacionados: number[];
  versiones: VersionAdmin[];
  situacion: SituacionDocumento;
};

/**
 * Detalle del panel: null si el sujeto no pasa la regla de acceso. Las versiones
 * en borrador o descartadas solo llegan a quien administra; a quien no le queda
 * ninguna otra versión, el documento tampoco existe (F13A-DC13).
 */
export async function obtenerDocumentoAdmin(
  codigo: string,
  sujeto: SujetoVisibilidad,
  opciones?: { sql?: Cliente },
): Promise<DocumentoAdmin | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const administra = puede(sujeto, "documentos.administrar");
  const [doc] = await sql`SELECT d.id, d.codigo, d.titulo, d.tipo_id, t.nombre AS tipo_nombre,
      d.descripcion, d.palabras_clave, d.nivel_acceso
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
    SELECT v.id, v.numero, v.estado, v.fecha_elaboracion::text AS fecha_elaboracion,
      v.fecha_revision::text AS fecha_revision, v.fecha_aprobacion::text AS fecha_aprobacion,
      v.elaboro, v.reviso, v.aprobo, v.resumen_cambios,
      CASE WHEN v.estado IN ('vigente', 'obsoleto', 'anulado') OR v.publicado_en IS NOT NULL
        THEN v.origen_aprobacion END AS origen_aprobacion,
      coalesce(json_agg(json_build_object(
          'id', a.id, 'rol', a.rol, 'nombreOriginal', a.nombre_original,
          'mime', a.mime, 'tamanoBytes', a.tamano_bytes) ORDER BY a.rol)
        FILTER (WHERE a.id IS NOT NULL), '[]') AS archivos,
      (SELECT json_build_object('id', t.id, 'numero', t.numero) FROM tramites t
        WHERE t.version_id = v.id AND t.etapa = ANY(${ETAPAS_ABIERTAS})) AS tramite,
      (SELECT coalesce(json_agg(json_build_object('id', t.id, 'etapa', t.etapa) ORDER BY t.id), '[]') FROM tramites t
        WHERE t.version_id = v.id AND (t.etapa IN ('publicado', 'eliminado') OR (t.etapa = 'cancelado' AND v.estado = 'descartado'))) AS cierres
    FROM documento_versiones v
    LEFT JOIN archivos a ON a.version_id = v.id AND a.rol = ANY(${ROLES_ARCHIVO_LISTA})
    WHERE v.documento_id = ${doc.id}
      ${administra ? sql`` : sql`AND v.estado NOT IN ('borrador', 'descartado')`}
    GROUP BY v.id ORDER BY v.numero DESC, v.id DESC`;
  if (!administra && versiones.length === 0) return null;

  const [relacionados, situacion] = await Promise.all([
    relacionadosDe(sql, doc.id),
    leerSituacion(sql, doc.id),
  ]);

  return {
    id: doc.id, codigo: doc.codigo, titulo: doc.titulo, tipoId: doc.tipo_id,
    tipoNombre: doc.tipo_nombre, descripcion: doc.descripcion,
    palabrasClave: doc.palabras_clave, nivelAcceso: doc.nivel_acceso,
    relacionados,
    situacion,
    asociaciones: asociaciones.map((a) => ({
      procesoId: a.proceso_id, subprocesoId: a.subproceso_id,
      nombre: a.nombre, esPrincipal: a.es_principal,
    })),
    versiones: versiones.map((v) => ({
      id: v.id, numero: v.numero, estado: v.estado,
      origenAprobacion: v.origen_aprobacion,
      fechaElaboracion: v.fecha_elaboracion, fechaRevision: v.fecha_revision,
      fechaAprobacion: v.fecha_aprobacion, elaboro: v.elaboro, reviso: v.reviso,
      aprobo: v.aprobo, resumenCambios: v.resumen_cambios,
      archivos: v.archivos as VersionAdmin["archivos"],
      tramite: v.tramite as VersionAdmin["tramite"],
      cierres: v.cierres as VersionAdmin["cierres"],
    })),
  };
}

export async function anularVigenteEn(
  tx: TransactionSql,
  documentoId: number,
  usuarioId: number,
  ahora: Date = new Date(),
): Promise<{ versionId: number; numero: number }> {
  const [anulada] = await tx`UPDATE documento_versiones SET estado = 'anulado'
    WHERE documento_id = ${documentoId} AND estado = 'vigente'
    RETURNING id, numero`;
  if (!anulada) {
    throw new Error("El documento no tiene versión vigente que anular");
  }
  await alDejarDeSerVigente(tx, Number(anulada.id), "eliminado", ahora, { actorId: usuarioId });
  await registrarAuditoria(tx, {
    usuarioId, accion: "anular_documento", entidad: "documento",
    entidadId: documentoId, detalle: { versionAnulada: anulada.numero },
  });
  return { versionId: Number(anulada.id), numero: anulada.numero };
}
