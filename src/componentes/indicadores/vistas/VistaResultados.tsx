import Link from "next/link";
import { EdicionDeHistoricos, type FilaHistoricaVista } from "@/componentes/indicadores/medicion/EdicionDeHistoricos";
import { FormularioAnalisis } from "@/componentes/indicadores/medicion/FormularioAnalisis";
import { columnasDeVariables, TablaDelAnio } from "@/componentes/indicadores/medicion/TablaDelAnio";
import { LeyendaDeGrafica, metaDeGrafica } from "@/componentes/indicadores/LeyendaDeGrafica";
import { ResultadoPrincipal } from "@/componentes/indicadores/ResultadoPrincipal";
import { Boton } from "@/componentes/ui/Boton";
import { claseControl } from "@/componentes/ui/Campo";
import { GraficoTubos } from "@/componentes/ui/GraficoTubos";
import { MiniTubos } from "@/componentes/ui/MiniTubos";
import { TuboAcumulado } from "@/componentes/ui/TuboAcumulado";
import type { DatosDeAnalisis } from "@/db/consultas/indicadores/analisis";
import type { ResultadosDelAnio, UltimoResultado } from "@/db/consultas/indicadores/lectura";
import type { Soporte } from "@/db/consultas/indicadores/soportes";
import type { EntradaDeHistorial } from "@/lib/indicadores/historial";
import type { Periodicidad } from "@/lib/indicadores/tipos";
import { rutaDeIndicador } from "@/lib/indicadores/rutas";
import { ENLACE, FOCO } from "./comun";

/** El rango de la gráfica principal (spec §11): el año de la tabla, ese y el anterior, o todo desde el inicio de medición. */
export type RangoDeGrafica = "anio" | "dos" | "todo";

export type DatosDeResultados = {
  codigo: string;
  indicadorId: number;
  anio: number;
  /** Los años que se pueden elegir para la tabla, del más reciente al más antiguo. */
  anios: number[];
  rango: RangoDeGrafica;
  periodicidad: Periodicidad | null;
  resultados: ResultadosDelAnio;
  ultimo: UltimoResultado | null;
  periodosSinCumplir: number;
  mide: boolean;
  analiza: boolean;
  /** El formulario del análisis que se muestra arriba de la tabla. */
  analisis: DatosDeAnalisis | null;
  /** Quien registra históricos: si el año los tiene abiertos, si está en el modo edición y las columnas que pide. */
  historicos: { editables: FilaHistoricaVista[]; editando: boolean; variables: { letra: string; nombre: string }[] } | null;
  aviso: { texto: string; exito: boolean } | null;
  /** Los soportes de cada medición del año, solo a quien ve los soportes del indicador (`null` para los demás). */
  soportes: Map<number, Soporte[]> | null;
  /** Reabrir y cerrar de nuevo (quien administra) y el historial de cada medición corregida (spec §8.7). */
  cierre: { reabre: boolean; cierraDeNuevo: boolean; historial: Map<number, EntradaDeHistorial[]> };
};

const CAJA = "flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card px-4 py-3";
const POR: Record<Periodicidad, string> = { mensual: "mes", bimestral: "bimestre", trimestral: "trimestre", semestral: "semestre", anual: "año" };

const rutaDeResultados = (codigo: string, anio: number, rango: RangoDeGrafica = "anio") =>
  `${rutaDeIndicador(codigo)}?vista=resultados&anio=${anio}${rango === "anio" ? "" : `&rango=${rango}`}`;

/**
 * «Resultados» (spec §12.3, maqueta 2): el último resultado en grande con su estado, su frase y su comparación; la gráfica
 * principal con su rango (el año, dos años o todo); el acumulado del año con su rótulo; una gráfica pequeña por variable;
 * el análisis que falta (o el pedido con `?analizar=`) y la tabla del año con su selector de año y, para quien registra
 * históricos, el modo edición (`?historicos=editar`, spec §8.8). En el modo edición solo va la tabla.
 */
export function VistaResultados(d: DatosDeResultados) {
  const { resultados: r, codigo, anio } = d;
  const editando = d.historicos?.editando === true;
  const conEdicion = d.historicos !== null && d.historicos.editables.some((f) => !f.cerrada);
  const meta = metaDeGrafica(r.grafica);
  const por = d.periodicidad ? POR[d.periodicidad] : "periodo";
  // Los años que la serie de verdad abarca: antes del inicio de medición no hay periodos.
  const desde = Math.min(anio, Number(r.serie[0]?.clave.slice(0, 4) ?? anio));
  const cuando = desde === anio ? String(anio) : desde === anio - 1 ? `${desde} y ${anio}` : `${desde} a ${anio}`;
  const titulo = `Resultado por ${por}, ${cuando}`;
  const rangos: { clave: RangoDeGrafica; etiqueta: string }[] = [
    { clave: "anio", etiqueta: String(anio) },
    { clave: "dos", etiqueta: "2 años" },
    { clave: "todo", etiqueta: "Todo" },
  ];
  const valores = Object.entries(r.acumulado.valores);
  const nombreDe = (letra: string) => r.variables.find((v) => v.letra === letra)?.nombre ?? letra;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {editando ? null : (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[3fr_2fr]">
          <div className="flex min-w-0 flex-col gap-4">
            <section aria-labelledby="indicador-ultimo" className={CAJA}>
              <h2 id="indicador-ultimo" className="sr-only">
                Último resultado
              </h2>
              <ResultadoPrincipal ultimo={d.ultimo} periodosSinCumplir={d.periodosSinCumplir} />
            </section>
            <section aria-labelledby="indicador-grafica" className={CAJA}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="indicador-grafica" className="text-base font-semibold">
                  {titulo}
                </h2>
                <nav aria-label="Rango de la gráfica" className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Ver:</span>
                  {rangos.map((x) => (
                    <Link
                      key={x.clave}
                      href={rutaDeResultados(codigo, anio, x.clave)}
                      aria-current={x.clave === d.rango ? "page" : undefined}
                      className={x.clave === d.rango ? `rounded-sm font-semibold text-foreground ${FOCO}` : ENLACE}
                    >
                      {x.etiqueta}
                    </Link>
                  ))}
                </nav>
              </div>
              <LeyendaDeGrafica conMeta={meta !== undefined} conLimite={r.grafica.limite !== null} />
              <GraficoTubos
                serie={r.serie}
                titulo={titulo}
                meta={meta}
                limite={r.grafica.limite ?? undefined}
                rango={r.grafica.rango ?? undefined}
                unidad={r.grafica.unidad}
                columnas={["Periodo", "Resultado", "Estado"]}
              />
            </section>
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <section aria-labelledby="indicador-acumulado" className={CAJA}>
              <h2 id="indicador-acumulado" className="text-base font-semibold">
                Acumulado del año
              </h2>
              {r.acumulado.texto ? (
                <TuboAcumulado
                  valor={r.acumulado.valor}
                  texto={r.acumulado.texto}
                  estado={r.acumulado.semaforo ?? "sin-meta"}
                  meta={r.acumulado.meta ?? undefined}
                  unidad={r.grafica.unidad}
                />
              ) : (
                <p className="text-sm text-muted-foreground">{`Aún no hay periodos medidos en ${anio}.`}</p>
              )}
              {r.acumulado.rotulo ? <p className="text-sm">{r.acumulado.rotulo}</p> : null}
              {valores.length > 0 ? (
                <p className="text-sm text-muted-foreground">{valores.map(([letra, valor]) => `${nombreDe(letra)}: ${valor}`).join(" · ")}</p>
              ) : null}
              <p className="text-xs text-muted-foreground">Se calcula juntando las variables de los periodos del año, nunca promediando los resultados.</p>
            </section>
            {r.variables.length > 0 ? (
              <section aria-labelledby="indicador-variables" className={CAJA}>
                <h2 id="indicador-variables" className="text-base font-semibold">
                  Sus variables
                </h2>
                <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  {r.variables.map((v) => (
                    <div key={v.letra} className="flex min-w-0 flex-col gap-1">
                      <p className="text-xs text-muted-foreground">{v.nombre}</p>
                      <MiniTubos titulo={v.nombre} serie={v.serie} />
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Cada variable en su propia gráfica: nunca dos escalas en una misma.</p>
              </section>
            ) : null}
          </div>
        </div>
      )}
      {d.analisis && !editando ? (
        <section id="analisis" aria-labelledby="indicador-analisis" className="flex min-w-0 scroll-mt-4 flex-col gap-3">
          <h2 id="indicador-analisis" className="text-lg font-semibold">
            {`Análisis: ${d.analisis.etiqueta.toLowerCase()}`}
          </h2>
          <FormularioAnalisis datos={d.analisis} volver={rutaDeResultados(codigo, anio, d.rango)} />
        </section>
      ) : null}
      <section aria-labelledby="indicador-anio" className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="indicador-anio" className="text-lg font-semibold">
            {editando ? `Registrar históricos de ${anio}` : `Resultados de ${anio}`}
          </h2>
          <div className="flex flex-wrap items-end gap-3 text-sm">
            {conEdicion && !editando ? (
              <Link href={`${rutaDeResultados(codigo, anio)}&historicos=editar`} className={`self-center ${ENLACE}`}>
                {`Registrar históricos de ${anio}`}
              </Link>
            ) : null}
            {editando ? null : (
              <form method="get" action={rutaDeIndicador(codigo)} className="flex items-end gap-2">
                <input type="hidden" name="vista" value="resultados" />
                {d.rango === "anio" ? null : <input type="hidden" name="rango" value={d.rango} />}
                <div className="flex flex-col gap-1">
                  <label htmlFor="resultados-anio" className="font-medium">
                    Año
                  </label>
                  <select id="resultados-anio" name="anio" defaultValue={anio} className={claseControl}>
                    {d.anios.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
                <Boton type="submit" variante="secundario">
                  Ver
                </Boton>
              </form>
            )}
          </div>
        </div>
        {d.aviso ? (
          <p role="status" className={`text-sm ${d.aviso.exito ? "text-estado-bien-texto" : "text-muted-foreground"}`}>
            {d.aviso.texto}
          </p>
        ) : null}
        {editando && d.historicos ? (
          <EdicionDeHistoricos
            indicadorId={d.indicadorId}
            anio={anio}
            variables={d.historicos.variables}
            filas={d.historicos.editables}
            volver={rutaDeResultados(codigo, anio)}
          />
        ) : (
          <TablaDelAnio
            filas={r.filas}
            variables={columnasDeVariables(r.filas)}
            anio={anio}
            codigo={codigo}
            puedeMedir={d.mide}
            puedeAnalizar={d.analiza}
            soportes={d.soportes}
            puedeReabrir={d.cierre.reabre}
            puedeCerrarDeNuevo={d.cierre.cierraDeNuevo}
            historial={d.cierre.historial}
            periodosSinCumplir={d.periodosSinCumplir}
          />
        )}
      </section>
    </div>
  );
}
