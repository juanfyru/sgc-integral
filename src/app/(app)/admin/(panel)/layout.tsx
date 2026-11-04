import { exigirEntradaPanel } from "@/lib/paginas";

// Todo el panel es autenticado y por-petición: nunca se prerenderiza en build.
// Sin esto, los loading.tsx (Suspense) inducen a Next a generar el shell estático
// de las páginas de ruta fija (p. ej. /admin/documentos/nuevo), ejecutando sus
// consultas a BD en build — que falla en CI/NAS donde no hay DATABASE_URL (D12).
export const dynamic = "force-dynamic";

// Capa dos del guard: validación REAL contra BD en cada render del panel. No dibuja nada:
// la navegación, el usuario y Salir están en el cascarón de (app).
export default async function LayoutPanel({ children }: { children: React.ReactNode }) {
  await exigirEntradaPanel();
  return children;
}
