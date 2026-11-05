import Link from "next/link";
import { claseControl } from "@/componentes/ui/Campo";
import type { DatosParaAceptar, DetalleTramite } from "@/db/consultas/tramites";

export type TramiteParaAceptar = Pick<
  DetalleTramite,
  | "id"
  | "etapa"
  | "ronda"
  | "tipo"
  | "solicitanteId"
  | "procesoId"
  | "subprocesoId"
  | "tipoDocumentoId"
  | "tituloPropuesto"
  | "codigo"
  | "titulo"
  | "procesoNombre"
>;

export type Plantilla = DatosParaAceptar["plantilla"];

export const anchoCompleto = `${claseControl} w-full`;

export function Bloque({
  id,
  titulo,
  className,
  children,
}: {
  id: string;
  titulo: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={`min-w-0 rounded-xl border border-border bg-card p-4 shadow-xs ${className ?? ""}`}>
      <h2 id={id} className="mb-3 text-sm font-semibold">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

export function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="break-words text-sm">{children}</dd>
    </div>
  );
}

/** Se abre en otra pestaña: quien acepta no debe perder lo que lleva escrito. */
export function EnlaceDocumento({ codigo, children }: { codigo: string; children?: React.ReactNode }) {
  return (
    <Link href={`/documentos/${codigo.toLowerCase()}`} target="_blank" className="font-mono text-xs underline underline-offset-2">
      {children ?? codigo}
      <span className="sr-only"> (abre en otra pestaña)</span>
    </Link>
  );
}
