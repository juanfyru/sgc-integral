import Link from "next/link";
import { Check, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { Insignia } from "@/componentes/ui/Insignia";
import type { CeldaDeMatriz, MatrizLeida } from "@/db/consultas/indicadores/matriz";
import { MESES } from "@/lib/indicadores-documentales/periodo";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

// Clases literales: Tailwind solo genera las que ve escritas completas.
const FRANJA: Partial<Record<CeldaDeMatriz["estado"], string>> = {
  bien: "bg-estado-bien",
  atencion: "bg-estado-atencion",
  critico: "bg-estado-critico",
  "sin-meta": "bg-tubo-neutro",
};

/**
 * La forma de cada estado junto al valor (WCAG 1.4.1): el color de la franja nunca es la única diferencia entre Bien,
 * Atención y Crítico. Decorativa: el nombre accesible de la celda ya dice el estado.
 */
const GLIFO: Partial<Record<CeldaDeMatriz["estado"], { Icono: LucideIcon; clase: string }>> = {
  bien: { Icono: Check, clase: "text-estado-bien-texto" },
  atencion: { Icono: TriangleAlert, clase: "text-estado-atencion-texto" },
  critico: { Icono: X, clase: "text-estado-critico-texto" },
};

/** `bien-sin-alcanzar` es el «✓*» de un Bien que no alcanza la meta: la forma del Bien con un asterisco decorativo. */
type EstadoDeGlifo = CeldaDeMatriz["estado"] | "bien-sin-alcanzar";

function Glifo({ estado, cumple = null }: { estado: EstadoDeGlifo; cumple?: boolean | null }) {
  const sinAlcanzar = estado === "bien-sin-alcanzar" || (estado === "bien" && cumple === false);
  const clave = sinAlcanzar ? "bien" : estado;
  const g = GLIFO[clave as CeldaDeMatriz["estado"]];
  if (!g) return null;
  const icono = <g.Icono aria-hidden="true" data-glifo={sinAlcanzar ? "bien-sin-alcanzar" : estado} className={`size-3 shrink-0 ${g.clase}`} />;
  return sinAlcanzar ? (
    <>
      {icono}
      <span aria-hidden="true" className={`-ml-0.5 font-bold ${g.clase}`}>
        *
      </span>
    </>
  ) : (
    icono
  );
}

/** La leyenda de la matriz: cada estado con su franja, su forma y su nombre escrito (el color nunca va solo). */
export const LEYENDA_DE_MATRIZ = [
  { estado: "bien", clase: "bg-estado-bien", texto: "Bien" },
  { estado: "bien-sin-alcanzar", clase: "bg-estado-bien", texto: "Bien, sin alcanzar la meta" },
  { estado: "atencion", clase: "bg-estado-atencion", texto: "Atención" },
  { estado: "critico", clase: "bg-estado-critico", texto: "Crítico" },
  { estado: "sin-meta", clase: "bg-tubo-neutro", texto: "Sin meta" },
  { estado: "sin-dato", clase: null, texto: "Sin dato", muestra: "s. d." },
  { estado: "no-aplica", clase: null, texto: "No aplica", muestra: "n. a." },
  { estado: "futuro", clase: null, texto: "Por venir", muestra: "—" },
] as const;

export function LeyendaDeMatriz() {
  return (
    <ul aria-label="Leyenda" className="flex list-none flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {LEYENDA_DE_MATRIZ.map((l) => (
        <li key={l.texto} className="inline-flex items-center gap-1.5">
          {l.clase ? (
            <>
              <span aria-hidden="true" className={`tubo-color-exacto h-1 w-4 rounded-full ${l.clase}`} />
              <Glifo estado={l.estado} />
            </>
          ) : (
            <span aria-hidden="true" className="italic">
              {l.muestra}
            </span>
          )}
          <span>{l.texto}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Una celda: el valor con la forma de su estado y, abajo, la franja de su color. El nombre accesible lo dice entero
 * («marzo: 86 %, Bien»): en el enlace, como su nombre; sin enlace, en texto para lectores de pantalla. Lo que no se mide
 * queda vacío; «s. d.», «n. a.» y lo que no ha llegado, en gris.
 */
function Celda({ c, columnas = c.hastaMes - c.desdeMes + 1 }: { c: CeldaDeMatriz; columnas?: number }) {
  const franja = FRANJA[c.estado];
  const gris = c.estado === "sin-dato" || c.estado === "no-aplica" || c.estado === "futuro";
  const texto = `${gris ? "italic text-muted-foreground" : "text-foreground"} ${c.estado === "critico" ? "font-bold" : ""}`;
  return (
    <td colSpan={columnas} className="relative border-l border-linea-suave px-1.5 py-2 text-center tabular-nums whitespace-nowrap">
      {c.enlace ? (
        <Link href={c.enlace} aria-label={c.nombre} className={`inline-flex items-center gap-0.5 rounded-sm underline-offset-2 hover:underline ${FOCO} ${texto}`}>
          <Glifo estado={c.estado} cumple={c.cumple} />
          {c.texto}
        </Link>
      ) : c.estado === "vacia" ? (
        <span className="sr-only">{c.nombre}</span>
      ) : (
        <>
          <span aria-hidden="true" className={`inline-flex items-center gap-0.5 ${texto}`}>
            <Glifo estado={c.estado} cumple={c.cumple} />
            {c.texto}
          </span>
          <span className="sr-only">{c.nombre}</span>
        </>
      )}
      {franja ? <span aria-hidden="true" className={`tubo-color-exacto absolute inset-x-1 bottom-0.5 h-[3px] rounded-full ${franja}`} /> : null}
    </td>
  );
}

const MES_CORTO = MESES.map((m) => m.charAt(0).toUpperCase() + m.slice(1, 3));

/**
 * La matriz del año (spec §12.7, maqueta 5): una fila por indicador, agrupadas por proceso; doce columnas de mes y la del
 * año, el acumulado. Un periodo de varios meses ocupa sus celdas unidas. Se desplaza a lo ancho en pantallas angostas,
 * con la columna del indicador fija.
 */
export function MatrizDelAnio({ anio, procesos }: { anio: number; procesos: MatrizLeida["procesos"] }) {
  return (
    <div role="region" aria-label={`Matriz de ${anio}`} tabIndex={0} className={`relative overflow-x-auto rounded-lg border border-border print:overflow-visible print:border-0 ${FOCO}`}>
      <table className="w-full min-w-[60rem] border-collapse text-sm print:min-w-0 print:text-xs">
        <caption className="sr-only">{`Resultados de ${anio} por mes, agrupados por proceso; la última columna es el acumulado del año.`}</caption>
        <thead className="bg-muted print:bg-transparent">
          <tr>
            <th scope="col" className="sticky left-0 z-10 bg-muted px-3 py-2 text-left font-medium print:static print:bg-transparent">
              Indicador
            </th>
            {MES_CORTO.map((m, i) => (
              <th key={m} scope="col" className="border-l border-linea-suave px-1.5 py-2 text-center font-medium">
                <abbr title={MESES[i]} className="no-underline">
                  {m}
                </abbr>
              </th>
            ))}
            <th scope="col" className="border-l border-linea-suave px-2 py-2 text-center font-semibold">
              Año
            </th>
          </tr>
        </thead>
        {procesos.map((p) => (
          <tbody key={p.id}>
            <tr>
              <th scope="rowgroup" colSpan={14} className="border-t border-border bg-card px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {p.nombre}
              </th>
            </tr>
            {p.filas.map((f) => (
              <tr key={f.codigo} className="border-t border-linea-suave">
                <th scope="row" className="sticky left-0 z-10 min-w-56 max-w-72 bg-card px-3 py-2 text-left font-normal print:static">
                  <span className="mr-1.5 font-mono text-xs text-muted-foreground">{f.codigo}</span>
                  <span className="break-words">{f.nombre}</span>
                  {f.retirado ? (
                    <span className="ml-1.5 inline-block align-middle">
                      <Insignia variante="sin-dato">Retirado</Insignia>
                    </span>
                  ) : null}
                </th>
                {f.celdas.map((c) => (
                  <Celda key={c.desdeMes} c={c} />
                ))}
                <Celda c={f.anio} columnas={1} />
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
