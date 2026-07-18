import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { salir } from "@/app/admin/acciones";
import { COOKIE_SESION, validarSesion } from "@/lib/sesion";

// Capa dos del guard: validación REAL contra BD en cada render del panel.
export default async function LayoutPanel({
  children,
}: {
  children: React.ReactNode;
}) {
  const almacen = await cookies();
  const sesion = await validarSesion(almacen.get(COOKIE_SESION)?.value);
  if (!sesion) redirect("/admin/ingreso");

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b py-4">
        <div className="flex items-center gap-6">
          <Link href="/admin" className="font-display text-lg font-semibold">
            Administración SGC
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/admin" className="hover:underline">Documentos</Link>
            <Link href="/admin/mapa" className="hover:underline">Mapa</Link>
            <Link href="/admin/tipos" className="hover:underline">Tipos de documento</Link>
            <Link href="/" className="text-muted-foreground hover:underline">
              Ver portal público
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">{sesion.nombre}</span>
          <form action={salir}>
            <button type="submit" className="rounded-md border px-3 py-1 hover:bg-muted">
              Salir
            </button>
          </form>
        </div>
      </header>
      {children}
    </div>
  );
}
