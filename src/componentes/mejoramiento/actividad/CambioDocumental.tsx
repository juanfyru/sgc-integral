import Link from "next/link";
import { claseBoton } from "@/componentes/ui/Boton";
import { Insignia, type VarianteInsignia } from "@/componentes/ui/Insignia";
import type { TramiteEnlazado } from "@/db/consultas/mejoramiento/tramites-enlace";
import { PIDALO_AL_LIDER } from "@/lib/mejoramiento/enganches";
import { fechaDeDia } from "@/lib/mejoramiento/formato";
import { rutaDeEnlazarTramite, rutaDePedirTramite } from "@/lib/mejoramiento/rutas";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { ETIQUETA_ETAPA, ETIQUETA_TIPO_SOLICITUD, type Etapa, type TipoSolicitud } from "@/lib/tramites/tipos";
import type { AccionDelPaso } from "../pasos/Partes";
import { BotonDelEnlace } from "./BotonDelEnlace";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";
const CAJA = "flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-4";

/** El estado del trámite en una insignia (con su texto siempre): terminado bien con su fecha, terminado mal, o en qué etapa va. */
function estadoDelTramite(t: TramiteEnlazado, zona: string): { texto: string; variante: VarianteInsignia } {
  const etapa = t.etapa as Etapa;
  const cuando = t.terminoEn ? ` el ${fechaDeDia(fechaEnZona(t.terminoEn, zona))}` : "";
  if (t.terminoBien) return { texto: `${ETIQUETA_ETAPA[etapa] ?? t.etapa}${cuando}`, variante: "bien" };
  if (t.terminoEn) return { texto: ETIQUETA_ETAPA[etapa] ?? t.etapa, variante: "sin-dato" };
  return { texto: `En ${(ETIQUETA_ETAPA[etapa] ?? t.etapa).toLowerCase()}`, variante: "neutra" };
}

/** Lo que dice el trámite de la actividad como evidencia (anexo §9.4): vale, ya no vale (terminó antes de la devolución) o no vale. */
function comoEvidencia(t: TramiteEnlazado, devueltaEn: Date | null): string | null {
  if (t.terminoBien) {
    return devueltaEn && t.terminoEn && t.terminoEn <= devueltaEn
      ? "Terminó antes de la devolución: no vale como evidencia de lo corregido."
      : "Vale como evidencia de esta actividad.";
  }
  return t.terminoEn ? "Queda como historia; no vale como evidencia." : null;
}

/**
 * Los trámites enlazados a una actividad (anexo §9.4 y §9.7), cada uno con su tipo, su documento y su estado: el documento se nombra y
 * se enlaza solo a quien ve el trámite (`visible`); a los demás, «un documento», sin número ni enlace. Con `quitar`, «Quitar el enlace»
 * en los que quien mira puede quitar (`seQuita`). La usan la página de la actividad y la verificación de la implementación.
 */
export function ListaDeTramites({
  tramites,
  devueltaEn = null,
  zona,
  quitar,
}: {
  tramites: readonly TramiteEnlazado[];
  devueltaEn?: Date | null;
  zona: string;
  quitar?: AccionDelPaso;
}) {
  if (tramites.length === 0) return null;
  return (
    <ul className="flex list-none flex-col gap-2">
      {tramites.map((t) => {
        const estado = estadoDelTramite(t, zona);
        const nota = comoEvidencia(t, devueltaEn);
        return (
          <li key={t.enlaceId} className="flex min-w-0 flex-col gap-1 border-l-2 border-mod-planes pl-3 text-sm">
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-semibold">{ETIQUETA_TIPO_SOLICITUD[t.tipo as TipoSolicitud] ?? t.tipo}</span>
              {t.visible && t.documento ? (
                <Link href={`/tramites/${t.tramiteId}`} className={`min-w-0 break-words rounded-sm text-marca underline-offset-2 hover:underline ${FOCO}`}>
                  {t.documento}
                </Link>
              ) : (
                <span className="text-muted-foreground">un documento</span>
              )}
              <Insignia variante={estado.variante}>{estado.texto}</Insignia>
            </span>
            <span className="text-xs text-muted-foreground">
              {[nota, t.origen === "pedido" ? "Pedido desde esta actividad." : "Enlazado a esta actividad."].filter(Boolean).join(" ")}
            </span>
            {quitar && t.seQuita ? (
              <BotonDelEnlace
                ocultos={{ enlaceId: t.enlaceId }}
                texto="Quitar el enlace"
                enviando="Quitando…"
                etiqueta={t.visible && t.documento ? `Quitar el enlace con ${t.documento}` : "Quitar el enlace de este trámite"}
                accion={quitar}
                variante="fantasma"
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * «Cambio documental» en la página de una actividad (anexo §9.2 a §9.4, maqueta 7): sus trámites y, a quien puede pedirlos (ve la
 * actividad, tiene `tramites.solicitar` y la actividad lo admite), «Pedir cambio documental» y «Enlazar un trámite que ya existe»; a
 * quien la ve y no puede, mientras la actividad lo admita, a quién pedírselo. Sin trámites y sin nada que pedir, no aparece.
 */
export function CambioDocumental({
  actividadId,
  tramites,
  admite,
  puedePedir,
  devueltaEn,
  zona,
  quitar,
}: {
  actividadId: number;
  tramites: readonly TramiteEnlazado[];
  admite: boolean;
  puedePedir: boolean;
  devueltaEn: Date | null;
  zona: string;
  quitar: AccionDelPaso;
}) {
  if (tramites.length === 0 && !admite) return null;
  return (
    <section aria-labelledby={`cambio-documental-${actividadId}`} className={CAJA}>
      <h2 id={`cambio-documental-${actividadId}`} className="font-display text-base font-semibold">
        Cambio documental
      </h2>
      {tramites.length > 0 ? (
        <ListaDeTramites tramites={tramites} devueltaEn={devueltaEn} zona={zona} quitar={quitar} />
      ) : (
        <p className="text-sm text-muted-foreground">Ningún trámite documental atiende esta actividad.</p>
      )}
      {puedePedir ? (
        <>
          <div className="flex flex-wrap gap-2">
            <Link href={rutaDePedirTramite(actividadId)} className={claseBoton("primario")}>
              Pedir cambio documental
            </Link>
            <Link href={rutaDeEnlazarTramite(actividadId)} className={claseBoton("secundario")}>
              Enlazar un trámite que ya existe
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">
            Una actividad puede tener varios trámites. Uno que termine publicado o eliminado vale como evidencia para terminarla.
          </p>
        </>
      ) : admite ? (
        <p className="text-sm">{`¿La actividad pide un cambio en un documento? ${PIDALO_AL_LIDER}.`}</p>
      ) : null}
    </section>
  );
}

/**
 * Lo que comprueba el cierre con los trámites de la ronda (anexo §9.6, maqueta 7): qué cambios pidió el análisis y los trámites
 * enlazados que terminaron bien. Si solo pidió documentos y hay alguno, no hace falta decir cómo se atendieron. La pinta la página del
 * hallazgo para quien cierra (el Admin SGC, que ve todo trámite).
 */
export function TramitesDelCierre({
  cambios,
  tramites,
  exige,
}: {
  /** Los cambios que pidió el análisis, en palabras («documentos, matriz de riesgos»). */
  cambios: string;
  tramites: ReadonlyArray<{ tramiteId: number; documento: string | null }>;
  /** Si el cierre exige decir cómo se atendieron (`exigeComoSeAtendieron`). */
  exige: boolean;
}) {
  const n = tramites.length;
  const documentos = tramites.map((t) => t.documento).filter((d): d is string => d !== null);
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-md border border-linea-suave bg-muted p-3 text-sm">
      <p>{`El análisis pidió cambios en ${cambios}.`}</p>
      {n > 0 ? (
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <Insignia variante="bien">{n === 1 ? "1 trámite terminó bien" : `${n} trámites terminaron bien`}</Insignia>
          {documentos.length > 0 ? <span className="break-words">{documentos.join(", ")}</span> : null}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {exige
          ? n > 0
            ? "Diga cómo se atendieron los cambios que no atiende un trámite."
            : "Ningún trámite enlazado terminó bien: diga cómo se atendieron los cambios."
          : "Los trámites atienden los cambios en documentos: no hace falta decir cómo se atendieron."}
      </p>
    </div>
  );
}
