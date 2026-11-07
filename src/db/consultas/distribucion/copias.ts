import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { PendingQuery, Row } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import { obtenerMarcaSegura, obtenerUrlPublica } from "@/db/consultas/entidad";
import { enTransaccion, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { crearNotificacion } from "@/db/consultas/notificaciones";
import { evento } from "./eventos-copia";
import { abrirHallazgoDeRecogida } from "./hallazgos";
import { filtroPuntos, puedeAccederDocumento } from "@/lib/alcance";
import { resolverRutaAlmacen } from "@/lib/almacen";
import { enVentanaDeImpresion, numeroDeCopia, puedePasar, textoSello, urlDeQr } from "@/lib/distribucion/copias";
import { estamparCopiaControlada } from "@/lib/distribucion/sello-pdf";
import {
  ErrorDistribucion,
  MOTIVOS_REIMPRESION,
  type DestinoRecogida,
  type EstadoCopia,
  type MotivoAnulacion,
  type MotivoPorRecoger,
  type MotivoReimpresion,
  type TipoEventoCopia,
} from "@/lib/distribucion/tipos";
import { ErrorPermiso, puede } from "@/lib/permisos";
import type { Rol } from "@/lib/roles";
import { fechaLimite } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";

type Opciones = { sql?: Cliente; ahora?: Date };

/** La copia no existe o quien la pide no la ve: el llamador responde «no encontrado», nunca «sin permiso». */
export class CopiaNoVisible extends ErrorDistribucion {
  constructor() {
    super("La copia no existe");
    this.name = "CopiaNoVisible";
  }
}

export type Copia = {
  id: number;
  versionId: number;
  documentoId: number;
  codigo: string;
  titulo: string;
  version: number;
  numero: number;
  punto: { id: number; nombre: string; sede: string | null };
  responsable: { id: number; nombre: string; cargo: string | null };
  responsableActual: { id: number; nombre: string };
  emitidaPor: { id: number; nombre: string };
  emitidaEn: Date;
  estado: EstadoCopia;
  nota: string | null;
  hashPrincipal: string;
  reemplazaCopiaId: number | null;
  versionVigente: boolean;
  venceEn: Date | null;
  fechas: { recibidaEn: Date | null; porRecogerEn: Date | null; recogidaEn: Date | null; anuladaEn: Date | null };
  motivoPorRecoger: MotivoPorRecoger | null;
  destinoRecogida: DestinoRecogida | null;
  motivoAnulacion: string | null;
};

export type EventoCopia = {
  tipo: TipoEventoCopia;
  usuario: string | null;
  creadoEn: Date;
  detalle: Record<string, unknown>;
};

export type AccionCopia = "recibir" | "recoger" | "anular" | "reimprimir" | "pdf";

const ESTADOS_VIVOS = ["emitida", "recibida", "por_recoger"];
const YA_NO_ESTA = "La copia ya no está en ese estado";

/** Si el documento `d` está en el alcance del líder (cualquier otro rol: siempre). */
export function documentoEnAlcance(sql: Cliente, sesion: SesionFlujo) {
  if (sesion.rol !== "lider_proceso") return sql`true`;
  return sql`EXISTS (
    SELECT 1
    FROM documento_proceso alc_dp
    LEFT JOIN subprocesos alc_s ON alc_s.id = alc_dp.subproceso_id
    JOIN procesos alc_p ON alc_p.id = COALESCE(alc_dp.proceso_id, alc_s.proceso_id) AND alc_p.activo
    JOIN usuario_procesos alc_up ON alc_up.proceso_id = alc_p.id AND alc_up.usuario_id = ${sesion.usuarioId}
    WHERE alc_dp.documento_id = d.id
  )`;
}

/** Quién ve una copia (spec 13B §6.4): `distribucion.ver` con alcance, el responsable del punto o quien la emitió. */
function condicionVista(sql: Cliente, sesion: SesionFlujo) {
  const propias = sql`(cc.emitida_por = ${sesion.usuarioId} OR cc.responsable_id = ${sesion.usuarioId} OR pu.responsable_id = ${sesion.usuarioId})`;
  if (!puede(sesion, "distribucion.ver")) return propias;
  if (sesion.rol === "lider_proceso") {
    return sql`(${propias} OR ${filtroPuntos(sql, sesion)} OR ${documentoEnAlcance(sql, sesion)})`;
  }
  return sql`true`;
}

type FilaCopia = { copia: Copia; enAlcance: boolean; ultimaAperturaEn: Date | null };

async function leerCopias(
  sql: Cliente,
  sesion: SesionFlujo,
  condicion: PendingQuery<Row[]>,
  orden: PendingQuery<Row[]>,
): Promise<FilaCopia[]> {
  const filas = await sql`
    SELECT cc.id, cc.version_id, cc.numero, cc.responsable_id, cc.responsable_nombre, cc.responsable_cargo,
           cc.emitida_por, cc.emitida_en, cc.estado, cc.nota, cc.hash_principal, cc.reemplaza_copia_id,
           cc.vence_en, cc.recibida_en, cc.por_recoger_en, cc.recogida_en, cc.anulada_en,
           cc.motivo_por_recoger, cc.destino_recogida, cc.motivo_anulacion, cc.ultima_apertura_en,
           v.documento_id, v.numero AS version_numero, (v.estado = 'vigente') AS version_vigente,
           d.codigo, d.titulo,
           pu.id AS punto_id, pu.nombre AS punto_nombre, pu.sede AS punto_sede,
           pu.responsable_id AS actual_id, ur.nombre AS actual_nombre,
           ue.nombre AS emitida_por_nombre,
           ${documentoEnAlcance(sql, sesion)} AS en_alcance
    FROM copias_controladas cc
    JOIN documento_versiones v ON v.id = cc.version_id
    JOIN documentos d ON d.id = v.documento_id
    JOIN puntos_uso pu ON pu.id = cc.punto_uso_id
    JOIN usuarios ur ON ur.id = pu.responsable_id
    JOIN usuarios ue ON ue.id = cc.emitida_por
    WHERE ${condicionVista(sql, sesion)} AND ${condicion}
    ORDER BY ${orden}`;
  return filas.map((f) => ({
    enAlcance: f.en_alcance as boolean,
    ultimaAperturaEn: (f.ultima_apertura_en as Date | null) ?? null,
    copia: {
      id: Number(f.id),
      versionId: Number(f.version_id),
      documentoId: Number(f.documento_id),
      codigo: f.codigo as string,
      titulo: f.titulo as string,
      version: Number(f.version_numero),
      numero: Number(f.numero),
      punto: { id: Number(f.punto_id), nombre: f.punto_nombre as string, sede: (f.punto_sede as string | null) ?? null },
      responsable: {
        id: Number(f.responsable_id),
        nombre: f.responsable_nombre as string,
        cargo: (f.responsable_cargo as string | null) ?? null,
      },
      responsableActual: { id: Number(f.actual_id), nombre: f.actual_nombre as string },
      emitidaPor: { id: Number(f.emitida_por), nombre: f.emitida_por_nombre as string },
      emitidaEn: f.emitida_en as Date,
      estado: f.estado as EstadoCopia,
      nota: (f.nota as string | null) ?? null,
      hashPrincipal: f.hash_principal as string,
      reemplazaCopiaId: f.reemplaza_copia_id === null ? null : Number(f.reemplaza_copia_id),
      versionVigente: f.version_vigente as boolean,
      venceEn: (f.vence_en as Date | null) ?? null,
      fechas: {
        recibidaEn: (f.recibida_en as Date | null) ?? null,
        porRecogerEn: (f.por_recoger_en as Date | null) ?? null,
        recogidaEn: (f.recogida_en as Date | null) ?? null,
        anuladaEn: (f.anulada_en as Date | null) ?? null,
      },
      motivoPorRecoger: (f.motivo_por_recoger as MotivoPorRecoger | null) ?? null,
      destinoRecogida: (f.destino_recogida as DestinoRecogida | null) ?? null,
      motivoAnulacion: (f.motivo_anulacion as string | null) ?? null,
    },
  }));
}

const leerUna = async (sql: Cliente, sesion: SesionFlujo, id: number) =>
  (await leerCopias(sql, sesion, sql`cc.id = ${id}`, sql`cc.id`))[0] ?? null;

const puedeEmitirSobre = (sesion: SesionFlujo, fila: FilaCopia) => puede(sesion, "copias.emitir") && fila.enAlcance;

/** `pdf` para quien emite solo dentro de la ventana de impresión; fuera de ella, «Reimprimir» (spec 13B §8.2). */
function accionesDe(sesion: SesionFlujo, fila: FilaCopia, ahora: Date): AccionCopia[] {
  const { copia } = fila;
  const acciones: AccionCopia[] = [];
  const viva = copia.estado === "emitida" || copia.estado === "recibida";
  const emite = puedeEmitirSobre(sesion, fila);
  const responde = puede(sesion, "distribucion.responder");
  const esResponsable = sesion.usuarioId === copia.responsableActual.id;
  if (copia.estado === "emitida" && esResponsable && responde) acciones.push("recibir");
  if (copia.estado === "por_recoger" && responde && (esResponsable || puede(sesion, "distribucion.gestionar"))) acciones.push("recoger");
  if (viva && (sesion.usuarioId === copia.emitidaPor.id || puede(sesion, "distribucion.gestionar"))) acciones.push("anular");
  if (viva && copia.versionVigente && emite) acciones.push("reimprimir");
  const pdf = emite ? enVentanaDeImpresion(fila.ultimaAperturaEn, ahora) : puede(sesion, "distribucion.ver");
  if (viva && copia.versionVigente && pdf) acciones.push("pdf");
  return acciones;
}

export async function emitirCopia(
  sesion: SesionFlujo,
  d: { documentoId: number; puntoUsoId: number; nota: string | null; reemplazaCopiaId?: number },
  opciones?: Opciones,
): Promise<{ copiaId: number; numero: number }> {
  if (!puede(sesion, "copias.emitir")) throw new ErrorPermiso();
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();

  return enTransaccion(sql, async (tx) => {
    const [doc] = await tx`
      SELECT d.id, d.codigo, d.nivel_acceso FROM documentos d
      WHERE d.id = ${d.documentoId} AND ${documentoEnAlcance(tx, sesion)}`;
    if (!doc) throw new ErrorDistribucion("El documento no existe");

    const [version] = await tx`
      SELECT id, numero FROM documento_versiones
      WHERE documento_id = ${d.documentoId} AND estado = 'vigente' FOR UPDATE`;
    if (!version) throw new ErrorDistribucion("El documento no tiene versión vigente");

    const [principal] = await tx`
      SELECT mime, hash_sha256 FROM archivos WHERE version_id = ${version.id} AND rol = 'principal'`;
    if (!principal || principal.mime !== "application/pdf") {
      throw new ErrorDistribucion("Para emitir copias controladas el archivo principal debe ser PDF");
    }

    const [punto] = await tx`
      SELECT pu.id, pu.nombre, pu.activo, u.id AS responsable_id, u.nombre AS responsable_nombre,
             u.rol AS responsable_rol, u.ver_historial AS responsable_historial, c.nombre AS responsable_cargo
      FROM puntos_uso pu
      JOIN usuarios u ON u.id = pu.responsable_id
      LEFT JOIN cargos c ON c.id = u.cargo_id
      WHERE pu.id = ${d.puntoUsoId}`;
    if (!punto || !punto.activo) throw new ErrorDistribucion("El punto de uso no existe o está inactivo");

    if (doc.nivel_acceso === "restringido") {
      const ve = await puedeAccederDocumento(
        d.documentoId,
        { usuarioId: Number(punto.responsable_id), rol: punto.responsable_rol as Rol, verHistorial: punto.responsable_historial as boolean },
        { sql: tx },
      );
      if (!ve) throw new ErrorDistribucion(`El responsable de ${punto.nombre} no tiene acceso a este documento`);
    }

    if (d.reemplazaCopiaId !== undefined) {
      const [previa] = await tx`
        SELECT cc.estado, cc.punto_uso_id, v.documento_id
        FROM copias_controladas cc JOIN documento_versiones v ON v.id = cc.version_id
        WHERE cc.id = ${d.reemplazaCopiaId}`;
      if (
        !previa ||
        previa.estado !== "por_recoger" ||
        Number(previa.documento_id) !== d.documentoId ||
        Number(previa.punto_uso_id) !== d.puntoUsoId
      ) {
        throw new ErrorDistribucion("La copia que se reemplaza debe estar por recoger, en el mismo punto y documento");
      }
    }

    const [{ siguiente }] = await tx`
      SELECT COALESCE(max(numero), 0) + 1 AS siguiente FROM copias_controladas WHERE version_id = ${version.id}`;
    const numero = Number(siguiente);
    const alActo = sesion.usuarioId === Number(punto.responsable_id);
    const venceEn = alActo
      ? null
      : fechaLimite(ahora, (await obtenerConfigDocumental({ sql: tx })).distribucion.plazoRecibidoDias, zonaHoraria());

    const [copia] = await tx`
      INSERT INTO copias_controladas
        (version_id, numero, punto_uso_id, responsable_id, responsable_nombre, responsable_cargo, emitida_por,
         hash_principal, nota, estado, emitida_en, recibida_en, reemplaza_copia_id, ultima_apertura_en, vence_en)
      VALUES (${version.id}, ${numero}, ${punto.id}, ${punto.responsable_id}, ${punto.responsable_nombre},
              ${punto.responsable_cargo ?? null}, ${sesion.usuarioId}, ${principal.hash_sha256}, ${d.nota},
              ${alActo ? "recibida" : "emitida"}, ${ahora}, ${alActo ? ahora : null}, ${d.reemplazaCopiaId ?? null},
              ${ahora}, ${venceEn})
      RETURNING id`;
    const copiaId = Number(copia.id);

    await evento(tx, copiaId, "emitida", sesion.usuarioId, alActo ? { recibidaEnElActo: true } : {}, ahora);
    if (alActo) await evento(tx, copiaId, "recibida", sesion.usuarioId, {}, ahora);

    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "copia_emitida",
      entidad: "copia",
      entidadId: copiaId,
      detalle: { codigo: doc.codigo, version: Number(version.numero), numero, punto: punto.nombre },
    });
    if (!alActo) {
      await crearNotificacion(
        {
          usuarioId: Number(punto.responsable_id),
          tipo: "distribucion.copia",
          titulo: `Le entregarán la copia N.º ${numeroDeCopia(numero)} de ${doc.codigo} v${version.numero} en ${punto.nombre}`,
          enlace: `/distribucion/copias/${copiaId}`,
          entidad: "copia",
          entidadId: copiaId,
        },
        tx,
      );
    }
    return { copiaId, numero };
  });
}

export async function obtenerCopia(
  id: number,
  sesion: SesionFlujo,
  opciones?: Opciones,
): Promise<(Copia & { eventos: EventoCopia[]; acciones: AccionCopia[] }) | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const fila = await leerUna(sql, sesion, id);
  if (!fila) return null;
  const eventos = await sql`
    SELECT e.tipo, u.nombre AS usuario, e.creado_en, e.detalle
    FROM copia_eventos e LEFT JOIN usuarios u ON u.id = e.usuario_id
    WHERE e.copia_id = ${id}
    ORDER BY e.creado_en, e.id`;
  return {
    ...fila.copia,
    eventos: eventos.map((e) => ({
      tipo: e.tipo as TipoEventoCopia,
      usuario: (e.usuario as string | null) ?? null,
      creadoEn: e.creado_en as Date,
      detalle: e.detalle as Record<string, unknown>,
    })),
    acciones: accionesDe(sesion, fila, opciones?.ahora ?? new Date()),
  };
}

/** 409 por `ventana` (terminó el plazo de impresión) o por `no_disponible` (versión no vigente, estado, archivo o huella). */
export type ResultadoPdf =
  | { ok: true; bytes: Uint8Array; nombre: string }
  | { ok: false; estado: 404 }
  | { ok: false; estado: 409; motivo: "ventana" | "no_disponible" };

const NO_DISPONIBLE = { ok: false, estado: 409, motivo: "no_disponible" } as const;
const FUERA_DE_VENTANA = { ok: false, estado: 409, motivo: "ventana" } as const;

export async function copiaParaPdf(id: number, sesion: SesionFlujo, opciones?: Opciones): Promise<ResultadoPdf> {
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const fila = await leerUna(sql, sesion, id);
  if (!fila) return { ok: false, estado: 404 };
  const { copia } = fila;
  const emite = puedeEmitirSobre(sesion, fila);
  if (!emite && !puede(sesion, "distribucion.ver")) return { ok: false, estado: 404 };
  if (!copia.versionVigente || (copia.estado !== "emitida" && copia.estado !== "recibida")) return NO_DISPONIBLE;
  if (emite && !enVentanaDeImpresion(fila.ultimaAperturaEn, ahora)) return FUERA_DE_VENTANA;

  // Se lee una sola vez: lo que se compara con la huella guardada es lo mismo que se sella.
  const [principal] = await sql`SELECT ruta FROM archivos WHERE version_id = ${copia.versionId} AND rol = 'principal'`;
  const ruta = principal ? resolverRutaAlmacen(principal.ruta as string) : null;
  if (!ruta) return NO_DISPONIBLE;
  let original: Buffer;
  try {
    original = await readFile(ruta);
  } catch {
    console.error(`Archivo faltante en el almacén para la copia ${id}`);
    return NO_DISPONIBLE;
  }
  if (createHash("sha256").update(original).digest("hex") !== copia.hashPrincipal) {
    console.error(`La huella del archivo principal no coincide con la de la copia ${id}`);
    return NO_DISPONIBLE;
  }

  const [config, marca, urlPublica] = await Promise.all([
    obtenerConfigDocumental({ sql }),
    obtenerMarcaSegura(),
    obtenerUrlPublica({ sql }),
  ]);
  const { titulo, detalle } = textoSello({
    numero: copia.numero,
    codigo: copia.codigo,
    version: copia.version,
    punto: copia.punto.nombre,
    responsable: copia.responsable.nombre,
    cargo: copia.responsable.cargo,
    emitidaEn: copia.emitidaEn,
    zona: zonaHoraria(),
  });
  const bytes = await estamparCopiaControlada(original, {
    titulo,
    detalle,
    qr: urlDeQr(urlPublica, copia.codigo, copia.version),
    colorHex: marca.primario,
    franjaCm: config.distribucion.selloFranjaCm,
    qrCm: config.distribucion.selloQrCm,
  });

  const registrado = await enTransaccion(sql, async (tx): Promise<"ok" | "ventana" | "no_disponible"> => {
    const [vivo] = await tx`SELECT estado, ultima_apertura_en FROM copias_controladas WHERE id = ${id} FOR UPDATE`;
    if (!vivo || (vivo.estado !== "emitida" && vivo.estado !== "recibida")) return "no_disponible";
    if (!emite) {
      await evento(tx, id, "consultada", sesion.usuarioId, { usuarioId: sesion.usuarioId }, ahora);
      return "ok";
    }
    const apertura = vivo.ultima_apertura_en as Date | null;
    if (!apertura || !enVentanaDeImpresion(apertura, ahora)) return "ventana";
    const [{ n }] = await tx`
      SELECT count(*)::int AS n FROM copia_eventos
      WHERE copia_id = ${id} AND tipo = 'impresa' AND creado_en >= ${apertura}`;
    if (n === 0) await evento(tx, id, "impresa", sesion.usuarioId, { usuarioId: sesion.usuarioId }, ahora);
    return "ok";
  });
  if (registrado === "ventana") return FUERA_DE_VENTANA;
  if (registrado === "no_disponible") return NO_DISPONIBLE;
  return { ok: true, bytes, nombre: `${copia.codigo}-v${copia.version}-copia-${numeroDeCopia(copia.numero)}.pdf` };
}

export async function reimprimirCopia(
  id: number,
  sesion: SesionFlujo,
  motivo: MotivoReimpresion,
  texto: string | null,
  opciones?: Opciones,
): Promise<void> {
  if (!puede(sesion, "copias.emitir")) throw new ErrorPermiso();
  if (!MOTIVOS_REIMPRESION.includes(motivo)) throw new ErrorDistribucion("Elija el motivo de la reimpresión");
  const explicacion = texto?.trim() || null;
  if (motivo === "otro" && !explicacion) throw new ErrorDistribucion("Escriba el motivo de la reimpresión");
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();

  await enTransaccion(sql, async (tx) => {
    await tx`SELECT id FROM copias_controladas WHERE id = ${id} FOR UPDATE`;
    const fila = await leerUna(tx, sesion, id);
    if (!fila || !puedeEmitirSobre(sesion, fila)) throw new CopiaNoVisible();
    const { copia } = fila;
    if (copia.estado !== "emitida" && copia.estado !== "recibida") throw new ErrorDistribucion(YA_NO_ESTA);
    if (!copia.versionVigente) throw new ErrorDistribucion("La versión de esta copia ya no está vigente");

    await tx`UPDATE copias_controladas SET ultima_apertura_en = ${ahora} WHERE id = ${id}`;
    await evento(
      tx,
      id,
      "reimpresa",
      sesion.usuarioId,
      { usuarioId: sesion.usuarioId, motivo, ...(explicacion ? { texto: explicacion } : {}) },
      ahora,
    );
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "copia_reimpresa",
      entidad: "copia",
      entidadId: id,
      detalle: { codigo: copia.codigo, version: copia.version, numero: copia.numero, punto: copia.punto.nombre, motivo },
    });
  });
}

export async function anularCopia(
  id: number,
  sesion: SesionFlujo,
  motivo: MotivoAnulacion,
  texto: string | null,
  opciones?: Opciones,
): Promise<void> {
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const explicacion = texto?.trim() || null;

  await enTransaccion(sql, async (tx) => {
    await tx`SELECT id FROM copias_controladas WHERE id = ${id} FOR UPDATE`;
    const fila = await leerUna(tx, sesion, id);
    if (!fila || (fila.copia.emitidaPor.id !== sesion.usuarioId && !puede(sesion, "distribucion.gestionar"))) {
      throw new CopiaNoVisible();
    }
    const { copia } = fila;
    if (!puedePasar(copia.estado, "anulada")) throw new ErrorDistribucion(YA_NO_ESTA);

    await tx`UPDATE copias_controladas SET estado = 'anulada', anulada_en = ${ahora}, motivo_anulacion = ${motivo}
      WHERE id = ${id}`;
    await evento(
      tx,
      id,
      "anulada",
      sesion.usuarioId,
      { usuarioId: sesion.usuarioId, motivo, ...(explicacion ? { texto: explicacion } : {}) },
      ahora,
    );
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "copia_anulada",
      entidad: "copia",
      entidadId: id,
      detalle: { codigo: copia.codigo, version: copia.version, numero: copia.numero, punto: copia.punto.nombre, motivo },
    });
    if (copia.estado === "emitida" && copia.responsable.id !== sesion.usuarioId) {
      await crearNotificacion(
        {
          usuarioId: copia.responsable.id,
          tipo: "distribucion.copia",
          titulo: `Se anuló la copia N.º ${numeroDeCopia(copia.numero)} de ${copia.codigo} v${copia.version} que le iban a entregar en ${copia.punto.nombre}`,
          enlace: `/distribucion/copias/${id}`,
          entidad: "copia",
          entidadId: id,
        },
        tx,
      );
    }
  });
}

export type FiltroCopias = {
  puntoId?: number;
  documentoId?: number;
  estado?: "vivas" | "por_recoger" | "sin_recibido" | "anuladas" | "todas";
};

export async function listarCopias(sesion: SesionFlujo, filtro: FiltroCopias, opciones?: Opciones): Promise<Copia[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const estado = filtro.estado ?? "todas";
  const porEstado =
    estado === "vivas"
      ? sql`cc.estado IN ${sql(ESTADOS_VIVOS)}`
      : estado === "por_recoger"
        ? sql`cc.estado = 'por_recoger'`
        : estado === "sin_recibido"
          ? sql`cc.estado = 'emitida'`
          : estado === "anuladas"
            ? sql`cc.estado = 'anulada'`
            : sql`true`;
  const condicion = sql`${porEstado}
    AND ${filtro.puntoId === undefined ? sql`true` : sql`cc.punto_uso_id = ${filtro.puntoId}`}
    AND ${filtro.documentoId === undefined ? sql`true` : sql`d.id = ${filtro.documentoId}`}`;
  const filas = await leerCopias(sql, sesion, condicion, sql`cc.emitida_en DESC, cc.id DESC`);
  return filas.map((f) => f.copia);
}

export async function conteosPorPunto(
  sesion: SesionFlujo,
  opciones?: Opciones,
): Promise<{ puntoId: number; nombre: string; sede: string | null; vivas: number; porRecoger: number; sinRecibido: number }[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`
    SELECT pu.id, pu.nombre, pu.sede,
           count(cc.id) FILTER (WHERE cc.estado IN ${sql(ESTADOS_VIVOS)}) AS vivas,
           count(cc.id) FILTER (WHERE cc.estado = 'por_recoger') AS por_recoger,
           count(cc.id) FILTER (WHERE cc.estado = 'emitida') AS sin_recibido
    FROM puntos_uso pu
    LEFT JOIN copias_controladas cc ON cc.punto_uso_id = pu.id
    WHERE ${filtroPuntos(sql, sesion)}
    GROUP BY pu.id
    ORDER BY pu.orden, lower(coalesce(pu.sede, '')), lower(pu.nombre), pu.id`;
  return filas.map((f) => ({
    puntoId: Number(f.id),
    nombre: f.nombre as string,
    sede: (f.sede as string | null) ?? null,
    vivas: Number(f.vivas),
    porRecoger: Number(f.por_recoger),
    sinRecibido: Number(f.sin_recibido),
  }));
}

const DESTINOS_DE_PERSONA = ["devuelta", "destruida", "no_encontrada"] as const;
type DestinoDePersona = (typeof DESTINOS_DE_PERSONA)[number];

async function bloquear(tx: Cliente, id: number): Promise<void> {
  await tx`SELECT id FROM copias_controladas WHERE id = ${id} FOR UPDATE`;
}

async function recibirEn(tx: Cliente, sesion: SesionFlujo, id: number, ahora: Date): Promise<void> {
  await bloquear(tx, id);
  const fila = await leerUna(tx, sesion, id);
  if (!fila) throw new CopiaNoVisible();
  const { copia } = fila;
  if (copia.responsableActual.id !== sesion.usuarioId) {
    throw new ErrorDistribucion("Solo el responsable actual del punto confirma el recibido");
  }
  if (copia.estado !== "emitida" || !puedePasar(copia.estado, "recibida")) throw new ErrorDistribucion(YA_NO_ESTA);

  await tx`UPDATE copias_controladas SET estado = 'recibida', recibida_en = ${ahora}, vence_en = NULL WHERE id = ${id}`;
  await evento(tx, id, "recibida", sesion.usuarioId, { usuarioId: sesion.usuarioId }, ahora);
  await registrarAuditoria(tx, {
    usuarioId: sesion.usuarioId,
    accion: "copia_recibida",
    entidad: "copia",
    entidadId: id,
    detalle: { codigo: copia.codigo, version: copia.version, numero: copia.numero, punto: copia.punto.nombre },
  });
}

async function recogerEn(
  tx: Cliente,
  sesion: SesionFlujo,
  id: number,
  destino: DestinoDePersona,
  ahora: Date,
): Promise<void> {
  await bloquear(tx, id);
  const fila = await leerUna(tx, sesion, id);
  if (!fila) throw new CopiaNoVisible();
  const { copia } = fila;
  if (copia.responsableActual.id !== sesion.usuarioId && !puede(sesion, "distribucion.gestionar")) {
    throw new ErrorDistribucion("Solo el responsable actual del punto confirma la recogida");
  }
  if (!puedePasar(copia.estado, "recogida")) throw new ErrorDistribucion(YA_NO_ESTA);

  await tx`UPDATE copias_controladas
    SET estado = 'recogida', recogida_en = ${ahora}, destino_recogida = ${destino}, vence_en = NULL
    WHERE id = ${id}`;
  await evento(tx, id, "recogida", sesion.usuarioId, { usuarioId: sesion.usuarioId, destino }, ahora);
  await registrarAuditoria(tx, {
    usuarioId: sesion.usuarioId,
    accion: "copia_recogida",
    entidad: "copia",
    entidadId: id,
    detalle: { codigo: copia.codigo, version: copia.version, numero: copia.numero, punto: copia.punto.nombre, destino },
  });
  if (destino === "no_encontrada") {
    const { plazoCorreccionDias } = (await obtenerConfigDocumental({ sql: tx })).distribucion;
    await abrirHallazgoDeRecogida(tx, copia, ahora, plazoCorreccionDias);
  }
}

/**
 * Al cerrar una verificación: la copia obsoleta que ya no está en el punto pasa a recogida, sin hallazgo.
 * Devuelve false si ya no estaba por recoger (alguien la recogió mientras se verificaba).
 */
export async function recogerEnVerificacion(
  tx: Cliente,
  copiaId: number,
  verificacionId: number,
  usuarioId: number,
  ahora: Date,
): Promise<boolean> {
  await bloquear(tx, copiaId);
  const [c] = await tx`
    SELECT cc.estado, cc.numero, d.codigo, v.numero AS version_numero, pu.nombre AS punto
    FROM copias_controladas cc
    JOIN documento_versiones v ON v.id = cc.version_id
    JOIN documentos d ON d.id = v.documento_id
    JOIN puntos_uso pu ON pu.id = cc.punto_uso_id
    WHERE cc.id = ${copiaId}`;
  if (!c || c.estado !== "por_recoger" || !puedePasar(c.estado, "recogida")) return false;
  const destino: DestinoRecogida = "retirada_en_verificacion";
  await tx`UPDATE copias_controladas
    SET estado = 'recogida', recogida_en = ${ahora}, destino_recogida = ${destino}, vence_en = NULL
    WHERE id = ${copiaId}`;
  await evento(tx, copiaId, "recogida", usuarioId, { usuarioId, destino, verificacionId }, ahora);
  await registrarAuditoria(tx, {
    usuarioId,
    accion: "copia_recogida",
    entidad: "copia",
    entidadId: copiaId,
    detalle: {
      codigo: c.codigo, version: Number(c.version_numero), numero: Number(c.numero), punto: c.punto, destino, verificacionId,
    },
  });
  return true;
}

export async function confirmarRecibido(id: number, sesion: SesionFlujo, opciones?: Opciones): Promise<void> {
  if (!puede(sesion, "distribucion.responder")) throw new ErrorPermiso();
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  await enTransaccion(sql, (tx) => recibirEn(tx, sesion, id, ahora));
}

export async function confirmarRecogida(
  id: number,
  sesion: SesionFlujo,
  destino: DestinoDePersona,
  opciones?: Opciones,
): Promise<void> {
  if (!puede(sesion, "distribucion.responder")) throw new ErrorPermiso();
  if (!DESTINOS_DE_PERSONA.includes(destino)) throw new ErrorDistribucion("Elija qué se hizo con la copia");
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  await enTransaccion(sql, (tx) => recogerEn(tx, sesion, id, destino, ahora));
}

/** Una sola confirmación: recibe la copia nueva y recoge la anterior que reemplaza. */
export async function confirmarReemplazo(
  idNueva: number,
  sesion: SesionFlujo,
  destino: "devuelta" | "destruida",
  opciones?: Opciones,
): Promise<void> {
  if (!puede(sesion, "distribucion.responder")) throw new ErrorPermiso();
  if (destino !== "devuelta" && destino !== "destruida") {
    throw new ErrorDistribucion("Elija qué se hizo con la copia anterior");
  }
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  await enTransaccion(sql, async (tx) => {
    await bloquear(tx, idNueva);
    const fila = await leerUna(tx, sesion, idNueva);
    if (!fila) throw new CopiaNoVisible();
    const { copia } = fila;
    if (copia.reemplazaCopiaId === null) throw new ErrorDistribucion("Esta copia no reemplaza a otra");
    if (copia.estado === "emitida") await recibirEn(tx, sesion, idNueva, ahora);
    else if (copia.estado !== "recibida") throw new ErrorDistribucion(YA_NO_ESTA);
    await recogerEn(tx, sesion, copia.reemplazaCopiaId, destino, ahora);
  });
}

/** Emite una copia de la versión vigente por cada punto que tenía copias por recoger de versiones anteriores. */
export async function reemplazarCopias(
  sesion: SesionFlujo,
  versionNuevaId: number,
  opciones?: Opciones,
): Promise<{ emitidas: number }> {
  if (!puede(sesion, "copias.emitir")) throw new ErrorPermiso();
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();

  return enTransaccion(sql, async (tx) => {
    const [nueva] = await tx`
      SELECT id, documento_id, estado FROM documento_versiones WHERE id = ${versionNuevaId} FOR UPDATE`;
    if (!nueva || nueva.estado !== "vigente") throw new ErrorDistribucion("La versión indicada no es la vigente del documento");
    const documentoId = Number(nueva.documento_id);
    const [principal] = await tx`SELECT mime FROM archivos WHERE version_id = ${versionNuevaId} AND rol = 'principal'`;
    if (!principal || principal.mime !== "application/pdf") {
      throw new ErrorDistribucion("La versión nueva no tiene PDF: las copias anteriores se recogen sin reemplazo");
    }

    const viejas = await leerCopias(
      tx,
      sesion,
      tx`d.id = ${documentoId} AND cc.estado = 'por_recoger' AND cc.version_id <> ${versionNuevaId} AND pu.activo`,
      tx`cc.id`,
    );
    let emitidas = 0;
    for (const { copia } of viejas) {
      const [viva] = await tx`
        SELECT 1 FROM copias_controladas
        WHERE version_id = ${versionNuevaId} AND punto_uso_id = ${copia.punto.id} AND estado IN ${tx(["emitida", "recibida"])}`;
      if (viva) continue;
      await emitirCopia(
        sesion,
        { documentoId, puntoUsoId: copia.punto.id, nota: null, reemplazaCopiaId: copia.id },
        { sql: tx, ahora },
      );
      emitidas += 1;
    }
    return { emitidas };
  });
}

export type CopiasDeDocumento = {
  vigentes: Copia[];
  porRecoger: Copia[];
  /**
   * Para quien emite sobre el documento (`copias.emitir` y alcance): `pdf` si la vigente tiene PDF principal,
   * `sin_pdf` si no lo tiene; `null` sin vigente o sin poder emitir.
   */
  emision: "pdf" | "sin_pdf" | null;
  /** Los puntos activos con copias por recoger y sin copia viva de la vigente: las que emite «Reemplazar». */
  reemplazables: number;
  puedeReemplazar: boolean;
  /** La versión vigente, destino de «Reemplazar»; null si el documento no tiene vigente con PDF. */
  versionVigenteId: number | null;
  /** Los procesos del documento: el diálogo de emisión pone primero sus puntos. */
  procesoIds: number[];
};

/** Lo que muestra el bloque «Copias controladas» de las fichas. */
export async function copiasDeDocumento(
  documentoId: number,
  sesion: SesionFlujo,
  opciones?: Opciones,
): Promise<CopiasDeDocumento> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await leerCopias(
    sql,
    sesion,
    sql`d.id = ${documentoId} AND cc.estado IN ${sql(ESTADOS_VIVOS)}`,
    sql`lower(pu.nombre), cc.version_id, cc.numero`,
  );
  const copias = filas.map((f) => f.copia);
  const vigentes = copias.filter((c) => c.estado !== "por_recoger");
  const porRecoger = copias.filter((c) => c.estado === "por_recoger");

  const [vigente] = await sql`
    SELECT v.id, ${documentoEnAlcance(sql, sesion)} AS en_alcance, ${procesosDelDocumento(sql)} AS procesos,
           EXISTS (SELECT 1 FROM archivos a WHERE a.version_id = v.id AND a.rol = 'principal' AND a.mime = 'application/pdf') AS con_pdf
    FROM documento_versiones v JOIN documentos d ON d.id = v.documento_id
    WHERE v.documento_id = ${documentoId} AND v.estado = 'vigente'`;
  const versionVigenteId = vigente && vigente.con_pdf ? Number(vigente.id) : null;
  const emite = vigente !== undefined && vigente.en_alcance === true && puede(sesion, "copias.emitir");
  // La misma cuenta que `reemplazarCopias`: una copia nueva por punto, y no donde ya hay una viva de la vigente.
  const reemplazables = new Set(
    porRecoger
      .filter((c) => c.versionId !== versionVigenteId && !vigentes.some((v) => v.punto.id === c.punto.id))
      .map((c) => c.punto.id),
  ).size;
  return {
    vigentes,
    porRecoger,
    emision: emite ? (vigente.con_pdf ? "pdf" : "sin_pdf") : null,
    reemplazables,
    versionVigenteId,
    puedeReemplazar: versionVigenteId !== null && emite && reemplazables > 0,
    procesoIds: vigente ? (vigente.procesos as (string | number)[]).map(Number) : [],
  };
}

export type DocumentoParaEmitir = { id: number; codigo: string; titulo: string; procesoIds: number[] };

/** Los documentos vigentes con PDF principal que la persona puede emitir (el buscador del diálogo de emisión). */
export async function documentosParaEmitir(sesion: SesionFlujo, opciones?: Opciones): Promise<DocumentoParaEmitir[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`
    SELECT d.id, d.codigo, d.titulo, ${procesosDelDocumento(sql)} AS procesos
    FROM documentos d
    JOIN documento_versiones v ON v.documento_id = d.id AND v.estado = 'vigente'
    WHERE EXISTS (SELECT 1 FROM archivos a WHERE a.version_id = v.id AND a.rol = 'principal' AND a.mime = 'application/pdf')
      AND ${documentoEnAlcance(sql, sesion)}
    ORDER BY d.codigo`;
  return filas.map((f) => ({
    id: Number(f.id),
    codigo: f.codigo as string,
    titulo: f.titulo as string,
    procesoIds: (f.procesos as (string | number)[]).map(Number),
  }));
}

/** Los procesos del documento `d` (el propietario y «donde aplica»; un subproceso cuenta por su proceso). */
function procesosDelDocumento(sql: Cliente) {
  return sql`COALESCE((
    SELECT array_agg(DISTINCT COALESCE(pd_dp.proceso_id, pd_s.proceso_id))
    FROM documento_proceso pd_dp LEFT JOIN subprocesos pd_s ON pd_s.id = pd_dp.subproceso_id
    WHERE pd_dp.documento_id = d.id), '{}')`;
}

export type PuntoParaEmitir = { id: number; nombre: string; sede: string | null; procesoIds: number[] };

/**
 * Todos los puntos activos (spec 13B §8.1): la restricción del líder es el documento, no el punto. El diálogo
 * pone primero los de los procesos del documento elegido (`agruparPuntos`).
 */
export async function puntosParaEmitir(sesion: SesionFlujo, opciones?: Opciones): Promise<PuntoParaEmitir[]> {
  if (!puede(sesion, "copias.emitir")) return [];
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`
    SELECT pu.id, pu.nombre, pu.sede,
           COALESCE((SELECT array_agg(pp.proceso_id ORDER BY pp.proceso_id)
             FROM punto_uso_procesos pp WHERE pp.punto_uso_id = pu.id), '{}') AS procesos
    FROM puntos_uso pu
    WHERE pu.activo
    ORDER BY pu.orden, lower(coalesce(pu.sede, '')), lower(pu.nombre), pu.id`;
  return filas.map((f) => ({
    id: Number(f.id),
    nombre: f.nombre as string,
    sede: (f.sede as string | null) ?? null,
    procesoIds: (f.procesos as (string | number)[]).map(Number),
  }));
}
