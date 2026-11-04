import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { salir } from "@/app/acciones-cuenta";
import { FormularioFactor } from "@/componentes/cuenta/FormularioFactor";
import { rutaInterna } from "@/lib/rutas";
import { sesionActual } from "@/lib/sesion-actual";

export const metadata: Metadata = { title: "Verificación en dos pasos — SGC Integral" };
export const dynamic = "force-dynamic";

export default async function PaginaVerificar({
  searchParams,
}: {
  searchParams: Promise<{ volver?: string }>;
}) {
  const { volver } = await searchParams;
  const sesion = await sesionActual();
  if (!sesion?.factorPendiente) redirect("/ingreso");
  return (
    <main className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center gap-6 px-4">
      <div className="text-center">
        <h1 className="font-display text-2xl font-semibold">Verificación en dos pasos</h1>
        <p className="text-sm text-muted-foreground">
          Escriba el código de su aplicación de autenticación.
        </p>
      </div>
      <FormularioFactor volver={rutaInterna(volver)} />
      <form action={salir}>
        <button
          type="submit"
          className="text-sm text-muted-foreground underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-marca/40"
        >
          Cancelar y salir
        </button>
      </form>
    </main>
  );
}
