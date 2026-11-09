import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ListaChequeo } from "@/componentes/distribucion/verificaciones/ListaChequeo";
import { ListaHallazgos } from "@/componentes/distribucion/verificaciones/ListaHallazgos";
import { ResumenCierre } from "@/componentes/distribucion/verificaciones/ResumenCierre";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { Insignia } from "@/componentes/ui/Insignia";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import { obtenerVerificacion, ultimaVerificacionDe } from "@/db/consultas/distribucion/verificaciones";
import { fechasDeCorreccion } from "@/lib/distribucion/verificacion";
import { exigirSesion } from "@/lib/paginas";
import { zonaHoraria } from "@/lib/zona-horaria";

export const dynamic = "force-dynamic";

/** Quien no ve la verificación recibe lo mismo que si no existiera: la piden el título y la página, una sola lectura. */
const verificacionVisible = cache(async (id: string) => {
  const sesion = await exigirSesion();
  const verificacion = /^\d{1,15}$/.test(id) ? await obtenerVerificacion(Number(id), sesion) : null;
  return { sesion, verificacion };
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { verificacion } = await verificacionVisible((await params).id);
  return { title: verificacion ? `Verificar ${verificacion.punto.nombre}` : "Página no encontrada" };
}

const DIA_MS = 86_400_000;

export default async function PaginaVerificacion({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { verificacion: v } = await verificacionVisible(id);
  if (!v) notFound();

  // En una cerrada, la última es ella misma: el resumen ya lo dice.
  const ultima = v.estado === "cerrada" ? null : await ultimaVerificacionDe(v.punto.id);
  // La fecha de corrección que se propone a cada no conforme, en la zona de la instalación (spec 13C §12.2).
  const fechas = v.puedeEditar
    ? fechasDeCorreccion(new Date(), (await obtenerConfigDocumental()).distribucion.plazoCorreccionDias, zonaHoraria())
    : undefined;
  const fecha = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: zonaHoraria() });
  const cuando = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: zonaHoraria() });
  const hace = ultima ? Math.floor((new Date().getTime() - ultima.cerradaEn.getTime()) / DIA_MS) : null;

  return (
    <div className="flex flex-col gap-4">
      <EncabezadoPagina
        titulo={`Verificar ${v.punto.nombre}`}
        descripcion={
          <>
            {`Responsable: ${v.responsable.nombre}`}
            {v.punto.sede ? ` · Sede: ${v.punto.sede}` : ""}
            {v.estado === "cerrada" ? null : <br />}
            {v.estado === "cerrada" ? null : ultima
              ? `Última verificación cerrada: ${fecha.format(ultima.cerradaEn)}${hace === 0 ? " (hoy)" : hace === 1 ? " (hace 1 día)" : ` (hace ${hace} días)`}`
              : "Este punto aún no tiene verificaciones cerradas"}
          </>
        }
        insignias={
          v.estado === "abierta" ? (
            <Insignia variante="atencion">Abierta</Insignia>
          ) : v.estado === "cerrada" ? (
            <Insignia variante={v.conforme ? "bien" : "critico"}>{v.conforme ? "Cerrada · conforme" : "Cerrada · no conforme"}</Insignia>
          ) : (
            <Insignia variante="neutra">Descartada</Insignia>
          )
        }
        migas={[{ nombre: "Verificaciones", href: "/distribucion/verificaciones" }, { nombre: v.punto.nombre }]}
      />

      {v.estado === "descartada" ? (
        <p role="status" className="rounded-lg border border-border bg-muted p-3 text-sm">
          {`Verificación descartada: ${v.motivoDescarte ?? ""}. No dejó hallazgos ni movió copias.`}
        </p>
      ) : null}
      {v.estado === "abierta" ? (
        <p className="text-sm text-muted-foreground">
          {`Abierta por ${v.abiertaPor} el ${cuando.format(v.abiertaEn)}. Compare cada copia con la versión vigente; el QR del sello abre la ficha del documento.`}
        </p>
      ) : null}
      {v.estado === "cerrada" ? <ResumenCierre verificacion={v} /> : null}

      <ListaChequeo verificacion={v} fechas={fechas} />

      {v.estado === "cerrada" ? <ListaHallazgos hallazgos={v.hallazgos} volver={{ verificacionId: v.id }} /> : null}
    </div>
  );
}
