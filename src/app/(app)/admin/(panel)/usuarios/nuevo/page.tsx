import type { Metadata } from "next";
import { crearUsuarioAccion } from "@/app/admin/acciones-usuarios";
import { FormularioUsuario } from "@/componentes/admin/usuarios/FormularioUsuario";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { opcionesFormularioUsuario } from "@/db/consultas/usuarios";
import { exigirPermiso } from "@/lib/paginas";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nuevo usuario — Administración SGC" };

export default async function PaginaNuevoUsuario() {
  await exigirPermiso("usuarios.administrar");
  const opciones = await opcionesFormularioUsuario();
  return (
    <div>
      <EncabezadoPagina titulo="Nuevo usuario" />
      <FormularioUsuario accion={crearUsuarioAccion} {...opciones} />
    </div>
  );
}
