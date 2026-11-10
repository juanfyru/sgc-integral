"use client";

import { useActionState } from "react";
import { abrirEdicionAccion, editarEdicionAccion } from "@/app/acciones-vigencia";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { ErrorAccion } from "@/componentes/tramites/AccionesSolicitud";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";

const control = `${claseControl} w-full min-w-0 max-w-full`;

/**
 * Los datos de una edición (spec 13C §8.3): abrir la siguiente en borrador (`id` del documento) o corregir la que está
 * en borrador (`id` de la versión). «Qué cambió» se exige cuando ya hay una edición vigente: es lo que lee la audiencia
 * en su acuse; en la primera es opcional.
 */
export function FormularioEdicion({
  modo,
  id,
  valores,
  exigeResumen,
}: {
  modo: "abrir" | "corregir";
  id: number;
  valores: { edicion: string; fechaEdicion: string | null; resumenCambios: string | null };
  exigeResumen: boolean;
}) {
  const [estado, enviar, pendiente] = useActionState(modo === "abrir" ? abrirEdicionAccion : editarEdicionAccion, null);
  return (
    <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex min-w-0 flex-col gap-4">
      <input type="hidden" name="id" value={id} />
      <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo etiqueta="Edición" nombre="edicion" ayuda="Como la nombra el emisor: «2024», «rev. 5.0».">
          <input required maxLength={60} defaultValue={valores.edicion} className={control} />
        </Campo>
        <Campo etiqueta="Fecha de emisión (opcional)" nombre="fechaEdicion">
          <input type="date" defaultValue={valores.fechaEdicion ?? ""} className={control} />
        </Campo>
      </div>
      <Campo
        etiqueta={exigeResumen ? "Qué cambió" : "Qué cambió (opcional)"}
        nombre="resumenCambios"
        ayuda={exigeResumen ? "Entre 5 y 2000 caracteres. Lo lee la audiencia en su acuse de lectura." : "En la primera edición no hace falta."}
      >
        <textarea
          rows={3}
          required={exigeResumen}
          minLength={exigeResumen ? 5 : undefined}
          maxLength={2000}
          defaultValue={valores.resumenCambios ?? ""}
          className={control}
        />
      </Campo>
      <div className="flex flex-col items-stretch gap-2 sm:items-end">
        <ErrorAccion estado={estado} />
        <Boton type="submit" variante={modo === "abrir" ? "primario" : "secundario"} pendiente={pendiente}>
          {pendiente ? "Guardando…" : modo === "abrir" ? "Abrir la edición en borrador" : "Guardar la edición"}
        </Boton>
      </div>
    </form>
  );
}
