import type { Cliente } from "@/db/cliente";
import {
  tareasDeAcuses,
  tareasDeCopias,
  tareasDeHallazgos,
  tareasDeSocializacion,
  tareasDeVerificacion,
} from "@/db/consultas/distribucion/tareas";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { listarTramites, type ResumenTramite } from "@/db/consultas/tramites";
import { tareasDeVigencia } from "@/db/consultas/vigencia/tareas";
import { zonaHoraria } from "@/lib/zona-horaria";

export type Tarea = {
  id: string; // "<fuente>:<id>", estable
  modulo: "documentos" | "indicadores" | "planes";
  titulo: string; // "Aprobar GTH-PR-12 v3"
  detalle: string | null; // "Inducción y reinducción"
  vence: Date | null;
  enlace: string; // ruta interna
};

export function tituloDeTarea(t: ResumenTramite): string {
  const codigo = t.codigo ?? t.numero;
  const documento = t.versionNumero === null ? codigo : `${codigo} v${t.versionNumero}`;
  const elimina = t.tipo === "eliminar";
  switch (t.etapa) {
    case "visto_bueno":
      return `Dar el visto bueno a ${t.numero}`;
    case "aceptacion":
      return `Aceptar ${t.numero}`;
    case "elaboracion":
      return `${t.ronda > 1 ? "Ajustar" : "Elaborar"} ${documento}`;
    case "revision":
      return `Revisar ${documento}`;
    case "aprobacion":
      return elimina ? `Aprobar la eliminación de ${codigo}` : `Aprobar ${documento}`;
    case "publicacion":
      return elimina ? `Eliminar ${codigo}` : `Publicar ${documento}`;
    default:
      return t.numero;
  }
}

/** Más de `umbral` lecturas por confirmar se muestran como una sola tarea, en el lugar de la primera. */
export function agruparTareas(tareas: Tarea[], umbral = 5): Tarea[] {
  const acuses = tareas.filter((t) => t.id.startsWith("acuse:"));
  if (acuses.length <= umbral) return tareas;
  const fechas = acuses.flatMap((t) => (t.vence ? [t.vence] : []));
  const vence = fechas.length > 0 ? new Date(Math.min(...fechas.map((f) => f.getTime()))) : null;
  const agrupada: Tarea = {
    id: "acuses",
    modulo: "documentos",
    titulo: `${acuses.length} lecturas por confirmar`,
    detalle: vence ? `La más próxima vence el ${new Intl.DateTimeFormat("es-CO", { dateStyle: "long", timeZone: zonaHoraria() }).format(vence)}` : null,
    vence,
    enlace: "/acuses",
  };
  let puesta = false;
  return tareas.flatMap((t) => {
    if (!t.id.startsWith("acuse:")) return [t];
    if (puesta) return [];
    puesta = true;
    return [agrupada];
  });
}

/**
 * Los pasos que le tocan a la persona: los trámites (la pestaña «Por hacer» de la bandeja, spec 13A §14.1), las
 * copias, las lecturas por confirmar, las socializaciones por registrar, las verificaciones, los hallazgos y la
 * revisión de la vigencia de sus documentos.
 */
export async function misTareas(
  sesion: SesionFlujo,
  opciones?: { sql?: Cliente; ahora?: Date },
): Promise<{ tareas: Tarea[]; total: number }> {
  const [tramites, copias, acuses, socializacion, verificacion, hallazgos, vigencia] = await Promise.all([
    listarTramites(sesion, "por_hacer", opciones),
    tareasDeCopias(sesion, opciones),
    tareasDeAcuses(sesion, opciones),
    tareasDeSocializacion(sesion, opciones),
    tareasDeVerificacion(sesion, opciones),
    tareasDeHallazgos(sesion, opciones),
    tareasDeVigencia(sesion, opciones),
  ]);
  const tareas: Tarea[] = [
    ...tramites.map((t) => ({
      id: `tramite:${t.id}`,
      modulo: "documentos" as const,
      titulo: tituloDeTarea(t),
      detalle: t.titulo,
      vence: t.venceEn,
      enlace: `/tramites/${t.id}`,
    })),
    ...copias,
    ...acuses,
    ...socializacion,
    ...verificacion,
    ...hallazgos,
    ...vigencia,
  ];
  return { tareas: agruparTareas(tareas), total: tareas.length };
}
