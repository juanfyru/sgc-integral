"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function EliminarArchivo({ direccion }: { direccion: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  async function eliminar() {
    const res = await fetch(direccion, { method: "DELETE" });
    if (res.ok) router.refresh();
    else setError((await res.json()).error ?? "No se pudo eliminar");
  }
  return (
    <span className="flex items-center gap-2">
      <button type="button" onClick={eliminar}
        className="text-xs text-estado-critico-texto underline-offset-2 hover:underline">
        Quitar
      </button>
      {error && <span role="alert" className="text-xs text-estado-critico-texto">{error}</span>}
    </span>
  );
}
