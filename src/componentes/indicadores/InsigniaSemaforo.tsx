import { Insignia } from "@/componentes/ui/Insignia";
import { ETIQUETA_SEMAFORO, NO_ALCANZA_LA_META, sinAlcanzarLaMeta, type Semaforo } from "@/lib/indicadores/tipos";

/**
 * El estado de un resultado (spec §7.5 y §11) con su nombre escrito, nunca solo el color: «Bien», «Atención» o «Crítico»;
 * sin semáforo, «No aplica» (`noAplica`), «Sin meta» (hay resultado sin meta, `conResultado`) o «Sin dato». Un Bien que no
 * alcanza la meta (`cumple` falso; rangos propios, spec 14A §3.1) lo dice: «Bien · no alcanza la meta», con el mismo color.
 */
export function InsigniaSemaforo({
  semaforo,
  cumple = null,
  noAplica = false,
  conResultado = false,
}: {
  semaforo: Semaforo | null;
  cumple?: boolean | null;
  noAplica?: boolean;
  conResultado?: boolean;
}) {
  if (semaforo) {
    return <Insignia variante={semaforo}>{sinAlcanzarLaMeta(semaforo, cumple) ? `${ETIQUETA_SEMAFORO[semaforo]} · ${NO_ALCANZA_LA_META}` : ETIQUETA_SEMAFORO[semaforo]}</Insignia>;
  }
  return <Insignia variante="sin-dato">{noAplica ? "No aplica" : conResultado ? "Sin meta" : "Sin dato"}</Insignia>;
}
