import type { Metadata } from "next";
import Link from "next/link";
import { MapaProcesos } from "@/componentes/mapa/MapaProcesos";
import { claseBoton } from "@/componentes/ui/Boton";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { obtenerDatosMapaAdmin } from "@/db/consultas/mapa";
import { exigirPermiso } from "@/lib/paginas";

export const metadata: Metadata = { title: "Vista previa del mapa — Administración SGC" };

export default async function PaginaVistaPrevia() {
  await exigirPermiso("mapa.administrar");
  const datos = await obtenerDatosMapaAdmin();
  return (
    <div>
      <EncabezadoPagina
        titulo="Vista previa del mapa"
        descripcion="Incluye los nodos inactivos (en gris, marcados “inactivo”). El público no los ve."
        acciones={
          <Link href="/admin/mapa" className={claseBoton("secundario")}>
            ← Volver al editor
          </Link>
        }
      />
      <div className="rounded-2xl border bg-muted/30 p-4">
        <MapaProcesos datos={datos} />
      </div>
    </div>
  );
}
