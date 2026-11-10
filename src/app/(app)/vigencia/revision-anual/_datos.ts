import { normasDeProceso } from "@/db/consultas/normograma/asociaciones";
import type { FilaNorma } from "@/db/consultas/normograma/lectura";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { externosVerificables } from "@/db/consultas/vigencia/externos";
import type { DetalleRevision, ProcesoDeRevision } from "@/db/consultas/vigencia/revision-anual";
import { accionesDeDecision, type FilaDecision } from "@/lib/vigencia/decisiones";
import { alcanceProcesos } from "@/lib/alcance";

export type DatosDeSeccion = {
  proceso: ProcesoDeRevision;
  filas: FilaDecision[];
  normas: (FilaNorma & { requisito: string | null })[];
};

/**
 * Lo que pinta la sección de cada proceso: sus documentos de la revisión con lo que la persona puede hacer sobre ellos
 * y las normas de su normograma. Todo sale de `obtenerRevision` (ya recortado a la persona) y de lecturas de sus
 * documentos y sus procesos: nada de las cifras de la entidad (resolución 3 de la Tarea 11). `decidir` falso pinta la
 * sección sin botones (la página del informe parcial).
 */
export async function seccionesDeProcesos(
  sesion: SesionFlujo,
  revision: DetalleRevision,
  procesos: ProcesoDeRevision[],
  opciones: { decidir: boolean },
): Promise<DatosDeSeccion[]> {
  if (procesos.length === 0) return [];
  const ids = new Set(procesos.map((p) => p.id));
  const documentos = revision.documentos.filter((d) => ids.has(d.proceso.id));
  const externos = documentos.filter((d) => d.origen === "externo").map((d) => d.documentoId);
  const [alcance, verificables, normas] = await Promise.all([
    alcanceProcesos(sesion),
    opciones.decidir ? externosVerificables(externos, sesion) : Promise.resolve(new Map()),
    Promise.all(procesos.map((p) => normasDeProceso(p.id, sesion))),
  ]);
  return procesos.map((proceso, i) => ({
    proceso,
    normas: normas[i],
    filas: documentos
      .filter((d) => d.proceso.id === proceso.id)
      .map((d) => ({
        ...d,
        acciones: accionesDeDecision(sesion, d, {
          puedeDecidir: opciones.decidir && proceso.puedeDecidir,
          alcance,
          verificable: verificables.get(d.documentoId) ?? null,
        }),
      })),
  }));
}
