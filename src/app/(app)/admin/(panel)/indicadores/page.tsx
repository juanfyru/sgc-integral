import type { Metadata } from "next";
import { FormularioParametros } from "@/componentes/indicadores/admin/FormularioParametros";
import { TablaMaestro } from "@/componentes/indicadores/admin/TablaMaestro";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { listarMaestro, obtenerParametros } from "@/db/consultas/indicadores/maestros";
import { exigirPermiso } from "@/lib/paginas";

export const metadata: Metadata = { title: "Configuración de indicadores — Administración SGC" };

export default async function PaginaConfiguracionIndicadores() {
  await exigirPermiso("indicadores.administrar");
  const [tipos, clasificaciones, unidades, objetivos, parametros] = await Promise.all([
    listarMaestro("tipos"),
    listarMaestro("clasificaciones"),
    listarMaestro("unidades"),
    listarMaestro("objetivos"),
    obtenerParametros(),
  ]);
  return (
    <div className="flex flex-col gap-8">
      <EncabezadoPagina titulo="Configuración de indicadores" />
      <TablaMaestro
        maestro="tipos"
        filas={tipos}
        titulo="Tipos"
        descripcion="Eficacia, eficiencia, efectividad… Un tipo inactivo deja de ofrecerse al elaborar una ficha."
      />
      <TablaMaestro
        maestro="clasificaciones"
        filas={clasificaciones}
        titulo="Clasificaciones"
        descripcion="Dicen quién aprueba la ficha y si debe citar una norma."
      />
      <TablaMaestro
        maestro="unidades"
        filas={unidades}
        titulo="Unidades"
        descripcion="La unidad fija el sufijo y los decimales con que se muestra el resultado."
      />
      <TablaMaestro
        maestro="objetivos"
        filas={objetivos}
        titulo="Objetivos"
        descripcion="Los objetivos de calidad e institucionales a los que una ficha puede aportar."
      />
      <FormularioParametros parametros={parametros} />
    </div>
  );
}
