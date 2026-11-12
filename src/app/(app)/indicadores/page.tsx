import type { Metadata } from "next";
import Link from "next/link";
import { Gauge, Plus } from "lucide-react";
import { FiltrosIndicadores } from "@/componentes/indicadores/FiltrosIndicadores";
import { BarraDeLista, ListaIndicadores } from "@/componentes/indicadores/ListaIndicadores";
import { apruebaFichas, PestanasIndicadores, pestanasVisibles } from "@/componentes/indicadores/PestanasIndicadores";
import { claseBoton } from "@/componentes/ui/Boton";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { EstadoVacio } from "@/componentes/ui/EstadoVacio";
import { fichasPorAprobar } from "@/db/consultas/indicadores/aprobacion";
import { filtroDeConsulta, listarIndicadores, opcionesDeLista } from "@/db/consultas/indicadores/lista";
import { exigirSesion } from "@/lib/paginas";
import { puede } from "@/lib/permisos";
import { cuenta } from "@/lib/plural";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Indicadores" };

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/**
 * «Indicadores» (spec §12.1 y §12.2, maqueta 4), para toda persona con sesión: la barra de estados, los filtros (un
 * formulario `GET`; los nombres son los de `filtroDeConsulta`, y un valor que no se entiende se ignora) y la lista de lo
 * que la persona ve, con el último periodo terminado de cada indicador. Quien administra ve además los borradores y crea
 * indicadores.
 */
export default async function PaginaIndicadores({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sesion = await exigirSesion();
  const filtro = filtroDeConsulta(await searchParams);
  const administra = puede(sesion, "indicadores.administrar");
  const aprueba = apruebaFichas(sesion);
  const [{ filas, resumen }, opciones, porAprobar] = await Promise.all([
    listarIndicadores(sesion, filtro),
    opcionesDeLista(sesion),
    aprueba ? fichasPorAprobar(sesion) : [],
  ]);
  const filtrada = Object.keys(filtro).length > 0;
  // La barra se cuenta antes del filtro de semáforo: si ese filtro deja cero filas, la barra sigue diciendo lo visible.
  const visibles = resumen.bien + resumen.atencion + resumen.critico + resumen.sinDato;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <EncabezadoPagina
        titulo="Indicadores"
        descripcion={`${cuenta(filas.length, "indicador", "indicadores")} · el último periodo terminado de cada uno.`}
        acciones={
          administra ? (
            <Link href="/indicadores/nuevo" className={`${claseBoton("primario")} ${FOCO}`}>
              <Plus aria-hidden="true" className="size-4" />
              Nuevo indicador
            </Link>
          ) : undefined
        }
      />
      <PestanasIndicadores activa="lista" visibles={pestanasVisibles(sesion, { aprueba })} numeros={{ "por-aprobar": porAprobar.length }} />
      <FiltrosIndicadores filtro={filtro} opciones={opciones} />
      {filas.length === 0 ? (
        filtrada ? (
          <>
            {visibles > 0 ? <BarraDeLista resumen={resumen} /> : null}
            <EstadoVacio
              icono={Gauge}
              titulo="Ningún indicador coincide"
              texto="Cambie o quite los filtros para ver los indicadores que usted puede ver."
              accion={{ href: "/indicadores", etiqueta: "Quitar los filtros" }}
            />
          </>
        ) : (
          <EstadoVacio
            icono={Gauge}
            titulo="Aún no hay indicadores"
            texto={administra ? "Cree el primero con su ficha técnica: se guarda en borrador hasta que se apruebe." : "Cuando se aprueben indicadores que usted pueda ver, aparecerán aquí."}
            accion={administra ? { href: "/indicadores/nuevo", etiqueta: "Nuevo indicador" } : undefined}
          />
        )
      ) : (
        <ListaIndicadores filas={filas} resumen={resumen} />
      )}
    </div>
  );
}
