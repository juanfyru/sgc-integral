"use client";

import { Campo, claseControl } from "@/componentes/ui/Campo";
import { AVISO_DESAGREGACION, type OpcionesFicha } from "@/lib/indicadores/tipos";

const CONTROL = `${claseControl} w-full min-w-0 max-w-full`;

/**
 * «Desagregación» (anexo 14C, §5.2): ninguna o una dimensión. Con una elegida, el aviso de que el total suma cada variable
 * entre las categorías. La que la versión ya cita sigue entre las opciones aunque se haya desactivado, marcada.
 */
export function CampoDesagregacion({
  dimensiones,
  valor,
  alElegir,
  error,
}: {
  dimensiones: OpcionesFicha["dimensiones"];
  valor: number | "";
  alElegir: (id: number | "") => void;
  error?: string;
}) {
  return (
    <Campo etiqueta="Desagregación" nombre="dimensionId" id="ficha-dimensionId" error={error} ayuda={valor === "" ? undefined : AVISO_DESAGREGACION}>
      <select value={valor} onChange={(e) => alElegir(e.target.value ? Number(e.target.value) : "")} className={CONTROL}>
        <option value="">(ninguna)</option>
        {dimensiones.map((d) => (
          <option key={d.id} value={d.id}>
            {d.inactiva ? `${d.nombre} (inactiva)` : d.nombre}
          </option>
        ))}
      </select>
    </Campo>
  );
}
