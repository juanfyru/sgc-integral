import { type NextRequest, NextResponse } from "next/server";
import { buscarDocumentos } from "@/db/consultas/busqueda";
import {
  LARGO_MINIMO_CONSULTA,
  normalizarConsulta,
  type ResultadoRapido,
} from "@/lib/busqueda-rapida";
import { crearLimitador } from "@/lib/limite";
import { sesionDePeticion } from "@/lib/sesion-actual";

export const dynamic = "force-dynamic";

// Se consulta mientras se teclea (con espera de 200 ms): 60/min por usuario es holgado para una persona.
const permitirBusqueda = crearLimitador({ limite: 60, ventanaMs: 60_000 });

/** Búsqueda rápida de la paleta Ctrl K: solo documentos con versión vigente que el usuario puede ver. */
export async function GET(peticion: NextRequest) {
  const sesion = await sesionDePeticion(peticion);
  if (!sesion) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!permitirBusqueda(String(sesion.usuarioId))) {
    return NextResponse.json(
      { error: "Demasiadas peticiones, intente de nuevo en un momento" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const q = normalizarConsulta(peticion.nextUrl.searchParams.get("q") ?? "");
  if (q.length < LARGO_MINIMO_CONSULTA) {
    return NextResponse.json({ resultados: [] satisfies ResultadoRapido[] });
  }

  const { resultados } = await buscarDocumentos({ q, limite: 8 }, sesion);
  return NextResponse.json({
    resultados: resultados.map(
      (r): ResultadoRapido => ({
        codigo: r.codigo,
        titulo: r.titulo,
        tituloResaltado: r.tituloResaltado,
        tipo: r.tipo.sigla,
        ruta: `/documentos/${r.codigo.toLowerCase()}`,
      }),
    ),
  });
}
