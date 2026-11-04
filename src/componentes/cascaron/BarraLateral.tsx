"use client";

import { ContenidoBarra, type MarcaBarra } from "./ContenidoBarra";
import type { EntradaNav } from "./navegacion";

/** Barra fija desde 1024 px; por debajo la reemplaza el cajón de la barra superior. */
export function BarraLateral(props: { marca: MarcaBarra; entradas: EntradaNav[]; tareas: number; version: string }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 flex-col border-r border-border bg-card lg:flex print:hidden">
      <ContenidoBarra {...props} />
    </aside>
  );
}
