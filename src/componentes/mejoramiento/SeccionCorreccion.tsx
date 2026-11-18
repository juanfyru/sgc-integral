import { ChevronDown } from "lucide-react";
import type { DetalleDeHallazgo } from "@/db/consultas/mejoramiento/lectura";
import { fechaDeDia, fechaYHora } from "@/lib/mejoramiento/formato";

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{etiqueta}</dt>
      <dd className="mt-0.5 whitespace-pre-line break-words text-sm">{children}</dd>
    </div>
  );
}

/** Lo que cabe del texto en la línea del resumen: hasta `maximo` caracteres, cortado en una palabra. */
function recortar(texto: string, maximo = 90): string {
  if (texto.length <= maximo) return texto;
  const corte = texto.slice(0, maximo);
  const espacio = corte.lastIndexOf(" ");
  return (espacio > maximo / 2 ? corte.slice(0, espacio) : corte).trimEnd() + "…";
}

/**
 * El resumen en una línea de la sección plegada (maqueta 2): qué se hizo, quién y cuándo y, a quien ve los archivos,
 * cuántos hay (`archivos` nulo: quien mira no los ve, y no se cuentan).
 */
function resumenDe(c: DetalleDeHallazgo["correccion"], archivos: number | null): string {
  if (c.requerida === null) return "Aún no se registra la corrección";
  if (c.requerida === false) return "No requirió corrección inmediata";
  const partes = [
    recortar(c.descripcion ?? ""),
    [c.responsable, c.implementadaEn ? fechaDeDia(c.implementadaEn) : null].filter(Boolean).join(", "),
    archivos === null ? "" : `${archivos} ${archivos === 1 ? "archivo" : "archivos"}`,
  ];
  return partes.filter(Boolean).join(" · ");
}

/**
 * «2. Corrección» (spec 15 §8.4 y §16.2, SGC-FO-AC-01 sección 2): si requirió corrección, qué se hizo, quién, cuándo y su
 * evidencia; si no, la justificación. Debajo, la decisión sobre la acción correctiva y, en el camino corto, quién la validó.
 * Plegable: abierta mientras es la etapa en curso. Solo en la no conformidad. Los archivos llegan como hijos (`ArchivosDe`),
 * solo para quien los ve.
 */
export function SeccionCorreccion({
  correccion: c,
  decision,
  zona,
  abierta,
  archivos,
  devuelta,
  children,
}: {
  correccion: DetalleDeHallazgo["correccion"];
  decision: DetalleDeHallazgo["decision"];
  zona: string;
  abierta: boolean;
  /** Cuántos archivos de la corrección hay, para el resumen; nulo si quien mira no los ve. */
  archivos: number | null;
  /** La nota con que se devolvió la corrección, si se devolvió y está otra vez por corregir. */
  devuelta?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <details open={abierta} className="group rounded-lg border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 rounded-lg px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca">
        <span className="min-w-0">
          <span className="block font-display text-base font-semibold">2. Corrección</span>
          <span className="block break-words text-sm text-muted-foreground">{resumenDe(c, archivos)}</span>
        </span>
        <ChevronDown aria-hidden="true" className="mt-1 size-4 shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-4 border-t border-linea-suave px-4 py-3">
        {devuelta ? (
          <p className="whitespace-pre-line break-words border-l-2 border-mod-planes pl-3 text-sm">
            <span className="font-medium">Se devolvió la corrección:</span> {devuelta}
            <span className="mt-1 block text-muted-foreground">
              Si la registra otra vez con corrección, adjunte evidencia nueva: la anterior se devolvió con ella.
            </span>
          </p>
        ) : null}
        {/* Sin corrección registrada, el resumen de la sección ya lo dice: el cuerpo no lo repite. */}
        {c.requerida === null ? null : (
          <dl className="grid gap-3 sm:grid-cols-2">
            <Dato etiqueta="¿Requirió corrección?">{c.requerida ? "Sí requirió corrección" : "No requiere corrección inmediata"}</Dato>
            {c.requerida && c.implementadaEn ? <Dato etiqueta="Fecha en que se implementó">{fechaDeDia(c.implementadaEn)}</Dato> : null}
            <div className="sm:col-span-2">
              <Dato etiqueta={c.requerida ? "Qué se hizo" : "Por qué no la requiere"}>{c.descripcion ?? ""}</Dato>
            </div>
            {c.requerida && c.responsable ? <Dato etiqueta="Responsable">{c.responsable}</Dato> : null}
            {c.registradaEn ? <Dato etiqueta="Registrada">{fechaYHora(c.registradaEn, zona)}</Dato> : null}
          </dl>
        )}
        {children}
        {decision.accionRequerida !== null ? (
          <dl className="grid gap-3 border-t border-linea-suave pt-3 sm:grid-cols-2">
            <Dato etiqueta="¿Requiere acción correctiva?">
              {decision.accionRequerida ? (decision.decididaEn ? "Sí" : "Sí: es obligada") : "No"}
            </Dato>
            {decision.decididaEn ? <Dato etiqueta="Decidida">{fechaYHora(decision.decididaEn, zona)}</Dato> : null}
            {decision.justificacion ? (
              <div className="sm:col-span-2">
                <Dato etiqueta="Justificación">{decision.justificacion}</Dato>
              </div>
            ) : null}
          </dl>
        ) : null}
        {c.validadaPor && c.validadaEn ? (
          <p className="text-sm">
            Validó {c.validadaPor}, {fechaYHora(c.validadaEn, zona)}.
          </p>
        ) : null}
      </div>
    </details>
  );
}
