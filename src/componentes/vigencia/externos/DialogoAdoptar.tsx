"use client";

import { adoptarEdicionAccion } from "@/app/acciones-vigencia";
import { DialogoFirma } from "@/componentes/tramites/DialogoFirma";

/**
 * Lo que el diálogo envía oculto: la versión y la huella que mostró (vacía sin principal). La adopción la compara con
 * la del principal de ese momento y rechaza si cambió: nadie firma un archivo que no vio.
 */
export function ocultosDeAdopcion(borrador: { versionId: number; huella: string | null }): Record<string, string> {
  return { versionId: String(borrador.versionId), huella: borrador.huella ?? "" };
}

/**
 * «Adoptar esta edición» (spec 13C §8.3): el diálogo de firma de la 13A con la huella del principal (o «Sin archivo
 * principal»: la firma lleva la de los datos de la edición) y lo que la adopción pide a la audiencia.
 */
export function DialogoAdoptar({
  documento,
  borrador,
  esPrimera,
  pideCodigo,
}: {
  documento: { codigo: string; titulo: string };
  borrador: { versionId: number; numero: number; edicion: string; huella: string | null };
  /** Aún no hay una edición vigente: el acuse de lectura es opcional. */
  esPrimera: boolean;
  pideCodigo: boolean;
}) {
  return (
    <DialogoFirma
      titulo={`Adoptar ${documento.codigo}, edición ${borrador.edicion}`}
      etiquetaBoton="Adoptar esta edición"
      resumen={{ documento: `${documento.codigo} · ${documento.titulo}`, version: borrador.numero, huella: borrador.huella }}
      accion={adoptarEdicionAccion}
      ocultos={ocultosDeAdopcion(borrador)}
      pideCodigo={pideCodigo}
    >
      <CuerpoAdoptar esPrimera={esPrimera} conPrincipal={borrador.huella !== null} />
    </DialogoFirma>
  );
}

/**
 * Lo que el diálogo agrega al de firma: qué pasa al adoptar, qué se firma (la huella del principal o, sin él, la de los
 * datos de la edición), el acuse de lectura y la socialización.
 */
export function CuerpoAdoptar({ esPrimera, conPrincipal }: { esPrimera: boolean; conPrincipal: boolean }) {
  const queda = esPrimera
    ? "La edición queda vigente en el hospital."
    : "La edición queda vigente y la anterior pasa a obsoleta: sus copias controladas quedan por recoger.";
  const firma = conPrincipal
    ? "Queda como firma «Adoptó», con la huella de su archivo principal."
    : "Sin archivo principal: la firma lleva la huella de los datos de la edición (código, edición y entidad emisora), y no se podrán emitir copias controladas.";
  return (
    <>
      <p className="text-sm text-muted-foreground">{`${queda} ${firma}`}</p>
      <label className="flex items-start gap-2 text-sm">
        {esPrimera ? (
          <input type="checkbox" name="pedirAcuses" className="mt-0.5 size-4" />
        ) : (
          // Una edición nueva siempre pide el acuse: la casilla lo dice, pero no se puede quitar.
          <input type="checkbox" name="pedirAcuses" defaultChecked disabled className="mt-0.5 size-4" />
        )}
        <span>
          Pedir acuse de lectura a la audiencia
          <span className="block text-xs text-muted-foreground">
            {esPrimera ? "Quienes aplican el documento confirman que lo leyeron." : "Una edición nueva siempre lo pide a quienes aplican el documento."}
          </span>
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="requiereSocializacion" className="mt-0.5 size-4" />
        <span>
          Requiere socialización
          <span className="block text-xs text-muted-foreground">Queda pendiente registrar una jornada con el proceso, en el plazo configurado.</span>
        </span>
      </label>
    </>
  );
}
