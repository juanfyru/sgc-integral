import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { type NextRequest, NextResponse } from "next/server";
import { registrarArchivo } from "@/db/consultas/admin";
import { ErrorTramite } from "@/db/consultas/flujo/contrato";
import { resolverRutaAlmacen } from "@/lib/almacen";
import {
  sanearNombre,
  TAMANO_MAXIMO_BYTES,
  TAMANO_MUESTRA_BYTES,
  validarTipo,
  type RolArchivo,
} from "@/lib/subida";

function error(estado: number, mensaje: string) {
  return NextResponse.json({ error: mensaje }, { status: estado });
}

/** Sufija -2, -3… si el nombre ya existe en la carpeta de la versión. */
async function rutaLibre(carpetaRelativa: string, nombre: string) {
  const punto = nombre.lastIndexOf(".");
  const base = punto > 0 ? nombre.slice(0, punto) : nombre;
  const extension = punto > 0 ? nombre.slice(punto) : "";
  for (let n = 0; n < 100; n++) {
    const candidato = n === 0 ? nombre : `${base}-${n + 1}${extension}`;
    const relativa = `${carpetaRelativa}/${candidato}`;
    const absoluta = resolverRutaAlmacen(relativa);
    if (!absoluta) return null;
    try {
      await stat(absoluta);
    } catch {
      return { relativa, absoluta };
    }
  }
  return null;
}

export function nombreDeArchivo(peticion: NextRequest): string {
  return decodeURIComponent(peticion.headers.get("x-nombre-archivo") ?? "");
}

/**
 * Recibe el cuerpo de la petición como archivo de `destino` y lo registra. Quien la llama ya
 * autorizó la subida; lo que se valida aquí es el archivo: nombre, tamaño y tipo.
 */
export async function recibirArchivo(
  peticion: NextRequest,
  destino: { versionId: number; codigo: string; numero: number; rol: RolArchivo; tramiteId?: number },
  usuarioId: number,
): Promise<NextResponse> {
  const nombreCrudo = nombreDeArchivo(peticion);
  if (!nombreCrudo) return error(400, "Falta el nombre del archivo");

  const cabeceraLargo = peticion.headers.get("content-length");
  const declarado = cabeceraLargo === null ? null : Number(cabeceraLargo);
  if (declarado !== null && declarado > TAMANO_MAXIMO_BYTES) {
    return error(413, "El archivo supera el máximo de 25 MB");
  }
  if (!peticion.body) return error(400, "Cuerpo vacío");

  // ── Muestra inicial para magic bytes ──
  const lector = peticion.body.getReader();
  const previos: Uint8Array[] = [];
  let acumulado = 0;
  let fin = false;
  while (acumulado < TAMANO_MUESTRA_BYTES && !fin) {
    const { done, value } = await lector.read();
    if (done) { fin = true; break; }
    previos.push(value);
    acumulado += value.byteLength;
  }
  const muestra = new Uint8Array(acumulado);
  let despl = 0;
  for (const p of previos) { muestra.set(p, despl); despl += p.byteLength; }

  const tipo = await validarTipo(nombreCrudo, muestra);
  if (!tipo.ok) return error(415, tipo.error);

  // ── Destino en el almacén ──
  const nombre = sanearNombre(nombreCrudo);
  const carpeta = `documentos/${destino.codigo}/v${destino.numero}`;
  const ruta = await rutaLibre(carpeta, nombre);
  if (!ruta) return error(400, "No se pudo resolver un destino seguro");
  await mkdir(path.dirname(ruta.absoluta), { recursive: true });

  // ── Streaming a disco con hash y tope de tamaño (nunca 25 MB en RAM) ──
  const hash = createHash("sha256");
  const salida = createWriteStream(ruta.absoluta, { flags: "wx" });
  let total = 0;
  const escribir = (trozo: Uint8Array) =>
    new Promise<void>((resolver, rechazar) => {
      hash.update(trozo);
      total += trozo.byteLength;
      if (total > TAMANO_MAXIMO_BYTES) {
        rechazar(new Error("tamano"));
        return;
      }
      salida.write(Buffer.from(trozo), (err) => (err ? rechazar(err) : resolver()));
    });

  try {
    for (const p of previos) await escribir(p);
    while (!fin) {
      const { done, value } = await lector.read();
      if (done) break;
      await escribir(value);
    }
    await new Promise<void>((resolver, rechazar) =>
      salida.end((err?: Error | null) => (err ? rechazar(err) : resolver())),
    );
    // Lo guardado se firma por su huella: un archivo cortado no debe llegar a tener una.
    if (declarado !== null && total !== declarado) throw new Error("incompleto");
    if (total === 0) throw new Error("vacio");

    const { id } = await registrarArchivo(
      {
        versionId: destino.versionId, rol: destino.rol, ruta: ruta.relativa,
        nombreOriginal: nombreCrudo, extension: tipo.extension, mime: tipo.mime,
        tamanoBytes: total, hashSha256: hash.digest("hex"),
      },
      usuarioId,
      { tramiteId: destino.tramiteId },
    );
    return NextResponse.json(
      { id, nombre: nombreCrudo, mime: tipo.mime, tamanoBytes: total },
      { status: 201 },
    );
  } catch (err) {
    salida.destroy();
    await unlink(ruta.absoluta).catch(() => {});
    if (err instanceof ErrorTramite) return error(409, err.message);
    const mensaje = (err as Error).message;
    if (mensaje === "incompleto") return error(400, "El archivo llegó incompleto. Vuelva a subirlo.");
    if (mensaje === "tamano") return error(413, "El archivo supera el máximo de 25 MB");
    if (mensaje === "vacio") return error(400, "El archivo está vacío");
    if (mensaje.includes("principal")) return error(409, mensaje);
    console.error("Fallo en la subida:", err);
    return error(500, "No se pudo guardar el archivo");
  }
}
