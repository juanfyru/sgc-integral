import type { Metadata } from "next";
import Link from "next/link";
import { obtenerAccesos, RESULTADOS_ACCESO } from "@/db/consultas/accesos";
import type { ResultadoAcceso } from "@/db/consultas/autenticacion";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { TablaDatos, celda, type ColumnaTabla } from "@/componentes/ui/TablaDatos";
import { exigirPermiso } from "@/lib/paginas";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Accesos — Administración SGC" };

const ETIQUETA_RESULTADO: Record<ResultadoAcceso, string> = {
  ingreso: "Ingreso",
  salida: "Salida",
  fallo: "Fallo",
  bloqueo: "Bloqueo",
  desbloqueo: "Desbloqueo",
  restablecimiento: "Restablecimiento",
  factor_fallo: "Fallo del segundo factor",
  cierre_forzado: "Cierre forzado",
};

const COLUMNAS: readonly ColumnaTabla[] = [
  { clave: "cuando", etiqueta: "Cuándo" },
  { clave: "usuario", etiqueta: "Usuario" },
  { clave: "resultado", etiqueta: "Resultado" },
  { clave: "ip", etiqueta: "IP" },
  { clave: "navegador", etiqueta: "Navegador" },
];

export default async function PaginaAccesos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await exigirPermiso("accesos.ver");
  const sp = await searchParams;
  const pagina = Number(sp.pagina) > 0 ? Number(sp.pagina) : 1;
  const resultado = RESULTADOS_ACCESO.find((x) => x === sp.resultado);
  const r = await obtenerAccesos({
    usuario: sp.usuario || undefined,
    resultado,
    desde: sp.desde || undefined,
    hasta: sp.hasta || undefined,
    pagina,
  });

  const conservar = (nueva: number) => {
    const q = new URLSearchParams();
    for (const k of ["usuario", "resultado", "desde", "hasta"]) if (sp[k]) q.set(k, sp[k]!);
    q.set("pagina", String(nueva));
    return `/admin/accesos?${q.toString()}`;
  };

  return (
    <div>
      <EncabezadoPagina titulo="Accesos" />

      <form method="GET" className="mb-4 flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">Usuario</span>
          <input type="text" name="usuario" defaultValue={sp.usuario ?? ""} className="rounded-md border px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">Resultado</span>
          <select name="resultado" defaultValue={resultado ?? ""} className="rounded-md border px-2 py-1">
            <option value="">Todos</option>
            {RESULTADOS_ACCESO.map((x) => <option key={x} value={x}>{ETIQUETA_RESULTADO[x]}</option>)}
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
        <button type="submit" className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground">
          Filtrar
        </button>
        <Link href="/admin/accesos" className="px-2 py-1.5 text-muted-foreground hover:underline">Limpiar</Link>
      </form>

      <TablaDatos titulo="Accesos al sistema" columnas={COLUMNAS} filas={r.filas.length} vacio="Sin registros en el periodo">
        {r.filas.map((f) => (
          <tr key={f.id}>
            <td className={`${celda} whitespace-nowrap font-mono text-xs text-muted-foreground`}>{f.creadoEn}</td>
            <td className={celda}>
              {f.usuarioTexto}
              {f.nombre && <span className="block text-xs text-muted-foreground">{f.nombre}</span>}
            </td>
            <td className={`${celda} font-medium`}>{ETIQUETA_RESULTADO[f.resultado]}</td>
            <td className={`${celda} whitespace-nowrap font-mono text-xs`}>{f.ip ?? "—"}</td>
            <td className={`${celda} max-w-64 text-xs text-muted-foreground`}>
              <span className="block truncate" title={f.userAgent ?? undefined}>{f.userAgent ?? "—"}</span>
            </td>
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
