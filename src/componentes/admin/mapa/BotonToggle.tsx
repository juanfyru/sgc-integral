import { alternarAccion } from "@/app/admin/acciones-mapa";
import type { Tabla } from "@/db/consultas/mapa-admin";

// Activar/desactivar simple (sin advertencia de huérfanos: tipos y periféricos).
export function BotonToggle({
  tabla,
  id,
  activo,
}: {
  tabla: Tabla;
  id: number;
  activo: boolean;
}) {
  return (
    <form action={alternarAccion}>
      <input type="hidden" name="tabla" value={tabla} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="activo" value={activo ? "false" : "true"} />
      <button
        type="submit"
        className="rounded-md border px-2.5 py-1 text-xs hover:bg-muted"
      >
        {activo ? "Desactivar" : "Activar"}
      </button>
    </form>
  );
}
