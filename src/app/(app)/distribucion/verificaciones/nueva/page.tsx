import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { EstadoVacio } from "@/componentes/ui/EstadoVacio";
import { abrirVerificacion } from "@/db/consultas/distribucion/verificaciones";
import { ErrorDistribucion } from "@/lib/distribucion/tipos";
import { exigirPermiso } from "@/lib/paginas";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Verificar un punto de uso" };

/**
 * Abre la verificación del punto (o retoma la que está abierta) y lleva a ella. Quien llega con el enlace
 * de un punto que no existe o que no puede verificar lee por qué.
 */
export default async function PaginaNuevaVerificacion({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sesion = await exigirPermiso("verificaciones.realizar");
  const { punto } = await searchParams;
  const texto = Array.isArray(punto) ? punto[0] : punto;

  let motivo = "Falta elegir el punto de uso a verificar.";
  if (texto && /^\d{1,15}$/.test(texto)) {
    try {
      const { verificacionId } = await abrirVerificacion(sesion, Number(texto));
      redirect(`/distribucion/verificaciones/${verificacionId}`);
    } catch (err) {
      if (!(err instanceof ErrorDistribucion)) throw err;
      motivo = err.message;
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina
        titulo="Verificar un punto de uso"
        migas={[{ nombre: "Verificaciones", href: "/distribucion/verificaciones" }, { nombre: "Nueva" }]}
      />
      <EstadoVacio icono={ClipboardCheck} titulo="No se pudo abrir la verificación" texto={motivo} />
    </div>
  );
}
