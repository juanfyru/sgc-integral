import Link from "next/link";
import { ajustarPlazoAccion, quitarFechaAccion } from "@/app/acciones-vigencia";
import { FormAccion } from "@/componentes/admin/FormAccion";
import { claseBoton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { vigenciaDeDocumento, type VigenciaDeDocumento } from "@/db/consultas/vigencia/semaforo";
import { alcanceProcesos, puedeVerImpacto } from "@/lib/alcance";
import { enlaceDeImpacto } from "@/lib/normograma/tipos";
import { cuenta } from "@/lib/plural";
import { limitesDeFechaFijada, sumarMeses, textoFecha } from "@/lib/vigencia/plazo";
import { zonaHoraria } from "@/lib/zona-horaria";
import { ChipVigencia } from "./ChipVigencia";
import { DialogoFijarFecha } from "./DialogoFijarFecha";
import { DialogoRatificar } from "./DialogoRatificar";
import { LeyendaRevisionAnual, rutaSolicitarCambio } from "./TablaSemaforo";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

export type NivelTitulo = 2 | 3 | 4;

/** El título del bloque y el de sus secciones, un nivel más abajo; lo comparte el bloque «Documento externo». */
export const ENCABEZADOS = { 2: ["h2", "h3"], 3: ["h3", "h4"], 4: ["h4", "h5"] } as const satisfies Record<NivelTitulo, readonly [string, string]>;

/** «Ratificado el 8 nov 2026 por …» o «14 ago 2025 · fecha de aprobación registrada». */
function textoUltima(u: NonNullable<VigenciaDeDocumento["ultimaRevision"]>, zona: string): string {
  const fecha = textoFecha(u.fecha, zona);
  switch (u.clase) {
    case "ratificacion":
      return `Ratificado el ${fecha}${u.quien ? ` por ${u.quien}` : ""}`;
    case "aprobacion":
      return `${fecha} · fecha de aprobación registrada`;
    case "publicacion":
      return `${fecha} · publicada en la plataforma`;
    case "verificacion":
      return `Verificado el ${fecha}${u.quien ? ` por ${u.quien}` : ""}`;
    case "adopcion":
      return `Adoptado el ${fecha}${u.quien ? ` por ${u.quien}` : ""}`;
  }
}

export function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  );
}

/** «Ajustar», solo para quien gestiona la revisión anual: el plazo propio, la fecha fijada a mano o quitarla. */
function Ajustar({ v, ahora, zona }: { v: VigenciaDeDocumento; ahora: Date; zona: string }) {
  const { minima, maxima } = limitesDeFechaFijada({ meses: v.mesesRevision }, ahora, zona);
  return (
    <details className="mt-1 rounded-md border border-border p-2">
      <summary className={`cursor-pointer rounded text-sm font-medium ${FOCO}`}>Ajustar</summary>
      <div className="mt-2 flex flex-col gap-3">
        <FormAccion accion={ajustarPlazoAccion} etiqueta="Guardar el plazo" campos={{ documentoId: v.documentoId }}>
          <Campo etiqueta="Plazo de revisión (meses)" nombre="mesesRevision" ayuda="De 1 a 120; vacío, el del tipo de documento.">
            <input
              type="number"
              min={1}
              max={120}
              step={1}
              defaultValue={v.plazoPropio ? v.mesesRevision : undefined}
              className={`${claseControl} w-28`}
            />
          </Campo>
        </FormAccion>
        <div>
          <DialogoFijarFecha
            documentoIds={[v.documentoId]}
            etiqueta="Fijar la próxima revisión"
            minima={minima}
            maxima={maxima}
            maximaTexto={textoFecha(maxima, zona)}
          />
        </div>
        {v.fijada ? (
          <FormAccion
            accion={quitarFechaAccion}
            etiqueta="Quitar la fecha fijada"
            confirmacion="Vuelve a regir la fecha de la última revisión más el plazo."
            campos={{ documentoId: v.documentoId }}
          />
        ) : null}
      </div>
    </details>
  );
}

/**
 * El bloque «Vigencia» de la ficha (portal y panel, spec 13C §7.3 y §14.4): el semáforo, el plazo, la última y
 * la próxima revisión, la fecha fijada a mano, la marca de cambio normativo, el historial de ratificaciones de
 * la versión y lo que la persona puede hacer. Un externo tiene su propio bloque, `BloqueExterno`, y no este.
 */
export async function BloqueVigencia({
  documentoId,
  sesion,
  nivel = 2,
}: {
  documentoId: number;
  sesion: SesionFlujo & { totpActivo?: boolean };
  /** El nivel del título del bloque: 2 en la ficha del portal; en el panel va dentro de la versión (`h3`), 4. */
  nivel?: NivelTitulo;
}) {
  const v = await vigenciaDeDocumento(documentoId, sesion);
  if (!v || v.origen === "externo") return null;
  const ahora = new Date();
  const zona = zonaHoraria();
  const [Titulo, Subtitulo] = ENCABEZADOS[nivel];
  // La marca enlaza a la página de impactos solo para quien la ve (el líder del proceso o el Admin SGC); para los demás
  // es texto (resolución 16 de la Tarea 9).
  const verImpacto = v.impacto !== null && puedeVerImpacto(sesion, v.impacto.procesoId, await alcanceProcesos(sesion));
  const plazo = `${cuenta(v.mesesRevision, "mes", "meses")} ${v.plazoPropio ? "(propio del documento)" : `(el del tipo ${v.tipo})`}`;

  return (
    <section aria-labelledby="titulo-vigencia" className="rounded-xl border border-border bg-card p-4 shadow-xs">
      <Titulo id="titulo-vigencia" className="mb-3 text-sm font-semibold text-foreground">
        Vigencia
      </Titulo>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-2.5 text-sm">
        <Dato etiqueta="Estado">
          <ChipVigencia fila={v} />
        </Dato>
        {v.impacto ? (
          <Dato etiqueta="Cambio normativo">
            {verImpacto ? (
              <Link href={enlaceDeImpacto(v.impacto.cambioId, v.impacto.procesoId)} className={`rounded underline underline-offset-2 ${FOCO}`}>
                {`Revisión por cambio normativo · ${v.impacto.norma}`}
              </Link>
            ) : (
              `Revisión por cambio normativo · ${v.impacto.norma}`
            )}
          </Dato>
        ) : null}
        {v.tramite ? (
          <Dato etiqueta="Trámite abierto">
            {v.acciones.verTramite ? (
              <Link href={`/tramites/${v.tramite.id}`} className={`rounded underline underline-offset-2 ${FOCO}`}>
                {v.tramite.numero}
              </Link>
            ) : (
              v.tramite.numero
            )}
            {" · el trámite ya es su revisión"}
          </Dato>
        ) : null}
        <Dato etiqueta="Plazo">
          {plazo}
          {v.acciones.ajustar ? <Ajustar v={v} ahora={ahora} zona={zona} /> : null}
        </Dato>
        <Dato etiqueta="Última revisión">{v.ultimaRevision ? textoUltima(v.ultimaRevision, zona) : "Sin fecha registrada"}</Dato>
        <Dato etiqueta="Próxima revisión">
          {v.proximaRevision ? textoFecha(v.proximaRevision, zona) : "Sin fecha"}
          {v.fijada ? (
            <span className="block text-xs text-muted-foreground">
              {`Fijada por ${v.fijada.por} el ${textoFecha(v.fijada.en, zona)}`}
              {v.fijada.nota ? ` · ${v.fijada.nota}` : ""}
            </span>
          ) : null}
        </Dato>
      </dl>

      {v.ratificaciones.length > 0 ? (
        <div className="mt-4 border-t border-border pt-3">
          <Subtitulo className="mb-1 text-xs font-semibold text-muted-foreground">{`Ratificaciones de la versión ${v.version.numero}`}</Subtitulo>
          <ul className="flex list-none flex-col gap-1.5 text-sm">
            {v.ratificaciones.map((r) => (
              <li key={r.id}>
                {`Ratificado el ${textoFecha(r.creadoEn, zona)} por ${r.nombre}${r.cargo ? ` (${r.cargo})` : ""} · próxima revisión ${textoFecha(r.proximaRevision, zona)}`}
                {r.nota ? <span className="block text-xs text-muted-foreground">{r.nota}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {v.acciones.ratificar || v.acciones.solicitar || v.revisionAnual ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 print:hidden">
          {v.acciones.ratificar ? (
            <DialogoRatificar
              documento={{ id: v.documentoId, codigo: v.codigo, titulo: v.titulo, version: v.version.numero, huella: v.huella }}
              proximaRevision={textoFecha(sumarMeses(ahora, v.mesesRevision, zona), zona)}
              pideCodigo={sesion.totpActivo === true}
            />
          ) : null}
          {v.acciones.solicitar ? (
            <Link href={rutaSolicitarCambio(v.codigo)} className={`${claseBoton("secundario")} ${FOCO}`}>
              Solicitar cambio
            </Link>
          ) : null}
          <LeyendaRevisionAnual revision={v.revisionAnual} />
        </div>
      ) : null}
    </section>
  );
}
