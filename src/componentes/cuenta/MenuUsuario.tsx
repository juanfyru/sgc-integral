"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { salir } from "@/app/acciones-cuenta";

export type UsuarioMenu = { nombre: string; etiquetaRol: string; verPanel: boolean };

/** Menú de cuenta con <details> nativo: abre y cierra sin JavaScript propio. */
export function MenuUsuario({ usuario }: { usuario: UsuarioMenu }) {
  return (
    <details className="relative shrink-0">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul [&::-webkit-details-marker]:hidden">
        <span className="max-w-[10rem] truncate font-medium text-foreground">{usuario.nombre}</span>
        <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
      </summary>
      <div className="absolute right-0 z-50 mt-2 w-60 rounded-xl border border-border bg-card p-3 shadow-lg">
        <p className="truncate text-sm font-medium text-foreground">{usuario.nombre}</p>
        <p className="mb-3 text-xs text-muted-foreground">{usuario.etiquetaRol}</p>
        {usuario.verPanel && (
          <Link
            href="/admin"
            className="mb-2 block rounded-md px-2 py-1.5 text-sm text-azul hover:bg-muted focus-visible:outline-2 focus-visible:outline-azul"
          >
            Administración
          </Link>
        )}
        <form action={salir}>
          <button
            type="submit"
            className="w-full rounded-md border border-border px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-azul"
          >
            Salir
          </button>
        </form>
      </div>
    </details>
  );
}
