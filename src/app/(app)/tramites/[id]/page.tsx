import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccionesSolicitud } from "@/componentes/tramites/AccionesSolicitud";
import { BloqueSolicitud } from "@/componentes/tramites/BloqueSolicitud";
import { EncabezadoTramite } from "@/componentes/tramites/EncabezadoTramite";
import { HistorialTramite } from "@/componentes/tramites/HistorialTramite";
import { PanelAceptacion } from "@/componentes/tramites/PanelAceptacion";
import { PanelElaboracion } from "@/componentes/tramites/PanelElaboracion";
import { PasosTramite } from "@/componentes/tramites/PasosTramite";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import {
  contextoDeAceptacion,
  datosParaAceptar,
  obtenerTramite,
  type DetalleTramite,
} from "@/db/consultas/tramites";
import { borradorDeTramite } from "@/db/consultas/tramites-archivos";
import { exigirSesion } from "@/lib/paginas";
import { fechaEnZona, fechaLimite } from "@/lib/tramites/plazos";
import { esEtapaDeTrabajo } from "@/lib/tramites/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Trámite" };

async function Aceptacion({ tramite, usuarioId }: { tramite: DetalleTramite; usuarioId: number }) {
  const [datos, contexto, { plazos }] = await Promise.all([
    datosParaAceptar(tramite.id),
    contextoDeAceptacion(tramite),
    obtenerConfigDocumental(),
  ]);
  const ahora = new Date();
  const zona = zonaHoraria();
  const { id, etapa, ronda, tipo, solicitanteId, procesoId, subprocesoId, tipoDocumentoId, tituloPropuesto, codigo, titulo, procesoNombre } = tramite;
  return (
    <PanelAceptacion
      tramite={{ id, etapa, ronda, tipo, solicitanteId, procesoId, subprocesoId, tipoDocumentoId, tituloPropuesto, codigo, titulo, procesoNombre }}
      datos={datos}
      contexto={contexto}
      usuarioId={usuarioId}
      plazos={{ revision: plazos.revision, aprobacion: plazos.aprobacion }}
      hoy={fechaEnZona(ahora, zona)}
      venceSugerida={fechaEnZona(fechaLimite(ahora, plazos.elaboracion, zona), zona)}
    />
  );
}

/** El bloque del borrador, abierto solo para quien puede enviarlo a revisión. */
async function Borrador({ tramite, pideCodigo }: { tramite: DetalleTramite; pideCodigo: boolean }) {
  const { id, etapa, ronda, codigo, titulo, versionNumero } = tramite;
  return (
    <PanelElaboracion
      tramite={{ id, etapa, ronda, codigo, titulo, versionNumero }}
      borrador={await borradorDeTramite(id)}
      editable={tramite.acciones.includes("enviar_a_revision")}
      pideCodigo={pideCodigo}
    />
  );
}

export default async function PaginaTramite({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await exigirSesion();
  const { id } = await params;
  // Quien no puede ver el trámite recibe lo mismo que si no existiera.
  const tramite = /^\d{1,15}$/.test(id) ? await obtenerTramite(Number(id), sesion) : null;
  if (!tramite) notFound();
  // Una eliminación tiene por versión la vigente: no hay borrador. Al cerrarse, los archivos se
  // consultan por la ficha o por el panel, según el estado de su versión (spec 13A §6.5).
  const conBorrador = tramite.versionId !== null && tramite.tipo !== "eliminar" && esEtapaDeTrabajo(tramite.etapa);

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoTramite tramite={tramite} ahora={new Date()} />
      <PasosTramite etapa={tramite.etapa} tipo={tramite.tipo} />
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <div className="flex min-w-0 flex-col gap-6">
          <BloqueSolicitud tramite={tramite} />
          {conBorrador ? <Borrador tramite={tramite} pideCodigo={sesion.totpActivo} /> : null}
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <HistorialTramite tipo={tramite.tipo} eventos={tramite.eventos} />
          <AccionesSolicitud
            tramite={{ id: tramite.id, etapa: tramite.etapa, ronda: tramite.ronda }}
            acciones={tramite.acciones}
          />
        </div>
      </div>
      {tramite.acciones.includes("aceptar") ? <Aceptacion tramite={tramite} usuarioId={sesion.usuarioId} /> : null}
    </div>
  );
}
