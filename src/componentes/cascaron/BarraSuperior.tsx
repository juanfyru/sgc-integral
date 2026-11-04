"use client";

import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Dialogo } from "@/componentes/ui/Dialogo";
import { ContenidoBarra, type MarcaBarra } from "./ContenidoBarra";
import type { EntradaNav } from "./navegacion";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

export function BarraSuperior({
  marca,
  entradas,
  tareas,
  version,
  buscador,
  campana,
  menuUsuario,
}: {
  marca: MarcaBarra;
  entradas: EntradaNav[];
  tareas: number;
  version: string;
  buscador: React.ReactNode;
  campana: React.ReactNode;
  menuUsuario: React.ReactNode;
}) {
  const [cajonAbierto, setCajonAbierto] = useState(false);
  // Idempotente: Dialogo la llama en todo cierre, también en el que pide este componente.
  const cerrarCajon = () => setCajonAbierto(false);

  return (
    <>
      <header className="sticky top-0 z-40 h-14 border-b-2 border-marca bg-card print:hidden">
        <div className="flex h-full items-center gap-2 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setCajonAbierto(true)}
            aria-haspopup="dialog"
            aria-expanded={cajonAbierto}
            className={`-ml-2 inline-flex size-10 items-center justify-center rounded-md text-foreground hover:bg-muted lg:hidden ${FOCO}`}
          >
            <Menu className="size-5" aria-hidden="true" />
            <span className="sr-only">Abrir menú</span>
          </button>
          <div className="flex-1" />
          {buscador}
          {campana}
          {menuUsuario}
        </div>
      </header>

      <Dialogo
        abierto={cajonAbierto}
        alCerrar={cerrarCajon}
        titulo="Menú de navegación"
        className="fixed inset-y-0 left-0 m-0 h-dvh max-h-none w-72 max-w-[85vw] border-r border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40"
      >
        {/* El relleno va en este hijo: un clic sobre el propio <dialog> es un clic en el fondo y lo cierra. */}
        <div className="flex h-full flex-col">
          <div className="flex justify-end px-2 pt-2">
            <button
              type="button"
              onClick={cerrarCajon}
              className={`inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground ${FOCO}`}
            >
              <X className="size-5" aria-hidden="true" />
              <span className="sr-only">Cerrar menú</span>
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <ContenidoBarra marca={marca} entradas={entradas} tareas={tareas} version={version} alNavegar={cerrarCajon} />
          </div>
        </div>
      </Dialogo>
    </>
  );
}
