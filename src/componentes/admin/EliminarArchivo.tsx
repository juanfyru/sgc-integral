"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function EliminarArchivo({ archivoId }: { archivoId: number }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  async function eliminar() {
    const res = await fetch(`/admin/api/archivos/${archivoId}`, { method: "DELETE" });
    if (res.ok) router.refresh();
    else setError((await res.json()).error ?? "No se pudo eliminar");
  }
  return (
    <span className="flex items-center gap-2">
      <button type="button" onClick={eliminar}
        className="text-xs text-red-700 underline-offset-2 hover:underline">
        Quitar
      </button>
      {error && <span role="alert" className="text-xs text-red-700">{error}</span>}
    </span>
  );
}
