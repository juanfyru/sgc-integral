import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FolderX } from "lucide-react";
import { FormularioExterno } from "@/componentes/vigencia/externos/FormularioExterno";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { EstadoVacio } from "@/componentes/ui/EstadoVacio";
import { opcionesDeExterno } from "@/db/consultas/vigencia/externos";
import { exigirSesion } from "@/lib/paginas";
import { puede } from "@/lib/permisos";
import { exigirVigencia } from "../../_comun";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Registrar documento externo" };

/** El alta de un externo (spec 13C §8.3): la registra quien gestiona externos, en los procesos de su alcance. */
export default async function PaginaNuevoExterno() {
  const sesion = await exigirSesion();
  await exigirVigencia(sesion);
  if (!puede(sesion, "externos.gestionar")) notFound();
  const opciones = await opcionesDeExterno(sesion);

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina
        titulo="Registrar documento externo"
        descripcion="Una norma, guía o manual que emite otro y que el hospital aplica. Recibe el código siguiente de su proceso."
        migas={[{ nombre: "Vigencia", href: "/vigencia" }, { nombre: "Externos", href: "/vigencia/externos" }, { nombre: "Registrar" }]}
      />
      {opciones.procesos.length === 0 ? (
        <EstadoVacio
          icono={FolderX}
          titulo="No tiene procesos donde registrarlo"
          texto="Los documentos externos se registran en los procesos que usted lidera, y no tiene ninguno activo asignado."
        />
      ) : (
        <FormularioExterno opciones={opciones} usuarioId={sesion.usuarioId} />
      )}
    </div>
  );
}
