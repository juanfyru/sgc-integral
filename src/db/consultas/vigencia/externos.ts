/**
 * Los documentos externos (spec 13C §8): normas, guías y manuales que emite otro y que el hospital controla. Un
 * externo es un documento con `origen = 'externo'`, su control propio en `externos` y una versión por edición
 * adoptada. Aquí se registran, se prepara la edición en borrador, se adopta con firma (el cuarto camino que publica,
 * por `aplicarPublicacion`), se verifica su vigencia (`externo_verificaciones`, de solo inserción) y se retira (por
 * `anularVigenteEn`). Quien no puede ver o gestionar un externo recibe «El documento no existe», nunca «sin permiso».
 */
import { createHash } from "node:crypto";
import type { TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { anularVigenteEn, aplicarPublicacion, crearDocumentoEn, registrarAuditoria, type AsociacionEntrada } from "@/db/consultas/admin";
import { exigirFormatoDeCodigo, sugerirCodigo } from "@/db/consultas/codigos";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import { avisarEliminacion, crearAcusesAlPublicar } from "@/db/consultas/distribucion/acuses";
import { pedirSocializacion } from "@/db/consultas/distribucion/jornadas";
import type { ArchivoFicha } from "@/db/consultas/documentos";
import { registrarFirma } from "@/db/consultas/firmas";
import { ErrorFirma, enTransaccion, type OpcionesFlujo, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { crearNotificacion } from "@/db/consultas/notificaciones";
import { adminsActivos, lideresDeProceso } from "@/db/consultas/tramites";
import {
  alcanceProcesos,
  enAlcance,
  filtroAcceso,
  puedeAccederDocumento,
  puedeGestionarExterno,
  puedeVerExterno,
  type SujetoVisibilidad,
} from "@/lib/alcance";
import { verificarParaFirmar, type CredencialesFirma } from "@/lib/firma";
import { huellaDeArchivo } from "@/lib/huella";
import { ErrorPermiso, puede, requerirPermiso } from "@/lib/permisos";
import type { DestinoVersion } from "@/lib/recepcion-archivo";
import { ROLES_ARCHIVO_LISTA } from "@/lib/subida";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { ErrorVigencia, RESULTADOS_VERIFICACION, type EstadoVigencia, type ResultadoVerificacion } from "@/lib/vigencia/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { vigenciaPorDocumento } from "./fragmentos";
import { NO_COINCIDE, NO_EXISTE } from "./ratificaciones";

type Opciones = { sql?: Cliente; ahora?: Date };

export type DatosExterno = {
  titulo: string;
  procesoId: number;
  subprocesoId: number | null;
  otrosProcesos: AsociacionEntrada[];
  nivelAcceso: "general" | "restringido";
  descripcion: string | null;
  palabrasClave: string | null;
  entidadEmisora: string;
  tituloOriginal: string | null;
  fuenteOficial: string | null;
  responsableId: number;
  verificacionMeses: number;
  normaId: number | null;
  edicion: string;
  fechaEdicion: string | null;
};

export type DatosControlExterno = Pick<
  DatosExterno,
  "entidadEmisora" | "tituloOriginal" | "fuenteOficial" | "responsableId" | "verificacionMeses" | "normaId"
>;

export type DatosEdicion = { edicion: string; fechaEdicion: string | null; resumenCambios: string };

export type Verificacion = {
  id: number;
  resultado: ResultadoVerificacion;
  fuente: string;
  nota: string | null;
  nombre: string;
  creadoEn: Date;
  /** El número de la versión (la edición) que se verificó. */
  version: number;
};

export type Externo = {
  documentoId: number;
  codigo: string;
  titulo: string;
  nivelAcceso: "general" | "restringido";
  proceso: { id: number; nombre: string; sigla: string };
  control: {
    entidadEmisora: string;
    tituloOriginal: string | null;
    fuenteOficial: string | null;
    responsable: { id: number; nombre: string };
    verificacionMeses: number;
    norma: { id: number; nombre: string } | null;
    edicionNuevaPendienteDesde: Date | null;
  };
  vigente: { versionId: number; numero: number; edicion: string; fechaEdicion: string | null; adoptadaEn: Date; adoptoPor: string } | null;
  /** Solo para quien lo gestiona: la edición en borrador no se muestra a quien no puede adoptarla. */
  borrador: {
    versionId: number;
    numero: number;
    edicion: string;
    fechaEdicion: string | null;
    resumenCambios: string | null;
    archivos: ArchivoFicha[];
  } | null;
  /** Las ediciones adoptadas, de la más reciente a la más antigua: la vigente, las obsoletas y la retirada. */
  ediciones: { numero: number; edicion: string; estado: string; adoptadaEn: Date | null }[];
  verificaciones: Verificacion[];
  /** Sin edición adoptada no hay fecha de verificación: atención, sin días (resolución 7). */
  vigencia: { estado: EstadoVigencia; dias: number | null; proxima: Date | null };
  acciones: { editar: boolean; abrirEdicion: boolean; adoptar: boolean; verificar: boolean; retirar: boolean };
};

export type FilaExterno = Pick<Externo, "documentoId" | "codigo" | "titulo" | "proceso" | "vigencia"> & {
  emisor: string;
  edicion: string | null;
  adoptadaEn: Date | null;
  ultimaVerificacion: { fecha: Date; resultado: ResultadoVerificacion; nombre: string } | null;
  proximaVerificacion: Date | null;
  responsable: string;
  copiasVivas: number;
};

export type FiltroExternos = { estado?: EstadoVigencia | "todos"; procesoId?: number; responsableId?: number; q?: string };

/** Lo que la subida necesita de la versión; el rol del archivo lo dice la petición. */
export type DestinoDeEdicion = Pick<DestinoVersion, "versionId" | "codigo" | "numero">;

export type AdopcionValidada = {
  documentoId: number;
  codigo: string;
  numero: number;
  procesoId: number;
  esPrimera: boolean;
  hashPrincipal: string | null;
  ruta: string | null;
  edicion: string;
  entidadEmisora: string;
};

export const SIN_TIPO = "Falta el tipo de documento «Documento externo»";
export const NO_BORRADOR = "La edición ya no está en borrador";
export const EDICION_PENDIENTE = "Ya hay una edición pendiente de adoptar";
export const RETIRADO = "El documento externo fue retirado: si vuelve a aplicar, regístrelo como documento nuevo";
export const SIN_VIGENTE = "El documento externo no tiene una edición vigente";
const SIN_RESUMEN = "Escriba qué cambió en esta edición";
const FUERA_DE_ALCANCE = "Solo puede registrar externos de los procesos que lidera";
const SIN_VIGENCIA: Externo["vigencia"] = { estado: "atencion", dias: null, proxima: null };
const ESTADOS_COPIA_VIVA = ["emitida", "recibida", "por_recoger"];

// ── Validación de los datos (los esquemas de las acciones dicen lo mismo con sus palabras) ──

const recortado = (valor: string | null | undefined): string | null => valor?.trim() || null;

function acotado(valor: string, nombre: string, minimo: number, maximo: number): string {
  const limpio = valor.trim();
  if (limpio.length < minimo || limpio.length > maximo) {
    throw new ErrorVigencia(`${nombre} debe tener entre ${minimo} y ${maximo} caracteres`);
  }
  return limpio;
}

function opcionalAcotado(valor: string | null, nombre: string, maximo: number): string | null {
  const limpio = recortado(valor);
  if (limpio && limpio.length > maximo) throw new ErrorVigencia(`${nombre} no puede pasar de ${maximo} caracteres`);
  return limpio;
}

function esFechaReal(fecha: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const d = new Date(`${fecha}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === fecha;
}

function validarControl(d: DatosControlExterno): DatosControlExterno {
  if (!Number.isInteger(d.verificacionMeses) || d.verificacionMeses < 1 || d.verificacionMeses > 60) {
    throw new ErrorVigencia("La periodicidad de verificación debe estar entre 1 y 60 meses");
  }
  return {
    entidadEmisora: acotado(d.entidadEmisora, "La entidad emisora", 2, 200),
    tituloOriginal: opcionalAcotado(d.tituloOriginal, "El título original", 300),
    fuenteOficial: opcionalAcotado(d.fuenteOficial, "La fuente oficial", 500),
    responsableId: d.responsableId,
    verificacionMeses: d.verificacionMeses,
    normaId: d.normaId,
  };
}

function validarEdicion(d: { edicion: string; fechaEdicion: string | null }): { edicion: string; fechaEdicion: string | null } {
  const edicion = d.edicion.trim();
  if (!edicion) throw new ErrorVigencia("Escriba la edición");
  if (edicion.length > 60) throw new ErrorVigencia("La edición no puede pasar de 60 caracteres");
  if (d.fechaEdicion !== null && !esFechaReal(d.fechaEdicion)) throw new ErrorVigencia("Elija una fecha de emisión válida");
  return { edicion, fechaEdicion: d.fechaEdicion };
}

/** Obligatorio en una edición nueva: es lo que lee la audiencia en su acuse (spec 13C §8.2). */
function validarResumen(resumen: string | null, obligatorio: boolean): string | null {
  const limpio = recortado(resumen);
  if (!limpio) {
    if (obligatorio) throw new ErrorVigencia(SIN_RESUMEN);
    return null;
  }
  if (limpio.length < 5 || limpio.length > 2000) throw new ErrorVigencia("Qué cambió debe tener entre 5 y 2000 caracteres");
  return limpio;
}

// ── Lectura y candado ──

type Situacion = {
  documentoId: number;
  codigo: string;
  titulo: string;
  procesoId: number;
  responsableId: number;
  /** Tiene una versión anulada: salió por retiro y no vuelve (spec 13C §8.5). */
  retirado: boolean;
  vigente: { id: number; numero: number } | null;
  borrador: { id: number; numero: number } | null;
};

/** El externo tal como lo ve `sujeto` (nivel de acceso); null si no existe, no es externo o no lo ve. */
async function leerSituacion(sql: Cliente, documentoId: number, sujeto: SujetoVisibilidad): Promise<Situacion | null> {
  const [f] = await sql`
    SELECT d.id, d.codigo, d.titulo, COALESCE(dp.proceso_id, s.proceso_id) AS proceso_id, ex.responsable_id,
      EXISTS (SELECT 1 FROM documento_versiones x WHERE x.documento_id = d.id AND x.estado = 'anulado') AS retirado,
      (SELECT json_build_object('id', x.id, 'numero', x.numero) FROM documento_versiones x
        WHERE x.documento_id = d.id AND x.estado = 'vigente') AS vigente,
      (SELECT json_build_object('id', x.id, 'numero', x.numero) FROM documento_versiones x
        WHERE x.documento_id = d.id AND x.estado = 'borrador' ORDER BY x.id LIMIT 1) AS borrador
    FROM documentos d
    JOIN externos ex ON ex.documento_id = d.id
    JOIN documento_proceso dp ON dp.documento_id = d.id AND dp.es_principal
    LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
    WHERE d.id = ${documentoId} AND d.origen = 'externo' AND ${filtroAcceso(sql, sujeto)}`;
  if (!f) return null;
  const version = (v: unknown) => (v ? { id: Number((v as { id: number }).id), numero: Number((v as { numero: number }).numero) } : null);
  return {
    documentoId: Number(f.id),
    codigo: f.codigo as string,
    titulo: f.titulo as string,
    procesoId: Number(f.proceso_id),
    responsableId: Number(f.responsable_id),
    retirado: f.retirado as boolean,
    vigente: version(f.vigente),
    borrador: version(f.borrador),
  };
}

/** El externo para quien lo gestiona (`externos.gestionar` sobre su proceso propietario); para los demás no existe. */
async function gestionable(sql: Cliente, sesion: SesionFlujo, documentoId: number): Promise<Situacion> {
  const s = await leerSituacion(sql, documentoId, sesion);
  if (!s || !puedeGestionarExterno(sesion, s.procesoId, await alcanceProcesos(sesion, { sql }))) throw new ErrorVigencia(NO_EXISTE);
  return s;
}

/**
 * El primer candado de toda escritura sobre un externo: el documento y su fila de control, en el orden del panel
 * (documento y luego versión). `aplicarPublicacion` y `anularVigenteEn` escriben después en `documentos` y en sus
 * versiones; tomarlo antes evita el interbloqueo con una acción del panel sobre el mismo documento.
 */
async function bloquear(tx: TransactionSql, documentoId: number): Promise<void> {
  await tx`SELECT d.id FROM documentos d JOIN externos ex ON ex.documento_id = d.id
    WHERE d.id = ${documentoId} FOR UPDATE OF d, ex`;
}

async function documentoDeVersion(sql: Cliente, versionId: number): Promise<number | null> {
  const [v] = await sql`SELECT documento_id FROM documento_versiones WHERE id = ${versionId}`;
  return v ? Number(v.documento_id) : null;
}

/** El responsable técnico es una persona activa que puede ver el documento: si no, nadie podría verificarlo. */
async function exigirResponsable(tx: Cliente, responsableId: number, documentoId: number): Promise<string> {
  const [u] = await tx`SELECT id, nombre, rol, ver_historial, activo FROM usuarios WHERE id = ${responsableId}`;
  if (!u?.activo) throw new ErrorVigencia("El responsable técnico debe ser un usuario activo");
  const ve = await puedeAccederDocumento(documentoId, { usuarioId: Number(u.id), rol: u.rol, verHistorial: u.ver_historial }, { sql: tx });
  if (!ve) throw new ErrorVigencia("El responsable técnico no tiene acceso a este documento restringido");
  return u.nombre as string;
}

async function nombreDeNorma(sql: Cliente, normaId: number): Promise<string> {
  const [n] = await sql`SELECT concat_ws(' ', tn.nombre, n.numero, 'de', n.anio::text) AS nombre
    FROM normas n JOIN tipos_norma tn ON tn.id = n.tipo_norma_id WHERE n.id = ${normaId}`;
  if (!n) throw new ErrorVigencia("La norma no existe");
  return n.nombre as string;
}

/** La norma enlazada al externo: la primera de `norma_documentos` (el normograma puede enlazarle otras). */
async function normaEnlazada(sql: Cliente, documentoId: number): Promise<{ id: number; nombre: string } | null> {
  const [n] = await sql`SELECT n.id, concat_ws(' ', tn.nombre, n.numero, 'de', n.anio::text) AS nombre
    FROM norma_documentos nd JOIN normas n ON n.id = nd.norma_id JOIN tipos_norma tn ON tn.id = n.tipo_norma_id
    WHERE nd.documento_id = ${documentoId} ORDER BY nd.id LIMIT 1`;
  return n ? { id: Number(n.id), nombre: n.nombre as string } : null;
}

/** La verificación es de este externo (y, si se dice, con ese resultado); si no, no existe. */
async function exigirVerificacion(sql: Cliente, documentoId: number, verificacionId: number, resultado?: ResultadoVerificacion): Promise<void> {
  const [v] = await sql`SELECT 1 FROM externo_verificaciones
    WHERE id = ${verificacionId} AND documento_id = ${documentoId}
      ${resultado ? sql`AND resultado = ${resultado}` : sql``}`;
  if (!v) throw new ErrorVigencia(NO_EXISTE);
}

/** El principal y el «también aplica», sin repetir: el propietario es el subproceso si se eligió uno. */
function asociacionesDe(d: Pick<DatosExterno, "procesoId" | "subprocesoId" | "otrosProcesos">): AsociacionEntrada[] {
  const principal: AsociacionEntrada =
    d.subprocesoId !== null ? { subprocesoId: d.subprocesoId, esPrincipal: true } : { procesoId: d.procesoId, esPrincipal: true };
  const clave = (a: AsociacionEntrada) => (a.procesoId !== undefined ? `p:${a.procesoId}` : `s:${a.subprocesoId}`);
  const vistas = new Set([clave(principal)]);
  const otras: AsociacionEntrada[] = [];
  for (const a of d.otrosProcesos) {
    const otra: AsociacionEntrada = a.procesoId !== undefined ? { procesoId: a.procesoId, esPrincipal: false } : { subprocesoId: a.subprocesoId, esPrincipal: false };
    if (vistas.has(clave(otra))) continue;
    vistas.add(clave(otra));
    otras.push(otra);
  }
  return [principal, ...otras];
}

// ── Alta y datos de control ──

/**
 * Registra un externo (spec 13C §8.3): el documento de tipo «Documento externo» con el código siguiente de su
 * proceso, su fila de control y la primera edición en borrador. No depende de «Publicación directa»: el alta de
 * externos no se cierra con la carga inicial.
 */
export async function registrarExterno(
  sesion: SesionFlujo,
  d: DatosExterno,
  opciones?: Opciones,
): Promise<{ documentoId: number; versionId: number; codigo: string }> {
  requerirPermiso(sesion, "externos.gestionar");
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const titulo = acotado(d.titulo, "El título", 3, 200);
  const control = validarControl(d);
  const edicion = validarEdicion(d);

  return enTransaccion(sql, async (tx) => {
    if (!enAlcance(await alcanceProcesos(sesion, { sql: tx }), d.procesoId)) throw new ErrorVigencia(FUERA_DE_ALCANCE);
    const [tipo] = await tx`SELECT id FROM tipos_documento WHERE sigla = 'DE' AND activo`;
    if (!tipo) throw new ErrorVigencia(SIN_TIPO);
    const [proceso] = await tx`SELECT 1 FROM procesos WHERE id = ${d.procesoId} AND activo`;
    if (!proceso) throw new ErrorVigencia("El proceso no existe o está inactivo");
    if (d.subprocesoId !== null) {
      const [sub] = await tx`SELECT 1 FROM subprocesos WHERE id = ${d.subprocesoId} AND proceso_id = ${d.procesoId}`;
      if (!sub) throw new ErrorVigencia("El subproceso no es del proceso propietario");
    }
    const destino = { procesoId: d.procesoId, tipoDocumentoId: Number(tipo.id) };
    const codigo = await sugerirCodigo(destino, { sql: tx });
    if (!codigo) throw new ErrorVigencia("Configure el formato del código antes de registrar documentos externos");
    await exigirFormatoDeCodigo(tx, codigo, destino);

    let creado: { documentoId: number; versionId: number };
    try {
      // En un savepoint: tras un 23505 la transacción no admite más consultas.
      creado = (await tx.savepoint((s) =>
        crearDocumentoEn(
          s,
          {
            codigo,
            titulo,
            tipoId: Number(tipo.id),
            descripcion: recortado(d.descripcion),
            palabrasClave: recortado(d.palabrasClave),
            asociaciones: asociacionesDe(d),
            nivelAcceso: d.nivelAcceso,
          },
          sesion.usuarioId,
        ),
      )) as { documentoId: number; versionId: number };
    } catch (err) {
      if ((err as { constraint_name?: string }).constraint_name !== "documentos_codigo_unique") throw err;
      throw new ErrorVigencia(`Otro documento acaba de tomar el código ${codigo}: vuelva a intentarlo`);
    }
    const { documentoId, versionId } = creado;
    await tx`UPDATE documentos SET origen = 'externo' WHERE id = ${documentoId}`;
    await tx`INSERT INTO externos (documento_id, entidad_emisora, titulo_original, fuente_oficial, responsable_id, verificacion_meses, actualizado_en)
      VALUES (${documentoId}, ${control.entidadEmisora}, ${control.tituloOriginal}, ${control.fuenteOficial}, ${control.responsableId},
              ${control.verificacionMeses}, ${ahora})`;
    await tx`UPDATE documento_versiones SET edicion_externa = ${edicion.edicion}, fecha_edicion_externa = ${edicion.fechaEdicion}
      WHERE id = ${versionId}`;
    // Después de las asociaciones: un restringido lo ve quien está en sus procesos.
    const responsable = await exigirResponsable(tx, control.responsableId, documentoId);
    let norma: string | null = null;
    if (control.normaId !== null) {
      norma = await nombreDeNorma(tx, control.normaId);
      await tx`INSERT INTO norma_documentos (norma_id, documento_id, creado_por) VALUES (${control.normaId}, ${documentoId}, ${sesion.usuarioId})`;
    }
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "externo_registrado",
      entidad: "documento",
      entidadId: documentoId,
      detalle: { codigo, titulo, entidadEmisora: control.entidadEmisora, edicion: edicion.edicion, responsable, norma },
    });
    return { documentoId, versionId, codigo };
  });
}

/**
 * Los datos de control (spec 13C §8.3): edición de catálogo, auditada con lo que cambió antes y después. Cambiar el
 * responsable o la periodicidad cambia a quién y cuándo se avisa: las marcas del aviso vuelven a empezar.
 */
export async function editarControlExterno(
  sesion: SesionFlujo,
  documentoId: number,
  d: DatosControlExterno,
  opciones?: Opciones,
): Promise<void> {
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const control = validarControl(d);

  await enTransaccion(sql, async (tx) => {
    await bloquear(tx, documentoId);
    const s = await gestionable(tx, sesion, documentoId);
    if (s.retirado) throw new ErrorVigencia(RETIRADO);
    const [actual] = await tx`SELECT ex.entidad_emisora, ex.titulo_original, ex.fuente_oficial, ex.responsable_id, u.nombre AS responsable,
        ex.verificacion_meses
      FROM externos ex JOIN usuarios u ON u.id = ex.responsable_id WHERE ex.documento_id = ${documentoId}`;
    const normaActual = await normaEnlazada(tx, documentoId);
    const responsable = await exigirResponsable(tx, control.responsableId, documentoId);
    const norma = control.normaId === null ? null : await nombreDeNorma(tx, control.normaId);

    const cambio = {
      entidadEmisora: actual.entidad_emisora !== control.entidadEmisora,
      tituloOriginal: actual.titulo_original !== control.tituloOriginal,
      fuenteOficial: actual.fuente_oficial !== control.fuenteOficial,
      responsable: Number(actual.responsable_id) !== control.responsableId,
      verificacionMeses: Number(actual.verificacion_meses) !== control.verificacionMeses,
      norma: (normaActual?.id ?? null) !== control.normaId,
    };
    const cambiaron = (Object.keys(cambio) as (keyof typeof cambio)[]).filter((dato) => cambio[dato]);
    if (cambiaron.length === 0) return;

    const reiniciarAvisos = cambio.responsable || cambio.verificacionMeses;
    await tx`UPDATE externos SET entidad_emisora = ${control.entidadEmisora}, titulo_original = ${control.tituloOriginal},
        fuente_oficial = ${control.fuenteOficial}, responsable_id = ${control.responsableId},
        verificacion_meses = ${control.verificacionMeses}, actualizado_en = ${ahora}
        ${reiniciarAvisos ? tx`, aviso_vencido_en = NULL, escalado_en = NULL` : tx``}
      WHERE documento_id = ${documentoId}`;
    if (cambio.norma) {
      if (normaActual) await tx`DELETE FROM norma_documentos WHERE documento_id = ${documentoId} AND norma_id = ${normaActual.id}`;
      if (control.normaId !== null) {
        await tx`INSERT INTO norma_documentos (norma_id, documento_id, creado_por) VALUES (${control.normaId}, ${documentoId}, ${sesion.usuarioId})
          ON CONFLICT (norma_id, documento_id) DO NOTHING`;
      }
    }

    const antes = {
      entidadEmisora: actual.entidad_emisora as string,
      tituloOriginal: actual.titulo_original as string | null,
      fuenteOficial: actual.fuente_oficial as string | null,
      responsable: actual.responsable as string,
      verificacionMeses: Number(actual.verificacion_meses),
      norma: normaActual?.nombre ?? null,
    };
    const despues = { ...control, responsable, norma };
    const solo = (datos: Record<string, unknown>) => Object.fromEntries(cambiaron.map((dato) => [dato, datos[dato]]));
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "externo_editado",
      entidad: "documento",
      entidadId: documentoId,
      detalle: { codigo: s.codigo, antes: solo(antes), despues: solo(despues) },
    });
  });
}

// ── La edición en borrador ──

/**
 * Abre la edición siguiente en borrador (spec 13C §8.3), con sus datos y el «qué cambió». Una sola a la vez; la
 * marca «edición nueva pendiente» que dejó una verificación sigue hasta que se adopte.
 */
export async function abrirEdicion(
  sesion: SesionFlujo,
  documentoId: number,
  d: DatosEdicion,
  opciones?: Opciones,
): Promise<{ versionId: number }> {
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const edicion = validarEdicion(d);
  const resumen = validarResumen(d.resumenCambios, true);

  return enTransaccion(sql, async (tx) => {
    await bloquear(tx, documentoId);
    const s = await gestionable(tx, sesion, documentoId);
    if (s.retirado) throw new ErrorVigencia(RETIRADO);
    if (s.borrador) throw new ErrorVigencia(EDICION_PENDIENTE);
    // Una versión descartada libera su número.
    const [{ siguiente }] = await tx`SELECT coalesce(max(numero), 0) + 1 AS siguiente
      FROM documento_versiones WHERE documento_id = ${documentoId} AND estado <> 'descartado'`;
    const [v] = await tx`INSERT INTO documento_versiones
        (documento_id, numero, estado, edicion_externa, fecha_edicion_externa, resumen_cambios, creado_en)
      VALUES (${documentoId}, ${siguiente}, 'borrador', ${edicion.edicion}, ${edicion.fechaEdicion}, ${resumen}, ${ahora})
      RETURNING id, numero`;
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "externo_edicion_abierta",
      entidad: "documento",
      entidadId: documentoId,
      detalle: { codigo: s.codigo, numero: v.numero, edicion: edicion.edicion },
    });
    return { versionId: Number(v.id) };
  });
}

/** La edición en borrador de un externo que la persona gestiona, con el documento y la versión bloqueados. */
async function edicionEnBorrador(tx: TransactionSql, sesion: SesionFlujo, versionId: number): Promise<{ s: Situacion; numero: number }> {
  const documentoId = await documentoDeVersion(tx, versionId);
  if (documentoId === null) throw new ErrorVigencia(NO_EXISTE);
  await bloquear(tx, documentoId);
  const s = await gestionable(tx, sesion, documentoId);
  const [v] = await tx`SELECT numero, estado FROM documento_versiones WHERE id = ${versionId} FOR UPDATE`;
  if (v.estado !== "borrador") throw new ErrorVigencia(NO_BORRADOR);
  return { s, numero: v.numero as number };
}

/** Corrige los datos de la edición en borrador; «qué cambió» es obligatorio si ya hay una edición vigente. */
export async function editarEdicion(
  sesion: SesionFlujo,
  versionId: number,
  d: Omit<DatosEdicion, "resumenCambios"> & { resumenCambios: string | null },
  opciones?: Opciones,
): Promise<{ documentoId: number }> {
  const sql = opciones?.sql ?? obtenerSql();
  const edicion = validarEdicion(d);

  return enTransaccion(sql, async (tx) => {
    const { s, numero } = await edicionEnBorrador(tx, sesion, versionId);
    const resumen = validarResumen(d.resumenCambios, s.vigente !== null);
    await tx`UPDATE documento_versiones SET edicion_externa = ${edicion.edicion}, fecha_edicion_externa = ${edicion.fechaEdicion},
        resumen_cambios = ${resumen}
      WHERE id = ${versionId}`;
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "externo_edicion_editada",
      entidad: "documento",
      entidadId: s.documentoId,
      detalle: { codigo: s.codigo, numero, ...edicion, resumenCambios: resumen },
    });
    return { documentoId: s.documentoId };
  });
}

/** Descarta la edición en borrador (F13A-DC16): conserva sus archivos, libera su número y queda en la bitácora. */
export async function descartarEdicion(sesion: SesionFlujo, versionId: number, opciones?: Opciones): Promise<{ documentoId: number }> {
  const sql = opciones?.sql ?? obtenerSql();
  return enTransaccion(sql, async (tx) => {
    const { s, numero } = await edicionEnBorrador(tx, sesion, versionId);
    const [v] = await tx`UPDATE documento_versiones SET estado = 'descartado' WHERE id = ${versionId} RETURNING edicion_externa`;
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "externo_edicion_descartada",
      entidad: "documento",
      entidadId: s.documentoId,
      detalle: { codigo: s.codigo, numero, edicion: v.edicion_externa },
    });
    return { documentoId: s.documentoId };
  });
}

// ── Adopción ──

/**
 * Lo que debe cumplirse para adoptar una edición, sin escribir nada (F13A-R4): un borrador de un externo que la
 * persona gestiona, no retirado, con su edición escrita y, si ya hay una vigente, con «qué cambió».
 */
export async function validarAdopcion(sql: Cliente, sesion: SesionFlujo, versionId: number): Promise<AdopcionValidada> {
  const documentoId = await documentoDeVersion(sql, versionId);
  if (documentoId === null) throw new ErrorVigencia(NO_EXISTE);
  const s = await gestionable(sql, sesion, documentoId);
  const [v] = await sql`SELECT v.numero, v.estado, v.edicion_externa, v.resumen_cambios, ex.entidad_emisora, a.ruta, a.hash_sha256
    FROM documento_versiones v
    JOIN externos ex ON ex.documento_id = v.documento_id
    LEFT JOIN archivos a ON a.version_id = v.id AND a.rol = 'principal'
    WHERE v.id = ${versionId}`;
  if (v.estado !== "borrador") throw new ErrorVigencia(NO_BORRADOR);
  if (s.retirado) throw new ErrorVigencia(RETIRADO);
  const edicion = recortado(v.edicion_externa as string | null);
  if (!edicion) throw new ErrorVigencia("Escriba la edición que se adopta");
  const esPrimera = s.vigente === null;
  if (!esPrimera && !recortado(v.resumen_cambios as string | null)) throw new ErrorVigencia(SIN_RESUMEN);
  return {
    documentoId,
    codigo: s.codigo,
    numero: v.numero as number,
    procesoId: s.procesoId,
    esPrimera,
    hashPrincipal: (v.hash_sha256 as string | null) ?? null,
    ruta: (v.ruta as string | null) ?? null,
    edicion,
    entidadEmisora: v.entidad_emisora as string,
  };
}

/**
 * Lo que la revisión anual hace con una adopción hecha durante su campaña. La llama `adoptarEdicion` dentro de su
 * transacción, después de publicar; la Tarea 10 la llena con la decisión de la campaña.
 */
export async function alAdoptar(
  tx: TransactionSql,
  d: { documentoId: number; versionId: number; usuarioId: number; verificacionId: number | null; ahora: Date },
): Promise<void> {
  // Sin campaña que registrar todavía: la decisión automática llega con la revisión anual.
  void tx;
  void d;
}

/** Sin archivo principal, la firma guarda la huella de los datos de control de la edición (spec 13C §8.3). */
function huellaDeDatos(codigo: string, edicion: string, emisor: string): string {
  return createHash("sha256").update(`${codigo}|${edicion}|${emisor}`).digest("hex");
}

/** Un archivo que no se puede leer tampoco es el registrado: la huella en disco queda nula. */
async function huellaEnDisco(ruta: string): Promise<string | null> {
  try {
    return await huellaDeArchivo(ruta);
  } catch (err) {
    console.error("No se pudo leer el archivo principal al adoptar:", err);
    return null;
  }
}

/** El rechazo por la huella sale de la transacción con lo que la bitácora debe guardar. */
class HuellaDistinta extends Error {
  constructor(readonly detalle: { codigo: string; numero: number; huellaRegistrada: string | null; huellaEnDisco: string | null }) {
    super(NO_COINCIDE);
  }
}

/**
 * Adopta la edición en borrador (spec 13C §8.3): la firma «Adoptó» sin trámite y la publicación por
 * `aplicarPublicacion(…, "externo", …)`, que deja obsoleta la anterior y recoge sus copias. Una edición nueva pide
 * acuse a la audiencia; la primera, solo si se marca. La clave se verifica fuera de la transacción y todo lo que
 * puede fallar se valida antes y otra vez dentro, con el documento y la versión bloqueados (F13A-R4).
 */
export async function adoptarEdicion(
  sesion: SesionFlujo,
  d: { versionId: number; pedirAcuses: boolean; requiereSocializacion: boolean; credenciales: CredencialesFirma; verificacionId?: number },
  opciones: OpcionesFlujo = {},
): Promise<{ documentoId: number; numero: number; obsoletas: number[]; acuses: number }> {
  const sql = opciones.sql ?? obtenerSql();
  const ahora = opciones.ahora ?? new Date();
  const contexto = opciones.contexto ?? { ip: null, userAgent: null };
  const zona = zonaHoraria();
  const verificacionId = d.verificacionId ?? null;

  const previa = await validarAdopcion(sql, sesion, d.versionId);
  if (verificacionId !== null) await exigirVerificacion(sql, previa.documentoId, verificacionId, "edicion_nueva");
  const verificar = opciones.verificar ?? verificarParaFirmar;
  const r = await verificar(sesion, d.credenciales, contexto, ahora);
  if (!r.ok) throw new ErrorFirma(r.mensaje, r.sesionCerrada, r.bloqueada);

  try {
    return await enTransaccion(sql, async (tx) => {
      await bloquear(tx, previa.documentoId);
      await tx`SELECT id FROM documento_versiones WHERE id = ${d.versionId} FOR UPDATE`;
      const v = await validarAdopcion(tx, sesion, d.versionId);
      if (verificacionId !== null) await exigirVerificacion(tx, v.documentoId, verificacionId, "edicion_nueva");
      let huella: string;
      if (v.ruta) {
        const enDisco = await huellaEnDisco(v.ruta);
        if (enDisco === null || enDisco !== v.hashPrincipal) {
          throw new HuellaDistinta({ codigo: v.codigo, numero: v.numero, huellaRegistrada: v.hashPrincipal, huellaEnDisco: enDisco });
        }
        huella = enDisco;
      } else {
        huella = huellaDeDatos(v.codigo, v.edicion, v.entidadEmisora);
      }

      // Lo que leen el CHECK de la vigente, la ficha y el Maestro: aprobó quien adopta, hoy; elaboró y revisó, nadie.
      const [quien] = await tx`SELECT u.nombre, c.nombre AS cargo FROM usuarios u LEFT JOIN cargos c ON c.id = u.cargo_id
        WHERE u.id = ${sesion.usuarioId}`;
      const aprobo = quien.cargo ? `${quien.nombre} — ${quien.cargo}` : (quien.nombre as string);
      await tx`UPDATE documento_versiones SET aprobo = ${aprobo}, fecha_aprobacion = ${fechaEnZona(ahora, zona)},
          elaboro = NULL, reviso = NULL, fecha_elaboracion = NULL, fecha_revision = NULL
        WHERE id = ${d.versionId}`;
      await registrarFirma(tx, {
        tramiteId: null,
        versionId: d.versionId,
        usuarioId: sesion.usuarioId,
        firma: "adopto",
        ronda: 0,
        hashSha256: huella,
        metodo: r.metodo,
        contexto,
        ahora,
      });
      const { documentoId, numero, obsoletas } = await aplicarPublicacion(tx, d.versionId, "externo", sesion.usuarioId, ahora);
      // Quien adopta ya leyó la edición: su acuse nace confirmado por la firma.
      const acuses = !v.esPrimera || d.pedirAcuses ? (await crearAcusesAlPublicar(tx, d.versionId, ahora, [sesion.usuarioId])).creados : 0;
      if (d.requiereSocializacion) {
        const config = await obtenerConfigDocumental({ sql: tx });
        await pedirSocializacion(tx, { versionId: d.versionId, procesoId: v.procesoId, plazoDias: config.distribucion.plazoSocializacionDias, ahora });
      }
      await tx`UPDATE externos SET edicion_nueva_pendiente_desde = NULL, aviso_vencido_en = NULL, escalado_en = NULL
        WHERE documento_id = ${documentoId}`;
      await alAdoptar(tx, { documentoId, versionId: d.versionId, usuarioId: sesion.usuarioId, verificacionId, ahora });
      await registrarAuditoria(tx, {
        usuarioId: sesion.usuarioId,
        accion: "externo_adoptado",
        entidad: "documento",
        entidadId: documentoId,
        detalle: { codigo: v.codigo, numero, edicion: v.edicion, obsoletas, acuses, verificacionId },
      });
      return { documentoId, numero, obsoletas, acuses };
    });
  } catch (err) {
    if (!(err instanceof HuellaDistinta)) throw err;
    // Fuera de la transacción revertida: el rechazo queda en la bitácora.
    await registrarAuditoria(sql, {
      usuarioId: sesion.usuarioId,
      accion: "adopcion_rechazada",
      entidad: "documento",
      entidadId: previa.documentoId,
      detalle: err.detalle,
    });
    throw new ErrorVigencia(NO_COINCIDE);
  }
}

// ── Verificación y retiro ──

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
 * el externo. Sigue vigente: la próxima verificación cuenta desde hoy. Edición nueva: queda la marca pendiente y, si
 * quien verifica no gestiona, se avisa a quienes pueden adoptarla. Retirado: el externo se retira en la misma
 * transacción.
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

    if (d.resultado === "vigente") {
      await tx`UPDATE externos SET aviso_vencido_en = NULL, escalado_en = NULL WHERE documento_id = ${s.documentoId}`;
    } else if (d.resultado === "edicion_nueva") {
      await tx`UPDATE externos SET edicion_nueva_pendiente_desde = ${ahora} WHERE documento_id = ${s.documentoId}`;
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
    if (d.verificacionId !== undefined) await exigirVerificacion(tx, s.documentoId, d.verificacionId);
    await retirarEn(tx, sesion, s, { motivo, verificacionId: d.verificacionId ?? null }, ahora);
  });
}

// ── Lectura ──

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
  const gestiona = puedeGestionarExterno(sesion, procesoId, await alcanceProcesos(sesion, { sql }));
  const vigente = versiones.find((v) => v.estado === "vigente");
  const borrador = versiones.find((v) => v.estado === "borrador");
  const activo = !versiones.some((v) => v.estado === "anulado");
  const archivos = gestiona && borrador
    ? await sql`SELECT id, rol, nombre_original, extension, mime, tamano_bytes FROM archivos
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
    acciones: {
      editar: gestiona && activo,
      abrirEdicion: gestiona && activo && !borrador,
      adoptar: gestiona && activo && borrador !== undefined,
      verificar: activo && vigente !== undefined && puede(sesion, "externos.verificar") && (gestiona || responsableId === sesion.usuarioId),
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
      ex.entidad_emisora, ru.nombre AS responsable, v.id AS version_id, v.edicion_externa, v.publicado_en,
      uv.creado_en AS verificado_en, uv.resultado, uv.nombre AS verifico,
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
      emisor: f.entidad_emisora as string,
      edicion: (f.edicion_externa as string | null) ?? null,
      adoptadaEn: f.publicado_en === null ? null : new Date(f.publicado_en as string),
      ultimaVerificacion:
        f.verificado_en === null
          ? null
          : { fecha: new Date(f.verificado_en as string), resultado: f.resultado as ResultadoVerificacion, nombre: f.verifico as string },
      proximaVerificacion: v?.proximaRevision ?? null,
      responsable: f.responsable as string,
      copiasVivas: Number(f.copias_vivas),
    };
  });
  const estado = filtro.estado ?? "todos";
  return estado === "todos" ? lista : lista.filter((f) => f.vigencia.estado === estado);
}

/** Si la persona responde por la vigencia de algún externo que no se ha retirado (la entrada «Vigencia» de la barra). */
export async function esResponsableTecnico(usuarioId: number, opciones?: { sql?: Cliente }): Promise<boolean> {
  const sql = opciones?.sql ?? obtenerSql();
  const [f] = await sql`SELECT EXISTS (
      SELECT 1 FROM externos ex JOIN documentos d ON d.id = ex.documento_id
      WHERE ex.responsable_id = ${usuarioId} AND d.origen = 'externo'
        AND NOT EXISTS (SELECT 1 FROM documento_versiones x WHERE x.documento_id = d.id AND x.estado = 'anulado')
    ) AS es`;
  return f.es as boolean;
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
