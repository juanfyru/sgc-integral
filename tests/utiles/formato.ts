/**
 * Un documento con su PDF en el almacén, para probar el formato del acta. La fila se revierte con la
 * transacción; el archivo queda en `ALMACEN_RUTA`, que cada archivo de tests apunta a una carpeta
 * temporal y borra al terminar.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import type { TransactionSql } from "postgres";
import { resolverRutaAlmacen } from "@/lib/almacen";
import { documentoLibre, type DocumentoLibre } from "./tramites";

/** Con una línea dibujada: una página sin contenido no se puede incrustar como fondo. */
export async function pdfDeFormato(paginas = 1, tamano: [number, number] = [612, 792]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < paginas; i++) doc.addPage(tamano).drawLine({ start: { x: 40, y: 700 }, end: { x: 570, y: 700 }, thickness: 1 });
  return doc.save();
}

/** `pdf-lib` no cifra: basta que el tráiler diga `/Encrypt` para que `PDFDocument.load` lo rechace. */
export async function pdfProtegido(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  const texto = Buffer.from(await doc.save({ useObjectStreams: false })).toString("latin1");
  if (!texto.includes("trailer\n<<")) throw new Error("El PDF de prueba no trae tráiler clásico");
  return new Uint8Array(Buffer.from(texto.replace("trailer\n<<", "trailer\n<<\n/Encrypt << /Filter /Standard /V 1 >>"), "latin1"));
}

export const pdfSinPaginas = async () => (await PDFDocument.create()).save({ addDefaultPage: false });

export const huella = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export type DocumentoConArchivo = DocumentoLibre & { archivoId: number; absoluta: string };

/** Un documento vigente, general, de `GTH`, con `bytes` como principal y su huella verdadera. */
export async function documentoConArchivo(tx: TransactionSql, bytes?: Uint8Array): Promise<DocumentoConArchivo> {
  const contenido = bytes ?? (await pdfDeFormato());
  const doc = await documentoLibre(tx, { proceso: "GTH", tipo: "FO" });
  const [a] = await tx`SELECT a.id, a.ruta FROM archivos a JOIN documento_versiones v ON v.id = a.version_id
    WHERE v.documento_id = ${doc.id} AND a.rol = 'principal'`;
  const absoluta = resolverRutaAlmacen(a.ruta);
  if (!absoluta) throw new Error(`Ruta inválida en el almacén: ${a.ruta}`);
  await mkdir(path.dirname(absoluta), { recursive: true });
  await writeFile(absoluta, contenido);
  await tx`UPDATE archivos SET hash_sha256 = ${huella(contenido)}, tamano_bytes = ${Math.max(contenido.byteLength, 1)} WHERE id = ${a.id}`;
  return { ...doc, archivoId: Number(a.id), absoluta };
}
