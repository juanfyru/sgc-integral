import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FileSpreadsheet, Grid3x3 } from "lucide-react";
import { BotonImprimir } from "@/componentes/indicadores/BotonImprimir";
import { LeyendaDeMatriz, MatrizDelAnio } from "@/componentes/indicadores/MatrizDelAnio";
import { apruebaFichas, PestanasIndicadores, pestanasVisibles } from "@/componentes/indicadores/PestanasIndicadores";
import { Selector } from "@/componentes/indicadores/Selector";
import { Boton, claseBoton } from "@/componentes/ui/Boton";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { EstadoVacio } from "@/componentes/ui/EstadoVacio";
import { consultaDeFiltro, filtroDeConsulta, opcionesDeLista } from "@/db/consultas/indicadores/lista";
import { matrizDelAnio } from "@/db/consultas/indicadores/matriz";
import { exigirSesion } from "@/lib/paginas";
import { cuenta } from "@/lib/plural";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Matriz del año" };

type Parametros = Record<string, string | string[] | undefined>;

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/** A 390 px cada selector ocupa todo el ancho; desde `sm`, el suyo. */
const ANCHO = "w-full sm:w-auto sm:max-w-64";

/**
 * La matriz del año (spec §12.7, maqueta 5), para toda persona con sesión: los indicadores que ve y que se miden en el año
 * elegido, agrupados por proceso, con una celda por periodo enlazada a su medición y la columna del acumulado. Filtros en
 * un formulario `GET`: año (`?anio=AAAA`, por omisión el en curso; otro formato o un año que no ha llegado, «no
 * encontrada»), proceso y clasificación (un valor que no se entiende se ignora).
 */
export default async function PaginaMatriz({ searchParams }: { searchParams: Promise<Parametros> }) {
  const sesion = await exigirSesion();
  const sp = await searchParams;
  const anioEnCurso = Number(fechaEnZona(new Date(), zonaHoraria()).slice(0, 4));
  const pedido = sp.anio;
  if (pedido !== undefined && (typeof pedido !== "string" || !/^\d{4}$/.test(pedido))) notFound();
  const anio = pedido === undefined ? anioEnCurso : Number(pedido);
  if (anio < 1900 || anio > anioEnCurso) notFound();
  const { procesoId, clasificacionId } = filtroDeConsulta({ proceso: sp.proceso, clasificacion: sp.clasificacion });
  const [opciones, matriz] = await Promise.all([opcionesDeLista(sesion), matrizDelAnio(sesion, { anio, procesoId, clasificacionId })]);
  const anios = [...new Set([...opciones.anios, anioEnCurso, anio])].sort((a, b) => b - a);
  const filas = matriz.procesos.reduce((n, p) => n + p.filas.length, 0);
  const proceso = procesoId === undefined ? null : (opciones.procesos.find((p) => p.id === procesoId)?.nombre ?? null);
  // «Excel» con el año, el proceso y la clasificación de la matriz (spec §12.7): una descarga auditada, sin precarga.
  const excel = `/indicadores/excel?${[consultaDeFiltro({ procesoId, clasificacionId }), `anio=${anio}`].filter(Boolean).join("&")}`;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <EncabezadoPagina
        titulo={`Matriz del año · ${anio}`}
        descripcion={`${proceso ?? "Todos los procesos"} · ${cuenta(filas, "indicador", "indicadores")}`}
        acciones={
          <>
            <BotonImprimir />
            <a href={excel} className={`${claseBoton("secundario")} print:hidden ${FOCO}`}>
              <FileSpreadsheet aria-hidden="true" className="size-4" />
              Excel
            </a>
          </>
        }
      />
      {/* Al imprimir solo sale la matriz: ni las pestañas ni los filtros (el cascarón ya no se imprime). */}
      <div className="print:hidden">
        <PestanasIndicadores activa="matriz" visibles={pestanasVisibles(sesion, { aprueba: apruebaFichas(sesion) })} />
      </div>
      <form method="get" action="/indicadores/matriz" role="search" aria-label="Filtrar la matriz" className="flex min-w-0 max-w-full flex-wrap items-end gap-2 print:hidden">
        <Selector className={ANCHO} id="matriz-anio" nombre="anio" etiqueta="Año" valor={String(anio)}>
          {anios.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Selector>
        <Selector className={ANCHO} id="matriz-proceso" nombre="proceso" etiqueta="Proceso" valor={procesoId === undefined ? "" : String(procesoId)}>
          <option value="">Todos</option>
          {opciones.procesos.map((p) => (
            <option key={p.id} value={p.id}>
              {`${p.sigla} · ${p.nombre}`}
            </option>
          ))}
        </Selector>
        <Selector className={ANCHO} id="matriz-clasificacion" nombre="clasificacion" etiqueta="Clasificación" valor={clasificacionId === undefined ? "" : String(clasificacionId)}>
          <option value="">Todas</option>
          {opciones.clasificaciones.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </Selector>
        <Boton type="submit" variante="secundario">
          Ver
        </Boton>
      </form>
      {filas === 0 ? (
        <EstadoVacio
          icono={Grid3x3}
          titulo={`Ningún indicador se mide en ${anio}`}
          texto="Aquí aparecen los indicadores que usted ve y que tienen periodos en el año elegido. Cambie el año o los filtros."
        />
      ) : (
        <>
          <LeyendaDeMatriz />
          <MatrizDelAnio anio={anio} procesos={matriz.procesos} />
        </>
      )}
    </div>
  );
}
