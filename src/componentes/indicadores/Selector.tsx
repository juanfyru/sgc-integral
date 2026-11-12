import { claseControl } from "@/componentes/ui/Campo";

/**
 * Un selector de los filtros del módulo (la lista y la matriz), con su etiqueta visible. `className` da el ancho del
 * contenedor según dónde va; el control ocupa todo ese ancho.
 */
export function Selector({
  id,
  nombre,
  etiqueta,
  valor,
  className = "",
  children,
}: {
  id: string;
  nombre: string;
  etiqueta: string;
  valor: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="text-sm font-medium">
        {etiqueta}
      </label>
      <select id={id} name={nombre} defaultValue={valor} className={`${claseControl} w-full max-w-full`}>
        {children}
      </select>
    </div>
  );
}
