"use client";

import { descartarIndicadorAccion, retirarAccion } from "@/app/acciones-indicadores";
import { ErrorAccion } from "@/componentes/tramites/AccionesSolicitud";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { Dialogo } from "@/componentes/ui/Dialogo";
import { useAccionDeDialogo } from "./useAccionDeDialogo";

export const CLASE_DIALOGO = "m-auto w-full max-w-md rounded-lg border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40";

const TEXTOS = {
  retirar: {
    titulo: "Retirar",
    explicacion:
      "El indicador deja de medirse: no abre más periodos y sus mediciones abiertas sin ningún dato se quitan. Las que tienen datos siguen su curso hasta el cierre, un cambio en curso de la ficha se descarta y se avisa a las personas designadas. Es definitivo: para volver a medirlo se crea otro a partir de este.",
    boton: "Retirar el indicador",
    pendiente: "Retirando…",
    ayuda: "Entre 5 y 500 caracteres. Queda en la bitácora y lo ven las personas designadas.",
  },
  descartar: {
    titulo: "Descartar",
    explicacion:
      "El indicador se envió a aprobación y nunca se aprobó. Queda descartado, visible solo para quien administra, y su código sigue ocupado. No se puede deshacer.",
    boton: "Descartar el indicador",
    pendiente: "Descartando…",
    ayuda: "Entre 5 y 500 caracteres. Queda en la bitácora.",
  },
} as const;

/** «Retirar» un indicador activo o «Descartar» uno que se envió y nunca se aprobó: ambos piden un motivo y no una clave. */
export function DialogoRetirar({
  modo,
  abierto,
  alCerrar,
  indicadorId,
  codigo,
}: {
  modo: "retirar" | "descartar";
  abierto: boolean;
  alCerrar: () => void;
  indicadorId: number;
  codigo: string;
}) {
  const t = TEXTOS[modo];
  const [estado, enviar, pendiente] = useAccionDeDialogo(modo === "retirar" ? retirarAccion : descartarIndicadorAccion, alCerrar);
  const motivo = estado?.valores?.motivo;
  return (
    <Dialogo abierto={abierto} alCerrar={alCerrar} titulo={`${t.titulo} ${codigo}`} className={CLASE_DIALOGO}>
      {abierto ? (
        <form action={enviar} className="flex flex-col gap-4 p-5">
          <input type="hidden" name="id" value={indicadorId} />
          <p aria-hidden="true" className="font-semibold">{`${t.titulo} ${codigo}`}</p>
          <p className="text-sm text-muted-foreground">{t.explicacion}</p>
          <Campo etiqueta="Motivo" nombre="motivo" ayuda={t.ayuda}>
            <textarea required minLength={5} maxLength={500} rows={3} defaultValue={typeof motivo === "string" ? motivo : ""} className={`${claseControl} w-full`} />
          </Campo>
          <ErrorAccion estado={estado} />
          <div className="flex flex-wrap justify-end gap-2">
            <Boton variante="secundario" onClick={alCerrar}>
              Volver
            </Boton>
            <Boton type="submit" variante="peligro" pendiente={pendiente}>
              {pendiente ? t.pendiente : t.boton}
            </Boton>
          </div>
        </form>
      ) : null}
    </Dialogo>
  );
}
