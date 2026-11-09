"use client";

import { useActionState } from "react";
import { editarControlExternoAccion } from "@/app/acciones-vigencia";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { ErrorAccion } from "@/componentes/tramites/AccionesSolicitud";
import { Boton } from "@/componentes/ui/Boton";
import type { Externo, OpcionesDeExterno } from "@/db/consultas/vigencia/externos";
import { CamposControl } from "./FormularioExterno";

/**
 * «Editar» los datos de control de un externo (spec 13C §8.3): queda en la bitácora con el antes y el después.
 * Cambiar el responsable o la periodicidad vuelve a empezar los avisos de vencimiento.
 */
export function FormularioControl({
  documentoId,
  control,
  personas,
  normas,
}: {
  documentoId: number;
  control: Externo["control"];
  personas: OpcionesDeExterno["personas"];
  normas: OpcionesDeExterno["normas"];
}) {
  const [estado, enviar, pendiente] = useActionState(editarControlExternoAccion, null);
  // Quien ya no está activo sigue saliendo mientras sea el responsable: así el formulario no lo cambia sin querer.
  const conResponsable = personas.some((p) => p.id === control.responsable.id)
    ? personas
    : [{ id: control.responsable.id, nombre: control.responsable.nombre, cargo: null }, ...personas];
  return (
    <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex min-w-0 flex-col gap-4">
      <input type="hidden" name="id" value={documentoId} />
      <CamposControl
        valores={{
          entidadEmisora: control.entidadEmisora,
          tituloOriginal: control.tituloOriginal,
          fuenteOficial: control.fuenteOficial,
          verificacionMeses: control.verificacionMeses,
          normaId: control.norma?.id ?? null,
        }}
        personas={conResponsable}
        normas={normas}
        responsable={{ valor: control.responsable.id }}
      />
      <div className="flex flex-col items-stretch gap-2 sm:items-end">
        <ErrorAccion estado={estado} />
        <Boton type="submit" pendiente={pendiente}>
          {pendiente ? "Guardando…" : "Guardar los datos de control"}
        </Boton>
      </div>
    </form>
  );
}
