import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FichaNorma, type OpcionesFicha } from "@/componentes/normograma/FichaNorma";
import { documentosGestionables } from "@/db/consultas/normograma/asociaciones";
import { normasParaElegir, obtenerNorma } from "@/db/consultas/normograma/lectura";
import { procesosActivos } from "@/db/consultas/procesos";
import { alcanceProcesos, puedeAsociarNorma } from "@/lib/alcance";
import { exigirSesion } from "@/lib/paginas";
import { puede } from "@/lib/permisos";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Norma" };

/**
 * La ficha de una norma (spec 13C §10.6), para toda persona con sesión, también la de una retirada. Lo que la persona
 * puede hacer se calcula aquí: asociar los procesos que tiene, enlazar o quitar los documentos de esos procesos y, si
 * administra, el estado, las relaciones, el PDF y el retiro. Una norma que no existe es «no encontrada».
 */
export default async function PaginaNorma({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await exigirSesion();
  const { id } = await params;
  if (!/^\d{1,15}$/.test(id)) notFound();
  // El alcance se lee una vez (una consulta solo para el líder) y lo usan la ficha y sus opciones.
  const alcance = await alcanceProcesos(sesion);
  const norma = await obtenerNorma(Number(id), sesion, { alcance });
  if (!norma) notFound();

  const abierta = norma.estado !== "retirada";
  const asocia = abierta && puede(sesion, "normograma.procesos");
  const administra = abierta && norma.acciones.administrar;
  const [procesos, documentos, normas] = await Promise.all([
    asocia ? procesosActivos() : Promise.resolve([]),
    asocia ? documentosGestionables(norma.id, sesion, { alcance }) : Promise.resolve([]),
    // Una derogada no admite relaciones nuevas como afectada (`registrarRelacion`).
    administra ? normasParaElegir({ distintaDe: norma.id, sinDerogadas: true }) : Promise.resolve([]),
  ]);
  const asociados = new Set(norma.procesos.map((p) => p.id));
  const opciones: OpcionesFicha = {
    procesos: procesos
      .filter((p) => !asociados.has(p.id) && puedeAsociarNorma(sesion, p.id, alcance))
      .map(({ id, nombre, sigla }) => ({ id, nombre, sigla })),
    documentos,
    normas,
    hoy: fechaEnZona(new Date(), zonaHoraria()),
  };

  return <FichaNorma norma={norma} opciones={opciones} />;
}
