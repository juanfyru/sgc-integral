// Flechas entre bandas, con las tres convenciones del mapa oficial.
// Conectan BANDAS, no tarjetas: sobreviven a cualquier cambio de contenido (D1).
type Tipo = "dirige" | "soporte" | "mejora";

const TITULOS: Record<Tipo, string> = {
  dirige: "Orientan y dirigen",
  soporte: "Interacción y soporte",
  mejora: "Evaluación y mejora continua",
};

export function Conector({ tipo }: { tipo: Tipo }) {
  return (
    <div
      className="flex justify-center py-0.5"
      aria-hidden="true"
      title={TITULOS[tipo]}
    >
      <svg width="20" height="26" viewBox="0 0 20 26" fill="none">
        {tipo === "dirige" && (
          <g className="text-verde" stroke="currentColor" fill="currentColor">
            <line x1="10" y1="2" x2="10" y2="17" strokeWidth="2.5" />
            <path d="M10 25 L4.5 16.5 H15.5 Z" stroke="none" />
          </g>
        )}
        {tipo === "soporte" && (
          <g className="text-marca" stroke="currentColor" fill="currentColor">
            <line x1="10" y1="7" x2="10" y2="19" strokeWidth="2.5" />
            <path d="M10 1 L4.5 8.5 H15.5 Z" stroke="none" />
            <path d="M10 25 L4.5 17.5 H15.5 Z" stroke="none" />
          </g>
        )}
        {tipo === "mejora" && (
          <g className="text-verde-texto" stroke="currentColor" fill="currentColor">
            <line
              x1="10"
              y1="2"
              x2="10"
              y2="17"
              strokeWidth="2"
              strokeDasharray="3 3"
            />
            <path d="M10 25 L5 17.5 H15 Z" stroke="none" />
          </g>
        )}
      </svg>
    </div>
  );
}
