import { ChevronDown } from "lucide-react";
import { Insignia } from "@/componentes/ui/Insignia";
import type { DetalleDeHallazgo } from "@/db/consultas/mejoramiento/lectura";
import { fechaYHora } from "@/lib/mejoramiento/formato";
import type { EstadoHallazgo } from "@/lib/mejoramiento/tipos";

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{etiqueta}</dt>
      <dd className="mt-0.5 whitespace-pre-line break-words text-sm">{children}</dd>
    </div>
  );
}

/**
 * «7. Cierre» (SGC-FO-AC-01 sección 7; spec 15 §11.5, PC-10): la decisión con su texto, cuándo y quién cerró, las lecciones
 * aprendidas y cómo se atendieron los cambios que pidió el análisis. En el camino corto cierra la validación de la corrección
 * (`validacion`); un hallazgo anulado dice por qué. «Por cerrar», lo que falta. Gerencia no firma: recibe el aviso.
 */
export function SeccionCierre({
  id,
  estado,
  etiqueta,
  cierre: c,
  validacion,
  abierta,
  zona,
  tramites = null,
  children,
}: {
  /** El ancla del formulario de cerrar («Ir a cerrar»). */
  id?: string;
  estado: EstadoHallazgo;
  /** La etiqueta del estado («Cerrado · eficaz», «Cerrado con corrección»…). */
  etiqueta: string;
  cierre: DetalleDeHallazgo["cierre"];
  /** Quién validó la corrección o el cierre sin acción, y cuándo (el camino corto). */
  validacion: { por: string; en: Date } | null;
  abierta: boolean;
  zona: string;
  /**
   * Por cerrar, lo que comprueba el cierre con los trámites de la ronda (Fase 15B, anexo §9.6, `TramitesDelCierre`), antes del
   * formulario; solo para quien cierra.
   */
  tramites?: React.ReactNode;
  /** Por cerrar, el formulario del Admin SGC (a todo el ancho). */
  children?: React.ReactNode;
}) {
  const quien = c.cerradoPor && c.cerradoEn ? `${c.cerradoPor}, ${fechaYHora(c.cerradoEn, zona)}` : validacion ? `${validacion.por}, ${fechaYHora(validacion.en, zona)}` : null;
  const resumen = estado === "por_cerrar" ? "Falta cerrarlo: las lecciones aprendidas y la firma «Cerró»" : [etiqueta, quien].filter(Boolean).join(" · ");
  return (
    <details id={id} open={abierta} className="group scroll-mt-4 rounded-lg border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 rounded-lg px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca">
        <span className="min-w-0">
          <span className="block font-display text-base font-semibold">7. Cierre</span>
          <span className="block break-words text-sm text-muted-foreground">{resumen}</span>
        </span>
        <ChevronDown aria-hidden="true" className="mt-1 size-4 shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-4 border-t border-linea-suave px-4 py-3">
        {estado === "por_cerrar" ? (
          <>
            <p className="text-sm">La eficacia se evaluó «Eficaz»: el Administrador del SGC lo cierra con las lecciones aprendidas.</p>
            {tramites}
          </>
        ) : (
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Dato etiqueta="Decisión">
              <Insignia variante={estado === "anulado" ? "sin-dato" : "bien"}>{etiqueta}</Insignia>
            </Dato>
            {quien ? <Dato etiqueta={c.cerradoPor ? "Cerró" : "Validó"}>{quien}</Dato> : null}
            {c.lecciones ? (
              <div className="sm:col-span-2">
                <Dato etiqueta="Lecciones aprendidas">{c.lecciones}</Dato>
              </div>
            ) : null}
            {c.cambiosAtendidos ? (
              <div className="sm:col-span-2">
                <Dato etiqueta="Cómo se atendieron los cambios">{c.cambiosAtendidos}</Dato>
              </div>
            ) : null}
            {c.anuladoMotivo ? (
              <div className="sm:col-span-2">
                <Dato etiqueta="Por qué se anuló">{c.anuladoMotivo}</Dato>
              </div>
            ) : null}
          </dl>
        )}
        {children}
      </div>
    </details>
  );
}
