import type { Metadata } from "next";
import Link from "next/link";
import { obtenerListadoMaestro } from "@/db/consultas/maestro";
import { BotonImprimir } from "@/componentes/admin/maestro/BotonImprimir";
import { exigirPermiso } from "@/lib/paginas";
import { alcanceMaestro, puede } from "@/lib/permisos";
import { fechaHoraLocal } from "@/lib/zona-horaria";

export const metadata: Metadata = { title: "Listado Maestro — Administración SGC" };

export default async function PaginaMaestro({
  searchParams,
}: {
  searchParams: Promise<{ incluir?: string }>;
}) {
  const sesion = await exigirPermiso("maestro.ver");
  const { incluir: incluirParam } = await searchParams;
  const incluir = alcanceMaestro(sesion, incluirParam);
  const veNoVigentes = puede(sesion, "documentos.ver_historial");
  const filas = await obtenerListadoMaestro({ incluir });
  const generadoEn = fechaHoraLocal(new Date());

  return (
    <main>
      <header className="mb-4">
        <p className="text-sm text-muted-foreground">
          ESE Hospital Nuestra Señora de Fátima de Suaza
        </p>
        <h1 className="font-display text-2xl font-semibold">Listado Maestro de Documentos</h1>
        <p className="text-sm text-muted-foreground">
          Generado: {generadoEn} · Alcance:{" "}
          {incluir === "todos" ? "Todos los documentos" : "Documentos vigentes"} · Total: {filas.length}
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-3 print:hidden">
        {veNoVigentes && (
        <div className="flex gap-2 text-sm">
          <Link
            href="/admin/maestro"
            className={`rounded-md border px-3 py-2 ${incluir === "vigentes" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            Solo vigentes
          </Link>
          <Link
            href="/admin/maestro?incluir=todos"
            className={`rounded-md border px-3 py-2 ${incluir === "todos" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            Todos
          </Link>
        </div>
        )}
        {puede(sesion, "maestro.exportar") && (
          <a
            href={`/admin/maestro/excel${incluir === "todos" ? "?incluir=todos" : ""}`}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Descargar Excel
          </a>
        )}
        <BotonImprimir />
      </div>

      <div
        role="region"
        aria-label="Tabla del Listado Maestro (desplazable horizontalmente)"
        tabIndex={0}
        className="overflow-x-auto rounded-lg border outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul print:border-0"
      >
        <table className="w-full text-sm">
          <thead className="bg-muted text-left print:bg-transparent">
            <tr>
              {["Código", "Título", "Tipo", "Ver.", "Estado", "Aprobación", "Elaboró", "Revisó", "Aprobó", "Proceso propietario"].map((c) => (
                <th key={c} className="px-3 py-2">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.codigo} className="border-t">
                <td className="px-3 py-2 font-mono">{f.codigo}</td>
                <td className="px-3 py-2">{f.titulo}</td>
                <td className="px-3 py-2">{f.tipo}</td>
                <td className="px-3 py-2">{f.version ?? "—"}</td>
                <td className="px-3 py-2">{f.estado}</td>
                <td className="px-3 py-2">{f.fechaAprobacion ?? "—"}</td>
                <td className="px-3 py-2">{f.elaboro ?? "—"}</td>
                <td className="px-3 py-2">{f.reviso ?? "—"}</td>
                <td className="px-3 py-2">{f.aprobo ?? "—"}</td>
                <td className="px-3 py-2">{f.propietario}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filas.length === 0 && (
          <p className="px-3 py-8 text-center text-muted-foreground">No hay documentos para este alcance.</p>
        )}
      </div>
    </main>
  );
}
