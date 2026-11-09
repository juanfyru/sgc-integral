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

/** El estado de vigencia va siempre en texto; el color y el ícono solo lo refuerzan. */
export function ChipVigencia({
  fila,
}: {
  fila: {
    vigencia: { estado: EstadoVigencia; dias: number | null };
    tramite: { etapa: Etapa; dia: number | null } | null;
    impacto: { norma: string } | null;
  };
}) {
  return (
    <Insignia variante={VARIANTE_VIGENCIA[fila.vigencia.estado]} icono={ICONO[fila.vigencia.estado]}>
      {textoVigenciaDeFila(fila)}
    </Insignia>
  );
}
