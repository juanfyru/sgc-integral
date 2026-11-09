"use client";

import { useActionState } from "react";
import {
  cerrarHallazgoAccion,
  corregirHallazgoAccion,
  reabrirHallazgoAccion,
  validarHallazgoAccion,
} from "@/app/acciones-distribucion";
import type { EstadoAccion } from "@/app/admin/comun";
import { ZonaCarga } from "@/componentes/admin/ZonaCarga";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { ErrorAccion } from "@/componentes/tramites/AccionesSolicitud";
import { Boton } from "@/componentes/ui/Boton";
import { claseControl } from "@/componentes/ui/Campo";
import type { HallazgoDeVerificacion } from "@/db/consultas/distribucion/verificaciones";

type Accion = (estado: EstadoAccion, datos: FormData) => Promise<EstadoAccion>;

const claseDetalles = "rounded-md border border-border p-2";
const claseResumen =
  "cursor-pointer rounded text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/** Un formulario de una acción sobre el hallazgo, con su nota si la pide; vuelve a la verificación. */
function Formulario({
  accion,
  hallazgoId,
  verificacionId,
  nota,
  boton,
  variante,
}: {
  accion: Accion;
  hallazgoId: number;
  verificacionId: number;
  nota?: string;
  boton: string;
  variante?: "primario" | "secundario" | "peligro";
}) {
  const [estado, enviar, pendiente] = useActionState<EstadoAccion, FormData>(accion, null);
  return (
    <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={hallazgoId} />
      <input type="hidden" name="verificacion" value={verificacionId} />
      {nota ? (
        <label className="flex flex-col gap-1 text-sm font-medium">
          {nota}
          <textarea
            name="nota"
            required
            minLength={5}
            maxLength={1000}
            rows={2}
            defaultValue={estado?.valores?.nota as string | undefined}
            className={claseControl}
          />
        </label>
      ) : null}
      <ErrorAccion estado={estado} />
      <div>
        <Boton type="submit" variante={variante} pendiente={pendiente}>
          {pendiente ? "Procesando…" : boton}
        </Boton>
      </div>
    </form>
  );
}

/**
 * Lo que la persona puede hacer con un hallazgo (spec 13C §12.5): «Corregido» con nota (y la foto, que se sube aparte)
 * para quien responde por el punto; «Validar» y «Reabrir…» para quien realiza verificaciones; cerrar directamente para
 * quien gestiona la distribución. El servidor vuelve a comprobar cada condición.
 */
export function AccionesHallazgo({ hallazgo: h, verificacionId }: { hallazgo: HallazgoDeVerificacion; verificacionId: number }) {
  if (!h.puedeCorregir && !h.puedeValidar && !h.puedeCerrar) return null;
  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
      {h.puedeCorregir ? (
        <div className="flex flex-col gap-2">
          <Formulario
            accion={corregirHallazgoAccion}
            hallazgoId={h.id}
            verificacionId={verificacionId}
            nota="Qué se hizo para corregirlo"
            boton="Corregido"
          />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">Foto de la corrección (opcional)</p>
            <ZonaCarga direccion={`/api/hallazgos/${h.id}/archivos`} evidencia />
          </div>
        </div>
      ) : null}
      {h.puedeValidar ? (
        <div className="flex flex-col gap-2">
          <Formulario accion={validarHallazgoAccion} hallazgoId={h.id} verificacionId={verificacionId} boton="Validar" />
          <details className={claseDetalles}>
            <summary className={claseResumen}>Reabrir…</summary>
            <div className="mt-2">
              <Formulario
                accion={reabrirHallazgoAccion}
                hallazgoId={h.id}
                verificacionId={verificacionId}
                nota="Por qué la corrección no basta"
                boton="Reabrir"
                variante="secundario"
              />
            </div>
          </details>
        </div>
      ) : null}
      {h.puedeCerrar ? (
        <details className={claseDetalles}>
          <summary className={claseResumen}>Cerrar directamente…</summary>
          <p className="mt-2 text-sm text-muted-foreground">
            Cierra el hallazgo sin esperar la validación; queda como validado por el Administrador del SGC.
          </p>
          <div className="mt-2">
            <Formulario
              accion={cerrarHallazgoAccion}
              hallazgoId={h.id}
              verificacionId={verificacionId}
              nota="Qué se hizo para corregirlo"
              boton="Cerrar hallazgo"
              variante="secundario"
            />
          </div>
        </details>
      ) : null}
    </div>
  );
}
