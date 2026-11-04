import { redirect } from "next/navigation";
import { sesionActual } from "@/lib/sesion-actual";

// Pasos obligatorios de la cuenta: exigen sesión, pero no que esté completa.
export const dynamic = "force-dynamic";

export default async function LayoutCuenta({ children }: { children: React.ReactNode }) {
  const sesion = await sesionActual();
  if (!sesion) redirect("/ingreso");
  if (sesion.factorPendiente) redirect("/ingreso/verificar");
  return (
    <main className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center gap-6 px-4 py-8">
      {children}
    </main>
  );
}
