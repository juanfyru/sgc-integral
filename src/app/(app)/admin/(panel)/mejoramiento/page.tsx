import type { Metadata } from "next";
import { CalendarioDeLaEntidad } from "@/componentes/mejoramiento/admin/CalendarioDeLaEntidad";
import { FormatosDeImpresos } from "@/componentes/mejoramiento/admin/FormatosDeImpresos";
import { FormularioPlazos } from "@/componentes/mejoramiento/admin/FormularioPlazos";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { documentosParaFormato, listarDiasDeCalendario, obtenerConfigMejora } from "@/db/consultas/mejoramiento/config";
import { festivosDeColombia } from "@/lib/dias-habiles";
import { exigirPermiso } from "@/lib/paginas";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";

export const metadata: Metadata = { title: "Configuración de mejoramiento — Administración SGC" };

/** «lunes 16 de noviembre de 2026»: la fecha `AAAA-MM-DD` es un día de calendario, sin zona. */
const escribir = (fecha: string) =>
  new Date(`${fecha}T12:00:00Z`).toLocaleDateString("es-CO", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" });

export default async function PaginaConfiguracionMejoramiento() {
  await exigirPermiso("mejora.gestionar");
  const [config, dias, documentos] = await Promise.all([obtenerConfigMejora(), listarDiasDeCalendario(), documentosParaFormato()]);
  const anio = Number(fechaEnZona(new Date(), zonaHoraria()).slice(0, 4));
  const festivos = [anio, anio + 1].map((a) => ({
    anio: a,
    dias: festivosDeColombia(a).map((fecha) => ({ fecha, etiqueta: escribir(fecha) })),
  }));
  const etiquetas = Object.fromEntries(dias.map((d) => [d.fecha, escribir(d.fecha)]));
  return (
    <div className="flex flex-col gap-8">
      <EncabezadoPagina titulo="Configuración de mejoramiento" />
      <FormularioPlazos config={config} />
      <CalendarioDeLaEntidad dias={dias} etiquetas={etiquetas} festivos={festivos} />
      <FormatosDeImpresos formatos={config.formatos} documentos={documentos} />
    </div>
  );
}
