import type { Metadata } from "next";
import Link from "next/link";
import { claseBoton } from "@/componentes/ui/Boton";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { Insignia } from "@/componentes/ui/Insignia";
import { TablaDatos, celda, celdaNumerica, type ColumnaTabla } from "@/componentes/ui/TablaDatos";
import { listarListas, resumenMiembros } from "@/db/consultas/distribucion/listas";
import { exigirSesion } from "@/lib/paginas";
import { exigirCatalogo } from "../_comun";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Listas de distribución — Administración SGC" };

const COLUMNAS: readonly ColumnaTabla[] = [
  { clave: "nombre", etiqueta: "Lista" },
  { clave: "miembros", etiqueta: "Miembros" },
  { clave: "personas", etiqueta: "Personas que resuelve", numerica: true },
  { clave: "estado", etiqueta: "Estado" },
];

/** Las listas son de la entidad: quien abre el catálogo las ve todas; sin `distribucion.gestionar`, en solo lectura. */
export default async function PaginaListasDistribucion() {
  const sesion = await exigirSesion();
  const { soloLectura } = exigirCatalogo(sesion);
  const listas = await listarListas();
  return (
    <div>
      <EncabezadoPagina
        titulo="Listas de distribución"
        descripcion="Grupos de personas a las que llegan los documentos, además de quienes pertenecen a sus procesos."
        acciones={
          soloLectura ? undefined : (
            <Link href="/admin/listas-distribucion/nueva" className={claseBoton("primario")}>
              Nueva lista
            </Link>
          )
        }
      />
      <TablaDatos titulo="Listas de distribución" columnas={COLUMNAS} filas={listas.length} vacio="Aún no hay listas de distribución.">
        {listas.map((l) => (
          <tr key={l.id} className={l.activa ? "" : "border-l-2 border-dashed border-border"}>
            <td className={celda}>
              <Link href={`/admin/listas-distribucion/${l.id}`} className="font-medium text-marca underline">{l.nombre}</Link>
              {l.descripcion ? <span className="block text-xs text-muted-foreground">{l.descripcion}</span> : null}
            </td>
            <td className={celda}>{resumenMiembros(l.miembros)}</td>
            <td className={celdaNumerica}>{l.personas}</td>
            <td className={celda}>
              <Insignia variante={l.activa ? "bien" : "sin-dato"}>{l.activa ? "Activa" : "Inactiva"}</Insignia>
            </td>
          </tr>
        ))}
      </TablaDatos>
    </div>
  );
}
