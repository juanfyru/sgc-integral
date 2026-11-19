"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { EstadoAccion } from "@/app/admin/comun";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { Boton } from "@/componentes/ui/Boton";
import { AQueSeRefiere, CampoObjetivo, fijosEnTexto, RotuloYOcultos, TextoFijo, valoresIniciales } from "@/componentes/mejoramiento/AQueSeRefiere";
import { ParecidosDelProceso } from "@/componentes/mejoramiento/ParecidosDelProceso";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import type { Prellenado } from "@/db/consultas/mejoramiento/prellenado";
import { fechaDeDia } from "@/lib/mejoramiento/formato";
import { ETIQUETA_ORIGEN, ORIGENES, esExterno, pideReferenciaDelCaso } from "@/lib/mejoramiento/origenes";
import { rutaDeMarcas } from "@/lib/mejoramiento/rutas";
import { AVISO_SIN_PACIENTES, ETIQUETA_CLASE, ETIQUETA_CRITICIDAD } from "@/lib/mejoramiento/textos";
import { CLASES, CRITICIDADES, type Clase, type Criticidad, type Origen } from "@/lib/mejoramiento/tipos";

type Props = {
  accion: (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;
  /** Solo los procesos que quien registra alcanza (`procesosDelAlcance`). */
  procesos: ReadonlyArray<{ id: number; nombre: string }>;
  /** Las normas vigentes o modificadas del normograma y los documentos vigentes que quien registra ve. */
  normas?: ReadonlyArray<{ id: number; nombre: string; titulo: string }>;
  documentos?: ReadonlyArray<{ id: number; codigo: string; titulo: string }>;
  /** «A qué se refiere» (Fase 15B): los indicadores activos o retirados que ve y sus mediciones con resultado. */
  indicadores?: ReadonlyArray<{ id: number; codigo: string; nombre: string; restringido?: boolean }>;
  mediciones?: ReadonlyArray<{ id: number; indicadorId: number; etiqueta: string }>;
  /** Los objetivos activos del maestro (`objetivosActivos`). */
  objetivos?: ReadonlyArray<{ id: number; etiqueta: string }>;
  /**
   * Lo que llega puesto desde la dirección (`prellenadoDeRegistro`): lo propuesto, lo fijo (texto con su campo oculto), los campos
   * ocultos y el rótulo de arriba. En la edición solo valen lo fijo y los procesos: los de la no conformidad de un hallazgo de
   * verificación (Fase 15B, anexo §7.2), que la página de edición arma.
   */
  prellenado?: Prellenado;
  /** Hoy en la zona de la instalación (`yyyy-mm-dd`): el tope de la fecha de detección. */
  hoy: string;
  /** El plazo de aceptar, en días hábiles, de la configuración. */
  diasParaAceptar: number;
  /** Lo escrito antes de un rechazo, o los valores iniciales: mandan sobre lo propuesto del prellenado, no sobre lo fijo. */
  valores?: Record<string, string | string[]>;
  /** Lo que se muestra a la derecha, bajo los parecidos del mismo proceso. */
  lateral?: React.ReactNode;
  /** Editar un hallazgo «Por aceptar» (spec §7.6): sin parecidos, y el envío guarda los cambios en vez de registrar. */
  edicion?: { hallazgoId: number };
  /** El hallazgo en cuya verificación se encontró este, distinto (spec §11.4): viaja en `derivadoDe` y queda enlazado. */
  derivado?: { id: number; codigo: string; titulo: string };
  /**
   * El reporte de un funcionario que se convierte (spec §7.3): viaja en `reporteId` y el registro lo deja «En trámite»; si se elige
   * una ocurrencia entre los parecidos, se suma a ese hallazgo. Lo recibe solo quien clasifica (`mejora.gestionar`).
   */
  reporte?: { id: number; reportadoPor: string; vistoEn: string };
};

const texto = (v: Record<string, string | string[]> | undefined, c: string, defecto = ""): string => {
  const x = v?.[c];
  return typeof x === "string" ? x : defecto;
};

const NOTA = "rounded-md border border-border bg-muted px-3 py-2 text-sm";

/**
 * El formulario de registro de un hallazgo (spec 15 §7.1 y §16.2, maqueta 3). Un solo formulario: lo que depende de la clase
 * y del origen aparece y desaparece (la criticidad, la referencia del caso, la fecha límite al ente) y las notas dicen lo
 * que ese hallazgo llevará. Los nombres de los campos son los de `EsquemaHallazgo`, que es estricto.
 *
 * Al registrar (no al editar) gana «A qué se refiere» y «Objetivo» (Fase 15B, anexo §10.3 y §10.4), y lo que trae `prellenado`.
 * Editar no los pinta: la edición conserva los enlaces que el hallazgo ya tiene y el objetivo se cambia en «Clasificación». La
 * edición de la no conformidad de un hallazgo de verificación sí respeta lo fijo y los procesos del `prellenado` (anexo §7.2).
 */
export function FormularioHallazgo({
  accion,
  procesos: delAlcance,
  normas = [],
  documentos = [],
  indicadores = [],
  mediciones = [],
  objetivos = [],
  prellenado,
  hoy,
  diasParaAceptar,
  valores,
  lateral,
  edicion,
  derivado,
  reporte,
}: Props) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const conPrellenado = edicion ? undefined : prellenado;
  // Desde un hallazgo de verificación (Fase 15B, anexo §7.2), el proceso se elige entre los del punto y, al registrar, se pide la
  // justificación de la acción correctiva; el servidor lo vuelve a comprobar. En la edición también: el prellenado solo trae lo fijo y
  // los procesos.
  const permitidos = prellenado?.procesos;
  const procesos = permitidos ? delAlcance.filter((p) => permitidos.includes(p.id)) : delAlcance;
  const deVerificacion = conPrellenado !== undefined && Object.hasOwn(conPrellenado.ocultos, "verificacionHallazgoId");
  // Desde un impacto de norma (anexo §8): el origen, la norma y el proceso llegan fijos y no se ofrece la ocurrencia de un parecido.
  const deImpacto =
    conPrellenado !== undefined && (Object.hasOwn(conPrellenado.ocultos, "impactoId") || Object.hasOwn(conPrellenado.ocultos, "impactoIndicadorId"));
  // Lo fijo manda también sobre lo que volvió de un rechazo y sobre lo guardado: se muestra y viaja con el valor del prellenado.
  const fijos = fijosEnTexto(prellenado);
  const fijo = (k: string) => Object.hasOwn(fijos, k);
  const v = estado?.valores ? { ...estado.valores, ...fijos } : { ...valoresIniciales(conPrellenado, valores), ...fijos };
  const [clase, setClase] = useState<string>(texto(v, "clase"));
  const [origen, setOrigen] = useState<string>(texto(v, "origen"));
  const [criticidad, setCriticidad] = useState<string>(texto(v, "criticidad"));
  const esNc = clase === "no_conformidad";
  const externo = origen !== "" && esExterno(origen as Origen);
  const origenDelCaso = origen !== "" && pideReferenciaDelCaso(origen as Origen);
  // La referencia copiada de un reporte se conserva aunque el origen elegido no la pida.
  const conReferencia = origenDelCaso || (reporte !== undefined && !edicion && texto(v, "referenciaCaso") !== "");
  const unico = procesos.length === 1 ? String(procesos[0].id) : "";
  const [procesoId, setProcesoId] = useState<string>(texto(v, "procesoId", unico));
  // Lo que se compara con los demás hallazgos se toma al salir de cada campo, no en cada tecla.
  const [titulo, setTitulo] = useState<string>(texto(v, "titulo"));
  const [descripcion, setDescripcion] = useState<string>(texto(v, "descripcion"));
  const [relacion, setRelacion] = useState<string>(texto(v, "relacion", "distinto"));
  const esOcurrencia = relacion.startsWith("ocurrencia:");
  const [indicadorId, setIndicadorId] = useState<string>(texto(v, "indicadorId"));
  const [medicionId, setMedicionId] = useState<string>(texto(v, "medicionId"));
  // La fuente es obligatoria salvo en «Indicador» con la medición enlazada (`fuenteObligatoria`, spec §7.1).
  const fuenteObligatoria = !(origen === "indicador" && medicionId !== "");
  // Desde el panel de la marca de un indicador (Fase 15B, anexo §6.2) no se ofrece la ocurrencia de un parecido: se añade desde ese
  // panel, que deja la salida de la marca. El enlace vuelve a él, si el indicador fijo está entre los que se ofrecen.
  const indicadorDelPanel = indicadores.find((i) => String(i.id) === fijos.indicadorId);
  const desdeElPanel =
    conPrellenado && Object.hasOwn(conPrellenado.ocultos, "marcaMedicionId")
      ? { enlace: indicadorDelPanel ? rutaDeMarcas(indicadorDelPanel.codigo) : null }
      : undefined;

  return (
    <div className={edicion && !lateral ? "grid grid-cols-1 gap-6" : "grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]"}>
      <form id="formulario-hallazgo" action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex min-w-0 flex-col gap-4">
        {edicion ? <input type="hidden" name="hallazgoId" value={edicion.hallazgoId} /> : null}
        <RotuloYOcultos prellenado={conPrellenado} />
        {derivado && !edicion ? (
          <>
            <input type="hidden" name="derivadoDe" value={derivado.id} />
            <p className={NOTA}>
              Derivado de <span className="font-semibold">{derivado.codigo}</span> {derivado.titulo}: queda enlazado a él.
            </p>
          </>
        ) : null}
        {reporte && !edicion ? (
          <>
            <input type="hidden" name="reporteId" value={reporte.id} />
            <p className={NOTA}>
              Convierte el reporte de <span className="font-semibold">{reporte.reportadoPor}</span> de lo que vio el{" "}
              {fechaDeDia(reporte.vistoEn)}: al registrarlo, el reporte queda en trámite. Complete la clase, el origen y lo demás.
            </p>
          </>
        ) : null}
        {estado?.ok === false ? (
          <p role="alert" className="rounded-md border border-estado-critico/40 bg-estado-critico-fondo px-3 py-2 text-sm text-estado-critico-texto">
            {estado.error}
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {fijo("clase") ? (
            <TextoFijo etiqueta="Clase" nombre="clase" valor={fijos.clase} texto={ETIQUETA_CLASE[fijos.clase as Clase] ?? fijos.clase} />
          ) : (
            <Campo etiqueta="Clase" nombre="clase">
              <select required value={clase} onChange={(e) => setClase(e.target.value)} className={claseControl}>
                <option value="">Elija la clase</option>
                {CLASES.map((c: Clase) => (
                  <option key={c} value={c}>
                    {ETIQUETA_CLASE[c]}
                  </option>
                ))}
              </select>
            </Campo>
          )}
          {fijo("origen") ? (
            <TextoFijo etiqueta="Origen" nombre="origen" valor={fijos.origen} texto={ETIQUETA_ORIGEN[fijos.origen as Origen] ?? fijos.origen} />
          ) : (
            <Campo etiqueta="Origen" nombre="origen">
              <select required value={origen} onChange={(e) => setOrigen(e.target.value)} className={claseControl}>
                <option value="">Elija el origen</option>
                {ORIGENES.map((o) => (
                  <option key={o.clave} value={o.clave}>
                    {o.etiqueta}
                  </option>
                ))}
              </select>
            </Campo>
          )}
          <Campo etiqueta="Fecha en que se detectó" nombre="detectadoEn">
            <input type="date" required max={hoy} defaultValue={texto(v, "detectadoEn", hoy)} className={claseControl} />
          </Campo>
          {fijo("procesoId") ? (
            <TextoFijo
              etiqueta="Proceso"
              nombre="procesoId"
              valor={fijos.procesoId}
              texto={procesos.find((p) => String(p.id) === fijos.procesoId)?.nombre ?? fijos.procesoId}
            />
          ) : (
            <Campo etiqueta="Proceso" nombre="procesoId" ayuda={procesos.length === 0 ? "No tiene procesos activos a su cargo." : undefined}>
              <select required value={procesoId} onChange={(e) => setProcesoId(e.target.value)} className={claseControl}>
                <option value="">Elija el proceso</option>
                {procesos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </Campo>
          )}
          {esNc ? (
            <Campo etiqueta="Criticidad" nombre="criticidad">
              <select required value={criticidad} onChange={(e) => setCriticidad(e.target.value)} className={claseControl}>
                <option value="">Elija la criticidad</option>
                {CRITICIDADES.map((c: Criticidad) => (
                  <option key={c} value={c}>
                    {ETIQUETA_CRITICIDAD[c]}
                  </option>
                ))}
              </select>
            </Campo>
          ) : null}
          {conReferencia ? (
            <Campo
              etiqueta={origenDelCaso ? "Referencia del caso" : "Referencia del caso (opcional)"}
              nombre="referenciaCaso"
              ayuda="El número del caso, por ejemplo el de la PQRSF o el del evento."
            >
              <input type="text" required={origenDelCaso} maxLength={100} defaultValue={texto(v, "referenciaCaso")} autoComplete="off" className={claseControl} />
            </Campo>
          ) : null}
          {externo ? (
            <Campo
              etiqueta={origen === "ente_control" ? "Fecha límite de respuesta al ente" : "Fecha límite de respuesta al ente (opcional)"}
              nombre="fechaLimiteEnte"
            >
              <input type="date" required={origen === "ente_control"} defaultValue={texto(v, "fechaLimiteEnte")} className={claseControl} />
            </Campo>
          ) : null}
        </div>

        <Campo etiqueta="Fuente: qué auditoría, visita o caso" nombre="fuente">
          <input type="text" required={fuenteObligatoria} maxLength={200} defaultValue={texto(v, "fuente")} autoComplete="off" className={claseControl} />
        </Campo>
        <Campo etiqueta="Título" nombre="titulo">
          <input
            type="text"
            required
            maxLength={150}
            defaultValue={texto(v, "titulo")}
            onBlur={(e) => setTitulo(e.currentTarget.value)}
            autoComplete="off"
            className={claseControl}
          />
        </Campo>
        <Campo etiqueta="Descripción, con la evidencia objetiva" nombre="descripcion" ayuda={AVISO_SIN_PACIENTES}>
          <textarea
            required
            minLength={10}
            maxLength={4000}
            rows={5}
            defaultValue={texto(v, "descripcion")}
            onBlur={(e) => setDescripcion(e.currentTarget.value)}
            className={claseControl}
          />
        </Campo>
        {deVerificacion ? (
          <Campo
            etiqueta="Justificación de la acción correctiva"
            nombre="accionJustificacion"
            ayuda={`Por qué esta falla necesita tratar su causa, al menos 10 caracteres. ${AVISO_SIN_PACIENTES}`}
          >
            <textarea required minLength={10} maxLength={1000} rows={3} defaultValue={texto(v, "accionJustificacion")} className={claseControl} />
          </Campo>
        ) : null}
        <fieldset className="flex min-w-0 flex-col gap-3 rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-medium">{esNc ? "Requisito incumplido" : "Requisito incumplido (opcional)"}</legend>
          {esNc ? <p className="text-xs text-muted-foreground">Indique al menos uno: la cláusula, una norma o un documento interno.</p> : null}
        <Campo etiqueta="Cláusula o requisito" nombre="requisitoClausula" ayuda="Por ejemplo «ISO 9001: 8.5.1».">
          <input type="text" maxLength={200} defaultValue={texto(v, "requisitoClausula")} autoComplete="off" className={claseControl} />
        </Campo>
        {fijo("requisitoNormaId") ? (
          <TextoFijo
            etiqueta="Norma del normograma"
            nombre="requisitoNormaId"
            valor={fijos.requisitoNormaId}
            texto={normas.find((n) => String(n.id) === fijos.requisitoNormaId)?.nombre ?? fijos.requisitoNormaId}
          />
        ) : (
          <Campo etiqueta="Norma del normograma" nombre="requisitoNormaId">
            <select defaultValue={texto(v, "requisitoNormaId")} className={claseControl}>
              <option value="">Ninguna</option>
              {normas.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.nombre}
                </option>
              ))}
            </select>
          </Campo>
        )}
        <Campo etiqueta="Documento interno" nombre="requisitoDocumentoId">
          <select defaultValue={texto(v, "requisitoDocumentoId")} className={claseControl}>
            <option value="">Ninguno</option>
            {documentos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.codigo} · {d.titulo}
              </option>
            ))}
          </select>
        </Campo>
        </fieldset>
        {edicion ? null : (
          <AQueSeRefiere
            documentos={documentos}
            indicadores={indicadores}
            mediciones={mediciones}
            documentoId={texto(v, "documentoId")}
            indicadorId={indicadorId}
            medicionId={medicionId}
            alCambiarIndicador={setIndicadorId}
            alCambiarMedicion={setMedicionId}
            fijos={fijos}
          />
        )}
        <Campo etiqueta="Riesgo asociado (opcional)" nombre="riesgo">
          <input type="text" maxLength={200} defaultValue={texto(v, "riesgo")} autoComplete="off" className={claseControl} />
        </Campo>
        {edicion ? null : <CampoObjetivo objetivos={objetivos} valor={texto(v, "objetivoId")} />}

        <div role="status" className="flex flex-col gap-2">
          {reporte && !edicion && esOcurrencia ? (
            <p className={NOTA}>
              El reporte se añade como ocurrencia con lo que se vio y el día del reporte; lo que escriba aquí no se guarda.
            </p>
          ) : null}
          {externo ? <p className={NOTA}>Este hallazgo no se puede rechazar y lo aprobará Gerencia.</p> : null}
          {esNc && criticidad === "alta" ? <p className={NOTA}>Llevará acción correctiva y lo aprobará Gerencia.</p> : null}
          {!externo ? (
            <p className="text-sm text-muted-foreground">
              La líder del proceso tiene {diasParaAceptar} días hábiles para aceptarlo o rechazarlo, salvo que usted lo lidere.
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link
            href={edicion ? `/mejoramiento/${edicion.hallazgoId}` : "/mejoramiento"}
            className="inline-flex items-center rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
          >
            Cancelar
          </Link>
          <Boton type="submit" variante="primario" pendiente={pendiente}>
            {edicion ? "Guardar los cambios" : esOcurrencia ? "Añadir la ocurrencia" : "Registrar el hallazgo"}
          </Boton>
        </div>
      </form>
      {edicion && !lateral ? null : (
        <aside className="flex min-w-0 flex-col gap-4">
          {edicion ? null : (
            <ParecidosDelProceso
              procesoId={procesoId}
              proceso={procesos.find((p) => String(p.id) === procesoId)?.nombre ?? null}
              texto={`${titulo} ${descripcion}`}
              relacion={relacion}
              alCambiar={setRelacion}
              desdeElPanel={desdeElPanel}
              desdeUnaVerificacion={deVerificacion}
              desdeUnImpacto={deImpacto}
            />
          )}
          {lateral}
        </aside>
      )}
    </div>
  );
}
