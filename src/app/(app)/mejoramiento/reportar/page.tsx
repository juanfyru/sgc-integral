import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { enviarReporteAccion } from "@/app/acciones-mejoramiento";
import { ArchivosDe } from "@/componentes/mejoramiento/ArchivosDe";
import { EtiquetaDelReporte } from "@/componentes/mejoramiento/reportes/MisReportes";
import { FormularioReporte } from "@/componentes/mejoramiento/reportes/FormularioReporte";
import { claseBoton } from "@/componentes/ui/Boton";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { obtenerSql } from "@/db/cliente";
import { archivosDe, archivosQuitables, autorizarSubida, MAXIMO_POR_REPORTE } from "@/db/consultas/mejoramiento/archivos";
import { contextoDeMejora } from "@/db/consultas/mejoramiento/config";
import { procesosActivos } from "@/db/consultas/mejoramiento/opciones";
import { enlaceDelReporte } from "@/db/consultas/mejoramiento/prellenado";
import { leerReporte } from "@/db/consultas/mejoramiento/reportes";
import { fechaDeDia } from "@/lib/mejoramiento/formato";
import { PARAMETROS_DEL_REPORTE, RUTA_MIS_REPORTES, rutaDeReportar, type SobreQueSeReporta } from "@/lib/mejoramiento/reportes";
import { AVISO_SIN_PACIENTES } from "@/lib/mejoramiento/textos";
import { exigirSesion } from "@/lib/paginas";
import { fechaEnZona } from "@/lib/tramites/plazos";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reportar" };

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";
const MIGAS = [
  { nombre: "Mejoramiento", href: "/mejoramiento" },
  { nombre: "Mis reportes", href: RUTA_MIS_REPORTES },
  { nombre: "Reportar" },
];

/**
 * «Reportar» (spec 15 §7.3 y §16.1), para toda sesión: qué vio, cuándo, en qué proceso y la referencia del caso, con el aviso de
 * los datos de pacientes. Enviado, la acción trae aquí con `?reporte=<id>`: el reporte propio, con su etiqueta y hasta tres
 * archivos de evidencia mientras siga «Recibido». Un `reporte` que no es de quien mira se ignora sin decir por qué.
 *
 * Desde la sección «Mejoramiento» de otra página (Fase 15B, anexo §10.2) llega con `?documento=` o `?indicador=` (su código) o
 * `?proceso=` (su slug): `enlaceDelReporte` lo resuelve con la regla de visibilidad de cada módulo e ignora sin decir por qué lo que la
 * persona no ve; `enviarReporte` lo vuelve a mirar dentro de su transacción.
 */
export default async function PaginaReportar({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sesion = await exigirSesion();
  const parametros = await searchParams;
  const pedido = parametros.reporte;
  const reporteId = typeof pedido === "string" && /^\d{1,15}$/.test(pedido) ? Number(pedido) : null;
  const leido = reporteId === null ? null : await leerReporte(sesion, reporteId);
  const sql = obtenerSql();
  const ahora = new Date();
  const contexto = await contextoDeMejora(sql, ahora);

  if (leido?.suyo) {
    const dueno = { contexto: "mejora_reporte", contextoId: leido.id } as const;
    const { archivos } = await archivosDe(sql, sesion, dueno);
    const quitables = await archivosQuitables(sql, sesion, archivos, dueno);
    const sube = (await autorizarSubida(sesion, { contexto: "mejora_reporte", id: leido.id })).ok;
    return (
      <div className="flex min-w-0 flex-col gap-6">
        <EncabezadoPagina
          migas={MIGAS}
          titulo={leido.etiqueta === "Recibido" ? "Su reporte se envió" : "Su reporte"}
          descripcion={
            leido.etiqueta === "Recibido"
              ? `El Administrador del SGC lo clasifica en ${contexto.config.plazos.clasificar} días hábiles y le avisa cuando lo haga.`
              : "Ya se clasificó: ya no admite archivos. En «Mis reportes» ve en qué va."
          }
        />
        <section aria-labelledby="reporte-enviado" className="flex min-w-0 max-w-2xl flex-col gap-3 rounded-lg border border-border bg-card p-4">
          <h2 id="reporte-enviado" className="flex items-center gap-2 font-display text-base font-semibold">
            <CheckCircle2 aria-hidden="true" className="size-5 text-estado-bien-texto" />
            Lo que reportó
          </h2>
          <EtiquetaDelReporte etiqueta={leido.etiqueta} />
          <p className="whitespace-pre-line break-words text-sm">{leido.descripcion}</p>
          <p className="text-xs text-muted-foreground">
            {[`Lo vio el ${fechaDeDia(leido.vistoEn)}`, leido.proceso ?? "Sin proceso", leido.referenciaCaso ? `Referencia ${leido.referenciaCaso}` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </section>
        <section aria-labelledby="reporte-archivos" className="flex min-w-0 max-w-2xl flex-col gap-3 rounded-lg border border-border bg-card p-4">
          <h2 id="reporte-archivos" className="font-display text-base font-semibold">
            Evidencia (opcional)
          </h2>
          <p className="text-sm text-muted-foreground">
            {`Hasta ${MAXIMO_POR_REPORTE} archivos: una foto o un documento de lo que vio. ${AVISO_SIN_PACIENTES}`}
          </p>
          <ArchivosDe
            archivos={archivos}
            quitables={quitables}
            direccionDeSubida={sube ? `/api/mejoramiento/reportes/${leido.id}/archivos` : null}
            nombre="Zona de carga de la evidencia del reporte"
            vacio="Sin archivos adjuntos."
          />
        </section>
        <div className="flex flex-wrap gap-2">
          <Link href={RUTA_MIS_REPORTES} className={`${claseBoton("primario")} ${FOCO}`}>
            Ver mis reportes
          </Link>
          <Link href={rutaDeReportar()} className={`${claseBoton("secundario")} ${FOCO}`}>
            Reportar otra cosa
          </Link>
        </div>
      </div>
    );
  }

  // Un parámetro repetido no es ninguno.
  const sobre: SobreQueSeReporta = Object.fromEntries(
    PARAMETROS_DEL_REPORTE.flatMap((k) => (typeof parametros[k] === "string" ? [[k, parametros[k]]] : [])),
  );
  const [procesos, enlace] = await Promise.all([procesosActivos({ sql }), enlaceDelReporte(sesion, sobre, { sql })]);
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <EncabezadoPagina
        migas={MIGAS}
        titulo="Reportar una posible no conformidad"
        descripcion="Cuente lo que vio. El Administrador del SGC lo revisa y le avisa en qué terminó; su nombre no se muestra a los líderes de proceso."
      />
      <FormularioReporte
        accion={enviarReporteAccion}
        procesos={procesos}
        hoy={fechaEnZona(ahora, contexto.zona)}
        enlace={enlace}
        procesoInicial={enlace.procesoId}
      />
    </div>
  );
}
