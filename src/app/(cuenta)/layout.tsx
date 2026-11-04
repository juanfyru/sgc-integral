import { redirect } from "next/navigation";
import { PantallaCentrada } from "@/componentes/cascaron/PantallaCentrada";
import { sesionActual } from "@/lib/sesion-actual";

// Pasos obligatorios de la cuenta: exigen sesión, pero no que esté completa.
export const dynamic = "force-dynamic";

export default async function LayoutCuenta({ children }: { children: React.ReactNode }) {
  const sesion = await sesionActual();
  if (!sesion) redirect("/ingreso");
  if (sesion.factorPendiente) redirect("/ingreso/verificar");
  return <PantallaCentrada>{children}</PantallaCentrada>;
}
