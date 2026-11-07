import type { Metadata } from "next";
import { ClipboardCheck } from "lucide-react";
import { PestanasDistribucion } from "@/componentes/distribucion/PestanasDistribucion";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { EstadoVacio } from "@/componentes/ui/EstadoVacio";
import { exigirSesion } from "@/lib/paginas";
import { exigirDistribucion } from "../_comun";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Verificaciones" };

export default async function PaginaVerificaciones() {
  const sesion = await exigirSesion();
  await exigirDistribucion(sesion);
  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Distribución" descripcion="Copias controladas, acuses de lectura, socializaciones y verificaciones" />
      <PestanasDistribucion activa="verificaciones" />
      <EstadoVacio
        icono={ClipboardCheck}
        titulo="Próximamente"
        texto="Próximamente: esta pestaña llega con la siguiente tarea de la entrega."
      />
    </div>
  );
}
