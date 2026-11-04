import type { Metadata } from "next";
import { cerrarSesionAccion } from "@/app/admin/acciones-usuarios";
import { exigirPermiso } from "@/lib/paginas";
import { zonaHoraria } from "@/lib/zona-horaria";
import { ETIQUETA_ROL } from "@/lib/roles";
import { listarSesionesActivas } from "@/lib/sesion";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sesiones — Administración SGC" };

const fecha = new Intl.DateTimeFormat("es-CO", { dateStyle: "short", timeStyle: "medium", timeZone: zonaHoraria() });
const f = (iso: string) => fecha.format(new Date(iso));

export default async function PaginaSesiones() {
  const actual = await exigirPermiso("sesiones.administrar");
  const sesiones = await listarSesionesActivas();

  return (
    <main>
      <h1 className="mb-1 font-display text-2xl font-semibold">Sesiones activas</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        {sesiones.length} {sesiones.length === 1 ? "sesión activa" : "sesiones activas"}. Cerrar una sesión
        obliga a la persona a ingresar de nuevo en su siguiente solicitud.
      </p>

      <div
        role="region"
        aria-label="Tabla de sesiones activas (desplazable horizontalmente)"
        tabIndex={0}
        className="overflow-x-auto rounded-lg border outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
      >
        <table className="w-full text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th className="px-3 py-2">Usuario</th>
              <th className="px-3 py-2">Rol</th>
              <th className="px-3 py-2">IP</th>
              <th className="px-3 py-2">Navegador</th>
              <th className="px-3 py-2">Iniciada</th>
              <th className="px-3 py-2">Último uso</th>
              <th className="px-3 py-2">Acción</th>
            </tr>
          </thead>
          <tbody>
            {sesiones.map((s) => (
              <tr key={s.sesionId} className="border-t align-top">
                <td className="px-3 py-2">
                  {s.nombre}
                  <span className="block text-xs text-muted-foreground">
                    {s.usuario}{s.factorPendiente && " · segundo factor pendiente"}
                  </span>
                </td>
                <td className="px-3 py-2">{ETIQUETA_ROL[s.rol]}</td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{s.ip ?? "—"}</td>
                <td className="max-w-64 px-3 py-2 text-xs text-muted-foreground">
                  <span className="block truncate" title={s.userAgent ?? undefined}>{s.userAgent ?? "—"}</span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs">{f(s.creadaEn)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-xs">{f(s.ultimoUsoEn)}</td>
                <td className="px-3 py-2">
                  {s.sesionId === actual.sesionId ? (
                    <span className="text-muted-foreground">Esta sesión</span>
                  ) : (
                    <form action={cerrarSesionAccion}>
                      <input type="hidden" name="sesionId" value={s.sesionId} />
                      <button
                        type="submit"
                        aria-label={`Cerrar la sesión de ${s.nombre}`}
                        className="rounded-md border px-3 py-1.5 hover:bg-muted"
                      >
                        Cerrar
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sesiones.length === 0 && (
          <p className="px-3 py-8 text-center text-muted-foreground">No hay sesiones activas.</p>
        )}
      </div>
    </main>
  );
}
