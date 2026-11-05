import { ChevronDown, ChevronUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  alternarAreaAccion,
  alternarCargoAccion,
  moverAreaAccion,
} from "@/app/admin/acciones-estructura";
import { FormAccion } from "@/componentes/admin/FormAccion";
import { claseBoton } from "@/componentes/ui/Boton";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { Insignia } from "@/componentes/ui/Insignia";
import { listarAreas, listarCargos } from "@/db/consultas/estructura";
import { exigirPermiso } from "@/lib/paginas";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Estructura — Administración SGC" };

export default async function PaginaEstructura() {
  await exigirPermiso("estructura.administrar");
  const [areas, cargos] = await Promise.all([listarAreas(), listarCargos()]);
  return (
    <div>
      <EncabezadoPagina titulo="Estructura" descripcion="Áreas y cargos de la entidad." />
      <div className="flex flex-col gap-10">
        <section aria-labelledby="titulo-areas">
          <div className="mb-4 flex items-center justify-between">
            <h2 id="titulo-areas" className="font-display text-lg font-semibold">Áreas</h2>
            <Link href="/admin/estructura/areas/nueva" className={claseBoton("primario")}>Nueva área</Link>
          </div>
          <ul className="flex flex-col gap-2">
            {areas.map((a, i) => (
              <li
                key={a.id}
                className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 ${a.activo ? "" : "border-dashed"}`}
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
                  {a.numCargos} cargos
                </span>
                {!a.activo && <Insignia variante="sin-dato">Inactiva</Insignia>}
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
            <h2 id="titulo-cargos" className="font-display text-lg font-semibold">Cargos</h2>
            <Link href="/admin/estructura/cargos/nuevo" className={claseBoton("primario")}>Nuevo cargo</Link>
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
                        className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 ${c.activo ? "" : "border-dashed"}`}
                      >
                        <Link href={`/admin/estructura/cargos/${c.id}`} className="flex-1 font-medium hover:underline">
                          {c.nombre}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          {c.superiorNombre ? `Reporta a ${c.superiorNombre}` : "Sin superior"} ·{" "}
                          {c.numUsuarios} usuarios
                        </span>
                        {!c.activo && <Insignia variante="sin-dato">Inactivo</Insignia>}
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
      </div>
    </div>
  );
}
