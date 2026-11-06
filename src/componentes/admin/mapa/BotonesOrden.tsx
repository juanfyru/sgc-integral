import { ChevronDown, ChevronUp } from "lucide-react";
import { moverAccion } from "@/app/admin/acciones-mapa";
import type { Tabla } from "@/db/consultas/mapa-admin";

// Sube/baja una fila intercambiando su orden con el vecino. Botones reales
// (accesibles), deshabilitados en los extremos.
export function BotonesOrden({
  tabla,
  id,
  esPrimero,
  esUltimo,
}: {
  tabla: Tabla;
  id: number;
  esPrimero: boolean;
  esUltimo: boolean;
}) {
  return (
    <span className="inline-flex gap-1">
      {(["arriba", "abajo"] as const).map((direccion) => {
        const deshabilitado = direccion === "arriba" ? esPrimero : esUltimo;
        return (
          <form action={moverAccion} key={direccion}>
            <input type="hidden" name="tabla" value={tabla} />
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="direccion" value={direccion} />
            <button
              type="submit"
              disabled={deshabilitado}
              aria-label={direccion === "arriba" ? "Subir" : "Bajar"}
              className="grid size-7 place-items-center rounded-md border hover:bg-muted disabled:cursor-not-allowed disabled:border-dashed disabled:bg-muted disabled:text-muted-foreground"
            >
              {direccion === "arriba" ? (
                <ChevronUp className="size-4" aria-hidden="true" />
              ) : (
                <ChevronDown className="size-4" aria-hidden="true" />
              )}
            </button>
          </form>
        );
      })}
    </span>
  );
}
