"use client";

import { useActionState, useState } from "react";
import { retirarArchivoAccion } from "@/app/acciones-mejoramiento";
import type { EstadoAccion } from "@/app/admin/comun";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { Dialogo } from "@/componentes/ui/Dialogo";
import { AVISO_SIN_PACIENTES } from "@/lib/mejoramiento/textos";

/**
 * «Retirar por datos personales» (Fase 15B, anexo §11.2; Ley 1581 de 2012): la salida para un archivo ya firmado que se subió por
 * error con datos de un paciente o de quien se quejó. Solo lo pinta `ArchivosDe` al Admin SGC y en un archivo congelado; el servidor
 * lo vuelve a decidir. Pide la justificación y dice lo que queda: el rastro en el historial del hallazgo.
 */
export function DialogoRetirarArchivo({ archivo }: { archivo: { id: number; nombre: string } }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, enviar, pendiente] = useActionState<EstadoAccion, FormData>(retirarArchivoAccion, null);
  const v = estado?.valores;
  return (
    <>
      <Boton
        variante="peligro"
        tamano="sm"
        onClick={() => setAbierto(true)}
        aria-haspopup="dialog"
        aria-label={`Retirar por datos personales el archivo ${archivo.nombre}`}
      >
        Retirar por datos personales
      </Boton>
      <Dialogo
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
        titulo="Retirar un archivo por datos personales"
        className="m-auto w-full max-w-lg rounded-lg border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40"
      >
        <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex max-h-[90vh] flex-col gap-4 overflow-y-auto p-5">
          <p aria-hidden="true" className="font-semibold">
            Retirar un archivo por datos personales
          </p>
          <input type="hidden" name="archivoId" value={archivo.id} />
          <p className="break-words text-sm">
            «{archivo.nombre}» ya es parte de lo firmado. Retírelo solo si trae datos personales de un paciente o de quien se quejó
            (Ley 1581 de 2012). Sale del almacén y no se puede recuperar. En el historial del hallazgo quedan su nombre, su tamaño, su
            huella, quién lo subió, quién lo retiró, cuándo y por qué; donde estaba, la página dice que se retiró un archivo y cuándo.
          </p>
          {estado?.ok === false ? (
            <p role="alert" className="rounded-md border border-estado-critico/40 bg-estado-critico-fondo px-3 py-2 text-sm text-estado-critico-texto">
              {estado.error}
            </p>
          ) : null}
          <Campo
            etiqueta="Justificación (al menos 10 caracteres)"
            nombre="justificacion"
            id={`retirar-justificacion-${archivo.id}`}
            ayuda={AVISO_SIN_PACIENTES}
          >
            <textarea
              required
              minLength={10}
              maxLength={1000}
              rows={3}
              defaultValue={typeof v?.justificacion === "string" ? v.justificacion : ""}
              className={claseControl}
            />
          </Campo>
          <div className="flex flex-wrap justify-end gap-2">
            <Boton variante="secundario" onClick={() => setAbierto(false)}>
              Cancelar
            </Boton>
            <Boton type="submit" variante="peligro" pendiente={pendiente}>
              Retirar el archivo
            </Boton>
          </div>
        </form>
      </Dialogo>
    </>
  );
}
