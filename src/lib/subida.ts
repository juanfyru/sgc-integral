import { fileTypeFromBuffer } from "file-type";

export const TAMANO_MAXIMO_BYTES = 25 * 1024 * 1024;
// file-type recomienda ≥4100 bytes; los OOXML (docx/xlsx/pptx) pueden requerir
// más para encontrar sus entradas dentro del zip.
export const TAMANO_MUESTRA_BYTES = 16384;

export const ROLES_ARCHIVO = ["principal", "editable", "anexo"] as const;
export type RolArchivo = (typeof ROLES_ARCHIVO)[number];
/**
 * Dónde cuelga una evidencia: una jornada de socialización, un ítem de verificación, una norma (su PDF), una revisión
 * anual o un hallazgo.
 */
export const CONTEXTOS_EVIDENCIA = ["jornada", "verificacion_item", "norma", "revision_anual", "hallazgo"] as const;
export type ContextoEvidencia = (typeof CONTEXTOS_EVIDENCIA)[number];
/** Los roles que las listas y las rutas de archivos de un documento ofrecen: las actas quedan fuera. */
export const ROLES_ARCHIVO_LISTA: string[] = [...ROLES_ARCHIVO];

// Allowlist extensión → MIMEs aceptados según magic bytes (regla ISO 6).
// Los Office legados comparten contenedor OLE (application/x-cfb). Los OOXML
// aceptan también application/zip: file-type no siempre alcanza a distinguir
// el subtipo con la muestra — el riesgo residual (un zip renombrado) es
// aceptable: solo suben quien administra documentos y el elaborador designado
// de un trámite, y el archivo se sirve siempre con su MIME y `nosniff`.
const PERMITIDOS: Record<string, string[]> = {
  pdf: ["application/pdf"],
  docx: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/zip",
  ],
  xlsx: [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/zip",
  ],
  pptx: [
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/zip",
  ],
  doc: ["application/x-cfb"],
  xls: ["application/x-cfb"],
  ppt: ["application/x-cfb"],
  png: ["image/png"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  webp: ["image/webp"],
  zip: ["application/zip"],
  rar: ["application/x-rar-compressed", "application/vnd.rar"],
};

const LARGO_MAXIMO_NOMBRE = 100;

/**
 * Nombre seguro para el almacén: sin rutas, sin acentos, solo
 * [a-z0-9._-] — compatible con SEGMENTO_VALIDO de almacen.ts.
 */
export function sanearNombre(nombre: string): string {
  const base = nombre.split(/[\\/]/).pop() ?? "";
  let limpio = base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-]+$/g, "");
  if (!limpio || /^\.+$/.test(limpio)) return "archivo";
  if (limpio.length > LARGO_MAXIMO_NOMBRE) {
    const punto = limpio.lastIndexOf(".");
    const extension = punto > 0 ? limpio.slice(punto) : "";
    limpio = limpio.slice(0, LARGO_MAXIMO_NOMBRE - extension.length) + extension;
  }
  return limpio;
}

export type ResultadoTipo =
  | { ok: true; extension: string; mime: string }
  | { ok: false; error: string };

/**
 * Valida extensión (allowlist) Y magic bytes (file-type) y que ambos sean
 * coherentes. El MIME devuelto es el DETECTADO, nunca el declarado (regla 6).
 */
export async function validarTipo(
  nombre: string,
  muestra: Uint8Array,
): Promise<ResultadoTipo> {
  const punto = nombre.lastIndexOf(".");
  const extension = punto > 0 ? nombre.slice(punto + 1).toLowerCase() : "";
  const aceptados = PERMITIDOS[extension];
  if (!aceptados) {
    return {
      ok: false,
      error: `Formato no permitido: .${extension || "(sin extensión)"}. Se aceptan PDF, Office, imágenes y ZIP/RAR`,
    };
  }
  const detectado = await fileTypeFromBuffer(muestra);
  if (!detectado) {
    return { ok: false, error: "No se reconoce el contenido del archivo" };
  }
  if (!aceptados.includes(detectado.mime)) {
    return {
      ok: false,
      error: `El contenido (${detectado.mime}) no corresponde a la extensión .${extension}`,
    };
  }
  return { ok: true, extension, mime: detectado.mime };
}

const EXTENSIONES_EVIDENCIA = ["pdf", "png", "jpg", "jpeg", "webp"];

const ERROR_EVIDENCIA = "La evidencia debe ser PDF o imagen (PNG, JPG, WebP)";
const ERROR_SOLO_PDF = "El archivo de la norma debe ser un PDF";

/** El archivo de una norma es su texto oficial: solo PDF (spec 13C §10.1). */
export const CONTEXTOS_SOLO_PDF: readonly ContextoEvidencia[] = ["norma"];

/**
 * Los dueños de un solo archivo, con la tabla del dueño: el que se sube reemplaza al anterior en la misma transacción y
 * con el dueño bloqueado, así dos subidas a la vez, o una subida y el borrado del dueño, se ordenan (`registrarArchivo`).
 */
export const CONTEXTOS_UNICOS: Partial<Record<ContextoEvidencia, string>> = { norma: "normas" };

/**
 * Como `validarTipo`, pero una evidencia solo es un PDF o una imagen (nunca SVG, HTML ni Office), y con `soloPdf`
 * solo un PDF: una extensión fuera de la lista o un contenido que no la respalda dan el mismo mensaje.
 */
export async function validarTipoEvidencia(
  nombre: string,
  muestra: Uint8Array,
  opciones?: { soloPdf?: boolean },
): Promise<ResultadoTipo> {
  const punto = nombre.lastIndexOf(".");
  const extension = punto > 0 ? nombre.slice(punto + 1).toLowerCase() : "";
  const error = opciones?.soloPdf ? ERROR_SOLO_PDF : ERROR_EVIDENCIA;
  const permitidas = opciones?.soloPdf ? ["pdf"] : EXTENSIONES_EVIDENCIA;
  if (!permitidas.includes(extension)) return { ok: false, error };
  const tipo = await validarTipo(nombre, muestra);
  return tipo.ok ? tipo : { ok: false, error };
}
