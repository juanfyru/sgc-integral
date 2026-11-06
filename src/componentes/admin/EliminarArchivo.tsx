"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Boton } from "@/componentes/ui/Boton";
import { Dialogo } from "@/componentes/ui/Dialogo";

export function EliminarArchivo({ direccion, nombre }: { direccion: string; nombre: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, setPendiente] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function eliminar() {
    setPendiente(true);
    const res = await fetch(direccion, { method: "DELETE" });
    setPendiente(false);
    setAbierto(false);
    if (res.ok) router.refresh();
    else setError((await res.json()).error ?? "No se pudo eliminar");
  }
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-haspopup="dialog"
        className="text-xs text-estado-critico-texto underline-offset-2 hover:underline"
      >
        Quitar
      </button>
      {error && <span role="alert" className="text-xs text-estado-critico-texto">{error}</span>}
      <Dialogo
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
        titulo="Quitar el archivo"
        className="m-auto w-full max-w-md rounded-lg border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40"
      >
        <div className="flex flex-col gap-4 p-5">
          <p aria-hidden="true" className="font-semibold">
            Quitar el archivo
          </p>
          <p className="break-words text-sm">{`Se quitará «${nombre}» del borrador. Esta acción queda en la bitácora.`}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Boton variante="secundario" onClick={() => setAbierto(false)}>
              Cancelar
            </Boton>
            <Boton variante="peligro" pendiente={pendiente} onClick={eliminar}>
              {pendiente ? "Quitando…" : "Quitar"}
            </Boton>
          </div>
        </div>
      </Dialogo>
    </div>
  );
}
