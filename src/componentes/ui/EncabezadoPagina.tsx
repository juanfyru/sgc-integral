import { Migas, type Miga } from "@/componentes/navegacion/Migas";

export function EncabezadoPagina({
  titulo,
  descripcion,
  superior,
  codigo,
  insignias,
  icono,
  acciones,
  migas,
  tituloEnfocable,
}: {
  titulo: string;
  descripcion?: React.ReactNode;
  superior?: string;
  codigo?: string;
  insignias?: React.ReactNode;
  icono?: React.ReactNode;
  acciones?: React.ReactNode;
  migas?: Miga[];
  /** El foco puede llegar al título desde el código, cuando el control que lo tenía desaparece. */
  tituloEnfocable?: boolean;
}) {
  return (
    <header className="mb-6 space-y-3">
      {migas && migas.length > 0 ? <Migas items={migas} /> : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          {icono ?? null}
          <div className="min-w-0">
            {superior ? (
              <p className="text-xs font-medium uppercase tracking-wide text-texto-terciario">
                {superior}
              </p>
            ) : null}
            {codigo || insignias ? (
              <div className="mb-1 flex flex-wrap items-center gap-2.5">
                {codigo ? (
                  <span className="font-mono text-xs tracking-wide text-muted-foreground">
                    {codigo}
                  </span>
                ) : null}
                {insignias}
              </div>
            ) : null}
            <h1 tabIndex={tituloEnfocable ? -1 : undefined} className="font-display text-2xl font-semibold tracking-tight">
              {titulo}
            </h1>
            {descripcion ? (
              <p className="mt-1 text-sm text-muted-foreground">{descripcion}</p>
            ) : null}
          </div>
        </div>
        {acciones ? (
          <div className="flex flex-wrap items-center gap-2">{acciones}</div>
        ) : null}
      </div>
    </header>
  );
}
