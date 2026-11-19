import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { editarHallazgoAccion } from "@/app/acciones-mejoramiento";
import { FormularioHallazgo } from "@/componentes/mejoramiento/FormularioHallazgo";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { obtenerSql } from "@/db/cliente";
import { contextoDeMejora } from "@/db/consultas/mejoramiento/config";
import { procesosDelPunto } from "@/db/consultas/mejoramiento/enganche-verificacion";
import { documentosVigentesVisibles, normasQueRigen, procesosDelAlcance } from "@/db/consultas/mejoramiento/opciones";
import type { Prellenado } from "@/db/consultas/mejoramiento/prellenado";
import { FIJOS_DE_VERIFICACION } from "@/lib/mejoramiento/enganches";
import { exigirSesion } from "@/lib/paginas";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { exigirHallazgo } from "../../_comun";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Editar hallazgo" };

/**
 * Editar la identificación de un hallazgo (spec 15 §7.6): solo quien lo registró y mientras está «Por aceptar». Para
 * cualquier otra persona, o en otro estado, no existe. La no conformidad de un hallazgo de verificación (Fase 15B, anexo §7.2) muestra
 * la clase y el origen como texto fijo y ofrece solo los procesos activos del punto (todos, si el punto no tiene ninguno): lo mismo que
 * el servidor deja fijo (`editarHallazgo`).
 */
export default async function PaginaEditarHallazgo({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await exigirSesion();
  const { id } = await params;
  const h = await exigirHallazgo(sesion, id);
  if (h.estado !== "por_aceptar" || h.registradoPorId !== sesion.usuarioId) notFound();
  const ahora = new Date();
  const sql = obtenerSql();
  const [procesos, normas, documentos, contexto, delPunto] = await Promise.all([
    procesosDelAlcance(sesion),
    normasQueRigen(),
    documentosVigentesVisibles(sesion),
    contextoDeMejora(sql, ahora),
    h.verificacionHallazgoId === null ? Promise.resolve(null) : procesosDelPunto(sql, h.verificacionHallazgoId),
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
  // Lo fijo de la no conformidad de un hallazgo de verificación: en la edición, del prellenado solo cuentan lo fijo y los procesos.
  const fijos: Prellenado | undefined =
    delPunto === null
      ? undefined
      : { valores: { ...FIJOS_DE_VERIFICACION }, fijos: ["clase", "origen"], ocultos: {}, rotulo: null, ...(delPunto.length > 0 ? { procesos: delPunto } : {}) };

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
        prellenado={fijos}
        hoy={fechaEnZona(ahora, contexto.zona)}
        diasParaAceptar={contexto.config.plazos.aceptar}
        valores={valores}
        edicion={{ hallazgoId: h.id }}
      />
    </div>
  );
}
