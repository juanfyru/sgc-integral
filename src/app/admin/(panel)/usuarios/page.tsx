import type { Metadata } from "next";
import Link from "next/link";
import { contarAdminsActivos, listarUsuarios, type FilaUsuario } from "@/db/consultas/usuarios";
import { exigirPermiso } from "@/lib/paginas";
import { esRol, ETIQUETA_ROL, ROLES } from "@/lib/roles";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Usuarios — Administración SGC" };

const claseCampo = "rounded-md border border-border bg-card px-3 py-2 text-sm";
const hora = new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" });
const fecha = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" });

function Insignia({ fila }: { fila: FilaUsuario }) {
  const estilo = "inline-block rounded-full border px-2 py-0.5 text-xs font-semibold";
  if (!fila.activo) return <span className={`${estilo} border-gray-400 bg-gray-200 text-gray-700`}>Inactivo</span>;
  if (fila.bloqueadoHasta) {
    return (
      <span className={`${estilo} border-red-300 bg-red-100 text-red-900`}>
        Bloqueado hasta {hora.format(new Date(fila.bloqueadoHasta))}
      </span>
    );
  }
  return <span className={`${estilo} border-green-300 bg-green-100 text-green-900`}>Activo</span>;
}

export default async function PaginaUsuarios({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await exigirPermiso("usuarios.administrar");
  const sp = await searchParams;
  const uno = (k: string): string => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const texto = uno("texto").trim();
  const rol = esRol(uno("rol")) ? uno("rol") : undefined;
  const estado = uno("estado");
  const activo = estado === "activos" ? true : estado === "inactivos" ? false : undefined;

  const [usuarios, admins] = await Promise.all([
    listarUsuarios({ texto: texto || undefined, rol: rol as (typeof ROLES)[number] | undefined, activo }),
    contarAdminsActivos(),
  ]);

  return (
    <main className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">Usuarios</h1>
        <div className="flex gap-3">
          <Link
            href="/admin/usuarios/lote"
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Alta por lote
          </Link>
          <Link
            href="/admin/usuarios/nuevo"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Nuevo usuario
          </Link>
        </div>
      </div>

      {admins < 2 && (
        <p role="note" className="rounded-md border-2 border-amber-400 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950">
          Hay un solo administrador del SGC activo. Cree un segundo para no depender de una sola persona.
        </p>
      )}

      <form method="get" className="flex flex-wrap items-end gap-3" role="search" aria-label="Filtrar usuarios">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Buscar
          <input name="texto" defaultValue={texto} placeholder="Usuario, nombre o correo" className={claseCampo} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Rol
          <select name="rol" defaultValue={rol ?? ""} className={claseCampo}>
            <option value="">Todos</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>{ETIQUETA_ROL[r]}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Estado
          <select name="estado" defaultValue={estado} className={claseCampo}>
            <option value="">Todos</option>
            <option value="activos">Activos</option>
            <option value="inactivos">Inactivos</option>
          </select>
        </label>
        <button type="submit" className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">
          Filtrar
        </button>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Usuarios del sistema</caption>
          <thead>
            <tr className="border-b text-xs uppercase text-muted-foreground">
              <th scope="col" className="py-2 pr-3">Usuario</th>
              <th scope="col" className="py-2 pr-3">Rol</th>
              <th scope="col" className="py-2 pr-3">Cargo</th>
              <th scope="col" className="py-2 pr-3">Estado</th>
              <th scope="col" className="py-2 pr-3">2FA</th>
              <th scope="col" className="py-2">Último ingreso</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id} className={`border-b ${u.activo ? "" : "opacity-70"}`}>
                <td className="py-2 pr-3">
                  <Link href={`/admin/usuarios/${u.id}`} className="font-medium hover:underline">
                    {u.nombre}
                  </Link>
                  <div className="text-xs text-muted-foreground">{u.usuario}</div>
                </td>
                <td className="py-2 pr-3">{ETIQUETA_ROL[u.rol]}</td>
                <td className="py-2 pr-3">
                  {u.cargo ?? "—"}
                  {u.area && <div className="text-xs text-muted-foreground">{u.area}</div>}
                </td>
                <td className="py-2 pr-3">
                  <Insignia fila={u} />
                  {u.debeCambiarClave && <div className="text-xs text-muted-foreground">Clave temporal</div>}
                </td>
                <td className="py-2 pr-3">{u.totpActivo ? "Activo" : "No"}</td>
                <td className="py-2">{u.ultimoIngreso ? fecha.format(new Date(u.ultimoIngreso)) : "Nunca"}</td>
              </tr>
            ))}
            {usuarios.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 text-muted-foreground">No hay usuarios con esos filtros.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
