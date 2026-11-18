"use client";

import { useActionState, useState } from "react";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { Dialogo } from "@/componentes/ui/Dialogo";
import { AVISO_SIN_PACIENTES } from "@/lib/mejoramiento/textos";
import { CamposDelActa, Cita, Desplegable, ErrorDelPaso, TextoDelPaso, type AccionDelPaso } from "../pasos/Partes";

/**
 * Decidir un ajuste del plan en «Lo que sigue» (spec 15 §10.6, maqueta 2), para quien lo decide (`quienDecideAjustes`): lo que se
 * pidió, la causa, quién y cuándo, y su plazo. Aprobarlo, con una nota opcional; negarlo, con la nota; los dos pueden citar el
 * acta del Comité. Lo que no se deshace (aprobar una cancelación) se confirma en un diálogo con `confirmar`. El servidor vuelve a
 * comprobar quién decide y que siga por decidir.
 */
export function PasoDecidirAjuste({
  ajusteId,
  frase,
  causa,
  pedidoPor,
  pedidoEn,
  vence,
  hoy,
  confirmar = null,
  accion,
}: {
  ajusteId: number;
  /** Lo que pide, en una frase (`fraseDelAjuste`). */
  frase: string;
  causa: string;
  pedidoPor: string;
  /** El día en que se pidió y el de su plazo, ya escritos para la persona. */
  pedidoEn: string;
  vence: string | null;
  hoy: string;
  /** Lo que se pregunta antes de aprobar un ajuste que no se deshace (una cancelación); sin él, se aprueba directo. */
  confirmar?: string | null;
  accion: AccionDelPaso;
}) {
  const [aprobado, aprobar, aprobando] = useActionState(accion, null);
  const [confirmando, setConfirmando] = useState(false);
  const [negado, negar, negando] = useActionState(accion, null);
  const id = (c: string) => `ajuste-${ajusteId}-${c}`;
  return (
    <section aria-labelledby={id("titulo")} className="flex min-w-0 flex-col gap-3 border-t border-linea-suave pt-3">
      <h3 id={id("titulo")} className="text-sm font-semibold">
        Decidir el ajuste
      </h3>
      <p className="break-words text-sm">{frase}</p>
      <Cita rotulo="Causa" texto={causa} />
      <p className="text-xs text-muted-foreground">{`Lo pidió ${pedidoPor} el ${pedidoEn}${vence ? ` · vence el ${vence}` : ""}`}</p>
      <form action={aprobar} onSubmit={enviarSinReiniciar(aprobar)} className="flex flex-col gap-3">
        <input type="hidden" name="ajusteId" value={ajusteId} />
        <input type="hidden" name="aprueba" value="si" />
        <Campo etiqueta="Nota (opcional)" nombre="nota" id={id("nota-aprobar")} ayuda={AVISO_SIN_PACIENTES}>
          <textarea minLength={10} maxLength={1000} rows={2} className={claseControl} />
        </Campo>
        <CamposDelActa prefijo={id("aprobar")} hoy={hoy} />
        <ErrorDelPaso estado={aprobado} />
        {confirmar ? (
          <>
            <Boton onClick={() => setConfirmando(true)} aria-haspopup="dialog" pendiente={aprobando} className="self-start">
              {aprobando ? "Aprobando…" : "Aprobar el ajuste"}
            </Boton>
            {/* Dentro del formulario: «Sí, aprobarlo» lo envía con la nota y el acta escritas. */}
            <Dialogo
              abierto={confirmando}
              alCerrar={() => setConfirmando(false)}
              titulo="Aprobar el ajuste"
              className="m-auto w-full max-w-md rounded-lg border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40"
            >
              <div className="flex flex-col gap-4 p-5">
                <p className="text-sm">{confirmar}</p>
                <div className="flex flex-wrap justify-end gap-2">
                  <Boton variante="secundario" onClick={() => setConfirmando(false)}>
                    Volver
                  </Boton>
                  <Boton type="submit" variante="peligro" onClick={() => setConfirmando(false)}>
                    Sí, aprobarlo
                  </Boton>
                </div>
              </div>
            </Dialogo>
          </>
        ) : (
          <Boton type="submit" pendiente={aprobando} className="self-start">
            {aprobando ? "Aprobando…" : "Aprobar el ajuste"}
          </Boton>
        )}
      </form>
      <Desplegable titulo="Negar el ajuste">
        <form action={negar} onSubmit={enviarSinReiniciar(negar)} className="flex flex-col gap-3">
          <input type="hidden" name="ajusteId" value={ajusteId} />
          <input type="hidden" name="aprueba" value="no" />
          <TextoDelPaso etiqueta="Por qué lo niega (al menos 10 caracteres)" nombre="nota" id={id("nota-negar")} />
          <CamposDelActa prefijo={id("negar")} hoy={hoy} />
          <ErrorDelPaso estado={negado} />
          <Boton type="submit" variante="peligro" pendiente={negando} className="self-start">
            {negando ? "Negando…" : "Negar el ajuste"}
          </Boton>
        </form>
      </Desplegable>
    </section>
  );
}
