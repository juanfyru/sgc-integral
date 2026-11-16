import { BarrasAcostadas } from "@/componentes/ui/BarrasAcostadas";
import { Boton } from "@/componentes/ui/Boton";
import { claseControl } from "@/componentes/ui/Campo";
import type { Desglose } from "@/db/consultas/indicadores/categorias";
import { estadoDeCategoria, estadoDelTotal } from "@/lib/indicadores/categorias";
import { periodoEnPalabras } from "@/lib/indicadores/ficha-en-texto";
import { barrasAcostadas } from "@/lib/indicadores/geometria-barras";
import { rutaDeIndicador } from "@/lib/indicadores/rutas";
import type { RangoDeGrafica } from "./VistaResultados";

/** Lo que la sección «Por {dimensión}» muestra: los periodos medidos del año (en orden) y el desglose del elegido. */
export type DatosDeDesglose = {
  /**
   * El nombre con que se firmó la dimensión del periodo elegido (o, sin periodos medidos, el de la última versión desagregada
   * que rige el año: `desagregacionDelAnio`).
   */
  dimension: string;
  periodos: { periodo: string; etiqueta: string }[];
  elegido: Desglose | null;
};

const CAJA = "flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card px-4 py-3";

/** Las filas de las barras de un desglose: una por categoría, en el orden de su lista, y la del total, destacada. */
function barrasDe(d: Desglose) {
  const filas = [
    ...d.filas.map((f) => ({
      etiqueta: f.categoria.nombre,
      numero: f.numero,
      valor: f.resultado ?? "—",
      ...estadoDeCategoria({ estado: f.estado, semaforo: f.semaforo, cumple: f.cumple, conResultado: f.resultado !== null }),
      destacada: false,
    })),
    {
      etiqueta: "Total",
      numero: d.total?.numero ?? null,
      valor: d.total?.resultado ?? "—",
      // La medición entera «No aplica» (ninguna categoría aplicó, o no hubo nada que medir) lo dice en el total.
      ...estadoDelTotal(d),
      destacada: true,
    },
  ];
  const g = barrasAcostadas(
    filas.map((f) => ({ etiqueta: f.etiqueta, valor: f.numero })),
    d.metaNumero,
  );
  return {
    filas: filas.map((f, i) => ({ etiqueta: f.etiqueta, valor: f.valor, ancho: g.filas[i].ancho, estado: f.punto, textoEstado: f.texto, destacada: f.destacada })),
    meta: d.meta !== null && g.meta !== null ? { posicion: g.meta, texto: `Meta ${d.meta}` } : null,
  };
}

/**
 * «Por {dimensión}» en la página del indicador (anexo 14C, §5.6; maqueta 8): las barras acostadas del periodo elegido, una por
 * categoría con su color y el total destacado, la meta como línea y su tabla equivalente, y el selector de los periodos
 * medidos del año (un formulario `GET` con `?desglose=<periodo>`; la página valida el periodo y, si no es uno medido, muestra
 * el último). Lo ve quien ve el indicador.
 */
export function DesglosePorCategoria({ codigo, anio, rango, desglose: d }: { codigo: string; anio: number; rango: RangoDeGrafica; desglose: DatosDeDesglose }) {
  const elegido = d.elegido;
  const barras = elegido ? barrasDe(elegido) : null;
  return (
    <section aria-labelledby="indicador-desglose" className={CAJA}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id="indicador-desglose" className="text-base font-semibold">
          {`Por ${d.dimension}`}
        </h2>
        {elegido && d.periodos.length > 0 ? (
          <form method="get" action={rutaDeIndicador(codigo)} className="flex items-end gap-2 text-sm">
            <input type="hidden" name="vista" value="resultados" />
            <input type="hidden" name="anio" value={anio} />
            {rango === "anio" ? null : <input type="hidden" name="rango" value={rango} />}
            <div className="flex flex-col gap-1">
              <label htmlFor="desglose-periodo" className="font-medium">
                Periodo
              </label>
              <select id="desglose-periodo" name="desglose" defaultValue={elegido.periodo} className={claseControl}>
                {d.periodos.map((p) => (
                  <option key={p.periodo} value={p.periodo}>
                    {p.etiqueta}
                  </option>
                ))}
              </select>
            </div>
            <Boton type="submit" variante="secundario">
              Ver
            </Boton>
          </form>
        ) : null}
      </div>
      {elegido && barras ? (
        <BarrasAcostadas titulo={`Por ${d.dimension}, ${periodoEnPalabras(elegido.periodo).toLowerCase()}`} filas={barras.filas} meta={barras.meta} />
      ) : (
        <p className="text-sm text-muted-foreground">{`Aún no hay periodos medidos en ${anio}.`}</p>
      )}
    </section>
  );
}
