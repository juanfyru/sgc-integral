"use client";

import { useState } from "react";
import { Download, MousePointerClick, X } from "lucide-react";

/**
 * Visor PDF embebido con overlay de activación. El plugin PDF del navegador
 * captura la rueda del mouse: si el visor estuviera activo desde el inicio,
 * la página no podría scrollearse con el cursor encima (el usuario "queda
 * atrapado"). Inactivo, los eventos pasan de largo y la página fluye; un
 * clic explícito habilita la navegación dentro del PDF, y se puede volver a
 * liberar. La altura se adapta al viewport con clamp() — se recalcula sola
 * al redimensionar la ventana.
 */
export function VisorPdf({
  src,
  urlDescarga,
  nombreDescarga,
  titulo,
}: {
  src: string;
  urlDescarga: string;
  nombreDescarga: string;
  titulo: string;
}) {
  const [activo, setActivo] = useState(false);

  return (
    <div className="relative h-[clamp(20rem,calc(100dvh-16rem),50rem)] w-full">
      <object
        data={src}
        type="application/pdf"
        aria-label={`Vista previa de ${titulo}`}
        className={`h-full w-full rounded-xl border bg-muted shadow-xs ${
          activo
            ? "border-[var(--color-banda)]"
            : "pointer-events-none border-border"
        }`}
      >
        <p className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
          El navegador no puede mostrar la vista previa del PDF.
          <a
            href={urlDescarga}
            download={nombreDescarga}
            className="pointer-events-auto inline-flex items-center gap-2 rounded-lg bg-[color-mix(in_srgb,var(--color-banda)_80%,black)] px-4 py-2 font-medium text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-banda)]"
          >
            <Download className="size-4" aria-hidden="true" />
            Descargar el documento
          </a>
        </p>
      </object>

      {activo ? (
        <button
          type="button"
          onClick={() => setActivo(false)}
          className="absolute top-2 right-2 inline-flex items-center gap-1.5 rounded-lg border border-border bg-card/95 px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm backdrop-blur hover:bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-banda)]"
        >
          <X className="size-3.5" aria-hidden="true" />
          Liberar el scroll de la página
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setActivo(true)}
          aria-label={`Activar la navegación dentro del PDF de ${titulo}`}
          className="absolute inset-0 grid w-full place-items-center rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-banda)]"
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/95 px-4 py-2 text-sm font-medium text-foreground shadow-md backdrop-blur">
            <MousePointerClick className="size-4" aria-hidden="true" />
            Clic para navegar el PDF
          </span>
        </button>
      )}
    </div>
  );
}
