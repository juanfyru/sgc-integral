import Link from "next/link";
import { claseBoton } from "@/componentes/ui/Boton";
import { TablaDatos, celda, type ColumnaTabla } from "@/componentes/ui/TablaDatos";
import type { AccionesVigencia, FilaSemaforo } from "@/db/consultas/vigencia/semaforo";
import { sumarMeses, textoFecha } from "@/lib/vigencia/plazo";
import { textoUltimaRevision } from "@/lib/vigencia/semaforo";
import { zonaHoraria } from "@/lib/zona-horaria";
import { ChipVigencia } from "./ChipVigencia";
import { DialogoRatificar } from "./DialogoRatificar";

export type FilaConAcciones = FilaSemaforo & { acciones: AccionesVigencia };

const COLUMNAS: readonly ColumnaTabla[] = [
  { clave: "documento", etiqueta: "Documento" },
  { clave: "proceso", etiqueta: "Proceso" },
  { clave: "ultima", etiqueta: "Última revisión" },
  { clave: "proxima", etiqueta: "Próxima revisión" },
  { clave: "vigencia", etiqueta: "Vigencia" },
  { clave: "acciones", etiqueta: "Acciones", oculta: true },
];

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/** «v2» de un interno; «ed. 2017» de un externo con edición. */
export function rotuloVersion(f: Pick<FilaSemaforo, "origen" | "version">): string {
  return f.origen === "externo" && f.version.edicion ? `ed. ${f.version.edicion}` : `v${f.version.numero}`;
}

/** «Solicitar cambio» con el motivo de la revisión anual propuesto. */
export function rutaSolicitarCambio(codigo: string): string {
  return `/tramites/nueva?documento=${encodeURIComponent(codigo)}&motivo=revision_anual`;
}

function Documento({ fila: f }: { fila: FilaSemaforo }) {
  return (
    <>
      <div>
        <Link href={`/documentos/${encodeURIComponent(f.codigo.toLowerCase())}`} className={`rounded font-mono text-xs font-medium hover:underline ${FOCO}`}>
          {`${f.codigo} ${rotuloVersion(f)}`}
        </Link>
      </div>
      <div>{f.titulo}</div>
      <div className="text-xs text-muted-foreground">{f.origen === "externo" ? `${f.tipo} · externo` : f.tipo}</div>
    </>
  );
}

function Ultima({ fila: f, zona }: { fila: FilaSemaforo; zona: string }) {
  if (!f.ultimaRevision) return <span className="text-muted-foreground">Sin fecha</span>;
  return (
    <>
      <div className="whitespace-nowrap">{textoFecha(f.ultimaRevision.fecha, zona)}</div>
      <div className="text-xs text-muted-foreground">{textoUltimaRevision(f.ultimaRevision)}</div>
    </>
  );
}

function Proxima({ fila: f, zona }: { fila: FilaSemaforo; zona: string }) {
  if (!f.proximaRevision) return <span className="text-muted-foreground">Sin fecha</span>;
  return (
    <>
      <div className="whitespace-nowrap">{textoFecha(f.proximaRevision, zona)}</div>
      {f.fijada ? (
        <div className="text-xs text-muted-foreground">{`Fijada por ${f.fijada.por} el ${textoFecha(f.fijada.en, zona)}`}</div>
      ) : null}
    </>
  );
}

function Acciones({ fila: f, ahora, zona, pideCodigo }: { fila: FilaConAcciones; ahora: Date; zona: string; pideCodigo: boolean }) {
  const { ratificar, solicitar } = f.acciones;
  if (!ratificar && !solicitar && !f.tramite) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {ratificar ? (
        <DialogoRatificar
          documento={{ id: f.documentoId, codigo: f.codigo, titulo: f.titulo, version: f.version.numero, huella: f.huella }}
          proximaRevision={textoFecha(sumarMeses(ahora, f.mesesRevision, zona), zona)}
          pideCodigo={pideCodigo}
        />
      ) : null}
      {solicitar ? (
        <Link href={rutaSolicitarCambio(f.codigo)} className={`${claseBoton("secundario")} ${FOCO}`}>
          Solicitar cambio
        </Link>
      ) : null}
      {f.tramite ? (
        f.acciones.verTramite ? (
          <Link href={`/tramites/${f.tramite.id}`} className={`rounded text-sm underline underline-offset-2 ${FOCO}`}>
            {`Ver trámite ${f.tramite.numero}`}
          </Link>
        ) : (
          <span className="text-sm text-muted-foreground">{`Trámite ${f.tramite.numero}`}</span>
        )
      ) : null}
    </div>
  );
}

/** Tabla desde 768 px; por debajo, una tarjeta por documento. */
export function TablaSemaforo({ filas, ahora, pideCodigo }: { filas: FilaConAcciones[]; ahora: Date; pideCodigo: boolean }) {
  const zona = zonaHoraria();
  const acciones = (f: FilaConAcciones) => <Acciones fila={f} ahora={ahora} zona={zona} pideCodigo={pideCodigo} />;
  return (
    <>
      <div className="hidden md:block">
        <TablaDatos titulo="Semáforo de vigencia" columnas={COLUMNAS} filas={filas.length} vacio="Sin documentos">
          {filas.map((f) => (
            <tr key={f.documentoId}>
              <td className={celda}><Documento fila={f} /></td>
              <td className={`${celda} whitespace-nowrap`}>
                <abbr title={f.proceso.nombre} className="no-underline">{f.proceso.sigla}</abbr>
              </td>
              <td className={celda}><Ultima fila={f} zona={zona} /></td>
              <td className={celda}><Proxima fila={f} zona={zona} /></td>
              <td className={celda}><ChipVigencia fila={f} /></td>
              <td className={celda}>{acciones(f)}</td>
            </tr>
          ))}
        </TablaDatos>
      </div>
      <ul className="flex list-none flex-col gap-3 md:hidden" aria-label="Semáforo de vigencia">
        {filas.map((f) => (
          <li key={f.documentoId} className="rounded-lg border border-border bg-card p-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0"><Documento fila={f} /></div>
              <ChipVigencia fila={f} />
            </div>
            <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
              <dt className="text-muted-foreground">Proceso</dt>
              <dd>{f.proceso.nombre}</dd>
              <dt className="text-muted-foreground">Última revisión</dt>
              <dd><Ultima fila={f} zona={zona} /></dd>
              <dt className="text-muted-foreground">Próxima revisión</dt>
              <dd><Proxima fila={f} zona={zona} /></dd>
            </dl>
            <div className="mt-3">{acciones(f)}</div>
          </li>
        ))}
      </ul>
    </>
  );
}
