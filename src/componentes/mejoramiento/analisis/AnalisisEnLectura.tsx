import { ChevronDown } from "lucide-react";
import type { RondaDeDetalle } from "@/db/consultas/mejoramiento/lectura";
import {
  CATEGORIAS_6M,
  ETIQUETA_6M,
  ETIQUETA_IMPACTO,
  leerCambios,
  leerContenido,
  type Categoria6M,
  type ContenidoCincoPorques,
  type ContenidoIshikawa,
  type ContenidoOtroMetodo,
  type ImpactoDeCausa,
} from "@/lib/mejoramiento/analisis";
import { ETIQUETA_METODO_ANALISIS } from "@/lib/mejoramiento/textos";
import type { MetodoAnalisis } from "@/lib/mejoramiento/tipos";

const metodo = (m: string) => ETIQUETA_METODO_ANALISIS[m as MetodoAnalisis] ?? m;

type Analisis = RondaDeDetalle["analisis"][number];

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{etiqueta}</dt>
      <dd className="mt-0.5 whitespace-pre-line break-words text-sm">{children}</dd>
    </div>
  );
}

function CincoPorques({ contenido }: { contenido: ContenidoCincoPorques }) {
  return (
    <ol className="flex list-none flex-col gap-2">
      {contenido.niveles.map((n, i) => (
        <li key={i} className="border-l-2 border-mod-planes pl-3 text-sm">
          <span className="block text-xs font-medium text-muted-foreground">{i === 0 ? "Por qué ocurrió" : `Por qué (nivel ${i + 1})`}</span>
          <span className="block whitespace-pre-line break-words">{n.respuesta}</span>
          {"evidencia" in n && n.evidencia ? <span className="block break-words text-xs text-muted-foreground">Evidencia: {n.evidencia}</span> : null}
        </li>
      ))}
    </ol>
  );
}

function Ishikawa({ contenido }: { contenido: ContenidoIshikawa }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {CATEGORIAS_6M.map((cat: Categoria6M) => {
        const deLaCategoria = contenido.causas.filter((c) => c.categoria === cat);
        if (deLaCategoria.length === 0) return null;
        return (
          <div key={cat} className="min-w-0 rounded-md border border-border p-3">
            <p className="text-sm font-semibold">{ETIQUETA_6M[cat]}</p>
            <ul className="mt-1 flex list-none flex-col gap-1">
              {deLaCategoria.map((c, i) => (
                <li key={i} className="break-words text-sm">
                  {c.texto}
                  <span className="block text-xs text-muted-foreground">
                    {c.confirmada
                      ? `Confirmada · impacto ${ETIQUETA_IMPACTO[c.impacto as ImpactoDeCausa].toLowerCase()}${c.requiereAccion ? " · requiere acción" : ""}`
                      : "Posible, sin confirmar"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function Otro({ contenido }: { contenido: ContenidoOtroMetodo }) {
  return (
    <dl className="grid grid-cols-1 gap-2">
      <Dato etiqueta="Método">{contenido.nombre}</Dato>
      <Dato etiqueta="Descripción">{contenido.descripcion}</Dato>
    </dl>
  );
}

/** Lee lo guardado con el esquema de su método; `null` si no pasa. */
function leido(a: Analisis): ContenidoCincoPorques | ContenidoIshikawa | ContenidoOtroMetodo | null {
  try {
    return a.metodo === "cinco_porques" || a.metodo === "ishikawa" || a.metodo === "otro" ? leerContenido(a.metodo, a.contenido) : null;
  } catch {
    return null;
  }
}

/** El contenido guardado se vuelve a leer con el esquema de su método: lo que no pasa no rompe la página. */
function ContenidoDe({ a }: { a: Analisis }) {
  const c = leido(a);
  if (c === null) return <p className="text-sm text-muted-foreground">No se pudo leer este análisis.</p>;
  if (a.metodo === "cinco_porques") return <CincoPorques contenido={c as ContenidoCincoPorques} />;
  if (a.metodo === "ishikawa") return <Ishikawa contenido={c as ContenidoIshikawa} />;
  return <Otro contenido={c as ContenidoOtroMetodo} />;
}

function resumenDe(ronda: RondaDeDetalle): string {
  const partes = [
    ronda.analisis.length > 0 ? `${ronda.analisis.length} análisis` : "Sin análisis",
    ronda.causas.length > 0 ? `${ronda.causas.length} ${ronda.causas.length === 1 ? "causa raíz" : "causas raíz"}` : "sin causas raíz",
  ];
  return partes.join(" · ");
}

/**
 * «3. Causa raíz» de la página del hallazgo (spec 15 §9 y §16.2), solo lectura: los análisis de la ronda, sus causas raíz y
 * las dos preguntas de cierre. Plegable: abierta mientras es la etapa en curso. Los archivos de la ronda llegan como hijos.
 */
export function AnalisisEnLectura({
  ronda,
  titulo = "3. Causa raíz",
  abierta,
  children,
}: {
  ronda: RondaDeDetalle;
  titulo?: string;
  abierta: boolean;
  children?: React.ReactNode;
}) {
  const leidos = leerCambios(ronda.cambios);
  const c = leidos ?? null;
  const hayCambios = c !== null && (c.documentos || c.riesgos || c.controles);
  const cuales = c ? [c.documentos ? "documentos" : null, c.riesgos ? "matriz de riesgos" : null, c.controles ? "controles" : null].filter(Boolean).join(", ") : "";
  return (
    <details open={abierta} className="group rounded-lg border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 rounded-lg px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca">
        <span className="min-w-0">
          <span className="block font-display text-base font-semibold">{titulo}</span>
          <span className="block break-words text-sm text-muted-foreground">{resumenDe(ronda)}</span>
        </span>
        <ChevronDown aria-hidden="true" className="mt-1 size-4 shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-4 border-t border-linea-suave px-4 py-3">
        {ronda.analisis.map((a) => (
          <section key={a.id} aria-label={`Análisis: ${metodo(a.metodo)}`} className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">{metodo(a.metodo)}</h3>
            {a.equipo ? <p className="break-words text-xs text-muted-foreground">Equipo: {a.equipo}</p> : null}
            <ContenidoDe a={a} />
            {a.observaciones ? <p className="whitespace-pre-line break-words text-sm">Observaciones: {a.observaciones}</p> : null}
          </section>
        ))}
        {children}
        {ronda.causas.length > 0 ? (
          <div className="border-t border-linea-suave pt-3">
            <h3 className="text-sm font-semibold">Causas raíz</h3>
            <ol className="mt-1 list-decimal pl-5 text-sm">
              {ronda.causas.map((x) => (
                <li key={x.id} className="break-words">
                  {x.texto}
                  {x.sinAccionPorque ? <span className="block text-xs text-muted-foreground">Sin acción porque: {x.sinAccionPorque}</span> : null}
                </li>
              ))}
            </ol>
          </div>
        ) : null}
        {ronda.similares !== null || leidos !== null ? (
          <dl className="grid grid-cols-1 gap-3 border-t border-linea-suave pt-3 sm:grid-cols-2">
            {ronda.similares !== null ? (
              <Dato etiqueta="¿Hay no conformidades similares en otros procesos?">
                {ronda.similares ? `Sí: ${ronda.similaresDetalle ?? ""}` : "No"}
              </Dato>
            ) : null}
            {leidos !== null ? (
              <Dato etiqueta="¿Se requieren cambios en documentos, riesgos o controles?">
                {c === null ? "No se pudo leer esta respuesta." : hayCambios ? `Sí (${cuales}): ${c.descripcion ?? ""}` : "No"}
              </Dato>
            ) : null}
          </dl>
        ) : null}
      </div>
    </details>
  );
}
