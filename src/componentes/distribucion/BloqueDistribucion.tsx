import Link from "next/link";
import { FormAccion } from "@/componentes/admin/FormAccion";
import { pedirAcusesAccion, reemplazarCopiasAccion } from "@/app/acciones-distribucion";
import { QuienFalta } from "@/componentes/distribucion/acuses/QuienFalta";
import { textoPorcentaje } from "@/componentes/distribucion/acuses/TablaAcuses";
import { Boton, claseBoton } from "@/componentes/ui/Boton";
import { DialogoEmitir } from "@/componentes/distribucion/copias/DialogoEmitir";
import { fechaCorta, InsigniaCopia } from "@/componentes/distribucion/copias/TablaCopias";
import { fechaDeJornada } from "@/componentes/distribucion/socializaciones/TablaJornadas";
import { resumenAcusesDeDocumento } from "@/db/consultas/distribucion/acuses";
import {
  copiasDeDocumento,
  puntosParaEmitir,
  type Copia,
} from "@/db/consultas/distribucion/copias";
import { socializacionDeFicha, type Jornada } from "@/db/consultas/distribucion/jornadas";
import { obtenerUrlPublica } from "@/db/consultas/entidad";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { numeroDeCopia } from "@/lib/distribucion/copias";
import { cuenta } from "@/lib/plural";
import { ETIQUETA_MODALIDAD } from "@/lib/distribucion/tipos";
import { puede } from "@/lib/permisos";

function ListaCopias({ titulo, copias, ahora }: { titulo: string; copias: Copia[]; ahora: Date }) {
  if (copias.length === 0) return null;
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold text-muted-foreground">{titulo}</h3>
      <ul className="flex list-none flex-col gap-1.5">
        {copias.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <Link
              href={`/distribucion/copias/${c.id}`}
              className="rounded underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
            >
              {`${c.punto.nombre} N.º ${numeroDeCopia(c.numero)}`}
            </Link>
            <InsigniaCopia copia={c} ahora={ahora} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Una línea por jornada: fecha, modalidad, asistentes y si tiene acta; el acta se enlaza solo a quien puede verla. */
function LineasJornadas({ jornadas }: { jornadas: Jornada[] }) {
  if (jornadas.length === 0) return null;
  return (
    <ul className="flex list-none flex-col gap-1">
      {jornadas.map((j) => {
        const acta = j.evidenciasCantidad > 0 ? "acta adjunta" : "sin acta adjunta";
        return (
          <li key={j.id} className="text-sm">
            {`Jornada del ${fechaDeJornada(j.fecha)} · ${ETIQUETA_MODALIDAD[j.modalidad].toLowerCase()} · ${cuenta(j.asistentesCantidad, "asistente", "asistentes")} · `}
            {j.puedeVerEvidencia ? (
              <Link
                href={`/distribucion/socializaciones/${j.id}`}
                className="rounded underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
              >
                {acta}
              </Link>
            ) : (
              acta
            )}
          </li>
        );
      })}
    </ul>
  );
}

const SIN_PDF = "Para emitir copias controladas el archivo principal debe ser PDF";

/**
 * Lo que dejó «Reemplazar» en la URL (`?aviso=reemplazadas&n=<k>`): la ficha se vuelve a pintar sin el botón, así que
 * el resultado se dice aquí. Solo un entero de 1 a 999; cualquier otro valor no pinta nada.
 */
export function avisoDeReemplazo(consulta?: Record<string, string | string[] | undefined>): string | null {
  const n = consulta?.n;
  if (consulta?.aviso !== "reemplazadas" || typeof n !== "string" || !/^[1-9]\d{0,2}$/.test(n)) return null;
  const emitidas = Number(n);
  return `${emitidas === 1 ? "Se emitió" : "Se emitieron"} ${cuenta(emitidas, "copia", "copias")} de la versión vigente`;
}

/**
 * «Copias controladas» de la ficha del documento: lo vigente, lo que falta recoger y desde dónde emitir o reemplazar,
 * para quien ve la distribución o emite. Quien no, ve solo las jornadas de la vigente, si las hubo (spec 13B §13.3).
 * `volver` es la ficha que lo pinta y `consulta`, sus parámetros de búsqueda.
 */
export async function BloqueDistribucion({
  documento,
  sesion,
  volver,
  consulta,
}: {
  documento: { id: number; codigo: string; titulo: string };
  sesion: SesionFlujo;
  volver: string;
  consulta?: Record<string, string | string[] | undefined>;
}) {
  const puedeEmitir = puede(sesion, "copias.emitir");
  const veDistribucion = puede(sesion, "distribucion.ver");
  const conCopias = puedeEmitir || veDistribucion;

  const [copias, puntos, resumenAcuses, social, urlPublica] = await Promise.all([
    conCopias ? copiasDeDocumento(documento.id, sesion) : Promise.resolve(null),
    puedeEmitir ? puntosParaEmitir(sesion) : Promise.resolve([]),
    veDistribucion ? resumenAcusesDeDocumento(documento.id, sesion) : Promise.resolve(null),
    socializacionDeFicha(documento.id, sesion),
    puedeEmitir ? obtenerUrlPublica() : Promise.resolve(null),
  ]);
  const jornadas = social?.jornadas ?? [];

  if (!copias) {
    if (jornadas.length === 0) return null;
    return (
      <section aria-labelledby="titulo-socializacion" className="rounded-xl border border-border bg-card p-4 shadow-xs">
        <h2 id="titulo-socializacion" className="mb-3 text-sm font-semibold text-foreground">
          Socialización
        </h2>
        <LineasJornadas jornadas={jornadas} />
      </section>
    );
  }

  const ahora = new Date();
  const socializacion = social?.socializacion ?? null;
  const puedeSocializar = puede(sesion, "socializaciones.registrar");
  const vigenteId = social?.versionId ?? null;
  const versionVigente = resumenAcuses?.version ?? null;
  const acuses = resumenAcuses?.cifras ?? null;
  const faltan = resumenAcuses?.faltan ?? null;
  const versionAnterior = Math.max(0, ...copias.porRecoger.map((c) => c.version));
  const avisoSinQr = urlPublica ? null : { enlace: puede(sesion, "entidad.administrar") };
  const avisoReemplazo = avisoDeReemplazo(consulta);

  return (
    <section aria-labelledby="titulo-copias" className="rounded-xl border border-border bg-card p-4 shadow-xs">
      <h2 id="titulo-copias" className="mb-3 text-sm font-semibold text-foreground">
        Copias controladas
      </h2>
      <div className="flex flex-col gap-3">
        {avisoReemplazo ? (
          <p role="status" className="rounded-md bg-estado-bien-fondo px-3 py-2 text-sm text-estado-bien-texto">
            {avisoReemplazo}
          </p>
        ) : null}
        {copias.vigentes.length === 0 && copias.porRecoger.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay copias controladas en circulación.</p>
        ) : null}
        <ListaCopias titulo="De la versión vigente" copias={copias.vigentes} ahora={ahora} />
        <ListaCopias titulo="Por recoger" copias={copias.porRecoger} ahora={ahora} />
        {copias.emision !== null || copias.puedeReemplazar ? (
          <div className="flex flex-wrap items-start gap-2">
            {copias.emision === "pdf" ? (
              <DialogoEmitir
                documentos={[{ ...documento, procesoIds: copias.procesoIds }]}
                puntos={puntos}
                avisoSinQr={avisoSinQr}
                variante="secundario"
              />
            ) : copias.emision === "sin_pdf" ? (
              <div className="flex flex-col gap-1">
                <Boton variante="secundario" disabled aria-describedby="emitir-sin-pdf">
                  Emitir copia controlada
                </Boton>
                <p id="emitir-sin-pdf" className="text-xs text-muted-foreground">
                  {SIN_PDF}
                </p>
              </div>
            ) : null}
            {copias.puedeReemplazar && copias.versionVigenteId !== null ? (
              <FormAccion
                accion={reemplazarCopiasAccion}
                etiqueta={`Reemplazar las copias de la v${versionAnterior} (${copias.reemplazables})`}
                confirmacion="Emite una copia de la versión vigente por cada punto que tenía la anterior; cada responsable confirma en una sola tarea que recibió la nueva y retiró la vieja."
                campos={{ versionId: copias.versionVigenteId, volver }}
              />
            ) : null}
          </div>
        ) : null}
      </div>
      {acuses && (acuses.confirmados + acuses.pendientes > 0 || puede(sesion, "distribucion.gestionar")) ? (
        <div className="mt-4 flex flex-col gap-2 border-t border-border pt-3">
          <h3 className="text-xs font-semibold text-muted-foreground">Acuses de lectura</h3>
          <p className="text-sm">
            {acuses.confirmados + acuses.pendientes === 0
              ? "Nadie tiene este documento por leer."
              : `Acuses v${versionVigente}: ${acuses.confirmados} de ${acuses.confirmados + acuses.pendientes} (${textoPorcentaje(acuses.porcentaje)})${
                  acuses.venceEn ? ` · vencen el ${fechaCorta(acuses.venceEn)}` : ""
                }${acuses.porAsistencia > 0 ? ` · ${acuses.porAsistencia} por asistencia` : ""}`}
          </p>
          <div className="flex flex-wrap items-start gap-2">
            {faltan && faltan.length > 0 ? <QuienFalta titulo={`${documento.codigo} v${versionVigente}`} personas={faltan} /> : null}
            {puede(sesion, "distribucion.gestionar") && vigenteId !== null ? (
              <FormAccion
                accion={pedirAcusesAccion}
                etiqueta="Pedir acuse de lectura"
                confirmacion="Crea la tarea de confirmar la lectura de la versión vigente a quienes aún no la tienen. A quien ya la tiene no se le repite."
                campos={{ documentoId: documento.id }}
              />
            ) : null}
          </div>
        </div>
      ) : null}
      {socializacion?.requerida || jornadas.length > 0 || (puedeSocializar && vigenteId !== null) ? (
        <div className="mt-4 flex flex-col gap-2 border-t border-border pt-3">
          <h3 className="text-xs font-semibold text-muted-foreground">Socialización</h3>
          {socializacion?.requerida ? (
            <p className="text-sm">
              {socializacion.cumplida
                ? `Socialización: requerida · jornada del ${fechaDeJornada(socializacion.cumplida.fecha)}, ${ETIQUETA_MODALIDAD[socializacion.cumplida.modalidad].toLowerCase()}, ${socializacion.cumplida.asistentes === 1 ? "1 asistente" : `${socializacion.cumplida.asistentes} asistentes`}, ${socializacion.cumplida.evidencias > 0 ? "acta adjunta" : "sin acta adjunta"}`
                : socializacion.superada
                  ? "Socialización: requerida · llegó una versión nueva antes de registrarla"
                  : `Socialización: requerida · pendiente${socializacion.venceEn ? `, vence el ${fechaCorta(socializacion.venceEn)}` : ""}`}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Esta versión no se marcó para socializar.</p>
          )}
          <LineasJornadas jornadas={jornadas} />
          {puedeSocializar && vigenteId !== null ? (
            <div>
              <Link
                href={`/distribucion/socializaciones/nueva?version=${vigenteId}`}
                className={`${claseBoton("secundario")} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca`}
              >
                Registrar socialización
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
