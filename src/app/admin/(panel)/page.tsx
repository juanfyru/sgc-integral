import type { Metadata } from "next";
import Link from "next/link";
import { listarDocumentosAdmin } from "@/db/consultas/admin";
import { EstadoBadge } from "@/componentes/admin/EstadoBadge";

export const metadata: Metadata = { title: "Documentos — Administración SGC" };

export default async function PaginaDocumentosAdmin() {
  const documentos = await listarDocumentosAdmin();

  return (
    <main>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">Documentos</h1>
        <Link
          href="/admin/documentos/nuevo"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Nuevo documento
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th className="px-3 py-2">Código</th>
              <th className="px-3 py-2">Título</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {documentos.map((d) => (
              <tr key={d.id} className="border-t hover:bg-muted/50">
                <td className="px-3 py-2 font-mono">
                  <Link href={`/admin/documentos/${d.codigo}`} className="hover:underline">
                    {d.codigo}
                  </Link>
                </td>
                <td className="px-3 py-2">{d.titulo}</td>
                <td className="px-3 py-2">{d.tipoNombre}</td>
                <td className="px-3 py-2">
                  <span className="flex flex-wrap gap-1">
                    {d.versionVigente !== null && <EstadoBadge estado="vigente" />}
                    {d.versionBorrador !== null && <EstadoBadge estado="borrador" />}
                    {d.versionVigente === null && d.versionBorrador === null && d.anulado && (
                      <EstadoBadge estado="anulado" />
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {documentos.length === 0 && (
          <p className="px-3 py-8 text-center text-muted-foreground">
            Aún no hay documentos. Cree el primero con “Nuevo documento”.
          </p>
        )}
      </div>
    </main>
  );
}
