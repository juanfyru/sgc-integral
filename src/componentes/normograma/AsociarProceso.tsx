import { asociarProcesoAccion } from "@/app/acciones-normograma";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { AccionNormograma } from "./AccionNormograma";

const CONTROL = `${claseControl} w-full min-w-0 max-w-full`;

type Props =
  /** Desde la ficha de la norma: se elige el proceso. */
  | { normaId: number; procesos: { id: number; nombre: string; sigla: string }[] }
  /** Desde la página del proceso («Normas aplicables → Asociar norma»): se elige la norma. */
  | { procesoId: number; normas: { id: number; nombre: string; titulo: string }[] }
  /** La asociación ya existe: solo se reescribe el requisito. */
  | { normaId: number; procesoId: number; requisito: string | null; proceso: string };

function Requisito({ id, valor }: { id: string; valor?: string | null }) {
  return (
    <Campo
      etiqueta="Requisito que la norma impone al proceso (opcional)"
      nombre="requisito"
      id={id}
      ayuda="Los artículos o apartes que aplican y la obligación. Hasta 2000 caracteres."
    >
      <textarea maxLength={2000} rows={3} defaultValue={valor ?? ""} className={CONTROL} />
    </Campo>
  );
}

/**
 * Asociar una norma a un proceso con su requisito (spec 13C §10.3), o reescribir el requisito. Lo hace quien tiene
 * `normograma.procesos` sobre el proceso: quien llama ofrece solo los procesos (o las normas) que la persona puede.
 */
export function AsociarProceso(props: Props) {
  if ("requisito" in props) {
    return (
      <AccionNormograma
        accion={asociarProcesoAccion}
        boton="Guardar el requisito"
        campos={{ normaId: props.normaId, procesoId: props.procesoId }}
        desplegable={`Editar el requisito de ${props.proceso}`}
        tamano="sm"
      >
        <Requisito id={`requisito-${props.normaId}-${props.procesoId}`} valor={props.requisito} />
      </AccionNormograma>
    );
  }
  if ("procesos" in props) {
    return (
      <AccionNormograma accion={asociarProcesoAccion} boton="Asociar el proceso" campos={{ normaId: props.normaId }} desplegable="Asociar proceso">
        <Campo etiqueta="Proceso" nombre="procesoId" id={`asociar-${props.normaId}-proceso`}>
          <select required defaultValue="" className={CONTROL}>
            <option value="" disabled>
              Elija el proceso
            </option>
            {props.procesos.map((p) => (
              <option key={p.id} value={p.id}>
                {`${p.sigla} · ${p.nombre}`}
              </option>
            ))}
          </select>
        </Campo>
        <Requisito id={`asociar-${props.normaId}-requisito`} />
      </AccionNormograma>
    );
  }
  return (
    <AccionNormograma accion={asociarProcesoAccion} boton="Asociar la norma" campos={{ procesoId: props.procesoId }} desplegable="Asociar norma">
      <Campo etiqueta="Norma" nombre="normaId" id={`asociar-proceso-${props.procesoId}-norma`} ayuda="Las del normograma que aún no aplican a este proceso.">
        <select required defaultValue="" className={CONTROL}>
          <option value="" disabled>
            Elija la norma
          </option>
          {props.normas.map((n) => (
            <option key={n.id} value={n.id}>
              {`${n.nombre} · ${n.titulo}`}
            </option>
          ))}
        </select>
      </Campo>
      <Requisito id={`asociar-proceso-${props.procesoId}-requisito`} />
    </AccionNormograma>
  );
}
