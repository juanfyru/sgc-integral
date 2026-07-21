"use client";

export function BotonImprimir() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted print:hidden"
    >
      Imprimir / Guardar PDF
    </button>
  );
}
