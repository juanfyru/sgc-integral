/** Lo que la vigencia de una persona necesita leer para sus tareas y su insignia (Ruling 68). Regla pura. */
import { puede, type SujetoPermiso } from "@/lib/permisos";

/**
 * Qué necesita la vigencia de la persona para sus tareas y su insignia: nada (ni semáforo ni externos a cargo), solo el
 * conteo de vencidos (ve el semáforo pero ninguna tarea de vigencia es suya: Gerencia y Control Interno sin externos a
 * cargo; Ruling 68) o las filas (las tareas de revisar, adoptar o verificar pueden ser suyas).
 */
export function modoDeVigencia(sesion: SujetoPermiso, responsableTecnico: boolean): "nada" | "conteo" | "filas" {
  const veSemaforo = puede(sesion, "vigencia.ver") || puede(sesion, "documentos.indicadores");
  if (!veSemaforo && !responsableTecnico) return "nada";
  // Revisar: el líder y el Admin SGC (F13A-DC2); adoptar: quien gestiona externos; verificar: el responsable técnico.
  const recibeTareas =
    responsableTecnico || sesion.rol === "lider_proceso" || sesion.rol === "admin_sgc" || puede(sesion, "externos.gestionar");
  return recibeTareas ? "filas" : "conteo";
}
