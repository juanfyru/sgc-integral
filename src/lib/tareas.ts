import type { Cliente } from "@/db/cliente";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import {
  tareasDeAcuses,
  tareasDeCopias,
  tareasDeHallazgos,
  tareasDeSocializacion,
  tareasDeVerificacion,
} from "@/db/consultas/distribucion/tareas";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { tareasDeImpactos } from "@/db/consultas/normograma/impactos";
import { listarTramites, type ResumenTramite } from "@/db/consultas/tramites";
import { esResponsableTecnico } from "@/db/consultas/vigencia/externos";
import { tareasDeRevision } from "@/db/consultas/vigencia/revision-anual/tareas";
import { vigenciaDePersona, type VigenciaDePersona } from "@/db/consultas/vigencia/tareas";
import { puede } from "@/lib/permisos";
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

const SIN_VIGENCIA: VigenciaDePersona = { tareas: [], vencidos: 0 };

/**
 * Los pasos que le tocan a la persona: los trámites (la pestaña «Por hacer» de la bandeja, spec 13A §14.1), las
 * copias, las lecturas por confirmar, las socializaciones por registrar, las verificaciones, los hallazgos, de la
 * vigencia, la adopción de las ediciones nuevas, la verificación de sus externos y la revisión de sus documentos, la de
 * cada proceso suyo en la revisión anual abierta y los impactos normativos de sus procesos (estas dos, una consulta
 * acotada cada una, nada para quien no lidera ni es Admin SGC). Con ellas,
 * `vencidos`: la insignia de «Vigencia». La configuración documental se lee una sola vez, y solo si alguna
 * fuente la usa. `responsableTecnico`, si quien llama ya lo sabe (el cascarón).
 */
export async function misTareas(
  sesion: SesionFlujo,
  opciones?: { sql?: Cliente; ahora?: Date; responsableTecnico?: boolean },
): Promise<{ tareas: Tarea[]; total: number; vencidos: number }> {
  const fuentes = { sql: opciones?.sql, ahora: opciones?.ahora };
  const responsableTecnico = opciones?.responsableTecnico ?? (await esResponsableTecnico(sesion.usuarioId, { sql: opciones?.sql }));
  const usaConfig =
    puede(sesion, "verificaciones.realizar") || puede(sesion, "vigencia.ver") || puede(sesion, "documentos.indicadores") || responsableTecnico;
  const config = usaConfig ? obtenerConfigDocumental({ sql: opciones?.sql }) : undefined;
  // Quien la espera recibe su rechazo; este `catch` solo evita uno sin atender si ninguna fuente llega a esperarla.
  config?.catch(() => {});
  const [tramites, copias, acuses, socializacion, verificacion, hallazgos, vigencia, revision, impactos] = await Promise.all([
    listarTramites(sesion, "por_hacer", fuentes),
    tareasDeCopias(sesion, fuentes),
    tareasDeAcuses(sesion, fuentes),
    tareasDeSocializacion(sesion, fuentes),
    tareasDeVerificacion(sesion, { ...fuentes, config }),
    tareasDeHallazgos(sesion, fuentes),
    // Calculada del estado y la más pesada: si falla se registra, y las demás tareas y la página siguen sin ella.
    vigenciaDePersona(sesion, { responsableTecnico }, { ...fuentes, config }).catch((err: unknown) => {
      console.error("No se pudo calcular la vigencia de «Mis tareas» y de la insignia:", err);
      return SIN_VIGENCIA;
    }),
    tareasDeRevision(sesion, fuentes),
    tareasDeImpactos(sesion, fuentes),
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
    ...vigencia.tareas,
    ...revision,
    ...impactos,
  ];
  return { tareas: agruparTareas(tareas), total: tareas.length, vencidos: vigencia.vencidos };
}
