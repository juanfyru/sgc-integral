import type { Metadata } from "next";
import Link from "next/link";
import { BotonBorrar } from "@/componentes/admin/mapa/BotonBorrar";
import { BotonToggle } from "@/componentes/admin/mapa/BotonToggle";
import { BotonesOrden } from "@/componentes/admin/mapa/BotonesOrden";
import { Icono } from "@/componentes/iconos";
import { listarPerifericos } from "@/db/consultas/mapa-admin";

export const metadata: Metadata = { title: "Periféricos — Administración SGC" };

const TITULOS = {
  entrada: "Entradas del Sistema",
  salida: "Salidas del Sistema",
  convencion: "Convenciones",
} as const;

export default async function PaginaPerifericos() {
  const grupos = await listarPerifericos();
  return (
    <main className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">Elementos periféricos</h1>
        <Link
          href="/admin/mapa/perifericos/nuevo"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Nuevo elemento
        </Link>
      </div>
      {(["entrada", "salida", "convencion"] as const).map((tipo) => (
        <section key={tipo}>
          <h2 className="mb-2 font-display text-lg font-semibold">{TITULOS[tipo]}</h2>
          <ul className="flex flex-col gap-2">
            {grupos[tipo].map((e, i) => (
              <li
                key={e.id}
                className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 ${e.activo ? "" : "border-dashed opacity-60"}`}
              >
                <BotonesOrden
                  tabla="elementos_perifericos"
                  id={e.id}
                  esPrimero={i === 0}
                  esUltimo={i === grupos[tipo].length - 1}
                />
                <Icono nombre={e.icono} className="size-4 text-muted-foreground" />
                <Link href={`/admin/mapa/perifericos/${e.id}`} className="flex-1 hover:underline">
                  {e.texto}
                </Link>
                {!e.activo && <span className="text-xs text-muted-foreground">inactivo</span>}
                <BotonToggle tabla="elementos_perifericos" id={e.id} activo={e.activo} />
                <BotonBorrar tabla="elementos_perifericos" id={e.id} volverA="/admin/mapa/perifericos" />
              </li>
            ))}
            {grupos[tipo].length === 0 && (
              <li className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                Sin elementos.
              </li>
            )}
          </ul>
        </section>
      ))}
    </main>
  );
}
