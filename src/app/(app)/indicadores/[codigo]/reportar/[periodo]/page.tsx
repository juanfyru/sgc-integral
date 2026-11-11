import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FormularioAnalisis } from "@/componentes/indicadores/medicion/FormularioAnalisis";
import { FormularioReporte } from "@/componentes/indicadores/medicion/FormularioReporte";
import { Soportes } from "@/componentes/indicadores/medicion/Soportes";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { Insignia } from "@/componentes/ui/Insignia";
import { datosDeAnalisis } from "@/db/consultas/indicadores/analisis";
import { asegurarMediciones, medicionParaReportar } from "@/db/consultas/indicadores/mediciones";
import { soportesDe } from "@/db/consultas/indicadores/soportes";
import { periodicidadDe } from "@/lib/indicadores/periodos";
import { exigirSesion } from "@/lib/paginas";
import { exigirIndicador, rutaDeIndicador } from "../../../_comun";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reportar una medición" };

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";
const ENLACE = `rounded-sm text-marca underline-offset-2 hover:underline ${FOCO}`;

/**
 * Reportar una medición (spec §8.2 y §12.5, maqueta 3). Antes de leer abre los periodos que hayan terminado (F14-DC12).
 * Quien no ve el indicador, no puede medirlo o pide un periodo sin medición recibe «no encontrado». Un histórico no se
 * reporta aquí: se registra en la tabla del año (spec §8.8). Debajo van los soportes y, con resultado, quien puede analizar tiene el análisis.
 */
export default async function PaginaReportar({ params }: { params: Promise<{ codigo: string; periodo: string }> }) {
  const sesion = await exigirSesion();
  const { codigo: segmento, periodo } = await params;
  const indicador = await exigirIndicador(sesion, segmento);
  if (periodicidadDe(periodo) === null) notFound();
  await asegurarMediciones({ indicadorId: indicador.id });
  const datos = await medicionParaReportar(sesion, indicador.codigo, periodo);
  if (!datos) notFound();
  const volver = rutaDeIndicador(indicador.codigo);
  const analisis = datos.estado !== "cerrada" && !datos.historica ? await datosDeAnalisis(sesion, datos.medicionId) : null;
  // Quien puede medir ve los soportes del indicador (spec §6.4); la lista se lee solo para quien los ve.
  const soportes = (await soportesDe(sesion, datos.medicionId)) ?? [];
  const plazo = datos.historica ? "Registro histórico" : `Plazo hasta el ${datos.vence}${datos.vencida ? " (vencido)" : ""}`;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <EncabezadoPagina
        migas={[
          { nombre: "Indicadores", href: "/indicadores" },
          { nombre: indicador.codigo, href: volver },
          { nombre: `Reportar: ${datos.etiqueta.toLowerCase()}` },
        ]}
        codigo={datos.codigo}
        insignias={datos.historica ? <Insignia variante="neutra">Histórico</Insignia> : undefined}
        titulo={`Reportar · ${datos.nombre}`}
        descripcion={`${datos.etiqueta} · ${plazo}`}
      />
      {datos.sinMedidor ? (
        <p className="rounded-lg border border-l-4 border-border border-l-estado-atencion bg-card px-4 py-3 text-sm">
          Sin responsable: nadie más puede medir este indicador. El reporte queda marcado; designe a alguien que lo mida.
        </p>
      ) : null}
      {datos.estado === "cerrada" ? (
        <p className="rounded-lg border border-l-4 border-border border-l-mod-indicadores bg-muted px-4 py-3 text-sm">
          La medición está cerrada: pida al Administrador del SGC que la reabra.
        </p>
      ) : datos.historica ? (
        <p className="rounded-lg border border-l-4 border-border border-l-mod-indicadores bg-muted px-4 py-3 text-sm">
          {"Ese periodo es histórico: se registra en la tabla del año. "}
          <Link href={`${volver}?vista=resultados&anio=${datos.periodo.slice(0, 4)}&historicos=editar`} className={ENLACE}>
            Registrar los históricos
          </Link>
        </p>
      ) : (
        <FormularioReporte datos={datos} volver={volver} />
      )}
      <section aria-labelledby="reporte-soportes" className="flex min-w-0 flex-col gap-3">
        <h2 id="reporte-soportes" className="text-lg font-semibold">
          Soportes
        </h2>
        <Soportes
          medicionId={datos.medicionId}
          codigo={datos.codigo}
          soportes={soportes}
          editable={datos.estado !== "cerrada"}
          obligatorio={datos.soporteObligatorio && !datos.historica}
        />
      </section>
      {analisis ? (
        <section aria-labelledby="reporte-analisis" className="flex min-w-0 flex-col gap-3">
          <h2 id="reporte-analisis" className="text-lg font-semibold">
            Análisis
          </h2>
          <FormularioAnalisis datos={analisis} volver={volver} />
        </section>
      ) : null}
    </div>
  );
}
