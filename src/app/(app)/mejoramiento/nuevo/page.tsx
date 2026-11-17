import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { registrarHallazgoAccion } from "@/app/acciones-mejoramiento";
import { FormularioHallazgo } from "@/componentes/mejoramiento/FormularioHallazgo";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { obtenerSql } from "@/db/cliente";
import { contextoDeMejora } from "@/db/consultas/mejoramiento/config";
import { procesosDelAlcance } from "@/db/consultas/mejoramiento/opciones";
import { exigirSesion } from "@/lib/paginas";
import { puede } from "@/lib/permisos";
import { fechaEnZona } from "@/lib/tramites/plazos";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Registrar hallazgo" };

/** Registrar un hallazgo (spec 15 §7.1 y §16.2, maqueta 3): solo quien tiene `mejora.registrar`; para los demás no existe. */
export default async function PaginaNuevoHallazgo() {
  const sesion = await exigirSesion();
  if (!puede(sesion, "mejora.registrar")) notFound();
  const ahora = new Date();
  const [procesos, contexto] = await Promise.all([procesosDelAlcance(sesion), contextoDeMejora(obtenerSql(), ahora)]);

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
        hoy={fechaEnZona(ahora, contexto.zona)}
        diasParaAceptar={contexto.config.plazos.aceptar}
      />
    </div>
  );
}
