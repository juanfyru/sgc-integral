import Link from "next/link";
import { Boton } from "@/componentes/ui/Boton";
import { claseControl } from "@/componentes/ui/Campo";
import type { FiltroDeLista, OpcionesDeLista } from "@/db/consultas/indicadores/lista";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

const SEMAFOROS = [
  { valor: "bien", etiqueta: "Bien" },
  { valor: "atencion", etiqueta: "Atención" },
  { valor: "critico", etiqueta: "Crítico" },
  { valor: "sin-dato", etiqueta: "Sin dato" },
] as const;

const REPORTES = [
  { valor: "por-reportar", etiqueta: "Por reportar" },
  { valor: "falta-analisis", etiqueta: "Falta el análisis" },
  { valor: "vencida", etiqueta: "Vencido" },
  { valor: "requiere-accion", etiqueta: "Requiere acción de mejora" },
] as const;

/** Un selector con su etiqueta; a 390 px ocupa todo el ancho, desde `sm`, el suyo. */
function Selector({ id, nombre, etiqueta, valor, children }: { id: string; nombre: string; etiqueta: string; valor: string; children: React.ReactNode }) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-1 sm:w-auto sm:max-w-56">
      <label htmlFor={id} className="text-sm font-medium">
        {etiqueta}
      </label>
      <select id={id} name={nombre} defaultValue={valor} className={`${claseControl} w-full max-w-full`}>
        {children}
      </select>
    </div>
  );
}

function Casilla({ id, nombre, etiqueta, marcada }: { id: string; nombre: string; etiqueta: string; marcada: boolean }) {
  return (
    <div className="flex items-center gap-2 py-2">
      <input id={id} type="checkbox" name={nombre} value="1" defaultChecked={marcada} className={`size-4 accent-marca ${FOCO}`} />
      <label htmlFor={id} className="text-sm">
        {etiqueta}
      </label>
    </div>
  );
}

/**
 * Los filtros de la lista (spec §12.2, maqueta 4) en una fila que se envuelve: proceso y subproceso, clasificación, tipo,
 * estado del semáforo, estado del reporte, «Donde participo», texto e «Incluir retirados». Es un formulario `GET` con los
 * nombres que lee `filtroDeConsulta`: funciona antes de hidratar y deja la URL para compartir.
 */
export function FiltrosIndicadores({ filtro, opciones }: { filtro: FiltroDeLista; opciones: OpcionesDeLista }) {
  const id = (n?: number) => (n === undefined ? "" : String(n));
  const conFiltros = Object.keys(filtro).length > 0;
  return (
    <form method="get" action="/indicadores" role="search" aria-label="Filtrar indicadores" className="flex min-w-0 max-w-full flex-wrap items-end gap-2">
      <Selector id="filtro-proceso" nombre="proceso" etiqueta="Proceso" valor={id(filtro.procesoId)}>
        <option value="">Todos</option>
        {opciones.procesos.map((p) => (
          <option key={p.id} value={p.id}>
            {`${p.sigla} · ${p.nombre}`}
          </option>
        ))}
      </Selector>
      <Selector id="filtro-subproceso" nombre="subproceso" etiqueta="Subproceso" valor={id(filtro.subprocesoId)}>
        <option value="">Todos</option>
        {opciones.procesos
          .filter((p) => opciones.subprocesos.some((s) => s.procesoId === p.id))
          .map((p) => (
            <optgroup key={p.id} label={p.nombre}>
              {opciones.subprocesos
                .filter((s) => s.procesoId === p.id)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
            </optgroup>
          ))}
      </Selector>
      <Selector id="filtro-clasificacion" nombre="clasificacion" etiqueta="Clasificación" valor={id(filtro.clasificacionId)}>
        <option value="">Todas</option>
        {opciones.clasificaciones.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </Selector>
      <Selector id="filtro-tipo" nombre="tipo" etiqueta="Tipo" valor={id(filtro.tipoId)}>
        <option value="">Todos</option>
        {opciones.tipos.map((t) => (
          <option key={t.id} value={t.id}>
            {t.nombre}
          </option>
        ))}
      </Selector>
      <Selector id="filtro-semaforo" nombre="semaforo" etiqueta="Estado" valor={filtro.semaforo ?? ""}>
        <option value="">Todos</option>
        {SEMAFOROS.map((s) => (
          <option key={s.valor} value={s.valor}>
            {s.etiqueta}
          </option>
        ))}
      </Selector>
      <Selector id="filtro-reporte" nombre="reporte" etiqueta="Reporte" valor={filtro.reporte ?? ""}>
        <option value="">Todos</option>
        {REPORTES.map((r) => (
          <option key={r.valor} value={r.valor}>
            {r.etiqueta}
          </option>
        ))}
      </Selector>
      <div className="flex w-full min-w-0 flex-col gap-1 sm:w-auto">
        <label htmlFor="filtro-texto" className="text-sm font-medium">
          Buscar
        </label>
        <input
          id="filtro-texto"
          type="search"
          name="texto"
          defaultValue={filtro.texto ?? ""}
          maxLength={100}
          placeholder="Código o nombre"
          className={`${claseControl} w-full sm:w-48`}
        />
      </div>
      <Casilla id="filtro-participo" nombre="participo" etiqueta="Donde participo" marcada={filtro.participo === true} />
      <Casilla id="filtro-retirados" nombre="retirados" etiqueta="Incluir retirados" marcada={filtro.retirados === true} />
      <Boton type="submit" variante="secundario">
        Filtrar
      </Boton>
      {conFiltros ? (
        <Link href="/indicadores" className={`self-center rounded-sm py-2 text-sm text-marca underline-offset-2 hover:underline ${FOCO}`}>
          Quitar los filtros
        </Link>
      ) : null}
    </form>
  );
}
