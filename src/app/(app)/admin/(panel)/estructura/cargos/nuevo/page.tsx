import type { Metadata } from "next";
import { crearCargoAccion } from "@/app/admin/acciones-estructura";
import { FormularioCargo } from "@/componentes/admin/estructura/FormularioCargo";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { listarAreas, listarCargos } from "@/db/consultas/estructura";
import { exigirPermiso } from "@/lib/paginas";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nuevo cargo — Administración SGC" };

export default async function PaginaNuevoCargo() {
  await exigirPermiso("estructura.administrar");
  const [areas, cargos] = await Promise.all([listarAreas(), listarCargos()]);
  return (
    <div>
      <EncabezadoPagina titulo="Nuevo cargo" />
      <FormularioCargo
        accion={crearCargoAccion}
        areas={areas.filter((a) => a.activo)}
        cargos={cargos.filter((c) => c.activo)}
      />
    </div>
  );
}
