import { Insignia } from "@/componentes/ui/Insignia";
import type { ImpactoDeIndicador } from "@/db/consultas/indicadores/impactos";
import { ETIQUETA_ESTADO_NORMA, fechaDeNorma, type EstadoNorma } from "@/lib/normograma/tipos";
import { textoFecha } from "@/lib/vigencia/plazo";
import { zonaHoraria } from "@/lib/zona-horaria";
import { FormularioNoAfecta } from "./FormularioNoAfecta";

const estadoEnTexto = (estado: string) => ETIQUETA_ESTADO_NORMA[estado as EstadoNorma]?.toLowerCase() ?? estado;

/**
 * «Revisión por cambio normativo» (anexo 14B, §9): las revisiones pendientes del indicador, en todas las vistas de su
 * página, a quien ve el indicador (quien llama ya lo decidió: `impactosPendientesDe` no las da a los demás). Cada una dice
 * qué norma cambió, a qué estado, cuándo y hasta cuándo hay que revisar la ficha; vencida, lo dice en texto. A quien
 * administra indicadores, «No afecta» con su nota y las otras dos salidas.
 */
export function AvisoDeImpacto({ impactos, administra }: { impactos: ImpactoDeIndicador[]; administra: boolean }) {
  if (impactos.length === 0) return null;
  const zona = zonaHoraria();
  return (
    <section
      aria-labelledby="aviso-de-impacto"
      className="flex min-w-0 flex-col gap-3 rounded-lg border border-l-4 border-border border-l-estado-atencion bg-card px-4 py-3 text-sm"
    >
      <h2 id="aviso-de-impacto" className="font-semibold">
        Revisión por cambio normativo
      </h2>
      <ul className="flex min-w-0 list-none flex-col gap-3">
        {impactos.map((i) => (
          <li key={i.id} className="flex min-w-0 flex-col items-start gap-2">
            <p className="break-words">
              {`${i.norma} pasó a ${estadoEnTexto(i.estadoNuevo)} el ${fechaDeNorma(i.fecha)}. Hay que revisar esta ficha antes del ${textoFecha(i.venceEn, zona)}.`}
              {i.vencido ? (
                <>
                  {" "}
                  <Insignia variante="critico">Plazo vencido</Insignia>
                </>
              ) : null}
            </p>
            {administra ? <FormularioNoAfecta impactoId={i.id} norma={i.norma} /> : null}
          </li>
        ))}
      </ul>
      {administra ? <p className="text-muted-foreground">También se resuelve al aprobar una versión nueva de la ficha o al retirar el indicador.</p> : null}
    </section>
  );
}
