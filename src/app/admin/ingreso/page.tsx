import type { Metadata } from "next";
import { FormularioIngreso } from "@/componentes/admin/FormularioIngreso";

export const metadata: Metadata = { title: "Ingreso — Administración SGC" };

export default function PaginaIngreso() {
  return (
    <main className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center gap-6 px-4">
      <div className="text-center">
        <h1 className="font-display text-2xl font-semibold">Administración del SGC</h1>
        <p className="text-sm text-muted-foreground">
          Acceso exclusivo para la administración de documentos
        </p>
      </div>
      <FormularioIngreso />
    </main>
  );
}
