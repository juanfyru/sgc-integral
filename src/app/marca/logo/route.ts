import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { obtenerLogoAlmacenado } from "@/db/consultas/entidad";
import { resolverRutaAlmacen } from "@/lib/almacen";
import { LOGO_MIMES } from "@/lib/logo";

export const dynamic = "force-dynamic";

const noEncontrado = () => new NextResponse(null, { status: 404 });

/** Público: el logo aparece en /ingreso, antes de que haya sesión. */
export async function GET() {
  const logo = await obtenerLogoAlmacenado();
  if (!logo) return noEncontrado();

  const absoluta = resolverRutaAlmacen(logo.ruta);
  if (!absoluta) return noEncontrado();
  let contenido: Buffer;
  try {
    contenido = await readFile(absoluta);
  } catch {
    return noEncontrado();
  }
  return new NextResponse(new Uint8Array(contenido), {
    headers: {
      "Content-Type": logo.mime,
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `inline; filename="logo.${LOGO_MIMES[logo.mime]}"`,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
