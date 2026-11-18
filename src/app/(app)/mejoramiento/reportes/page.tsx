import type { Metadata } from "next";
import Link from "next/link";
import { Megaphone, Plus } from "lucide-react";
import { descartarReporteAccion, sumarReporteAccion } from "@/app/acciones-mejoramiento";
import { PestanasMejoramiento, pestanasVisibles } from "@/componentes/mejoramiento/PestanasMejoramiento";
import { MisReportes } from "@/componentes/mejoramiento/reportes/MisReportes";
import { ReportesRecibidos, type FilaDeReporteRecibido } from "@/componentes/mejoramiento/reportes/ReportesRecibidos";
import { claseBoton } from "@/componentes/ui/Boton";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { obtenerSql } from "@/db/cliente";
import { archivosDe, archivosQuitables } from "@/db/consultas/mejoramiento/archivos";
import { veAlgunHallazgo } from "@/db/consultas/mejoramiento/lectura";
import { abiertosParecidosAlReporte } from "@/db/consultas/mejoramiento/parecidos";
import { contarReportesPorClasificar, misReportes, reportesRecibidos } from "@/db/consultas/mejoramiento/reportes";
import { rutaDeReportar } from "@/lib/mejoramiento/reportes";
import { exigirSesion } from "@/lib/paginas";
import { puede } from "@/lib/permisos";
import { cuenta } from "@/lib/plural";
import { zonaHoraria } from "@/lib/zona-horaria";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reportes" };

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/**
 * Los reportes de funcionarios (spec 15 §7.3 y §16.1), para toda sesión. «Mis reportes» (por omisión): los que envió la persona,
 * con su etiqueta y nada del hallazgo. Con `?vista=recibidos`, a los roles de control (`mejora.ver_todo`), «Reportes recibidos»:
 * todos, con quién reportó, y al Admin SGC su clasificación; a los demás ese valor se ignora y ven «Mis reportes». La lista de
 * hallazgos trae aquí a quien no ve ninguno ni tiene actividades.
 */
export default async function PaginaReportes({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sesion = await exigirSesion();
  const recibidos = (await searchParams).vista === "recibidos" && puede(sesion, "mejora.ver_todo");
  const sql = obtenerSql();
  const ahora = new Date();
  const zona = zonaHoraria();
  const [veHallazgos, porClasificar] = await Promise.all([veAlgunHallazgo(sesion), contarReportesPorClasificar(sesion)]);
  const gestiona = puede(sesion, "mejora.gestionar");

  let contenido: React.ReactNode;
  let descripcion: string;
  if (recibidos) {
    const lista = await reportesRecibidos(sesion);
    const filas: FilaDeReporteRecibido[] = [];
    for (const reporte of lista) {
      const dueno = { contexto: "mejora_reporte", contextoId: reporte.id } as const;
      const archivos = reporte.archivos > 0 ? await archivosDe(sql, sesion, dueno) : [];
      const clasifica = gestiona && reporte.estado === "recibido";
      filas.push({
        reporte,
        archivos,
        quitables: clasifica && archivos.length > 0 ? await archivosQuitables(sql, sesion, archivos, dueno) : [],
        parecidos: clasifica
          ? (await abiertosParecidosAlReporte(sql, { procesoId: reporte.procesoId, texto: reporte.descripcion, ahora })).map((p) => ({
              id: p.id,
              codigo: p.codigo,
              titulo: p.titulo,
              etiqueta: p.etiqueta,
              proceso: p.proceso,
            }))
          : null,
      });
    }
    descripcion =
      porClasificar > 0
        ? `${cuenta(porClasificar, "reporte espera", "reportes esperan")} su clasificación: convertirlo en hallazgo, añadirlo a uno abierto o descartarlo.`
        : "Ningún reporte espera su clasificación.";
    contenido = (
      <ReportesRecibidos filas={filas} gestiona={gestiona} zona={zona} ahora={ahora} sumar={sumarReporteAccion} descartar={descartarReporteAccion} />
    );
  } else {
    const mios = await misReportes(sesion);
    const reportes = [];
    for (const reporte of mios) {
      reportes.push({
        reporte,
        archivos: reporte.archivos > 0 ? await archivosDe(sql, sesion, { contexto: "mejora_reporte", contextoId: reporte.id }) : [],
      });
    }
    descripcion = "Lo que usted reportó y en qué va. El Administrador del SGC lo clasifica y le avisa cuando lo hace y cuando se cierra.";
    contenido = <MisReportes reportes={reportes} zona={zona} />;
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <EncabezadoPagina
        migas={[{ nombre: "Mejoramiento", href: "/mejoramiento" }, { nombre: recibidos ? "Reportes recibidos" : "Mis reportes" }]}
        titulo={recibidos ? "Reportes recibidos" : "Mis reportes"}
        descripcion={descripcion}
        acciones={
          <>
            <Link href={rutaDeReportar()} className={`${claseBoton("primario")} ${FOCO}`}>
              <Megaphone aria-hidden="true" className="size-4" />
              Reportar
            </Link>
            {puede(sesion, "mejora.registrar") && !veHallazgos ? (
              <Link href="/mejoramiento/nuevo" className={`${claseBoton("secundario")} ${FOCO}`}>
                <Plus aria-hidden="true" className="size-4" />
                Registrar hallazgo
              </Link>
            ) : null}
          </>
        }
      />
      <PestanasMejoramiento
        activa={recibidos ? "reportes" : "mis-reportes"}
        visibles={pestanasVisibles(sesion, { veHallazgos })}
        numeros={{ reportes: porClasificar }}
      />
      {contenido}
    </div>
  );
}
