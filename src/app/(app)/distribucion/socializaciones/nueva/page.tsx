import type { Metadata } from "next";
import { FormularioJornada } from "@/componentes/distribucion/socializaciones/FormularioJornada";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { opcionesDeJornada } from "@/db/consultas/distribucion/jornadas";
import { exigirPermiso } from "@/lib/paginas";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Registrar socialización" };

export default async function PaginaNuevaJornada({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sesion = await exigirPermiso("socializaciones.registrar");
  const { version } = await searchParams;
  const texto = Array.isArray(version) ? version[0] : version;
  const versionInicial = texto && /^\d{1,15}$/.test(texto) ? Number(texto) : null;
  const opciones = await opcionesDeJornada(sesion);

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina
        titulo="Registrar socialización"
        descripcion="Deje constancia de la jornada con quienes aplican el documento. La evidencia se adjunta al registrarla."
        migas={[{ nombre: "Socializaciones", href: "/distribucion/socializaciones" }, { nombre: "Registrar" }]}
      />
      <FormularioJornada
        opciones={opciones}
        hoy={fechaEnZona(new Date(), zonaHoraria())}
        facilitadorInicial={sesion.usuarioId}
        versionInicial={versionInicial}
      />
    </div>
  );
}
