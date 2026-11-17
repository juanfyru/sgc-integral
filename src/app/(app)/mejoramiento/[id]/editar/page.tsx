import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { editarHallazgoAccion } from "@/app/acciones-mejoramiento";
import { FormularioHallazgo } from "@/componentes/mejoramiento/FormularioHallazgo";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { obtenerSql } from "@/db/cliente";
import { contextoDeMejora } from "@/db/consultas/mejoramiento/config";
import { documentosVigentesVisibles, normasQueRigen, procesosDelAlcance } from "@/db/consultas/mejoramiento/opciones";
import { exigirSesion } from "@/lib/paginas";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { exigirHallazgo } from "../../_comun";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Editar hallazgo" };

/**
 * Editar la identificación de un hallazgo (spec 15 §7.6): solo quien lo registró y mientras está «Por aceptar». Para
 * cualquier otra persona, o en otro estado, no existe.
 */
export default async function PaginaEditarHallazgo({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await exigirSesion();
  const { id } = await params;
  const h = await exigirHallazgo(sesion, id);
  if (h.estado !== "por_aceptar" || h.registradoPorId !== sesion.usuarioId) notFound();
  const ahora = new Date();
  const [procesos, normas, documentos, contexto] = await Promise.all([
    procesosDelAlcance(sesion),
    normasQueRigen(),
    documentosVigentesVisibles(sesion),
    contextoDeMejora(obtenerSql(), ahora),
  ]);
  const valores: Record<string, string> = {
    clase: h.clase,
    origen: h.origen,
    detectadoEn: h.detectadoEn,
    procesoId: String(h.procesoId),
    criticidad: h.criticidad ?? "",
    fuente: h.fuente ?? "",
    referenciaCaso: h.referenciaCaso ?? "",
    titulo: h.titulo,
    descripcion: h.descripcion,
    requisitoClausula: h.requisitoClausula ?? "",
    requisitoNormaId: h.requisitoNormaId === null ? "" : String(h.requisitoNormaId),
    requisitoDocumentoId: h.requisitoDocumentoId === null ? "" : String(h.requisitoDocumentoId),
    riesgo: h.riesgo ?? "",
    fechaLimiteEnte: h.fechaLimiteEnte ?? "",
  };

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <EncabezadoPagina
        migas={[{ nombre: "Mejoramiento", href: "/mejoramiento" }, { nombre: h.codigo, href: `/mejoramiento/${h.id}` }, { nombre: "Editar" }]}
        codigo={h.codigo}
        titulo="Editar la identificación"
        descripcion="Puede corregir cualquier dato mientras el hallazgo espera su aceptación. Cada cambio queda en el historial con lo que había antes."
      />
      <FormularioHallazgo
        accion={editarHallazgoAccion}
        procesos={procesos}
        normas={normas}
        documentos={documentos}
        hoy={fechaEnZona(ahora, contexto.zona)}
        diasParaAceptar={contexto.config.plazos.aceptar}
        valores={valores}
        edicion={{ hallazgoId: h.id }}
      />
    </div>
  );
}
