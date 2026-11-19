import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BotonImprimir } from "@/componentes/indicadores/BotonImprimir";
import { PlanDeMejoramientoImpreso } from "@/componentes/mejoramiento/impresos/PlanDeMejoramientoImpreso";
import { claseBoton } from "@/componentes/ui/Boton";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { obtenerMarcaSegura } from "@/db/consultas/entidad";
import { fo14DePlan } from "@/db/consultas/mejoramiento/fo14";
import { RUTA_PLANES, rutaDePlan } from "@/lib/mejoramiento/rutas";
import { exigirSesion } from "@/lib/paginas";
import { zonaHoraria } from "@/lib/zona-horaria";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "SGC-FO-14 del plan" };

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";
const ID = /^\d{1,15}$/;

/**
 * El SGC-FO-14 de un plan para uno de sus procesos (anexo 15B §5.1, maqueta 4), `?proceso=<id>`, para imprimir en horizontal con la
 * hoja de estilos del navegador. Lo imprime quien ve completos todos los hallazgos de ese proceso en el plan: quien ve todo, o su
 * líder (`fo14DePlan`). A los demás, un plan que no existe, un proceso sin hallazgos que cuenten en el plan y un identificador que no
 * se entiende: «no encontrado». El encabezado de la página y sus botones no salen en el papel. Imprimir no se audita.
 */
export default async function PaginaImprimirPlan({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sesion = await exigirSesion();
  const { id } = await params;
  const { proceso } = await searchParams;
  if (!ID.test(id) || typeof proceso !== "string" || !ID.test(proceso)) notFound();
  // Una sola hora para la hoja: lo que se lee (lo vencido) y el pie «Impreso el …».
  const ahora = new Date();
  const fo14 = await fo14DePlan(sesion, Number(id), Number(proceso), { ahora });
  if (!fo14) notFound();
  const marca = await obtenerMarcaSegura();
  const planId = Number(id);

  return (
    <div className="flex min-w-0 flex-col gap-6 print:block">
      <div className="print:hidden">
        <EncabezadoPagina
          migas={[
            { nombre: "Mejoramiento", href: "/mejoramiento" },
            { nombre: "Planes", href: RUTA_PLANES },
            { nombre: fo14.encabezado.codigoDelPlan, href: rutaDePlan(planId) },
            { nombre: "SGC-FO-14" },
          ]}
          codigo={fo14.encabezado.codigoDelPlan}
          titulo={`Plan de mejoramiento de ${fo14.encabezado.proceso}`}
          descripcion="Los hallazgos de este proceso en el plan, una fila por actividad, listos para imprimir en horizontal o guardar como PDF desde el navegador."
          acciones={
            <>
              <BotonImprimir />
              <Link href={rutaDePlan(planId)} className={`${claseBoton("secundario")} ${FOCO}`}>
                Volver al plan
              </Link>
            </>
          }
        />
      </div>
      <PlanDeMejoramientoImpreso
        fo14={fo14}
        entidad={marca.nombre}
        logo={marca.logo ? `/marca/logo?v=${marca.logo.version}` : null}
        impresoEn={ahora}
        impresoPor={sesion.nombre}
        zona={zonaHoraria()}
      />
    </div>
  );
}
