"use client";

import { useActionState, useState } from "react";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { AVISO_SIN_PACIENTES, textoDeUsuario, type UsuarioDeSelector } from "@/lib/mejoramiento/textos";
import { ErrorDelPaso, type AccionDelPaso } from "./Partes";

/**
 * Registrar la corrección de una no conformidad (spec §8.4). «Sí requirió corrección»: qué se hizo, el responsable (un
 * usuario o, si no tiene cuenta, su nombre), la fecha en que se implementó y al menos un archivo de evidencia, que se sube
 * en «2. Corrección». «No requiere corrección inmediata»: la justificación.
 */
export function PasoCorregir({
  hallazgoId,
  usuarios,
  hoy,
  accion,
}: {
  hallazgoId: number;
  usuarios: ReadonlyArray<UsuarioDeSelector & { etiqueta?: string }>;
  hoy: string;
  accion: AccionDelPaso;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const [requerida, setRequerida] = useState<"si" | "no" | null>(null);
  const id = (c: string) => `correccion-${hallazgoId}-${c}`;
  return (
    <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex flex-col gap-3">
      <input type="hidden" name="hallazgoId" value={hallazgoId} />
      <p id={id("aviso")} className="text-xs text-muted-foreground">
        {AVISO_SIN_PACIENTES}
      </p>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">¿Requirió corrección o contención?</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="requerida" value="si" required className="size-4" onChange={() => setRequerida("si")} />
          Sí requirió corrección
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="requerida" value="no" required className="size-4" onChange={() => setRequerida("no")} />
          No requiere corrección inmediata
        </label>
      </fieldset>
      {requerida === "si" ? (
        <>
          <Campo etiqueta="Qué se hizo (al menos 10 caracteres)" nombre="descripcion" id={id("descripcion")} tambienDescritoPor={id("aviso")}>
            <textarea required minLength={10} maxLength={4000} rows={3} className={claseControl} />
          </Campo>
          <Campo etiqueta="Responsable" nombre="responsableId" id={id("responsable")} ayuda="Si no tiene cuenta, deje «Sin cuenta» y escriba su nombre.">
            <select defaultValue="" className={claseControl}>
              <option value="">Sin cuenta</option>
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {textoDeUsuario(u)}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Nombre del responsable sin cuenta" nombre="responsableNombre" id={id("nombre")}>
            <input type="text" maxLength={150} className={claseControl} />
          </Campo>
          <Campo etiqueta="Fecha en que se implementó" nombre="implementadaEn" id={id("fecha")}>
            <input type="date" required max={hoy} className={claseControl} />
          </Campo>
          <p className="text-sm text-muted-foreground">Antes de registrarla, adjunte al menos un archivo de evidencia en «2. Corrección».</p>
        </>
      ) : null}
      {requerida === "no" ? (
        <Campo
          etiqueta="Por qué no requiere corrección inmediata (al menos 10 caracteres)"
          nombre="descripcion"
          id={id("justificacion")}
          tambienDescritoPor={id("aviso")}
        >
          <textarea required minLength={10} maxLength={4000} rows={3} className={claseControl} />
        </Campo>
      ) : null}
      <ErrorDelPaso estado={estado} />
      <Boton type="submit" pendiente={pendiente} disabled={requerida === null} className="self-start">
        {pendiente ? "Registrando…" : "Registrar la corrección"}
      </Boton>
    </form>
  );
}
