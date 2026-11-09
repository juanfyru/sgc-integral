import type { Metadata } from "next";
import { FormularioConfigDocumental } from "@/componentes/admin/config-documental/FormularioConfigDocumental";
import { ListaItemsVerificacion } from "@/componentes/admin/config-documental/ListaItemsVerificacion";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import { documentosParaFormato, revisarFormatoActa, type EstadoFormato } from "@/db/consultas/formato-acta";
import { listarItemsVerificacion } from "@/db/consultas/revision";
import { exigirPermiso } from "@/lib/paginas";

export const metadata: Metadata = { title: "Configuración documental — Administración SGC" };

/** La página no se rompe por el formato: lo que no se pudo revisar se avisa como perdido. */
async function estadoDelFormato(documentoId: number | null): Promise<EstadoFormato> {
  try {
    return await revisarFormatoActa(documentoId);
  } catch (err) {
    console.error("No se pudo revisar el formato del acta:", err);
    return { estado: "perdido" };
  }
}

export default async function PaginaConfiguracionDocumental() {
  await exigirPermiso("tramites.gestionar");
  const [config, items] = await Promise.all([obtenerConfigDocumental(), listarItemsVerificacion()]);
  const documentoFormato = config.formatoActa.documentoId;
  const documentoInforme = config.vigencia.formatoInforme.documentoId;
  const [documentosFormato, estadoFormato] = await Promise.all([
    documentosParaFormato({ incluir: documentoFormato }),
    estadoDelFormato(documentoFormato),
  ]);
  // El informe usa la misma lista; si su documento guardado no está en ella, se trae aparte.
  const documentosInforme =
    documentoInforme === null || documentosFormato.some((d) => d.id === documentoInforme)
      ? documentosFormato
      : await documentosParaFormato({ incluir: documentoInforme });
  return (
    <div className="flex flex-col gap-8">
      <EncabezadoPagina titulo="Configuración documental" />
      <FormularioConfigDocumental config={config} documentosFormato={documentosFormato} documentosInforme={documentosInforme} estadoFormato={estadoFormato} />
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
