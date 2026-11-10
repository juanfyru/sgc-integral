import Link from "next/link";
import { Scale } from "lucide-react";
import { InsigniaNorma } from "@/componentes/normograma/TablaNormas";
import { Insignia } from "@/componentes/ui/Insignia";
import type { FilaNorma } from "@/db/consultas/normograma/lectura";
import type { ProcesoDeRevision } from "@/db/consultas/vigencia/revision-anual";
import { textoFecha } from "@/lib/vigencia/plazo";
import { zonaHoraria } from "@/lib/zona-horaria";
import { ConfirmarNormograma } from "./AccionesDecision";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/**
 * El normograma del proceso en la revisión anual (spec 13C §9.4, maqueta 5): las normas asociadas con su estado, lo que
 * se confirmó (quién y cuándo) y, para quien decide sobre el proceso con la revisión abierta, «Sin novedad» o «Marcar
 * cambios…». Es un paso de la tarea del líder: el proceso no está completo hasta confirmarlo.
 */
export function NormogramaDelProceso({
  revisionId,
  proceso,
  normas,
}: {
  revisionId: number;
  proceso: Pick<ProcesoDeRevision, "id" | "nombre" | "normograma" | "puedeDecidir">;
  normas: (FilaNorma & { requisito: string | null })[];
}) {
  const zona = zonaHoraria();
  const confirmado = proceso.normograma;
  const titulo = `Normograma de ${proceso.nombre} · ${normas.length} ${normas.length === 1 ? "norma" : "normas"}`;
  const id = `normograma-${proceso.id}`;
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <h3 id={id} className="flex items-center gap-2 text-sm font-semibold">
        <Scale className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        {titulo}
      </h3>
      <p className="text-sm text-muted-foreground">
        Confirme que las normas asociadas al proceso siguen vigentes y completas. Si falta una o cambió, márquelo y el
        Administrador del SGC la registra en el normograma.
      </p>
      {normas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ninguna norma del normograma está asociada a este proceso.</p>
      ) : (
        <ul className="flex list-none flex-col gap-2">
          {normas.map((n) => (
            <li key={n.id} className="flex min-w-0 flex-wrap items-start justify-between gap-2 text-sm">
              <span className="min-w-0 flex-1">
                <Link href={`/normograma/${n.id}`} className={`rounded font-medium hover:underline ${FOCO}`}>
                  {n.nombre}
                </Link>
                <span className="block break-words text-muted-foreground">{n.requisito ?? n.titulo}</span>
              </span>
              <InsigniaNorma estado={n.estado} estadoEn={n.estadoEn} />
            </li>
          ))}
        </ul>
      )}
      <div className="flex min-w-0 flex-col gap-1 text-sm">
        {confirmado ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Insignia variante={confirmado.resultado === "cambios" ? "atencion" : "bien"}>
                {confirmado.resultado === "cambios" ? "Cambios marcados" : "Sin novedad"}
              </Insignia>
              <span className="text-muted-foreground">{`${confirmado.por} · ${textoFecha(confirmado.en, zona)}`}</span>
            </div>
            {confirmado.nota ? <p className="whitespace-pre-wrap break-words">{confirmado.nota}</p> : null}
          </>
        ) : (
          <div>
            <Insignia variante="sin-dato">Sin confirmar</Insignia>
          </div>
        )}
      </div>
      {proceso.puedeDecidir ? <ConfirmarNormograma revisionId={revisionId} procesoId={proceso.id} proceso={proceso.nombre} /> : null}
    </section>
  );
}
