/**
 * El acta de aprobación o de eliminación de una versión (spec 13A §11.2 y §11.3). Se genera al
 * publicar y, si esa generación falla, a pedido: sus datos ya no cambian, así que el resultado es el
 * mismo en cualquier momento.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { obtenerMarcaSegura } from "@/db/consultas/entidad";
import { listarFirmas } from "@/db/consultas/firmas";
import { generarActa, diaYHora, type DatosActa } from "@/lib/acta";
import { resolverRutaAlmacen } from "@/lib/almacen";
import {
  ETIQUETA_FIRMA,
  ETIQUETA_MOTIVO,
  ETIQUETA_TIPO_SOLICITUD,
  type Motivo,
  type TipoSolicitud,
} from "@/lib/tramites/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";

type Opciones = { sql?: Cliente };
type ClaseActa = DatosActa["clase"];

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

function textoDeDuplicidad(aceptar: Evento | undefined): string | null {
  const parecidos = aceptar?.detalle.parecidos;
  if (!Array.isArray(parecidos)) return null;
  const decision = aceptar?.detalle.decision === "modificacion" ? "se convirtió en modificación de un documento existente" : "se siguió como documento nuevo";
  if (parecidos.length === 0) return `No había documentos parecidos; ${decision}`;
  const lista = parecidos
    .map((p: { codigo?: string; nivel?: string }) => `${p.codigo ?? "?"} (${p.nivel === "muy_parecido" ? "muy parecido" : "parecido"})`)
    .join(", ");
  return `Se vieron ${parecidos.length} documento${parecidos.length === 1 ? "" : "s"}: ${lista}; ${decision}`;
}

/** `null` si el trámite no está `publicado` ni `eliminado`. Las firmas son las de la última ronda. */
export async function reunirDatosActa(tramiteId: number, opciones?: Opciones): Promise<DatosActa | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const cierre = await versionDeActa(tramiteId, { sql });
  if (!cierre) return null;

  const [t] = await sql`SELECT t.numero, t.tipo, t.motivo, t.justificacion, t.ronda, t.creado_en, t.cerrado_en,
      d.codigo, d.titulo, td.nombre AS tipo_documento, p.nombre AS proceso, u.nombre AS solicitante,
      v.numero AS version, v.resumen_cambios
    FROM tramites t
    JOIN documentos d ON d.id = t.documento_id
    JOIN tipos_documento td ON td.id = d.tipo_id
    JOIN procesos p ON p.id = t.proceso_id
    JOIN usuarios u ON u.id = t.solicitante_id
    JOIN documento_versiones v ON v.id = t.version_id
    WHERE t.id = ${tramiteId}`;
  const filasEventos = await sql`SELECT e.tipo, u.nombre AS persona, e.creado_en, e.detalle
    FROM tramite_eventos e LEFT JOIN usuarios u ON u.id = e.usuario_id
    WHERE e.tramite_id = ${tramiteId} ORDER BY e.id`;
  const eventos: Evento[] = filasEventos.map((e) => ({ tipo: e.tipo, persona: e.persona, creadoEn: e.creado_en, detalle: e.detalle }));
  const [{ total, cerradas }] = await sql`SELECT count(*)::int AS total, (count(*) FILTER (WHERE estado = 'cerrada'))::int AS cerradas
    FROM tramite_observaciones WHERE tramite_id = ${tramiteId}`;
  const zona = zonaHoraria();
  const aceptar = eventos.find((e) => e.tipo === "aceptar");
  const obsoletas = eventos
    .filter((e) => e.tipo === "publicar" || e.tipo === "aprobar_y_publicar")
    .flatMap((e) => (Array.isArray(e.detalle.obsoletas) ? (e.detalle.obsoletas as number[]) : []));

  return {
    clase: cierre.clase,
    entidad: (await obtenerMarcaSegura()).nombre,
    documento: { codigo: t.codigo, titulo: t.titulo, tipo: t.tipo_documento, proceso: t.proceso },
    version: t.version,
    solicitud: {
      numero: t.numero,
      tipo: ETIQUETA_TIPO_SOLICITUD[t.tipo as TipoSolicitud],
      motivo: ETIQUETA_MOTIVO[t.motivo as Motivo],
      justificacion: t.justificacion,
      solicitante: t.solicitante,
      fecha: t.creado_en,
    },
    vistoBueno: textoDeVistoBueno(eventos, zona),
    aceptacion: { quien: aceptar?.persona ?? "—", fecha: aceptar?.creadoEn ?? t.creado_en, duplicidad: textoDeDuplicidad(aceptar) },
    controlCambios: cierre.clase === "aprobacion" ? t.resumen_cambios : null, // el de la versión anulada es de cuando se emitió
    firmas: (await listarFirmas(tramiteId, { sql }))
      .filter((f) => f.ronda === t.ronda)
      .map((f) => ({ firma: ETIQUETA_FIRMA[f.firma], nombre: f.nombre, cargo: f.cargo, fecha: f.creadoEn, huella: f.hashSha256 })),
    rondas: t.ronda,
    observaciones: { total, cerradas },
    versionObsoleta: obsoletas.length === 0 ? null : Math.max(...obsoletas),
    publicadoEn: t.cerrado_en,
    zona,
  };
}

async function actaRegistrada(sql: Cliente, versionId: number): Promise<{ archivoId: number; ruta: string } | null> {
  const [a] = await sql`SELECT id, ruta FROM archivos
    WHERE version_id = ${versionId} AND rol IN ('acta_aprobacion', 'acta_eliminacion')`;
  return a ? { archivoId: Number(a.id), ruta: a.ruta } : null;
}

/**
 * Devuelve el acta de la versión y, si no existe, la genera y la registra. No usa `registrarArchivo`:
 * su traducción de errores es la del archivo principal. Si otra petición la registró entre tanto
 * (índice único), devuelve la que quedó.
 */
export async function asegurarActa(
  tramiteId: number,
  opciones?: { sql?: Cliente; generar?: (d: DatosActa) => Promise<Uint8Array> },
): Promise<{ archivoId: number; ruta: string } | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const cierre = await versionDeActa(tramiteId, { sql });
  if (!cierre) return null;
  const existente = await actaRegistrada(sql, cierre.versionId);
  if (existente) return existente;

  const datos = await reunirDatosActa(tramiteId, { sql });
  if (!datos) return null;
  const bytes = await (opciones?.generar ?? generarActa)(datos);
  const ruta = `actas/${cierre.numero}.pdf`;
  const absoluta = resolverRutaAlmacen(ruta);
  if (!absoluta) throw new Error(`Ruta inválida en el almacén: ${ruta}`);

  await mkdir(path.dirname(absoluta), { recursive: true });
  try {
    await writeFile(absoluta, bytes, { flag: "wx" });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    const otra = await actaRegistrada(sql, cierre.versionId);
    if (otra) return otra;
    await writeFile(absoluta, bytes); // quedó de un intento que no llegó a registrarse
  }

  const [fila] = await sql`INSERT INTO archivos (version_id, rol, ruta, nombre_original, extension, mime, tamano_bytes, hash_sha256)
    VALUES (${cierre.versionId}, ${ROL_DE_ACTA[cierre.clase]}, ${ruta}, ${`Acta ${cierre.numero}.pdf`}, 'pdf', 'application/pdf',
      ${bytes.byteLength}, ${createHash("sha256").update(bytes).digest("hex")})
    ON CONFLICT DO NOTHING
    RETURNING id`;
  if (fila) return { archivoId: Number(fila.id), ruta };
  return actaRegistrada(sql, cierre.versionId);
}
