import { enlazarDocumentoAccion } from "@/app/acciones-normograma";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import type { DocumentoGestionable } from "@/db/consultas/normograma/asociaciones";
import { AccionNormograma } from "./AccionNormograma";

const CONTROL = `${claseControl} w-full min-w-0 max-w-full`;

/**
 * «Enlazar documento» (spec 13C §10.3): los internos que implementan la norma y los externos que la referencian. Solo
 * ofrece los vigentes que la persona ve y cuyo proceso propietario tiene; un cambio de la norma les abrirá un impacto.
 */
export function EnlazarDocumento({ normaId, documentos }: { normaId: number; documentos: DocumentoGestionable[] }) {
  const internos = documentos.filter((d) => d.origen === "interno");
  const externos = documentos.filter((d) => d.origen === "externo");
  const opcion = (d: DocumentoGestionable) => (
    <option key={d.id} value={d.id}>
      {`${d.codigo} · ${d.titulo}`}
    </option>
  );
  return (
    <AccionNormograma
      accion={enlazarDocumentoAccion}
      boton="Enlazar el documento"
      campos={{ normaId }}
      desplegable="Enlazar documento"
      explicacion="Si la norma cambia de estado, el documento queda marcado «Revisión por cambio normativo» y su proceso recibe la tarea."
    >
      <Campo etiqueta="Documento" nombre="documentoId" id={`enlazar-${normaId}-documento`}>
        <select required defaultValue="" className={CONTROL}>
          <option value="" disabled>
            Elija el documento
          </option>
          {internos.length > 0 ? <optgroup label="Documentos internos">{internos.map(opcion)}</optgroup> : null}
          {externos.length > 0 ? <optgroup label="Documentos externos">{externos.map(opcion)}</optgroup> : null}
        </select>
      </Campo>
    </AccionNormograma>
  );
}
