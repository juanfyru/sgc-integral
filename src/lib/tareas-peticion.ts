import { cache } from "react";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { esResponsableTecnicoDePeticion } from "@/db/consultas/vigencia/externos";
import { misTareas, type Tarea } from "@/lib/tareas";

/**
 * «Mis tareas» de la petición en curso (Ruling 68): el cascarón y la página de inicio las comparten con `React.cache`
 * (la sesión es el mismo objeto en el layout y en la página: `sesionActual` va en caché). Trae también si la persona es
 * responsable técnico, que la barra necesita: una sola pregunta para las dos cosas, también compartida con la guarda de
 * Vigencia. Si no se puede saber, se registra y vale falso: es una marca de la barra y de sus tareas, y la página sigue.
 * `vencidos` y `vencidasIndicadores` son las insignias de «Vigencia» y de «Indicadores».
 */
export const tareasDePeticion = cache(
  async (
    sesion: SesionFlujo,
  ): Promise<{ tareas: Tarea[]; total: number; vencidos: number; vencidasIndicadores: number; responsableTecnico: boolean }> => {
    const responsableTecnico = await esResponsableTecnicoDePeticion(sesion.usuarioId).catch((err: unknown) => {
      console.error("No se pudo saber si la persona es responsable técnico de algún externo:", err);
      return false;
    });
    return { ...(await misTareas(sesion, { responsableTecnico })), responsableTecnico };
  },
);
