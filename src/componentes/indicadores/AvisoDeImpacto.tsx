import { HallazgoDeImpacto } from "@/componentes/mejoramiento/enganches/HallazgoDeImpacto";
import { Insignia } from "@/componentes/ui/Insignia";
import type { ImpactoDeIndicador } from "@/db/consultas/indicadores/impactos";
import type { EngancheDeImpacto } from "@/db/consultas/mejoramiento/enganche-impacto";
import { ETIQUETA_ESTADO_NORMA, fechaDeNorma, type EstadoNorma } from "@/lib/normograma/tipos";
import { textoFecha } from "@/lib/vigencia/plazo";
import { zonaHoraria } from "@/lib/zona-horaria";
import { FormularioNoAfecta } from "./FormularioNoAfecta";

const estadoEnTexto = (estado: string) => ETIQUETA_ESTADO_NORMA[estado as EstadoNorma]?.toLowerCase() ?? estado;

/**
 * «Revisión por cambio normativo» (anexo 14B, §9): las revisiones pendientes del indicador, en todas las vistas de su
 * página, a quien ve el indicador (quien llama ya lo decidió: `impactosPendientesDe` no las da a los demás). Cada una dice
 * qué norma cambió, a qué estado, cuándo y hasta cuándo hay que revisar la ficha; vencida, lo dice en texto. A quien
 * administra indicadores, «No afecta» con su nota y, en un indicador activo, las otras dos salidas (una versión enviada
 * antes del cambio no lo resuelve: F14B-DC23). En uno retirado (la carrera entre el retiro y la derogación) solo queda
 * «No afecta». Con `enganches` (Fase 15B, anexo §8, de `engancheDeImpactos`: la página lo lee, las consultas de Indicadores no
 * importan Mejoramiento), cada revisión gana lo de mejoramiento: la sugerencia, «Abrir hallazgo» o su hallazgo.
 */
export function AvisoDeImpacto({
  impactos,
  administra,
  activo,
  enganches,
}: {
  impactos: ImpactoDeIndicador[];
  administra: boolean;
  activo: boolean;
  enganches?: ReadonlyMap<number, EngancheDeImpacto>;
}) {
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
            <HallazgoDeImpacto clase="indicador" impactoId={i.id} enganche={enganches?.get(i.id)} />
          </li>
        ))}
      </ul>
      {administra && activo ? (
        <p className="text-muted-foreground">También se resuelve al aprobar una versión de la ficha enviada después de este cambio, o al retirar el indicador.</p>
      ) : null}
    </section>
  );
}
