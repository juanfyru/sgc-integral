import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FormularioNorma } from "@/componentes/normograma/FormularioNorma";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { obtenerNorma, sugerirEmisores } from "@/db/consultas/normograma/lectura";
import { listarTiposNorma } from "@/db/consultas/normograma/tipos-norma";
import { exigirSesion } from "@/lib/paginas";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Editar norma" };

/**
 * Editar los datos de una norma (spec 13C §10.1): solo quien administra el normograma, y no una retirada (no admite
 * cambios). El estado y las relaciones se cambian desde la ficha. Para los demás, «no encontrada».
 */
export default async function PaginaEditarNorma({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await exigirSesion();
  const { id } = await params;
  if (!/^\d{1,15}$/.test(id)) notFound();
  const norma = await obtenerNorma(Number(id), sesion);
  if (!norma || !norma.acciones.administrar || norma.estado === "retirada") notFound();
  const [tipos, emisores] = await Promise.all([listarTiposNorma(), sugerirEmisores("")]);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <EncabezadoPagina
        migas={[{ nombre: "Normograma", href: "/normograma" }, { nombre: norma.nombre, href: `/normograma/${norma.id}` }, { nombre: "Editar" }]}
        titulo={`Editar ${norma.nombre}`}
        descripcion="Los cambios quedan en la bitácora con el antes y el después."
      />
      <FormularioNorma
        norma={{
          id: norma.id,
          tipoNormaId: norma.tipoNormaId,
          numero: norma.numero,
          anio: norma.anio,
          fechaExpedicion: norma.fechaExpedicion,
          entidadEmisora: norma.entidadEmisora,
          titulo: norma.titulo,
          tema: norma.tema,
          enlaceOficial: norma.enlaceOficial,
          notas: norma.notas,
        }}
        // Los activos y, aunque esté inactivo, el que la norma ya tiene.
        tipos={tipos.filter((t) => t.activo || t.id === norma.tipoNormaId).map((t) => ({ id: t.id, nombre: t.nombre }))}
        emisores={emisores}
      />
    </div>
  );
}
