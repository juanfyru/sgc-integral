type EstadoCifra = "bien" | "atencion" | "critico" | "sin-dato";

const FRANJA: Record<EstadoCifra | "ninguno", string> = {
  bien: "border-t-estado-bien",
  atencion: "border-t-estado-atencion",
  critico: "border-t-estado-critico",
  "sin-dato": "border-t-estado-sin-dato",
  ninguno: "border-t-border",
};

export function TarjetaCifra({
  etiqueta,
  valor,
  detalle,
  estado,
  pie,
}: {
  etiqueta: string;
  valor: string | number;
  detalle?: string;
  estado?: EstadoCifra;
  /** Debajo del detalle, por ejemplo la insignia de cumplimiento de una meta. */
  pie?: React.ReactNode;
}) {
  return (
    <div
      data-estado={estado}
      className={`rounded-lg border border-border border-t-[3px] bg-card p-4 ${FRANJA[estado ?? "ninguno"]}`}
    >
      <p className="text-sm text-muted-foreground">{etiqueta}</p>
      <p className="mt-1 font-display text-2xl font-semibold tabular-nums">
        {valor}
      </p>
      {detalle ? (
        <p className="mt-1 text-xs text-muted-foreground">{detalle}</p>
      ) : null}
      {pie ? <div className="mt-2">{pie}</div> : null}
    </div>
  );
}
