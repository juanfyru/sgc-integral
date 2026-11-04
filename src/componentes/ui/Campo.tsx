import { cloneElement } from "react";

export const claseControl =
  "rounded-md border border-border bg-card px-3 py-2 text-foreground outline-none focus:border-marca focus:ring-2 focus:ring-marca/20";

export function Campo({
  etiqueta,
  nombre,
  ayuda,
  error,
  children,
}: {
  etiqueta: string;
  nombre: string;
  ayuda?: string;
  error?: string;
  children: React.ReactElement;
}) {
  const descritoPor =
    [ayuda ? `${nombre}-ayuda` : null, error ? `${nombre}-error` : null]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={nombre} className="text-sm font-medium">
        {etiqueta}
      </label>
      {cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        id: nombre,
        name: nombre,
        "aria-describedby": descritoPor,
        "aria-invalid": error ? "true" : undefined,
      })}
      {ayuda ? (
        <p id={`${nombre}-ayuda`} className="text-xs text-muted-foreground">
          {ayuda}
        </p>
      ) : null}
      {error ? (
        <p
          id={`${nombre}-error`}
          role="alert"
          className="text-xs text-estado-critico-texto"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
