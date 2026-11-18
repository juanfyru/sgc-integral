import { Check } from "lucide-react";

export type PasoDeRecorrido = {
  clave: string;
  etiqueta: string;
  estado: "hecho" | "actual" | "falta";
  /** Una fecha o un dato corto debajo de la etiqueta («4 nov», «45 %»). */
  nota?: string;
};

const TEXTO_ESTADO = { hecho: "Hecho", actual: "En curso", falta: "Falta" } as const;

/**
 * El recorrido de un hallazgo (spec 15 §16.2, maqueta 2): dónde va. No es un control: es una lista de lectura. El estado
 * de cada paso va siempre en texto (para lectores de pantalla y a 390 px, donde la lista se apila), no solo en color. Cada paso
 * crece desde un ancho base y nunca encoge por debajo de su palabra más larga: las etiquetas cortan solo entre palabras y, si
 * no caben, los pasos pasan a otra fila (nunca una barra horizontal en la página).
 */
export function Recorrido({ pasos }: { pasos: readonly PasoDeRecorrido[] }) {
  return (
    <ol aria-label="Recorrido del hallazgo" className="flex list-none flex-wrap gap-2">
      {pasos.map((p) => (
        <li
          key={p.clave}
          data-estado={p.estado}
          aria-current={p.estado === "actual" ? "step" : undefined}
          className={`grow basis-24 rounded-md border px-2 py-1.5 text-xs ${
            p.estado === "actual"
              ? "border-mod-planes bg-card font-semibold text-foreground"
              : p.estado === "hecho"
                ? "border-estado-bien/40 bg-estado-bien-fondo text-estado-bien-texto"
                : "border-dashed border-border text-muted-foreground"
          }`}
        >
          <span className="flex items-center gap-1 font-medium">
            {p.estado === "hecho" ? <Check aria-hidden="true" className="size-3.5 shrink-0" /> : null}
            <span>{p.etiqueta}</span>
          </span>
          <span className="block">{TEXTO_ESTADO[p.estado]}</span>
          {p.nota ? <span className="block tabular-nums">{p.nota}</span> : null}
        </li>
      ))}
    </ol>
  );
}
