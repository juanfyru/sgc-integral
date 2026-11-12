import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Grid3x3 } from "lucide-react";
import { LeyendaDeMatriz, MatrizDelAnio } from "@/componentes/indicadores/MatrizDelAnio";
import { apruebaFichas, PestanasIndicadores, pestanasVisibles } from "@/componentes/indicadores/PestanasIndicadores";
import { Boton } from "@/componentes/ui/Boton";
import { claseControl } from "@/componentes/ui/Campo";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { EstadoVacio } from "@/componentes/ui/EstadoVacio";
import { filtroDeConsulta, matrizDelAnio, opcionesDeLista } from "@/db/consultas/indicadores/lectura";
import { exigirSesion } from "@/lib/paginas";
import { cuenta } from "@/lib/plural";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Matriz del año" };

type Parametros = Record<string, string | string[] | undefined>;

/** Un selector con su etiqueta; a 390 px ocupa todo el ancho, desde `sm`, el suyo. */
function Selector({ id, nombre, etiqueta, valor, children }: { id: string; nombre: string; etiqueta: string; valor: string; children: React.ReactNode }) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-1 sm:w-auto sm:max-w-64">
      <label htmlFor={id} className="text-sm font-medium">
        {etiqueta}
      </label>
      <select id={id} name={nombre} defaultValue={valor} className={`${claseControl} w-full max-w-full`}>
        {children}
      </select>
    </div>
  );
}

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

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <EncabezadoPagina
        titulo={`Matriz del año · ${anio}`}
        descripcion={`${proceso ?? "Todos los procesos"} · ${cuenta(filas, "indicador", "indicadores")}`}
      />
      <PestanasIndicadores activa="matriz" visibles={pestanasVisibles(sesion, { aprueba: apruebaFichas(sesion) })} />
      <form method="get" action="/indicadores/matriz" role="search" aria-label="Filtrar la matriz" className="flex min-w-0 max-w-full flex-wrap items-end gap-2">
        <Selector id="matriz-anio" nombre="anio" etiqueta="Año" valor={String(anio)}>
          {anios.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Selector>
        <Selector id="matriz-proceso" nombre="proceso" etiqueta="Proceso" valor={procesoId === undefined ? "" : String(procesoId)}>
          <option value="">Todos</option>
          {opciones.procesos.map((p) => (
            <option key={p.id} value={p.id}>
              {`${p.sigla} · ${p.nombre}`}
            </option>
          ))}
        </Selector>
        <Selector id="matriz-clasificacion" nombre="clasificacion" etiqueta="Clasificación" valor={clasificacionId === undefined ? "" : String(clasificacionId)}>
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
