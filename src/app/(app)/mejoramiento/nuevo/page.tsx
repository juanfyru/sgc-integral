import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cargarHallazgoAccion, registrarHallazgoAccion } from "@/app/acciones-mejoramiento";
import { FormularioCarga } from "@/componentes/mejoramiento/FormularioCarga";
import { FormularioHallazgo } from "@/componentes/mejoramiento/FormularioHallazgo";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { obtenerSql } from "@/db/cliente";
import { contextoDeMejora } from "@/db/consultas/mejoramiento/config";
import { indicadoresElegibles } from "@/db/consultas/mejoramiento/indicador-de-eficacia";
import {
  documentosVigentesVisibles,
  normasQueRigen,
  opcionesDeLaCarga,
  procesosDelAlcance,
  usuariosActivos,
} from "@/db/consultas/mejoramiento/opciones";
import { hallazgoDeOrigen } from "@/db/consultas/mejoramiento/registro";
import { leerReporte } from "@/db/consultas/mejoramiento/reportes";
import { exigirSesion } from "@/lib/paginas";
import { puede } from "@/lib/permisos";
import { fechaEnZona } from "@/lib/tramites/plazos";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Registrar hallazgo" };

const PESTANA = "rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/** «Hallazgo nuevo» o «Ya está en curso» (spec §15): solo quien carga (`mejora.gestionar`) ve las dos. */
function ComoSeRegistra({ enCurso }: { enCurso: boolean }) {
  const opciones = [
    { href: "/mejoramiento/nuevo", texto: "Hallazgo nuevo", actual: !enCurso },
    { href: "/mejoramiento/nuevo?modo=en-curso", texto: "Ya está en curso", actual: enCurso },
  ];
  return (
    <nav aria-label="Cómo se registra" className="flex flex-wrap gap-2">
      {opciones.map((o) => (
        <Link
          key={o.href}
          href={o.href}
          aria-current={o.actual ? "page" : undefined}
          className={`${PESTANA} ${o.actual ? "bg-marca-relleno text-white" : "border border-border text-foreground hover:bg-muted"}`}
        >
          {o.texto}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Registrar un hallazgo (spec 15 §7.1 y §16.2, maqueta 3): solo quien tiene `mejora.registrar`; para los demás no existe. Desde
 * la evaluación de otro (`?derivado=<id>`, spec §11.4) llega con el proceso de ese y el enlace puestos, si quien registra lo ve;
 * si no lo ve o no existe, el valor se ignora sin decir por qué (lo vuelve a comprobar `registrarHallazgo`). Desde un reporte
 * de funcionario (`?reporte=<id>`, spec §7.3), solo para quien clasifica (`mejora.gestionar`) y mientras siga «Recibido»: llega
 * con lo que se vio, el día, el proceso y la referencia copiados, y el reporte viaja oculto (lo vuelve a comprobar
 * `registrarHallazgo` dentro de su transacción). Si no, se ignora igual. Con `?modo=en-curso`, quien gestiona carga un hallazgo
 * que se tramitó en papel con su plan ya aprobado (spec §15, `FormularioCarga`); para los demás ese modo no existe.
 */
export default async function PaginaNuevoHallazgo({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sesion = await exigirSesion();
  if (!puede(sesion, "mejora.registrar")) notFound();
  const ahora = new Date();
  const parametros = await searchParams;
  const carga = puede(sesion, "mejora.gestionar");
  if (parametros.modo === "en-curso") {
    if (!carga) notFound();
    const sql = obtenerSql();
    const [procesos, normas, documentos, usuarios, indicadores, enlaces, contexto] = await Promise.all([
      procesosDelAlcance(sesion),
      normasQueRigen(),
      documentosVigentesVisibles(sesion),
      usuariosActivos(),
      indicadoresElegibles(sql, sesion),
      opcionesDeLaCarga(sesion, { sql }),
      contextoDeMejora(sql, ahora),
    ]);
    return (
      <div className="flex min-w-0 flex-col gap-6">
        <EncabezadoPagina
          migas={[{ nombre: "Mejoramiento", href: "/mejoramiento" }, { nombre: "Registrar hallazgo" }]}
          titulo="Registrar un hallazgo ya en curso"
          descripcion="El que se tramitó en papel y ya tiene su plan aprobado: queda «Cargado», con sus fechas reales. Uno sin plan aprobado se registra como hallazgo nuevo."
        />
        <ComoSeRegistra enCurso />
        <FormularioCarga
          accion={cargarHallazgoAccion}
          procesos={procesos}
          normas={normas}
          documentos={documentos}
          usuarios={usuarios}
          indicadores={indicadores}
          enlaces={enlaces}
          hoy={fechaEnZona(ahora, contexto.zona)}
        />
      </div>
    );
  }
  const idDe = (v: string | string[] | undefined) => (typeof v === "string" && /^\d{1,15}$/.test(v) ? Number(v) : null);
  const derivadoId = idDe(parametros.derivado);
  const reporteId = carga ? idDe(parametros.reporte) : null;
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
      {carga && !origen && !reporte ? <ComoSeRegistra enCurso={false} /> : null}
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
