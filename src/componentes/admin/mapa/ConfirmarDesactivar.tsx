import { alternarAccion } from "@/app/admin/acciones-mapa";
import type { Tabla } from "@/db/consultas/mapa-admin";

// Activar/desactivar para nodos del mapa. Al desactivar con documentos vigentes
// debajo, expande una advertencia con los códigos que dejarán de aparecer en el
// mapa (siguen vigentes y buscables) antes de confirmar.
export function ConfirmarDesactivar({
  tabla,
  id,
  activo,
  afectados,
}: {
  tabla: Tabla;
  id: number;
  activo: boolean;
  afectados: string[];
}) {
  if (!activo) {
    return (
      <form action={alternarAccion}>
        <input type="hidden" name="tabla" value={tabla} />
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="activo" value="true" />
        <button type="submit" className="rounded-md border px-2.5 py-1 text-xs hover:bg-muted">
          Activar
        </button>
      </form>
    );
  }
  if (afectados.length === 0) {
    return (
      <form action={alternarAccion}>
        <input type="hidden" name="tabla" value={tabla} />
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="activo" value="false" />
        <button type="submit" className="rounded-md border px-2.5 py-1 text-xs hover:bg-muted">
          Desactivar
        </button>
      </form>
    );
  }
  return (
    <details className="inline-block">
      <summary className="cursor-pointer rounded-md border border-amber-300 px-2.5 py-1 text-xs text-amber-800 hover:bg-amber-50">
        Desactivar…
      </summary>
      <div className="mt-2 max-w-sm rounded-md border border-amber-300 bg-amber-50 p-3 text-xs">
        <p className="mb-1 font-medium text-amber-900">
          ⚠ {afectados.length} documento(s) vigente(s) dejarán de aparecer en el mapa
          (seguirán vigentes y en el buscador):
        </p>
        <p className="mb-2 font-mono text-amber-800">{afectados.join(" · ")}</p>
        <form action={alternarAccion}>
          <input type="hidden" name="tabla" value={tabla} />
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="activo" value="false" />
          <button
            type="submit"
            className="rounded-md bg-amber-600 px-2.5 py-1 font-medium text-white hover:bg-amber-700"
          >
            Desactivar igual
          </button>
        </form>
      </div>
    </details>
  );
}
