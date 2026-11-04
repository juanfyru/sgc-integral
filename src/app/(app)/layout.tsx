import { Cascaron } from "@/componentes/cascaron/Cascaron";
import { exigirSesion } from "@/lib/paginas";

// Todo el portal exige sesión completa y se resuelve por petición.
export const dynamic = "force-dynamic";

// El cascarón se monta una vez aquí: portal y panel cuelgan de este layout y no lo remontan al navegar.
export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const sesion = await exigirSesion();
  return <Cascaron sesion={sesion}>{children}</Cascaron>;
}
