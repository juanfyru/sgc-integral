import type { Metadata } from "next";
import Link from "next/link";
import { obtenerListadoMaestro } from "@/db/consultas/maestro";
import { BotonImprimir } from "@/componentes/admin/maestro/BotonImprimir";
import { claseBoton } from "@/componentes/ui/Boton";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { InsigniaEstadoDocumento } from "@/componentes/ui/Insignia";
import { TablaDatos, celda, type ColumnaTabla } from "@/componentes/ui/TablaDatos";
import { obtenerMarcaSegura } from "@/db/consultas/entidad";
import { exigirPermiso } from "@/lib/paginas";
import { alcanceMaestro, puede } from "@/lib/permisos";
import { APROBACION_EN_LISTADO } from "@/lib/tramites/tipos";
import { fechaHoraLocal } from "@/lib/zona-horaria";

export const metadata: Metadata = { title: "Listado Maestro — Administración SGC" };

const COLUMNAS: readonly ColumnaTabla[] = [
  { clave: "codigo", etiqueta: "Código" },
  { clave: "titulo", etiqueta: "Título" },
  { clave: "tipo", etiqueta: "Tipo" },
  { clave: "version", etiqueta: "Ver." },
  { clave: "estado", etiqueta: "Estado" },
  { clave: "fechaAprobacion", etiqueta: "Fecha de aprobación" },
  { clave: "elaboro", etiqueta: "Elaboró" },
  { clave: "reviso", etiqueta: "Revisó" },
  { clave: "aprobo", etiqueta: "Aprobó" },
  { clave: "origenAprobacion", etiqueta: "Aprobación" },
  { clave: "propietario", etiqueta: "Proceso propietario" },
];

export default async function PaginaMaestro({
  searchParams,
}: {
  searchParams: Promise<{ incluir?: string }>;
}) {
  const sesion = await exigirPermiso("maestro.ver");
  const { incluir: incluirParam } = await searchParams;
  const incluir = alcanceMaestro(sesion, incluirParam);
  const veNoVigentes = puede(sesion, "documentos.ver_historial");
  const [filas, marca] = await Promise.all([obtenerListadoMaestro({ incluir }), obtenerMarcaSegura()]);
  const generadoEn = fechaHoraLocal(new Date());

  return (
    <div>
      <EncabezadoPagina
        superior={marca.nombre}
        titulo="Listado Maestro de Documentos"
        descripcion={`Generado: ${generadoEn} · Alcance: ${incluir === "todos" ? "Todos los documentos" : "Documentos vigentes"} · Total: ${filas.length}`}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3 print:hidden">
        {veNoVigentes && (
        <div className="flex gap-2 text-sm">
          <Link
            href="/admin/maestro"
            className={claseBoton(incluir === "vigentes" ? "primario" : "secundario")}
          >
            Solo vigentes
          </Link>
          <Link
            href="/admin/maestro?incluir=todos"
            className={claseBoton(incluir === "todos" ? "primario" : "secundario")}
          >
            Todos
          </Link>
        </div>
        )}
        {puede(sesion, "maestro.exportar") && (
          <a
            href={`/admin/maestro/excel${incluir === "todos" ? "?incluir=todos" : ""}`}
            className={claseBoton("primario")}
          >
            Descargar Excel
          </a>
        )}
        <BotonImprimir />
      </div>

      <TablaDatos titulo="Listado Maestro de Documentos" columnas={COLUMNAS} filas={filas.length} vacio="Sin documentos en el listado">
        {filas.map((f) => (
          <tr key={f.codigo}>
            <td className={`${celda} font-mono`}>{f.codigo}</td>
            <td className={celda}>{f.titulo}</td>
            <td className={celda}>{f.tipo}</td>
            <td className={celda}>{f.version ?? "—"}</td>
            <td className={celda}><InsigniaEstadoDocumento estado={f.estado} /></td>
            <td className={celda}>{f.fechaAprobacion ?? "—"}</td>
            <td className={celda}>{f.elaboro ?? "—"}</td>
            <td className={celda}>{f.reviso ?? "—"}</td>
            <td className={celda}>{f.aprobo ?? "—"}</td>
            <td className={celda}>{f.origenAprobacion ? APROBACION_EN_LISTADO[f.origenAprobacion] : "—"}</td>
            <td className={celda}>{f.propietario}</td>
          </tr>
        ))}
      </TablaDatos>
    </div>
  );
}
