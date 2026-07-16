// Ciclo PHVA del mapa oficial: cuatro cuadrantes P·H·V·A alrededor de un
// centro blanco. SVG decorativo con equivalente textual accesible.
export function Phva({
  titulo,
  texto,
}: {
  titulo: string;
  texto: string;
}) {
  // Orden del mapa oficial, en el sentido del reloj desde arriba-izquierda:
  // Planear, Hacer, Verificar, Actuar.
  const cuadrantes = [
    { letra: "P", nombre: "Planear", d: "M60 60 L10 60 A50 50 0 0 1 60 10 Z", color: "var(--color-verde)", lx: 38, ly: 40 },
    { letra: "H", nombre: "Hacer", d: "M60 60 L60 10 A50 50 0 0 1 110 60 Z", color: "var(--color-azul)", lx: 82, ly: 40 },
    { letra: "V", nombre: "Verificar", d: "M60 60 L110 60 A50 50 0 0 1 60 110 Z", color: "var(--color-azul-profundo)", lx: 82, ly: 88 },
    { letra: "A", nombre: "Actuar", d: "M60 60 L60 110 A50 50 0 0 1 10 60 Z", color: "var(--color-verde-texto)", lx: 38, ly: 88 },
  ];

  return (
    <section
      aria-label={`Ciclo PHVA (Planear, Hacer, Verificar, Actuar) — ${titulo}: ${texto}`}
      className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-4 text-center shadow-xs"
    >
      <svg width="110" height="110" viewBox="0 0 120 120" aria-hidden="true">
        {cuadrantes.map((c) => (
          <g key={c.letra}>
            <path d={c.d} fill={c.color} stroke="white" strokeWidth="2.5" />
            <text
              x={c.lx}
              y={c.ly}
              textAnchor="middle"
              dominantBaseline="central"
              fill="white"
              fontSize="15"
              fontWeight="700"
              fontFamily="var(--font-archivo)"
            >
              {c.letra}
            </text>
          </g>
        ))}
        <circle cx="60" cy="60" r="21" fill="white" />
        <text
          x="60"
          y="60"
          textAnchor="middle"
          dominantBaseline="central"
          fill="var(--color-azul-tinta)"
          fontSize="11.5"
          fontWeight="800"
          fontFamily="var(--font-archivo)"
        >
          PHVA
        </text>
      </svg>
      <div aria-hidden="true">
        <p className="font-display text-sm font-bold text-verde-texto">
          {titulo}
        </p>
        <p className="mt-1 text-xs/relaxed text-muted-foreground">{texto}</p>
      </div>
    </section>
  );
}
