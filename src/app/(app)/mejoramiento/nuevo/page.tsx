import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { registrarHallazgoAccion } from "@/app/acciones-mejoramiento";
import { FormularioHallazgo } from "@/componentes/mejoramiento/FormularioHallazgo";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { obtenerSql } from "@/db/cliente";
import { contextoDeMejora } from "@/db/consultas/mejoramiento/config";
import { documentosVigentesVisibles, normasQueRigen, procesosDelAlcance } from "@/db/consultas/mejoramiento/opciones";
import { hallazgoDeOrigen } from "@/db/consultas/mejoramiento/registro";
import { leerReporte } from "@/db/consultas/mejoramiento/reportes";
import { exigirSesion } from "@/lib/paginas";
import { puede } from "@/lib/permisos";
import { fechaEnZona } from "@/lib/tramites/plazos";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Registrar hallazgo" };

/**
 * Registrar un hallazgo (spec 15 §7.1 y §16.2, maqueta 3): solo quien tiene `mejora.registrar`; para los demás no existe. Desde
 * la evaluación de otro (`?derivado=<id>`, spec §11.4) llega con el proceso de ese y el enlace puestos, si quien registra lo ve;
 * si no lo ve o no existe, el valor se ignora sin decir por qué (lo vuelve a comprobar `registrarHallazgo`). Desde un reporte
 * de funcionario (`?reporte=<id>`, spec §7.3), solo para quien clasifica (`mejora.gestionar`) y mientras siga «Recibido»: llega
 * con lo que se vio, el día, el proceso y la referencia copiados, y el reporte viaja oculto (lo vuelve a comprobar
 * `registrarHallazgo` dentro de su transacción). Si no, se ignora igual.
 */
export default async function PaginaNuevoHallazgo({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sesion = await exigirSesion();
  if (!puede(sesion, "mejora.registrar")) notFound();
  const ahora = new Date();
  const parametros = await searchParams;
  const idDe = (v: string | string[] | undefined) => (typeof v === "string" && /^\d{1,15}$/.test(v) ? Number(v) : null);
  const derivadoId = idDe(parametros.derivado);
  const reporteId = puede(sesion, "mejora.gestionar") ? idDe(parametros.reporte) : null;
  const [procesos, normas, documentos, contexto, origen, leido] = await Promise.all([
    procesosDelAlcance(sesion),
    normasQueRigen(),
    documentosVigentesVisibles(sesion),
    contextoDeMejora(obtenerSql(), ahora),
    derivadoId === null ? Promise.resolve(null) : hallazgoDeOrigen(sesion, derivadoId),
    reporteId === null ? Promise.resolve(null) : leerReporte(sesion, reporteId),
  ]);
  const reporte = leido?.control?.estado === "recibido" ? { ...leido, reportadoPor: leido.control.reportadoPor } : null;
  const procesoInicial = reporte?.procesoId ?? origen?.procesoId ?? null;
  const valores: Record<string, string> = {
    ...(procesoInicial !== null && procesos.some((p) => p.id === procesoInicial) ? { procesoId: String(procesoInicial) } : {}),
    ...(reporte
      ? {
          descripcion: reporte.descripcion,
          detectadoEn: reporte.vistoEn,
          ...(reporte.referenciaCaso ? { referenciaCaso: reporte.referenciaCaso } : {}),
        }
      : {}),
  };

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <EncabezadoPagina
        migas={[{ nombre: "Mejoramiento", href: "/mejoramiento" }, { nombre: "Registrar hallazgo" }]}
        titulo="Registrar un hallazgo"
        descripcion="Una no conformidad, una observación o una oportunidad de mejora. Al registrarlo, el sistema avisa a quien tiene el turno."
      />
      <FormularioHallazgo
        accion={registrarHallazgoAccion}
        procesos={procesos}
        normas={normas}
        documentos={documentos}
        hoy={fechaEnZona(ahora, contexto.zona)}
        diasParaAceptar={contexto.config.plazos.aceptar}
        valores={Object.keys(valores).length > 0 ? valores : undefined}
        derivado={origen ? { id: origen.id, codigo: origen.codigo, titulo: origen.titulo } : undefined}
        reporte={reporte ? { id: reporte.id, reportadoPor: reporte.reportadoPor, vistoEn: reporte.vistoEn } : undefined}
      />
    </div>
  );
}
