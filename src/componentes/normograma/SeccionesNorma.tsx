import Link from "next/link";
import {
  borrarNormaAccion,
  desasociarProcesoAccion,
  desenlazarDocumentoAccion,
  eliminarRelacionAccion,
  retirarNormaAccion,
} from "@/app/acciones-normograma";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { Insignia } from "@/componentes/ui/Insignia";
import type { DocumentoGestionable } from "@/db/consultas/normograma/asociaciones";
import type { Norma } from "@/db/consultas/normograma/lectura";
import { ETIQUETA_ESTADO_NORMA, ETIQUETA_RELACION, ETIQUETA_RELACION_INVERSA, fechaDeNorma } from "@/lib/normograma/tipos";
import { textoFecha } from "@/lib/vigencia/plazo";
import { zonaHoraria } from "@/lib/zona-horaria";
import { AccionNormograma } from "./AccionNormograma";
import { AsociarProceso } from "./AsociarProceso";
import { DialogoEstado } from "./DialogoEstado";
import { DialogoRelacion } from "./DialogoRelacion";
import { EnlazarDocumento } from "./EnlazarDocumento";
import { InsigniaNorma } from "./TablaNormas";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";
const ENLACE = `rounded underline underline-offset-2 ${FOCO}`;
const CONTROL = `${claseControl} w-full min-w-0 max-w-full`;
export const SECCION = "flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4";

function Motivo({ id, ayuda }: { id: string; ayuda: string }) {
  return (
    <Campo etiqueta="Motivo" nombre="motivo" id={id} ayuda={ayuda}>
      <textarea required minLength={5} maxLength={500} rows={2} className={CONTROL} />
    </Campo>
  );
}

/** El estado y su historial (`norma_cambios`, de solo inserción): la relación que causó cada cambio, aunque ya no esté. */
export function SeccionEstado({ norma: n, administra, hoy }: { norma: Norma; administra: boolean; hoy: string }) {
  const zona = zonaHoraria();
  return (
    <section aria-labelledby="norma-estado" className={SECCION}>
      <h2 id="norma-estado" className="text-sm font-semibold">
        Estado e historial
      </h2>
      <p className="flex flex-wrap items-center gap-2 text-sm">
        Estado actual: <InsigniaNorma estado={n.estado} estadoEn={n.estadoEn} />
      </p>
      {n.cambios.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin cambios de estado desde que se registró.</p>
      ) : (
        <ol className="flex list-none flex-col gap-2 text-sm">
          {n.cambios.map((c, i) => (
            <li key={i} className="min-w-0 border-l-2 border-border pl-3">
              <span className="font-medium">{`${fechaDeNorma(c.fecha)} · ${ETIQUETA_ESTADO_NORMA[c.estadoAnterior]} → ${ETIQUETA_ESTADO_NORMA[c.estadoNuevo]}`}</span>
              {c.relacion ? (
                <span className="block">
                  {`${ETIQUETA_RELACION_INVERSA[c.relacion.tipo]} `}
                  <Link href={`/normograma/${c.relacion.norma.id}`} className={ENLACE}>
                    {c.relacion.norma.nombre}
                  </Link>
                  {c.relacion.eliminada ? " (relación eliminada después)" : null}
                </span>
              ) : null}
              <span className="block text-xs text-muted-foreground">{`Registrado por ${c.nombre} el ${textoFecha(c.creadoEn, zona)}`}</span>
              {c.nota ? <span className="block whitespace-pre-line break-words text-xs text-muted-foreground">{c.nota}</span> : null}
            </li>
          ))}
        </ol>
      )}
      {administra ? (
        <div>
          <DialogoEstado normaId={n.id} nombre={n.nombre} estado={n.estado} hoy={hoy} />
        </div>
      ) : null}
    </section>
  );
}

/** Las relaciones activas en los dos sentidos: «Deroga a …» y «Derogada por …». */
export function SeccionRelaciones({
  norma: n,
  administra,
  normas,
}: {
  norma: Norma;
  administra: boolean;
  normas: { id: number; nombre: string; titulo: string }[];
}) {
  return (
    <section aria-labelledby="norma-relaciones" className={SECCION}>
      <h2 id="norma-relaciones" className="text-sm font-semibold">
        Relaciones con otras normas
      </h2>
      {n.relaciones.length === 0 ? (
        <p className="text-sm text-muted-foreground">No modifica, deroga ni reglamenta otra norma, ni otra la afecta.</p>
      ) : (
        <ul className="flex list-none flex-col gap-2 text-sm">
          {n.relaciones.map((r) => (
            <li key={r.id} className="flex min-w-0 flex-col gap-1">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>
                  {`${(r.directa ? ETIQUETA_RELACION : ETIQUETA_RELACION_INVERSA)[r.tipo]} `}
                  <Link href={`/normograma/${r.norma.id}`} className={ENLACE}>
                    {r.norma.nombre}
                  </Link>
                </span>
                <InsigniaNorma estado={r.norma.estado} estadoEn={null} />
              </span>
              {r.detalle ? <span className="break-words text-xs text-muted-foreground">{r.detalle}</span> : null}
              {administra ? (
                <AccionNormograma
                  accion={eliminarRelacionAccion}
                  boton="Eliminar la relación"
                  campos={{ id: r.id }}
                  desplegable="Eliminar relación…"
                  explicacion="Para una relación registrada por error. La norma afectada no recupera su estado sola: cámbielo a mano. Los impactos que ya nacieron se resuelven como «no afecta»."
                  variante="peligro"
                  tamano="sm"
                >
                  <Motivo id={`relacion-${r.id}-motivo`} ayuda="Entre 5 y 500 caracteres. Queda en la bitácora de las dos normas." />
                </AccionNormograma>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {administra ? (
        <div>
          <DialogoRelacion normaId={n.id} nombre={n.nombre} normas={normas} />
        </div>
      ) : null}
    </section>
  );
}

/** Los procesos a los que aplica, con su requisito; quien tiene el proceso lo edita o quita la asociación. */
export function SeccionProcesos({
  norma: n,
  abierta,
  procesos,
}: {
  norma: Norma;
  /** No retirada: admite cambios. */
  abierta: boolean;
  procesos: { id: number; nombre: string; sigla: string }[];
}) {
  return (
    <section aria-labelledby="norma-procesos" className={SECCION}>
      <h2 id="norma-procesos" className="text-sm font-semibold">
        {`Procesos a los que aplica (${n.procesos.length})`}
      </h2>
      {n.procesos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aún no está asociada a ningún proceso.</p>
      ) : (
        <ul className="flex list-none flex-col gap-3 text-sm">
          {n.procesos.map((p) => (
            <li key={p.id} className="flex min-w-0 flex-col gap-1">
              <Link href={`/procesos/${p.slug}`} className={`${ENLACE} self-start font-medium`}>
                {`${p.sigla} · ${p.nombre}`}
              </Link>
              <span className="whitespace-pre-line break-words text-muted-foreground">{p.requisito ?? "Sin requisito escrito"}</span>
              {abierta && p.puedeEditar ? (
                <div className="flex min-w-0 flex-wrap items-start gap-2">
                  <AsociarProceso normaId={n.id} procesoId={p.id} requisito={p.requisito} proceso={p.nombre} />
                  <AccionNormograma
                    accion={desasociarProcesoAccion}
                    boton="Quitar la asociación"
                    campos={{ normaId: n.id, procesoId: p.id }}
                    desplegable={`Quitar ${p.sigla}…`}
                    explicacion="La norma deja de aplicar a este proceso; el cambio queda en la bitácora con el requisito que tenía."
                    variante="peligro"
                    tamano="sm"
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {abierta && procesos.length > 0 ? <AsociarProceso normaId={n.id} procesos={procesos} /> : null}
    </section>
  );
}

/**
 * Los internos que la implementan y los externos que la referencian. Un documento que la persona no ve no existe para
 * ella (spec 13C §6.4): ni se nombra ni se cuenta.
 */
export function SeccionDocumentos({ norma: n, abierta, documentos }: { norma: Norma; abierta: boolean; documentos: DocumentoGestionable[] }) {
  const desenlazables = new Set(documentos.filter((d) => d.enlazado).map((d) => d.id));
  const porEnlazar = documentos.filter((d) => !d.enlazado);
  const visibles = n.documentos.filter((d) => d.visible);
  const grupos = [
    { origen: "interno" as const, titulo: "Documentos internos" },
    { origen: "externo" as const, titulo: "Documentos externos" },
  ];
  return (
    <section aria-labelledby="norma-documentos" className={SECCION}>
      <h2 id="norma-documentos" className="text-sm font-semibold">
        Documentos enlazados
      </h2>
      {visibles.length === 0 ? <p className="text-sm text-muted-foreground">Ningún documento del sistema está enlazado a esta norma.</p> : null}
      {grupos.map((g) => {
        const delGrupo = visibles.filter((d) => d.origen === g.origen);
        if (delGrupo.length === 0) return null;
        return (
          <div key={g.origen} className="flex min-w-0 flex-col gap-1">
            <h3 className="text-xs font-semibold text-muted-foreground">{g.titulo}</h3>
            <ul className="flex list-none flex-col gap-2 text-sm">
              {delGrupo.map((d) => (
                <li key={`${g.origen}-${d.id}`} className="flex min-w-0 flex-col gap-1">
                  <span className="min-w-0">
                    <Link href={`/documentos/${encodeURIComponent((d.codigo ?? "").toLowerCase())}`} className={`${ENLACE} font-mono text-xs`}>
                      {d.codigo}
                    </Link>{" "}
                    <span className="break-words">{d.titulo}</span>
                    {g.origen === "externo" ? (
                      <>
                        {" "}
                        <Insignia variante="neutra">Externo</Insignia>
                      </>
                    ) : null}
                  </span>
                  {abierta && d.id !== null && desenlazables.has(d.id) ? (
                    <AccionNormograma
                      accion={desenlazarDocumentoAccion}
                      boton="Quitar el enlace"
                      campos={{ normaId: n.id, documentoId: d.id }}
                      desplegable={`Quitar el enlace de ${d.codigo}…`}
                      explicacion="Un cambio posterior de la norma ya no le abrirá un impacto."
                      variante="peligro"
                      tamano="sm"
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {abierta && porEnlazar.length > 0 ? <EnlazarDocumento normaId={n.id} documentos={porEnlazar} /> : null}
    </section>
  );
}

/** Retirar (con motivo, también abre impactos) y, si no tiene historia (lo dice el servidor), borrar (D47). */
export function SeccionAdministrar({ norma: n }: { norma: Norma }) {
  return (
    <section aria-labelledby="norma-administrar" className={SECCION}>
      <h2 id="norma-administrar" className="text-sm font-semibold">
        Retiro
      </h2>
      <AccionNormograma
        accion={retirarNormaAccion}
        boton="Retirar la norma"
        campos={{ id: n.id }}
        desplegable="Retirar…"
        explicacion="Para una norma registrada por error o que dejó de aplicar al hospital: sale de las listas y de la búsqueda y conserva su ficha. Si tiene documentos enlazados o procesos asociados, se abre la revisión de su impacto. No se deshace."
        variante="peligro"
      >
        <Motivo id={`norma-${n.id}-motivo`} ayuda="Entre 5 y 500 caracteres. Queda en el historial y en la bitácora." />
      </AccionNormograma>
      {!n.tieneHistoria ? (
        <AccionNormograma
          accion={borrarNormaAccion}
          boton="Borrar la norma"
          campos={{ id: n.id }}
          desplegable="Borrar…"
          explicacion="No tiene relaciones, procesos, documentos, cambios, PDF ni fichas de indicador que la citen: se puede borrar. Queda en la bitácora."
          variante="peligro"
        />
      ) : null}
    </section>
  );
}
