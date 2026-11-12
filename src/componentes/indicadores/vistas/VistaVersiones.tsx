import { ControlDeCambios } from "@/componentes/indicadores/ficha/ControlDeCambios";
import { FichaTecnica } from "@/componentes/indicadores/ficha/FichaTecnica";
import { desdePeriodo, type FichaLeida, type VersionResumen } from "@/db/consultas/indicadores/aprobacion";
import { FOCO } from "./comun";

export type DatosDeVersiones = { resumen: VersionResumen[]; anteriores: FichaLeida[]; vigente: number | null };

/** «Versiones»: el control de cambios y cada versión anterior completa (spec §7.6.6 y §12.3). */
export function VistaVersiones({ resumen, anteriores, vigente }: DatosDeVersiones) {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <section aria-labelledby="indicador-control" className="flex min-w-0 flex-col gap-3">
        <h2 id="indicador-control" className="text-lg font-semibold">
          Control de cambios
        </h2>
        <ControlDeCambios versiones={resumen} vigente={vigente} />
      </section>
      {anteriores.length > 0 ? (
        <section aria-labelledby="indicador-anteriores" className="flex min-w-0 flex-col gap-3">
          <h2 id="indicador-anteriores" className="text-lg font-semibold">
            Versiones anteriores
          </h2>
          {anteriores.map((f) => (
            <details key={f.versionId} className="rounded-lg border border-border px-4 py-3">
              <summary className={`cursor-pointer rounded-md text-sm font-medium ${FOCO}`}>
                {`Versión ${f.numero}${f.rigeDesde ? `, rigió ${desdePeriodo(f.rigeDesde)}` : ""}`}
              </summary>
              <div className="mt-3">
                <FichaTecnica ficha={f} operacion={null} nivel={3} />
              </div>
            </details>
          ))}
        </section>
      ) : null}
    </div>
  );
}
