import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { claveInicialAccion } from "@/app/acciones-cuenta";
import { FormularioClave } from "@/componentes/cuenta/FormularioClave";
import { LONGITUD_MAXIMA, LONGITUD_MINIMA } from "@/lib/clave-politica";
import { sesionActual } from "@/lib/sesion-actual";

export const metadata: Metadata = { title: "Cambio de clave inicial — SGC Integral" };
export const dynamic = "force-dynamic";

export default async function PaginaClaveInicial() {
  const sesion = await sesionActual();
  if (!sesion?.debeCambiarClave) redirect("/");
  return (
    <>
      <div className="text-center">
        <h1 className="font-display text-2xl font-semibold">Cambie su clave inicial</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Su clave actual es temporal. Elija una propia para continuar.
        </p>
      </div>
      <ul className="w-full list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Entre {LONGITUD_MINIMA} y {LONGITUD_MAXIMA} caracteres.</li>
        <li>No puede ser una clave común.</li>
        <li>No puede contener su nombre de usuario.</li>
      </ul>
      <FormularioClave accion={claveInicialAccion} />
    </>
  );
}
