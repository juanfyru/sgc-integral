import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { fechaDeJornada } from "@/componentes/distribucion/socializaciones/TablaJornadas";
import { claseBoton } from "@/componentes/ui/Boton";
import { AccionesGestion } from "@/componentes/tramites/AccionesGestion";
import { AccionesSolicitud } from "@/componentes/tramites/AccionesSolicitud";
import { BloqueSolicitud } from "@/componentes/tramites/BloqueSolicitud";
import { EnlaceActa } from "@/componentes/tramites/EnlaceActa";
import { EncabezadoTramite } from "@/componentes/tramites/EncabezadoTramite";
import { EvidenciaRevision } from "@/componentes/tramites/EvidenciaRevision";
import { HistorialTramite } from "@/componentes/tramites/HistorialTramite";
import { PanelAceptacion } from "@/componentes/tramites/PanelAceptacion";
import { PanelAprobacion } from "@/componentes/tramites/PanelAprobacion";
import { PanelElaboracion } from "@/componentes/tramites/PanelElaboracion";
import { PanelPublicacion } from "@/componentes/tramites/PanelPublicacion";
import { PanelRevision } from "@/componentes/tramites/PanelRevision";
import { PasosTramite } from "@/componentes/tramites/PasosTramite";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import { acusesDeVersion } from "@/db/consultas/distribucion/acuses";
import { copiasDeDocumento } from "@/db/consultas/distribucion/copias";
import { socializacionDeVersion } from "@/db/consultas/distribucion/jornadas";
import { hayDistribucion, ResumenDistribucion } from "@/componentes/tramites/ResumenDistribucion";
import {
  contextoDeAceptacion,
  datosParaAceptar,
  datosParaGestionar,
  obtenerTramite,
  type DetalleTramite,
} from "@/db/consultas/tramites";
import { criteriosNoCumplen, listarItemsVerificacion, listarObservaciones, listarRondasVerificacion, obtenerVerificacion } from "@/db/consultas/revision";
import { borradorDeTramite } from "@/db/consultas/tramites-archivos";
import { huellaDeCriterios } from "@/lib/tramites/criterios";
import { exigirSesion } from "@/lib/paginas";
import { puede } from "@/lib/permisos";
import { fechaEnZona, fechaLimite } from "@/lib/tramites/plazos";
import { esEtapaDeTrabajo, type Etapa } from "@/lib/tramites/tipos";
import type { SesionValida } from "@/lib/sesion";
import { zonaHoraria } from "@/lib/zona-horaria";

export const dynamic = "force-dynamic";
/** Desde la revisión, la lista y las observaciones se consultan; solo el revisor, en `revision`, las edita. */
const ETAPAS_CON_REVISION: Etapa[] = ["revision", "aprobacion", "publicacion"];

/**
 * Quien no puede ver el trámite recibe lo mismo que si no existiera. La piden el título y la página:
 * una sola lectura por petición.
 */
const tramiteVisible = cache(async (id: string) => {
  const sesion = await exigirSesion();
  return /^\d{1,15}$/.test(id) ? obtenerTramite(Number(id), sesion) : null;
});

/**
 * El HTTP de un `notFound()` aquí es 200: el `loading.tsx` de `(app)` ya empezó a transmitir. Lo que
 * sí se controla es lo que se lee: ni el contenido ni el título dicen si el trámite existe.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const tramite = await tramiteVisible((await params).id);
  return { title: tramite ? "Trámite" : "Página no encontrada" };
}

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
  // Desde la revisión, la lista y las observaciones las pinta el panel de revisión: una sola vez.
  const [borrador, observaciones, rondas] = await Promise.all([
    borradorDeTramite(id),
    etapa === "elaboracion" ? listarObservaciones(id) : Promise.resolve([]),
    etapa === "elaboracion" && ronda > 1 ? listarRondasVerificacion(id) : Promise.resolve([]),
  ]);
  return (
    <PanelElaboracion
      tramite={{ id, etapa, ronda, codigo, titulo, versionNumero }}
      borrador={borrador}
      observaciones={observaciones}
      rondaAnterior={rondas[0] ?? null}
      editable={tramite.acciones.includes("enviar_a_revision")}
      pideCodigo={pideCodigo}
    />
  );
}

/** La revisión: editable para el revisor en revisión; después, y para los demás, se consulta. */
async function Revision({ tramite, pideCodigo }: { tramite: DetalleTramite; pideCodigo: boolean }) {
  const { id, etapa, ronda, codigo, titulo, versionNumero } = tramite;
  if (!tramite.acciones.includes("concepto_favorable")) {
    return <Evidencia tramite={tramite} rondaEnCurso={etapa === "revision" ? ronda : null} />;
  }
  const [respuestas, activos, rondas, observaciones, borrador, criterios] = await Promise.all([
    obtenerVerificacion(id, ronda),
    listarItemsVerificacion({ soloActivos: true }),
    listarRondasVerificacion(id),
    listarObservaciones(id),
    borradorDeTramite(id),
    criteriosNoCumplen(id, ronda),
  ]);
  return (
    <PanelRevision
      tramite={{ id, etapa, ronda, codigo, titulo, versionNumero }}
      respuestas={respuestas}
      hayItemsActivos={activos.length > 0}
      propuesta={respuestas.length > 0 && rondas.length > 0 && rondas[0].ronda !== ronda}
      observaciones={observaciones}
      huella={borrador.archivos.find((a) => a.rol === "principal")?.hashSha256 ?? null}
      pideCodigo={pideCodigo}
      criterios={criterios}
      huellaCriterios={huellaDeCriterios(criterios)}
      criticosActuales={activos.filter((i) => i.critico).map((i) => i.id)}
    />
  );
}

/** Lo que se respondió y se observó, en solo lectura. Sigue en la página cuando el trámite se cierra (spec 13A §6.5). */
async function Evidencia({ tramite: { id, etapa, ronda }, rondaEnCurso = null }: { tramite: DetalleTramite; rondaEnCurso?: number | null }) {
  const [rondas, observaciones] = await Promise.all([listarRondasVerificacion(id), listarObservaciones(id)]);
  return <EvidenciaRevision tramite={{ id, etapa, ronda }} rondas={rondas} observaciones={observaciones} rondaEnCurso={rondaEnCurso} />;
}

/** Aprobar o publicar. En una eliminación la huella es la de la versión vigente que se retira. */
async function Cierre({ tramite, pideCodigo }: { tramite: DetalleTramite; pideCodigo: boolean }) {
  const { id, etapa, ronda, tipo, codigo, titulo, versionNumero, acciones, eventos } = tramite;
  const datos = { id, etapa, ronda, tipo, codigo, titulo, versionNumero };
  // Una eliminación no pasa por la lista de verificación: no hay criterios que confirmar.
  const [{ archivos }, criterios] = await Promise.all([
    borradorDeTramite(id),
    tipo === "eliminar" ? Promise.resolve([]) : criteriosNoCumplen(id, ronda),
  ]);
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
      criterios={criterios}
      huellaCriterios={huellaDeCriterios(criterios)}
    />
  );
}

/** Lo que pasó con la socialización que el trámite pidió al publicar: pendiente, cumplida por una jornada o superada. */
async function Socializacion({ versionId, puedeRegistrar }: { versionId: number; puedeRegistrar: boolean }) {
  const s = await socializacionDeVersion(versionId);
  if (!s.requerida) return null;
  const estado = s.cumplida
    ? `Cumplida: jornada del ${fechaDeJornada(s.cumplida.fecha)}, ${s.cumplida.asistentes === 1 ? "1 asistente" : `${s.cumplida.asistentes} asistentes`}.`
    : s.superada
      ? "No se registró antes de que llegara una versión nueva."
      : `Pendiente${s.venceEn ? `: vence el ${new Intl.DateTimeFormat("es-CO", { dateStyle: "long", timeZone: zonaHoraria() }).format(s.venceEn)}` : ""}.`;
  return (
    <section aria-label="Socialización" className="rounded-xl border border-border bg-card p-4 text-sm shadow-xs">
      <h2 className="mb-1 text-sm font-semibold">Socialización</h2>
      <p>{estado}</p>
      {!s.cumplida && !s.superada && puedeRegistrar ? (
        <Link href={`/distribucion/socializaciones/nueva?version=${versionId}`} className={`${claseBoton("secundario")} mt-2`}>
          Registrar socialización
        </Link>
      ) : null}
    </section>
  );
}

/** Cómo va la distribución de la versión publicada por el trámite; las copias solo si la persona ve la distribución. */
async function DistribucionDelTramite({ tramite, sesion }: { tramite: DetalleTramite; sesion: SesionValida }) {
  if (!hayDistribucion(tramite) || tramite.versionId === null || tramite.versionNumero === null || tramite.documentoId === null || tramite.codigo === null) return null;
  const verCopias = puede(sesion, "distribucion.ver") || puede(sesion, "copias.emitir");
  const [acuses, copias] = await Promise.all([
    acusesDeVersion(tramite.versionId),
    verCopias ? copiasDeDocumento(tramite.documentoId, sesion) : Promise.resolve(null),
  ]);
  const deLaVersion = copias ? copias.vigentes.filter((c) => c.versionId === tramite.versionId) : [];
  return (
    <ResumenDistribucion
      version={tramite.versionNumero}
      enlace={
        puede(sesion, "documentos.administrar")
          ? `/admin/documentos/${tramite.codigo.toLowerCase()}`
          : `/documentos/${tramite.codigo.toLowerCase()}`
      }
      acuses={acuses}
      copias={
        copias
          ? {
              sinRecibir: deLaVersion.filter((c) => c.estado === "emitida").length,
              recibidas: deLaVersion.filter((c) => c.estado === "recibida").length,
              porRecoger: copias.porRecoger.filter((c) => c.versionId !== tramite.versionId).length,
            }
          : null
      }
    />
  );
}

/** Solo para quien gestiona: las listas de personas y tipos no se piden para nadie más. */
async function Gestion({ tramite: t, puedeMarcar }: { tramite: DetalleTramite; puedeMarcar: boolean }) {
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
        procesoId: t.procesoId,
        subprocesoId: t.subprocesoId,
        solicitanteId: t.solicitanteId,
        elaboradorId: t.elaboradorId,
        revisorId: t.revisorId,
        aprobadorId: t.aprobadorId,
        elaborador: t.elaborador,
        revisor: t.revisor,
        aprobador: t.aprobador,
        requiereSocializacion: t.requiereSocializacion,
      }}
      datos={await datosParaGestionar(t.id)}
      hoy={fechaEnZona(new Date(), zonaHoraria())}
      puedeMarcar={puedeMarcar}
    />
  );
}

export default async function PaginaTramite({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await exigirSesion();
  const { id } = await params;
  const tramite = await tramiteVisible(id);
  if (!tramite) notFound();
  // Una eliminación tiene por versión la vigente: no hay borrador. Al cerrarse, los archivos se
  // consultan por la ficha o por el panel, según el estado de su versión (spec 13A §6.5).
  const conBorrador = tramite.versionId !== null && tramite.tipo !== "eliminar" && esEtapaDeTrabajo(tramite.etapa);

  const conRevision = conBorrador && ETAPAS_CON_REVISION.includes(tramite.etapa);
  const cierra = tramite.acciones.includes("aprobar") || tramite.acciones.includes("publicar");
  // El acta es del trámite cerrado: quien llegó hasta aquí ya lo ve, aunque no vea la versión.
  const claseActa = tramite.etapa === "publicado" ? "aprobacion" : tramite.etapa === "eliminado" ? "eliminacion" : null;
  const verActa = claseActa !== null && tramite.versionId !== null;

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
          {tramite.etapa === "publicado" && tramite.requiereSocializacion && tramite.versionId !== null ? (
            <Socializacion versionId={tramite.versionId} puedeRegistrar={puede(sesion, "socializaciones.registrar")} />
          ) : null}
          {tramite.etapa === "publicado" ? <DistribucionDelTramite tramite={tramite} sesion={sesion} /> : null}
          {conBorrador ? <Borrador tramite={tramite} pideCodigo={sesion.totpActivo} /> : null}
          {conRevision ? <Revision tramite={tramite} pideCodigo={sesion.totpActivo} /> : null}
          {cierra ? <Cierre tramite={tramite} pideCodigo={sesion.totpActivo} /> : null}
          {esEtapaDeTrabajo(tramite.etapa) ? null : <Evidencia tramite={tramite} />}
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <HistorialTramite tipo={tramite.tipo} eventos={tramite.eventos} />
          <AccionesSolicitud
            tramite={{ id: tramite.id, etapa: tramite.etapa, ronda: tramite.ronda }}
            acciones={tramite.acciones}
          />
          {tramite.acciones.includes("cancelar") ? <Gestion tramite={tramite} puedeMarcar={puede(sesion, "distribucion.gestionar")} /> : null}
        </div>
      </div>
      {tramite.acciones.includes("aceptar") ? <Aceptacion tramite={tramite} usuarioId={sesion.usuarioId} /> : null}
    </div>
  );
}
