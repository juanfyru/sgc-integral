"use client";

import { useActionState, useState } from "react";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { DialogoFirma } from "@/componentes/tramites/DialogoFirma";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { AVISO_SIN_PACIENTES } from "@/lib/mejoramiento/textos";
import { huellaAbreviada } from "@/lib/tramites/tipos";
import { Desplegable, ErrorDelPaso, TextoDelPaso, type AccionDelPaso } from "../pasos/Partes";

/**
 * «Devolver con observaciones» (spec 15 §8.6): vuelve a «Por formular» y quien formula lo envía otra vez, con una firma
 * «Elaboró» nueva. Lo usan la revisión y la aprobación, cada una con la acción de su permiso.
 */
export function DevolverPlan({ hallazgoId, accion }: { hallazgoId: number; accion: AccionDelPaso }) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  return (
    <Desplegable titulo="Devolver con observaciones">
      <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex flex-col gap-3">
        <input type="hidden" name="hallazgoId" value={hallazgoId} />
        <p className="text-sm">
          Vuelve a «Por formular»: quien formula corrige el análisis o el plan y lo envía otra vez, con una firma «Elaboró» nueva.
        </p>
        <TextoDelPaso etiqueta="Observaciones (al menos 10 caracteres)" nombre="observaciones" id={`devolver-plan-${hallazgoId}`} maximo={2000} />
        <ErrorDelPaso estado={estado} />
        <Boton type="submit" variante="secundario" pendiente={pendiente} className="self-start">
          {pendiente ? "Devolviendo…" : "Devolver el plan"}
        </Boton>
      </form>
    </Desplegable>
  );
}

/**
 * «En revisión», para el Administrador del SGC que puede revisar (spec 15 §8.6): las causas que quedaron sin acción, lo que la
 * página le pone en `children` (los parecidos de otros procesos y, si reincide, la vez pasada), la marca «Requiere recursos
 * adicionales o tiene impacto institucional» con su nota, devolver y firmar «Revisó». La marca y su nota viajan con la firma;
 * el texto dice antes de firmar si el plan pasa a Gerencia o si la revisión vale como aprobación.
 */
export function PasoRevisar({
  hallazgoId,
  causasSinAccion,
  gerencia,
  huella,
  pideCodigo,
  firmar,
  devolver,
  children,
}: {
  hallazgoId: number;
  causasSinAccion: ReadonlyArray<{ orden: number; texto: string; porque: string | null }>;
  /** La condición fija por la que aprueba Gerencia (`razonDeGerencia` sin la marca), o `null`. */
  gerencia: string | null;
  huella: string;
  pideCodigo: boolean;
  firmar: AccionDelPaso;
  devolver: AccionDelPaso;
  children?: React.ReactNode;
}) {
  const [requiere, setRequiere] = useState(false);
  const [nota, setNota] = useState("");
  const destino =
    gerencia !== null
      ? `Con su firma, el plan pasa a Gerencia para su aprobación (${gerencia}).`
      : requiere
        ? "Con la marca, el plan pasa a Gerencia para su aprobación."
        : "Sin otra condición, su revisión vale como aprobación: el plan pasa a ejecución y cada actividad llega a su responsable.";
  const ocultos: Record<string, string> = { hallazgoId: String(hallazgoId), ...(requiere ? { requiereRecursos: "si", notaRecursos: nota } : {}) };
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <section aria-labelledby={`sin-accion-${hallazgoId}`} className="flex flex-col gap-2 rounded-md border border-linea-suave p-3">
        <h3 id={`sin-accion-${hallazgoId}`} className="text-sm font-semibold">
          Causas sin acción
        </h3>
        {causasSinAccion.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todas las causas tienen al menos una acción.</p>
        ) : (
          <ul className="flex list-none flex-col gap-2 text-sm">
            {causasSinAccion.map((c) => (
              <li key={c.orden} className="break-words">
                <span className="font-medium">{`La causa ${c.orden}.`}</span> {c.texto}
                {c.porque ? <span className="block text-muted-foreground">{`Por qué no requiere acción: ${c.porque}`}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
      {children}
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Recursos e impacto</legend>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={requiere}
            onChange={(e) => setRequiere(e.target.checked)}
            className="mt-1 accent-marca focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
          />
          <span>Requiere recursos adicionales o tiene impacto institucional</span>
        </label>
        <Campo etiqueta="Nota de los recursos o del impacto (obligatoria con la marca)" nombre="notaRecursos" id={`revisar-nota-${hallazgoId}`} ayuda={AVISO_SIN_PACIENTES}>
          <textarea value={nota} onChange={(e) => setNota(e.target.value)} maxLength={1000} rows={2} className={claseControl} />
        </Campo>
      </fieldset>
      <p className="text-sm">{destino}</p>
      <div>
        <DialogoFirma
          titulo="Firmar la revisión del plan"
          etiquetaBoton="Firmar la revisión"
          textoAlFirmar="Firmar la revisión"
          accion={firmar}
          ocultos={ocultos}
          pideCodigo={pideCodigo}
        >
          <p className="text-sm">{destino}</p>
          {requiere ? <p className="whitespace-pre-line break-words text-sm">{`Nota: ${nota.trim() || "(sin escribir)"}`}</p> : null}
          <p className="text-sm">
            Huella del plan enviado: <span className="font-mono">{huellaAbreviada(huella)}</span>
          </p>
        </DialogoFirma>
      </div>
      <DevolverPlan hallazgoId={hallazgoId} accion={devolver} />
    </div>
  );
}
