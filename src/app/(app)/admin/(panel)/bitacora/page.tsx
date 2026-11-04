import type { Metadata } from "next";
import Link from "next/link";
import { obtenerBitacora } from "@/db/consultas/bitacora";
import { describirEvento } from "@/lib/bitacora-detalle";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { TablaDatos, celda, type ColumnaTabla } from "@/componentes/ui/TablaDatos";
import { exigirPermiso } from "@/lib/paginas";

export const metadata: Metadata = { title: "Bitácora — Administración SGC" };

const COLUMNAS: readonly ColumnaTabla[] = [
  { clave: "cuando", etiqueta: "Cuándo" },
  { clave: "quien", etiqueta: "Quién" },
  { clave: "que", etiqueta: "Qué" },
];

export default async function PaginaBitacora({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await exigirPermiso("bitacora.ver");
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
    <div>
      <EncabezadoPagina titulo="Bitácora" />

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

      <TablaDatos titulo="Bitácora de acciones" columnas={COLUMNAS} filas={r.filas.length} vacio="Sin movimientos registrados">
        {r.filas.map((f) => (
          <tr key={f.id}>
            <td className={`${celda} whitespace-nowrap font-mono text-xs text-muted-foreground`}>{f.creadoEn}</td>
            <td className={celda}>{f.usuario}</td>
            <td className={celda}>{describirEvento(f)}</td>
          </tr>
        ))}
      </TablaDatos>

      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{r.total} registros · página {r.pagina} de {r.totalPaginas}</span>
        <div className="flex gap-2">
          {r.pagina > 1 && <Link href={conservar(r.pagina - 1)} className="rounded-md border px-3 py-2 hover:bg-muted">Anterior</Link>}
          {r.pagina < r.totalPaginas && <Link href={conservar(r.pagina + 1)} className="rounded-md border px-3 py-2 hover:bg-muted">Siguiente</Link>}
        </div>
      </div>
    </div>
  );
}
