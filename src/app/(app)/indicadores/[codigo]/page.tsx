import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MenuAdministrar } from "@/componentes/indicadores/admin/MenuAdministrar";
import { PestanasDeIndicador, Recuadro, type PestanaDeIndicador } from "@/componentes/indicadores/vistas/comun";
import { ESTADO_VERSION, VistaFicha } from "@/componentes/indicadores/vistas/VistaFicha";
import { VistaObservaciones } from "@/componentes/indicadores/vistas/VistaObservaciones";
import { VistaResultados } from "@/componentes/indicadores/vistas/VistaResultados";
import { VistaVersiones } from "@/componentes/indicadores/vistas/VistaVersiones";
import { claseBoton } from "@/componentes/ui/Boton";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { Insignia } from "@/componentes/ui/Insignia";
import { desdePeriodo, fichaDeVersion, operacionDeIndicador, type VersionVisible } from "@/db/consultas/indicadores/aprobacion";
import { proximaPorReportar } from "@/db/consultas/indicadores/lectura";
import { metasDelAnio } from "@/db/consultas/indicadores/metas";
import { resumenDeObservaciones } from "@/db/consultas/indicadores/observaciones";
import { bajaDeIndicador, panelDeAdministracion } from "@/db/consultas/indicadores/operacion";
import { puedeMedir } from "@/lib/alcance";
import { periodicidadDe } from "@/lib/indicadores/periodos";
import { ETIQUETA_PERIODICIDAD, type Periodicidad } from "@/lib/indicadores/tipos";
import { exigirSesion } from "@/lib/paginas";
import { puede } from "@/lib/permisos";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { fechaHoraLocal, zonaHoraria } from "@/lib/zona-horaria";
import { exigirFichaDeIndicador, rutaDeEdicion, rutaDeIndicador } from "../_comun";
import { datosDeFicha, datosDeObservaciones, datosDeResultados, datosDeVersiones, type ContextoDeVista } from "./_vistas";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Indicador" };

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

type Parametros = Record<string, string | string[] | undefined>;

/**
 * La vista pedida; cualquier otra cosa es «no encontrada». Por omisión, «Resultados» si la persona ve el indicador y hay
 * una ficha aprobada; si no (un borrador, un descartado o quien solo debe aprobar la ficha), o si se pide una versión
 * (`?version=N`), «Ficha técnica». «Observaciones», solo para quien ve los soportes (spec §6.4).
 */
function vistaDe(v: Parametros["vista"], conResultados: boolean, conVersion: boolean, conObservaciones: boolean): PestanaDeIndicador | null {
  if (v === undefined) return conResultados && !conVersion ? "resultados" : "ficha";
  if (v === "resultados") return conResultados ? "resultados" : null;
  if (v === "observaciones") return conObservaciones ? "observaciones" : null;
  return v === "ficha" || v === "versiones" ? v : null;
}

/** El año de `?anio=AAAA`; sin parámetro, el en curso; otra cosa es «no encontrada» (y un año fuera de la tabla, también). */
function anioDe(a: Parametros["anio"], enCurso: number): number | null {
  if (a === undefined) return enCurso;
  return typeof a === "string" && /^\d{4}$/.test(a) ? Number(a) : null;
}

/** «Reportar el tercer trimestre de 2026», «Reportar marzo de 2026», «Reportar 2026». */
function etiquetaDeReportar(periodo: string, etiqueta: string): string {
  const p = periodicidadDe(periodo);
  return p === "mensual" || p === "anual" ? `Reportar ${etiqueta}` : `Reportar el ${etiqueta}`;
}

const vigenteDe = (versiones: VersionVisible[]) => [...versiones].reverse().find((v) => v.estado === "aprobada") ?? null;

/**
 * La que se muestra sin pedirla: la vigente, la que está en curso o, en un indicador descartado (todas sus versiones
 * quedaron descartadas), la última. Ese último caso solo lo alcanza quien administra: las demás ni lo encuentran.
 */
const porOmisionDe = (versiones: VersionVisible[]) =>
  vigenteDe(versiones) ?? versiones.find((v) => v.estado === "borrador" || v.estado === "por_aprobar") ?? versiones[versiones.length - 1] ?? null;

/** La versión de `?version=N` si la persona puede abrirla; sin parámetro, la de `porOmisionDe`. */
function versionMostrada(versiones: VersionVisible[], pedida: Parametros["version"]): VersionVisible | null {
  if (pedida === undefined) return porOmisionDe(versiones);
  if (typeof pedida !== "string" || !/^\d{1,6}$/.test(pedida)) return null;
  return versiones.find((v) => v.numero === Number(pedida)) ?? null;
}

/**
 * La página de un indicador (spec §12.3, maqueta 2): el encabezado con la ficha vigente, sus botones y las pestañas
 * «Resultados» (la de por omisión con ficha aprobada; `?anio=AAAA`, `?rango=`), «Ficha técnica» (`?vista=ficha`, con
 * `?version=N` para otra versión que la persona pueda abrir), «Versiones» y, para quien ve los soportes, «Observaciones»
 * (`?vista=observaciones&periodo=`). La página decide la sesión, quién ve qué y la vista; cada vista lee lo suyo
 * (`_vistas.ts`) y se pinta con su componente. Quien debe aprobar la ficha por aprobar de un indicador que aún no existe
 * para él solo abre esa versión (spec §6.4); para los demás, «no encontrada».
 */
export default async function PaginaIndicador({ params, searchParams }: { params: Promise<{ codigo: string }>; searchParams: Promise<Parametros> }) {
  const sesion = await exigirSesion();
  const { codigo: segmento } = await params;
  const sp = await searchParams;
  const { indicador, ve, versiones } = await exigirFichaDeIndicador(sesion, segmento);
  const vigente = vigenteDe(versiones);
  const conResultados = ve && vigente !== null;
  // La pestaña «Observaciones», con su número, a quien ve los soportes (spec §6.4).
  const obs = conResultados ? await resumenDeObservaciones(sesion, indicador.id) : null;
  const vista = vistaDe(sp.vista, conResultados, sp.version !== undefined, obs !== null);
  if (vista === null || (vista === "versiones" && !ve)) notFound();
  const ahora = new Date();
  const anioEnCurso = Number(fechaEnZona(ahora, zonaHoraria()).slice(0, 4));
  // La tabla va del año del inicio de medición (si ya llegó) al en curso; otro año no existe.
  const primerAnio =
    vista === "resultados"
      ? Math.min(Number((await operacionDeIndicador(indicador.id)).inicioMedicion.slice(0, 4)) || anioEnCurso, anioEnCurso)
      : anioEnCurso;
  const anio = vista === "resultados" ? anioDe(sp.anio, anioEnCurso) : anioEnCurso;
  if (anio === null || anio < primerAnio || anio > anioEnCurso) notFound();
  const mostrada = vista === "ficha" ? versionMostrada(versiones, sp.version) : porOmisionDe(versiones);
  if (!mostrada) notFound();
  const ficha = await fichaDeVersion(sesion, mostrada.id);
  if (!ficha) notFound();

  const administra = puede(sesion, "indicadores.administrar");
  const codigo = indicador.codigo;
  const contexto: ContextoDeVista = { sesion, indicador, ve, versiones, vigente, ficha, administra, ahora };
  // La vista elegida lee lo suyo; «Resultados» abre antes los periodos que hayan terminado (F14-DC12).
  const cuerpo =
    vista === "resultados" ? (
      <VistaResultados {...await datosDeResultados(contexto, sp, { anio, primerAnio, anioEnCurso })} />
    ) : vista === "observaciones" && obs ? (
      <VistaObservaciones {...await datosDeObservaciones(contexto, sp, obs)} />
    ) : vista === "ficha" ? (
      <VistaFicha {...await datosDeFicha(contexto)} />
    ) : (
      <VistaVersiones {...await datosDeVersiones(contexto)} />
    );

  const cabecera = vigente && vigente.id !== ficha.versionId ? ((await fichaDeVersion(sesion, vigente.id)) ?? ficha) : ficha;
  const c = cabecera.contenido;
  const linea = [
    c.procesoNombre,
    c.periodicidad ? ETIQUETA_PERIODICIDAD[c.periodicidad as Periodicidad] : null,
    c.tipoNombre,
    c.clasificacionNombre,
    vigente && cabecera.rigeDesde
      ? `Ficha versión ${vigente.numero}, vigente ${desdePeriodo(cabecera.rigeDesde)}`
      : `Ficha versión ${ficha.numero}, ${ESTADO_VERSION[ficha.estado]}`,
  ]
    .filter(Boolean)
    .join(" · ");
  // Lo que quien administra puede hacer con el indicador; solo se lee para él (viaja en el payload de la página).
  const panel = administra ? await panelDeAdministracion(sesion, indicador.id) : null;
  const baja = administra && (indicador.estado === "retirado" || indicador.estado === "descartado") ? await bajaDeIndicador(indicador.id) : null;
  // «Reportar» la medición más antigua por reportar, a quien puede medir.
  const mide = conResultados && indicador.estado === "activo" && (await puedeMedir(indicador.id, sesion)).puede;
  const pendiente = mide ? await proximaPorReportar(sesion, indicador.id) : null;
  // «Programar metas» del año de la página, para quien administra un indicador activo (spec §8.9).
  const metas = panel && indicador.estado === "activo" && vigente ? { anio, filas: await metasDelAnio(indicador.id, anio, { ahora }) } : null;
  const reportarBoton = pendiente ? (
    <Link href={`${rutaDeIndicador(codigo)}/reportar/${pendiente.periodo}`} className={`${claseBoton("primario")} ${FOCO}`}>
      {etiquetaDeReportar(pendiente.periodo, pendiente.etiqueta)}
    </Link>
  ) : null;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <EncabezadoPagina
        migas={[{ nombre: "Indicadores", href: "/indicadores" }, { nombre: codigo }]}
        codigo={codigo}
        insignias={
          indicador.estado === "borrador" ? (
            <Insignia variante="atencion">Borrador</Insignia>
          ) : indicador.estado === "retirado" ? (
            <Insignia variante="sin-dato">Retirado</Insignia>
          ) : indicador.estado === "descartado" ? (
            <Insignia variante="sin-dato">Descartado</Insignia>
          ) : undefined
        }
        titulo={c.nombre ?? codigo}
        descripcion={linea}
        tituloEnfocable
        acciones={
          reportarBoton || panel ? (
            <>
              {reportarBoton}
              {panel ? <MenuAdministrar panel={panel} hrefEditar={rutaDeEdicion(codigo)} metas={metas} /> : null}
            </>
          ) : undefined
        }
      />
      <PestanasDeIndicador codigo={codigo} activa={vista} conVersiones={ve} conResultados={conResultados} observaciones={obs?.total ?? null} />
      {baja ? (
        <Recuadro>
          <p>{`${indicador.estado === "retirado" ? "Retirado" : "Descartado"} el ${fechaHoraLocal(baja.en)}${baja.por ? ` por ${baja.por}` : ""}.`}</p>
          <p className="break-words">{`Motivo: ${baja.motivo}`}</p>
          {indicador.estado === "descartado" ? (
            <p className="text-muted-foreground">Solo lo ve quien administra y su código sigue ocupado. Para retomarlo, use «Crear a partir de este».</p>
          ) : null}
        </Recuadro>
      ) : null}
      {cuerpo}
    </div>
  );
}
