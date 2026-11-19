import Link from "next/link";
import { X } from "lucide-react";
import { Boton } from "@/componentes/ui/Boton";
import { claseControl } from "@/componentes/ui/Campo";
import type { FiltroDeLista } from "@/db/consultas/mejoramiento/lectura";
import { etiquetaDeEstado } from "@/lib/mejoramiento/estados";
import {
  consultaDeFiltro,
  ESTADO_POR_OMISION,
  ETIQUETA_ESTADO_ESPECIAL,
  FILTROS_POR_ENLACE,
  filtrosConNombreEnPalabras,
  rutaDeListaFiltrada,
  TODOS_LOS_ESTADOS,
  type NombresDelFiltro,
} from "@/lib/mejoramiento/filtro";
import { ORIGENES } from "@/lib/mejoramiento/origenes";
import { ETIQUETA_CLASE, ETIQUETA_CRITICIDAD } from "@/lib/mejoramiento/textos";
import { ESTADOS_HALLAZGO } from "@/lib/mejoramiento/tipos";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/**
 * Las opciones del selector de estado (Fase 15B, anexo §11.1): la primera, sin valor, es «Abiertos», lo que vale sin `estado` en la
 * dirección; «Todos» trae también los terminados; luego los demás estados especiales y los guardados.
 */
const OPCIONES_DE_ESTADO: ReadonlyArray<readonly [string, string]> = [
  [TODOS_LOS_ESTADOS, "Todos"],
  ...Object.entries(ETIQUETA_ESTADO_ESPECIAL).filter(([e]) => e !== ESTADO_POR_OMISION),
  ...ESTADOS_HALLAZGO.map((e) => [e, etiquetaDeEstado({ estado: e, resultadoCierre: null, correccionRequerida: null })] as const),
];

function Selector({
  nombre,
  etiqueta,
  valor,
  opciones,
  primera = "Todos",
}: {
  nombre: string;
  etiqueta: string;
  valor: string | number | undefined;
  opciones: ReadonlyArray<readonly [string, string]>;
  /** El nombre de la opción sin valor: lo que vale si la dirección no trae este filtro. */
  primera?: string;
}) {
  return (
    <div className="flex min-w-36 flex-1 flex-col gap-1">
      <label htmlFor={`filtro-${nombre}`} className="text-sm font-medium">
        {etiqueta}
      </label>
      <select id={`filtro-${nombre}`} name={nombre} defaultValue={valor === undefined ? "" : String(valor)} className={claseControl}>
        <option value="">{primera}</option>
        {opciones.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Los filtros de la lista: un formulario `GET`, cuyos nombres son los de `filtroDeConsulta` (`src/lib/mejoramiento/filtro.ts`). El plan
 * y el objetivo (Fase 15B, anexo §10.6) van a la vista si hay entre qué elegir; lo que llega por «Ver todos» de otra página (un
 * documento, un indicador, una norma, un subproceso) se dice en una línea, por su nombre ya resuelto con su regla de visibilidad
 * (`nombres`), y viaja oculto para que filtrar de nuevo no lo pierda. «Quitar» lo quita todo. Sin estado, la lista muestra los
 * abiertos (anexo §11.1): lo dice la insignia «Solo abiertos», que con un clic pasa a «Todos». Filtrar vuelve a la primera página.
 */
export function FiltrosDeHallazgos({
  filtro,
  procesos,
  planes = [],
  objetivos = [],
  nombres = {},
}: {
  filtro: FiltroDeLista;
  procesos: ReadonlyArray<{ id: number; nombre: string }>;
  planes?: ReadonlyArray<{ id: number; etiqueta: string }>;
  objetivos?: ReadonlyArray<{ id: number; etiqueta: string }>;
  nombres?: NombresDelFiltro;
}) {
  const porEnlace = filtrosConNombreEnPalabras(filtro, nombres, FILTROS_POR_ENLACE);
  // El plan o el objetivo elegidos están entre las opciones aunque ya no se elijan (un objetivo inactivo, un plan que no se ve).
  const conElegido = (lista: ReadonlyArray<{ id: number; etiqueta: string }>, elegido: number | undefined, nombre: string | undefined) =>
    elegido === undefined || lista.some((x) => x.id === elegido) ? lista : [...lista, { id: elegido, etiqueta: nombre ?? "No disponible" }];
  const opcionesDePlan = conElegido(planes, filtro.plan, nombres.plan);
  const opcionesDeObjetivo = conElegido(objetivos, filtro.objetivo, nombres.objetivo);
  const soloAbiertos = (filtro.estado ?? ESTADO_POR_OMISION) === ESTADO_POR_OMISION;
  // Los campos no son controlados: su valor inicial es el del filtro. La llave cambia con el filtro para que, al llegar a otro por
  // una navegación del cliente (la insignia, las cifras, «Anterior», el botón de volver), React rehaga el formulario con los valores
  // nuevos en vez de conservar los de antes. La página no cuenta: con ella los valores son los mismos.
  return (
    <form
      key={consultaDeFiltro(filtro) || "por-omision"}
      method="get"
      action="/mejoramiento"
      role="search"
      aria-label="Filtrar hallazgos"
      className="flex flex-wrap items-end gap-3"
    >
      {soloAbiertos ? (
        <p className="flex w-full flex-wrap items-center gap-2 text-sm">
          <Link
            href={rutaDeListaFiltrada({ ...filtro, estado: TODOS_LOS_ESTADOS })}
            aria-label="Solo abiertos: quitar este filtro y ver también los terminados"
            className={`inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground hover:bg-card ${FOCO}`}
          >
            Solo abiertos
            <X aria-hidden="true" className="size-3.5" />
          </Link>
          <span className="text-muted-foreground">Los terminados se ven con «Todos» o eligiendo su estado.</span>
        </p>
      ) : null}
      {porEnlace.length > 0 ? (
        <p className="w-full text-sm">
          <span className="font-medium">Desde otra página: </span>
          {porEnlace.join(" · ")}
        </p>
      ) : null}
      <div className="flex min-w-48 flex-[2] flex-col gap-1">
        <label htmlFor="filtro-q" className="text-sm font-medium">
          Buscar
        </label>
        <input id="filtro-q" name="q" type="search" defaultValue={filtro.q ?? ""} placeholder="Código o título" maxLength={100} className={claseControl} />
      </div>
      <Selector nombre="proceso" etiqueta="Proceso" valor={filtro.procesoId} opciones={procesos.map((p) => [String(p.id), p.nombre] as const)} />
      <Selector nombre="origen" etiqueta="Origen" valor={filtro.origen} opciones={ORIGENES.map((o) => [o.clave, o.etiqueta] as const)} />
      <Selector nombre="clase" etiqueta="Clase" valor={filtro.clase} opciones={Object.entries(ETIQUETA_CLASE)} />
      <Selector nombre="criticidad" etiqueta="Criticidad" valor={filtro.criticidad} opciones={Object.entries(ETIQUETA_CRITICIDAD)} />
      {opcionesDePlan.length > 0 ? (
        <Selector nombre="plan" etiqueta="Plan" valor={filtro.plan} opciones={opcionesDePlan.map((p) => [String(p.id), p.etiqueta] as const)} />
      ) : null}
      {opcionesDeObjetivo.length > 0 ? (
        <Selector
          nombre="objetivo"
          etiqueta="Objetivo"
          valor={filtro.objetivo}
          opciones={opcionesDeObjetivo.map((o) => [String(o.id), o.etiqueta] as const)}
        />
      ) : null}
      <Selector
        nombre="estado"
        etiqueta="Estado"
        valor={filtro.estado === ESTADO_POR_OMISION ? undefined : filtro.estado}
        opciones={OPCIONES_DE_ESTADO}
        primera={ETIQUETA_ESTADO_ESPECIAL[ESTADO_POR_OMISION]}
      />
      <label className="flex items-center gap-2 pb-2 text-sm">
        <input type="checkbox" name="vencidos" value="1" defaultChecked={filtro.soloVencidos === true} className="size-4 accent-marca" />
        Solo vencidos
      </label>
      {filtro.esperanSuDecision ? <input type="hidden" name="decision" value="1" /> : null}
      {FILTROS_POR_ENLACE.map((k) => (filtro[k] === undefined ? null : <input key={k} type="hidden" name={k} value={String(filtro[k])} />))}
      <div className="flex gap-2 pb-0.5">
        <Boton type="submit" variante="primario">
          Filtrar
        </Boton>
        <Link
          href="/mejoramiento"
          className="inline-flex items-center rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
        >
          Quitar
        </Link>
      </div>
    </form>
  );
}
