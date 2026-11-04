"use client";

import { useState } from "react";

/** La clave se muestra una sola vez: no se guarda en la URL ni en ningún registro. */
export function ClaveTemporal({ clave, usuario }: { clave: string; usuario?: string }) {
  const [copiada, setCopiada] = useState<"si" | "no" | null>(null);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(clave);
      setCopiada("si");
    } catch {
      setCopiada("no");
    }
  }

  return (
    <section
      aria-labelledby="titulo-clave-temporal"
      className="flex max-w-lg flex-col gap-3 rounded-lg border-2 border-estado-atencion bg-estado-atencion-fondo p-5 text-estado-atencion-texto"
    >
      <h2 id="titulo-clave-temporal" className="font-display text-lg font-semibold">
        Clave temporal{usuario ? ` de ${usuario}` : ""}
      </h2>
      <div className="flex flex-wrap items-center gap-3">
        <code
          data-testid="clave-temporal"
          className="select-all rounded-md border border-estado-atencion bg-card px-4 py-2 font-mono text-2xl font-semibold tracking-wider text-foreground"
        >
          {clave}
        </code>
        <button
          type="button"
          onClick={copiar}
          className="rounded-md bg-azul px-3 py-2 text-sm font-medium text-white hover:bg-azul-profundo"
        >
          Copiar
        </button>
        <span role="status" className="text-sm">
          {copiada === "si" && "Copiada."}
          {copiada === "no" && "No se pudo copiar; selecciónela y cópiela a mano."}
        </span>
      </div>
      <p className="text-sm">
        <strong>No se volverá a mostrar.</strong> Entréguela a la persona por un medio seguro; deberá
        cambiarla al ingresar por primera vez.
      </p>
    </section>
  );
}
