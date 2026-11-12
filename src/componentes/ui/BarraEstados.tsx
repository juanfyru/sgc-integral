/**
 * Cuántos indicadores hay en cada estado (spec §11, encima de la lista): una barra de proporciones y, debajo, la misma
 * cuenta escrita, que es la que se lee («19 bien, 7 en atención, 3 críticos, 3 sin dato»). La barra no se lee aparte.
 * «No aplica» se cuenta aparte de «sin dato» y, si hay, se escribe («1 no aplica»); su segmento va en el tono neutro con
 * rayas, para no confundirse con el de «sin dato» por el color solo (Tarea 19, D-11).
 */
export function BarraEstados({
  bien,
  atencion,
  critico,
  sinDato,
  noAplica = 0,
}: {
  bien: number;
  atencion: number;
  critico: number;
  sinDato: number;
  noAplica?: number;
}) {
  const total = bien + atencion + critico + sinDato + noAplica;
  // Clases literales: Tailwind solo genera las que ve escritas completas.
  const partes = [
    { cuantos: bien, clase: "bg-estado-bien", texto: `${bien} bien` },
    { cuantos: atencion, clase: "bg-estado-atencion", texto: `${atencion} en atención` },
    { cuantos: critico, clase: "bg-estado-critico", texto: `${critico} ${critico === 1 ? "crítico" : "críticos"}` },
    { cuantos: sinDato, clase: "bg-estado-sin-dato", texto: `${sinDato} sin dato` },
    ...(noAplica > 0 ? [{ cuantos: noAplica, clase: "barra-no-aplica", texto: `${noAplica} no aplica` }] : []),
  ];
  return (
    <div className="tubo-color-exacto flex min-w-0 flex-col gap-1.5">
      <div aria-hidden="true" className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        {total > 0
          ? partes
              .filter((p) => p.cuantos > 0)
              .map((p) => <span key={p.clase} className={p.clase} style={{ width: `${(p.cuantos * 100) / total}%` }} />)
          : null}
      </div>
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
        {partes.map((p, i) => (
          <span key={p.clase} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${p.clase}`} />
            {i < partes.length - 1 ? `${p.texto}, ` : p.texto}
          </span>
        ))}
      </p>
    </div>
  );
}
