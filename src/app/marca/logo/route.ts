import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { obtenerSql } from "@/db/cliente";
import { obtenerMarca } from "@/db/consultas/entidad";
import { resolverRutaAlmacen } from "@/lib/almacen";
import { LOGO_MIMES, type MimeLogo } from "@/lib/logo";

export const dynamic = "force-dynamic";

const noEncontrado = () => new NextResponse(null, { status: 404 });

/** Público: el logo aparece en /ingreso, antes de que haya sesión. */
export async function GET() {
  const marca = await obtenerMarca();
  if (!marca.logo) return noEncontrado();

  const sql = obtenerSql();
  const filas = await sql`SELECT clave, valor FROM configuracion WHERE clave IN ('logo_ruta', 'logo_mime')`;
  const c = Object.fromEntries(filas.map((f) => [f.clave as string, f.valor as string]));
  if (!c.logo_ruta || !(c.logo_mime in LOGO_MIMES)) return noEncontrado();

  const absoluta = resolverRutaAlmacen(c.logo_ruta);
  if (!absoluta) return noEncontrado();
  let contenido: Buffer;
  try {
    contenido = await readFile(absoluta);
  } catch {
    return noEncontrado();
  }
  return new NextResponse(new Uint8Array(contenido), {
    headers: {
      "Content-Type": c.logo_mime,
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `inline; filename="logo.${LOGO_MIMES[c.logo_mime as MimeLogo]}"`,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
