import { ArchivosDe } from "@/componentes/mejoramiento/ArchivosDe";
import type { DetalleDePlan } from "@/db/consultas/mejoramiento/planes-lectura";
import { ANCLA_ARCHIVOS_DEL_PLAN } from "@/lib/mejoramiento/rutas";

/**
 * «Archivos del plan» (anexo §3.7, maqueta 2): el informe del ente, el oficio de una respuesta… Llega solo a quien ve todo (la
 * lectura no lo trae a los demás): cada archivo es una descarga; quien tiene `mejora.planes` en un plan que no está anulado ve la
 * zona de carga, y cada uno quita lo que puede (quien lo subió o el Admin SGC; el oficio de una respuesta registrada, nadie). El
 * servidor vuelve a comprobar cada subida y cada quitada.
 */
export function ArchivosDelPlan({ planId, archivos }: { planId: number; archivos: NonNullable<DetalleDePlan["archivos"]> }) {
  return (
    <section
      id={ANCLA_ARCHIVOS_DEL_PLAN}
      aria-labelledby="archivos-del-plan-titulo"
      className="flex scroll-mt-4 flex-col gap-3 rounded-lg border border-border bg-card p-4"
    >
      <h2 id="archivos-del-plan-titulo" className="font-display text-base font-semibold">
        Archivos del plan
      </h2>
      <ArchivosDe
        archivos={archivos.lista}
        quitables={archivos.quitables}
        direccionDeSubida={archivos.puedeSubir ? `/api/mejoramiento/planes/${planId}/archivos` : null}
        nombre="Zona de carga de los archivos del plan"
        vacio="El plan no tiene archivos."
      />
      <p className="text-xs text-muted-foreground">
        Solo los abren el Administrador del SGC, Gerencia y Control Interno: un informe del ente nombra hallazgos de varios procesos.
      </p>
    </section>
  );
}
