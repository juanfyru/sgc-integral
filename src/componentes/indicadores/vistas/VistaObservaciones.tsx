import { Observaciones, type ObservacionVista } from "@/componentes/indicadores/medicion/Observaciones";
import { claseBoton } from "@/componentes/ui/Boton";
import { claseControl } from "@/componentes/ui/Campo";
import type { ResumenDeObservaciones } from "@/db/consultas/indicadores/observaciones";
import { cuenta } from "@/lib/plural";
import { rutaDeIndicador } from "@/lib/indicadores/rutas";
import { FOCO } from "./comun";

export type DatosDeObservaciones = {
  codigo: string;
  resumen: ResumenDeObservaciones;
  elegida: ResumenDeObservaciones["mediciones"][number] | null;
  observaciones: ObservacionVista[];
  puedeObservar: boolean;
  puedeResponder: boolean;
};

/**
 * «Observaciones» (spec §8.6 y §12.3): el periodo elegido, con su lista y los formularios. El selector es un formulario
 * `GET`: funciona antes de hidratar.
 */
export function VistaObservaciones({ codigo, resumen, elegida, observaciones, puedeObservar, puedeResponder }: DatosDeObservaciones) {
  const opcion = (m: ResumenDeObservaciones["mediciones"][number]) =>
    m.total === 0
      ? m.etiqueta
      : `${m.etiqueta} · ${cuenta(m.total, "observación", "observaciones")}${m.sinRespuesta > 0 ? `, ${m.sinRespuesta} sin respuesta` : ""}`;
  return (
    <section aria-labelledby="indicador-observaciones" className="flex min-w-0 flex-col gap-4">
      <h2 id="indicador-observaciones" className="text-lg font-semibold">
        Observaciones
      </h2>
      <p className="text-sm text-muted-foreground">
        {`${cuenta(resumen.total, "observación", "observaciones")}, ${resumen.sinRespuesta} sin respuesta. Las ven quienes ven los soportes del indicador; no se editan ni se borran.`}
      </p>
      {elegida ? (
        <>
          <form method="get" action={rutaDeIndicador(codigo)} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="vista" value="observaciones" />
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="observaciones-periodo" className="text-sm font-medium">
                Periodo
              </label>
              <select id="observaciones-periodo" name="periodo" defaultValue={elegida.periodo} className={`${claseControl} min-w-0 max-w-full`}>
                {resumen.mediciones.map((m) => (
                  <option key={m.medicionId} value={m.periodo}>
                    {opcion(m)}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className={`${claseBoton("secundario")} ${FOCO}`}>
              Ver
            </button>
          </form>
          <Observaciones
            medicionId={elegida.medicionId}
            etiqueta={elegida.etiqueta}
            observaciones={observaciones}
            puedeObservar={puedeObservar}
            puedeResponder={puedeResponder}
          />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Aún no hay periodos medidos que observar.</p>
      )}
    </section>
  );
}
