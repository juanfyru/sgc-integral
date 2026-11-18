import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { registrarHallazgoAccion } from "@/app/acciones-mejoramiento";
import { FormularioHallazgo } from "@/componentes/mejoramiento/FormularioHallazgo";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { obtenerSql } from "@/db/cliente";
import { contextoDeMejora } from "@/db/consultas/mejoramiento/config";
import { documentosVigentesVisibles, normasQueRigen, procesosDelAlcance } from "@/db/consultas/mejoramiento/opciones";
import { hallazgoDeOrigen } from "@/db/consultas/mejoramiento/registro";
import { exigirSesion } from "@/lib/paginas";
import { puede } from "@/lib/permisos";
import { fechaEnZona } from "@/lib/tramites/plazos";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Registrar hallazgo" };

/**
 * Registrar un hallazgo (spec 15 §7.1 y §16.2, maqueta 3): solo quien tiene `mejora.registrar`; para los demás no existe. Desde
 * la evaluación de otro (`?derivado=<id>`, spec §11.4) llega con el proceso de ese y el enlace puestos, si quien registra lo ve;
 * si no lo ve o no existe, el valor se ignora sin decir por qué (lo vuelve a comprobar `registrarHallazgo`).
 */
export default async function PaginaNuevoHallazgo({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sesion = await exigirSesion();
  if (!puede(sesion, "mejora.registrar")) notFound();
  const ahora = new Date();
  const pedido = (await searchParams).derivado;
  const derivadoId = typeof pedido === "string" && /^\d{1,15}$/.test(pedido) ? Number(pedido) : null;
  const [procesos, normas, documentos, contexto, origen] = await Promise.all([
    procesosDelAlcance(sesion),
    normasQueRigen(),
    documentosVigentesVisibles(sesion),
    contextoDeMejora(obtenerSql(), ahora),
    derivadoId === null ? Promise.resolve(null) : hallazgoDeOrigen(sesion, derivadoId),
  ]);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <EncabezadoPagina
        migas={[{ nombre: "Mejoramiento", href: "/mejoramiento" }, { nombre: "Registrar hallazgo" }]}
        titulo="Registrar un hallazgo"
        descripcion="Una no conformidad, una observación o una oportunidad de mejora. Al registrarlo, el sistema avisa a quien tiene el turno."
      />
      <FormularioHallazgo
        accion={registrarHallazgoAccion}
        procesos={procesos}
        normas={normas}
        documentos={documentos}
        hoy={fechaEnZona(ahora, contexto.zona)}
        diasParaAceptar={contexto.config.plazos.aceptar}
        valores={origen && procesos.some((p) => p.id === origen.procesoId) ? { procesoId: String(origen.procesoId) } : undefined}
        derivado={origen ? { id: origen.id, codigo: origen.codigo, titulo: origen.titulo } : undefined}
      />
    </div>
  );
}
