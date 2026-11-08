import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { DetalleJornada } from "@/componentes/distribucion/socializaciones/DetalleJornada";
import { fechaDeJornada } from "@/componentes/distribucion/socializaciones/TablaJornadas";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { obtenerJornada, ventanaDeEvidencia } from "@/db/consultas/distribucion/jornadas";
import { exigirSesion } from "@/lib/paginas";
import { puede } from "@/lib/permisos";

export const dynamic = "force-dynamic";

/** Quien no ve la jornada recibe lo mismo que si no existiera: la piden el título y la página, una sola lectura. */
const jornadaVisible = cache(async (id: string) => {
  const sesion = await exigirSesion();
  const jornada = /^\d{1,15}$/.test(id) ? await obtenerJornada(Number(id), sesion) : null;
  return { sesion, jornada };
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { jornada } = await jornadaVisible((await params).id);
  return { title: jornada ? "Socialización" : "Página no encontrada" };
}

export default async function PaginaJornada({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { sesion, jornada } = await jornadaVisible(id);
  if (!jornada) notFound();
  const propia = jornada.registradaPor.id === sesion.usuarioId && puede(sesion, "socializaciones.registrar");
  const hasta = propia ? ventanaDeEvidencia(jornada, new Date()) : null;

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina
        titulo={`Socialización del ${fechaDeJornada(jornada.fecha)}`}
        migas={[{ nombre: "Socializaciones", href: "/distribucion/socializaciones" }, { nombre: "Jornada" }]}
      />
      <DetalleJornada
        jornada={jornada}
        puedeAdjuntar={hasta !== null}
        hasta={hasta}
        puedeAnular={propia || puede(sesion, "distribucion.gestionar")}
      />
    </div>
  );
}
