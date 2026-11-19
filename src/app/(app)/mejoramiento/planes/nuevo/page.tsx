import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { crearPlanAccion } from "@/app/acciones-mejoramiento";
import { FormularioPlan } from "@/componentes/mejoramiento/planes/FormularioPlan";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { objetivosActivos } from "@/db/consultas/mejoramiento/opciones";
import { RUTA_PLANES } from "@/lib/mejoramiento/rutas";
import { exigirSesion } from "@/lib/paginas";
import { puede } from "@/lib/permisos";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nuevo plan de mejoramiento" };

/**
 * El formulario de un plan nuevo (anexo §3.1 y §3.2): lo crean el Admin SGC y Control Interno (`mejora.planes`); a los demás,
 * «no encontrado». El código `PM-AAAA-NN` lo pone el sistema al guardarlo.
 */
export default async function PaginaNuevoPlan() {
  const sesion = await exigirSesion();
  if (!puede(sesion, "mejora.planes")) notFound();
  const objetivos = await objetivosActivos();
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <EncabezadoPagina
        migas={[
          { nombre: "Mejoramiento", href: "/mejoramiento" },
          { nombre: "Planes", href: RUTA_PLANES },
          { nombre: "Nuevo plan" },
        ]}
        titulo="Nuevo plan de mejoramiento"
        descripcion="Agrupa los hallazgos de una auditoría o un evento. El código lo pone el sistema al guardarlo, con la vigencia."
      />
      <FormularioPlan accion={crearPlanAccion} objetivos={objetivos} cancelar={RUTA_PLANES} />
    </div>
  );
}
