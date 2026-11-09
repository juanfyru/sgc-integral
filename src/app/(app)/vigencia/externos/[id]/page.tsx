import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PaginaExterno } from "@/componentes/vigencia/externos/PaginaExterno";
import { impactoPendienteDelDocumento } from "@/db/consultas/normograma/impactos";
import { obtenerExterno, opcionesDeExterno } from "@/db/consultas/vigencia/externos";
import { exigirSesion } from "@/lib/paginas";
import { RESULTADOS_VERIFICACION, type ResultadoVerificacion } from "@/lib/vigencia/tipos";
import { exigirVigencia } from "../../_comun";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Documento externo" };

/**
 * La página de control de un externo (spec 13C §8.8). La ve quien lo gestiona, su responsable técnico y quien tiene
 * `vigencia.ver` sobre su proceso (`obtenerExterno`); para los demás no existe. Con `?impacto=<id>` (desde la página de
 * impactos, «Verificar el externo»), la verificación resuelve ese impacto si es de este externo y está pendiente; si
 * no, se ignora. Con `?verificar=edicion_nueva|retirado` (desde la revisión anual, «Actualizar» o «Eliminar» un externo)
 * la verificación se abre con ese resultado elegido; un valor desconocido se ignora.
 */
export default async function PaginaDelExterno({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sesion = await exigirSesion();
  await exigirVigencia(sesion);
  const [{ id }, consulta] = await Promise.all([params, searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>)]);
  if (!/^\d{1,15}$/.test(id)) notFound();
  const externo = await obtenerExterno(Number(id), sesion);
  if (!externo) notFound();
  const opciones = externo.acciones.editar ? await opcionesDeExterno(sesion) : null;
  const impactoId = typeof consulta.impacto === "string" && /^\d{1,15}$/.test(consulta.impacto) ? Number(consulta.impacto) : null;
  const impacto = impactoId !== null && externo.acciones.verificar ? await impactoPendienteDelDocumento(impactoId, externo.documentoId) : null;
  const verificar: ResultadoVerificacion | undefined = RESULTADOS_VERIFICACION.find((r) => r === consulta.verificar);

  return (
    <PaginaExterno
      externo={externo}
      opciones={opciones ? { personas: opciones.personas, normas: opciones.normas } : null}
      pideCodigo={sesion.totpActivo}
      impacto={impacto}
      resultadoInicial={verificar}
    />
  );
}
