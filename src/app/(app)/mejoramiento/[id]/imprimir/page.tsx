import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BotonImprimir } from "@/componentes/indicadores/BotonImprimir";
import { CincoPorquesImpreso } from "@/componentes/mejoramiento/impresos/CincoPorquesImpreso";
import { IshikawaImpreso } from "@/componentes/mejoramiento/impresos/IshikawaImpreso";
import { OtroMetodoImpreso } from "@/componentes/mejoramiento/impresos/OtroMetodoImpreso";
import { RegistroImpreso } from "@/componentes/mejoramiento/impresos/RegistroImpreso";
import { claseBoton } from "@/componentes/ui/Boton";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { obtenerSql } from "@/db/cliente";
import { firmasDeHallazgo } from "@/db/consultas/mejoramiento/aprobacion";
import { archivosDe } from "@/db/consultas/mejoramiento/archivos";
import { obtenerMarcaSegura } from "@/db/consultas/entidad";
import { encabezadoDeFormato, lideresDelProceso, seguimientosDelHallazgo } from "@/db/consultas/mejoramiento/formatos";
import { ETIQUETA_METODO_ANALISIS } from "@/lib/mejoramiento/textos";
import type { MetodoAnalisis } from "@/lib/mejoramiento/tipos";
import { exigirSesion } from "@/lib/paginas";
import { zonaHoraria } from "@/lib/zona-horaria";
import { exigirHallazgo, indicadorParaQuienLee, rutaDeHallazgo, rutaDeImprimir } from "../../_comun";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Impreso del hallazgo" };

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/**
 * Los impresos de un hallazgo (spec 15 §16.4): por omisión el registro completo (SGC-FO-AC-01) y, con `?analisis=<id>`, ese análisis
 * en su formato (5 porqués, Ishikawa u otro método, este sin código de formato), para imprimir con la hoja de estilos del navegador.
 * Lo imprime quien ve el hallazgo completo; para el responsable de una actividad, y ante un análisis que no es de este hallazgo (o
 * un Pareto, de la 15C), «no encontrado». El encabezado de la página y sus botones no salen en el papel. Imprimir no se audita, como
 * la ficha impresa de un indicador.
 */
export default async function PaginaImprimirHallazgo({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sesion = await exigirSesion();
  const { id } = await params;
  const sp = await searchParams;
  // Una sola hora para la hoja: lo que se lee y el pie «Impreso el …».
  const ahora = new Date();
  const h = await exigirHallazgo(sesion, id, { ahora });
  if (h.ve !== "completo") notFound();

  const pedido = sp.analisis;
  if (pedido !== undefined && (typeof pedido !== "string" || !/^\d{1,15}$/.test(pedido))) notFound();
  const ronda = pedido === undefined ? null : (h.rondas.find((r) => r.analisis.some((a) => a.id === Number(pedido))) ?? null);
  const analisis = ronda?.analisis.find((a) => a.id === Number(pedido)) ?? null;
  if (pedido !== undefined && (!ronda || !analisis || analisis.metodo === "pareto")) notFound();

  const sql = obtenerSql();
  const zona = zonaHoraria();
  const cual = !analisis ? "registro" : analisis.metodo === "cinco_porques" ? "porques" : analisis.metodo === "ishikawa" ? "ishikawa" : null;
  const [marca, formato, firmas, lideres] = await Promise.all([
    obtenerMarcaSegura(),
    cual ? encabezadoDeFormato(sql, cual) : Promise.resolve(null),
    firmasDeHallazgo(sql, h.id),
    lideresDelProceso(sql, h.procesoId),
  ]);
  const comunes = {
    entidad: marca.nombre,
    logo: marca.logo ? `/marca/logo?v=${marca.logo.version}` : null,
    firmas,
    lideres,
    impresoEn: ahora,
    impresoPor: sesion.nombre,
    zona,
  };
  const metodo = (m: string) => ETIQUETA_METODO_ANALISIS[m as MetodoAnalisis] ?? m;
  // Los formatos de los análisis del hallazgo, para imprimirlos desde aquí (el Pareto es de la 15C).
  const otros = h.rondas.flatMap((r) =>
    r.analisis.filter((a) => a.metodo !== "pareto" && a.id !== analisis?.id).map((a) => ({ id: a.id, texto: `${metodo(a.metodo)} · ronda ${r.numero}` })),
  );

  let hoja: React.ReactNode;
  if (ronda && analisis) {
    const datos = { ...comunes, hallazgo: h, ronda, analisis };
    hoja =
      analisis.metodo === "cinco_porques" ? (
        <CincoPorquesImpreso {...datos} formato={formato} />
      ) : analisis.metodo === "ishikawa" ? (
        <IshikawaImpreso {...datos} formato={formato} />
      ) : (
        <OtroMetodoImpreso {...datos} />
      );
  } else {
    // Lo que solo pinta el registro completo: un análisis impreso no lee los seguimientos ni los archivos.
    const [indicadores, archivos, seguimientos] = await Promise.all([
      Promise.all(h.rondas.map(async (r) => [r.id, await indicadorParaQuienLee(r, sesion)] as const)),
      archivosDe(sql, sesion, { contexto: "mejora_hallazgo", contextoId: h.id }),
      seguimientosDelHallazgo(sql, h.id),
    ]);
    hoja = (
      <RegistroImpreso
        {...comunes}
        hallazgo={h}
        formato={formato}
        seguimientos={seguimientos}
        indicadores={Object.fromEntries(indicadores)}
        evidenciaDeCorreccion={archivos.archivos.filter((a) => a.rol === "correccion").map((a) => a.nombre)}
      />
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-6 print:block">
      <div className="flex min-w-0 flex-col gap-3 print:hidden">
        <EncabezadoPagina
          migas={[
            { nombre: "Mejoramiento", href: "/mejoramiento" },
            { nombre: h.codigo, href: rutaDeHallazgo(h.id) },
            { nombre: analisis ? "Análisis impreso" : "Registro impreso" },
          ]}
          codigo={h.codigo}
          titulo={h.titulo}
          descripcion={
            analisis && ronda
              ? `El análisis ${metodo(analisis.metodo)} de la ronda ${ronda.numero}, en su formato, listo para imprimir o guardar como PDF desde el navegador.`
              : "El registro completo del hallazgo, con sus rondas, sus ajustes y sus firmas, listo para imprimir o guardar como PDF desde el navegador."
          }
          acciones={
            <>
              <BotonImprimir />
              <Link href={rutaDeHallazgo(h.id)} className={`${claseBoton("secundario")} ${FOCO}`}>
                Volver al hallazgo
              </Link>
            </>
          }
        />
        {analisis || otros.length > 0 ? (
          <nav aria-label="Otros impresos del hallazgo" className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">También puede imprimir:</span>
            {analisis ? (
              <Link href={rutaDeImprimir(h.id)} className={`${claseBoton("secundario")} ${FOCO}`}>
                El registro completo
              </Link>
            ) : null}
            {otros.map((o) => (
              <Link key={o.id} href={rutaDeImprimir(h.id, o.id)} className={`${claseBoton("secundario")} ${FOCO}`}>
                {`El análisis: ${o.texto}`}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>
      {hoja}
    </div>
  );
}
