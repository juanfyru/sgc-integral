import { Bell } from "lucide-react";
import { marcarNotificacionLeidaAccion } from "@/app/acciones-cuenta";
import type { Notificacion } from "@/db/consultas/notificaciones";
import { Desplegable } from "./Desplegable";
import { MarcarTodasLeidas } from "./MarcarTodasLeidas";
import { tiempoRelativo } from "@/lib/zona-horaria";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/** Campana sobre un <details> (`Desplegable`): funciona sin JavaScript; cada aviso es un formulario que marca y navega. */
export function Campana({ noLeidas, recientes }: { noLeidas: number; recientes: Notificacion[] }) {
  const ahora = new Date();
  return (
    <Desplegable
      etiquetaResumen={`Notificaciones, ${noLeidas} sin leer`}
      claseResumen={`relative flex size-9 cursor-pointer list-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground [&::-webkit-details-marker]:hidden ${FOCO}`}
      resumen={
        <>
          <Bell className="size-5" aria-hidden="true" />
          {noLeidas > 0 && (
            <span
              aria-hidden="true"
              className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-estado-critico-fondo px-1 text-center text-[10px] font-semibold leading-4 text-estado-critico-texto ring-1 ring-estado-critico"
            >
              {noLeidas > 9 ? "9+" : noLeidas}
            </span>
          )}
        </>
      }
    >
      {/* A 390 px la campana no está en el borde de la barra: anclado a ella, el panel se saldría por la izquierda. */}
      <div className="fixed inset-x-4 top-16 z-50 rounded-xl border border-border bg-card p-2 shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-80">
        {recientes.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">
            Sin notificaciones. Aquí verá los avisos del sistema y las tareas que le asignen.
          </p>
        ) : (
          <ul className="max-h-96 overflow-y-auto">
            {recientes.map((n) => (
              <li key={n.id}>
                <form action={marcarNotificacionLeidaAccion}>
                  <input type="hidden" name="id" value={n.id} />
                  <button
                    type="submit"
                    className={`block w-full rounded-md px-2 py-2 text-left hover:bg-muted ${FOCO}`}
                  >
                    <span className={`block text-sm text-foreground ${n.leidaEn ? "" : "font-medium"}`}>
                      {n.leidaEn ? null : <span className="sr-only">Sin leer: </span>}
                      {n.titulo}
                    </span>
                    {n.cuerpo && <span className="block text-xs text-muted-foreground">{n.cuerpo}</span>}
                    <span className="block text-xs text-texto-terciario">{tiempoRelativo(n.creadoEn, ahora)}</span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        {noLeidas > 0 && <MarcarTodasLeidas />}
      </div>
    </Desplegable>
  );
}
