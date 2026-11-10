import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FormularioNorma } from "@/componentes/normograma/FormularioNorma";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { aniosYEmisores } from "@/db/consultas/normograma/lectura";
import { listarTiposNorma } from "@/db/consultas/normograma/tipos-norma";
import { exigirSesion } from "@/lib/paginas";
import { puede } from "@/lib/permisos";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nueva norma" };

/** Registrar una norma (spec 13C §10.1): solo quien administra el normograma; para los demás no existe. */
export default async function PaginaNuevaNorma() {
  const sesion = await exigirSesion();
  if (!puede(sesion, "normograma.administrar")) notFound();
  // Todas las entidades emisoras ya escritas: el navegador filtra el `datalist` mientras se escribe.
  const [tipos, { emisores }] = await Promise.all([listarTiposNorma({ soloActivos: true }), aniosYEmisores()]);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <EncabezadoPagina
        migas={[{ nombre: "Normograma", href: "/normograma" }, { nombre: "Nueva norma" }]}
        titulo="Nueva norma"
        descripcion="El tipo, el número y el año forman su nombre: «Resolución 3100 de 2019». No se repiten."
      />
      <FormularioNorma tipos={tipos.map((t) => ({ id: t.id, nombre: t.nombre }))} emisores={emisores} />
    </div>
  );
}
