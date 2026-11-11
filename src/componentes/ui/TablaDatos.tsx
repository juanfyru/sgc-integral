export type ColumnaTabla = {
  clave: string;
  etiqueta: string;
  numerica?: boolean;
  oculta?: boolean;
  /** Clases de más para el encabezado (una columna fija con `sticky`, por ejemplo). */
  clase?: string;
};

export const celda = "px-3 py-2 align-top border-t border-linea-suave";
export const celdaNumerica = `${celda} text-right tabular-nums`;

export function TablaDatos({
  titulo,
  columnas,
  filas,
  vacio,
  children,
}: {
  titulo: string;
  columnas: readonly ColumnaTabla[];
  filas: number;
  vacio: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="region"
      aria-label={titulo}
      tabIndex={0}
      className="relative overflow-x-auto rounded-lg border border-border print:overflow-visible print:border-0"
    >
      <table className="w-full text-sm print:text-xs">
        <caption className="sr-only">{titulo}</caption>
        <thead className="sticky top-0 bg-muted text-left print:static print:bg-transparent">
          <tr>
            {columnas.map((c) => (
              <th
                key={c.clave}
                scope="col"
                className={`px-3 py-2 font-medium${c.numerica ? " text-right" : ""}${c.clase ? ` ${c.clase}` : ""}`}
              >
                {c.oculta ? <span className="sr-only">{c.etiqueta}</span> : c.etiqueta}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas === 0 ? (
            <tr>
              <td
                colSpan={columnas.length}
                className="px-3 py-8 text-center text-muted-foreground"
              >
                {vacio}
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}
