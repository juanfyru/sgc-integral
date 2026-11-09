import Link from "next/link";
import { claseBoton } from "@/componentes/ui/Boton";
import { TablaDatos, celda, celdaNumerica, type ColumnaTabla } from "@/componentes/ui/TablaDatos";
import { accionesDeFila } from "@/db/consultas/vigencia/semaforo";
import type { DocumentoDeRevision } from "@/db/consultas/vigencia/revision-anual";
import type { ExternoVerificable } from "@/db/consultas/vigencia/externos";
import { enAlcance, type Alcance, type SujetoVisibilidad } from "@/lib/alcance";
import { ETIQUETA_ETAPA, esEtapaDeTrabajo, type Etapa } from "@/lib/tramites/tipos";
import { sumarMeses, textoFecha } from "@/lib/vigencia/plazo";
import { textoUltimaRevision } from "@/lib/vigencia/semaforo";
import type { Decision } from "@/lib/vigencia/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { ChipVigencia } from "../ChipVigencia";
import { DialogoRatificar } from "../DialogoRatificar";
import { lineaDeTipo, rotuloVersion } from "../TablaSemaforo";
import { DialogoVerificar, EnlazarTramite } from "./AccionesDecision";

/** Lo que la persona puede hacer sobre un documento de la revisión (spec 13C §9.3); todo falso si no decide. */
export type AccionesDecision = {
  /** El proceso es suyo, la revisión está abierta y el documento está por decidir. */
  decidir: boolean;
  /** Interno: «Ratificar» abre el diálogo de la ratificación. */
  ratificar: boolean;
  /** Interno: «Actualizar» y «Eliminar» abren la solicitud prellenada. */
  solicitar: boolean;
  /** Interno con un trámite en curso que no es su decisión: se enlaza en vez de abrir otro. */
  enlazar: { id: number; numero: string } | null;
  /** Externo que la persona puede verificar: «Ratificar» es la verificación «sigue vigente». */
  verificar: ExternoVerificable | null;
  /** El número del trámite se enlaza a su página (Admin SGC y líder del proceso); a los demás se les dice. */
  verTramite: boolean;
};

export type FilaDecision = DocumentoDeRevision & { acciones: AccionesDecision };

const SIN_ACCIONES: AccionesDecision = { decidir: false, ratificar: false, solicitar: false, enlazar: null, verificar: null, verTramite: false };

/**
 * Las acciones de una fila (resoluciones 2, 5 y 6 de la Tarea 11): los botones salen con `puedeDecidir` del proceso y
 * `porDecidir` del documento. En un interno, si tiene un trámite en curso que no es su decisión, solo se ofrece
 * enlazarlo (ratificar o pedir otra solicitud no procederían); en un externo, solo a quien puede verificarlo.
 */
export function accionesDeDecision(
  sujeto: SujetoVisibilidad,
  fila: DocumentoDeRevision,
  d: { puedeDecidir: boolean; alcance: Alcance; verificable: ExternoVerificable | null },
): AccionesDecision {
  const semaforo = accionesDeFila(sujeto, fila, d.alcance);
  const verTramite = sujeto.rol === "admin_sgc" || (sujeto.rol === "lider_proceso" && enAlcance(d.alcance, fila.proceso.id));
  if (!d.puedeDecidir || !fila.porDecidir) return { ...SIN_ACCIONES, verTramite };
  if (fila.origen === "externo") return { ...SIN_ACCIONES, decidir: true, verificar: d.verificable, verTramite };
  const enCurso = fila.tramite && fila.tramite.id !== fila.decision?.tramite?.id ? { id: fila.tramite.id, numero: fila.tramite.numero } : null;
  return {
    decidir: true,
    ratificar: enCurso === null && semaforo.ratificar,
    solicitar: enCurso === null && semaforo.solicitar,
    enlazar: enCurso,
    verificar: null,
    verTramite,
  };
}

/** «/tramites/nueva» con el documento, el tipo, el motivo «revisión anual» y el enlace a la revisión (resolución 6). */
export function rutaDeSolicitud(codigo: string, tipo: "modificar" | "eliminar", revisionId: number): string {
  return `/tramites/nueva?documento=${encodeURIComponent(codigo)}&tipo=${tipo}&motivo=revision_anual&revision=${revisionId}`;
}

/** La página del externo con la verificación abierta en ese resultado (resolución 5). */
export function rutaDeVerificacion(documentoId: number, resultado: "edicion_nueva" | "retirado"): string {
  return `/vigencia/externos/${documentoId}?verificar=${resultado}`;
}

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/** Cómo dice la tabla cada decisión ya tomada; la pendiente de una revisión abierta es «Pendiente» (resolución 1). */
const VERBO: Record<Decision, string> = {
  ratificar: "Ratificado",
  actualizar: "Actualizar",
  eliminar: "Eliminar",
  reciente: "Revisado recientemente",
  en_tramite: "En trámite",
  sin_revisar: "Sin revisar",
};

/** «en elaboración» mientras el trámite está en curso; «· Cancelado», «· Publicado» cuando ya se cerró. */
function textoEtapa(etapa: Etapa): string {
  return esEtapaDeTrabajo(etapa) ? `en ${ETIQUETA_ETAPA[etapa].toLowerCase()}` : `· ${ETIQUETA_ETAPA[etapa]}`;
}

function Tramite({ tramite, enlazar }: { tramite: { id: number; numero: string; etapa: Etapa }; enlazar: boolean }) {
  return (
    <>
      {" · "}
      {enlazar ? (
        <Link href={`/tramites/${tramite.id}`} className={`rounded underline underline-offset-2 ${FOCO}`}>
          {tramite.numero}
        </Link>
      ) : (
        tramite.numero
      )}
      {` ${textoEtapa(tramite.etapa)}`}
    </>
  );
}

/** La decisión que tiene el documento, en texto; con su trámite, quién y cuándo. */
function TextoDecision({ fila: f, zona, verTramite }: { fila: DocumentoDeRevision; zona: string; verTramite: boolean }) {
  const d = f.decision;
  if (!d) return <span className="font-medium">Pendiente</span>;
  const externo = f.origen === "externo";
  let detalle = "";
  if (externo && d.verificacionId !== null && d.decision === "ratificar") detalle = " · verificación «sigue vigente»";
  if (externo && d.verificacionId !== null && d.decision === "actualizar") detalle = " · verificación «hay una edición nueva»";
  const quien =
    d.decision === "reciente" && f.ultimaRevision
      ? `${textoUltimaRevision(f.ultimaRevision)} · ${textoFecha(f.ultimaRevision.fecha, zona)}`
      : d.por
        ? `${d.por} · ${textoFecha(d.en, zona)}`
        : null;
  return (
    <>
      <div>
        <span className="font-medium">{VERBO[d.decision]}</span>
        {detalle}
        {d.tramite ? <Tramite tramite={d.tramite} enlazar={verTramite} /> : null}
      </div>
      {quien ? <div className="text-xs text-muted-foreground">{quien}</div> : null}
    </>
  );
}

function Decidir({
  fila: f,
  revisionId,
  ahora,
  zona,
  pideCodigo,
  volver,
}: {
  fila: FilaDecision;
  revisionId: number;
  ahora: Date;
  zona: string;
  pideCodigo: boolean;
  volver: string;
}) {
  const a = f.acciones;
  const boton = `${claseBoton("secundario", "sm")} ${FOCO}`;
  if (a.enlazar) return <EnlazarTramite revisionId={revisionId} documentoId={f.documentoId} tramite={a.enlazar} />;
  if (f.origen === "externo") {
    if (!a.verificar) return <span className="text-xs text-muted-foreground">Lo decide quien verifica el externo</span>;
    return (
      <div className="flex flex-wrap items-center gap-2">
        <DialogoVerificar codigo={f.codigo} documentoId={f.documentoId} externo={a.verificar} volver={volver} />
        <Link href={rutaDeVerificacion(f.documentoId, "edicion_nueva")} aria-label={`Actualizar ${f.codigo}: verificar que hay una edición nueva`} className={boton}>
          Actualizar
        </Link>
        <Link href={rutaDeVerificacion(f.documentoId, "retirado")} aria-label={`Eliminar ${f.codigo}: verificar que fue retirado o derogado`} className={boton}>
          Eliminar
        </Link>
      </div>
    );
  }
  if (!a.ratificar && !a.solicitar) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {a.ratificar ? (
        <DialogoRatificar
          documento={{ id: f.documentoId, codigo: f.codigo, titulo: f.titulo, version: f.version.numero, huella: f.huella }}
          proximaRevision={textoFecha(sumarMeses(ahora, f.mesesRevision, zona), zona)}
          pideCodigo={pideCodigo}
          volver={volver}
        />
      ) : null}
      {a.solicitar ? (
        <>
          <Link href={rutaDeSolicitud(f.codigo, "modificar", revisionId)} aria-label={`Actualizar ${f.codigo}: pedir su modificación`} className={boton}>
            Actualizar
          </Link>
          <Link href={rutaDeSolicitud(f.codigo, "eliminar", revisionId)} aria-label={`Eliminar ${f.codigo}: pedir su eliminación`} className={boton}>
            Eliminar
          </Link>
        </>
      ) : null}
    </div>
  );
}

function CeldaDecision(props: { fila: FilaDecision; revisionId: number; ahora: Date; zona: string; pideCodigo: boolean; volver: string }) {
  const f = props.fila;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {/* Quien decide ve los botones; un pendiente por un trámite que murió muestra además lo que se había decidido. */}
      {!f.acciones.decidir || f.decision ? (
        <div>
          <TextoDecision fila={f} zona={props.zona} verTramite={f.acciones.verTramite} />
        </div>
      ) : null}
      {f.acciones.decidir ? <Decidir {...props} /> : null}
    </div>
  );
}

function Documento({ fila: f }: { fila: DocumentoDeRevision }) {
  return (
    <>
      <div>
        <Link href={`/documentos/${encodeURIComponent(f.codigo.toLowerCase())}`} className={`rounded font-mono text-xs font-medium hover:underline ${FOCO}`}>
          {`${f.codigo} ${rotuloVersion(f)}`}
        </Link>
      </div>
      <div>{f.titulo}</div>
      <div className="text-xs text-muted-foreground">{lineaDeTipo(f)}</div>
    </>
  );
}

const textoAcuses = (a: DocumentoDeRevision["insumos"]["acuses"]) =>
  a ? `${a.confirmados} de ${a.total}${a.porcentaje === null ? "" : ` (${a.porcentaje} %)`}` : "—";
const textoNormas = (normas: string[]) => (normas.length === 0 ? "—" : normas.join(", "));

/**
 * La tabla de decisiones de un proceso (maqueta 5): cada documento con su vigencia, sus insumos y su decisión o los
 * botones para tomarla. Tabla desde 1024 px; por debajo, una tarjeta por documento (también se decide en el celular).
 */
export function TablaDecisiones({
  titulo,
  filas,
  revision,
  ahora,
  pideCodigo,
  volver,
}: {
  titulo: string;
  filas: FilaDecision[];
  revision: { id: number; anio: number };
  ahora: Date;
  pideCodigo: boolean;
  /** La página a la que vuelven ratificar y verificar: la misma tabla. */
  volver: string;
}) {
  const zona = zonaHoraria();
  const columnas: readonly ColumnaTabla[] = [
    { clave: "documento", etiqueta: "Documento" },
    { clave: "vigencia", etiqueta: "Vigencia" },
    { clave: "acuses", etiqueta: "Acuses v. vigente" },
    { clave: "hallazgos", etiqueta: "Hallazgos", numerica: true },
    { clave: "normas", etiqueta: "Normas cambiadas" },
    { clave: "consultas", etiqueta: `Consultas ${revision.anio}`, numerica: true },
    { clave: "tramites", etiqueta: `Trámites ${revision.anio}`, numerica: true },
    { clave: "decision", etiqueta: "Decisión" },
  ];
  const decision = (f: FilaDecision) => <CeldaDecision fila={f} revisionId={revision.id} ahora={ahora} zona={zona} pideCodigo={pideCodigo} volver={volver} />;
  return (
    <>
      <div className="hidden lg:block">
        <TablaDatos titulo={titulo} columnas={columnas} filas={filas.length} vacio="Ningún documento de este proceso que usted vea sigue vigente">
          {filas.map((f) => (
            <tr key={f.documentoId}>
              <td className={celda}><Documento fila={f} /></td>
              <td className={celda}><ChipVigencia fila={f} /></td>
              <td className={`${celda} whitespace-nowrap`}>{textoAcuses(f.insumos.acuses)}</td>
              <td className={celdaNumerica}>{f.insumos.hallazgos}</td>
              <td className={celda}>{textoNormas(f.insumos.normasCambiadas)}</td>
              <td className={celdaNumerica}>{f.insumos.consultas}</td>
              <td className={celdaNumerica}>{f.insumos.tramites}</td>
              <td className={`${celda} min-w-56`}>{decision(f)}</td>
            </tr>
          ))}
        </TablaDatos>
      </div>
      <ul className="flex list-none flex-col gap-3 lg:hidden" aria-label={titulo}>
        {filas.length === 0 ? (
          <li className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
            Ningún documento de este proceso que usted vea sigue vigente
          </li>
        ) : null}
        {filas.map((f) => (
          <li key={f.documentoId} className="min-w-0 rounded-lg border border-border bg-card p-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0"><Documento fila={f} /></div>
              <ChipVigencia fila={f} />
            </div>
            <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
              <dt className="text-muted-foreground">Acuses v. vigente</dt>
              <dd>{textoAcuses(f.insumos.acuses)}</dd>
              <dt className="text-muted-foreground">Hallazgos</dt>
              <dd>{f.insumos.hallazgos}</dd>
              <dt className="text-muted-foreground">Normas cambiadas</dt>
              <dd className="break-words">{textoNormas(f.insumos.normasCambiadas)}</dd>
              <dt className="text-muted-foreground">{`Consultas ${revision.anio}`}</dt>
              <dd>{f.insumos.consultas}</dd>
              <dt className="text-muted-foreground">{`Trámites ${revision.anio}`}</dt>
              <dd>{f.insumos.tramites}</dd>
            </dl>
            <div className="mt-3 border-t border-linea-suave pt-3">{decision(f)}</div>
          </li>
        ))}
      </ul>
    </>
  );
}
