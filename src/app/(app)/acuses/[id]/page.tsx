import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TareaAcuse } from "@/componentes/distribucion/acuses/TareaAcuse";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { obtenerAcuse } from "@/db/consultas/distribucion/acuses";
import { exigirSesion } from "@/lib/paginas";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Confirmar lectura" };

export default async function PaginaAcuse({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await exigirSesion();
  const { id } = await params;
  if (!/^\d{1,15}$/.test(id)) notFound();
  // Solo el destinatario la ve: para cualquier otra persona es «no encontrado».
  const acuse = await obtenerAcuse(Number(id), sesion);
  if (!acuse) notFound();
  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina
        codigo={`${acuse.codigo} v${acuse.version}`}
        titulo={`Confirmar lectura de ${acuse.titulo}`}
        migas={[{ nombre: "Mis lecturas", href: "/acuses" }, { nombre: `${acuse.codigo} v${acuse.version}` }]}
      />
      <TareaAcuse acuse={acuse} />
    </div>
  );
}
