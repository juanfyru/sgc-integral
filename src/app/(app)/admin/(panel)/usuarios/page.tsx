import type { Metadata } from "next";
import Link from "next/link";
import { contarAdminsActivos, listarUsuarios, type FilaUsuario } from "@/db/consultas/usuarios";
import { claseBoton } from "@/componentes/ui/Boton";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { Insignia } from "@/componentes/ui/Insignia";
import { TablaDatos, celda, type ColumnaTabla } from "@/componentes/ui/TablaDatos";
import { exigirPermiso } from "@/lib/paginas";
import { zonaHoraria } from "@/lib/zona-horaria";
import { esRol, ETIQUETA_ROL, ROLES } from "@/lib/roles";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Usuarios — Administración SGC" };

const claseCampo = "rounded-md border border-border bg-card px-3 py-2 text-sm";
const hora = new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: zonaHoraria() });
const fecha = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: zonaHoraria() });

function EstadoUsuario({ fila }: { fila: FilaUsuario }) {
  if (!fila.activo) return <Insignia variante="sin-dato">Inactivo</Insignia>;
  if (fila.bloqueadoHasta) {
    return <Insignia variante="critico">Bloqueado hasta {hora.format(new Date(fila.bloqueadoHasta))}</Insignia>;
  }
  return <Insignia variante="bien">Activo</Insignia>;
}

const COLUMNAS: readonly ColumnaTabla[] = [
  { clave: "usuario", etiqueta: "Usuario" },
  { clave: "rol", etiqueta: "Rol" },
  { clave: "cargo", etiqueta: "Cargo" },
  { clave: "estado", etiqueta: "Estado" },
  { clave: "2fa", etiqueta: "2FA" },
  { clave: "ingreso", etiqueta: "Último ingreso" },
];

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
    <div className="flex flex-col gap-6">
      <EncabezadoPagina
        titulo="Usuarios"
        acciones={
          <>
            <Link href="/admin/usuarios/lote" className={claseBoton("secundario")}>
              Alta por lote
            </Link>
            <Link href="/admin/usuarios/nuevo" className={claseBoton("primario")}>
              Nuevo usuario
            </Link>
          </>
        }
      />

      {admins < 2 && (
        <p role="note" className="rounded-md border-2 border-estado-atencion bg-estado-atencion-fondo px-4 py-3 text-sm font-medium text-estado-atencion-texto">
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

      <TablaDatos titulo="Usuarios del sistema" columnas={COLUMNAS} filas={usuarios.length} vacio="Sin usuarios que coincidan">
        {usuarios.map((u) => (
          <tr key={u.id} className={u.activo ? "" : "opacity-70"}>
            <td className={celda}>
              <Link href={`/admin/usuarios/${u.id}`} className="font-medium hover:underline">
                {u.nombre}
              </Link>
              <div className="text-xs text-muted-foreground">{u.usuario}</div>
            </td>
            <td className={celda}>{ETIQUETA_ROL[u.rol]}</td>
            <td className={celda}>
              {u.cargo ?? "—"}
              {u.area && <div className="text-xs text-muted-foreground">{u.area}</div>}
            </td>
            <td className={celda}>
              <EstadoUsuario fila={u} />
              {u.debeCambiarClave && <div className="text-xs text-muted-foreground">Clave temporal</div>}
            </td>
            <td className={celda}>{u.totpActivo ? "Activo" : "No"}</td>
            <td className={celda}>{u.ultimoIngreso ? fecha.format(new Date(u.ultimoIngreso)) : "Nunca"}</td>
          </tr>
        ))}
      </TablaDatos>
    </div>
  );
}
