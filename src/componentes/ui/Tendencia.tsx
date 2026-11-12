import { puntosDeTendencia, type EstadoDePunto } from "./geometria-tubos";

const G = { ancho: 64, alto: 18, margen: 3 };

// Clases literales: Tailwind solo genera las que ve escritas completas.
const PUNTO_FINAL: Record<EstadoDePunto, string> = {
  bien: "fill-estado-bien",
  atencion: "fill-estado-atencion",
  critico: "fill-estado-critico",
  "sin-meta": "fill-tubo-neutro",
  "sin-dato": "fill-muted-foreground",
  "no-aplica": "fill-muted-foreground",
  futuro: "fill-muted-foreground",
};

/**
 * La tendencia en miniatura de una fila de la lista (spec §11): los últimos valores en una línea que se corta donde
 * falta un dato, y el último periodo como un punto con el color de su estado. La `descripcion` es su nombre accesible;
 * el estado y la flecha van escritos en la fila.
 */
export function Tendencia({
  valores,
  estadoFinal,
  descripcion,
}: {
  valores: (number | null)[];
  estadoFinal: EstadoDePunto | null;
  descripcion: string;
}) {
  const { tramos, ultimo } = puntosDeTendencia(valores, G);
  return (
    <svg viewBox={`0 0 ${G.ancho} ${G.alto}`} width={G.ancho} height={G.alto} role="img" aria-label={descripcion} className="shrink-0 overflow-visible">
      {tramos.map((t, i) =>
        t.length > 1 ? (
          <polyline
            key={i}
            points={t.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            className="stroke-muted-foreground"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : t[0] === ultimo ? null : (
          <circle key={i} cx={t[0].x} cy={t[0].y} r={1.25} className="fill-muted-foreground" />
        ),
      )}
      {ultimo ? (
        <circle
          cx={ultimo.x}
          cy={ultimo.y}
          r={2.75}
          className={`${estadoFinal ? PUNTO_FINAL[estadoFinal] : "fill-muted-foreground"} stroke-card`}
          strokeWidth={1}
        />
      ) : null}
    </svg>
  );
}
