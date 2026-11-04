import { exigirSesion } from "@/lib/paginas";

// Todo el portal exige sesión completa y se resuelve por petición.
export const dynamic = "force-dynamic";

export default async function LayoutPortal({ children }: { children: React.ReactNode }) {
  await exigirSesion();
  return children;
}
