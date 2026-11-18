"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { EstadoAccion } from "@/app/admin/comun";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { Boton, claseBoton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { Dialogo } from "@/componentes/ui/Dialogo";
import { rutaDeConvertir } from "@/lib/mejoramiento/reportes";
import { AVISO_SIN_PACIENTES } from "@/lib/mejoramiento/textos";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

type Accion = (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;

/** Un hallazgo abierto que se parece al reporte (`abiertosParecidosAlReporte`). */
export type ParecidoDelReporte = { id: number; codigo: string; titulo: string; etiqueta: string; proceso: string };

function Rechazo({ estado }: { estado: EstadoAccion }) {
  return estado?.ok === false ? (
    <p role="alert" className="rounded-md border border-estado-critico/40 bg-estado-critico-fondo px-3 py-2 text-sm text-estado-critico-texto">
      {estado.error}
    </p>
  ) : null;
}

/** La opción «Otro hallazgo abierto, por su código» entre los parecidos: deja el código como lo que se envía. */
const OTRO = "otro";

/**
 * «Añadir a un hallazgo abierto»: cualquier hallazgo abierto que quien clasifica vea, por su código (spec §7.3); los parecidos,
 * si los hay, son sugerencias que se eligen con un clic. El código solo se envía (y se exige) cuando no se eligió un parecido.
 */
function Sumar({ reporteId, parecidos, conProceso, sumar }: { reporteId: number; parecidos: readonly ParecidoDelReporte[]; conProceso: boolean; sumar: Accion }) {
  const [estado, enviar, pendiente] = useActionState(sumar, null);
  const [eleccion, setEleccion] = useState<string>("");
  const conSugerencias = parecidos.length > 0;
  const porCodigo = !conSugerencias || eleccion === OTRO;
  const idCodigo = `sumar-${reporteId}-codigo`;
  const campoCodigo = (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={idCodigo} className="text-sm">
        {conSugerencias ? "Código del otro hallazgo" : "Código del hallazgo abierto"}
      </label>
      <input
        id={idCodigo}
        name="codigo"
        type="text"
        maxLength={20}
        autoComplete="off"
        placeholder="HZ-2026-004"
        required={porCodigo}
        disabled={!porCodigo}
        className={`${claseControl} w-full max-w-xs disabled:cursor-not-allowed disabled:border-dashed`}
      />
    </div>
  );
  return (
    <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex min-w-0 flex-col gap-2">
      <input type="hidden" name="reporteId" value={reporteId} />
      {conSugerencias ? (
        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="mb-1 text-sm">
            {conProceso ? "Sugerencias: hallazgos abiertos parecidos, de su proceso" : "Sugerencias: hallazgos abiertos parecidos"}
          </legend>
          {parecidos.map((p) => {
            const id = `sumar-${reporteId}-${p.id}`;
            return (
              <div key={p.id} className="flex min-w-0 items-start gap-2">
                <input
                  type="radio"
                  id={id}
                  name="hallazgoId"
                  value={p.id}
                  required
                  checked={eleccion === String(p.id)}
                  onChange={() => setEleccion(String(p.id))}
                  className={`mt-1 ${FOCO}`}
                />
                <label htmlFor={id} className="min-w-0 break-words text-sm">
                  <span className="font-mono">{p.codigo}</span> {p.titulo}
                  <span className="block text-xs text-muted-foreground">{`${p.etiqueta} · ${p.proceso}`}</span>
                </label>
              </div>
            );
          })}
          <div className="flex min-w-0 items-start gap-2">
            <input
              type="radio"
              id={`sumar-${reporteId}-otro`}
              name="hallazgoId"
              value=""
              required
              checked={eleccion === OTRO}
              onChange={() => setEleccion(OTRO)}
              className={`mt-1 ${FOCO}`}
            />
            <label htmlFor={`sumar-${reporteId}-otro`} className="min-w-0 text-sm">
              Otro hallazgo abierto, por su código
            </label>
          </div>
          {campoCodigo}
        </fieldset>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {conProceso ? "No hay hallazgos abiertos que se le parezcan en su proceso." : "No hay hallazgos abiertos que se le parezcan."}{" "}
            Si es el mismo problema que uno abierto, escriba su código.
          </p>
          {campoCodigo}
        </>
      )}
      <Rechazo estado={estado} />

      <div>
        <Boton type="submit" variante="secundario" pendiente={pendiente}>
          Añadir como ocurrencia
        </Boton>
      </div>
    </form>
  );
}

function Descartar({ reporteId, descartar }: { reporteId: number; descartar: Accion }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, enviar, pendiente] = useActionState(descartar, null);
  const v = estado?.valores;
  return (
    <>
      <Boton variante="peligro" onClick={() => setAbierto(true)} aria-haspopup="dialog">
        Descartar
      </Boton>
      <Dialogo
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
        titulo="Descartar el reporte"
        className="m-auto w-full max-w-lg rounded-lg border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40"
      >
        <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex max-h-[90vh] flex-col gap-4 overflow-y-auto p-5">
          <p aria-hidden="true" className="font-semibold">
            Descartar el reporte
          </p>
          <input type="hidden" name="reporteId" value={reporteId} />
          <p className="text-sm">
            El reporte queda «Descartado», con su historia: no se borra. Quien lo envió lee el motivo que escriba aquí.
          </p>
          <Rechazo estado={estado} />
          <Campo etiqueta="Motivo (al menos 10 caracteres)" nombre="motivo" id={`descartar-${reporteId}-motivo`} ayuda={AVISO_SIN_PACIENTES}>
            <textarea
              required
              minLength={10}
              maxLength={1000}
              rows={3}
              defaultValue={typeof v?.motivo === "string" ? v.motivo : ""}
              className={claseControl}
            />
          </Campo>
          <div className="flex flex-wrap justify-end gap-2">
            <Boton variante="secundario" onClick={() => setAbierto(false)}>
              Cancelar
            </Boton>
            <Boton type="submit" variante="peligro" pendiente={pendiente}>
              Descartar el reporte
            </Boton>
          </div>
        </form>
      </Dialogo>
    </>
  );
}

/**
 * Clasificar un reporte recibido (spec 15 §7.3), del Admin SGC: «Convertir en hallazgo» abre el registro con lo del reporte
 * copiado; «Añadir a un hallazgo abierto» lo suma como ocurrencia de uno de los parecidos (los del proceso del reporte, o de
 * todos si no lo dice); «Descartar» pide el motivo, que lee quien reportó. El servidor vuelve a comprobar que siga recibido.
 */
export function ClasificarReporte({
  reporteId,
  parecidos,
  conProceso,
  sumar,
  descartar,
}: {
  reporteId: number;
  parecidos: readonly ParecidoDelReporte[];
  /** Si el reporte dice su proceso (los parecidos son de él) o «no sé» (de todos). */
  conProceso: boolean;
  sumar: Accion;
  descartar: Accion;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-4 border-t border-linea-suave pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={rutaDeConvertir(reporteId)} className={`${claseBoton("primario")} ${FOCO}`}>
          Convertir en hallazgo
        </Link>
        <Descartar reporteId={reporteId} descartar={descartar} />
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <h3 className="text-sm font-semibold">Añadir a un hallazgo abierto</h3>
        <Sumar reporteId={reporteId} parecidos={parecidos} conProceso={conProceso} sumar={sumar} />
      </div>
    </div>
  );
}
