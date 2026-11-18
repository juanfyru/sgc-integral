"use client";

import { useActionState, useState } from "react";
import type { EstadoAccion } from "@/app/admin/comun";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { Dialogo } from "@/componentes/ui/Dialogo";
import { ORIGENES, esExterno, pideReferenciaDelCaso } from "@/lib/mejoramiento/origenes";
import { AVISO_SIN_PACIENTES, ETIQUETA_CLASE, ETIQUETA_CRITICIDAD } from "@/lib/mejoramiento/textos";
import { CLASES, CRITICIDADES, type Clase, type Criticidad, type Origen } from "@/lib/mejoramiento/tipos";

export type DatosParaReclasificar = {
  hallazgoId: number;
  codigo: string;
  clase: Clase;
  criticidad: Criticidad | null;
  origen: Origen;
  fuente: string | null;
  referenciaCaso: string | null;
  titulo: string;
  requisitoClausula: string | null;
  requisitoNormaId: number | null;
  requisitoDocumentoId: number | null;
  /** El hallazgo anterior del que este es reincidencia, si lo hay y quien reclasifica lo ve. */
  reincidenteDeId: number | null;
  fechaLimiteEnte: string | null;
};

type Props = {
  datos: DatosParaReclasificar;
  normas: ReadonlyArray<{ id: number; nombre: string }>;
  documentos: ReadonlyArray<{ id: number; codigo: string; titulo: string }>;
  /** Los cerrados del mismo proceso, para marcar la reincidencia. */
  cerrados: ReadonlyArray<{ id: number; codigo: string; titulo: string }>;
  accion: (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;
};

/** Las opciones de un `<select>` más la actual, si ya no está entre ellas (una norma que dejó de regir, por ejemplo). */
function conLaActual<T extends { id: number }>(lista: ReadonlyArray<T>, actual: number | null, comoActual: (id: number) => T): T[] {
  return actual !== null && !lista.some((o) => o.id === actual) ? [comoActual(actual), ...lista] : [...lista];
}

/**
 * «Reclasificar» (spec 15 §7.6): el Admin SGC corrige la identificación con justificación, hasta que se envía el plan. Dice
 * antes qué puede arrastrar el cambio. La descripción no se reescribe: la nota queda en el historial.
 */
export function DialogoReclasificar({ datos: d, normas, documentos, cerrados, accion }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const v = estado?.valores;
  const texto = (c: string, defecto: string) => (typeof v?.[c] === "string" ? (v[c] as string) : defecto);
  const [clase, setClase] = useState<string>(texto("clase", d.clase));
  const [origen, setOrigen] = useState<string>(texto("origen", d.origen));
  const esNc = clase === "no_conformidad";
  const externo = esExterno(origen as Origen);
  const unasNormas = conLaActual(normas, d.requisitoNormaId, (id) => ({ id, nombre: "La norma actual (ya no rige)" }));
  const unosDocumentos = conLaActual(documentos, d.requisitoDocumentoId, (id) => ({ id, codigo: "El documento actual", titulo: "" }));
  const unosCerrados = conLaActual(cerrados, d.reincidenteDeId, (id) => ({ id, codigo: "El hallazgo actual", titulo: "" }));

  return (
    <>
      <Boton variante="secundario" onClick={() => setAbierto(true)} aria-haspopup="dialog">
        Reclasificar
      </Boton>
      <Dialogo
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
        titulo={`Reclasificar ${d.codigo}`}
        className="m-auto w-full max-w-2xl rounded-lg border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40"
      >
        <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex max-h-[90vh] flex-col gap-4 overflow-y-auto p-5">
          <p aria-hidden="true" className="font-semibold">{`Reclasificar ${d.codigo}`}</p>
          <input type="hidden" name="hallazgoId" value={d.hallazgoId} />
          <p className="text-sm text-muted-foreground">
            Las consecuencias se calculan otra vez y el estado puede cambiar: de no conformidad a observación u oportunidad pasa a
            «Por formular»; subir la criticidad a alta o marcarlo reincidente, también, si ya se decidía la acción; un origen externo
            lo deja aceptado. Bajar la criticidad o quitar la reincidencia no lo devuelve a un paso anterior.
          </p>
          {estado?.ok === false ? (
            <p role="alert" className="rounded-md border border-estado-critico/40 bg-estado-critico-fondo px-3 py-2 text-sm text-estado-critico-texto">
              {estado.error}
            </p>
          ) : null}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo etiqueta="Clase" nombre="clase" id="reclasificar-clase">
              <select required value={clase} onChange={(e) => setClase(e.target.value)} className={claseControl}>
                {CLASES.map((c) => (
                  <option key={c} value={c}>
                    {ETIQUETA_CLASE[c]}
                  </option>
                ))}
              </select>
            </Campo>
            {esNc ? (
              <Campo etiqueta="Criticidad" nombre="criticidad" id="reclasificar-criticidad">
                <select required defaultValue={texto("criticidad", d.criticidad ?? "")} className={claseControl}>
                  <option value="">Elija la criticidad</option>
                  {CRITICIDADES.map((c) => (
                    <option key={c} value={c}>
                      {ETIQUETA_CRITICIDAD[c]}
                    </option>
                  ))}
                </select>
              </Campo>
            ) : null}
            <Campo etiqueta="Origen" nombre="origen" id="reclasificar-origen">
              <select required value={origen} onChange={(e) => setOrigen(e.target.value)} className={claseControl}>
                {ORIGENES.map((o) => (
                  <option key={o.clave} value={o.clave}>
                    {o.etiqueta}
                  </option>
                ))}
              </select>
            </Campo>
            {pideReferenciaDelCaso(origen as Origen) ? (
              <Campo etiqueta="Referencia del caso" nombre="referenciaCaso" id="reclasificar-referencia">
                <input type="text" required maxLength={100} defaultValue={texto("referenciaCaso", d.referenciaCaso ?? "")} autoComplete="off" className={claseControl} />
              </Campo>
            ) : null}
            {externo ? (
              <Campo
                etiqueta={origen === "ente_control" ? "Fecha límite de respuesta al ente" : "Fecha límite de respuesta al ente (opcional)"}
                nombre="fechaLimiteEnte"
                id="reclasificar-limite"
              >
                <input type="date" required={origen === "ente_control"} defaultValue={texto("fechaLimiteEnte", d.fechaLimiteEnte ?? "")} className={claseControl} />
              </Campo>
            ) : null}
          </div>
          <Campo etiqueta="Fuente: qué auditoría, visita o caso" nombre="fuente" id="reclasificar-fuente">
            <input type="text" maxLength={200} defaultValue={texto("fuente", d.fuente ?? "")} autoComplete="off" className={claseControl} />
          </Campo>
          <Campo etiqueta="Título" nombre="titulo" id="reclasificar-titulo">
            <input type="text" required maxLength={150} defaultValue={texto("titulo", d.titulo)} autoComplete="off" className={claseControl} />
          </Campo>
          <fieldset className="flex min-w-0 flex-col gap-3 rounded-md border border-border p-3">
            <legend className="px-1 text-sm font-medium">{esNc ? "Requisito incumplido (al menos uno)" : "Requisito incumplido (opcional)"}</legend>
            <Campo etiqueta="Cláusula o requisito" nombre="requisitoClausula" id="reclasificar-clausula">
              <input type="text" maxLength={200} defaultValue={texto("requisitoClausula", d.requisitoClausula ?? "")} autoComplete="off" className={claseControl} />
            </Campo>
            <Campo etiqueta="Norma del normograma" nombre="requisitoNormaId" id="reclasificar-norma">
              <select defaultValue={texto("requisitoNormaId", d.requisitoNormaId === null ? "" : String(d.requisitoNormaId))} className={claseControl}>
                <option value="">Ninguna</option>
                {unasNormas.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Documento interno" nombre="requisitoDocumentoId" id="reclasificar-documento">
              <select defaultValue={texto("requisitoDocumentoId", d.requisitoDocumentoId === null ? "" : String(d.requisitoDocumentoId))} className={claseControl}>
                <option value="">Ninguno</option>
                {unosDocumentos.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.titulo ? `${o.codigo} · ${o.titulo}` : o.codigo}
                  </option>
                ))}
              </select>
            </Campo>
          </fieldset>
          <Campo
            etiqueta="Reincidencia de"
            nombre="reincidenteDe"
            id="reclasificar-reincidente"
            ayuda="Un hallazgo cerrado de este mismo proceso. Elija «Ninguno» para quitar el enlace."
          >
            <select defaultValue={texto("reincidenteDe", d.reincidenteDeId === null ? "" : String(d.reincidenteDeId))} className={claseControl}>
              <option value="">Ninguno</option>
              {unosCerrados.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.titulo ? `${o.codigo} · ${o.titulo}` : o.codigo}
                </option>
              ))}
            </select>
          </Campo>
          <Campo
            etiqueta="Nota para la descripción (opcional)"
            nombre="nota"
            id="reclasificar-nota"
            ayuda={`La descripción no se reescribe: la nota queda en el historial. ${AVISO_SIN_PACIENTES}`}
          >
            <textarea maxLength={1000} rows={2} defaultValue={texto("nota", "")} className={claseControl} />
          </Campo>
          <Campo etiqueta="Justificación (al menos 10 caracteres)" nombre="justificacion" id="reclasificar-justificacion">
            <textarea required minLength={10} maxLength={1000} rows={3} defaultValue={texto("justificacion", "")} className={claseControl} />
          </Campo>
          <div className="flex flex-wrap justify-end gap-2">
            <Boton variante="secundario" onClick={() => setAbierto(false)}>
              Cancelar
            </Boton>
            <Boton type="submit" variante="primario" pendiente={pendiente}>
              Reclasificar
            </Boton>
          </div>
        </form>
      </Dialogo>
    </>
  );
}
