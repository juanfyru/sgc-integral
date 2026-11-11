import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MenuAdministrar } from "@/componentes/indicadores/admin/MenuAdministrar";
import { ControlDeCambios } from "@/componentes/indicadores/ficha/ControlDeCambios";
import { FichaTecnica } from "@/componentes/indicadores/ficha/FichaTecnica";
import { AprobarFicha, DevolverFicha, type FilaPorAprobar } from "@/componentes/indicadores/ficha/ListaPorAprobar";
import { TablaDelAnio } from "@/componentes/indicadores/medicion/TablaDelAnio";
import { claseBoton } from "@/componentes/ui/Boton";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { Insignia } from "@/componentes/ui/Insignia";
import { obtenerSql } from "@/db/cliente";
import {
  cambiosFrenteALaVigente,
  desdePeriodo,
  enlaceDeVersion,
  fichaDeVersion,
  operacionDeIndicador,
  versionesDe,
  type FichaLeida,
  type VersionResumen,
  type VersionVisible,
} from "@/db/consultas/indicadores/aprobacion";
import { asegurarMediciones, proximaPorReportar, tablaDelAnio, type FilaDelAnio } from "@/db/consultas/indicadores/mediciones";
import { bajaDeIndicador, panelDeAdministracion } from "@/db/consultas/indicadores/operacion";
import { puedeMedir } from "@/lib/alcance";
import { periodicidadDe } from "@/lib/indicadores/periodos";
import { exigirSesion } from "@/lib/paginas";
import { puede } from "@/lib/permisos";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { fechaHoraLocal, zonaHoraria } from "@/lib/zona-horaria";
import { exigirFichaDeIndicador, rutaDeEdicion, rutaDeIndicador } from "../_comun";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Indicador" };

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";
const ENLACE = `rounded-sm text-marca underline-offset-2 hover:underline ${FOCO}`;

const PERIODICIDAD: Record<string, string> = {
  mensual: "Mensual",
  bimestral: "Bimestral",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
};
const ESTADO_VERSION: Record<VersionVisible["estado"], string> = {
  borrador: "en borrador",
  por_aprobar: "por aprobar",
  aprobada: "aprobada",
  descartada: "descartada",
};

type Vista = "resultados" | "ficha" | "versiones";
type Parametros = Record<string, string | string[] | undefined>;

/**
 * La vista pedida; cualquier otra cosa es «no encontrada». Por omisión, «Resultados» si la persona ve el indicador y hay
 * una ficha aprobada; si no (un borrador, un descartado o quien solo debe aprobar la ficha), o si se pide una versión
 * (`?version=N`), «Ficha técnica».
 */
function vistaDe(v: Parametros["vista"], conResultados: boolean, conVersion: boolean): Vista | null {
  if (v === undefined) return conResultados && !conVersion ? "resultados" : "ficha";
  if (v === "resultados") return conResultados ? "resultados" : null;
  return v === "ficha" || v === "versiones" ? v : null;
}

/** El año de `?anio=AAAA`; sin parámetro, el en curso; cualquier otra cosa es «no encontrada». */
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
const enCursoDe = (versiones: VersionVisible[]) => versiones.find((v) => v.estado === "borrador" || v.estado === "por_aprobar") ?? null;

/**
 * La que se muestra sin pedirla: la vigente, la que está en curso o, en un indicador descartado (todas sus versiones
 * quedaron descartadas), la última. Ese último caso solo lo alcanza quien administra: las demás ni lo encuentran.
 */
const porOmisionDe = (versiones: VersionVisible[]) => vigenteDe(versiones) ?? enCursoDe(versiones) ?? versiones[versiones.length - 1] ?? null;

/** La versión de `?version=N` si la persona puede abrirla; sin parámetro, la de `porOmisionDe`. */
function versionMostrada(versiones: VersionVisible[], pedida: Parametros["version"]): VersionVisible | null {
  if (pedida === undefined) return porOmisionDe(versiones);
  if (typeof pedida !== "string" || !/^\d{1,6}$/.test(pedida)) return null;
  return versiones.find((v) => v.numero === Number(pedida)) ?? null;
}

function PestanasDeIndicador({
  codigo,
  activa,
  conVersiones,
  conResultados,
}: {
  codigo: string;
  activa: Vista;
  conVersiones: boolean;
  conResultados: boolean;
}) {
  const pestanas: { clave: Vista; etiqueta: string }[] = [];
  if (conResultados) pestanas.push({ clave: "resultados", etiqueta: "Resultados" });
  pestanas.push({ clave: "ficha", etiqueta: "Ficha técnica" });
  if (conVersiones) pestanas.push({ clave: "versiones", etiqueta: "Versiones" });
  return (
    <nav aria-label="Vistas del indicador">
      <ul className="flex list-none flex-wrap gap-1 border-b border-border">
        {pestanas.map((p) => (
          <li key={p.clave} className="-mb-px">
            <Link
              href={`${rutaDeIndicador(codigo)}?vista=${p.clave}`}
              aria-current={p.clave === activa ? "page" : undefined}
              className={`inline-block rounded-t-md border-b-2 px-3 py-2 text-sm ${FOCO} ${
                p.clave === activa ? "border-mod-indicadores font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.etiqueta}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Recuadro({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-l-4 border-border border-l-mod-indicadores bg-muted px-4 py-3 text-sm">{children}</div>
  );
}

/**
 * Lo que la versión mostrada es frente a la vigente: un cambio por aprobar (con «Aprobar» y «Devolver» para quien le
 * toca), un borrador, una versión anterior o una descartada. Sobre la vigente, el aviso de un cambio en curso.
 */
function EstadoDeLaVersion({
  ficha,
  codigo,
  vigente,
  enCurso,
  administra,
  porAprobar,
  pideCodigo,
}: {
  ficha: FichaLeida;
  codigo: string;
  vigente: VersionVisible | null;
  enCurso: VersionVisible | null;
  administra: boolean;
  /** Lo que «Aprobar» firma, solo si la versión está por aprobar. */
  porAprobar: FilaPorAprobar | null;
  pideCodigo: boolean;
}) {
  if (ficha.estado === "aprobada" && ficha.versionId === vigente?.id) {
    if (!enCurso) return null;
    return (
      <Recuadro>
        <p>
          {`Hay un cambio ${ESTADO_VERSION[enCurso.estado]} (versión ${enCurso.numero}). `}
          <Link href={enlaceDeVersion(codigo, enCurso.numero)} className={ENLACE}>
            {`Ver la versión ${enCurso.numero}`}
          </Link>
        </p>
      </Recuadro>
    );
  }
  if (ficha.estado === "aprobada") {
    return (
      <Recuadro>
        <p>
          {`Versión ${ficha.numero}, anterior a la vigente. `}
          {vigente ? (
            <Link href={enlaceDeVersion(codigo, vigente.numero)} className={ENLACE}>
              {`Ver la vigente (versión ${vigente.numero})`}
            </Link>
          ) : null}
        </p>
      </Recuadro>
    );
  }
  if (ficha.estado === "descartada") {
    return (
      <Recuadro>
        <p>{`Versión ${ficha.numero}, descartada: nunca rigió.`}</p>
      </Recuadro>
    );
  }
  if (ficha.estado === "borrador") {
    return (
      <Recuadro>
        <p className="flex flex-wrap items-center gap-2">
          <Insignia variante={ficha.notaDevolucion ? "atencion" : "neutra"}>{ficha.notaDevolucion ? "Devuelta" : "Borrador"}</Insignia>
          {`Versión ${ficha.numero} en borrador: aún no rige.`}
        </p>
        {ficha.notaDevolucion ? <p>{`Nota de quien la devolvió: ${ficha.notaDevolucion}`}</p> : null}
        {administra ? (
          <p>
            <Link href={rutaDeEdicion(codigo)} className={ENLACE}>
              Seguir editando y enviarla
            </Link>
          </p>
        ) : null}
      </Recuadro>
    );
  }
  return (
    <Recuadro>
      <p className="flex flex-wrap items-center gap-2">
        <Insignia variante="atencion">Por aprobar</Insignia>
        {`Versión ${ficha.numero}: ${ficha.tipoCambio === "inicial" ? "ficha nueva" : `cambio mayor en ${porAprobar?.cambios.join(", ") ?? ""}`}.`}
      </p>
      {porAprobar?.elaboro ? <p>{`La envió ${porAprobar.elaboro} el ${porAprobar.enviada}.`}</p> : null}
      {ficha.rigeDesde && ficha.tipoCambio === "mayor" ? <p>{`Regirá ${desdePeriodo(ficha.rigeDesde)}.`}</p> : null}
      {ficha.aprueba && porAprobar ? (
        <div className="flex flex-wrap items-start gap-2">
          <AprobarFicha ficha={porAprobar} volver={rutaDeIndicador(codigo)} pideCodigo={pideCodigo} />
          <DevolverFicha versionId={ficha.versionId} codigo={codigo} />
        </div>
      ) : (
        <p className="text-muted-foreground">Espera la aprobación de quien corresponde según su clasificación.</p>
      )}
    </Recuadro>
  );
}

/** «Versiones»: el control de cambios y cada versión anterior completa (spec §7.6.6 y §12.3). */
function Versiones({ resumen, anteriores, vigente }: { resumen: VersionResumen[]; anteriores: FichaLeida[]; vigente: number | null }) {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <section aria-labelledby="indicador-control" className="flex min-w-0 flex-col gap-3">
        <h2 id="indicador-control" className="text-lg font-semibold">
          Control de cambios
        </h2>
        <ControlDeCambios versiones={resumen} vigente={vigente} />
      </section>
      {anteriores.length > 0 ? (
        <section aria-labelledby="indicador-anteriores" className="flex min-w-0 flex-col gap-3">
          <h2 id="indicador-anteriores" className="text-lg font-semibold">
            Versiones anteriores
          </h2>
          {anteriores.map((f) => (
            <details key={f.versionId} className="rounded-lg border border-border px-4 py-3">
              <summary className={`cursor-pointer rounded-md text-sm font-medium ${FOCO}`}>
                {`Versión ${f.numero}${f.rigeDesde ? `, rigió ${desdePeriodo(f.rigeDesde)}` : ""}`}
              </summary>
              <div className="mt-3">
                <FichaTecnica ficha={f} operacion={null} nivel={3} />
              </div>
            </details>
          ))}
        </section>
      ) : null}
    </div>
  );
}

/** «Resultados» (spec §12.3): por ahora, la tabla del año con su selector de año. */
function Resultados({
  filas,
  variables,
  anio,
  anios,
  codigo,
  mide,
}: {
  filas: FilaDelAnio[];
  variables: { letra: string; nombre: string }[];
  anio: number;
  anios: { anterior: number | null; siguiente: number | null };
  codigo: string;
  mide: boolean;
}) {
  const enlaceDeAnio = (a: number) => `${rutaDeIndicador(codigo)}?vista=resultados&anio=${a}`;
  return (
    <section aria-labelledby="indicador-anio" className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="indicador-anio" className="text-lg font-semibold">
          {`Resultados de ${anio}`}
        </h2>
        <nav aria-label="Año de la tabla" className="flex flex-wrap gap-3 text-sm">
          {anios.anterior !== null ? (
            <Link href={enlaceDeAnio(anios.anterior)} className={ENLACE}>
              {`‹ ${anios.anterior}`}
            </Link>
          ) : null}
          {anios.siguiente !== null ? (
            <Link href={enlaceDeAnio(anios.siguiente)} className={ENLACE}>
              {`${anios.siguiente} ›`}
            </Link>
          ) : null}
        </nav>
      </div>
      <TablaDelAnio filas={filas} variables={variables} anio={anio} codigo={codigo} puedeMedir={mide} />
    </section>
  );
}

/**
 * La página de un indicador (spec §12.3, maqueta 2): el encabezado con la ficha vigente y las vistas «Resultados» (la de
 * por omisión cuando hay ficha aprobada: la tabla del año, `?anio=AAAA`), «Ficha técnica» (`?vista=ficha`, con
 * `?version=N` para otra versión que la persona pueda abrir) y «Versiones» (el control de cambios y cada versión anterior
 * completa). Quien debe aprobar la ficha por aprobar de un indicador que aún no existe para él solo abre esa versión
 * (spec §6.4); para los demás, «no encontrada».
 */
export default async function PaginaIndicador({ params, searchParams }: { params: Promise<{ codigo: string }>; searchParams: Promise<Parametros> }) {
  const sesion = await exigirSesion();
  const { codigo: segmento } = await params;
  const sp = await searchParams;
  const { indicador, ve, versiones } = await exigirFichaDeIndicador(sesion, segmento);
  const vigente = vigenteDe(versiones);
  const conResultados = ve && vigente !== null;
  const vista = vistaDe(sp.vista, conResultados, sp.version !== undefined);
  if (vista === null || (vista === "versiones" && !ve)) notFound();
  const zona = zonaHoraria();
  const ahora = new Date();
  const anioEnCurso = Number(fechaEnZona(ahora, zona).slice(0, 4));
  const anio = vista === "resultados" ? anioDe(sp.anio, anioEnCurso) : anioEnCurso;
  if (anio === null) notFound();
  const mostrada = vista === "ficha" ? versionMostrada(versiones, sp.version) : porOmisionDe(versiones);
  if (!mostrada) notFound();
  const ficha = await fichaDeVersion(sesion, mostrada.id);
  if (!ficha) notFound();

  const administra = puede(sesion, "indicadores.administrar");
  const codigo = indicador.codigo;
  const cabecera = vigente && vigente.id !== ficha.versionId ? ((await fichaDeVersion(sesion, vigente.id)) ?? ficha) : ficha;
  const c = cabecera.contenido;
  const linea = [
    c.procesoNombre,
    c.periodicidad ? PERIODICIDAD[c.periodicidad] : null,
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

  let porAprobar: FilaPorAprobar | null = null;
  if (vista === "ficha" && ficha.estado === "por_aprobar") {
    porAprobar = {
      versionId: ficha.versionId,
      codigo,
      nombre: ficha.contenido.nombre ?? codigo,
      proceso: ficha.contenido.procesoNombre ?? "",
      numero: ficha.numero,
      tipoCambio: ficha.tipoCambio,
      cambios: ficha.tipoCambio === "inicial" ? [] : await cambiosFrenteALaVigente(obtenerSql(), indicador.id, ficha.versionId),
      motivo: ficha.motivo,
      elaboro: ficha.firmas.elaboro?.nombre ?? "",
      enviada: ficha.firmas.elaboro ? fechaHoraLocal(ficha.firmas.elaboro.fecha) : "",
      enlace: enlaceDeVersion(codigo, ficha.numero),
    };
  }
  // Los datos de operación, a quien ve el indicador y a quien debe aprobar su ficha.
  const operacion = vista === "ficha" && (ve || ficha.aprueba) ? await operacionDeIndicador(indicador.id) : null;
  const resumen = vista === "versiones" ? await versionesDe(indicador.id) : [];
  const anteriores: FichaLeida[] = [];
  for (const v of resumen) {
    if (v.id === vigente?.id) continue;
    const anterior = await fichaDeVersion(sesion, v.id);
    if (anterior) anteriores.push(anterior);
  }

  // Resultados: antes de leer se abren los periodos que hayan terminado (F14-DC12).
  if (vista === "resultados") await asegurarMediciones({ indicadorId: indicador.id, ahora });
  const filas = vista === "resultados" ? await tablaDelAnio(sesion, indicador.id, anio, { ahora }) : [];
  const mide = conResultados && indicador.estado === "activo" && (await puedeMedir(indicador.id, sesion)).puede;
  const pendiente = mide ? await proximaPorReportar(sesion, indicador.id) : null;
  // El selector de año va del año del inicio de medición al en curso.
  const primerAnio = vista === "resultados" ? Number((await operacionDeIndicador(indicador.id)).inicioMedicion.slice(0, 4)) || anioEnCurso : anioEnCurso;
  const anios = { anterior: anio > primerAnio ? anio - 1 : null, siguiente: anio < anioEnCurso ? anio + 1 : null };
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
              {panel ? <MenuAdministrar panel={panel} hrefEditar={rutaDeEdicion(codigo)} /> : null}
            </>
          ) : undefined
        }
      />
      <PestanasDeIndicador codigo={codigo} activa={vista} conVersiones={ve} conResultados={conResultados} />
      {baja ? (
        <Recuadro>
          <p>{`${indicador.estado === "retirado" ? "Retirado" : "Descartado"} el ${fechaHoraLocal(baja.en)}${baja.por ? ` por ${baja.por}` : ""}.`}</p>
          <p className="break-words">{`Motivo: ${baja.motivo}`}</p>
          {indicador.estado === "descartado" ? (
            <p className="text-muted-foreground">Solo lo ve quien administra y su código sigue ocupado. Para retomarlo, use «Crear a partir de este».</p>
          ) : null}
        </Recuadro>
      ) : null}

      {vista === "resultados" ? (
        <Resultados
          filas={filas}
          variables={c.variables.map((v) => ({ letra: v.letra, nombre: v.nombre ?? v.letra }))}
          anio={anio}
          anios={anios}
          codigo={codigo}
          mide={mide}
        />
      ) : vista === "ficha" ? (
        <>
          <EstadoDeLaVersion
            ficha={ficha}
            codigo={codigo}
            vigente={vigente}
            enCurso={enCursoDe(versiones)}
            administra={administra}
            porAprobar={porAprobar}
            pideCodigo={sesion.totpActivo}
          />
          <FichaTecnica ficha={ficha} operacion={operacion} />
        </>
      ) : (
        <Versiones resumen={resumen} anteriores={anteriores} vigente={vigente?.id ?? null} />
      )}
    </div>
  );
}
