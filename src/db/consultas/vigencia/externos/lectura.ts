/** La lectura de los externos: su página de control, la matriz y los archivos de la edición (spec 13C §8.6 y §8.8). */
import { cache } from "react";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import type { ArchivoFicha } from "@/db/consultas/documentos";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import {
  alcanceProcesos,
  enAlcance,
  filtroAcceso,
  filtroAccesoDe,
  puedeGestionarExterno,
  puedeVerExterno,
  type Alcance,
  type SujetoVisibilidad,
} from "@/lib/alcance";
import { puede } from "@/lib/permisos";
import { ROLES_ARCHIVO_LISTA } from "@/lib/subida";
import { SIN_EDICION_ADOPTADA } from "@/lib/vigencia/semaforo";
import type { ResultadoVerificacion } from "@/lib/vigencia/tipos";
import {
  leerSituacion,
  normaEnlazada,
  type DestinoDeEdicion,
  type Externo,
  type FichaExterno,
  type FilaExterno,
  type FiltroExternos,
  type OpcionesDeExterno,
  type Opciones,
} from "./comun";
import { vigenciaEnLista, vigenciaPorDocumento } from "../fragmentos";

const SIN_VIGENCIA: Externo["vigencia"] = { estado: "atencion", dias: null, proxima: null };
const ESTADOS_COPIA_VIVA = ["emitida", "recibida", "por_recoger"];

/**
 * Quién verifica un externo (spec 13C §8.4): uno activo (no retirado) con edición vigente, con `externos.verificar` y
 * gestionándolo o siendo su responsable técnico. La única regla: la usan su página (`acciones.verificar`) y la tabla de
 * la revisión anual (`externosVerificables`).
 */
function verificaElExterno(
  sujeto: SujetoVisibilidad,
  d: { activo: boolean; conVigente: boolean; procesoId: number; responsableId: number },
  alcance: Alcance,
): boolean {
  if (!d.activo || !d.conVigente || !puede(sujeto, "externos.verificar")) return false;
  return puedeGestionarExterno(sujeto, d.procesoId, alcance) || d.responsableId === sujeto.usuarioId;
}

/** Lo que el formulario de verificación necesita de un externo: su fuente oficial y su periodicidad. */
export type ExternoVerificable = { fuenteOficial: string | null; verificacionMeses: number };

/**
 * De los externos de `documentoIds`, los que la persona puede verificar (`verificaElExterno`, la regla de su página), con
 * lo que su formulario necesita. Una sola sentencia; quien llama ya recortó los documentos a los que la persona ve.
 */
export async function externosVerificables(
  documentoIds: number[],
  sesion: SesionFlujo,
  opciones?: Opciones,
): Promise<Map<number, ExternoVerificable>> {
  const verificables = new Map<number, ExternoVerificable>();
  if (documentoIds.length === 0 || !puede(sesion, "externos.verificar")) return verificables;
  const sql = opciones?.sql ?? obtenerSql();
  const [filas, alcance] = await Promise.all([
    sql`SELECT ex.documento_id, ex.responsable_id, ex.fuente_oficial, ex.verificacion_meses, COALESCE(dp.proceso_id, s.proceso_id) AS proceso_id,
        v.id IS NOT NULL AS con_vigente,
        NOT EXISTS (SELECT 1 FROM documento_versiones va WHERE va.documento_id = ex.documento_id AND va.estado = 'anulado') AS activo
      FROM externos ex
      LEFT JOIN documento_versiones v ON v.documento_id = ex.documento_id AND v.estado = 'vigente'
      JOIN documento_proceso dp ON dp.documento_id = ex.documento_id AND dp.es_principal
      LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
      WHERE ex.documento_id = ANY(${documentoIds})`,
    alcanceProcesos(sesion, { sql }),
  ]);
  for (const f of filas) {
    const datos = { activo: f.activo as boolean, conVigente: f.con_vigente as boolean, procesoId: Number(f.proceso_id), responsableId: Number(f.responsable_id) };
    if (!verificaElExterno(sesion, datos, alcance)) continue;
    verificables.set(Number(f.documento_id), {
      fuenteOficial: (f.fuente_oficial as string | null) ?? null,
      verificacionMeses: Number(f.verificacion_meses),
    });
  }
  return verificables;
}

/** La página de control de un externo (spec 13C §8.8), para quien `puedeVerExterno`; null para los demás. */
export async function obtenerExterno(documentoId: number, sesion: SesionFlujo, opciones?: Opciones): Promise<Externo | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  if (!(await puedeVerExterno(documentoId, sesion, { sql }))) return null;

  const [f] = await sql`
    SELECT d.id, d.codigo, d.titulo, d.nivel_acceso, p.id AS proceso_id, p.nombre AS proceso_nombre, p.sigla AS proceso_sigla,
      ex.entidad_emisora, ex.titulo_original, ex.fuente_oficial, ex.responsable_id, ru.nombre AS responsable,
      ex.verificacion_meses, ex.edicion_nueva_pendiente_desde
    FROM documentos d
    JOIN externos ex ON ex.documento_id = d.id
    JOIN usuarios ru ON ru.id = ex.responsable_id
    JOIN documento_proceso dp ON dp.documento_id = d.id AND dp.es_principal
    LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
    JOIN procesos p ON p.id = COALESCE(dp.proceso_id, s.proceso_id)
    WHERE d.id = ${documentoId}`;
  const versiones = await sql`
    SELECT v.id, v.numero, v.estado, v.edicion_externa, v.fecha_edicion_externa::text AS fecha_edicion, v.resumen_cambios,
      v.publicado_en, v.aprobo,
      (SELECT fi.nombre_firmante FROM firmas fi WHERE fi.version_id = v.id AND fi.firma = 'adopto' ORDER BY fi.id DESC LIMIT 1) AS adopto
    FROM documento_versiones v
    WHERE v.documento_id = ${documentoId} AND v.estado <> 'descartado'
    ORDER BY v.numero DESC`;
  const verificaciones = await sql`
    SELECT ev.id, ev.resultado, ev.fuente_consultada, ev.nota, u.nombre, ev.creado_en, v.numero
    FROM externo_verificaciones ev
    JOIN usuarios u ON u.id = ev.usuario_id
    JOIN documento_versiones v ON v.id = ev.version_id
    WHERE ev.documento_id = ${documentoId}
    ORDER BY ev.creado_en DESC, ev.id DESC`;
  const norma = await normaEnlazada(sql, documentoId);

  const procesoId = Number(f.proceso_id);
  const responsableId = Number(f.responsable_id);
  const alcance = await alcanceProcesos(sesion, { sql });
  const gestiona = puedeGestionarExterno(sesion, procesoId, alcance);
  const vigente = versiones.find((v) => v.estado === "vigente");
  const borrador = versiones.find((v) => v.estado === "borrador");
  const activo = !versiones.some((v) => v.estado === "anulado");
  const archivos = gestiona && borrador
    ? await sql`SELECT id, rol, nombre_original, extension, mime, tamano_bytes, hash_sha256 FROM archivos
        WHERE version_id = ${borrador.id} AND rol = ANY(${ROLES_ARCHIVO_LISTA}) ORDER BY id`
    : [];
  const fila = vigente ? (await vigenciaPorDocumento(sql, [documentoId], ahora)).get(documentoId) : undefined;
  const instante = (v: unknown): Date | null => (v === null || v === undefined ? null : new Date(v as string));

  return {
    documentoId,
    codigo: f.codigo as string,
    titulo: f.titulo as string,
    nivelAcceso: f.nivel_acceso as Externo["nivelAcceso"],
    proceso: { id: procesoId, nombre: f.proceso_nombre as string, sigla: f.proceso_sigla as string },
    control: {
      entidadEmisora: f.entidad_emisora as string,
      tituloOriginal: (f.titulo_original as string | null) ?? null,
      fuenteOficial: (f.fuente_oficial as string | null) ?? null,
      responsable: { id: responsableId, nombre: f.responsable as string },
      verificacionMeses: Number(f.verificacion_meses),
      norma,
      edicionNuevaPendienteDesde: instante(f.edicion_nueva_pendiente_desde),
    },
    vigente: vigente
      ? {
          versionId: Number(vigente.id),
          numero: vigente.numero as number,
          edicion: (vigente.edicion_externa as string | null) ?? "",
          fechaEdicion: (vigente.fecha_edicion as string | null) ?? null,
          adoptadaEn: new Date(vigente.publicado_en as string),
          adoptoPor: ((vigente.adopto ?? vigente.aprobo) as string | null) ?? "",
        }
      : null,
    borrador: gestiona && borrador
      ? {
          versionId: Number(borrador.id),
          numero: borrador.numero as number,
          edicion: (borrador.edicion_externa as string | null) ?? "",
          fechaEdicion: (borrador.fecha_edicion as string | null) ?? null,
          resumenCambios: (borrador.resumen_cambios as string | null) ?? null,
          huella: (archivos.find((a) => a.rol === "principal")?.hash_sha256 as string | null | undefined) ?? null,
          archivos: archivos.map((a) => ({
            id: Number(a.id),
            rol: a.rol as ArchivoFicha["rol"],
            nombreOriginal: a.nombre_original as string,
            extension: a.extension as string,
            mime: a.mime as string,
            tamanoBytes: Number(a.tamano_bytes),
          })),
        }
      : null,
    ediciones: versiones
      .filter((v) => v.estado !== "borrador")
      .map((v) => ({
        numero: v.numero as number,
        edicion: (v.edicion_externa as string | null) ?? "",
        estado: v.estado as string,
        adoptadaEn: instante(v.publicado_en),
      })),
    verificaciones: verificaciones.map((v) => ({
      id: Number(v.id),
      resultado: v.resultado as ResultadoVerificacion,
      fuente: v.fuente_consultada as string,
      nota: (v.nota as string | null) ?? null,
      nombre: v.nombre as string,
      creadoEn: new Date(v.creado_en as string),
      version: v.numero as number,
    })),
    vigencia: fila ? { ...fila.vigencia, proxima: fila.proximaRevision } : SIN_VIGENCIA,
    impacto: fila?.impacto ? { norma: fila.impacto.norma } : null,
    retirado: !activo,
    acciones: {
      editar: gestiona && activo,
      abrirEdicion: gestiona && activo && !borrador,
      adoptar: gestiona && activo && borrador !== undefined,
      verificar: verificaElExterno(sesion, { activo, conVigente: vigente !== undefined, procesoId, responsableId }, alcance),
      retirar: gestiona && activo && vigente !== undefined,
    },
  };
}

function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * La matriz de externos (spec 13C §8.6): los que no se han retirado, para quien tiene `vigencia.ver` sobre su proceso
 * propietario (el líder, sus procesos) y, para su responsable técnico, los suyos; siempre por nivel de acceso. Un
 * externo aún sin adoptar sale en atención, sin fecha. El estado se filtra sobre el calculado.
 */
export async function listarExternos(sesion: SesionFlujo, filtro: FiltroExternos, opciones?: Opciones): Promise<FilaExterno[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const alcance = await alcanceProcesos(sesion, { sql });
  const porProceso = !puede(sesion, "vigencia.ver")
    ? sql`false`
    : alcance.todos
      ? sql`true`
      : sql`p.id = ANY(${alcance.procesoIds})`;
  const q = filtro.q?.trim();
  const patron = q ? `%${escaparLike(q)}%` : null;
  const filas = await sql`
    SELECT d.id, d.codigo, d.titulo, p.id AS proceso_id, p.nombre AS proceso_nombre, p.sigla AS proceso_sigla,
      ex.entidad_emisora, ex.titulo_original, ex.fuente_oficial, ex.responsable_id, ru.nombre AS responsable,
      v.id AS version_id, v.edicion_externa, v.publicado_en,
      uv.creado_en AS verificado_en, uv.resultado, uv.nombre AS verifico,
      (SELECT concat_ws(' ', tn.nombre, n.numero, 'de', n.anio::text)
        FROM norma_documentos nd JOIN normas n ON n.id = nd.norma_id JOIN tipos_norma tn ON tn.id = n.tipo_norma_id
        WHERE nd.documento_id = d.id ORDER BY nd.id LIMIT 1) AS norma,
      (SELECT count(*)::int FROM copias_controladas cc JOIN documento_versiones cv ON cv.id = cc.version_id
        WHERE cv.documento_id = d.id AND cc.estado IN ${sql(ESTADOS_COPIA_VIVA)}) AS copias_vivas
    FROM documentos d
    JOIN externos ex ON ex.documento_id = d.id
    JOIN usuarios ru ON ru.id = ex.responsable_id
    JOIN documento_proceso dp ON dp.documento_id = d.id AND dp.es_principal
    LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
    JOIN procesos p ON p.id = COALESCE(dp.proceso_id, s.proceso_id)
    LEFT JOIN documento_versiones v ON v.documento_id = d.id AND v.estado = 'vigente'
    LEFT JOIN LATERAL (
      SELECT ev.creado_en, ev.resultado, u.nombre
      FROM externo_verificaciones ev JOIN usuarios u ON u.id = ev.usuario_id
      WHERE ev.version_id = v.id
      ORDER BY ev.creado_en DESC, ev.id DESC LIMIT 1
    ) uv ON true
    WHERE d.origen = 'externo'
      AND NOT EXISTS (SELECT 1 FROM documento_versiones x WHERE x.documento_id = d.id AND x.estado = 'anulado')
      AND ${filtroAcceso(sql, sesion)}
      AND (ex.responsable_id = ${sesion.usuarioId} OR ${porProceso})
      ${filtro.procesoId === undefined ? sql`` : sql`AND p.id = ${filtro.procesoId}`}
      ${filtro.responsableId === undefined ? sql`` : sql`AND ex.responsable_id = ${filtro.responsableId}`}
      ${patron === null
        ? sql``
        : sql`AND (d.codigo ILIKE ${patron} OR unaccent(d.titulo) ILIKE unaccent(${patron})
            OR unaccent(coalesce(ex.titulo_original, '')) ILIKE unaccent(${patron}) OR unaccent(ex.entidad_emisora) ILIKE unaccent(${patron}))`}
    ORDER BY d.codigo`;

  const conVigente = filas.filter((f) => f.version_id !== null).map((f) => Number(f.id));
  const vigencias = await vigenciaPorDocumento(sql, conVigente, ahora);
  const lista: FilaExterno[] = filas.map((f) => {
    const v = vigencias.get(Number(f.id));
    return {
      documentoId: Number(f.id),
      codigo: f.codigo as string,
      titulo: f.titulo as string,
      proceso: { id: Number(f.proceso_id), nombre: f.proceso_nombre as string, sigla: f.proceso_sigla as string },
      vigencia: v ? { ...v.vigencia, proxima: v.proximaRevision } : SIN_VIGENCIA,
      impacto: v?.impacto ? { norma: v.impacto.norma } : null,
      tituloOriginal: (f.titulo_original as string | null) ?? null,
      emisor: f.entidad_emisora as string,
      edicion: (f.edicion_externa as string | null) ?? null,
      adoptadaEn: f.publicado_en === null ? null : new Date(f.publicado_en as string),
      ultimaVerificacion:
        f.verificado_en === null
          ? null
          : { fecha: new Date(f.verificado_en as string), resultado: f.resultado as ResultadoVerificacion, nombre: f.verifico as string },
      proximaVerificacion: v?.proximaRevision ?? null,
      responsable: f.responsable as string,
      responsableId: Number(f.responsable_id),
      fuenteOficial: (f.fuente_oficial as string | null) ?? null,
      norma: (f.norma as string | null) ?? null,
      copiasVivas: Number(f.copias_vivas),
      edicionPendiente: v?.edicionPendiente ?? null,
    };
  });
  const estado = filtro.estado ?? "todos";
  return estado === "todos" ? lista : lista.filter((f) => f.vigencia.estado === estado);
}

/**
 * `esResponsableTecnico` una vez por petición (Ruling 68): la preguntan el cascarón (la barra y las tareas) y la guarda de
 * las pestañas de Vigencia (`exigirVigencia`); `React.cache` comparte la respuesta en la misma petición, también si falla.
 */
export const esResponsableTecnicoDePeticion = cache((usuarioId: number): Promise<boolean> => esResponsableTecnico(usuarioId));

/**
 * Si la persona responde por la vigencia de algún externo que no se ha retirado y que todavía ve (la entrada «Vigencia» de
 * la barra): un restringido que dejó de ver no le da la entrada.
 */
export async function esResponsableTecnico(usuarioId: number, opciones?: { sql?: Cliente }): Promise<boolean> {
  const sql = opciones?.sql ?? obtenerSql();
  const [f] = await sql`SELECT EXISTS (
      SELECT 1 FROM externos ex JOIN documentos d ON d.id = ex.documento_id
      WHERE ex.responsable_id = ${usuarioId} AND d.origen = 'externo' AND ${filtroAccesoDe(sql, sql`ex.responsable_id`)}
        AND NOT EXISTS (SELECT 1 FROM documento_versiones x WHERE x.documento_id = d.id AND x.estado = 'anulado')
    ) AS es`;
  return f.es as boolean;
}

/**
 * El bloque «Documento externo» de la ficha (spec 13C §14.4), para quien ve el documento (`filtroAcceso`): sus datos de
 * control, la edición adoptada y su verificación. Uno sin edición adoptada solo existe para quien llega a su página de
 * control: la ficha de lectura no existe sin vigente. null si no es un externo o la persona no lo ve.
 */
export async function fichaDeExterno(documentoId: number, sesion: SesionFlujo, opciones?: Opciones): Promise<FichaExterno | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const [f] = await sql`
    SELECT d.id, d.codigo, ex.entidad_emisora, ex.titulo_original, ex.fuente_oficial, ex.verificacion_meses, ru.nombre AS responsable,
      v.id AS version_id, v.numero, v.edicion_externa, v.fecha_edicion_externa::text AS fecha_edicion, v.publicado_en, v.aprobo,
      (SELECT fi.nombre_firmante FROM firmas fi WHERE fi.version_id = v.id AND fi.firma = 'adopto' ORDER BY fi.id DESC LIMIT 1) AS adopto,
      uv.creado_en AS verificado_en, uv.resultado, uv.nombre AS verifico
    FROM documentos d
    JOIN externos ex ON ex.documento_id = d.id
    JOIN usuarios ru ON ru.id = ex.responsable_id
    LEFT JOIN documento_versiones v ON v.documento_id = d.id AND v.estado = 'vigente'
    LEFT JOIN LATERAL (
      SELECT ev.creado_en, ev.resultado, u.nombre
      FROM externo_verificaciones ev JOIN usuarios u ON u.id = ev.usuario_id
      WHERE ev.version_id = v.id
      ORDER BY ev.creado_en DESC, ev.id DESC LIMIT 1
    ) uv ON true
    WHERE d.id = ${documentoId} AND d.origen = 'externo' AND ${filtroAcceso(sql, sesion)}`;
  if (!f) return null;
  const gestionable = await puedeVerExterno(documentoId, sesion, { sql });
  if (f.version_id === null && !gestionable) return null;

  const fila = f.version_id === null ? undefined : (await vigenciaPorDocumento(sql, [documentoId], ahora)).get(documentoId);
  const norma = await normaEnlazada(sql, documentoId);
  return {
    documentoId,
    codigo: f.codigo as string,
    emisor: f.entidad_emisora as string,
    tituloOriginal: (f.titulo_original as string | null) ?? null,
    fuenteOficial: (f.fuente_oficial as string | null) ?? null,
    responsable: f.responsable as string,
    verificacionMeses: Number(f.verificacion_meses),
    norma: norma?.nombre ?? null,
    vigente:
      f.version_id === null
        ? null
        : {
            numero: f.numero as number,
            edicion: (f.edicion_externa as string | null) ?? "",
            fechaEdicion: (f.fecha_edicion as string | null) ?? null,
            adoptadaEn: new Date(f.publicado_en as string),
            adoptoPor: ((f.adopto ?? f.aprobo) as string | null) ?? "",
          },
    ultimaVerificacion:
      f.verificado_en === null
        ? null
        : { fecha: new Date(f.verificado_en as string), resultado: f.resultado as ResultadoVerificacion, nombre: f.verifico as string },
    vigencia: fila
      ? { ...vigenciaEnLista(fila), proxima: fila.proximaRevision }
      : { estado: "atencion", dias: null, texto: SIN_EDICION_ADOPTADA, proxima: null },
    gestionable,
  };
}

/**
 * Lo que el alta de un externo y la edición de sus datos de control ofrecen (spec 13C §8.2): los procesos del alcance
 * de quien registra con su líder (el responsable técnico por defecto), todos los procesos activos para «también
 * aplica en», las personas activas y las normas. Un responsable que no ve un restringido lo rechaza el dominio.
 */
export async function opcionesDeExterno(sesion: SesionFlujo, opciones?: { sql?: Cliente }): Promise<OpcionesDeExterno> {
  const sql = opciones?.sql ?? obtenerSql();
  const [procesos, personas, normas, alcance, config] = await Promise.all([
    sql`
      SELECT p.id, p.nombre, p.sigla,
        coalesce((SELECT json_agg(json_build_object('id', s.id, 'nombre', s.nombre) ORDER BY s.orden, s.id)
          FROM subprocesos s WHERE s.proceso_id = p.id AND s.activo), '[]') AS subprocesos,
        (SELECT u.id FROM usuario_procesos up JOIN usuarios u ON u.id = up.usuario_id AND u.activo AND u.rol = 'lider_proceso'
          WHERE up.proceso_id = p.id ORDER BY u.nombre, u.id LIMIT 1) AS lider_id
      FROM procesos p WHERE p.activo ORDER BY p.nombre`,
    sql`SELECT u.id, u.nombre, c.nombre AS cargo FROM usuarios u LEFT JOIN cargos c ON c.id = u.cargo_id
      WHERE u.activo ORDER BY u.nombre, u.id`,
    sql`SELECT n.id, concat_ws(' ', tn.nombre, n.numero, 'de', n.anio::text) AS nombre
      FROM normas n JOIN tipos_norma tn ON tn.id = n.tipo_norma_id
      ORDER BY n.anio DESC, tn.orden, n.numero`,
    alcanceProcesos(sesion, { sql }),
    obtenerConfigDocumental({ sql }),
  ]);
  const todos = procesos.map((p) => ({
    id: Number(p.id),
    nombre: p.nombre as string,
    sigla: p.sigla as string,
    subprocesos: (p.subprocesos as { id: number; nombre: string }[]).map((s) => ({ id: Number(s.id), nombre: s.nombre })),
    liderId: p.lider_id === null ? null : Number(p.lider_id),
  }));
  return {
    procesos: todos.filter((p) => enAlcance(alcance, p.id)),
    todos: todos.map(({ id, nombre, subprocesos }) => ({ id, nombre, subprocesos })),
    personas: personas.map((u) => ({ id: Number(u.id), nombre: u.nombre as string, cargo: (u.cargo as string | null) ?? null })),
    normas: normas.map((n) => ({ id: Number(n.id), nombre: n.nombre as string })),
    verificacionMeses: config.vigencia.externosVerificacionMeses,
  };
}

// ── Archivos de la edición en borrador ──

/**
 * Quién sube o quita archivos de una edición: quien gestiona el externo, y solo mientras está en borrador (409 si
 * ya no). Para cualquier otro, o si la versión no es de un externo, no existe (404).
 */
export async function autorizarArchivoDeEdicion(
  versionId: number,
  sesion: SesionFlujo,
  opciones?: { sql?: Cliente },
): Promise<{ ok: true; destino: DestinoDeEdicion } | { ok: false; estado: 404 | 409 }> {
  const sql = opciones?.sql ?? obtenerSql();
  const [v] = await sql`SELECT documento_id, numero, estado FROM documento_versiones WHERE id = ${versionId}`;
  if (!v) return { ok: false, estado: 404 };
  const s = await leerSituacion(sql, Number(v.documento_id), sesion);
  if (!s || !puedeGestionarExterno(sesion, s.procesoId, await alcanceProcesos(sesion, { sql }))) return { ok: false, estado: 404 };
  if (v.estado !== "borrador") return { ok: false, estado: 409 };
  return { ok: true, destino: { versionId, codigo: s.codigo, numero: v.numero as number } };
}

/**
 * Un archivo de la edición en borrador del externo `documentoId`, para quien ve su página de control
 * (`puedeVerExterno`): quien adopta abre lo que firma, porque la ficha de lectura no sirve un borrador (spec 13C §8.8).
 * null si la persona no lo ve, si el archivo es de otro externo o de una edición que ya no está en borrador (los de la
 * vigente los sirve la ficha de lectura), o si es un acta.
 */
export async function archivoDeBorradorExterno(
  documentoId: number,
  archivoId: number,
  sesion: SesionFlujo,
  opciones?: { sql?: Cliente },
): Promise<{ ruta: string; mime: string; nombreOriginal: string } | null> {
  const sql = opciones?.sql ?? obtenerSql();
  if (!(await puedeVerExterno(documentoId, sesion, { sql }))) return null;
  const [a] = await sql`SELECT a.ruta, a.mime, a.nombre_original FROM archivos a
    JOIN documento_versiones v ON v.id = a.version_id
    WHERE a.id = ${archivoId} AND v.documento_id = ${documentoId} AND v.estado = 'borrador' AND a.rol = ANY(${ROLES_ARCHIVO_LISTA})`;
  return a ? { ruta: a.ruta as string, mime: a.mime as string, nombreOriginal: a.nombre_original as string } : null;
}

/** Un archivo de la lista (principal, editable o anexo) de esa versión; null si es de otra o es un acta. */
export async function archivoDeEdicion(
  versionId: number,
  archivoId: number,
  opciones?: { sql?: Cliente },
): Promise<{ ruta: string; mime: string; nombreOriginal: string } | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const [a] = await sql`SELECT ruta, mime, nombre_original FROM archivos
    WHERE id = ${archivoId} AND version_id = ${versionId} AND rol = ANY(${ROLES_ARCHIVO_LISTA})`;
  return a ? { ruta: a.ruta as string, mime: a.mime as string, nombreOriginal: a.nombre_original as string } : null;
}
