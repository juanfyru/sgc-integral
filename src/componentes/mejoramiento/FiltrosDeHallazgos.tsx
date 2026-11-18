import Link from "next/link";
import { Boton } from "@/componentes/ui/Boton";
import { claseControl } from "@/componentes/ui/Campo";
import type { FiltroDeLista } from "@/db/consultas/mejoramiento/lectura";
import { etiquetaDeEstado } from "@/lib/mejoramiento/estados";
import { ORIGENES } from "@/lib/mejoramiento/origenes";
import { ETIQUETA_CLASE, ETIQUETA_CRITICIDAD } from "@/lib/mejoramiento/textos";
import { ESTADOS_HALLAZGO } from "@/lib/mejoramiento/tipos";

const ESTADOS_ESPECIALES: Array<[string, string]> = [
  ["abiertos", "Abiertos"],
  ["reabiertos", "Reabiertos"],
  ["sin_accion", "Cerrados sin acción"],
  ["por_evaluar", "Por evaluar la eficacia"],
];

function Selector({
  nombre,
  etiqueta,
  valor,
  opciones,
}: {
  nombre: string;
  etiqueta: string;
  valor: string | number | undefined;
  opciones: ReadonlyArray<readonly [string, string]>;
}) {
  return (
    <div className="flex min-w-36 flex-1 flex-col gap-1">
      <label htmlFor={`filtro-${nombre}`} className="text-sm font-medium">
        {etiqueta}
      </label>
      <select id={`filtro-${nombre}`} name={nombre} defaultValue={valor === undefined ? "" : String(valor)} className={claseControl}>
        <option value="">Todos</option>
        {opciones.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Los filtros de la lista: un formulario `GET`, cuyos nombres son los de `filtroDeConsulta` (`src/lib/mejoramiento/filtro.ts`). */
export function FiltrosDeHallazgos({
  filtro,
  procesos,
}: {
  filtro: FiltroDeLista;
  procesos: ReadonlyArray<{ id: number; nombre: string }>;
}) {
  return (
    <form method="get" action="/mejoramiento" role="search" aria-label="Filtrar hallazgos" className="flex flex-wrap items-end gap-3">
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
      <Selector
        nombre="estado"
        etiqueta="Estado"
        valor={filtro.estado}
        opciones={[
          ...ESTADOS_ESPECIALES,
          ...ESTADOS_HALLAZGO.map((e) => [e, etiquetaDeEstado({ estado: e, resultadoCierre: null, correccionRequerida: null })] as [string, string]),
        ]}
      />
      <label className="flex items-center gap-2 pb-2 text-sm">
        <input type="checkbox" name="vencidos" value="1" defaultChecked={filtro.soloVencidos === true} className="size-4 accent-marca" />
        Solo vencidos
      </label>
      {filtro.esperanSuDecision ? <input type="hidden" name="decision" value="1" /> : null}
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
