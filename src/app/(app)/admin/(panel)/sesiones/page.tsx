import type { Metadata } from "next";
import { cerrarSesionAccion } from "@/app/admin/acciones-usuarios";
import { claseBoton } from "@/componentes/ui/Boton";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { TablaDatos, celda, type ColumnaTabla } from "@/componentes/ui/TablaDatos";
import { exigirPermiso } from "@/lib/paginas";
import { zonaHoraria } from "@/lib/zona-horaria";
import { ETIQUETA_ROL } from "@/lib/roles";
import { listarSesionesActivas } from "@/lib/sesion";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sesiones — Administración SGC" };

const fecha = new Intl.DateTimeFormat("es-CO", { dateStyle: "short", timeStyle: "medium", timeZone: zonaHoraria() });
const f = (iso: string) => fecha.format(new Date(iso));

const COLUMNAS: readonly ColumnaTabla[] = [
  { clave: "usuario", etiqueta: "Usuario" },
  { clave: "rol", etiqueta: "Rol" },
  { clave: "ip", etiqueta: "IP" },
  { clave: "navegador", etiqueta: "Navegador" },
  { clave: "iniciada", etiqueta: "Iniciada" },
  { clave: "uso", etiqueta: "Último uso" },
  { clave: "accion", etiqueta: "Acción" },
];

export default async function PaginaSesiones() {
  const actual = await exigirPermiso("sesiones.administrar");
  const sesiones = await listarSesionesActivas();

  return (
    <div>
      <EncabezadoPagina
        titulo="Sesiones activas"
        descripcion={`${sesiones.length} ${sesiones.length === 1 ? "sesión activa" : "sesiones activas"}. Cerrar una sesión obliga a la persona a ingresar de nuevo en su siguiente solicitud.`}
      />

      <TablaDatos titulo="Sesiones activas" columnas={COLUMNAS} filas={sesiones.length} vacio="Sin sesiones activas">
        {sesiones.map((s) => (
          <tr key={s.sesionId}>
            <td className={celda}>
              {s.nombre}
              <span className="block text-xs text-muted-foreground">
                {s.usuario}{s.factorPendiente && " · segundo factor pendiente"}
              </span>
            </td>
            <td className={celda}>{ETIQUETA_ROL[s.rol]}</td>
            <td className={`${celda} whitespace-nowrap font-mono text-xs`}>{s.ip ?? "—"}</td>
            <td className={`${celda} max-w-64 text-xs text-muted-foreground`}>
              <span className="block truncate" title={s.userAgent ?? undefined}>{s.userAgent ?? "—"}</span>
            </td>
            <td className={`${celda} whitespace-nowrap text-xs`}>{f(s.creadaEn)}</td>
            <td className={`${celda} whitespace-nowrap text-xs`}>{f(s.ultimoUsoEn)}</td>
            <td className={celda}>
              {s.sesionId === actual.sesionId ? (
                <span className="text-muted-foreground">Esta sesión</span>
              ) : (
                <form action={cerrarSesionAccion}>
                  <input type="hidden" name="sesionId" value={s.sesionId} />
                  <button
                    type="submit"
                    aria-label={`Cerrar la sesión de ${s.nombre}`}
                    className={claseBoton("secundario", "sm")}
                  >
                    Cerrar
                  </button>
                </form>
              )}
            </td>
          </tr>
        ))}
      </TablaDatos>
    </div>
  );
}
