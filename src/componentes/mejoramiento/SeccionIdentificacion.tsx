import Link from "next/link";
import { ChevronDown } from "lucide-react";
import type { DetalleDeHallazgo } from "@/db/consultas/mejoramiento/lectura";
import { fechaDeDia, fechaYHora } from "@/lib/mejoramiento/formato";
import { ORIGENES } from "@/lib/mejoramiento/origenes";
import { rutaDeHallazgo } from "@/lib/mejoramiento/rutas";
import { ETIQUETA_CLASE } from "@/lib/mejoramiento/textos";

const ETIQUETA_ORIGEN = new Map<string, string>(ORIGENES.map((o) => [o.clave, o.etiqueta]));

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{etiqueta}</dt>
      <dd className="mt-0.5 break-words text-sm">{children}</dd>
    </div>
  );
}

/**
 * «1. Identificación» (spec 15 §16.2): lo que se registró. Plegable: queda abierta mientras el hallazgo espera su
 * aceptación y se pliega después. A quien solo ve el hallazgo por una actividad se le muestra en texto, como a todos.
 */
export function SeccionIdentificacion({
  hallazgo: h,
  zona,
  abierta,
}: {
  hallazgo: Pick<
    DetalleDeHallazgo,
    | "clase"
    | "origen"
    | "fuente"
    | "referenciaCaso"
    | "detectadoEn"
    | "proceso"
    | "requisitoClausula"
    | "riesgo"
    | "descripcion"
    | "registradoPor"
    | "registradoEn"
    | "fechaLimiteEnte"
    | "reincidenteDe"
  >;
  zona: string;
  abierta: boolean;
}) {
  const resumen = [h.proceso, ETIQUETA_ORIGEN.get(h.origen) ?? h.origen, `detectado el ${fechaDeDia(h.detectadoEn)}`].join(" · ");
  return (
    <details open={abierta} className="group rounded-lg border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 rounded-lg px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca">
        <span className="min-w-0">
          <span className="block font-display text-base font-semibold">1. Identificación</span>
          <span className="block text-sm text-muted-foreground">{resumen}</span>
        </span>
        <ChevronDown aria-hidden="true" className="mt-1 size-4 shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-linea-suave px-4 py-3">
        <p className="whitespace-pre-line text-sm">{h.descripcion}</p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <Dato etiqueta="Clase">{ETIQUETA_CLASE[h.clase]}</Dato>
          <Dato etiqueta="Origen">{ETIQUETA_ORIGEN.get(h.origen) ?? h.origen}</Dato>
          {h.fuente ? <Dato etiqueta="Fuente">{h.fuente}</Dato> : null}
          {h.referenciaCaso ? <Dato etiqueta="Referencia del caso">{h.referenciaCaso}</Dato> : null}
          <Dato etiqueta="Proceso">{h.proceso}</Dato>
          <Dato etiqueta="Fecha en que se detectó">{fechaDeDia(h.detectadoEn)}</Dato>
          {h.requisitoClausula ? <Dato etiqueta="Requisito incumplido">{h.requisitoClausula}</Dato> : null}
          {h.riesgo ? <Dato etiqueta="Riesgo asociado">{h.riesgo}</Dato> : null}
          {h.fechaLimiteEnte ? <Dato etiqueta="Fecha límite de respuesta al ente">{fechaDeDia(h.fechaLimiteEnte)}</Dato> : null}
          <Dato etiqueta="Lo registró">
            {h.registradoPor}, {fechaYHora(h.registradoEn, zona)}
          </Dato>
          {h.reincidenteDe && "id" in h.reincidenteDe ? (
            <Dato etiqueta="Reincidencia de">
              <Link
                href={rutaDeHallazgo(h.reincidenteDe.id)}
                className="rounded font-medium text-marca underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
              >
                {h.reincidenteDe.codigo}
              </Link>{" "}
              {h.reincidenteDe.titulo}
            </Dato>
          ) : null}
        </dl>
      </div>
    </details>
  );
}
