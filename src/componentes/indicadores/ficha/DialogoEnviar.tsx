"use client";

import { useActionState, useState } from "react";
import { descartarBorradorAccion, enviarAAprobacionAccion } from "@/app/acciones-indicadores";
import { ErrorAccion } from "@/componentes/tramites/AccionesSolicitud";
import { DialogoFirma } from "@/componentes/tramites/DialogoFirma";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { Dialogo } from "@/componentes/ui/Dialogo";
import { useTituloAlDesaparecer } from "@/componentes/ui/foco";
import type { TipoCambio } from "@/lib/indicadores/tipos";
import { huellaAbreviada } from "@/lib/tramites/tipos";

const CONTROL = `${claseControl} w-full`;

/** Lo que el servidor calculó del borrador guardado; las fechas y los periodos ya vienen en palabras. */
export type EnvioDeFicha = {
  versionId: number;
  codigo: string;
  nombre: string;
  numero: number;
  tipo: TipoCambio | "ninguno";
  cambios: string[];
  huella: string;
  probada: boolean;
  motivo: string | null;
  /** Inicial: el inicio de medición; menor: el de la versión que reemplaza. */
  rigeDesde: string | null;
  /** Solo en un cambio mayor. */
  rige: { porOmision: string; opciones: { clave: string; etiqueta: string }[] } | null;
  /** Cuándo se guardó el borrador por última vez. */
  guardado: string;
};

const TIPO: Record<TipoCambio, string> = {
  inicial: "Ficha nueva: la aprueba quien diga su clasificación",
  mayor: "Cambio mayor: va a aprobación",
  menor: "Cambio menor: se publica de inmediato, sin aprobador",
};

function Aviso({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-l-4 border-border border-l-mod-indicadores bg-muted px-3 py-2 text-sm">{children}</p>;
}

/**
 * «Enviar a aprobación» (spec §7.6 y §12.4): dice qué tipo de cambio es y qué cambió, pide el motivo de un cambio y, si
 * es mayor, desde cuándo rige; se firma con la clave en el mismo envío. Se envía el borrador tal como quedó guardado.
 */
export function DialogoEnviar({ envio, pideCodigo }: { envio: EnvioDeFicha; pideCodigo: boolean }) {
  if (envio.tipo === "ninguno") return <Aviso>El borrador no cambia nada frente a la ficha vigente: no hay qué enviar.</Aviso>;
  if (!envio.probada) {
    return <Aviso>Para enviarla, pruebe la fórmula con valores de ejemplo en «Prueba» y guarde el borrador.</Aviso>;
  }
  const tipo = envio.tipo;
  const menor = tipo === "menor";
  return (
    <div className="flex flex-col items-start gap-2">
      <DialogoFirma
        titulo={menor ? `Publicar el cambio menor de ${envio.codigo}` : `Enviar a aprobación ${envio.codigo}, versión ${envio.numero}`}
        etiquetaBoton={menor ? "Publicar el cambio menor" : "Enviar a aprobación"}
        accion={enviarAAprobacionAccion}
        ocultos={{ id: String(envio.versionId) }}
        pideCodigo={pideCodigo}
      >
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Indicador</dt>
          <dd className="break-words">{`${envio.codigo} · ${envio.nombre}`}</dd>
          <dt className="text-muted-foreground">Versión</dt>
          <dd>{envio.numero}</dd>
          <dt className="text-muted-foreground">Tipo</dt>
          <dd>{TIPO[tipo]}</dd>
          {envio.cambios.length > 0 ? (
            <>
              <dt className="text-muted-foreground">Qué cambió</dt>
              <dd className="break-words">{envio.cambios.join(", ")}</dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">Huella</dt>
          <dd className="font-mono">{huellaAbreviada(envio.huella)}</dd>
          {envio.rigeDesde && !envio.rige ? (
            <>
              <dt className="text-muted-foreground">Rige desde</dt>
              <dd>{envio.rigeDesde}</dd>
            </>
          ) : null}
        </dl>
        <p className="text-sm text-muted-foreground">
          {menor
            ? "Queda la firma «Elaboró» y rige de inmediato, para los mismos periodos que la versión que reemplaza; ninguna medición cambia."
            : "Queda la firma «Elaboró» sobre la huella de la ficha; la aprobación la decide quien corresponda según su clasificación."}
        </p>
        {tipo === "inicial" ? null : (
          <Campo etiqueta="Motivo del cambio" nombre="motivo" ayuda="Obligatorio; hasta 500 caracteres. Queda en el control de cambios.">
            <textarea required maxLength={500} rows={3} defaultValue={envio.motivo ?? ""} className={CONTROL} />
          </Campo>
        )}
        {envio.rige ? (
          <Campo
            etiqueta="Rige desde"
            nombre="rigeDesde"
            ayuda="Un periodo sin mediciones reportadas, a más tardar el que está en curso. Las mediciones anteriores conservan su versión."
          >
            <select defaultValue={envio.rige.porOmision} className={CONTROL}>
              {envio.rige.opciones.map((o) => (
                <option key={o.clave} value={o.clave}>
                  {o.etiqueta}
                </option>
              ))}
            </select>
          </Campo>
        ) : null}
      </DialogoFirma>
      <p className="text-xs text-muted-foreground">{`Se envía la ficha tal como quedó guardada el ${envio.guardado}: guarde antes lo que haya cambiado en el formulario.`}</p>
    </div>
  );
}

/** «Descartar el cambio» (spec §7.6): el borrador de un cambio se descarta y la ficha vigente queda como estaba. */
export function DescartarCambio({ versionId, volver }: { versionId: number; volver: string }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, enviar, pendiente] = useActionState(descartarBorradorAccion, null);
  useTituloAlDesaparecer(abierto);
  return (
    <>
      <Boton variante="secundario" onClick={() => setAbierto(true)} aria-haspopup="dialog">
        Descartar el cambio
      </Boton>
      <Dialogo
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
        titulo="Descartar el cambio"
        className="m-auto w-full max-w-md rounded-lg border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40"
      >
        {abierto ? (
          <form action={enviar} className="flex flex-col gap-4 p-5">
            <input type="hidden" name="id" value={versionId} />
            <input type="hidden" name="volver" value={volver} />
            <p className="text-sm text-muted-foreground">
              El borrador se descarta y la ficha vigente queda como estaba. Queda en la bitácora; su número de versión no se vuelve a usar.
            </p>
            <ErrorAccion estado={estado} />
            <div className="flex flex-wrap justify-end gap-2">
              <Boton variante="secundario" onClick={() => setAbierto(false)}>
                Volver
              </Boton>
              <Boton type="submit" variante="peligro" pendiente={pendiente}>
                {pendiente ? "Descartando…" : "Descartar"}
              </Boton>
            </div>
          </form>
        ) : null}
      </Dialogo>
    </>
  );
}
