"use client";

import { Campo } from "@/componentes/ui/Campo";
import { Insignia } from "@/componentes/ui/Insignia";
import type { DatosParaAceptar, DocumentoDeCatalogo } from "@/db/consultas/tramites";
import { Bloque, EnlaceDocumento, anchoCompleto } from "./PiezasAceptacion";

export type Decision = "nuevo" | "modificacion";

export function BloqueDuplicidad({
  parecidos,
  documentos,
  procesoId,
  decision,
  alDecidir,
  documentoId,
  alElegirDocumento,
}: {
  parecidos: DatosParaAceptar["parecidos"];
  documentos: DocumentoDeCatalogo[];
  procesoId: number;
  decision: Decision;
  alDecidir: (decision: Decision) => void;
  documentoId: string;
  alElegirDocumento: (id: string) => void;
}) {
  return (
    <Bloque id="titulo-duplicidad" titulo="¿Ya existe un documento parecido?">
      {parecidos.length === 0 ? (
        <p className="mb-3 text-sm text-muted-foreground">No hay documentos vigentes con un título o palabras clave parecidos.</p>
      ) : (
        <ul className="mb-3 flex list-none flex-col gap-2">
          {parecidos.map((p) => (
            <li key={p.documentoId} className="flex flex-wrap items-start justify-between gap-2 text-sm">
              <span className="min-w-0">
                <EnlaceDocumento codigo={p.codigo} /> {p.titulo}
                <span className="block text-xs text-muted-foreground">
                  {`Vigente, versión ${p.version}${p.procesoId === procesoId ? "" : " · de otro proceso"}`}
                </span>
              </span>
              <Insignia variante={p.nivel === "muy_parecido" ? "atencion" : "neutra"}>
                {p.nivel === "muy_parecido" ? "Muy parecido" : "Parecido"}
              </Insignia>
            </li>
          ))}
        </ul>
      )}
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Qué decide sobre la duplicidad</legend>
        <label className="inline-flex items-start gap-2 text-sm">
          <input type="radio" name="decision" value="nuevo" checked={decision === "nuevo"} onChange={() => alDecidir("nuevo")} />
          No es un duplicado: es un documento nuevo
        </label>
        <label className="inline-flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="decision"
            value="modificacion"
            checked={decision === "modificacion"}
            onChange={() => alDecidir("modificacion")}
          />
          Es una modificación de un documento que ya existe
        </label>
      </fieldset>
      {decision === "modificacion" ? (
        <div className="mt-3">
          <Campo
            etiqueta="Documento que ya existe"
            nombre="documentoExistenteId"
            ayuda="Solo vigentes de este proceso. Si el parecido es de otro proceso, rechace la solicitud con su código."
          >
            <select required value={documentoId} onChange={(e) => alElegirDocumento(e.target.value)} className={anchoCompleto}>
              <option value="">Elija el documento</option>
              {documentos
                .filter((d) => d.procesoId === procesoId)
                .map((d) => (
                  <option key={d.id} value={d.id} disabled={d.conTramite || d.conBorrador}>
                    {`${d.codigo} — ${d.titulo}${d.conTramite ? " (trámite abierto)" : d.conBorrador ? " (borrador de carga pendiente)" : ""}`}
                  </option>
                ))}
            </select>
          </Campo>
        </div>
      ) : null}
    </Bloque>
  );
}
