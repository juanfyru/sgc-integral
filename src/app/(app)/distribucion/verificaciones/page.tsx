import type { Metadata } from "next";
import { PestanasDistribucion } from "@/componentes/distribucion/PestanasDistribucion";
import { EstadoPuntos } from "@/componentes/distribucion/verificaciones/EstadoPuntos";
import { HistorialVerificaciones } from "@/componentes/distribucion/verificaciones/HistorialVerificaciones";
import { TablaHallazgos } from "@/componentes/distribucion/verificaciones/TablaHallazgos";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { hallazgosDe } from "@/db/consultas/distribucion/hallazgos";
import { estadoDePuntos, fallosPorItem, historialVerificaciones } from "@/db/consultas/distribucion/verificaciones-resumen";
import { filtroDeVerificaciones } from "@/lib/distribucion/filtro-verificaciones";
import { exigirSesion } from "@/lib/paginas";
import { puede } from "@/lib/permisos";
import { exigirDistribucion } from "../_comun";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Verificaciones" };

const texto = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export default async function PaginaVerificaciones({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sesion = await exigirSesion();
  await exigirDistribucion(sesion);
  const q = await searchParams;
  const ahora = new Date();
  const { filtro, desdeTexto, hastaTexto } = filtroDeVerificaciones(
    { punto: texto(q.punto), desde: texto(q.desde), hasta: texto(q.hasta), resultado: texto(q.resultado) },
    ahora,
  );
  const [estado, historial, fallos, hallazgos] = await Promise.all([
    estadoDePuntos(sesion, { ahora }),
    historialVerificaciones(sesion, filtro),
    fallosPorItem(sesion, filtro),
    hallazgosDe({ puntoId: filtro.puntoId }, sesion),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <EncabezadoPagina titulo="Distribución" descripcion="Copias controladas, acuses de lectura, socializaciones y verificaciones" />
      <PestanasDistribucion activa="verificaciones" />
      <EstadoPuntos puntos={estado.puntos} conformidad={estado.conformidad} puedeVerificar={puede(sesion, "verificaciones.realizar")} />
      <HistorialVerificaciones
        filas={historial.filas}
        conformidad={historial.conformidad}
        fallos={fallos}
        puntos={estado.puntos.map((p) => ({ id: p.puntoId, nombre: p.nombre }))}
        filtro={{ punto: filtro.puntoId, desde: desdeTexto, hasta: hastaTexto, resultado: filtro.resultado }}
      />
      <TablaHallazgos hallazgos={hallazgos} ahora={ahora} />
    </div>
  );
}
