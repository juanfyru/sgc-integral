import type { Metadata } from "next";
import { crearUsuarioAccion } from "@/app/admin/acciones-usuarios";
import { FormularioUsuario } from "@/componentes/admin/usuarios/FormularioUsuario";
import { opcionesFormularioUsuario } from "@/db/consultas/usuarios";
import { exigirPermiso } from "@/lib/paginas";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nuevo usuario — Administración SGC" };

export default async function PaginaNuevoUsuario() {
  await exigirPermiso("usuarios.administrar");
  const opciones = await opcionesFormularioUsuario();
  return (
    <main>
      <h1 className="mb-6 font-display text-2xl font-semibold">Nuevo usuario</h1>
      <FormularioUsuario accion={crearUsuarioAccion} {...opciones} />
    </main>
  );
}
