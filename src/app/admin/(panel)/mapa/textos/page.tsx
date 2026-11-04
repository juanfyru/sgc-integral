import type { Metadata } from "next";
import { guardarTextosAccion } from "@/app/admin/acciones-mapa";
import { FormularioTextos } from "@/componentes/admin/mapa/FormularioTextos";
import { CLAVES_TEXTO, obtenerTextos } from "@/db/consultas/mapa-admin";
import { exigirPermiso } from "@/lib/paginas";

export const metadata: Metadata = { title: "Textos institucionales — Administración SGC" };

export default async function PaginaTextos() {
  await exigirPermiso("mapa.administrar");
  const valores = await obtenerTextos();
  return (
    <main>
      <h1 className="mb-2 font-display text-2xl font-semibold">Textos institucionales</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Se reflejan en el mapa público al guardar.
      </p>
      <FormularioTextos accion={guardarTextosAccion} campos={CLAVES_TEXTO} valores={valores} />
    </main>
  );
}
