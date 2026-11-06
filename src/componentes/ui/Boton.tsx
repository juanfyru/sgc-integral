export type VarianteBoton = "primario" | "secundario" | "peligro" | "fantasma";

const VARIANTES: Record<VarianteBoton, string> = {
  primario: "bg-marca-relleno text-white hover:bg-marca-oscurecida",
  secundario: "border border-border bg-card hover:bg-muted",
  peligro:
    "bg-estado-critico-fondo text-estado-critico-texto border border-estado-critico/40",
  fantasma: "hover:bg-muted",
};

const TAMANOS = { sm: "px-2.5 py-1 text-xs", md: "px-3.5 py-2 text-sm" };

export function claseBoton(
  variante: VarianteBoton = "primario",
  tamano: "sm" | "md" = "md",
): string {
  return `inline-flex items-center justify-center gap-2 rounded-md font-medium disabled:cursor-not-allowed disabled:border disabled:border-dashed disabled:border-border disabled:bg-muted disabled:text-muted-foreground ${TAMANOS[tamano]} ${VARIANTES[variante]}`;
}

export function Boton({
  variante,
  tamano,
  pendiente,
  children,
  className,
  ...resto
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: VarianteBoton;
  tamano?: "sm" | "md";
  pendiente?: boolean;
}) {
  return (
    <button
      type="button"
      {...resto}
      className={`${claseBoton(variante, tamano)}${className ? ` ${className}` : ""}`}
      disabled={pendiente || resto.disabled}
      aria-busy={pendiente ? true : undefined}
    >
      {children}
    </button>
  );
}
