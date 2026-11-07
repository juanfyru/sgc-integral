import type { Metadata } from "next";
import { BookCheck } from "lucide-react";
import { PestanasDistribucion } from "@/componentes/distribucion/PestanasDistribucion";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { EstadoVacio } from "@/componentes/ui/EstadoVacio";
import { exigirSesion } from "@/lib/paginas";
import { exigirDistribucion } from "../_comun";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Acuses de lectura" };

export default async function PaginaAcuses() {
  const sesion = await exigirSesion();
  await exigirDistribucion(sesion);
  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Distribución" descripcion="Copias controladas, acuses de lectura, socializaciones y verificaciones" />
      <PestanasDistribucion activa="acuses" />
      <EstadoVacio
        icono={BookCheck}
        titulo="Próximamente"
        texto="Próximamente: esta pestaña llega con la siguiente tarea de la entrega."
      />
    </div>
  );
}
