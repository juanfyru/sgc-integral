/**
 * El documento del SGC que la entidad elige como formato del acta (spec de las adiciones, §4.2 y
 * §4.4). Su versión vigente es la que se usa, y puede dejar de servir después de elegirla: por eso se
 * revisa al guardar y al abrir la configuración. Lo perdido no es lo mismo que lo que no sirve: con
 * un formato que no sirve el acta sale con el diseño básico; con uno perdido no se puede generar.
 */
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { obtenerSql, type Cliente } from "@/db/cliente";
import type { FormatoActa } from "@/lib/acta";
import { resolverRutaAlmacen } from "@/lib/almacen";
import { motivoMembreteNoUtilizable } from "@/lib/membrete-acta";

type Opciones = { sql?: Cliente };

export type ArchivoDeFormato = { archivoId: number; ruta: string; hash: string; codigo: string; version: number };

export type EstadoFormato =
  | { estado: "sin_formato" }
  | { estado: "listo"; codigo: string; version: number }
  | { estado: "no_sirve"; motivo: string }
  | { estado: "perdido" };

export type MembreteListo = ArchivoDeFormato & { bytes: Uint8Array };

type ArchivoRegistrado = { archivo: ArchivoDeFormato; tamanoBytes: number };

/** El archivo que el documento puede aportar como formato, o el motivo por el que no puede. */
async function archivoOMotivo(documentoId: number, sql: Cliente): Promise<ArchivoRegistrado | string> {
  const [f] = await sql`SELECT d.codigo, d.nivel_acceso, v.numero, a.id AS archivo_id, a.ruta, a.mime, a.hash_sha256, a.tamano_bytes
    FROM documentos d
    LEFT JOIN documento_versiones v ON v.documento_id = d.id AND v.estado = 'vigente'
    LEFT JOIN archivos a ON a.version_id = v.id AND a.rol = 'principal'
    WHERE d.id = ${documentoId}`;
  if (!f || f.numero === null) return "El documento del formato no tiene versión vigente";
  if (f.nivel_acceso !== "general") return "El documento del formato es restringido, y el acta la ven personas sin acceso a él";
  if (f.mime !== "application/pdf") return "El archivo principal del formato debe ser PDF";
  return {
    archivo: { archivoId: Number(f.archivo_id), ruta: f.ruta, hash: f.hash_sha256, codigo: f.codigo, version: Number(f.numero) },
    tamanoBytes: Number(f.tamano_bytes),
  };
}

/** La versión vigente, de acceso general, con principal PDF; sin mirar si su archivo está en el almacén. */
export async function archivoDeFormato(documentoId: number, opciones?: Opciones): Promise<ArchivoDeFormato | null> {
  const registrado = await archivoOMotivo(documentoId, opciones?.sql ?? obtenerSql());
  return typeof registrado === "string" ? null : registrado.archivo;
}

/** Los bytes del archivo, si está en el almacén y su tamaño y su huella son los esperados. */
async function leerArchivo({ ruta, hash, tamanoBytes }: { ruta: string; hash: string; tamanoBytes: number }): Promise<Uint8Array | null> {
  const absoluta = resolverRutaAlmacen(ruta);
  if (!absoluta) return null;
  try {
    // El tamaño va primero: un archivo cambiado no se carga entero en memoria.
    if ((await stat(absoluta)).size !== tamanoBytes) return null;
    const bytes = await readFile(absoluta);
    return createHash("sha256").update(bytes).digest("hex") === hash ? bytes : null;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") console.error(`No se pudo leer el formato del acta ${ruta}:`, err);
    return null;
  }
}

/**
 * Los bytes de la versión que un acta congeló, siga o no vigente o elegida. Cuenta la huella congelada:
 * si el archivo falta o es otro da `null`, y quien llama no busca otro.
 */
export async function leerFormatoCongelado(
  { archivoId, hash }: Pick<FormatoActa, "archivoId" | "hash">,
  opciones?: Opciones,
): Promise<Uint8Array | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const [a] = await sql`SELECT ruta, tamano_bytes FROM archivos WHERE id = ${archivoId}`;
  return a ? leerArchivo({ ruta: a.ruta, hash, tamanoBytes: Number(a.tamano_bytes) }) : null;
}

async function revisar(documentoId: number, sql: Cliente): Promise<{ estado: EstadoFormato; membrete?: MembreteListo }> {
  const registrado = await archivoOMotivo(documentoId, sql);
  if (typeof registrado === "string") return { estado: { estado: "no_sirve", motivo: registrado } };
  const { archivo, tamanoBytes } = registrado;
  const bytes = await leerArchivo({ ruta: archivo.ruta, hash: archivo.hash, tamanoBytes });
  if (!bytes) return { estado: { estado: "perdido" } };
  const motivo = await motivoMembreteNoUtilizable(bytes);
  if (motivo) return { estado: { estado: "no_sirve", motivo } };
  return { estado: { estado: "listo", codigo: archivo.codigo, version: archivo.version }, membrete: { ...archivo, bytes } };
}

export async function revisarFormatoActa(documentoId: number | null, opciones?: Opciones): Promise<EstadoFormato> {
  if (documentoId === null) return { estado: "sin_formato" };
  return (await revisar(documentoId, opciones?.sql ?? obtenerSql())).estado;
}

/** La misma revisión, con lo que ya leyó: el formato listo para dibujar, o `null` si no lo está. */
export async function membreteListo(documentoId: number | null, opciones?: Opciones): Promise<MembreteListo | null> {
  if (documentoId === null) return null;
  return (await revisar(documentoId, opciones?.sql ?? obtenerSql())).membrete ?? null;
}

/**
 * Los documentos que pueden ser formato: vigentes, de acceso general y con principal PDF. `incluir`
 * añade el ya elegido aunque haya dejado de cumplirlo: si desapareciera de la lista, guardar cualquier
 * otra sección lo quitaría sin que nadie lo pidiera. Quien la llame debe exigir `tramites.gestionar`:
 * con `incluir` puede mostrar el título de un documento restringido.
 */
export async function documentosParaFormato(
  opciones?: Opciones & { incluir?: number | null },
): Promise<{ id: number; codigo: string; titulo: string }[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`SELECT d.id, d.codigo, d.titulo FROM documentos d
    WHERE d.id = ${opciones?.incluir ?? null} OR (d.nivel_acceso = 'general' AND EXISTS (
      SELECT 1 FROM documento_versiones v JOIN archivos a ON a.version_id = v.id AND a.rol = 'principal'
      WHERE v.documento_id = d.id AND v.estado = 'vigente' AND a.mime = 'application/pdf'
    ))
    ORDER BY d.codigo`;
  return filas.map((f) => ({ id: Number(f.id), codigo: f.codigo, titulo: f.titulo }));
}
