import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { editarPlanAccion } from "@/app/acciones-mejoramiento";
import { FormularioPlan } from "@/componentes/mejoramiento/planes/FormularioPlan";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { objetivosActivos } from "@/db/consultas/mejoramiento/opciones";
import { RUTA_PLANES } from "@/lib/mejoramiento/rutas";
import { exigirSesion } from "@/lib/paginas";
import { puede } from "@/lib/permisos";
import { exigirPlan, rutaDePlan } from "../../../_comun";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Editar el plan de mejoramiento" };

/**
 * Editar un plan (anexo §3.2): todo menos el código y la vigencia; no cambia ningún hallazgo. Solo con `mejora.planes` (a los
 * demás, «no encontrado», como un plan que no existe); uno anulado ya no se edita y vuelve a su página.
 */
export default async function PaginaEditarPlan({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await exigirSesion();
  if (!puede(sesion, "mejora.planes")) notFound();
  const { id } = await params;
  const { plan } = await exigirPlan(id);
  if (!plan.puede.gestionar) redirect(rutaDePlan(plan.id));
  const objetivos = await objetivosActivos();
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <EncabezadoPagina
        migas={[
          { nombre: "Mejoramiento", href: "/mejoramiento" },
          { nombre: "Planes", href: RUTA_PLANES },
          { nombre: plan.codigo, href: rutaDePlan(plan.id) },
          { nombre: "Editar" },
        ]}
        codigo={plan.codigo}
        titulo={`Editar ${plan.nombre}`}
        descripcion="Editar el plan no cambia sus hallazgos: lo que propone se ofrece a los que entran después."
      />
      <FormularioPlan
        accion={editarPlanAccion}
        objetivos={objetivos}
        cancelar={rutaDePlan(plan.id)}
        plan={{
          id: plan.id,
          codigo: plan.codigo,
          vigencia: plan.vigencia,
          nombre: plan.nombre,
          origen: plan.origen,
          fechaEvento: plan.fechaEvento,
          objetivoTexto: plan.objetivoTexto,
          objetivoId: plan.objetivoId,
          objetivo: plan.objetivo,
          fechaLimiteEnte: plan.fechaLimiteEnte,
        }}
      />
    </div>
  );
}
