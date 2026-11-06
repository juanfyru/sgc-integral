import { fileTypeFromBuffer } from "file-type";

export const TAMANO_MAXIMO_BYTES = 25 * 1024 * 1024;
// file-type recomienda ≥4100 bytes; los OOXML (docx/xlsx/pptx) pueden requerir
// más para encontrar sus entradas dentro del zip.
export const TAMANO_MUESTRA_BYTES = 16384;

export const ROLES_ARCHIVO = ["principal", "editable", "anexo"] as const;
export type RolArchivo = (typeof ROLES_ARCHIVO)[number];
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
