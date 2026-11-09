import type { FilaNorma } from "@/db/consultas/normograma/lectura";
import type { ProcesoDeRevision } from "@/db/consultas/vigencia/revision-anual";
import { cuenta } from "@/lib/plural";
import { NormogramaDelProceso } from "./NormogramaDelProceso";
import { TablaDecisiones, type FilaDecision } from "./TablaDecisiones";

/**
 * Un documento que dejó de estar vigente (eliminado o retirado) no sale en la tabla pero cuenta en las cifras de su
 * proceso (resolución 4 de la Tarea 11): la línea que lo explica, o nada si no hay ninguno.
 */
export function textoFueraDeTabla(documentos: number, filas: number): string | null {
  const n = documentos - filas;
  if (n <= 0) return null;
  return n === 1
    ? "1 documento de la revisión ya no está vigente (se eliminó o se retiró): cuenta en las cifras del proceso, pero no sale en la tabla."
    : `${n} documentos de la revisión ya no están vigentes (se eliminaron o se retiraron): cuentan en las cifras del proceso, pero no salen en la tabla.`;
}

/**
 * Lo de un proceso en la revisión (maqueta 5): su avance, la tabla de decisiones y la confirmación de su normograma.
 * Quien no decide sobre él, o la revisión cerrada, lo ve sin botones.
 */
export function SeccionProceso({
  revision,
  proceso,
  filas,
  normas,
  ahora,
  pideCodigo,
  volver,
}: {
  revision: { id: number; anio: number; abierta: boolean };
  proceso: ProcesoDeRevision;
  filas: FilaDecision[];
  normas: (FilaNorma & { requisito: string | null })[];
  ahora: Date;
  pideCodigo: boolean;
  volver: string;
}) {
  const id = `proceso-${proceso.id}`;
  const fuera = textoFueraDeTabla(proceso.documentos, filas.length);
  const decide = revision.abierta && proceso.puedeDecidir;
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className="flex min-w-0 scroll-mt-4 flex-col gap-3">
      <div>
        <h2 id={`${id}-titulo`} className="font-display text-lg font-semibold">
          {`Revisión anual ${revision.anio} · ${proceso.nombre}`}
        </h2>
        <p className="text-sm text-muted-foreground">
          {`${proceso.decididos} de ${cuenta(proceso.documentos, "documento", "documentos")} con decisión`}
          {decide ? " · usted decide sobre este proceso" : ""}
        </p>
        {fuera ? <p className="text-sm text-muted-foreground">{fuera}</p> : null}
      </div>
      <TablaDecisiones
        titulo={`Documentos de ${proceso.nombre} en la revisión`}
        filas={filas}
        revision={revision}
        ahora={ahora}
        pideCodigo={pideCodigo}
        volver={volver}
      />
      <NormogramaDelProceso revisionId={revision.id} proceso={{ ...proceso, puedeDecidir: decide }} normas={normas} />
    </section>
  );
}
