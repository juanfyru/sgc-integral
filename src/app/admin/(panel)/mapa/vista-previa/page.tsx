import type { Metadata } from "next";
import Link from "next/link";
import { MapaProcesos } from "@/componentes/mapa/MapaProcesos";
import { obtenerDatosMapaAdmin } from "@/db/consultas/mapa";
import { exigirPermiso } from "@/lib/paginas";

export const metadata: Metadata = { title: "Vista previa del mapa — Administración SGC" };

export default async function PaginaVistaPrevia() {
  await exigirPermiso("mapa.administrar");
  const datos = await obtenerDatosMapaAdmin();
  return (
    <main>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Vista previa del mapa</h1>
          <p className="text-sm text-muted-foreground">
            Incluye los nodos inactivos (en gris, marcados “inactivo”). El público no los ve.
          </p>
        </div>
        <Link href="/admin/mapa" className="rounded-md border px-3 py-2 text-sm hover:bg-muted">
          ← Volver al editor
        </Link>
      </div>
      <div className="rounded-2xl border bg-muted/30 p-4">
        <MapaProcesos datos={datos} />
      </div>
    </main>
  );
}
