import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { DatosDelSistema, SoportesDeLosDatos } from "@/componentes/indicadores/medicion/DatosDelSistema";
import { FormularioAnalisis } from "@/componentes/indicadores/medicion/FormularioAnalisis";
import { FormularioReporte } from "@/componentes/indicadores/medicion/FormularioReporte";
import { Soportes } from "@/componentes/indicadores/medicion/Soportes";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { Insignia } from "@/componentes/ui/Insignia";
import { datosDeAnalisis } from "@/db/consultas/indicadores/analisis";
import { soportesDeDatosDeMedicion } from "@/db/consultas/indicadores/datos-soporte";
import { medicionParaReportar } from "@/db/consultas/indicadores/lectura";
import { asegurarMedicionesConFuentes } from "@/db/consultas/indicadores/propagacion";
import { soportesDe } from "@/db/consultas/indicadores/soportes";
import { periodicidadDe } from "@/lib/indicadores/periodos";
import { soporteDeDatoEnPantalla, type SoporteDeDatoEnPantalla } from "@/lib/indicadores/soportes";
import { exigirSesion } from "@/lib/paginas";
import { puede } from "@/lib/permisos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { exigirIndicador, rutaDeIndicador } from "../../../_comun";

export const dynamic = "force-dynamic";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";
const ENLACE = `rounded-sm text-marca underline-offset-2 hover:underline ${FOCO}`;

type Params = { params: Promise<{ codigo: string; periodo: string }> };

/**
 * La medición de la ruta, una sola lectura por petición: la piden el título y la página. Antes de leer abre los periodos
 * que hayan terminado (F14-DC12). Quien no ve el indicador, no puede medirlo (ni analizar lo que nadie mide) o pide un
 * periodo sin medición recibe «no encontrado», también en el título.
 */
const medicionDeLaRuta = cache(async (segmento: string, periodo: string) => {
  const sesion = await exigirSesion();
  const indicador = await exigirIndicador(sesion, segmento);
  if (periodicidadDe(periodo) === null) notFound();
  await asegurarMedicionesConFuentes({ indicadorId: indicador.id });
  const datos = await medicionParaReportar(sesion, indicador.codigo, periodo);
  if (!datos) notFound();
  return { sesion, indicador, datos };
});

/** Lo que es la pantalla: nadie reporta un automático ni un indicador sin variables propias (anexo 14C, §3.1). */
const queEs = (datos: { automatica: boolean; mide: boolean }) => (datos.automatica ? "Calculado por el sistema" : datos.mide ? "Reportar" : "Datos del periodo");

/** El título de la pantalla, el mismo en el `h1` y en la pestaña. */
const tituloDe = (datos: { automatica: boolean; mide: boolean; nombre: string }) => `${queEs(datos)} · ${datos.nombre}`;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { codigo, periodo } = await params;
  const { datos } = await medicionDeLaRuta(codigo, periodo);
  return { title: tituloDe(datos) };
}

/**
 * Reportar una medición (spec §8.2 y §12.5, maqueta 3). Un histórico no se reporta aquí: se registra en la tabla del año
 * (spec §8.8). Debajo van los soportes y, con resultado, quien puede analizar tiene el análisis.
 * La de un automático (anexo 14B, §4) es de solo lectura y la abre quien puede analizarlo: nadie digita sus datos ni sube
 * soportes; dice cuándo se tomaron o se tomarán, con los datos del sistema muestra sus valores y, si el resultado lo pide, el
 * análisis; a quien además administra, «Volver a calcular» una foto de flujo (§5.4). La de un indicador sin variables
 * propias (anexo 14C, §3.1) también: muestra lo que llegó de sus datos y de sus componentes, y lo que falta. En un mixto,
 * quien mide digita lo suyo y lo ajeno aparece fijo (maqueta 14). Un desagregado se reporta por su rejilla por categoría
 * (anexo 14C, §5.4, maquetas 9 y 10), y quien administra puede actualizar su lista de categorías.
 *
 * Los soportes de un dato compartido que usa el periodo (anexo 14C, §4.6) salen junto a su variable fija, para quien los ve
 * (`soportesDeDatosDeMedicion`: quien ve el dato o los soportes de un indicador que lo usa); un indicador sin variables
 * propias, cuya evidencia son esos soportes (§3.1), y un desagregado, que no tiene variables fijas a la vista, los tienen
 * además en «Soportes».
 */
export default async function PaginaReportar({ params }: Params) {
  const { codigo: segmento, periodo } = await params;
  const { sesion, indicador, datos } = await medicionDeLaRuta(segmento, periodo);
  const volver = rutaDeIndicador(indicador.codigo);
  const analisis = datos.estado !== "cerrada" && !datos.historica ? await datosDeAnalisis(sesion, datos.medicionId) : null;
  // Quien puede medir ve los soportes del indicador (spec §6.4); la lista se lee solo para quien los ve.
  const soportes = (await soportesDe(sesion, datos.medicionId)) ?? [];
  // Los de los datos compartidos que usa el periodo, por la letra de su variable; con el periodo del dato si es más fino.
  const zona = zonaHoraria();
  const soportesDeDatos: Record<string, SoporteDeDatoEnPantalla[]> = Object.fromEntries(
    (await soportesDeDatosDeMedicion(sesion, datos.medicionId)).map((v) => [v.letra, v.soportes.map((s) => soporteDeDatoEnPantalla(s, datos.periodo, zona))]),
  );
  const conLosDeDatos = Object.keys(soportesDeDatos).length > 0 && (!datos.mide || datos.categorias !== null);
  const plazo = datos.historica ? "Registro histórico" : `Plazo hasta el ${datos.vence}${datos.vencida ? " (vencido)" : ""}`;
  // Nadie reporta lo que nadie mide: ni el título ni la miga lo dicen.
  const miga = datos.mide ? "Reportar: " : `${queEs(datos)} · `;
  // Lo que nadie digita se lee; los históricos de una ficha manual se registran en la tabla del año.
  const deSoloLectura = datos.automatica || (!datos.mide && !datos.historica);
  const cerrada = (
    <p className="rounded-lg border border-l-4 border-border border-l-mod-indicadores bg-muted px-4 py-3 text-sm">
      La medición está cerrada: pida al Administrador del SGC que la reabra.
    </p>
  );

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <EncabezadoPagina
        migas={[
          { nombre: "Indicadores", href: "/indicadores" },
          { nombre: indicador.codigo, href: volver },
          { nombre: `${miga}${datos.etiqueta.toLowerCase()}` },
        ]}
        codigo={datos.codigo}
        insignias={datos.historica ? <Insignia variante="neutra">Histórico</Insignia> : undefined}
        titulo={tituloDe(datos)}
        descripcion={`${datos.etiqueta} · ${plazo}`}
      />
      {datos.sinMedidor ? (
        <p className="rounded-lg border border-l-4 border-border border-l-estado-atencion bg-card px-4 py-3 text-sm">
          Sin responsable: nadie más puede medir este indicador. El reporte queda marcado; designe a alguien que lo mida.
        </p>
      ) : null}
      {deSoloLectura ? (
        <>
          {datos.estado === "cerrada" ? cerrada : null}
          <DatosDelSistema datos={datos} administra={puede(sesion, "indicadores.administrar")} />
        </>
      ) : datos.estado === "cerrada" ? (
        cerrada
      ) : datos.historica ? (
        <p className="rounded-lg border border-l-4 border-border border-l-mod-indicadores bg-muted px-4 py-3 text-sm">
          {"Ese periodo es histórico: se registra en la tabla del año. "}
          <Link href={`${volver}?vista=resultados&anio=${datos.periodo.slice(0, 4)}&historicos=editar`} className={ENLACE}>
            Registrar los históricos
          </Link>
        </p>
      ) : (
        <FormularioReporte datos={datos} volver={volver} administra={puede(sesion, "indicadores.administrar")} soportesDeDatos={soportesDeDatos} />
      )}
      {/* Lo que nadie mide no lleva soportes propios (los suyos salen solo si quedó alguno, sin subir ni quitar): su evidencia
          son los de sus datos compartidos. */}
      {!datos.mide && soportes.length === 0 && !conLosDeDatos ? null : (
        <section aria-labelledby="reporte-soportes" className="flex min-w-0 flex-col gap-3">
          <h2 id="reporte-soportes" className="text-lg font-semibold">
            Soportes
          </h2>
          {datos.mide || soportes.length > 0 ? (
            <Soportes
              medicionId={datos.medicionId}
              codigo={datos.codigo}
              soportes={soportes}
              editable={datos.mide && datos.estado !== "cerrada"}
              debeSoporte={datos.debeSoporte}
            />
          ) : null}
          {conLosDeDatos ? <SoportesDeLosDatos variables={datos.variables} soportes={soportesDeDatos} sinPropias={!datos.mide} /> : null}
        </section>
      )}
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
