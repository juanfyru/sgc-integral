import { redirect } from "next/navigation";
import { exigirSesion } from "@/lib/paginas";
import { exigirDistribucion } from "./_comun";

export const dynamic = "force-dynamic";

export default async function PaginaDistribucion() {
  const sesion = await exigirSesion();
  await exigirDistribucion(sesion);
  redirect("/distribucion/copias");
}
