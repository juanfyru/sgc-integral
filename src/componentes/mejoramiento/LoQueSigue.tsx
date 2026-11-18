/**
 * «Lo que sigue» (spec 15 §16.2): lo que le toca a quien mira, o quién tiene el turno. A quien puede dar el paso, la página
 * le pasa su formulario como hijo (según `loQueSigue.paso` y `loQueSigue.puede`, de `leerHallazgo`); a los demás no les
 * pasa nada y el texto solo informa, sin controles. `nota` (`loQueSigue.nota`) va donde iría el botón: por qué quien mira no
 * da el paso que su rol le daría.
 */
export function LoQueSigue({ texto, nota, children }: { texto: string; nota?: string; children?: React.ReactNode }) {
  return (
    <section aria-labelledby="lo-que-sigue" className="rounded-lg border border-border bg-card p-4">
      <h2 id="lo-que-sigue" className="font-display text-base font-semibold">
        Lo que sigue
      </h2>
      <p className="mt-2 text-sm">{texto}</p>
      {nota ? <p className="mt-3 text-sm">{nota}</p> : null}
      {children ? <div className="mt-3 flex min-w-0 flex-col gap-3">{children}</div> : null}
    </section>
  );
}
