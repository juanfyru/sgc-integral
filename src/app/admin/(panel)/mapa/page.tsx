import type { Metadata } from "next";
import Link from "next/link";
import { BotonBorrar } from "@/componentes/admin/mapa/BotonBorrar";
import { BotonesOrden } from "@/componentes/admin/mapa/BotonesOrden";
import { ConfirmarDesactivar } from "@/componentes/admin/mapa/ConfirmarDesactivar";
import { Icono } from "@/componentes/iconos";
import { listarMacroprocesos } from "@/db/consultas/mapa-admin";

export const metadata: Metadata = { title: "Editor del mapa — Administración SGC" };

const BANDAS: Record<string, string> = {
  estrategicos: "Procesos Estratégicos",
  misionales: "Procesos Misionales",
  apoyo: "Procesos de Apoyo",
  evaluacion: "Evaluación y Mejora",
};

export default async function PaginaMapa() {
  const macros = await listarMacroprocesos();
  return (
    <main className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">Editor del mapa</h1>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href="/admin/mapa/perifericos" className="rounded-md border px-3 py-2 hover:bg-muted">Periféricos</Link>
          <Link href="/admin/mapa/textos" className="rounded-md border px-3 py-2 hover:bg-muted">Textos</Link>
          <Link href="/admin/mapa/vista-previa" className="rounded-md border px-3 py-2 hover:bg-muted">Vista previa</Link>
          <Link href="/admin/mapa/macroprocesos/nuevo" className="rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground">
            Nuevo macroproceso
          </Link>
        </div>
      </div>
      {(["estrategicos", "misionales", "apoyo", "evaluacion"] as const).map((banda) => {
        const grupo = macros.filter((m) => m.banda === banda);
        return (
          <section key={banda}>
            <h2 className="mb-2 font-display text-lg font-semibold">{BANDAS[banda]}</h2>
            <ul className="flex flex-col gap-2">
              {grupo.map((m, i) => (
                <li
                  key={m.id}
                  className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 ${m.activo ? "" : "border-dashed opacity-60"}`}
                >
                  <BotonesOrden tabla="macroprocesos" id={m.id} esPrimero={i === 0} esUltimo={i === grupo.length - 1} />
                  <span className="grid size-7 place-items-center rounded-md text-white" style={{ background: m.color }}>
                    <Icono nombre={m.icono} className="size-4" />
                  </span>
                  <Link href={`/admin/mapa/macroprocesos/${m.id}`} className="flex-1 font-medium hover:underline">
                    <span aria-hidden="true">{m.letra}. </span>{m.nombre}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {m.numProcesos} procesos{m.activo ? "" : " · inactivo"}
                  </span>
                  <ConfirmarDesactivar tabla="macroprocesos" id={m.id} activo={m.activo} afectados={m.docsAfectados} />
                  {m.numProcesos === 0 && (
                    <BotonBorrar tabla="macroprocesos" id={m.id} volverA="/admin/mapa" />
                  )}
                </li>
              ))}
              {grupo.length === 0 && (
                <li className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">Sin macroprocesos.</li>
              )}
            </ul>
          </section>
        );
      })}
    </main>
  );
}
