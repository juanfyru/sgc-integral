"use client";

import { useActionState, useRef, useState, type FormEvent } from "react";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { Dialogo } from "@/componentes/ui/Dialogo";
import { FECHA_DEL_AJUSTE_PASADA } from "@/lib/mejoramiento/reglas";
import { AVISO_SIN_PACIENTES } from "@/lib/mejoramiento/textos";
import { CamposDelActa, Cita, Desplegable, ErrorDelPaso, TextoDelPaso, type AccionDelPaso } from "../pasos/Partes";
import { envioConConfirmacion } from "./envio-confirmado";

/**
 * Decidir un ajuste del plan en «Lo que sigue» (spec 15 §10.6, maqueta 2), para quien lo decide (`quienDecideAjustes`): de qué
 * actividad es (`cual`, en el encabezado: puede haber varios por decidir), lo que se pidió y, en uno que añade, la acción nueva y
 * la actividad (`detalle`), la causa, quién y cuándo, y su plazo. Aprobarlo, con una nota opcional; negarlo, con la nota; los dos
 * pueden citar el acta del Comité. Si la fecha que da ya pasó (`fechaPasada`), lo advierte y solo ofrece negarlo. Lo que no se
 * deshace (aprobar una cancelación) se confirma en un diálogo con `confirmar`: ningún envío sin confirmar llega a la acción
 * (`envioConConfirmacion`) y el botón que confirma no existe hasta que el diálogo se abre. El servidor vuelve a comprobarlo todo.
 */
export function PasoDecidirAjuste({
  ajusteId,
  cual,
  frase,
  detalle = [],
  causa,
  pedidoPor,
  pedidoEn,
  vence,
  hoy,
  fechaPasada = false,
  confirmar = null,
  accion,
}: {
  ajusteId: number;
  /** De qué es el ajuste, para el encabezado: «la actividad A1.2» o «una actividad nueva». */
  cual: string;
  /** Lo que pide, en una frase (`fraseDelAjuste`). */
  frase: string;
  /** En uno que añade: la acción nueva (tipo, descripción y causas) y la actividad, en líneas ya escritas. */
  detalle?: readonly string[];
  causa: string;
  pedidoPor: string;
  /** El día en que se pidió y el de su plazo, ya escritos para la persona. */
  pedidoEn: string;
  vence: string | null;
  hoy: string;
  /** La fecha que da el ajuste ya pasó (`fechaDelAjustePasada`): ya no se aprueba. */
  fechaPasada?: boolean;
  /** Lo que se pregunta antes de aprobar un ajuste que no se deshace (una cancelación); sin él, se aprueba directo. */
  confirmar?: string | null;
  accion: AccionDelPaso;
}) {
  const [aprobado, aprobar, aprobando] = useActionState(accion, null);
  const [negado, negar, negando] = useActionState(accion, null);
  const [confirmando, setConfirmando] = useState(false);
  const confirmado = useRef(false);
  const id = (c: string) => `ajuste-${ajusteId}-${c}`;
  // Se arma en el evento, no al pintar: la marca de confirmación es una referencia y solo se lee al enviar.
  const alAprobar = (evento: FormEvent<HTMLFormElement>) =>
    envioConConfirmacion({
      pide: confirmar !== null,
      confirmado: () => confirmado.current,
      gastar: () => {
        confirmado.current = false;
      },
      abrir: () => setConfirmando(true),
      enviar: (e) => {
        setConfirmando(false);
        enviarSinReiniciar(aprobar)(e);
      },
    })(evento);
  return (
    <section aria-labelledby={id("titulo")} className="flex min-w-0 flex-col gap-3 border-t border-linea-suave pt-3">
      <h3 id={id("titulo")} className="break-words text-sm font-semibold">
        {`Decidir el ajuste de ${cual}`}
      </h3>
      <p className="break-words text-sm">{frase}</p>
      {detalle.length > 0 ? (
        <ul className="flex list-none flex-col gap-1 text-sm">
          {detalle.map((linea) => (
            <li key={linea} className="break-words">
              {linea}
            </li>
          ))}
        </ul>
      ) : null}
      <Cita rotulo="Causa" texto={causa} />
      <p className="text-xs text-muted-foreground">{`Lo pidió ${pedidoPor} el ${pedidoEn}${vence ? ` · vence el ${vence}` : ""}`}</p>
      {fechaPasada ? (
        <p className="rounded-md border border-estado-atencion bg-estado-atencion-fondo px-3 py-2 text-sm text-estado-atencion-texto">
          {`${FECHA_DEL_AJUSTE_PASADA}.`}
        </p>
      ) : (
        <form action={aprobar} onSubmit={alAprobar} className="flex flex-col gap-3">
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
              {/* Dentro del formulario: «Sí, aprobarlo» lo envía con la nota y el acta escritas, y solo existe con el diálogo abierto. */}
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
                    {confirmando ? (
                      <Boton
                        type="submit"
                        variante="peligro"
                        onClick={() => {
                          confirmado.current = true;
                        }}
                      >
                        Sí, aprobarlo
                      </Boton>
                    ) : null}
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
      )}
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
