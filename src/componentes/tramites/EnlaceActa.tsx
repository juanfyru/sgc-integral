import { FileText } from "lucide-react";

const ETIQUETA = { aprobacion: "Acta de aprobación", eliminacion: "Acta de eliminación" } as const;

export type ClaseActa = keyof typeof ETIQUETA;

/**
 * El acta en PDF de una versión publicada o de una eliminación. La ruta la genera si no existe y la
 * sirve a quien ve la versión: aquí solo se ofrece el enlace. El formato va en el texto, no solo en el ícono.
 */
export function EnlaceActa({
  tramiteId,
  clase,
  className = "",
}: {
  tramiteId: number;
  clase: ClaseActa;
  className?: string;
}) {
  const etiqueta = ETIQUETA[clase];
  return (
    <a
      href={`/tramites/${tramiteId}/acta`}
      target="_blank"
      rel="noopener"
      aria-label={`${etiqueta} (PDF), se abre en una pestaña nueva`}
      className={`inline-flex items-center gap-1.5 font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${className}`}
    >
      <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      {etiqueta}
      <span className="text-xs font-normal text-muted-foreground">PDF</span>
    </a>
  );
}
