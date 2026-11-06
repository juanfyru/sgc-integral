import type { Metadata } from "next";
import { FormularioConfigDocumental } from "@/componentes/admin/config-documental/FormularioConfigDocumental";
import { ListaItemsVerificacion } from "@/componentes/admin/config-documental/ListaItemsVerificacion";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import { listarItemsVerificacion } from "@/db/consultas/revision";
import { exigirPermiso } from "@/lib/paginas";

export const metadata: Metadata = { title: "Configuración documental — Administración SGC" };

export default async function PaginaConfiguracionDocumental() {
  await exigirPermiso("tramites.gestionar");
  const [config, items] = await Promise.all([obtenerConfigDocumental(), listarItemsVerificacion()]);
  return (
    <div className="flex flex-col gap-8">
      <EncabezadoPagina titulo="Configuración documental" />
      <FormularioConfigDocumental config={config} />
      <section className="flex max-w-3xl flex-col gap-4" aria-labelledby="titulo-lista-verificacion">
        <h2 id="titulo-lista-verificacion" className="text-base font-semibold">
          Lista de verificación
        </h2>
        <p className="text-sm text-muted-foreground">
          Los ítems que el revisor responde en cada ronda. Un ítem nunca se borra: se desactiva y las rondas ya respondidas
          conservan su texto.
        </p>
        <ListaItemsVerificacion items={items} />
      </section>
    </div>
  );
}
