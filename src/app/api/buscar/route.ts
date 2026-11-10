import { type NextRequest, NextResponse } from "next/server";
import { buscarDocumentos } from "@/db/consultas/busqueda";
import { buscarNormas } from "@/db/consultas/normograma/busqueda";
import {
  LARGO_MINIMO_CONSULTA,
  NORMAS_EN_LA_PALETA,
  normalizarConsulta,
  type ResultadoRapido,
} from "@/lib/busqueda-rapida";
import { crearLimitador } from "@/lib/limite";
import { ETIQUETA_ESTADO_NORMA } from "@/lib/normograma/tipos";
import { sesionDePeticion } from "@/lib/sesion-actual";

export const dynamic = "force-dynamic";

// Se consulta mientras se teclea (con espera de 200 ms): 60/min por usuario es holgado para una persona.
const permitirBusqueda = crearLimitador({ limite: 60, ventanaMs: 60_000 });

/**
 * Búsqueda rápida de la paleta Ctrl K: los documentos con versión vigente que el usuario puede ver y, debajo, hasta
 * cuatro normas no retiradas (el normograma se lee con cualquier sesión).
 */
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

  const [{ resultados }, normas] = await Promise.all([buscarDocumentos({ q, limite: 8 }, sesion), buscarNormas(q, NORMAS_EN_LA_PALETA)]);
  return NextResponse.json({
    resultados: [
      ...resultados.map(
        (r): ResultadoRapido => ({
          grupo: "documento",
          codigo: r.codigo,
          titulo: r.titulo,
          tituloResaltado: r.tituloResaltado,
          tipo: r.tipo.sigla,
          ruta: `/documentos/${r.codigo.toLowerCase()}`,
        }),
      ),
      ...normas.map(
        (n): ResultadoRapido => ({
          grupo: "norma",
          codigo: n.nombre,
          titulo: n.titulo,
          tituloResaltado: null,
          tipo: ETIQUETA_ESTADO_NORMA[n.estado],
          ruta: `/normograma/${n.id}`,
        }),
      ),
    ],
  });
}
