import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { type NextRequest, NextResponse } from "next/server";
import { guardarLogo, quitarLogo } from "@/db/consultas/entidad";
import { resolverRutaAlmacen } from "@/lib/almacen";
import { LOGO_MAX_BYTES, validarLogo } from "@/lib/logo";
import { origenValido } from "@/lib/origen";
import { puede } from "@/lib/permisos";
import { sesionDePeticion } from "@/lib/sesion-actual";

export const dynamic = "force-dynamic";

const error = (estado: number, mensaje: string) => NextResponse.json({ error: mensaje }, { status: estado });

async function borrarArchivo(rutaRelativa: string | null) {
  if (!rutaRelativa) return;
  const absoluta = resolverRutaAlmacen(rutaRelativa);
  if (!absoluta) return;
  await unlink(absoluta).catch((e: NodeJS.ErrnoException) => {
    if (e.code !== "ENOENT") throw e;
  });
}

export async function POST(peticion: NextRequest) {
  const sesion = await sesionDePeticion(peticion);
  if (!sesion) return error(401, "No autorizado");
  if (!puede(sesion, "entidad.administrar")) return error(403, "Sin permiso");
  if (!origenValido(peticion.headers)) return error(403, "Origen no permitido");

  const declarado = Number(peticion.headers.get("content-length"));
  if (declarado > LOGO_MAX_BYTES + 65_536) return error(413, "El logo supera 1 MB");

  let archivo: FormDataEntryValue | null;
  try {
    archivo = (await peticion.formData()).get("archivo");
  } catch {
    return error(400, "Falta el archivo");
  }
  if (!(archivo instanceof File)) return error(400, "Falta el archivo");

  const bytes = new Uint8Array(await archivo.arrayBuffer());
  const logo = await validarLogo(bytes);
  if (!logo.ok) return error(400, logo.error);

  const relativa = `marca/logo-${logo.version}.${logo.extension}`;
  const absoluta = resolverRutaAlmacen(relativa);
  if (!absoluta) return error(500, "No se pudo guardar el logo");
  await mkdir(path.dirname(absoluta), { recursive: true });
  await writeFile(absoluta, bytes);

  const { rutaAnterior } = await guardarLogo(
    {
      ruta: relativa,
      mime: logo.mime,
      version: logo.version,
      nombre: archivo.name,
      bytes: bytes.byteLength,
      ancho: logo.ancho,
      alto: logo.alto,
    },
    sesion.usuarioId,
  );
  await borrarArchivo(rutaAnterior);
  return NextResponse.json({ ok: true, version: logo.version });
}

export async function DELETE(peticion: NextRequest) {
  const sesion = await sesionDePeticion(peticion);
  if (!sesion) return error(401, "No autorizado");
  if (!puede(sesion, "entidad.administrar")) return error(403, "Sin permiso");
  if (!origenValido(peticion.headers)) return error(403, "Origen no permitido");

  const { rutaAnterior } = await quitarLogo(sesion.usuarioId);
  await borrarArchivo(rutaAnterior);
  return NextResponse.json({ ok: true });
}
