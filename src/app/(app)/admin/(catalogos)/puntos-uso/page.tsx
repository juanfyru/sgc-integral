import type { Metadata } from "next";
import Link from "next/link";
import { claseBoton } from "@/componentes/ui/Boton";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { Insignia } from "@/componentes/ui/Insignia";
import { TablaDatos, celda, celdaNumerica, type ColumnaTabla } from "@/componentes/ui/TablaDatos";
import { listarPuntosUso } from "@/db/consultas/distribucion/puntos-uso";
import { exigirSesion } from "@/lib/paginas";
import { exigirCatalogo } from "../_comun";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Puntos de uso — Administración SGC" };

const COLUMNAS: readonly ColumnaTabla[] = [
  { clave: "nombre", etiqueta: "Punto de uso" },
  { clave: "procesos", etiqueta: "Procesos" },
  { clave: "responsable", etiqueta: "Responsable" },
  { clave: "copias", etiqueta: "Copias vivas", numerica: true },
  { clave: "estado", etiqueta: "Estado" },
];

/** Sin `distribucion.gestionar`, en solo lectura; el líder ve los puntos de sus procesos (`filtroPuntos`). */
export default async function PaginaPuntosUso() {
  const sesion = await exigirSesion();
  const { soloLectura } = exigirCatalogo(sesion);
  const puntos = await listarPuntosUso(sesion);
  return (
    <div>
      <EncabezadoPagina
        titulo="Puntos de uso"
        descripcion="Lugares donde se entregan copias controladas, cada uno con una persona responsable."
        acciones={
          soloLectura ? undefined : (
            <Link href="/admin/puntos-uso/nuevo" className={claseBoton("primario")}>
              Nuevo punto de uso
            </Link>
          )
        }
      />
      <TablaDatos titulo="Puntos de uso" columnas={COLUMNAS} filas={puntos.length} vacio="Aún no hay puntos de uso.">
        {puntos.map((p) => (
          <tr key={p.id} className={p.activo ? "" : "border-l-2 border-dashed border-border"}>
            <td className={celda}>
              <Link href={`/admin/puntos-uso/${p.id}`} className="font-medium text-marca underline">{p.nombre}</Link>
              {p.sede ? <span className="block text-xs text-muted-foreground">{p.sede}</span> : null}
            </td>
            <td className={celda}>{p.procesos.length > 0 ? p.procesos.map((x) => x.sigla).join(", ") : "—"}</td>
            <td className={celda}>
              {p.responsable.nombre}
              {!p.responsable.activo ? <span className="block text-xs text-muted-foreground">Persona inactiva</span> : null}
            </td>
            <td className={celdaNumerica}>{p.copiasVivas}</td>
            <td className={celda}>
              <Insignia variante={p.activo ? "bien" : "sin-dato"}>{p.activo ? "Activo" : "Inactivo"}</Insignia>
            </td>
          </tr>
        ))}
      </TablaDatos>
    </div>
  );
}
