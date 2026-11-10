import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PaginaImpactos } from "@/componentes/normograma/PaginaImpactos";
import { impactosDe } from "@/db/consultas/normograma/impactos";
import { exigirSesion } from "@/lib/paginas";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Revisión por cambio normativo" };

/**
 * La tarea de impacto de un cambio normativo en un proceso (spec 13C §10.5): `?proceso=` es el id del proceso, como lo
 * escriben la tarea y el aviso. La ven el líder del proceso y el Admin SGC (`puedeVerImpacto`, dentro de `impactosDe`);
 * para los demás, como para un cambio o un proceso sin impactos, es «no encontrada».
 */
export default async function PaginaImpactosDelCambio({
  params,
  searchParams,
}: {
  params: Promise<{ cambioId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sesion = await exigirSesion();
  const [{ cambioId }, { proceso }] = await Promise.all([params, searchParams]);
  if (!/^\d{1,15}$/.test(cambioId) || typeof proceso !== "string" || !/^\d{1,15}$/.test(proceso)) notFound();
  const impactos = await impactosDe(Number(cambioId), Number(proceso), sesion);
  if (!impactos) notFound();

  return <PaginaImpactos impactos={impactos} />;
}
