import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BotonImprimir } from "@/componentes/indicadores/BotonImprimir";
import { FichaImpresa } from "@/componentes/indicadores/ficha/FichaImpresa";
import { claseBoton } from "@/componentes/ui/Boton";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { obtenerMarcaSegura } from "@/db/consultas/entidad";
import { impresionDelAnio } from "@/db/consultas/indicadores/impresion";
import { anioDeConsulta } from "@/lib/indicadores/rutas";
import { exigirSesion } from "@/lib/paginas";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { exigirIndicador, rutaDeIndicador } from "../../_comun";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ficha impresa" };

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/**
 * La ficha impresa de un indicador (spec §7.8, maqueta 7): la ficha de la versión que regía el año de `?anio=AAAA` (por
 * omisión, el en curso; otro formato, o un año fuera de los que se miden, «no encontrada»), con sus firmas, sus datos de
 * operación y el seguimiento del año, para imprimir con la hoja de estilos del navegador. La imprime quien ve el indicador
 * («imprimir» no se separa de «consultar»); para los demás, no existe. El encabezado de la página y sus botones no salen
 * en el papel.
 */
export default async function PaginaImprimir({
  params,
  searchParams,
}: {
  params: Promise<{ codigo: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sesion = await exigirSesion();
  const { codigo: segmento } = await params;
  const sp = await searchParams;
  const indicador = await exigirIndicador(sesion, segmento);
  const ahora = new Date();
  const anio = anioDeConsulta(sp.anio, Number(fechaEnZona(ahora, zonaHoraria()).slice(0, 4)));
  if (anio === null) notFound();
  const [datos, marca] = await Promise.all([impresionDelAnio(sesion, indicador.codigo, anio, { ahora }), obtenerMarcaSegura()]);
  if (!datos) notFound();
  const codigo = datos.codigo;
  const volver = `${rutaDeIndicador(codigo)}?vista=resultados&anio=${anio}`;

  return (
    <div className="flex min-w-0 flex-col gap-6 print:block">
      <div className="print:hidden">
        <EncabezadoPagina
          migas={[{ nombre: "Indicadores", href: "/indicadores" }, { nombre: codigo, href: volver }, { nombre: "Ficha impresa" }]}
          codigo={codigo}
          titulo={datos.ficha.contenido.nombre ?? codigo}
          descripcion={`La ficha técnica con los resultados de ${anio}, lista para imprimir o guardar como PDF desde el navegador.`}
          acciones={
            <>
              <BotonImprimir />
              <Link href={volver} className={`${claseBoton("secundario")} ${FOCO}`}>
                Volver al indicador
              </Link>
            </>
          }
        />
      </div>
      <FichaImpresa {...datos} entidad={marca.nombre} logo={marca.logo ? `/marca/logo?v=${marca.logo.version}` : null} />
    </div>
  );
}
