import type { Metadata } from "next";
import Link from "next/link";
import { obtenerBitacora } from "@/db/consultas/bitacora";
import { describirEvento } from "@/lib/bitacora-detalle";

export const metadata: Metadata = { title: "Bitácora — Administración SGC" };

export default async function PaginaBitacora({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const pagina = Number(sp.pagina) > 0 ? Number(sp.pagina) : 1;
  const r = await obtenerBitacora({
    accion: sp.accion || undefined,
    entidad: sp.entidad || undefined,
    desde: sp.desde || undefined,
    hasta: sp.hasta || undefined,
    texto: sp.texto || undefined,
    pagina,
  });

  const conservar = (nueva: number) => {
    const q = new URLSearchParams();
    for (const k of ["accion", "entidad", "desde", "hasta", "texto"])
      if (sp[k]) q.set(k, sp[k]!);
    q.set("pagina", String(nueva));
    return `/admin/bitacora?${q.toString()}`;
  };

  return (
    <main>
      <h1 className="mb-4 font-display text-2xl font-semibold">Bitácora</h1>

      <form method="GET" className="mb-4 flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">Acción</span>
          <select name="accion" defaultValue={sp.accion ?? ""} className="rounded-md border px-2 py-1">
            <option value="">Todas</option>
            {r.acciones.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">Entidad</span>
          <select name="entidad" defaultValue={sp.entidad ?? ""} className="rounded-md border px-2 py-1">
            <option value="">Todas</option>
            {r.entidades.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">Desde</span>
          <input type="date" name="desde" defaultValue={sp.desde ?? ""} className="rounded-md border px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">Hasta</span>
          <input type="date" name="hasta" defaultValue={sp.hasta ?? ""} className="rounded-md border px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">Texto (código…)</span>
          <input type="text" name="texto" defaultValue={sp.texto ?? ""} className="rounded-md border px-2 py-1" />
        </label>
        <button type="submit" className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground">
          Filtrar
        </button>
        <Link href="/admin/bitacora" className="px-2 py-1.5 text-muted-foreground hover:underline">Limpiar</Link>
      </form>

      <div
        role="region"
        aria-label="Tabla de la bitácora (desplazable horizontalmente)"
        tabIndex={0}
        className="overflow-x-auto rounded-lg border outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul"
      >
        <table className="w-full text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th className="px-3 py-2">Cuándo</th>
              <th className="px-3 py-2">Quién</th>
              <th className="px-3 py-2">Qué</th>
            </tr>
          </thead>
          <tbody>
            {r.filas.map((f) => (
              <tr key={f.id} className="border-t align-top">
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-muted-foreground">{f.creadoEn}</td>
                <td className="px-3 py-2">{f.usuario}</td>
                <td className="px-3 py-2">{describirEvento(f)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {r.filas.length === 0 && (
          <p className="px-3 py-8 text-center text-muted-foreground">Sin registros para estos filtros.</p>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{r.total} registros · página {r.pagina} de {r.totalPaginas}</span>
        <div className="flex gap-2">
          {r.pagina > 1 && <Link href={conservar(r.pagina - 1)} className="rounded-md border px-3 py-2 hover:bg-muted">Anterior</Link>}
          {r.pagina < r.totalPaginas && <Link href={conservar(r.pagina + 1)} className="rounded-md border px-3 py-2 hover:bg-muted">Siguiente</Link>}
        </div>
      </div>
    </main>
  );
}
