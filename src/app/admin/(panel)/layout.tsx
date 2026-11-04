import Link from "next/link";
import { salir } from "@/app/acciones-cuenta";
import { ENLACES_PANEL } from "@/componentes/admin/enlaces-panel";
import { exigirEntradaPanel } from "@/lib/paginas";
import { puede } from "@/lib/permisos";

// Todo el panel es autenticado y por-petición: nunca se prerenderiza en build.
// Sin esto, los loading.tsx (Suspense) inducen a Next a generar el shell estático
// de las páginas de ruta fija (p. ej. /admin/documentos/nuevo), ejecutando sus
// consultas a BD en build — que falla en CI/NAS donde no hay DATABASE_URL (D12).
export const dynamic = "force-dynamic";

// Capa dos del guard: validación REAL contra BD en cada render del panel.
export default async function LayoutPanel({
  children,
}: {
  children: React.ReactNode;
}) {
  const sesion = await exigirEntradaPanel();

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b py-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link href="/admin" className="font-display text-lg font-semibold">
            Administración SGC
          </Link>
          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {ENLACES_PANEL.filter((e) => puede(sesion, e.permiso)).map((e) => (
              <Link key={e.href} href={e.href} className="hover:underline">
                {e.etiqueta}
              </Link>
            ))}
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
