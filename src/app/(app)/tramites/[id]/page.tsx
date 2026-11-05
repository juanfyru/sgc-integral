import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccionesSolicitud } from "@/componentes/tramites/AccionesSolicitud";
import { BloqueSolicitud } from "@/componentes/tramites/BloqueSolicitud";
import { EncabezadoTramite } from "@/componentes/tramites/EncabezadoTramite";
import { HistorialTramite } from "@/componentes/tramites/HistorialTramite";
import { PasosTramite } from "@/componentes/tramites/PasosTramite";
import { obtenerTramite } from "@/db/consultas/tramites";
import { exigirSesion } from "@/lib/paginas";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Trámite" };

export default async function PaginaTramite({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await exigirSesion();
  const { id } = await params;
  // Quien no puede ver el trámite recibe lo mismo que si no existiera.
  const tramite = /^\d{1,15}$/.test(id) ? await obtenerTramite(Number(id), sesion) : null;
  if (!tramite) notFound();

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoTramite tramite={tramite} ahora={new Date()} />
      <PasosTramite etapa={tramite.etapa} tipo={tramite.tipo} />
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <BloqueSolicitud tramite={tramite} />
        <div className="flex min-w-0 flex-col gap-6">
          <HistorialTramite tipo={tramite.tipo} eventos={tramite.eventos} />
          <AccionesSolicitud
            tramite={{ id: tramite.id, etapa: tramite.etapa, ronda: tramite.ronda }}
            acciones={tramite.acciones}
          />
        </div>
      </div>
    </div>
  );
}
