import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { type NextRequest, NextResponse } from "next/server";
import {
  obtenerVersionParaSubida,
  registrarArchivo,
} from "@/db/consultas/admin";
import { resolverRutaAlmacen } from "@/lib/almacen";
import { requerirSesion } from "@/lib/sesion-actual";
import {
  ROLES_ARCHIVO,
  sanearNombre,
  TAMANO_MAXIMO_BYTES,
  TAMANO_MUESTRA_BYTES,
  validarTipo,
  type RolArchivo,
} from "@/lib/subida";

export const dynamic = "force-dynamic";

function error(estado: number, mensaje: string) {
  return NextResponse.json({ error: mensaje }, { status: estado });
}

// CSRF del handler (las actions lo traen integrado; aquí es manual): el
// Origin, si viene, debe coincidir con el host servido.
function origenValido(peticion: NextRequest): boolean {
  const origen = peticion.headers.get("origin");
  if (!origen) return true; // sin Origin no hay vector CSRF de navegador
  const host =
    peticion.headers.get("x-forwarded-host") ?? peticion.headers.get("host");
  try {
    return new URL(origen).host === host;
  } catch {
    return false;
  }
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

export async function POST(peticion: NextRequest) {
  let sesion;
  try {
    sesion = await requerirSesion();
  } catch {
    return error(401, "No autorizado");
  }
  if (!origenValido(peticion)) return error(403, "Origen no permitido");

  const versionId = Number(peticion.nextUrl.searchParams.get("version"));
  const rol = peticion.nextUrl.searchParams.get("rol") as RolArchivo;
  if (!Number.isInteger(versionId) || versionId <= 0) {
    return error(400, "Falta la versión de destino");
  }
  if (!ROLES_ARCHIVO.includes(rol)) return error(400, "Rol de archivo inválido");

  const nombreCrudo = decodeURIComponent(
    peticion.headers.get("x-nombre-archivo") ?? "",
  );
  if (!nombreCrudo) return error(400, "Falta el nombre del archivo");

  const version = await obtenerVersionParaSubida(versionId);
  if (!version) return error(404, "La versión no existe");
  if (version.estado !== "borrador") {
    return error(409, "Solo se pueden subir archivos a una versión en borrador");
  }

  const declarado = Number(peticion.headers.get("content-length"));
  if (declarado > TAMANO_MAXIMO_BYTES) {
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
  const carpeta = `documentos/${version.codigo}/v${version.numero}`;
  const destino = await rutaLibre(carpeta, nombre);
  if (!destino) return error(400, "No se pudo resolver un destino seguro");
  await mkdir(path.dirname(destino.absoluta), { recursive: true });

  // ── Streaming a disco con hash y tope de tamaño (nunca 25 MB en RAM) ──
  const hash = createHash("sha256");
  const salida = createWriteStream(destino.absoluta, { flags: "wx" });
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
    if (total === 0) throw new Error("vacio");

    const { id } = await registrarArchivo(
      {
        versionId, rol, ruta: destino.relativa, nombreOriginal: nombreCrudo,
        extension: tipo.extension, mime: tipo.mime,
        tamanoBytes: total, hashSha256: hash.digest("hex"),
      },
      sesion.usuarioId,
    );
    return NextResponse.json(
      { id, nombre: nombreCrudo, mime: tipo.mime, tamanoBytes: total },
      { status: 201 },
    );
  } catch (err) {
    salida.destroy();
    await unlink(destino.absoluta).catch(() => {});
    const mensaje = (err as Error).message;
    if (mensaje === "tamano") return error(413, "El archivo supera el máximo de 25 MB");
    if (mensaje === "vacio") return error(400, "El archivo está vacío");
    if (mensaje.includes("principal")) return error(409, mensaje);
    console.error("Fallo en la subida:", err);
    return error(500, "No se pudo guardar el archivo");
  }
}
