import type { Metadata } from "next";
import { anularPlanAccion, sacarDelPlanAccion } from "@/app/acciones-mejoramiento";
import { DatosDelPlan } from "@/componentes/mejoramiento/planes/DatosDelPlan";
import { DialogoAnularPlan } from "@/componentes/mejoramiento/planes/DialogoAnularPlan";
import { EncabezadoDelPlan } from "@/componentes/mejoramiento/planes/EncabezadoDelPlan";
import { HallazgosDelPlan } from "@/componentes/mejoramiento/planes/HallazgosDelPlan";
import { HistorialDelPlan } from "@/componentes/mejoramiento/planes/HistorialDelPlan";
import { obtenerSql } from "@/db/cliente";
import { contextoDeMejora } from "@/db/consultas/mejoramiento/config";
import { exigirSesion } from "@/lib/paginas";
import { zonaHoraria } from "@/lib/zona-horaria";
import { exigirPlan } from "../../_comun";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Plan de mejoramiento" };

/**
 * La página de un plan de mejoramiento (anexo §3.6 y §3.9, maqueta 2): el encabezado con sus botones, las cifras, los hallazgos
 * agrupados por proceso, los datos y el historial. Cada uno ve lo suyo, ya decidido por `leerPlan`: quien ve todo, el plan entero;
 * quien ve completo alguno de sus hallazgos (su líder, quien lo registró), solo esos, con sus cifras y sus líneas del historial, y
 * nada que diga que hay más. Un plan que no existe y uno que no se ve dan «no encontrado» (`exigirPlan`). Anular, solo un plan que
 * ya no tiene ningún hallazgo (tampoco uno anulado o rechazado que se quedó en él).
 */
export default async function PaginaPlan({ params }: { params: Promise<{ id: string }> }) {
  await exigirSesion();
  const { id } = await params;
  // Una sola hora para toda la página: las cifras, lo vencido y lo que falta del plazo se calculan con ella.
  const ahora = new Date();
  const { plan } = await exigirPlan(id, { ahora });
  const contexto = await contextoDeMejora(obtenerSql(), ahora);
  const clave = `${plan.estado}-${plan.historial.length}`;
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <EncabezadoDelPlan
        plan={plan}
        anular={
          plan.puede.gestionar && plan.grupos.length === 0 ? (
            <DialogoAnularPlan key={`anular-${clave}`} planId={plan.id} codigo={plan.codigo} accion={anularPlanAccion} />
          ) : undefined
        }
      />
      {/* La tabla de hallazgos necesita todo el ancho para que se lean todas sus columnas y «Sacar» sin desplazarse: la columna de
          al lado (maqueta 2) llega solo desde 1536 px; por debajo, los datos y el historial van debajo, uno junto al otro. */}
      <div className="grid min-w-0 grid-cols-1 gap-6 2xl:grid-cols-[minmax(0,1fr)_22rem]">
        <HallazgosDelPlan key={`hallazgos-${clave}`} plan={plan} contexto={contexto} sacar={sacarDelPlanAccion} />
        <div className="grid min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-2 2xl:flex 2xl:flex-col">
          <DatosDelPlan plan={plan} />
          <HistorialDelPlan eventos={plan.historial} zona={zonaHoraria()} />
        </div>
      </div>
    </div>
  );
}
