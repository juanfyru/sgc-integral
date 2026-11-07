"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Boton } from "@/componentes/ui/Boton";

/** Quita la foto de un ítem mientras la verificación está abierta; el servidor vuelve a comprobarlo. */
export function BotonQuitarFoto({
  verificacionId,
  itemId,
  archivoId,
  nombre,
}: {
  verificacionId: number;
  itemId: number;
  archivoId: number;
  nombre: string;
}) {
  const router = useRouter();
  const [pendiente, setPendiente] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function quitar() {
    setPendiente(true);
    setError(null);
    try {
      const r = await fetch(`/api/verificaciones/${verificacionId}/items/${itemId}/archivos/${archivoId}`, { method: "DELETE" });
      if (r.ok) {
        router.refresh();
        return;
      }
      const cuerpo = (await r.json().catch(() => null)) as { error?: string } | null;
      setError(cuerpo?.error ?? "No se pudo quitar el archivo");
    } catch {
      setError("Error de red");
    } finally {
      setPendiente(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Boton variante="peligro" tamano="sm" pendiente={pendiente} onClick={quitar} aria-label={`Quitar ${nombre}`}>
        Quitar
      </Boton>
      {error ? (
        <span role="alert" className="text-xs text-estado-critico-texto">
          {error}
        </span>
      ) : null}
    </span>
  );
}
