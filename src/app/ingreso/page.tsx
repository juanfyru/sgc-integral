import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PantallaCentrada } from "@/componentes/cascaron/PantallaCentrada";
import { FormularioIngreso } from "@/componentes/cuenta/FormularioIngreso";
import { mensajeDeParametro, rutaInterna } from "@/lib/rutas";
import { sesionActual } from "@/lib/sesion-actual";

export const metadata: Metadata = { title: "Ingreso" };
export const dynamic = "force-dynamic";

const MENSAJES: Record<string, string> = {
  factor: "Se agotaron los intentos del segundo factor. Ingrese de nuevo.",
  bloqueo: "Su cuenta quedó bloqueada 15 minutos por claves erradas",
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
    <PantallaCentrada>
      <h1 className="font-display text-2xl font-semibold">Ingreso al SGC</h1>
      {aviso && (
        <p role="alert" className="text-sm text-destructive">
          {aviso}
        </p>
      )}
      <FormularioIngreso volver={destino} />
    </PantallaCentrada>
  );
}
