/**
 * Las piezas que comparten el registro de un hallazgo y la carga de uno en curso (Fase 15B, anexo §10.3 y §10.4): la sección «A
 * qué se refiere» (un documento, un indicador y, con él, una de sus mediciones con resultado), el campo «Objetivo», los campos
 * fijos de un prellenado y su rótulo. Sin estado propio: el indicador y la medición los lleva el formulario, que decide con ellos
 * si la fuente es obligatoria.
 */
import type { Prellenado } from "@/db/consultas/mejoramiento/prellenado";
import { Campo, claseControl } from "@/componentes/ui/Campo";

const NOTA = "rounded-md border border-border bg-muted px-3 py-2 text-sm";

/**
 * Lo que el formulario pinta al empezar: lo propuesto por el prellenado, lo que trae la página (un reporte, un derivado, lo escrito
 * antes de un rechazo), que manda sobre lo propuesto, y lo fijo, que manda sobre todo. Todo como texto del formulario.
 */
export function valoresIniciales(prellenado: Prellenado | undefined, valores: Record<string, string | string[]> | undefined): Record<string, string | string[]> {
  return { ...enTexto(prellenado?.valores), ...valores, ...fijosEnTexto(prellenado) };
}

/** Los campos fijos del prellenado con su valor, como texto del formulario. */
export function fijosEnTexto(prellenado: Prellenado | undefined): Record<string, string> {
  const valores = enTexto(prellenado?.valores);
  return Object.fromEntries((prellenado?.fijos ?? []).filter((k) => k in valores).map((k) => [k, valores[k]]));
}

function enTexto(valores: Prellenado["valores"] | undefined): Record<string, string> {
  return Object.fromEntries(
    Object.entries(valores ?? {})
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => [k, String(v)]),
  );
}

/** Un campo que llegó fijo: se muestra como texto, con su campo oculto, y no se edita (anexo §10.3). */
export function TextoFijo({ etiqueta, nombre, valor, texto }: { etiqueta: string; nombre: string; valor: string; texto: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-sm font-medium">{etiqueta}</span>
      <p className="text-sm text-foreground">{texto}</p>
      <input type="hidden" name={nombre} value={valor} />
    </div>
  );
}

/** El rótulo del prellenado (una nota por línea) y sus campos ocultos, arriba del formulario. */
export function RotuloYOcultos({ prellenado }: { prellenado: Prellenado | undefined }) {
  if (!prellenado) return null;
  const lineas = prellenado.rotulo ? prellenado.rotulo.split("\n") : [];
  return (
    <>
      {Object.entries(prellenado.ocultos).map(([nombre, valor]) => (
        <input key={nombre} type="hidden" name={nombre} value={valor} />
      ))}
      {lineas.map((linea) => (
        <p key={linea} className={NOTA}>
          {linea}
        </p>
      ))}
    </>
  );
}

type Props = {
  /** Los documentos vigentes que la persona ve (`documentosVigentesVisibles`). */
  documentos: ReadonlyArray<{ id: number; codigo: string; titulo: string }>;
  /** Los indicadores activos o retirados que la persona ve y las mediciones con resultado de cada uno (`indicadoresConMediciones`). */
  indicadores: ReadonlyArray<{ id: number; codigo: string; nombre: string }>;
  mediciones: ReadonlyArray<{ id: number; indicadorId: number; etiqueta: string }>;
  /** El documento al empezar (el control no lleva estado). */
  documentoId: string;
  indicadorId: string;
  medicionId: string;
  alCambiarIndicador: (id: string) => void;
  alCambiarMedicion: (id: string) => void;
  /** Los campos fijos del prellenado, con su valor (`fijosEnTexto`). */
  fijos: Record<string, string>;
};

const etiquetaDeDocumento = (d: { codigo: string; titulo: string }) => `${d.codigo} · ${d.titulo}`;
const etiquetaDeIndicador = (i: { codigo: string; nombre: string }) => `${i.codigo} · ${i.nombre}`;

/**
 * «A qué se refiere» (anexo §10.3): un documento, un indicador y, con él, una de sus mediciones con resultado, todos opcionales.
 * Cambiar de indicador vacía la medición. Un campo fijo se muestra como texto con su campo oculto.
 */
export function AQueSeRefiere({ documentos, indicadores, mediciones, documentoId, indicadorId, medicionId, alCambiarIndicador, alCambiarMedicion, fijos }: Props) {
  const fijo = (k: string) => Object.hasOwn(fijos, k);
  const delIndicador = mediciones.filter((m) => String(m.indicadorId) === indicadorId);
  const documento = documentos.find((d) => String(d.id) === fijos.documentoId);
  const indicador = indicadores.find((i) => String(i.id) === fijos.indicadorId);
  const medicion = mediciones.find((m) => String(m.id) === fijos.medicionId);
  return (
    <fieldset className="flex min-w-0 flex-col gap-3 rounded-md border border-border p-3">
      <legend className="px-1 text-sm font-medium">A qué se refiere (opcional)</legend>
      {fijo("documentoId") ? (
        <TextoFijo etiqueta="Documento" nombre="documentoId" valor={fijos.documentoId} texto={documento ? etiquetaDeDocumento(documento) : fijos.documentoId} />
      ) : (
        <Campo etiqueta="Documento" nombre="documentoId">
          <select defaultValue={documentoId} className={claseControl}>
            <option value="">Ninguno</option>
            {documentos.map((d) => (
              <option key={d.id} value={d.id}>
                {etiquetaDeDocumento(d)}
              </option>
            ))}
          </select>
        </Campo>
      )}
      {fijo("indicadorId") || indicadores.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {fijo("indicadorId") ? (
            <TextoFijo etiqueta="Indicador" nombre="indicadorId" valor={fijos.indicadorId} texto={indicador ? etiquetaDeIndicador(indicador) : fijos.indicadorId} />
          ) : (
            <Campo etiqueta="Indicador" nombre="indicadorId">
              <select
                value={indicadorId}
                onChange={(e) => {
                  alCambiarIndicador(e.target.value);
                  alCambiarMedicion("");
                }}
                className={claseControl}
              >
                <option value="">Ninguno</option>
                {indicadores.map((x) => (
                  <option key={x.id} value={x.id}>
                    {etiquetaDeIndicador(x)}
                  </option>
                ))}
              </select>
            </Campo>
          )}
          {fijo("medicionId") ? (
            <TextoFijo etiqueta="Medición" nombre="medicionId" valor={fijos.medicionId} texto={medicion ? medicion.etiqueta : fijos.medicionId} />
          ) : delIndicador.length > 0 ? (
            <Campo etiqueta="Medición" nombre="medicionId" ayuda="Una de las mediciones con resultado del indicador.">
              <select value={medicionId} onChange={(e) => alCambiarMedicion(e.target.value)} className={claseControl}>
                <option value="">Ninguna</option>
                {delIndicador.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.etiqueta}
                  </option>
                ))}
              </select>
            </Campo>
          ) : null}
        </div>
      ) : null}
    </fieldset>
  );
}

/**
 * «Objetivo» (anexo §10.4): uno de los activos del maestro, opcional. Dentro de un plan llega propuesto el del plan. Sin objetivos
 * activos no se pinta.
 */
export function CampoObjetivo({ objetivos, valor }: { objetivos: ReadonlyArray<{ id: number; etiqueta: string }>; valor: string }) {
  if (objetivos.length === 0) return null;
  return (
    <Campo etiqueta="Objetivo (opcional)" nombre="objetivoId" ayuda="El objetivo de calidad o institucional al que apunta el hallazgo.">
      <select defaultValue={valor} className={claseControl}>
        <option value="">Ninguno</option>
        {objetivos.map((o) => (
          <option key={o.id} value={o.id}>
            {o.etiqueta}
          </option>
        ))}
      </select>
    </Campo>
  );
}
