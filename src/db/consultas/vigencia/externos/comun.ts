/** Lo común a los externos: los tipos, la validación de los datos, la lectura del externo y su candado. */
import type { TransactionSql } from "postgres";
import type { Cliente } from "@/db/cliente";
import type { AsociacionEntrada } from "@/db/consultas/admin";
import type { ArchivoFicha } from "@/db/consultas/documentos";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { alcanceProcesos, filtroAcceso, puedeAccederDocumento, puedeGestionarExterno, type SujetoVisibilidad } from "@/lib/alcance";
import type { DestinoVersion } from "@/lib/recepcion-archivo";
import { ErrorVigencia, type EstadoVigencia, type ResultadoVerificacion } from "@/lib/vigencia/tipos";
import { NO_EXISTE } from "../comun";

export type Opciones = { sql?: Cliente; ahora?: Date };

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
export const SIN_RESUMEN = "Escriba qué cambió en esta edición";

// ── Validación de los datos (los esquemas de las acciones dicen lo mismo con sus palabras) ──

export const recortado = (valor: string | null | undefined): string | null => valor?.trim() || null;

export function acotado(valor: string, nombre: string, minimo: number, maximo: number): string {
  const limpio = valor.trim();
  if (limpio.length < minimo || limpio.length > maximo) {
    throw new ErrorVigencia(`${nombre} debe tener entre ${minimo} y ${maximo} caracteres`);
  }
  return limpio;
}

export function opcionalAcotado(valor: string | null, nombre: string, maximo: number): string | null {
  const limpio = recortado(valor);
  if (limpio && limpio.length > maximo) throw new ErrorVigencia(`${nombre} no puede pasar de ${maximo} caracteres`);
  return limpio;
}

function esFechaReal(fecha: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const d = new Date(`${fecha}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === fecha;
}

export function validarControl(d: DatosControlExterno): DatosControlExterno {
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

export function validarEdicion(d: { edicion: string; fechaEdicion: string | null }): { edicion: string; fechaEdicion: string | null } {
  const edicion = d.edicion.trim();
  if (!edicion) throw new ErrorVigencia("Escriba la edición");
  if (edicion.length > 60) throw new ErrorVigencia("La edición no puede pasar de 60 caracteres");
  if (d.fechaEdicion !== null && !esFechaReal(d.fechaEdicion)) throw new ErrorVigencia("Elija una fecha de emisión válida");
  return { edicion, fechaEdicion: d.fechaEdicion };
}

/** Obligatorio en una edición nueva: es lo que lee la audiencia en su acuse (spec 13C §8.2). */
export function validarResumen(resumen: string | null, obligatorio: boolean): string | null {
  const limpio = recortado(resumen);
  if (!limpio) {
    if (obligatorio) throw new ErrorVigencia(SIN_RESUMEN);
    return null;
  }
  if (limpio.length < 5 || limpio.length > 2000) throw new ErrorVigencia("Qué cambió debe tener entre 5 y 2000 caracteres");
  return limpio;
}

// ── Lectura y candado ──

export type Situacion = {
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
export async function leerSituacion(sql: Cliente, documentoId: number, sujeto: SujetoVisibilidad): Promise<Situacion | null> {
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
export async function gestionable(sql: Cliente, sesion: SesionFlujo, documentoId: number): Promise<Situacion> {
  const s = await leerSituacion(sql, documentoId, sesion);
  if (!s || !puedeGestionarExterno(sesion, s.procesoId, await alcanceProcesos(sesion, { sql }))) throw new ErrorVigencia(NO_EXISTE);
  return s;
}

/**
 * El primer candado de toda escritura sobre un externo: el documento y su fila de control, en el orden del panel
 * (documento y luego versión). `aplicarPublicacion` y `anularVigenteEn` escriben después en `documentos` y en sus
 * versiones; tomarlo antes evita el interbloqueo con una acción del panel sobre el mismo documento.
 */
export async function bloquear(tx: TransactionSql, documentoId: number): Promise<void> {
  await tx`SELECT d.id FROM documentos d JOIN externos ex ON ex.documento_id = d.id
    WHERE d.id = ${documentoId} FOR UPDATE OF d, ex`;
}

export async function documentoDeVersion(sql: Cliente, versionId: number): Promise<number | null> {
  const [v] = await sql`SELECT documento_id FROM documento_versiones WHERE id = ${versionId}`;
  return v ? Number(v.documento_id) : null;
}

/** El responsable técnico es una persona activa que puede ver el documento: si no, nadie podría verificarlo. */
export async function exigirResponsable(tx: Cliente, responsableId: number, documentoId: number): Promise<string> {
  const [u] = await tx`SELECT id, nombre, rol, ver_historial, activo FROM usuarios WHERE id = ${responsableId}`;
  if (!u?.activo) throw new ErrorVigencia("El responsable técnico debe ser un usuario activo");
  const ve = await puedeAccederDocumento(documentoId, { usuarioId: Number(u.id), rol: u.rol, verHistorial: u.ver_historial }, { sql: tx });
  if (!ve) throw new ErrorVigencia("El responsable técnico no tiene acceso a este documento restringido");
  return u.nombre as string;
}

export async function nombreDeNorma(sql: Cliente, normaId: number): Promise<string> {
  const [n] = await sql`SELECT concat_ws(' ', tn.nombre, n.numero, 'de', n.anio::text) AS nombre
    FROM normas n JOIN tipos_norma tn ON tn.id = n.tipo_norma_id WHERE n.id = ${normaId}`;
  if (!n) throw new ErrorVigencia("La norma no existe");
  return n.nombre as string;
}

/** La norma enlazada al externo: la primera de `norma_documentos` (el normograma puede enlazarle otras). */
export async function normaEnlazada(sql: Cliente, documentoId: number): Promise<{ id: number; nombre: string } | null> {
  const [n] = await sql`SELECT n.id, concat_ws(' ', tn.nombre, n.numero, 'de', n.anio::text) AS nombre
    FROM norma_documentos nd JOIN normas n ON n.id = nd.norma_id JOIN tipos_norma tn ON tn.id = n.tipo_norma_id
    WHERE nd.documento_id = ${documentoId} ORDER BY nd.id LIMIT 1`;
  return n ? { id: Number(n.id), nombre: n.nombre as string } : null;
}

/** La verificación es de este externo (y, si se dice, con ese resultado); si no, no existe. */
export async function exigirVerificacion(sql: Cliente, documentoId: number, verificacionId: number, resultado?: ResultadoVerificacion): Promise<void> {
  const [v] = await sql`SELECT 1 FROM externo_verificaciones
    WHERE id = ${verificacionId} AND documento_id = ${documentoId}
      ${resultado ? sql`AND resultado = ${resultado}` : sql``}`;
  if (!v) throw new ErrorVigencia(NO_EXISTE);
}
