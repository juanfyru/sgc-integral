"use client";

import { useState } from "react";
import { resolverMarcaConOcurrenciaAccion, resolverMarcaNoRequiereAccion } from "@/app/acciones-mejoramiento";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { useAccionDeDialogo } from "@/componentes/indicadores/admin/useAccionDeDialogo";
import { Boton } from "@/componentes/ui/Boton";
import { claseControl } from "@/componentes/ui/Campo";
import { useTituloAlDesaparecer } from "@/componentes/ui/foco";
import { Insignia } from "@/componentes/ui/Insignia";
import type { EstadoAccion } from "@/app/admin/comun";
import type { CandidatoDeMarca } from "@/db/consultas/mejoramiento/marcas";
import { AVISO_SIN_PACIENTES } from "@/lib/mejoramiento/textos";

const NO_REQUIERE = "no_requiere";
const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/** La acción de la salida elegida, sin el campo de la opción (el esquema de cada acción es estricto). */
const sinLaOpcion = (accion: (previo: EstadoAccion, formData: FormData) => Promise<EstadoAccion>) => async (previo: EstadoAccion, formData: FormData) => {
  formData.delete("opcion");
  return accion(previo, formData);
};
const conOcurrencia = sinLaOpcion(resolverMarcaConOcurrenciaAccion);
const sinAccion = sinLaOpcion(resolverMarcaNoRequiereAccion);

/**
 * Decidir la acción de mejora de una medición marcada (anexo 15B §6.2, maqueta 5): se elige una salida (la ocurrencia de un hallazgo
 * abierto que cita el indicador, con «Sugerido» en el primero, o «No requiere acción de mejora», solo para el Admin SGC, con su
 * justificación) y se guarda con «Guardar la decisión»: dos gestos deliberados, porque la decisión no se deshace. Cada salida va a
 * su propia acción, con su propio permiso. Resuelta, la página se pinta otra vez y el foco pasa al título.
 */
export function FormularioDeDecision({
  medicionId,
  periodo,
  candidatos,
  puedeNoRequerir,
}: {
  medicionId: number;
  periodo: string;
  candidatos: readonly CandidatoDeMarca[];
  puedeNoRequerir: boolean;
}) {
  const [hecho, setHecho] = useState(false);
  const [elegida, setElegida] = useState("");
  const [justificacion, setJustificacion] = useState("");
  const [estadoOcurrencia, enviarOcurrencia, pendienteOcurrencia] = useAccionDeDialogo(conOcurrencia, () => setHecho(true));
  const [estadoNo, enviarNo, pendienteNo] = useAccionDeDialogo(sinAccion, () => setHecho(true));
  useTituloAlDesaparecer(hecho);
  const esNo = elegida === NO_REQUIERE;
  const error = [estadoOcurrencia, estadoNo].find((e) => e && !e.ok);
  const nombre = `marca-${medicionId}`;
  const opcion = (valor: string, etiqueta: React.ReactNode, detalle?: React.ReactNode) => (
    <div key={valor} className="flex min-w-0 items-start gap-2">
      <input
        type="radio"
        name="opcion"
        id={`${nombre}-${valor}`}
        value={valor}
        required
        checked={elegida === valor}
        onChange={() => setElegida(valor)}
        className={`mt-1 ${FOCO}`}
      />
      <div className="flex min-w-0 flex-col gap-0.5">
        <label htmlFor={`${nombre}-${valor}`} className="break-words font-medium">
          {etiqueta}
        </label>
        {detalle}
      </div>
    </div>
  );
  return (
    <form
      action={esNo ? enviarNo : enviarOcurrencia}
      onSubmit={enviarSinReiniciar(esNo ? enviarNo : enviarOcurrencia)}
      className="flex min-w-0 max-w-xl flex-col items-start gap-2"
    >
      <fieldset className="flex min-w-0 flex-col gap-2 border-0 p-0">
        <legend className="sr-only">{`Salida de la acción de mejora: ${periodo}`}</legend>
        <input type="hidden" name="medicionId" value={medicionId} />
        {elegida !== "" && !esNo ? <input type="hidden" name="hallazgoId" value={elegida} /> : null}
        {candidatos.map((c, i) =>
          opcion(
            String(c.id),
            <>
              {`Añadir como ocurrencia de ${c.codigo}`}
              {i === 0 ? (
                <>
                  {" "}
                  <Insignia variante="neutra">Sugerido</Insignia>
                </>
              ) : null}
            </>,
            <span className="break-words text-muted-foreground">{`«${c.titulo}» · ${c.estado}.`}</span>,
          ),
        )}
        {puedeNoRequerir
          ? opcion(
              NO_REQUIERE,
              "No requiere acción de mejora",
              <span className="text-muted-foreground">Solo el Admin SGC. Pide su justificación y es definitiva.</span>,
            )
          : null}
      </fieldset>
      {esNo ? (
        <div className="flex w-full min-w-0 flex-col gap-1">
          <label htmlFor={`${nombre}-justificacion`} className="text-sm font-medium">
            Justificación
          </label>
          <textarea
            id={`${nombre}-justificacion`}
            name="justificacion"
            required
            minLength={10}
            maxLength={1000}
            rows={3}
            value={justificacion}
            onChange={(e) => setJustificacion(e.target.value)}
            aria-describedby={`${nombre}-justificacion-ayuda`}
            className={`${claseControl} w-full min-w-0 max-w-full`}
          />
        </div>
      ) : null}
      {puedeNoRequerir ? (
        <p id={`${nombre}-justificacion-ayuda`} className="text-xs text-muted-foreground">
          {`La justificación, de al menos 10 caracteres, la leen quienes ven el indicador. ${AVISO_SIN_PACIENTES}`}
        </p>
      ) : null}
      {error && !error.ok ? (
        <p role="alert" className="text-sm text-estado-critico-texto">
          {error.error}
        </p>
      ) : null}
      <Boton type="submit" variante="primario" tamano="sm" pendiente={pendienteOcurrencia || pendienteNo}>
        {pendienteOcurrencia || pendienteNo ? "Guardando…" : "Guardar la decisión"}
      </Boton>
    </form>
  );
}
