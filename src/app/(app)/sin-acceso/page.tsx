import type { Metadata } from "next";
import Link from "next/link";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { exigirSesion } from "@/lib/paginas";

export const metadata: Metadata = { title: "Sin acceso" };

export default async function PaginaSinAcceso() {
  await exigirSesion();
  return (
    <div className="max-w-md">
      <EncabezadoPagina titulo="Sin acceso" descripcion="Su cuenta no tiene permiso para ver esta sección." />
      <Link href="/" className="text-sm text-marca underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-marca/40">
        Volver al inicio
      </Link>
    </div>
  );
}
