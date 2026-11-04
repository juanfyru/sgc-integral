import Link from "next/link";
import { PencilLine } from "lucide-react";
import type { DocumentoListado } from "@/db/consultas/procesos";
import { IconoFormato } from "./IconoFormato";

/**
 * Fila de documento en los listados de proceso/subproceso. Enlaza a la ficha;
 * `contexto` agrega la procedencia cuando aplica ("En subproceso: Ingreso",
 * "Propio de: Sistema de Gestión de Calidad").
 */
export function TarjetaDocumento({
  documento,
  contexto,
}: {
  documento: DocumentoListado;
  contexto?: string;
}) {
  return (
    <li className="list-none">
      <Link
        href={`/documentos/${documento.codigo.toLowerCase()}`}
        className="group flex flex-col gap-1.5 rounded-xl border border-border bg-card p-3.5 shadow-xs transition-all duration-200 hover:-translate-y-px hover:border-[var(--color-banda)] hover:shadow-md focus-visible:border-[var(--color-banda)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-banda)]"
      >
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className="font-mono text-xs tracking-wide text-muted-foreground">
            {documento.codigo}
          </span>
          <span className="text-xs tabular-nums text-muted-foreground">
            v{documento.version}
          </span>
          {contexto && (
            <span className="text-xs text-muted-foreground">{contexto}</span>
          )}
        </div>
        <p className="text-sm/snug font-semibold text-foreground group-hover:banda-texto">
          {documento.titulo}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          {documento.archivos.map((archivo) => (
            <IconoFormato
              key={archivo.id}
              mime={archivo.mime}
              tamanoBytes={archivo.tamanoBytes}
            />
          ))}
          {documento.tipo.esDiligenciable && (
            <span className="inline-flex items-center gap-1 rounded-md banda-tinte px-1.5 py-0.5 text-[11px] font-medium banda-texto">
              <PencilLine className="size-3" aria-hidden="true" />
              Diligenciable
            </span>
          )}
        </div>
      </Link>
    </li>
  );
}
