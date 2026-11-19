import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BotonImprimir } from "@/componentes/indicadores/BotonImprimir";
import { PlanDeMejoramientoImpreso } from "@/componentes/mejoramiento/impresos/PlanDeMejoramientoImpreso";
import { Boton, claseBoton } from "@/componentes/ui/Boton";
import { claseControl } from "@/componentes/ui/Campo";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { obtenerMarcaSegura } from "@/db/consultas/entidad";
import { ANIO_MAXIMO, ANIO_MINIMO, fo14Consolidado } from "@/db/consultas/mejoramiento/fo14";
import { exigirSesion } from "@/lib/paginas";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "SGC-FO-14 consolidado" };

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";
const ID = /^\d{1,15}$/;

/**
 * El SGC-FO-14 consolidado de un proceso en un año (anexo 15B §5.1 y §5.2, maqueta 4), `?proceso=<id>&anio=<año>`: todo lo del
 * proceso que estuvo abierto en ese año, con plan o sin él, para imprimir en horizontal. Sin `anio`, el año en curso; el año se
 * cambia con el formulario de arriba, que no sale en el papel. Lo imprime quien ve todo o el líder del proceso
 * (`fo14Consolidado`); a los demás, un proceso que no existe, un año fuera de 2000 a 2100 y un valor que no se entiende: «no
 * encontrado». Imprimir no se audita.
 */
export default async function PaginaConsolidado({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sesion = await exigirSesion();
  const { proceso, anio } = await searchParams;
  if (typeof proceso !== "string" || !ID.test(proceso)) notFound();
  if (anio !== undefined && (typeof anio !== "string" || !/^\d{4}$/.test(anio))) notFound();
  // Una sola hora para la hoja: el año en curso, lo vencido, la fecha de elaboración y el pie «Impreso el …».
  const ahora = new Date();
  const zona = zonaHoraria();
  const elAnio = anio === undefined ? Number(fechaEnZona(ahora, zona).slice(0, 4)) : Number(anio);
  const fo14 = await fo14Consolidado(sesion, Number(proceso), elAnio, { ahora });
  if (!fo14) notFound();
  const marca = await obtenerMarcaSegura();
  const volver = `/mejoramiento?proceso=${proceso}`;

  return (
    <div className="flex min-w-0 flex-col gap-6 print:block">
      <div className="flex min-w-0 flex-col gap-3 print:hidden">
        <EncabezadoPagina
          migas={[{ nombre: "Mejoramiento", href: volver }, { nombre: "SGC-FO-14 consolidado" }]}
          titulo={`Consolidado de ${fo14.encabezado.proceso}, ${fo14.encabezado.vigencia}`}
          descripcion="Lo que el proceso tuvo abierto en algún momento del año, con plan o sin él, una fila por actividad, listo para imprimir en horizontal o guardar como PDF desde el navegador."
          acciones={
            <>
              <BotonImprimir />
              <Link href={volver} className={`${claseBoton("secundario")} ${FOCO}`}>
                Volver a la lista
              </Link>
            </>
          }
        />
        <form method="get" action="/mejoramiento/consolidado" aria-label="Elegir el año del consolidado" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="proceso" value={proceso} />
          <div className="flex flex-col gap-1">
            <label htmlFor="consolidado-anio" className="text-sm font-medium">
              Año
            </label>
            <input
              id="consolidado-anio"
              name="anio"
              type="number"
              inputMode="numeric"
              required
              min={ANIO_MINIMO}
              max={ANIO_MAXIMO}
              defaultValue={elAnio}
              className={`${claseControl} w-28`}
            />
          </div>
          <Boton type="submit" variante="secundario">
            Ver ese año
          </Boton>
        </form>
      </div>
      <PlanDeMejoramientoImpreso
        fo14={fo14}
        entidad={marca.nombre}
        logo={marca.logo ? `/marca/logo?v=${marca.logo.version}` : null}
        impresoEn={ahora}
        impresoPor={sesion.nombre}
        zona={zona}
      />
    </div>
  );
}
