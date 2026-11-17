/**
 * «Lo que sigue» (spec 15 §16.2): lo que le toca a quien mira, o quién tiene el turno. Las acciones de cada paso las
 * añaden las tareas 10 a 17 como hijos; sin ellas, el texto solo informa y no ofrece controles.
 */
export function LoQueSigue({ texto, children }: { texto: string; children?: React.ReactNode }) {
  return (
    <section aria-labelledby="lo-que-sigue" className="rounded-lg border border-border bg-card p-4">
      <h2 id="lo-que-sigue" className="font-display text-base font-semibold">
        Lo que sigue
      </h2>
      <p className="mt-2 text-sm">{texto}</p>
      {children ? <div className="mt-3 flex flex-wrap gap-2">{children}</div> : null}
    </section>
  );
}
