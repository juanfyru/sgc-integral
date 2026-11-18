"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { DialogoFirma } from "@/componentes/tramites/DialogoFirma";
import { claseBoton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import type { DatosDeEvaluacion } from "@/db/consultas/mejoramiento/verificacion";
import { fechaDeDia, fechaLargaDeDia } from "@/lib/mejoramiento/formato";
import { AVISO_SIN_PACIENTES, ETIQUETA_CRITERIO } from "@/lib/mejoramiento/textos";
import { CRITERIOS_EFICACIA, type CriterioEficacia } from "@/lib/mejoramiento/tipos";
import { TablaDelIndicador, type AccionDelPaso } from "./Partes";

/** Lo que devuelve el almacén local cuando el navegador no lo deja usar (privado, bloqueado). */
const SIN_ALMACEN = "(sin almacén local)";

/** El almacén local no avisa de lo que cambia en la misma pestaña: solo de otras (`storage`). */
function suscribirAlAlmacen(avisar: () => void): () => void {
  window.addEventListener("storage", avisar);
  return () => window.removeEventListener("storage", avisar);
}

function leerDelAlmacen(clave: string): string | null {
  try {
    return localStorage.getItem(clave);
  } catch {
    return SIN_ALMACEN;
  }
}

type Borrador = { justificacion?: string; lecciones?: string; cambiosAtendidos?: string };

/** El borrador guardado, sin confiar en su forma: lo que no se puede leer es «ninguno». */
function leerBorrador(crudo: string | null | undefined): Borrador | null {
  if (typeof crudo !== "string" || crudo === SIN_ALMACEN) return null;
  try {
    const x = JSON.parse(crudo) as Record<string, unknown> | null;
    if (typeof x !== "object" || x === null) return null;
    const texto = (v: unknown) => (typeof v === "string" ? v : undefined);
    return { justificacion: texto(x.justificacion), lecciones: texto(x.lecciones), cambiosAtendidos: texto(x.cambiosAtendidos) };
  } catch {
    return null;
  }
}

const CASILLA = "mt-0.5 size-4 shrink-0 accent-marca focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";
const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/**
 * «En espera de eficacia» para quien puede verificar (spec 15 §11.4, maqueta 7, PC-09). La pantalla muestra, sin que nadie lo
 * busque, el criterio del plan, los resultados del indicador enlazado (cada periodo «antes», «durante» o «después», en texto) y
 * las ocurrencias desde R. Se marcan los criterios evaluados, el periodo, el resultado y la justificación (al menos 20
 * caracteres) y se firma «Verificó». «Eficaz» solo desde la fecha mínima (antes, deshabilitado y lo dice) y, con ocurrencias, con
 * la confirmación; «No eficaz», en cualquier momento. A quien cierra (`cierra`: el Admin SGC) se le piden además las lecciones
 * aprendidas y, si el análisis pidió cambios, cómo se atendieron: con «Eficaz», evalúa y cierra en el mismo acto. Lo que viaja
 * con la firma es lo escrito aquí y la huella de lo que se vio (`vistoHuella`): si cambió, el servidor lo rechaza y la página se
 * vuelve a leer.
 */
export function PasoEvaluar({
  hallazgoId,
  datos,
  criterioOtro,
  vistoHuella,
  hoy,
  cierra,
  pideCambios,
  pideCodigo,
  accion,
  derivar,
  avisoCambio = false,
  children,
}: {
  hallazgoId: number;
  datos: DatosDeEvaluacion;
  /** La descripción del criterio «Otro» del plan, si la tiene. */
  criterioOtro: string | null;
  /** `huellaDeLoVisto(datos)`, de exactamente lo que se pinta. */
  vistoHuella: string;
  /** Hoy en la zona (`yyyy-mm-dd`): el periodo evaluado no termina después. */
  hoy: string;
  /** Quien evalúa puede cerrar (`mejora.gestionar`): con «Eficaz» cierra en el mismo acto. */
  cierra: boolean;
  /** El análisis pidió cambios en documentos, riesgos o controles: el cierre pide decir cómo se atendieron. */
  pideCambios: boolean;
  pideCodigo: boolean;
  accion: AccionDelPaso;
  /** «Registrar un hallazgo distinto» (`/mejoramiento/nuevo?derivado=<id>`), a quien puede registrar; nulo si no. */
  derivar: string | null;
  /**
   * La página volvió porque cambió lo que se muestra para evaluar (`LO_VISTO_CAMBIO`): el formulario lo dice arriba y recupera lo
   * escrito del borrador local, si lo hay.
   */
  avisoCambio?: boolean;
  /** Los archivos de la evaluación, si quiere adjuntarlos. */
  children?: React.ReactNode;
}) {
  const sinIndicador = datos.indicador === null || datos.indicadorRetirado;
  const [resultado, setResultado] = useState<"" | "eficaz" | "no_eficaz">("");
  const [criterios, setCriterios] = useState<CriterioEficacia[]>(() =>
    CRITERIOS_EFICACIA.filter((c) => datos.criterios.includes(c) && !(c === "mejora_indicador" && sinIndicador)),
  );
  const [desde, setDesde] = useState(datos.r);
  const [hasta, setHasta] = useState(hoy);
  const id = (c: string) => `${c}-${hallazgoId}`;
  const clave = `mejora-evaluar-${hallazgoId}`;
  // El borrador local de lo escrito (por hallazgo): si la página vuelve por `LO_VISTO_CAMBIO` y lo escrito se perdió, se
  // recupera de él. Se lee como un almacén externo (en el servidor no existe: `undefined`); sin almacenamiento, `SIN_ALMACEN`.
  const borradorCrudo = useSyncExternalStore(
    suscribirAlAlmacen,
    () => leerDelAlmacen(clave),
    () => undefined,
  );
  const borrador = avisoCambio ? leerBorrador(borradorCrudo) : null;
  // Lo escrito en esta pantalla (`null`: nada aún) manda sobre el borrador.
  const [justificacionEscrita, setJustificacion] = useState<string | null>(null);
  const [leccionesEscritas, setLecciones] = useState<string | null>(null);
  const [cambiosEscritos, setCambiosAtendidos] = useState<string | null>(null);
  const justificacion = justificacionEscrita ?? borrador?.justificacion ?? "";
  const lecciones = leccionesEscritas ?? borrador?.lecciones ?? "";
  const cambiosAtendidos = cambiosEscritos ?? borrador?.cambiosAtendidos ?? "";
  const [confirma, setConfirma] = useState(false);
  /** Tras `LO_VISTO_CAMBIO`: si lo escrito sigue a la vista (nulo mientras no se sabe, en el servidor). */
  const conservado = !avisoCambio || borradorCrudo === undefined ? null : justificacion !== "";
  const guardar = (x: { justificacion?: string; lecciones?: string; cambiosAtendidos?: string }) => {
    try {
      const antes = leerBorrador(localStorage.getItem(clave)) ?? {};
      localStorage.setItem(clave, JSON.stringify({ ...antes, ...x }));
    } catch {
      // Sin almacenamiento local: lo escrito solo vive en la pantalla.
    }
  };
  const ocurrencias = datos.ocurrencias.length;
  const cierraAhora = cierra && resultado === "eficaz";
  const ocultos: Record<string, string> = {
    hallazgoId: String(hallazgoId),
    resultado,
    desde,
    hasta,
    justificacion,
    vistoHuella,
    ...(confirma ? { confirmaOcurrencias: "si" } : {}),
    ...(cierraAhora ? { lecciones, ...(pideCambios ? { cambiosAtendidos } : {}) } : {}),
  };
  const marcar = (c: CriterioEficacia, si: boolean) => setCriterios((x) => CRITERIOS_EFICACIA.filter((k) => (k === c ? si : x.includes(k))));
  const indicador = datos.indicador;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {avisoCambio ? (
        <p role="alert" className="rounded-md border border-estado-atencion/40 bg-estado-atencion-fondo px-3 py-2 text-sm text-estado-atencion-texto">
          Cambió lo que se muestra para evaluar: revíselo antes de registrar la evaluación.
          {conservado === true ? " Lo que había escrito se conservó." : conservado === false ? " Lo que había escrito no se pudo conservar: escríbalo otra vez." : ""}
        </p>
      ) : null}
      <p className="text-sm">{`La última actividad terminó el ${fechaLargaDeDia(datos.r)}.`}</p>
      {indicador ? (
        <section aria-labelledby={id("indicador")} className="flex min-w-0 flex-col gap-2 rounded-md border border-linea-suave p-3">
          <h3 id={id("indicador")} className="text-sm font-semibold">
            El indicador enlazado
          </h3>
          {indicador.codigo === "" ? (
            <p className="text-sm text-muted-foreground">El plan enlazó un indicador que usted no ve: sus resultados no se muestran.</p>
          ) : (
            <TablaDelIndicador codigo={indicador.codigo} nombre={indicador.nombre} filas={indicador.filas} />
          )}
          {datos.indicadorRetirado ? (
            <p className="text-sm">El indicador se retiró: la espera volvió a ser la de dos meses y «mejora del indicador» no se puede marcar.</p>
          ) : null}
        </section>
      ) : null}
      <section aria-labelledby={id("ocurrencias")} className="flex min-w-0 flex-col gap-2 rounded-md border border-linea-suave p-3">
        <h3 id={id("ocurrencias")} className="text-sm font-semibold">
          Ocurrencias desde que terminó el plan
        </h3>
        {ocurrencias === 0 ? (
          <p className="text-sm text-muted-foreground">No se registraron ocurrencias nuevas.</p>
        ) : (
          <>
            <ul className="flex list-none flex-col gap-1 text-sm">
              {datos.ocurrencias.map((o, i) => (
                <li key={i} className="break-words border-l-2 border-mod-planes pl-3">
                  <span className="font-medium">{fechaDeDia(o.fecha)}:</span> {o.descripcion}
                </li>
              ))}
            </ul>
            <label htmlFor={id("confirma-ocurrencias")} className="flex items-start gap-2 text-sm">
              <input
                id={id("confirma-ocurrencias")}
                type="checkbox"
                checked={confirma}
                onChange={(e) => setConfirma(e.target.checked)}
                className={CASILLA}
              />
              <span>
                {ocurrencias === 1
                  ? "Hay 1 ocurrencia posterior a la implementación: confirmo que la revisé antes de registrar «Eficaz»."
                  : `Hay ${ocurrencias} ocurrencias posteriores a la implementación: confirmo que las revisé antes de registrar «Eficaz».`}
              </span>
            </label>
          </>
        )}
      </section>

      <fieldset className="flex min-w-0 flex-col gap-1">
        <legend className="mb-1 text-sm font-medium">Criterios que evaluó</legend>
        {CRITERIOS_EFICACIA.map((c) => {
          const bloqueado = c === "mejora_indicador" && sinIndicador;
          const razon = !bloqueado ? null : datos.indicador === null ? "El plan no enlazó un indicador" : "El indicador se retiró";
          return (
            <label key={c} className={`flex items-start gap-2 text-sm ${bloqueado ? "cursor-not-allowed text-muted-foreground" : ""}`}>
              <input
                type="checkbox"
                checked={criterios.includes(c)}
                disabled={bloqueado}
                onChange={(e) => marcar(c, e.target.checked)}
                className={`${CASILLA} disabled:cursor-not-allowed`}
              />
              <span>
                {ETIQUETA_CRITERIO[c]}
                {c === "otro" && criterioOtro ? `: ${criterioOtro}` : ""}
                {datos.criterios.includes(c) ? " (del plan)" : ""}
                {razon ? <span className="block text-xs">{`${razon}: no se puede marcar.`}</span> : null}
              </span>
            </label>
          );
        })}
      </fieldset>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
        <Campo etiqueta="Periodo evaluado: desde" nombre="desde" id={id("desde")}>
          <input type="date" value={desde} max={hoy} onChange={(e) => setDesde(e.target.value)} className={`${claseControl} min-w-0`} />
        </Campo>
        <Campo etiqueta="Hasta" nombre="hasta" id={id("hasta")}>
          <input type="date" value={hasta} max={hoy} onChange={(e) => setHasta(e.target.value)} className={`${claseControl} min-w-0`} />
        </Campo>
      </div>

      <fieldset className="flex min-w-0 flex-col gap-1">
        <legend className="mb-1 text-sm font-medium">Resultado</legend>
        <label className={`flex items-start gap-2 text-sm ${datos.yaSePuede ? "" : "cursor-not-allowed text-muted-foreground"}`}>
          <input
            type="radio"
            name={id("resultado")}
            value="eficaz"
            disabled={!datos.yaSePuede}
            checked={resultado === "eficaz"}
            onChange={() => setResultado("eficaz")}
            aria-describedby={datos.yaSePuede ? undefined : id("desde-cuando")}
            className={`${CASILLA} disabled:cursor-not-allowed`}
          />
          <span>
            Eficaz
            {datos.yaSePuede ? null : (
              <span id={id("desde-cuando")} className="block text-xs">
                {`Se puede registrar desde el ${fechaLargaDeDia(datos.minima)}.`}
              </span>
            )}
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name={id("resultado")}
            value="no_eficaz"
            checked={resultado === "no_eficaz"}
            onChange={() => setResultado("no_eficaz")}
            className={CASILLA}
          />
          <span>No eficaz: se reabre con una ronda nueva</span>
        </label>
      </fieldset>

      <Campo
        etiqueta="Justificación y evidencia objetiva (al menos 20 caracteres)"
        nombre="justificacion"
        id={id("justificacion")}
        ayuda={AVISO_SIN_PACIENTES}
      >
        <textarea
          value={justificacion}
          onChange={(e) => {
            setJustificacion(e.target.value);
            guardar({ justificacion: e.target.value });
          }}
          maxLength={4000}
          rows={3}
          className={claseControl}
        />
      </Campo>

      {cierra ? (
        <div className="flex min-w-0 flex-col gap-3 rounded-md border border-linea-suave p-3">
          <p className="text-sm">Si registra «Eficaz», con la misma firma cierra el hallazgo: escriba lo que se aprendió.</p>
          <Campo etiqueta="Lecciones aprendidas (al menos 10 caracteres)" nombre="lecciones" id={id("lecciones")} ayuda={AVISO_SIN_PACIENTES}>
            <textarea
              value={lecciones}
              onChange={(e) => {
                setLecciones(e.target.value);
                guardar({ lecciones: e.target.value });
              }}
              maxLength={4000}
              rows={3}
              className={claseControl}
            />
          </Campo>
          {pideCambios ? (
            <Campo
              etiqueta="Cómo se atendieron los cambios en documentos, riesgos o controles"
              nombre="cambiosAtendidos"
              id={id("cambios")}
              ayuda={AVISO_SIN_PACIENTES}
            >
              <textarea
                value={cambiosAtendidos}
                onChange={(e) => {
                  setCambiosAtendidos(e.target.value);
                  guardar({ cambiosAtendidos: e.target.value });
                }}
                maxLength={4000}
                rows={2}
                className={claseControl}
              />
            </Campo>
          ) : null}
        </div>
      ) : null}

      {children}

      <div className="flex flex-wrap items-center gap-2">
        <DialogoFirma
          titulo="Evaluar la eficacia"
          etiquetaBoton={cierraAhora ? "Evaluar y cerrar" : "Registrar la evaluación"}
          textoAlFirmar={cierraAhora ? "Firmar «Verificó» y «Cerró»" : "Firmar «Verificó»"}
          accion={accion}
          ocultos={ocultos}
          pideCodigo={pideCodigo}
        >
          {criterios.map((c) => (
            <input key={c} type="hidden" name="criterios" value={c} />
          ))}
          <p className="text-sm">
            {resultado === ""
              ? "Elija el resultado antes de firmar."
              : resultado === "eficaz"
                ? cierraAhora
                  ? "Con su firma, la eficacia queda «Eficaz» y el hallazgo se cierra."
                  : "Con su firma, la eficacia queda «Eficaz» y el hallazgo pasa a cerrarse."
                : "Con su firma, la eficacia queda «No eficaz» y se abre una ronda nueva por formular."}
          </p>
          <p className="text-sm">
            {`Periodo evaluado: ${desde ? fechaDeDia(desde) : "(sin escribir)"} a ${hasta ? fechaDeDia(hasta) : "(sin escribir)"}.`}
          </p>
        </DialogoFirma>
        {derivar ? (
          <Link href={derivar} className={`${claseBoton("secundario")} ${FOCO}`}>
            Registrar un hallazgo distinto
          </Link>
        ) : null}
      </div>
      {derivar ? (
        <p className="text-xs text-muted-foreground">
          Si encontró un problema distinto de este, regístrelo como otro hallazgo: queda enlazado a este como derivado.
        </p>
      ) : null}
    </div>
  );
}
