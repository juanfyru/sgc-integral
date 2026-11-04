import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FormularioAviso } from "@/componentes/cuenta/FormularioAviso";
import { obtenerTextos } from "@/db/consultas/mapa-admin";
import { rutaInterna } from "@/lib/rutas";
import { sesionActual } from "@/lib/sesion-actual";

export const metadata: Metadata = { title: "Aviso de datos personales — SGC Integral" };
export const dynamic = "force-dynamic";

const AVISO_POR_DEFECTO =
  "La entidad aún no ha cargado el aviso de tratamiento de datos personales; al continuar acepta que sus datos de cuenta se usan solo para operar esta plataforma.";

export default async function PaginaAvisoDatos({
  searchParams,
}: {
  searchParams: Promise<{ volver?: string }>;
}) {
  const { volver } = await searchParams;
  const sesion = await sesionActual();
  if (sesion?.debeCambiarClave) redirect("/cuenta/clave-inicial");
  if (sesion?.aceptoDatos) redirect(rutaInterna(volver));
  const texto = (await obtenerTextos()).aviso_datos_personales?.trim() || AVISO_POR_DEFECTO;
  const parrafos = texto.split(/\r?\n+/).filter((p) => p.trim());
  return (
    <>
      <h1 className="font-display text-2xl font-semibold">Aviso de datos personales</h1>
      <div className="w-full space-y-3 text-sm text-foreground">
        {parrafos.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      <FormularioAviso volver={rutaInterna(volver)} />
    </>
  );
}
