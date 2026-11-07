import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { FormularioAbrir } from "@/componentes/distribucion/verificaciones/FormularioAbrir";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { EstadoVacio } from "@/componentes/ui/EstadoVacio";
import { obtenerPuntoUso } from "@/db/consultas/distribucion/puntos-uso";
import { verificacionAbiertaDe } from "@/db/consultas/distribucion/verificaciones";
import { exigirPermiso } from "@/lib/paginas";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Verificar un punto de uso" };

/**
 * Una lectura: si el punto ya tiene una verificación abierta, lleva a ella; si no, pide confirmar. Abrirla
 * escribe, así que la hace `abrirVerificacionAccion` (POST), no esta página.
 */
export default async function PaginaNuevaVerificacion({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sesion = await exigirPermiso("verificaciones.realizar");
  const { punto: parametro } = await searchParams;
  const texto = Array.isArray(parametro) ? parametro[0] : parametro;
  const punto = texto && /^\d{1,15}$/.test(texto) ? await obtenerPuntoUso(Number(texto), sesion) : null;

  const abierta = punto?.activo ? await verificacionAbiertaDe(punto.id) : null;
  if (abierta !== null) redirect(`/distribucion/verificaciones/${abierta}`);

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina
        titulo="Verificar un punto de uso"
        migas={[{ nombre: "Verificaciones", href: "/distribucion/verificaciones" }, { nombre: "Nueva" }]}
      />
      {punto?.activo ? (
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-xs">
          <h2 className="text-sm font-semibold">{`Verificar ${punto.nombre}`}</h2>
          <p className="text-sm text-muted-foreground">
            La lista se arma con las copias que hoy tiene el punto, más los ítems fijos. Queda en la bitácora que usted la abrió.
          </p>
          <FormularioAbrir puntoId={punto.id} punto={punto.nombre} />
        </section>
      ) : (
        <EstadoVacio
          icono={ClipboardCheck}
          titulo="No se pudo abrir la verificación"
          texto="Falta elegir un punto de uso activo a verificar."
        />
      )}
    </div>
  );
}
