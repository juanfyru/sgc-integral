import Link from "next/link";
import { claseBoton } from "@/componentes/ui/Boton";
import type { ClaseDeImpacto, EngancheDeImpacto } from "@/db/consultas/mejoramiento/enganche-impacto";
import { SUGERENCIA_DE_IMPACTO } from "@/lib/mejoramiento/enganches";
import { rutaDeHallazgo, rutaDeRegistro } from "@/lib/mejoramiento/rutas";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/**
 * Lo que un impacto de norma gana de mejoramiento (Fase 15B, anexo §8, maqueta 6), ya decidido por `engancheDeImpactos`: a quien puede
 * abrirlo, la sugerencia (si el impacto está vencido y ya se escaló) y «Abrir hallazgo», que lleva al registro con el impacto puesto
 * (`?impacto=` o, en la revisión de un indicador, `?impactoIndicador=`); después, «Hallazgo HZ-… · en qué va», con su enlace, **solo a
 * quien ve ese hallazgo**. A quien no lo ve no le pinta nada de él: ni su código, ni en qué va. Sin nada de eso no pinta nada: el resto
 * del impacto es del normograma o de los indicadores y no cambia.
 */
export function HallazgoDeImpacto({
  clase,
  impactoId,
  enganche,
}: {
  clase: ClaseDeImpacto;
  impactoId: number;
  enganche: EngancheDeImpacto | undefined;
}) {
  const visible = enganche?.hallazgo?.visible ? enganche.hallazgo : null;
  if (!enganche || (!enganche.puedeAbrir && visible === null)) return null;
  const registro = rutaDeRegistro(clase === "documento" ? { impacto: String(impactoId) } : { impactoIndicador: String(impactoId) });
  return (
    <div className="flex min-w-0 flex-col items-start gap-2">
      {enganche.sugerir ? <p className="border-l-2 border-mod-planes pl-3 text-sm">{SUGERENCIA_DE_IMPACTO}</p> : null}
      {enganche.puedeAbrir ? (
        <Link href={registro} className={`${claseBoton("secundario", "sm")} ${FOCO}`}>
          Abrir hallazgo
        </Link>
      ) : null}
      {visible ? (
        <p className="min-w-0 break-words text-sm">
          <Link href={rutaDeHallazgo(visible.id)} className={`rounded-sm font-medium text-marca underline-offset-2 hover:underline ${FOCO}`}>
            {`Hallazgo ${visible.codigo}`}
          </Link>
          {` · ${visible.estado}`}
        </p>
      ) : null}
    </div>
  );
}
