import { CircleAlert, Clock } from "lucide-react";
import { Insignia } from "@/componentes/ui/Insignia";
import { VARIANTE_VIGENCIA } from "@/lib/vigencia/tipos";

/** «N con revisión vencida · M en atención» de los documentos de un proceso; nada si no hay ninguno. */
export function ResumenVigencia({ vencidas, atencion }: { vencidas: number; atencion: number }) {
  if (vencidas === 0 && atencion === 0) return null;
  return (
    <>
      {vencidas > 0 ? (
        <Insignia variante={VARIANTE_VIGENCIA.vencida} icono={CircleAlert}>{`${vencidas} con revisión vencida`}</Insignia>
      ) : null}
      {atencion > 0 ? (
        <Insignia variante={VARIANTE_VIGENCIA.atencion} icono={Clock}>{`${atencion} en atención`}</Insignia>
      ) : null}
    </>
  );
}
