import type { EstadoAccion } from "@/app/admin/comun";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { AVISO_SIN_PACIENTES } from "@/lib/mejoramiento/textos";

/** Una acción de un paso del recorrido: la Server Action que recibe el formulario. */
export type AccionDelPaso = (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;

/** El rechazo de un acto, con su mensaje, anunciado a quien usa un lector de pantalla. */
export function ErrorDelPaso({ estado }: { estado: EstadoAccion }) {
  if (estado?.ok !== false) return null;
  return (
    <p role="alert" className="rounded-md border border-estado-critico/40 bg-estado-critico-fondo px-3 py-2 text-sm text-estado-critico-texto">
      {estado.error}
    </p>
  );
}

/** Un texto libre del paso, con el aviso de datos de pacientes (spec §6.4) y su mínimo. */
export function TextoDelPaso({
  etiqueta,
  nombre,
  id,
  minimo = 10,
  maximo = 1000,
}: {
  etiqueta: string;
  nombre: string;
  id: string;
  minimo?: number;
  maximo?: number;
}) {
  return (
    <Campo etiqueta={etiqueta} nombre={nombre} id={id} ayuda={AVISO_SIN_PACIENTES}>
      <textarea required minLength={minimo} maxLength={maximo} rows={3} className={claseControl} />
    </Campo>
  );
}

/** El acta del Comité que el acto puede citar (spec §8.5): número y fecha, los dos o ninguno. */
export function CamposDelActa({ prefijo, hoy }: { prefijo: string; hoy: string }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">Acta del Comité (opcional)</legend>
      <div className="flex flex-col gap-2">
        <Campo etiqueta="Número del acta" nombre="actaNumero" id={`${prefijo}-acta-numero`}>
          <input type="text" maxLength={50} className={claseControl} />
        </Campo>
        <Campo etiqueta="Fecha del acta" nombre="actaFecha" id={`${prefijo}-acta-fecha`}>
          <input type="date" max={hoy} className={claseControl} />
        </Campo>
      </div>
    </fieldset>
  );
}

/** Una cita de lo que otra persona escribió antes (la justificación del rechazo, la réplica), con su rótulo. */
export function Cita({ rotulo, texto }: { rotulo: string; texto: string | null }) {
  if (!texto) return null;
  return (
    <p className="whitespace-pre-line break-words border-l-2 border-mod-planes pl-3 text-sm">
      <span className="font-medium">{rotulo}:</span> {texto}
    </p>
  );
}

/** Lo que se despliega para un acto secundario del paso (rechazar, devolver, exigir), navegable con el teclado. */
export function Desplegable({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-md border border-border">
      <summary className="cursor-pointer list-none rounded-md px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca">
        {titulo}
      </summary>
      <div className="border-t border-linea-suave p-3">{children}</div>
    </details>
  );
}
