/** Bloque de carga (no spinner). El brillo se apaga con prefers-reduced-motion. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} />;
}
