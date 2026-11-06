"use client";

import { useActionState, useState } from "react";
import { conceptoFavorableAccion, devolverRevisionAccion, guardarVerificacionAccion } from "@/app/acciones-tramites";
import { AccionEnDialogo } from "@/componentes/tramites/AccionesSolicitud";
import { DialogoFirma } from "@/componentes/tramites/DialogoFirma";
import { ListaVerificacion } from "@/componentes/tramites/ListaVerificacion";
import { Observaciones } from "@/componentes/tramites/Observaciones";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import type { Observacion, RespuestaItem } from "@/db/consultas/revision";
import { SIN_ITEMS_ACTIVOS, type Etapa } from "@/lib/tramites/tipos";

export type TramiteParaRevisar = {
  id: number;
  etapa: Etapa;
  ronda: number;
  codigo: string | null;
  titulo: string;
  versionNumero: number | null;
};

/**
 * La revisión del documento para el revisor designado, en revisión (spec 13A §9.2): lista de
 * verificación, observaciones y las dos salidas. Los demás la consultan con `EvidenciaRevision`.
 * `propuesta` dice que lo marcado viene de una ronda anterior y esta ronda aún no guarda nada.
 * `hayItemsActivos` no se deduce de `respuestas`: lo guardado en la ronda conserva ítems desactivados.
 */
export function PanelRevision({
  tramite,
  respuestas,
  hayItemsActivos,
  propuesta,
  observaciones,
  huella,
  pideCodigo,
}: {
  tramite: TramiteParaRevisar;
  respuestas: RespuestaItem[];
  hayItemsActivos: boolean;
  propuesta: boolean;
  observaciones: Observacion[];
  huella: string | null;
  pideCodigo: boolean;
}) {
  const [estado, enviar, pendiente] = useActionState(guardarVerificacionAccion, null);
  const [cambios, setCambios] = useState(0);
  const [enviadoCon, setEnviadoCon] = useState<number | null>(null);
  // Lo que se firma es lo guardado: con marcas sin guardar en pantalla, se firmaría otra lista. Lo
  // propuesto también es eso, aunque nadie lo haya tocado: el revisor lo confirma guardando.
  const guardado = enviadoCon !== null && enviadoCon === cambios && !pendiente && !estado;
  const sinGuardar = (cambios > 0 || propuesta) && !guardado;
  const impedimento = !hayItemsActivos ? SIN_ITEMS_ACTIVOS : sinGuardar ? "Guarde el avance de la lista antes de dar el concepto" : "";

  return (
    <section
      aria-labelledby="titulo-revision"
      className="flex min-w-0 flex-col gap-5 rounded-xl border border-border bg-card p-4 shadow-xs"
    >
      <h2 id="titulo-revision" className="text-sm font-semibold">
        {`Revisión · ronda ${tramite.ronda}`}
      </h2>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Lista de verificación</h3>
        {propuesta ? (
          <p className="text-xs text-muted-foreground">
            Se propone lo respondido en la ronda anterior. Revíselo y guarde el avance para confirmarlo.
          </p>
        ) : null}
        <ListaVerificacion
          tramite={tramite}
          respuestas={respuestas}
          edicion={{
            estado,
            enviar,
            pendiente,
            guardado,
            alCambiar: () => setCambios((n) => n + 1),
            alEnviar: () => setEnviadoCon(cambios),
          }}
        />
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Observaciones</h3>
        <Observaciones tramite={tramite} observaciones={observaciones} puedeRevisar puedeResponder={false} />
      </div>

      <div className="flex flex-wrap items-start justify-end gap-2">
        <AccionEnDialogo
          tramite={tramite}
          accion={devolverRevisionAccion}
          etiqueta="Devolver a elaboración"
          texto="Las observaciones abiertas pasan a quien elabora, que las responde y vuelve a enviar el documento."
          confirmar="Devolver"
        />
        <div className="flex flex-col items-end gap-1">
          {impedimento ? (
            <Boton disabled aria-describedby="concepto-sin-guardar">
              Dar concepto favorable
            </Boton>
          ) : (
            <DialogoFirma
              titulo="Firmar como «Revisó»"
              etiquetaBoton="Dar concepto favorable"
              resumen={{
                documento: [tramite.codigo, tramite.titulo].filter(Boolean).join(" "),
                version: tramite.versionNumero,
                huella,
              }}
              accion={conceptoFavorableAccion}
              ocultos={{ id: String(tramite.id), etapa: tramite.etapa, ronda: String(tramite.ronda) }}
              pideCodigo={pideCodigo}
            >
              <Campo etiqueta="Concepto" nombre="concepto" ayuda="Su concepto sobre el documento. Entre 5 y 2000 caracteres.">
                <textarea required minLength={5} maxLength={2000} rows={3} className={claseControl} />
              </Campo>
            </DialogoFirma>
          )}
          {/* Siempre montado: un lector de pantalla solo anuncia lo que cambia dentro de una región que ya existía. */}
          <p id="concepto-sin-guardar" role="status" className="text-sm text-muted-foreground">
            {impedimento}
          </p>
        </div>
      </div>
    </section>
  );
}
