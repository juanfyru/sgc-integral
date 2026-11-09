import { type NextRequest, NextResponse } from "next/server";
import { obtenerSql } from "@/db/cliente";
import { obtenerMarca } from "@/db/consultas/entidad";
import { leerFormatoCongelado } from "@/db/consultas/formato-acta";
import { formatoDelInforme } from "@/db/consultas/vigencia/revision-anual";
import { datosDeEjemplo, generarInformeAnual } from "@/lib/informe-anual";
import { crearLimitador } from "@/lib/limite";
import { puede } from "@/lib/permisos";
import { sesionDePeticion } from "@/lib/sesion-actual";
import { zonaHoraria } from "@/lib/zona-horaria";

export const dynamic = "force-dynamic";

// Generar el ejemplo cuesta más que servir un archivo: tope menor que el de la ruta del acta.
const permitirEjemplo = crearLimitador({ limite: 10, ventanaMs: 60_000 });

/**
 * El informe de la revisión anual tal como saldría con el formato y los espacios **guardados** (spec 13C §9.5, como
 * «Ver acta de ejemplo»): el que congelaría el cierre (`formatoDelInforme`: el elegido para el informe o, si no hay uno
 * elegido, el del acta con los suyos). Sin un formato listo, sale con el diseño básico. Solo lee: no se guarda ni se
 * audita.
 */
export async function GET(peticion: NextRequest) {
  const sesion = await sesionDePeticion(peticion);
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!puede(sesion, "tramites.gestionar")) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  if (!permitirEjemplo(String(sesion.usuarioId))) {
    return NextResponse.json(
      { error: "Demasiadas peticiones, intente de nuevo en un momento" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const [formato, marca] = await Promise.all([formatoDelInforme(obtenerSql()), obtenerMarca()]);
  // Un formato cuyo archivo falta o cambió no se dibuja: el ejemplo sale con el diseño básico.
  const membrete = formato ? await leerFormatoCongelado(formato) : null;
  const pdf = await generarInformeAnual(datosDeEjemplo(marca.nombre, zonaHoraria(), membrete ? formato : null), membrete);

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(pdf.byteLength),
      "Content-Disposition": 'inline; filename="Informe de ejemplo.pdf"',
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}
