import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FormularioIngreso } from "@/componentes/cuenta/FormularioIngreso";
import { mensajeDeParametro, rutaInterna } from "@/lib/rutas";
import { sesionActual } from "@/lib/sesion-actual";

export const metadata: Metadata = { title: "Ingreso — SGC Integral" };
export const dynamic = "force-dynamic";

const MENSAJES: Record<string, string> = {
  factor: "Se agotaron los intentos del segundo factor. Ingrese de nuevo.",
};

export default async function PaginaIngreso({
  searchParams,
}: {
  searchParams: Promise<{ volver?: string; motivo?: string }>;
}) {
  const { volver, motivo } = await searchParams;
  const destino = rutaInterna(volver);
  const sesion = await sesionActual();
  if (sesion) {
    redirect(
      sesion.factorPendiente
        ? `/ingreso/verificar?volver=${encodeURIComponent(destino)}`
        : destino,
    );
  }
  const aviso = mensajeDeParametro(MENSAJES, motivo);
  return (
    <main className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center gap-6 px-4">
      <div className="text-center">
        <h1 className="font-display text-2xl font-semibold">Ingreso al SGC</h1>
        <p className="text-sm text-muted-foreground">
          Sistema de Gestión de Calidad — ESE Hospital Nuestra Señora de Fátima
        </p>
      </div>
      {aviso && (
        <p role="alert" className="text-sm text-destructive">
          {aviso}
        </p>
      )}
      <FormularioIngreso volver={destino} />
    </main>
  );
}
