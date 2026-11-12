"use client";

import { Printer } from "lucide-react";
import { Boton } from "@/componentes/ui/Boton";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/** «Imprimir» (spec §7.8 y §12.7): abre la impresión del navegador (sin PDF en el servidor) y no sale en el papel. */
export function BotonImprimir({ etiqueta = "Imprimir" }: { etiqueta?: string }) {
  return (
    <Boton variante="secundario" onClick={() => window.print()} className={`print:hidden ${FOCO}`}>
      <Printer aria-hidden="true" className="size-4" />
      {etiqueta}
    </Boton>
  );
}
