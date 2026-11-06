"use client";

import { useActionState, useState } from "react";
import { conceptoFavorableAccion, devolverRevisionAccion, guardarVerificacionAccion } from "@/app/acciones-tramites";
import { AvisoCriterios, cuantosCriterios, notaSuficiente, type CriterioVisible } from "@/componentes/tramites/AvisoCriterios";
import { AccionEnDialogo } from "@/componentes/tramites/AccionesSolicitud";
import { DialogoFirma } from "@/componentes/tramites/DialogoFirma";
import { ListaVerificacion } from "@/componentes/tramites/ListaVerificacion";
import { Observaciones } from "@/componentes/tramites/Observaciones";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import type { Observacion, RespuestaItem } from "@/db/consultas/revision";
import { CRITICO_NO_CUMPLE, FALTA_NOTA_CRITERIO, SIN_ITEMS_ACTIVOS, type Etapa } from "@/lib/tramites/tipos";

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
 * `criterios` son los que no cumplen según lo guardado, y `huellaCriterios` la huella que se confirma al firmar.
 * `criticosActuales` son los ítems activos que hoy son críticos, aunque la ronda los guardara sin esa marca.
 */
export function PanelRevision({
  tramite,
  respuestas,
  hayItemsActivos,
  propuesta,
  observaciones,
  huella,
  pideCodigo,
  criterios,
  huellaCriterios,
  criticosActuales,
}: {
  tramite: TramiteParaRevisar;
  respuestas: RespuestaItem[];
  hayItemsActivos: boolean;
  propuesta: boolean;
  observaciones: Observacion[];
  huella: string | null;
  pideCodigo: boolean;
  criterios: CriterioVisible[];
  huellaCriterios: string;
  criticosActuales: number[];
}) {
  const [estado, enviar, pendiente] = useActionState(guardarVerificacionAccion, null);
  const [cambios, setCambios] = useState(0);
  const [enviadoCon, setEnviadoCon] = useState<number | null>(null);
  // Lo que se firma es lo guardado: con marcas sin guardar en pantalla, se firmaría otra lista. Lo
  // propuesto también es eso, aunque nadie lo haya tocado: el revisor lo confirma guardando.
  const guardado = enviadoCon !== null && enviadoCon === cambios && !pendiente && !estado;
  const sinGuardar = (cambios > 0 || propuesta) && !guardado;
  // Un crítico que no cumple bloquea aunque el ítem se volviera crítico durante la ronda: el servidor lo rechaza igual.
  const criticoSinCumplir = respuestas.some((r) => r.resultado === "no_cumple" && (r.critico || criticosActuales.includes(r.itemId)));
  const impedimento = !hayItemsActivos
    ? SIN_ITEMS_ACTIVOS
    : sinGuardar
      ? "Guarde el avance de la lista antes de dar el concepto"
      : criticoSinCumplir
        ? CRITICO_NO_CUMPLE
        : criterios.some((c) => !notaSuficiente(c.nota))
          ? FALTA_NOTA_CRITERIO
          : "";

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
          criticosActuales={criticosActuales}
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
              <AvisoCriterios
                criterios={criterios}
                huella={huellaCriterios}
                titulo={`Esta revisión tiene ${cuantosCriterios(criterios.length)}`}
                confirmacion={`Doy concepto favorable a pesar de ${criterios.length === 1 ? "este criterio" : "estos criterios"}`}
              />
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
