"use client";

import { useActionState, useMemo, useState } from "react";
import { emitirCopiaAccion } from "@/app/acciones-distribucion";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { ErrorAccion } from "@/componentes/tramites/AccionesSolicitud";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { Dialogo } from "@/componentes/ui/Dialogo";

export type DocumentoEmitible = { id: number; codigo: string; titulo: string };
export type PuntoEmitible = { id: number; nombre: string; sede: string | null; deSusProcesos: boolean };

function Formulario({
  documentos,
  puntos,
  alCancelar,
}: {
  documentos: DocumentoEmitible[];
  puntos: PuntoEmitible[];
  alCancelar: () => void;
}) {
  const [estado, enviar, pendiente] = useActionState(emitirCopiaAccion, null);
  const [busqueda, setBusqueda] = useState("");
  const unico = documentos.length === 1 ? documentos[0] : null;
  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return q === "" ? documentos : documentos.filter((d) => `${d.codigo} ${d.titulo}`.toLowerCase().includes(q));
  }, [busqueda, documentos]);
  const propios = puntos.filter((p) => p.deSusProcesos);
  const otros = puntos.filter((p) => !p.deSusProcesos);
  const opcion = (p: PuntoEmitible) => (
    <option key={p.id} value={p.id}>
      {p.sede ? `${p.nombre} · ${p.sede}` : p.nombre}
    </option>
  );

  return (
    <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex flex-col gap-4 p-5">
      <p aria-hidden="true" className="font-semibold">
        Emitir copia controlada
      </p>
      {unico ? (
        <>
          <input type="hidden" name="documentoId" value={unico.id} />
          <p className="text-sm">
            <span className="mr-1.5 font-mono text-xs text-muted-foreground">{unico.codigo}</span>
            {unico.titulo}
          </p>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <label htmlFor="buscar-documento" className="text-sm font-medium">
              Buscar por código
            </label>
            {/* Sin `name`: solo filtra la lista, no viaja en el formulario. */}
            <input
              id="buscar-documento"
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              autoComplete="off"
              className={claseControl}
            />
          </div>
          <Campo
            etiqueta="Documento"
            nombre="documentoId"
            ayuda={`${visibles.length} de ${documentos.length} documentos vigentes con PDF`}
          >
            <select required defaultValue="" className={claseControl}>
              <option value="" disabled>
                Elija el documento
              </option>
              {visibles.map((d) => (
                <option key={d.id} value={d.id}>
                  {`${d.codigo} · ${d.titulo}`}
                </option>
              ))}
            </select>
          </Campo>
        </>
      )}
      <Campo etiqueta="Punto de uso" nombre="puntoUsoId">
        <select required defaultValue="" className={claseControl}>
          <option value="" disabled>
            Elija el punto
          </option>
          {propios.length > 0 ? <optgroup label="De sus procesos">{propios.map(opcion)}</optgroup> : null}
          {otros.length > 0 ? <optgroup label={propios.length > 0 ? "Otros puntos" : "Puntos de uso"}>{otros.map(opcion)}</optgroup> : null}
        </select>
      </Campo>
      <Campo etiqueta="Nota (opcional)" nombre="nota" ayuda="Hasta 200 caracteres; queda en el historial de la copia.">
        <textarea maxLength={200} rows={2} className={`${claseControl} w-full`} />
      </Campo>
      <ErrorAccion estado={estado} />
      <div className="flex flex-wrap justify-end gap-2">
        <Boton variante="secundario" onClick={alCancelar}>
          Cancelar
        </Boton>
        <Boton type="submit" pendiente={pendiente}>
          {pendiente ? "Emitiendo…" : "Emitir"}
        </Boton>
      </div>
    </form>
  );
}

/** «Emitir copia controlada»: elige documento y punto, y aterriza en la copia con el enlace al PDF. */
export function DialogoEmitir({
  documentos,
  puntos,
  etiqueta = "Emitir copia controlada",
  variante = "primario",
}: {
  documentos: DocumentoEmitible[];
  puntos: PuntoEmitible[];
  etiqueta?: string;
  variante?: "primario" | "secundario";
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Boton variante={variante} onClick={() => setAbierto(true)} aria-haspopup="dialog">
        {etiqueta}
      </Boton>
      <Dialogo
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
        titulo="Emitir copia controlada"
        className="m-auto w-full max-w-md rounded-lg border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40"
      >
        {abierto ? <Formulario documentos={documentos} puntos={puntos} alCancelar={() => setAbierto(false)} /> : null}
      </Dialogo>
    </>
  );
}
