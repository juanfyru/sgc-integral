import type { Metadata } from "next";
import Link from "next/link";
import { BotonBorrar } from "@/componentes/admin/mapa/BotonBorrar";
import { BotonToggle } from "@/componentes/admin/mapa/BotonToggle";
import { BotonesOrden } from "@/componentes/admin/mapa/BotonesOrden";
import { listarTipos } from "@/db/consultas/mapa-admin";

export const metadata: Metadata = { title: "Tipos de documento — Administración SGC" };

export default async function PaginaTipos() {
  const tipos = await listarTipos();
  return (
    <main>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">Tipos de documento</h1>
        <Link
          href="/admin/tipos/nuevo"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Nuevo tipo
        </Link>
      </div>
      <ul className="flex flex-col gap-2">
        {tipos.map((t, i) => (
          <li
            key={t.id}
            className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 ${t.activo ? "" : "border-dashed opacity-60"}`}
          >
            <BotonesOrden
              tabla="tipos_documento"
              id={t.id}
              esPrimero={i === 0}
              esUltimo={i === tipos.length - 1}
            />
            <span className="font-mono text-sm">{t.sigla}</span>
            <Link href={`/admin/tipos/${t.id}`} className="flex-1 font-medium hover:underline">
              {t.nombre}
            </Link>
            <span className="text-xs text-muted-foreground">
              {t.numDocs} docs · {t.esDiligenciable ? "diligenciable" : "solo lectura"}
              {t.activo ? "" : " · inactivo"}
            </span>
            <BotonToggle tabla="tipos_documento" id={t.id} activo={t.activo} />
            {t.numDocs === 0 && (
              <BotonBorrar tabla="tipos_documento" id={t.id} volverA="/admin/tipos" />
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
