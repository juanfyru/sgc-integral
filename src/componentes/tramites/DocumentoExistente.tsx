import { Campo } from "@/componentes/ui/Campo";
import { Dato, EnlaceDocumento, anchoCompleto, type Plantilla } from "./PiezasAceptacion";

/** En una modificación el código, el tipo y el proceso no se editan (spec 13A §8.6). */
export function DocumentoExistente({
  codigo,
  tipo,
  proceso,
  version,
  plantilla,
  tituloEditable,
}: {
  codigo: string;
  tipo: string;
  proceso: string;
  version: number;
  plantilla: Plantilla;
  tituloEditable?: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Dato etiqueta="Código">
          <span className="font-mono">{codigo}</span>
        </Dato>
        <Dato etiqueta="Tipo">{tipo}</Dato>
        <Dato etiqueta="Proceso">{proceso}</Dato>
        <Dato etiqueta="Versión">{version}</Dato>
        {plantilla ? (
          <Dato etiqueta="Plantilla">
            <EnlaceDocumento codigo={plantilla.codigo}>{`${plantilla.codigo}, versión ${plantilla.version}`}</EnlaceDocumento>
          </Dato>
        ) : null}
      </dl>
      {tituloEditable !== undefined ? (
        <Campo etiqueta="Título" nombre="tituloNuevo" ayuda="Si lo cambia, se aplica al publicar. Hasta entonces el portal muestra el actual.">
          <input required minLength={3} maxLength={200} defaultValue={tituloEditable} className={anchoCompleto} />
        </Campo>
      ) : null}
    </div>
  );
}
