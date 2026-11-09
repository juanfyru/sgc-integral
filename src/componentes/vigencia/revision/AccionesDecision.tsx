"use client";

import { useActionState, useState } from "react";
import { confirmarNormogramaAccion, enlazarTramiteAccion } from "@/app/acciones-vigencia";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { ErrorAccion } from "@/componentes/tramites/AccionesSolicitud";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { Dialogo } from "@/componentes/ui/Dialogo";
import { FormularioVerificacion } from "@/componentes/vigencia/externos/FormularioVerificacion";
import type { ExternoVerificable } from "@/db/consultas/vigencia/externos";

/** Lo que dice el botón «Ratificar» de un externo a quien no lo ve: es su verificación, no una firma. */
export const TEXTO_RATIFICAR_EXTERNO = "registrar la verificación «sigue vigente»";

/**
 * «Ratificar» un externo desde la tabla de la revisión anual (resolución 5 de la Tarea 11): la verificación «sigue
 * vigente» en un paso, sin salir de la tabla, con el formulario de verificación de siempre (la fuente consultada es
 * obligatoria). Registrada, vuelve a la tabla; la decisión se enlaza sola a la revisión.
 */
export function DialogoVerificar({
  codigo,
  documentoId,
  externo,
  volver,
}: {
  codigo: string;
  documentoId: number;
  externo: ExternoVerificable;
  volver: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const titulo = `Ratificar ${codigo}: ${TEXTO_RATIFICAR_EXTERNO}`;
  return (
    <>
      <Boton tamano="sm" onClick={() => setAbierto(true)} aria-haspopup="dialog" aria-label={titulo}>
        Ratificar
      </Boton>
      <Dialogo
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
        titulo={titulo}
        className="m-auto w-full max-w-md rounded-lg border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40"
      >
        {abierto ? (
          <div className="flex min-w-0 flex-col gap-4 p-5">
            {/* El título para lectores de pantalla ya lo pone Dialogo. */}
            <p aria-hidden="true" className="font-semibold">
              {`Ratificar ${codigo}`}
            </p>
            <p className="text-sm text-muted-foreground">
              Ratificar un documento externo es verificar en su fuente que sigue vigente: queda como su verificación, sin clave.
            </p>
            <FormularioVerificacion
              documentoId={documentoId}
              fuenteOficial={externo.fuenteOficial}
              verificacionMeses={externo.verificacionMeses}
              resultadoFijo="vigente"
              volver={volver}
            />
            <Boton variante="secundario" onClick={() => setAbierto(false)} className="self-end">
              Cancelar
            </Boton>
          </div>
        ) : null}
      </Dialogo>
    </>
  );
}

/** «Enlazar el trámite en curso SOL-…»: la decisión del documento pasa a ser el trámite que ya tiene abierto. */
export function EnlazarTramite({
  revisionId,
  documentoId,
  tramite,
}: {
  revisionId: number;
  documentoId: number;
  tramite: { id: number; numero: string };
}) {
  const [estado, enviar, pendiente] = useActionState(enlazarTramiteAccion, null);
  return (
    <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex min-w-0 flex-col items-start gap-1">
      <input type="hidden" name="revisionId" value={revisionId} />
      <input type="hidden" name="documentoId" value={documentoId} />
      <input type="hidden" name="tramiteId" value={tramite.id} />
      <Boton type="submit" variante="secundario" tamano="sm" pendiente={pendiente}>
        {pendiente ? "Enlazando…" : `Enlazar el trámite en curso ${tramite.numero}`}
      </Boton>
      <ErrorAccion estado={estado} />
    </form>
  );
}

/**
 * «Sin novedad» y «Marcar cambios…» del normograma del proceso (spec 13C §9.4). Marcar cambios exige la nota: qué norma
 * falta o cuál cambió, que llega al Administrador del SGC.
 */
export function ConfirmarNormograma({ revisionId, procesoId, proceso }: { revisionId: number; procesoId: number; proceso: string }) {
  const [estado, enviar, pendiente] = useActionState(confirmarNormogramaAccion, null);
  const ocultos = (
    <>
      <input type="hidden" name="revisionId" value={revisionId} />
      <input type="hidden" name="procesoId" value={procesoId} />
    </>
  );
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-start gap-2">
        <form action={enviar} onSubmit={enviarSinReiniciar(enviar)}>
          {ocultos}
          <input type="hidden" name="resultado" value="sin_novedad" />
          <Boton type="submit" variante="secundario" pendiente={pendiente} aria-label={`Sin novedad en el normograma de ${proceso}`}>
            Sin novedad
          </Boton>
        </form>
        <details className="min-w-0 flex-1 rounded-md border border-border p-2">
          <summary className="cursor-pointer rounded text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca">
            Marcar cambios…
          </summary>
          <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="mt-2 flex min-w-0 flex-col items-start gap-2">
            {ocultos}
            <input type="hidden" name="resultado" value="cambios" />
            <Campo etiqueta="Qué cambió" nombre="nota" id={`nota-normograma-${procesoId}`} ayuda="Qué norma falta o cuál cambió; entre 5 y 1000 caracteres. Le llega al Administrador del SGC.">
              <textarea required minLength={5} maxLength={1000} rows={3} className={`${claseControl} w-full min-w-0 max-w-full`} />
            </Campo>
            <Boton type="submit" pendiente={pendiente}>
              {pendiente ? "Guardando…" : "Marcar cambios"}
            </Boton>
          </form>
        </details>
      </div>
      <ErrorAccion estado={estado} />
    </div>
  );
}
