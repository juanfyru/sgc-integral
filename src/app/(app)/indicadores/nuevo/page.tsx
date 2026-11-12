import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FormularioFicha } from "@/componentes/indicadores/ficha/FormularioFicha";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { opcionesDeFicha } from "@/db/consultas/indicadores/fichas";
import { exigirSesion } from "@/lib/paginas";
import { puede } from "@/lib/permisos";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nuevo indicador" };

/** Crear un indicador (spec §12.4, maqueta 6): solo quien administra; para los demás no existe. */
export default async function PaginaNuevoIndicador() {
  const sesion = await exigirSesion();
  if (!puede(sesion, "indicadores.administrar")) notFound();
  const opciones = await opcionesDeFicha(sesion);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <EncabezadoPagina
        migas={[{ nombre: "Indicadores", href: "/indicadores" }, { nombre: "Nuevo indicador" }]}
        titulo="Nuevo indicador"
        descripcion="Elija cómo se calcula y el sistema arma las variables; el semáforo se escribe solo a partir de la meta. Se guarda en borrador."
      />
      <FormularioFicha opciones={opciones} />
    </div>
  );
}
