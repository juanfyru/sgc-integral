import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FichaNorma, type OpcionesFicha } from "@/componentes/normograma/FichaNorma";
import { documentosGestionables } from "@/db/consultas/normograma/asociaciones";
import { listarNormas, obtenerNorma } from "@/db/consultas/normograma/lectura";
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
  const norma = await obtenerNorma(Number(id), sesion);
  if (!norma) notFound();

  const abierta = norma.estado !== "retirada";
  const asocia = abierta && puede(sesion, "normograma.procesos");
  const administra = abierta && norma.acciones.administrar;
  const [procesos, alcance, documentos, otras] = await Promise.all([
    asocia ? procesosActivos() : Promise.resolve([]),
    asocia ? alcanceProcesos(sesion) : Promise.resolve(null),
    asocia ? documentosGestionables(norma.id, sesion) : Promise.resolve([]),
    administra ? listarNormas({ estado: "todas" }, sesion) : Promise.resolve([]),
  ]);
  const asociados = new Set(norma.procesos.map((p) => p.id));
  const opciones: OpcionesFicha = {
    procesos: alcance
      ? procesos.filter((p) => !asociados.has(p.id) && puedeAsociarNorma(sesion, p.id, alcance)).map(({ id, nombre, sigla }) => ({ id, nombre, sigla }))
      : [],
    documentos,
    // Una derogada no admite relaciones nuevas como afectada (`registrarRelacion`).
    normas: otras.filter((o) => o.id !== norma.id && o.estado !== "derogada").map((o) => ({ id: o.id, nombre: o.nombre, titulo: o.titulo })),
    hoy: fechaEnZona(new Date(), zonaHoraria()),
  };

  return <FichaNorma norma={norma} opciones={opciones} />;
}
