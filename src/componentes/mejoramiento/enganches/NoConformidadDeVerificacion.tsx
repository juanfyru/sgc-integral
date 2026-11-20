import Link from "next/link";
import { claseBoton } from "@/componentes/ui/Boton";
import type { EngancheDeVerificacion } from "@/db/consultas/mejoramiento/enganche-verificacion";
import { textoDeSugerencia } from "@/lib/mejoramiento/enganches";
import { rutaDeHallazgo, rutaDeRegistro } from "@/lib/mejoramiento/rutas";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/**
 * Lo que la fila de un hallazgo de verificación de Distribución gana de mejoramiento (Fase 15B, anexo §7.1 y §7.4, maqueta 6), ya
 * decidido por `engancheDeVerificacion`: al Admin SGC, la sugerencia (si la hay) y «Abrir no conformidad», que lleva al registro con
 * el hallazgo puesto; después, «No conformidad HZ-… · en qué va», con su enlace, solo a quien la ve (a los demás llega nula: para
 * ellos no existe; revisión final, I1). Sin nada de eso no pinta nada: el resto de la fila es de Distribución y no cambia.
 */
export function NoConformidadDeVerificacion({ hallazgoId, enganche }: { hallazgoId: number; enganche: EngancheDeVerificacion | undefined }) {
  if (!enganche || (!enganche.puedeAbrir && enganche.noConformidad === null)) return null;
  const { noConformidad: nc, puedeAbrir, sugerir } = enganche;
  return (
    <div className="mt-2 flex min-w-0 flex-col items-start gap-2">
      {sugerir ? <p className="border-l-2 border-mod-planes pl-3 text-sm">{textoDeSugerencia(sugerir)}</p> : null}
      {puedeAbrir ? (
        <Link href={rutaDeRegistro({ verificacion: String(hallazgoId) })} className={`${claseBoton(sugerir ? "primario" : "secundario", "sm")} ${FOCO}`}>
          Abrir no conformidad
        </Link>
      ) : null}
      {nc ? (
        <p className="min-w-0 break-words text-sm">
          <Link href={rutaDeHallazgo(nc.id)} className={`rounded-sm font-medium text-marca underline-offset-2 hover:underline ${FOCO}`}>
            {`No conformidad ${nc.codigo}`}
          </Link>
          {` · ${nc.estado}`}
        </p>
      ) : null}
    </div>
  );
}
