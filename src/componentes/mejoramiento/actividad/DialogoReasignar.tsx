"use client";

import { useActionState, useState } from "react";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { Dialogo } from "@/componentes/ui/Dialogo";
import { AVISO_SIN_PACIENTES, textoDeUsuario, type UsuarioDeSelector } from "@/lib/mejoramiento/textos";
import { ErrorDelPaso, type AccionDelPaso } from "../pasos/Partes";

/**
 * «Reasignar» una actividad sin terminar (spec 15 §10.2): un líder del proceso o el Admin SGC eligen el responsable nuevo (un
 * usuario activo distinto del actual) y escriben el motivo. Sin aprobación; se avisa a los dos. El servidor vuelve a
 * comprobar quién puede.
 */
export function DialogoReasignar({
  actividadId,
  etiqueta,
  responsableId,
  responsable,
  usuarios,
  accion,
}: {
  actividadId: number;
  etiqueta: string;
  responsableId: number;
  responsable: string;
  usuarios: ReadonlyArray<UsuarioDeSelector & { etiqueta?: string }>;
  accion: AccionDelPaso;
}) {
  const [abierto, setAbierto] = useState(false);
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const id = (c: string) => `reasignar-${actividadId}-${c}`;
  const titulo = `Reasignar la actividad ${etiqueta}`;
  return (
    <>
      <Boton variante="secundario" tamano="sm" onClick={() => setAbierto(true)} aria-haspopup="dialog" aria-label={titulo}>
        Reasignar
      </Boton>
      <Dialogo
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
        titulo={titulo}
        className="m-auto w-full max-w-lg rounded-lg border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40"
      >
        <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex max-h-[90vh] flex-col gap-4 overflow-y-auto p-5">
          <p aria-hidden="true" className="font-semibold">
            {titulo}
          </p>
          <input type="hidden" name="actividadId" value={actividadId} />
          <p className="break-words text-sm">{`Hoy la tiene ${responsable}. La actividad conserva sus seguimientos, su avance y sus fechas, y se avisa a los dos.`}</p>
          <Campo etiqueta="Responsable nuevo" nombre="responsableId" id={id("responsable")}>
            <select required defaultValue="" className={claseControl}>
              <option value="" disabled>
                Elija a quién
              </option>
              {usuarios
                .filter((u) => u.id !== responsableId)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {textoDeUsuario(u)}
                  </option>
                ))}
            </select>
          </Campo>
          <Campo etiqueta="Motivo (al menos 10 caracteres)" nombre="motivo" id={id("motivo")} ayuda={AVISO_SIN_PACIENTES}>
            <textarea required minLength={10} maxLength={1000} rows={3} className={claseControl} />
          </Campo>
          <ErrorDelPaso estado={estado} />
          <div className="flex flex-wrap justify-end gap-2">
            <Boton variante="secundario" onClick={() => setAbierto(false)}>
              Cancelar
            </Boton>
            <Boton type="submit" pendiente={pendiente}>
              {pendiente ? "Reasignando…" : "Reasignar la actividad"}
            </Boton>
          </div>
        </form>
      </Dialogo>
    </>
  );
}
