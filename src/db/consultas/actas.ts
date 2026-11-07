/**
 * El acta de aprobación o de eliminación de una versión (spec 13A §11.2 y §11.3). Sus datos se
 * congelan en el evento de cierre, dentro de la misma transacción que publica o elimina: el acta se
 * genera al publicar y, si esa generación falla, a pedido, y sale igual en cualquier momento aunque
 * luego cambien títulos, procesos o nombres. Una versión puede llevar dos cierres (el trámite que la
 * publicó y el que la eliminó), cada uno con su acta y su rol.
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import { listarFirmas } from "@/db/consultas/firmas";
import { archivoDeFormato, leerFormatoCongelado } from "@/db/consultas/formato-acta";
import { criteriosNoCumplen } from "@/db/consultas/revision";
import { generarActa, diaYHora, type DatosActa, type FormatoActa } from "@/lib/acta";
import { resolverRutaAlmacen } from "@/lib/almacen";
import {
  ETIQUETA_FIRMA,
  ETIQUETA_MOTIVO,
  ETIQUETA_TIPO_SOLICITUD,
  type Motivo,
  type TipoSolicitud,
} from "@/lib/tramites/tipos";
import { MARCA_DEFECTO } from "@/lib/marca";
import { zonaHoraria } from "@/lib/zona-horaria";
import { ErrorTramite, enTransaccion, type FilaTramite } from "./flujo/contrato";

type Opciones = { sql?: Cliente };
type ClaseActa = DatosActa["clase"];
type DatosCongelados = Omit<DatosActa, "firmas">;

const ROL_DE_ACTA: Record<ClaseActa, string> = { aprobacion: "acta_aprobacion", eliminacion: "acta_eliminacion" };

/** La versión que lleva el acta de un trámite cerrado; `null` si no se publicó ni se ejecutó. */
export async function versionDeActa(
  tramiteId: number,
  opciones?: Opciones,
): Promise<{ versionId: number; numero: string; clase: ClaseActa } | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const [t] = await sql`SELECT numero, etapa, version_id FROM tramites
    WHERE id = ${tramiteId} AND etapa IN ('publicado', 'eliminado') AND version_id IS NOT NULL`;
  if (!t) return null;
  return { versionId: Number(t.version_id), numero: t.numero, clase: t.etapa === "publicado" ? "aprobacion" : "eliminacion" };
}

type Evento = { tipo: string; persona: string | null; creadoEn: Date; detalle: Record<string, unknown> };

function textoDeVistoBueno(eventos: Evento[], zona: string): string {
  const e = eventos.find((x) => ["dar_visto_bueno", "visto_bueno_automatico", "visto_bueno_omitido"].includes(x.tipo));
  if (!e) return "Sin registro";
  if (e.tipo === "visto_bueno_automatico") return "Dado: quien pide es líder del proceso";
  if (e.tipo === "visto_bueno_omitido") return "Omitido: el proceso no tenía líder activo";
  return `Dado por ${e.persona ?? "—"}, ${diaYHora(e.creadoEn, zona)}`;
}

const conteoDeNivel = (n: number, nivel: string) => (n === 0 ? [] : [`${n} ${nivel}${n === 1 ? "" : "s"}`]);

/**
 * Solo el conteo y el nivel: quien lee el acta tal vez no puede ver un parecido restringido, y su
 * código no se le dice (F13A-R38). Los códigos quedan en el evento `aceptar`, para el historial.
 */
function textoDeDuplicidad(aceptar: Record<string, unknown> | undefined): string | null {
  const parecidos = aceptar?.parecidos;
  if (!Array.isArray(parecidos)) return null;
  const decision = aceptar?.decision === "modificacion" ? "se convirtió en modificación de un documento existente" : "se siguió como documento nuevo";
  if (parecidos.length === 0) return `No había documentos parecidos; ${decision}`;
  const muyParecidos = parecidos.filter((p: { nivel?: string }) => p.nivel === "muy_parecido").length;
  const niveles = [...conteoDeNivel(muyParecidos, "muy parecido"), ...conteoDeNivel(parecidos.length - muyParecidos, "parecido")];
  return `Se vieron ${parecidos.length} documento${parecidos.length === 1 ? "" : "s"}: ${niveles.join(" y ")}; ${decision}`;
}

export const FALTA_ENTIDAD = "Configure el nombre de la entidad antes de publicar";

/**
 * El nombre de la entidad que irá en el acta. Vacío o el de la instalación sin configurar
 * (`MARCA_DEFECTO.nombre`, lo que siembra `db:seed:minima`) se rechaza: quedaría congelado en un
 * registro legal. Lo usan los validadores del cierre, antes de pedir la firma, y el congelado.
 */
export async function nombreDeEntidadParaActa(sql: Cliente): Promise<string> {
  const [entidad] = await sql`SELECT valor FROM configuracion WHERE clave = 'nombre_entidad'`;
  const nombre = typeof entidad?.valor === "string" ? entidad.valor.trim() : "";
  if (!nombre || nombre === MARCA_DEFECTO.nombre) throw new ErrorTramite(FALTA_ENTIDAD);
  return nombre;
}

/**
 * La versión del formato que lleva esta acta y los márgenes de hoy. Se lee después de aplicar el
 * cierre: la versión recién publicada ya es la vigente, y la recién eliminada ya no. Sin versión
 * utilizable es `null` y el acta sale con el diseño básico. El archivo no se lee aquí: la transacción
 * queda corta, y uno perdido no impide publicar.
 */
async function formatoDelCierre(tx: TransactionSql): Promise<FormatoActa | null> {
  const { documentoId, margenSuperiorCm, margenInferiorCm } = (await obtenerConfigDocumental({ sql: tx })).formatoActa;
  const archivo = documentoId === null ? null : await archivoDeFormato(documentoId, { sql: tx });
  if (!archivo) return null;
  const { archivoId, hash, codigo, version } = archivo;
  return { archivoId, hash, codigo, version, margenSuperiorCm, margenInferiorCm };
}

/**
 * Lo que dice el acta, leído dentro de la transacción del cierre y después de aplicarlo (el título
 * nuevo de una modificación ya está en el documento). Lo guardan los manejadores en `detalle.acta`
 * del evento. La entidad se lee de `configuracion`: si falta, el cierre falla antes que escribir un
 * registro legal con un nombre inventado.
 */
export async function congelarDatosActa(
  tx: TransactionSql,
  tramite: FilaTramite,
  clase: ClaseActa,
  ahora: Date,
  versionObsoleta: number | null = null,
): Promise<DatosCongelados> {
  const nombreEntidad = await nombreDeEntidadParaActa(tx);

  const [d] = await tx`SELECT d.codigo, d.titulo, td.nombre AS tipo_documento, p.nombre AS proceso,
      u.nombre AS solicitante, v.numero AS version, v.resumen_cambios
    FROM documentos d
    JOIN tipos_documento td ON td.id = d.tipo_id
    JOIN procesos p ON p.id = ${tramite.procesoId}
    JOIN usuarios u ON u.id = ${tramite.solicitanteId}
    JOIN documento_versiones v ON v.id = ${tramite.versionId} AND v.documento_id = d.id
    WHERE d.id = ${tramite.documentoId}`;
  if (!d) throw new ErrorTramite("El trámite no tiene documento ni versión para dejar el acta");
  const filas = await tx`SELECT e.tipo, u.nombre AS persona, e.creado_en, e.detalle
    FROM tramite_eventos e LEFT JOIN usuarios u ON u.id = e.usuario_id
    WHERE e.tramite_id = ${tramite.id} ORDER BY e.id`;
  const eventos: Evento[] = filas.map((e) => ({ tipo: e.tipo, persona: e.persona, creadoEn: e.creado_en, detalle: e.detalle }));
  const [{ total, cerradas }] = await tx`SELECT count(*)::int AS total, (count(*) FILTER (WHERE estado = 'cerrada'))::int AS cerradas
    FROM tramite_observaciones WHERE tramite_id = ${tramite.id}`;
  const zona = zonaHoraria();
  const aceptar = eventos.find((e) => e.tipo === "aceptar");
  const criterios = clase === "aprobacion" ? await criteriosNoCumplen(tramite.id, tramite.ronda, { sql: tx }) : [];

  return {
    clase,
    entidad: nombreEntidad,
    documento: { codigo: d.codigo, titulo: d.titulo, tipo: d.tipo_documento, proceso: d.proceso },
    version: d.version,
    solicitud: {
      numero: tramite.numero,
      tipo: ETIQUETA_TIPO_SOLICITUD[tramite.tipo as TipoSolicitud],
      motivo: ETIQUETA_MOTIVO[tramite.motivo as Motivo],
      justificacion: tramite.justificacion,
      solicitante: d.solicitante,
      fecha: tramite.creadoEn,
    },
    vistoBueno: textoDeVistoBueno(eventos, zona),
    aceptacion: { quien: aceptar?.persona ?? "—", fecha: aceptar?.creadoEn ?? tramite.creadoEn, duplicidad: textoDeDuplicidad(aceptar?.detalle) },
    // El control de cambios de la versión anulada es de cuando se emitió, no de esta eliminación.
    controlCambios: clase === "aprobacion" ? d.resumen_cambios : null,
    rondas: tramite.ronda,
    observaciones: { total, cerradas },
    versionObsoleta,
    publicadoEn: ahora,
    zona,
    noCumple: criterios.map(({ texto, nota }) => ({ texto, nota })),
    formato: await formatoDelCierre(tx),
  };
}

const comoFecha = (v: unknown) => new Date(v as string);

/**
 * Los datos congelados al cerrar el trámite más las firmas de esa ronda, que `firmas` ya guarda con
 * nombre y cargo copiados. `null` si el trámite no está `publicado` ni `eliminado` o no tiene el evento.
 */
export async function reunirDatosActa(tramiteId: number, opciones?: Opciones): Promise<DatosActa | null> {
  const sql = opciones?.sql ?? obtenerSql();
  if (!(await versionDeActa(tramiteId, { sql }))) return null;
  const [cierre] = await sql`SELECT detalle -> 'acta' AS acta FROM tramite_eventos
    WHERE tramite_id = ${tramiteId} AND tipo IN ('publicar', 'aprobar_y_publicar') AND detalle ? 'acta'
    ORDER BY id DESC LIMIT 1`;
  if (!cierre?.acta) return null;
  const congelado = cierre.acta as DatosCongelados;
  // Un acta congelada antes de F13A-R38 trae en este texto los códigos de los parecidos: no se imprime tal cual.
  const [aceptar] = await sql`SELECT detalle FROM tramite_eventos WHERE tramite_id = ${tramiteId} AND tipo = 'aceptar' ORDER BY id LIMIT 1`;
  const firmas = (await listarFirmas(tramiteId, { sql }))
    .filter((f) => f.ronda === congelado.rondas)
    .map((f) => ({ firma: ETIQUETA_FIRMA[f.firma], nombre: f.nombre, cargo: f.cargo, fecha: f.creadoEn, huella: f.hashSha256 }));
  return {
    ...congelado,
    solicitud: { ...congelado.solicitud, fecha: comoFecha(congelado.solicitud.fecha) },
    aceptacion: { ...congelado.aceptacion, fecha: comoFecha(congelado.aceptacion.fecha), duplicidad: textoDeDuplicidad(aceptar?.detalle) },
    publicadoEn: comoFecha(congelado.publicadoEn),
    firmas,
  };
}

async function actaRegistrada(sql: Cliente, versionId: number, clase: ClaseActa): Promise<{ archivoId: number; ruta: string } | null> {
  const [a] = await sql`SELECT id, ruta FROM archivos WHERE version_id = ${versionId} AND rol = ${ROL_DE_ACTA[clase]}`;
  return a ? { archivoId: Number(a.id), ruta: a.ruta } : null;
}

async function existeEnDisco(absoluta: string): Promise<boolean> {
  try {
    await stat(absoluta);
    return true;
  } catch {
    return false;
  }
}

/** Escribe en un archivo temporal y lo renombra: quien está sirviendo el acta nunca ve un archivo truncado. */
async function escribirAtomico(absoluta: string, bytes: Uint8Array): Promise<void> {
  await mkdir(path.dirname(absoluta), { recursive: true });
  const temporal = `${absoluta}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporal, bytes);
    await rename(temporal, absoluta);
  } catch (err) {
    await rm(temporal, { force: true });
    throw err;
  }
}

/** Sin quien pida el acta no hay fila: solo queda el `console.error`. */
async function auditarNoRegenerable(sql: Cliente, usuarioId: number | null | undefined, archivoId: number, detalle: Record<string, unknown>) {
  if (!usuarioId) return;
  await registrarAuditoria(sql, { usuarioId, accion: "acta_no_regenerable", entidad: "archivos", entidadId: archivoId, detalle });
}

/**
 * Devuelve el acta del cierre y, si no existe (o su fila no tiene archivo), la genera con los datos
 * congelados y la registra. No usa `registrarArchivo`: su traducción de errores es la del archivo
 * principal. Si otra petición la registró entre tanto (índice único), devuelve la que quedó. Quien
 * la registra deja su fila en la bitácora: `usuarioId` es quien la pidió, y sin él la fila sale del
 * sistema. Solo al generar se lee el formato congelado: si falta o es otro archivo no hay acta, y el
 * pedido siguiente lo reintenta.
 */
export async function asegurarActa(
  tramiteId: number,
  opciones?: {
    sql?: Cliente;
    generar?: (d: DatosActa, membrete: Uint8Array | null) => Promise<Uint8Array>;
    usuarioId?: number | null;
  },
): Promise<{ archivoId: number; ruta: string } | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const cierre = await versionDeActa(tramiteId, { sql });
  if (!cierre) return null;
  const existente = await actaRegistrada(sql, cierre.versionId, cierre.clase);
  if (existente) {
    const absoluta = resolverRutaAlmacen(existente.ruta);
    if (absoluta && (await existeEnDisco(absoluta))) return existente;
  }

  const datos = await reunirDatosActa(tramiteId, { sql });
  if (!datos) return null;
  const { formato } = datos;
  const membrete = formato ? await leerFormatoCongelado(formato, { sql }) : null;
  if (formato && !membrete) {
    console.error(`El acta del trámite ${tramiteId} no se generó: el archivo ${formato.archivoId} del formato ${formato.codigo} falta o cambió.`);
    await auditarNoRegenerable(sql, opciones?.usuarioId, formato.archivoId, { tramiteId, motivo: "formato", archivoId: formato.archivoId });
    return null;
  }
  const bytes = await (opciones?.generar ?? generarActa)(datos, membrete);
  const ruta = existente?.ruta ?? `actas/${cierre.numero}.pdf`;
  const absoluta = resolverRutaAlmacen(ruta);
  if (!absoluta) throw new Error(`Ruta inválida en el almacén: ${ruta}`);
  const huella = createHash("sha256").update(bytes).digest("hex");

  if (existente) {
    // El archivo se perdió: solo se sirve el regenerado si es idéntico al que se registró. Si no,
    // la fila (huella y tamaño del acta original) no se pisa y el acta se trata como perdida.
    const [registrada] = await sql`SELECT hash_sha256 FROM archivos WHERE id = ${existente.archivoId}`;
    if (registrada?.hash_sha256 !== huella) {
      console.error(
        `El acta del trámite ${tramiteId} no se pudo regenerar idéntica (huella registrada ${registrada?.hash_sha256}, regenerada ${huella}); no se sirve.`,
      );
      await auditarNoRegenerable(sql, opciones?.usuarioId, existente.archivoId, {
        tramiteId,
        huellaRegistrada: registrada?.hash_sha256 ?? null,
        huellaRegenerada: huella,
      });
      return null;
    }
    await escribirAtomico(absoluta, bytes);
    return existente;
  }
  await escribirAtomico(absoluta, bytes);
  return enTransaccion(sql, async (tx) => {
    const [fila] = await tx`INSERT INTO archivos (version_id, rol, ruta, nombre_original, extension, mime, tamano_bytes, hash_sha256)
      VALUES (${cierre.versionId}, ${ROL_DE_ACTA[cierre.clase]}, ${ruta}, ${`Acta ${cierre.numero}.pdf`}, 'pdf', 'application/pdf',
        ${bytes.byteLength}, ${huella})
      ON CONFLICT DO NOTHING
      RETURNING id`;
    if (!fila) return actaRegistrada(tx, cierre.versionId, cierre.clase);
    const archivoId = Number(fila.id);
    await registrarAuditoria(tx, {
      usuarioId: opciones?.usuarioId ?? null,
      accion: "acta_generada",
      entidad: "archivos",
      entidadId: archivoId,
      detalle: { tramiteId, numero: cierre.numero, huella },
    });
    return { archivoId, ruta };
  });
}
