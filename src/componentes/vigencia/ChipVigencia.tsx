import { CircleAlert, CircleCheck, Clock, Workflow, type LucideIcon } from "lucide-react";
import { Insignia } from "@/componentes/ui/Insignia";
import type { Etapa } from "@/lib/tramites/tipos";
import { textoVigenciaDeFila } from "@/lib/vigencia/semaforo";
import { VARIANTE_VIGENCIA, type EstadoVigencia } from "@/lib/vigencia/tipos";

const ICONO: Record<EstadoVigencia, LucideIcon> = {
  al_dia: CircleCheck,
  atencion: Clock,
  vencida: CircleAlert,
  en_tramite: Workflow,
};

type FilaChip = {
  vigencia: { estado: EstadoVigencia; dias: number | null };
  tramite: { etapa: Etapa; dia: number | null } | null;
  impacto: { norma: string } | null;
  edicionPendiente?: { desde: Date } | null;
};

/**
 * El estado de vigencia va siempre en texto; el color y el ícono solo lo refuerzan. Recibe la fila del semáforo, o
 * en una lista el estado con el texto que ya se calculó con esa misma fila. El texto no se parte en varias líneas.
 */
export function ChipVigencia(props: { fila: FilaChip } | { vigencia: { estado: EstadoVigencia; texto: string } }) {
  const { estado, texto } =
    "fila" in props ? { estado: props.fila.vigencia.estado, texto: textoVigenciaDeFila(props.fila) } : props.vigencia;
  return (
    <Insignia variante={VARIANTE_VIGENCIA[estado]} icono={ICONO[estado]}>
      <span className="whitespace-nowrap">{texto}</span>
    </Insignia>
  );
}
