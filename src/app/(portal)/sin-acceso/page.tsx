import type { Metadata } from "next";
import Link from "next/link";
import { exigirSesion } from "@/lib/paginas";

export const metadata: Metadata = { title: "Sin acceso" };

export default async function PaginaSinAcceso() {
  await exigirSesion();
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="font-display text-2xl font-semibold">Sin acceso</h1>
      <p className="text-sm text-muted-foreground">
        Su cuenta no tiene permiso para ver esta sección.
      </p>
      <Link href="/" className="text-sm text-azul underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-azul/40">
        Volver al inicio
      </Link>
    </main>
  );
}
