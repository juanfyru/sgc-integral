import Link from "next/link";
import { Boton } from "@/componentes/ui/Boton";
import { claseControl } from "@/componentes/ui/Campo";
import type { ProcesoBreve } from "@/db/consultas/procesos";
import { consultaDeNormas, estadosDelFiltro, hayFiltros, type FiltroNormasLeido } from "@/lib/normograma/filtro-normas";
import { ETIQUETA_ESTADO_NORMA } from "@/lib/normograma/tipos";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";
// A 390 px cada filtro cede al ancho disponible: los nombres de proceso y de emisor son largos.
const CONTROL = `${claseControl} w-full min-w-0 max-w-full`;
const CAMPO = "flex min-w-0 max-w-full flex-col gap-1";

/**
 * Los filtros del normograma (spec 13C §10.6): tipo, año, emisor, estado, proceso y texto; «Incluir retiradas» solo para
 * quien administra. Un formulario GET: la dirección dice el filtro y el Excel lo repite.
 */
export function FiltrosNormas({
  filtro,
  tipos,
  anios,
  emisores,
  procesos,
  administra,
}: {
  filtro: FiltroNormasLeido;
  tipos: { id: number; nombre: string }[];
  anios: number[];
  emisores: string[];
  procesos: ProcesoBreve[];
  administra: boolean;
}) {
  return (
    <form
      method="get"
      action="/normograma"
      aria-label="Filtros del normograma"
      className="grid min-w-0 max-w-full grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      <div className={CAMPO}>
        <label htmlFor="filtro-tipo" className="text-sm font-medium">
          Tipo
        </label>
        <select id="filtro-tipo" name="tipo" defaultValue={filtro.tipoNormaId ?? ""} className={CONTROL}>
          <option value="">Todos</option>
          {tipos.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
        </select>
      </div>
      <div className={CAMPO}>
        <label htmlFor="filtro-anio" className="text-sm font-medium">
          Año
        </label>
        <select id="filtro-anio" name="anio" defaultValue={filtro.anio ?? ""} className={CONTROL}>
          <option value="">Todos</option>
          {anios.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>
      <div className={CAMPO}>
        <label htmlFor="filtro-emisor" className="text-sm font-medium">
          Emisor
        </label>
        <select id="filtro-emisor" name="emisor" defaultValue={filtro.emisor ?? ""} className={CONTROL}>
          <option value="">Todos</option>
          {emisores.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
      </div>
      <div className={CAMPO}>
        <label htmlFor="filtro-estado" className="text-sm font-medium">
          Estado
        </label>
        <select id="filtro-estado" name="estado" defaultValue={filtro.estado === "todas" ? "" : filtro.estado} className={CONTROL}>
          <option value="">Todos</option>
          {estadosDelFiltro(administra).map((e) => (
            <option key={e} value={e}>
              {ETIQUETA_ESTADO_NORMA[e]}
            </option>
          ))}
        </select>
      </div>
      <div className={CAMPO}>
        <label htmlFor="filtro-proceso" className="text-sm font-medium">
          Proceso
        </label>
        <select id="filtro-proceso" name="proceso" defaultValue={filtro.proceso ?? ""} className={CONTROL}>
          <option value="">Todos (institucional)</option>
          {procesos.map((p) => (
            <option key={p.id} value={p.slug}>
              {`${p.sigla} · ${p.nombre}`}
            </option>
          ))}
        </select>
      </div>
      <div className={`${CAMPO} sm:col-span-2 lg:col-span-1`}>
        <label htmlFor="filtro-texto" className="text-sm font-medium">
          Buscar
        </label>
        <input
          id="filtro-texto"
          type="search"
          name="q"
          defaultValue={filtro.q ?? ""}
          maxLength={100}
          placeholder="Número, título, tema o emisor"
          className={CONTROL}
        />
      </div>
      {administra ? (
        <label className="flex min-w-0 items-center gap-2 text-sm">
          <input type="checkbox" name="retiradas" value="1" defaultChecked={filtro.incluirRetiradas} className={`size-4 shrink-0 ${FOCO}`} />
          Incluir retiradas
        </label>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Boton type="submit" variante="secundario">
          Filtrar
        </Boton>
        {hayFiltros(filtro) ? (
          <Link
            href={`/normograma${consultaDeNormas(filtro, {
              tipoNormaId: undefined,
              anio: undefined,
              emisor: undefined,
              estado: "todas",
              q: undefined,
              incluirRetiradas: false,
            })}`}
            className={`rounded text-sm font-medium text-marca underline-offset-2 hover:underline ${FOCO}`}
          >
            Quitar los filtros
          </Link>
        ) : null}
      </div>
    </form>
  );
}
