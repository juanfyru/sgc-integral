import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PaginaExterno } from "@/componentes/vigencia/externos/PaginaExterno";
import { obtenerExterno, opcionesDeExterno } from "@/db/consultas/vigencia/externos";
import { exigirSesion } from "@/lib/paginas";
import { exigirVigencia } from "../../_comun";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Documento externo" };

/**
 * La página de control de un externo (spec 13C §8.8). La ve quien lo gestiona, su responsable técnico y quien tiene
 * `vigencia.ver` sobre su proceso (`obtenerExterno`); para los demás no existe.
 */
export default async function PaginaDelExterno({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await exigirSesion();
  await exigirVigencia(sesion);
  const { id } = await params;
  if (!/^\d{1,15}$/.test(id)) notFound();
  const externo = await obtenerExterno(Number(id), sesion);
  if (!externo) notFound();
  const opciones = externo.acciones.editar ? await opcionesDeExterno(sesion) : null;

  return (
    <PaginaExterno
      externo={externo}
      opciones={opciones ? { personas: opciones.personas, normas: opciones.normas } : null}
      pideCodigo={sesion.totpActivo}
    />
  );
}
