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
 * de cada paso va siempre en texto (para lectores de pantalla y a 390 px, donde la lista se apila), no solo en color.
 */
export function Recorrido({ pasos }: { pasos: readonly PasoDeRecorrido[] }) {
  return (
    <ol aria-label="Recorrido del hallazgo" className="grid list-none grid-cols-2 gap-2 sm:grid-cols-5 lg:grid-cols-10">
      {pasos.map((p) => (
        <li
          key={p.clave}
          data-estado={p.estado}
          aria-current={p.estado === "actual" ? "step" : undefined}
          className={`rounded-md border px-2 py-1.5 text-xs ${
            p.estado === "actual"
              ? "border-mod-planes bg-card font-semibold text-foreground"
              : p.estado === "hecho"
                ? "border-estado-bien/40 bg-estado-bien-fondo text-estado-bien-texto"
                : "border-dashed border-border text-muted-foreground"
          }`}
        >
          <span className="flex items-center gap-1 font-medium">
            {p.estado === "hecho" ? <Check aria-hidden="true" className="size-3.5 shrink-0" /> : null}
            <span className="min-w-0 break-words">{p.etiqueta}</span>
          </span>
          <span className="block">{TEXTO_ESTADO[p.estado]}</span>
          {p.nota ? <span className="block tabular-nums">{p.nota}</span> : null}
        </li>
      ))}
    </ol>
  );
}
