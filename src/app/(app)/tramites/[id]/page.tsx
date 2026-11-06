import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccionesGestion } from "@/componentes/tramites/AccionesGestion";
import { AccionesSolicitud } from "@/componentes/tramites/AccionesSolicitud";
import { BloqueSolicitud } from "@/componentes/tramites/BloqueSolicitud";
import { EnlaceActa } from "@/componentes/tramites/EnlaceActa";
import { EncabezadoTramite } from "@/componentes/tramites/EncabezadoTramite";
import { HistorialTramite } from "@/componentes/tramites/HistorialTramite";
import { PanelAceptacion } from "@/componentes/tramites/PanelAceptacion";
import { PanelAprobacion } from "@/componentes/tramites/PanelAprobacion";
import { PanelElaboracion } from "@/componentes/tramites/PanelElaboracion";
import { PanelPublicacion } from "@/componentes/tramites/PanelPublicacion";
import { PanelRevision } from "@/componentes/tramites/PanelRevision";
import { PasosTramite } from "@/componentes/tramites/PasosTramite";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import {
  contextoDeAceptacion,
  datosParaAceptar,
  datosParaGestionar,
  obtenerTramite,
  type DetalleTramite,
} from "@/db/consultas/tramites";
import { listarObservaciones, obtenerVerificacion } from "@/db/consultas/revision";
import { borradorDeTramite } from "@/db/consultas/tramites-archivos";
import { puedeVerVersion } from "@/lib/alcance";
import { exigirSesion } from "@/lib/paginas";
import { fechaEnZona, fechaLimite } from "@/lib/tramites/plazos";
import { esEtapaDeTrabajo, type Etapa } from "@/lib/tramites/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";

export const dynamic = "force-dynamic";
/** Desde la revisión, la lista y las observaciones se consultan; solo en `revision` se editan. */
const ETAPAS_CON_REVISION: Etapa[] = ["revision", "aprobacion", "publicacion"];

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
  // Desde la revisión las observaciones las pinta el panel de revisión: una sola vez.
  const [borrador, observaciones] = await Promise.all([
    borradorDeTramite(id),
    etapa === "elaboracion" ? listarObservaciones(id) : Promise.resolve([]),
  ]);
  return (
    <PanelElaboracion
      tramite={{ id, etapa, ronda, codigo, titulo, versionNumero }}
      borrador={borrador}
      observaciones={observaciones}
      editable={tramite.acciones.includes("enviar_a_revision")}
      pideCodigo={pideCodigo}
    />
  );
}

/** La revisión: editable para el revisor en revisión; después, y para los demás, solo lectura. */
async function Revision({ tramite, pideCodigo }: { tramite: DetalleTramite; pideCodigo: boolean }) {
  const { id, etapa, ronda, codigo, titulo, versionNumero } = tramite;
  const puedeRevisar = tramite.acciones.includes("concepto_favorable");
  const [respuestas, observaciones, borrador] = await Promise.all([
    obtenerVerificacion(id, ronda, { sinPropuesta: !puedeRevisar }),
    listarObservaciones(id),
    borradorDeTramite(id),
  ]);
  return (
    <PanelRevision
      tramite={{ id, etapa, ronda, codigo, titulo, versionNumero }}
      respuestas={respuestas}
      observaciones={observaciones}
      huella={borrador.archivos.find((a) => a.rol === "principal")?.hashSha256 ?? null}
      puedeRevisar={puedeRevisar}
      pideCodigo={pideCodigo}
    />
  );
}

/** Aprobar o publicar. En una eliminación la huella es la de la versión vigente que se retira. */
async function Cierre({ tramite, pideCodigo }: { tramite: DetalleTramite; pideCodigo: boolean }) {
  const { id, etapa, ronda, tipo, codigo, titulo, versionNumero, acciones, eventos } = tramite;
  const datos = { id, etapa, ronda, tipo, codigo, titulo, versionNumero };
  const { archivos } = await borradorDeTramite(id);
  const huella = archivos.find((a) => a.rol === "principal")?.hashSha256 ?? null;
  if (acciones.includes("publicar")) return <PanelPublicacion tramite={datos} huella={huella} pideCodigo={pideCodigo} />;
  const favorable = eventos.filter((e) => e.tipo === "concepto_favorable" && e.ronda === ronda).at(-1);
  const concepto = favorable?.detalle.concepto;
  return (
    <PanelAprobacion
      tramite={datos}
      acciones={acciones}
      revisado={typeof concepto === "string" ? { persona: favorable?.persona ?? null, concepto } : null}
      huella={huella}
      pideCodigo={pideCodigo}
    />
  );
}

/** Solo para quien gestiona: las listas de personas y tipos no se piden para nadie más. */
async function Gestion({ tramite: t }: { tramite: DetalleTramite }) {
  return (
    <AccionesGestion
      tramite={{
        id: t.id,
        etapa: t.etapa,
        ronda: t.ronda,
        tipo: t.tipo,
        codigo: t.codigo,
        titulo: t.titulo,
        tipoDocumentoId: t.tipoDocumentoId,
        solicitanteId: t.solicitanteId,
        elaboradorId: t.elaboradorId,
        revisorId: t.revisorId,
        aprobadorId: t.aprobadorId,
        elaborador: t.elaborador,
        revisor: t.revisor,
        aprobador: t.aprobador,
      }}
      datos={await datosParaGestionar(t.id)}
      hoy={fechaEnZona(new Date(), zonaHoraria())}
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

  const conRevision = conBorrador && ETAPAS_CON_REVISION.includes(tramite.etapa);
  const cierra = tramite.acciones.includes("aprobar") || tramite.acciones.includes("publicar");
  // El acta es de la versión: se ofrece a quien puede verla, que no siempre es quien ve el trámite.
  const claseActa = tramite.etapa === "publicado" ? "aprobacion" : tramite.etapa === "eliminado" ? "eliminacion" : null;
  const verActa = claseActa !== null && tramite.versionId !== null && (await puedeVerVersion(tramite.versionId, sesion));

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoTramite tramite={tramite} ahora={new Date()} />
      <PasosTramite etapa={tramite.etapa} tipo={tramite.tipo} />
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <div className="flex min-w-0 flex-col gap-6">
          <BloqueSolicitud tramite={tramite} />
          {verActa && claseActa ? (
            <section aria-label="Acta" className="rounded-xl border border-border bg-card p-4 text-sm shadow-xs">
              <EnlaceActa tramiteId={tramite.id} clase={claseActa} />
              <p className="mt-1 text-xs text-muted-foreground">
                El registro de quién firmó, cuándo y sobre qué archivo (huella). Se guarda con la versión.
              </p>
            </section>
          ) : null}
          {conBorrador ? <Borrador tramite={tramite} pideCodigo={sesion.totpActivo} /> : null}
          {conRevision ? <Revision tramite={tramite} pideCodigo={sesion.totpActivo} /> : null}
          {cierra ? <Cierre tramite={tramite} pideCodigo={sesion.totpActivo} /> : null}
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <HistorialTramite tipo={tramite.tipo} eventos={tramite.eventos} />
          <AccionesSolicitud
            tramite={{ id: tramite.id, etapa: tramite.etapa, ronda: tramite.ronda }}
            acciones={tramite.acciones}
          />
          {tramite.acciones.includes("cancelar") ? <Gestion tramite={tramite} /> : null}
        </div>
      </div>
      {tramite.acciones.includes("aceptar") ? <Aceptacion tramite={tramite} usuarioId={sesion.usuarioId} /> : null}
    </div>
  );
}
