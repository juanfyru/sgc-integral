import { Insignia } from "@/componentes/ui/Insignia";
import { ETIQUETA_SEMAFORO, type Semaforo } from "@/lib/indicadores/tipos";

/**
 * El estado de un resultado (spec §7.5 y §11) con su nombre escrito, nunca solo el color: «Bien», «Atención» o «Crítico»;
 * sin semáforo, «No aplica» (`noAplica`), «Sin meta» (hay resultado sin meta, `conResultado`) o «Sin dato».
 */
export function InsigniaSemaforo({ semaforo, noAplica = false, conResultado = false }: { semaforo: Semaforo | null; noAplica?: boolean; conResultado?: boolean }) {
  if (semaforo) return <Insignia variante={semaforo}>{ETIQUETA_SEMAFORO[semaforo]}</Insignia>;
  return <Insignia variante="sin-dato">{noAplica ? "No aplica" : conResultado ? "Sin meta" : "Sin dato"}</Insignia>;
}
