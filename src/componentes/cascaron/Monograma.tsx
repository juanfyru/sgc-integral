/** Sigla de la entidad sobre el color secundario: la marca cuando no hay logo. */
export function Monograma({ sigla, className }: { sigla: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center bg-[var(--marca-2-relleno)] font-display font-bold text-[var(--marca-2-contraste)]${className ? ` ${className}` : ""}`}
    >
      {sigla}
    </span>
  );
}
