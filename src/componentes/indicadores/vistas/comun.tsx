import Link from "next/link";

export const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";
export const ENLACE = `rounded-sm text-marca underline-offset-2 hover:underline ${FOCO}`;

/** La página de un indicador (como `rutaDeIndicador` de las páginas). */
export const rutaDe = (codigo: string) => `/indicadores/${encodeURIComponent(codigo)}`;

/** Un aviso con el borde del color del módulo: el estado de una versión, la baja de un indicador. */
export function Recuadro({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-l-4 border-border border-l-mod-indicadores bg-muted px-4 py-3 text-sm">{children}</div>
  );
}

export type PestanaDeIndicador = "resultados" | "ficha" | "versiones" | "observaciones";

/** Las pestañas de la página de un indicador (spec §12.3): «Observaciones», con su número, solo para quien las ve. */
export function PestanasDeIndicador({
  codigo,
  activa,
  conVersiones,
  conResultados,
  observaciones,
}: {
  codigo: string;
  activa: PestanaDeIndicador;
  conVersiones: boolean;
  conResultados: boolean;
  /** Cuántas observaciones tiene, para quien las ve; `null` sin la pestaña. */
  observaciones: number | null;
}) {
  const pestanas: { clave: PestanaDeIndicador; etiqueta: string }[] = [];
  if (conResultados) pestanas.push({ clave: "resultados", etiqueta: "Resultados" });
  pestanas.push({ clave: "ficha", etiqueta: "Ficha técnica" });
  if (conVersiones) pestanas.push({ clave: "versiones", etiqueta: "Versiones" });
  if (observaciones !== null) pestanas.push({ clave: "observaciones", etiqueta: `Observaciones · ${observaciones}` });
  return (
    <nav aria-label="Vistas del indicador">
      <ul className="flex list-none flex-wrap gap-1 border-b border-border">
        {pestanas.map((p) => (
          <li key={p.clave} className="-mb-px">
            <Link
              href={`${rutaDe(codigo)}?vista=${p.clave}`}
              aria-current={p.clave === activa ? "page" : undefined}
              className={`inline-block rounded-t-md border-b-2 px-3 py-2 text-sm ${FOCO} ${
                p.clave === activa ? "border-mod-indicadores font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.etiqueta}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
