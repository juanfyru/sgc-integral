import { borrarAccion } from "@/app/admin/acciones-mapa";
import type { Tabla } from "@/db/consultas/mapa-admin";

// Borrado duro con confirmación por <details> nativo. La página solo renderiza
// este componente cuando el nodo no tiene dependientes.
export function BotonBorrar({
  tabla,
  id,
  volverA,
}: {
  tabla: Tabla;
  id: number;
  volverA: string;
}) {
  return (
    <details className="inline-block">
      <summary className="cursor-pointer rounded-md border border-red-200 px-2.5 py-1 text-xs text-red-700 hover:bg-red-50">
        Borrar
      </summary>
      <form action={borrarAccion} className="mt-2 flex items-center gap-2">
        <input type="hidden" name="tabla" value={tabla} />
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="volverA" value={volverA} />
        <span className="text-xs text-muted-foreground">¿Seguro? Es permanente.</span>
        <button
          type="submit"
          className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700"
        >
          Sí, borrar
        </button>
      </form>
    </details>
  );
}
