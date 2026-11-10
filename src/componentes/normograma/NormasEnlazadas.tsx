import Link from "next/link";
import { Scale } from "lucide-react";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { normasDeDocumento } from "@/db/consultas/normograma/asociaciones";
import { InsigniaNorma } from "./TablaNormas";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/**
 * «Normas enlazadas» de la ficha del documento, en el portal y en el panel, para internos y externos (spec 13C §14.4):
 * cada norma con su estado en texto y el enlace a su ficha. De solo lectura: enlazar y quitar se hace desde la ficha de
 * la norma. Sin normas (o si la persona no ve el documento) no se pinta.
 */
export async function NormasEnlazadas({
  documentoId,
  sesion,
  nivel = 2,
}: {
  documentoId: number;
  sesion: SesionFlujo;
  /** El nivel del título: 2 en la ficha del portal y en la del panel, junto a los demás bloques. */
  nivel?: 2 | 3;
}) {
  const normas = await normasDeDocumento(documentoId, sesion);
  if (normas.length === 0) return null;
  const Titulo = nivel === 2 ? "h2" : "h3";
  return (
    <section aria-labelledby="titulo-normas-enlazadas" className="rounded-xl border border-border bg-card p-4 shadow-xs">
      <Titulo id="titulo-normas-enlazadas" className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Scale className="size-4 text-muted-foreground" aria-hidden="true" />
        {`Normas enlazadas (${normas.length})`}
      </Titulo>
      <ul className="flex list-none flex-col gap-2 text-sm">
        {normas.map((n) => (
          <li key={n.id} className="flex min-w-0 flex-wrap items-start justify-between gap-2">
            <span className="min-w-0 flex-1">
              <Link href={`/normograma/${n.id}`} className={`rounded font-medium hover:underline ${FOCO}`}>
                {n.nombre}
              </Link>
              <span className="block break-words text-muted-foreground">{n.titulo}</span>
            </span>
            <InsigniaNorma estado={n.estado} estadoEn={n.estadoEn} />
          </li>
        ))}
      </ul>
    </section>
  );
}
