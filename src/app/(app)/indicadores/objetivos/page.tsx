import type { Metadata } from "next";
import { Target } from "lucide-react";
import { Objetivos } from "@/componentes/indicadores/Objetivos";
import { apruebaFichas, PestanasIndicadores, pestanasVisibles } from "@/componentes/indicadores/PestanasIndicadores";
import { Selector } from "@/componentes/indicadores/Selector";
import { Boton } from "@/componentes/ui/Boton";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { EstadoVacio } from "@/componentes/ui/EstadoVacio";
import { pestanaDeDatos } from "@/db/consultas/indicadores/datos";
import { objetivosDelPeriodo, periodosDeObjetivos } from "@/db/consultas/indicadores/objetivos";
import { exigirSesion } from "@/lib/paginas";
import { zonaHoraria } from "@/lib/zona-horaria";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Objetivos" };

type Parametros = Record<string, string | string[] | undefined>;

/**
 * «Objetivos» (anexo 14B, §7), para toda persona con sesión: los objetivos activos, por clase, cada uno con los
 * indicadores que la persona ve, la medición que se tomó de cada uno en el periodo y si el objetivo se cumplió (la regla
 * del cálculo «Objetivos cumplidos», §5.2). El periodo va en un formulario `GET` (`?periodo=`): uno de los que ofrece
 * `periodosDeObjetivos`; cualquier otro valor es el año en curso.
 */
export default async function PaginaObjetivos({ searchParams }: { searchParams: Promise<Parametros> }) {
  const sesion = await exigirSesion();
  const sp = await searchParams;
  const periodos = periodosDeObjetivos(new Date(), zonaHoraria());
  const periodo = periodos.find((p) => p.clave === sp.periodo) ?? periodos[0];
  const [objetivos, datos] = await Promise.all([objetivosDelPeriodo(sesion, periodo.clave), pestanaDeDatos(sesion)]);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <EncabezadoPagina
        titulo={`Objetivos · ${periodo.etiqueta}`}
        descripcion="Un objetivo se cumple si todos sus indicadores medidos en el periodo alcanzan la meta."
      />
      <PestanasIndicadores
        activa="objetivos"
        visibles={pestanasVisibles(sesion, { aprueba: apruebaFichas(sesion), veDatos: datos.visible })}
        numeros={{ datos: datos.porReportar }}
      />
      <form method="get" action="/indicadores/objetivos" aria-label="Elegir el periodo" className="flex min-w-0 max-w-full flex-wrap items-end gap-2">
        <Selector className="w-full sm:w-auto sm:max-w-72" id="objetivos-periodo" nombre="periodo" etiqueta="Periodo" valor={periodo.clave}>
          {periodos.map((p) => (
            <option key={p.clave} value={p.clave}>
              {p.etiqueta}
            </option>
          ))}
        </Selector>
        <Boton type="submit" variante="secundario">
          Ver
        </Boton>
      </form>
      {objetivos.length === 0 ? (
        <EstadoVacio icono={Target} titulo="Aún no hay objetivos" texto="Se crean en Configuración de indicadores." />
      ) : (
        <Objetivos objetivos={objetivos} />
      )}
    </div>
  );
}
