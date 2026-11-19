import Link from "next/link";
import { InsigniaSemaforo } from "@/componentes/indicadores/InsigniaSemaforo";
import { claseBoton } from "@/componentes/ui/Boton";
import { Insignia } from "@/componentes/ui/Insignia";
import type { CandidatoDeMarca, MarcaDeMedicion } from "@/db/consultas/mejoramiento/marcas";
import { ANCLA_DE_MARCAS, rutaDeRegistro } from "@/lib/mejoramiento/rutas";
import { fechaLargaDeDia } from "@/lib/mejoramiento/formato";
import { textoFecha } from "@/lib/vigencia/plazo";
import { FormularioDeDecision } from "./FormularioDeDecision";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/**
 * «Requiere acción de mejora» (anexo 15B §6.5, maqueta 5): lo que hay que decidir sobre las mediciones marcadas del indicador, en
 * todas las vistas de su página y con el ancla que enlaza la tarea de «Mis tareas». Un bloque por pendiente, con su resultado, la
 * causa y la acción propuesta del análisis y las salidas que la persona puede dar: añadir la medición como ocurrencia de un
 * hallazgo abierto que cita el indicador (el más reciente primero, con «Sugerido»), abrir un hallazgo nuevo y, solo para el Admin
 * SGC, «No requiere acción de mejora». Una medición que todavía espera su análisis lo dice y no ofrece nada. Sin marcas, no hay panel.
 * Quien llama solo lo pinta a quien puede dar alguna salida (`marcasDelIndicador` es nulo para los demás).
 */
export function PanelDeMarcas({
  marcas,
  candidatos,
  puede,
}: {
  marcas: readonly MarcaDeMedicion[];
  candidatos: readonly CandidatoDeMarca[];
  puede: { hallazgo: boolean; noRequiere: boolean };
}) {
  if (marcas.length === 0) return null;
  return (
    <section
      id={ANCLA_DE_MARCAS}
      aria-labelledby="panel-de-marcas"
      className="flex min-w-0 scroll-mt-24 flex-col gap-3 rounded-lg border border-l-4 border-border border-l-mod-planes bg-card px-4 py-3 text-sm"
    >
      <h2 id="panel-de-marcas" className="font-semibold">
        Requiere acción de mejora
      </h2>
      <ul className="flex min-w-0 list-none flex-col gap-4">
        {marcas.map((m) => {
          const conAnalisis = m.causa !== null || m.accionPropuesta !== null;
          return (
            <li key={m.medicionId} className="flex min-w-0 flex-col gap-2 border-t border-border pt-3 first:border-t-0 first:pt-0">
              <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 break-words">
                <b>{m.periodo}</b>
                {m.semaforo ? <InsigniaSemaforo semaforo={m.semaforo} /> : null}
                <span>{m.resultado}</span>
                <Insignia variante="neutra">Requiere acción de mejora</Insignia>
              </p>
              {m.estado === "espera_analisis" ? (
                <div className="flex min-w-0 flex-col gap-1">
                  <h3 className="font-medium">Todavía no es un pendiente</h3>
                  <p className="text-muted-foreground">
                    {`La decisión se pedirá cuando tenga su análisis, o el ${m.esperaHasta ? fechaLargaDeDia(m.esperaHasta) : "día de su plazo"} si no lo tiene.`}
                  </p>
                </div>
              ) : (
                <>
                  {conAnalisis ? (
                    <div className="flex min-w-0 flex-col gap-1 rounded-md border border-border p-2">
                      <h3 className="font-medium">
                        Análisis del líder
                        {m.analizadaEn ? <span className="font-normal text-muted-foreground">{` · ${textoFecha(m.analizadaEn, "UTC")}`}</span> : null}
                      </h3>
                      <dl className="flex min-w-0 flex-col gap-1">
                        {m.causa !== null ? (
                          <div>
                            <dt className="font-medium">Causa</dt>
                            <dd className="break-words">{m.causa}</dd>
                          </div>
                        ) : null}
                        {m.accionPropuesta !== null ? (
                          <div>
                            <dt className="font-medium">Acción propuesta</dt>
                            <dd className="break-words">{m.accionPropuesta}</dd>
                          </div>
                        ) : null}
                      </dl>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">Sin análisis: quien analiza el indicador todavía lo puede escribir.</p>
                  )}
                  <div className="flex min-w-0 flex-col items-start gap-2">
                    <h3 className="font-medium">{`Decidir la acción de mejora: ${m.periodo.toLowerCase()}`}</h3>
                    {(candidatos.length > 0 && puede.hallazgo) || puede.noRequiere ? (
                      <FormularioDeDecision
                        medicionId={m.medicionId}
                        periodo={m.periodo}
                        candidatos={puede.hallazgo ? candidatos : []}
                        puedeNoRequerir={puede.noRequiere}
                      />
                    ) : null}
                    {puede.hallazgo ? (
                      <Link href={rutaDeRegistro({ medicion: String(m.medicionId) })} className={`${claseBoton("secundario", "sm")} ${FOCO}`}>
                        Abrir un hallazgo nuevo
                        <span className="sr-only">{`: ${m.periodo}`}</span>
                      </Link>
                    ) : null}
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
