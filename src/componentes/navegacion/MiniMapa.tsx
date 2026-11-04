import Link from "next/link";

const BANDAS = ["estrategicos", "misionales", "apoyo", "evaluacion"] as const;

/**
 * Indicador compacto de posición: las cuatro bandas del mapa con la banda
 * actual resaltada en su color. Es también el atajo de regreso al mapa.
 */
export function MiniMapa({
  banda,
  nombreMacro,
}: {
  banda: string;
  nombreMacro: string;
}) {
  return (
    <Link
      href="/"
      aria-label={`Volver al mapa de procesos — está en la banda ${nombreMacro}`}
      className="group inline-flex items-center gap-2.5 rounded-lg border border-border bg-card px-2.5 py-2 shadow-xs transition-colors hover:border-[var(--color-banda)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-banda)]"
    >
      <span className="flex w-7 flex-col gap-[3px]" aria-hidden="true">
        {BANDAS.map((b) => (
          <span
            key={b}
            className={
              b === banda
                ? "h-[5px] rounded-sm bg-[var(--color-banda)]"
                : "h-[5px] rounded-sm bg-border transition-colors group-hover:banda-tinte"
            }
          />
        ))}
      </span>
      <span className="text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground">
        Mapa de procesos
      </span>
    </Link>
  );
}
