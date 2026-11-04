import { Icono, NOMBRES_ICONO } from "@/componentes/iconos";

// Selector de ícono restringido al catálogo (un nombre fuera de él se rechaza
// en el servidor). Muestra el ícono actual junto al desplegable.
export function SelectorIcono({
  nombre,
  actual,
  requerido,
}: {
  nombre: string;
  actual: string | null;
  requerido?: boolean;
}) {
  return (
    <span className="flex items-center gap-2">
      <span className="grid size-9 place-items-center rounded-md border">
        <Icono nombre={actual} className="size-4.5" />
      </span>
      <select
        name={nombre}
        defaultValue={actual ?? ""}
        required={requerido}
        className="rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-marca focus:ring-2 focus:ring-marca/20"
      >
        {!requerido && <option value="">(sin ícono)</option>}
        {NOMBRES_ICONO.map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
    </span>
  );
}
