import type { Metadata } from "next";
import { guardarTextosAccion } from "@/app/admin/acciones-mapa";
import { FormularioTextos } from "@/componentes/admin/mapa/FormularioTextos";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { CLAVES_TEXTO, obtenerTextos } from "@/db/consultas/mapa-admin";
import { exigirPermiso } from "@/lib/paginas";

export const metadata: Metadata = { title: "Textos del mapa y código de documentos — Administración SGC" };

export default async function PaginaTextos() {
  await exigirPermiso("mapa.administrar");
  const valores = await obtenerTextos();
  return (
    <div>
      <EncabezadoPagina
        titulo="Textos del mapa y código de documentos"
        descripcion="Nombre, lema y aviso de datos personales se editan en Administración → Entidad y marca."
      />
      <FormularioTextos accion={guardarTextosAccion} campos={CLAVES_TEXTO} valores={valores} />
    </div>
  );
}
