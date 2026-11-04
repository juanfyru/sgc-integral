import { ChevronDown, ChevronUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  alternarAreaAccion,
  alternarCargoAccion,
  moverAreaAccion,
} from "@/app/admin/acciones-estructura";
import { FormAccion } from "@/componentes/admin/FormAccion";
import { listarAreas, listarCargos } from "@/db/consultas/estructura";
import { exigirPermiso } from "@/lib/paginas";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Estructura — Administración SGC" };

const claseEnlace = "rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground";

export default async function PaginaEstructura() {
  await exigirPermiso("estructura.administrar");
  const [areas, cargos] = await Promise.all([listarAreas(), listarCargos()]);
  return (
    <main className="flex flex-col gap-10">
      <section aria-labelledby="titulo-areas">
        <div className="mb-4 flex items-center justify-between">
          <h1 id="titulo-areas" className="font-display text-2xl font-semibold">Áreas</h1>
          <Link href="/admin/estructura/areas/nueva" className={claseEnlace}>Nueva área</Link>
        </div>
        <ul className="flex flex-col gap-2">
          {areas.map((a, i) => (
            <li
              key={a.id}
              className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 ${a.activo ? "" : "border-dashed opacity-60"}`}
            >
              <span className="inline-flex gap-1">
                {(["arriba", "abajo"] as const).map((direccion) => {
                  const deshabilitado = direccion === "arriba" ? i === 0 : i === areas.length - 1;
                  return (
                    <form action={moverAreaAccion} key={direccion}>
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="direccion" value={direccion} />
                      <button
                        type="submit"
                        disabled={deshabilitado}
                        aria-label={`${direccion === "arriba" ? "Subir" : "Bajar"} ${a.nombre}`}
                        className="grid size-7 place-items-center rounded-md border hover:bg-muted disabled:opacity-30"
                      >
                        {direccion === "arriba" ? (
                          <ChevronUp className="size-4" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="size-4" aria-hidden="true" />
                        )}
                      </button>
                    </form>
                  );
                })}
              </span>
              <Link href={`/admin/estructura/areas/${a.id}`} className="flex-1 font-medium hover:underline">
                {a.nombre}
              </Link>
              <span className="text-xs text-muted-foreground">
                {a.numCargos} cargos{a.activo ? "" : " · inactiva"}
              </span>
              <FormAccion
                accion={alternarAreaAccion}
                etiqueta={a.activo ? "Desactivar" : "Activar"}
                campos={{ id: a.id, activo: String(!a.activo) }}
                tono={a.activo ? "peligro" : "primario"}
              />
            </li>
          ))}
          {areas.length === 0 && <li className="text-sm text-muted-foreground">Aún no hay áreas.</li>}
        </ul>
      </section>

      <section aria-labelledby="titulo-cargos">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="titulo-cargos" className="font-display text-2xl font-semibold">Cargos</h2>
          <Link href="/admin/estructura/cargos/nuevo" className={claseEnlace}>Nuevo cargo</Link>
        </div>
        <div className="flex flex-col gap-6">
          {areas.map((a) => {
            const delArea = cargos.filter((c) => c.areaId === a.id);
            return (
              <div key={a.id}>
                <h3 className="mb-2 font-medium">{a.nombre}</h3>
                <ul className="flex flex-col gap-2">
                  {delArea.map((c) => (
                    <li
                      key={c.id}
                      className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 ${c.activo ? "" : "border-dashed opacity-60"}`}
                    >
                      <Link href={`/admin/estructura/cargos/${c.id}`} className="flex-1 font-medium hover:underline">
                        {c.nombre}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {c.superiorNombre ? `Reporta a ${c.superiorNombre}` : "Sin superior"} ·{" "}
                        {c.numUsuarios} usuarios{c.activo ? "" : " · inactivo"}
                      </span>
                      <FormAccion
                        accion={alternarCargoAccion}
                        etiqueta={c.activo ? "Desactivar" : "Activar"}
                        campos={{ id: c.id, activo: String(!c.activo) }}
                        tono={c.activo ? "peligro" : "primario"}
                      />
                    </li>
                  ))}
                  {delArea.length === 0 && (
                    <li className="text-sm text-muted-foreground">Sin cargos en esta área.</li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
