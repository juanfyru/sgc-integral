/**
 * Lo que el formulario muestra sin pedirlo cuando el hallazgo es reincidente (spec 15 §9.4): las causas y las acciones del
 * hallazgo anterior, para no repetir lo que ya se intentó. Solo lectura.
 */
export function LaVezPasada({ codigo, causas, acciones }: { codigo: string; causas: readonly string[]; acciones: readonly string[] }) {
  return (
    <section aria-labelledby="vez-pasada-titulo" className="rounded-lg border border-border bg-card p-4">
      <h3 id="vez-pasada-titulo" className="font-display text-base font-semibold">
        La vez pasada ({codigo})
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">Este hallazgo reincide: así se analizó y se resolvió el anterior.</p>
      <h4 className="mt-3 text-sm font-medium">Causas</h4>
      {causas.length === 0 ? (
        <p className="text-sm text-muted-foreground">No quedaron causas escritas.</p>
      ) : (
        <ul className="list-disc pl-5 text-sm">
          {causas.map((c, i) => (
            <li key={i} className="break-words">
              {c}
            </li>
          ))}
        </ul>
      )}
      <h4 className="mt-3 text-sm font-medium">Acciones</h4>
      {acciones.length === 0 ? (
        <p className="text-sm text-muted-foreground">No quedaron acciones escritas.</p>
      ) : (
        <ul className="list-disc pl-5 text-sm">
          {acciones.map((a, i) => (
            <li key={i} className="break-words">
              {a}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
