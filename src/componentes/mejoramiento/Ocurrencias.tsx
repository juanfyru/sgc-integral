"use client";

import { useActionState, useState } from "react";
import type { EstadoAccion } from "@/app/admin/comun";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { ArchivosDe, type ArchivoParaLista } from "@/componentes/mejoramiento/ArchivosDe";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { Dialogo } from "@/componentes/ui/Dialogo";
import { fechaDeDia } from "@/lib/mejoramiento/formato";
import { AVISO_SIN_PACIENTES } from "@/lib/mejoramiento/textos";

type Props = {
  hallazgoId: number;
  /** `reporte`: llegó por el reporte de un funcionario (spec §7.3), sin decir quién reportó. */
  ocurrencias: ReadonlyArray<{ id: number; fecha: string; descripcion: string; quien: string; reporte?: boolean }>;
  /** Los archivos de cada ocurrencia que llegó por un reporte (los del reporte), por el id de la ocurrencia. */
  archivos?: Readonly<Record<number, ArchivoParaLista[]>>;
  /** Solo quien puede registrar en el proceso y mientras el hallazgo no haya terminado. */
  puedeAnadir: boolean;
  /** Hoy en la zona de la instalación (`yyyy-mm-dd`): el tope de la fecha. */
  hoy: string;
  accion: (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;
};

/**
 * Las ocurrencias de un hallazgo (spec 15 §7.5): las veces que volvió a pasar lo mismo, de la más antigua a la más
 * reciente. Son de solo inserción: no se editan ni se borran. «Añadir una ocurrencia» abre su formulario.
 */
export function Ocurrencias({ hallazgoId, ocurrencias, archivos = {}, puedeAnadir, hoy, accion }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const v = estado?.valores;
  const texto = (c: string, defecto = "") => (typeof v?.[c] === "string" ? (v[c] as string) : defecto);

  if (ocurrencias.length === 0 && !puedeAnadir) return null;
  return (
    <section aria-labelledby="ocurrencias-titulo" className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="ocurrencias-titulo" className="font-display text-base font-semibold">
          Ocurrencias
        </h2>
        {puedeAnadir ? (
          <Boton variante="secundario" tamano="sm" onClick={() => setAbierto(true)} aria-haspopup="dialog">
            Añadir una ocurrencia
          </Boton>
        ) : null}
      </div>
      {ocurrencias.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Aún no hay otras ocurrencias de este hallazgo.</p>
      ) : (
        <ul className="mt-3 flex list-none flex-col gap-2">
          {ocurrencias.map((o) => (
            <li key={o.id} className="border-l-2 border-mod-planes pl-3 text-sm">
              <span className="block font-medium">{fechaDeDia(o.fecha)}</span>
              <span className="block whitespace-pre-line break-words">{o.descripcion}</span>
              <span className="block text-xs text-muted-foreground">Registró: {o.quien}</span>
              {o.reporte ? <span className="block text-xs text-muted-foreground">Llegó por el reporte de un funcionario</span> : null}
              {(archivos[o.id] ?? []).length > 0 ? (
                <div className="mt-1">
                  <ArchivosDe archivos={archivos[o.id]} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <Dialogo
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
        titulo="Añadir una ocurrencia"
        className="m-auto w-full max-w-lg rounded-lg border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40"
      >
        <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex max-h-[90vh] flex-col gap-4 overflow-y-auto p-5">
          <p aria-hidden="true" className="font-semibold">
            Añadir una ocurrencia
          </p>
          <input type="hidden" name="hallazgoId" value={hallazgoId} />
          {estado?.ok === false ? (
            <p role="alert" className="rounded-md border border-estado-critico/40 bg-estado-critico-fondo px-3 py-2 text-sm text-estado-critico-texto">
              {estado.error}
            </p>
          ) : null}
          <Campo etiqueta="Fecha de la ocurrencia" nombre="fecha" id="ocurrencia-fecha">
            <input type="date" required max={hoy} defaultValue={texto("fecha", hoy)} className={claseControl} />
          </Campo>
          <Campo etiqueta="Qué pasó" nombre="descripcion" id="ocurrencia-descripcion" ayuda={AVISO_SIN_PACIENTES}>
            <textarea required minLength={10} maxLength={4000} rows={4} defaultValue={texto("descripcion")} className={claseControl} />
          </Campo>
          <div className="flex flex-wrap justify-end gap-2">
            <Boton variante="secundario" onClick={() => setAbierto(false)}>
              Cancelar
            </Boton>
            <Boton type="submit" variante="primario" pendiente={pendiente}>
              Añadir la ocurrencia
            </Boton>
          </div>
        </form>
      </Dialogo>
    </section>
  );
}
