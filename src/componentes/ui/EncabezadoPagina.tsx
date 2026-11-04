import { Migas, type Miga } from "@/componentes/navegacion/Migas";

export function EncabezadoPagina({
  titulo,
  descripcion,
  superior,
  acciones,
  migas,
}: {
  titulo: string;
  descripcion?: string;
  superior?: string;
  acciones?: React.ReactNode;
  migas?: Miga[];
}) {
  return (
    <header className="mb-6 space-y-3">
      {migas && migas.length > 0 ? <Migas items={migas} /> : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {superior ? (
            <p className="text-xs font-medium uppercase tracking-wide text-texto-terciario">
              {superior}
            </p>
          ) : null}
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {titulo}
          </h1>
          {descripcion ? (
            <p className="mt-1 text-sm text-muted-foreground">{descripcion}</p>
          ) : null}
        </div>
        {acciones ? (
          <div className="flex flex-wrap items-center gap-2">{acciones}</div>
        ) : null}
      </div>
    </header>
  );
}
