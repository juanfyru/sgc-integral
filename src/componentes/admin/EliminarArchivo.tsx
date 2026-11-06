"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Boton } from "@/componentes/ui/Boton";
import { Dialogo } from "@/componentes/ui/Dialogo";
import { useTituloAlDesaparecer } from "@/componentes/ui/foco";

const NO_SE_PUDO = "No se pudo quitar el archivo. Intente de nuevo.";

/** null si se quitó; si no, el mensaje para la persona. Sin red, o con una respuesta que no es JSON, tampoco lanza. */
export async function pedirQuitar(direccion: string): Promise<string | null> {
  try {
    const res = await fetch(direccion, { method: "DELETE" });
    return res.ok ? null : ((await res.json()).error ?? NO_SE_PUDO);
  } catch {
    return NO_SE_PUDO;
  }
}

export function EliminarArchivo({ direccion, nombre }: { direccion: string; nombre: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, setPendiente] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quitado, setQuitado] = useState(false);
  // La fila del archivo se va cuando llega la página nueva, y con ella este botón y el foco.
  useTituloAlDesaparecer(quitado);

  async function eliminar() {
    setPendiente(true);
    try {
      const fallo = await pedirQuitar(direccion);
      setError(fallo);
      if (fallo === null) {
        setQuitado(true);
        router.refresh();
      }
    } finally {
      setPendiente(false);
      setAbierto(false);
    }
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
