"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { EstadoAccion } from "@/app/admin/comun";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { Boton } from "@/componentes/ui/Boton";
import { ParecidosDelProceso } from "@/componentes/mejoramiento/ParecidosDelProceso";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { ORIGENES, esExterno, pideReferenciaDelCaso } from "@/lib/mejoramiento/origenes";
import { AVISO_SIN_PACIENTES, ETIQUETA_CLASE, ETIQUETA_CRITICIDAD } from "@/lib/mejoramiento/textos";
import { CLASES, CRITICIDADES, type Clase, type Criticidad, type Origen } from "@/lib/mejoramiento/tipos";

type Props = {
  accion: (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;
  /** Solo los procesos que quien registra alcanza (`procesosDelAlcance`). */
  procesos: ReadonlyArray<{ id: number; nombre: string }>;
  /** Las normas vigentes o modificadas del normograma y los documentos vigentes que quien registra ve. */
  normas?: ReadonlyArray<{ id: number; nombre: string; titulo: string }>;
  documentos?: ReadonlyArray<{ id: number; codigo: string; titulo: string }>;
  /** Hoy en la zona de la instalación (`yyyy-mm-dd`): el tope de la fecha de detección. */
  hoy: string;
  /** El plazo de aceptar, en días hábiles, de la configuración. */
  diasParaAceptar: number;
  /** Lo escrito antes de un rechazo, o los valores iniciales. */
  valores?: Record<string, string | string[]>;
  /** Lo que se muestra a la derecha, bajo los parecidos del mismo proceso. */
  lateral?: React.ReactNode;
  /** Editar un hallazgo «Por aceptar» (spec §7.6): sin parecidos, y el envío guarda los cambios en vez de registrar. */
  edicion?: { hallazgoId: number };
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
 */
export function FormularioHallazgo({ accion, procesos, normas = [], documentos = [], hoy, diasParaAceptar, valores, lateral, edicion }: Props) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const v = estado?.valores ?? valores;
  const [clase, setClase] = useState<string>(texto(v, "clase"));
  const [origen, setOrigen] = useState<string>(texto(v, "origen"));
  const [criticidad, setCriticidad] = useState<string>(texto(v, "criticidad"));
  const esNc = clase === "no_conformidad";
  const externo = origen !== "" && esExterno(origen as Origen);
  const origenDelCaso = origen !== "" && pideReferenciaDelCaso(origen as Origen);
  const unico = procesos.length === 1 ? String(procesos[0].id) : "";
  const [procesoId, setProcesoId] = useState<string>(texto(v, "procesoId", unico));
  // Lo que se compara con los demás hallazgos se toma al salir de cada campo, no en cada tecla.
  const [titulo, setTitulo] = useState<string>(texto(v, "titulo"));
  const [descripcion, setDescripcion] = useState<string>(texto(v, "descripcion"));
  const [relacion, setRelacion] = useState<string>(texto(v, "relacion", "distinto"));
  const esOcurrencia = relacion.startsWith("ocurrencia:");

  return (
    <div className={edicion && !lateral ? "grid gap-6" : "grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]"}>
      <form id="formulario-hallazgo" action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex min-w-0 flex-col gap-4">
        {edicion ? <input type="hidden" name="hallazgoId" value={edicion.hallazgoId} /> : null}
        {estado?.ok === false ? (
          <p role="alert" className="rounded-md border border-estado-critico/40 bg-estado-critico-fondo px-3 py-2 text-sm text-estado-critico-texto">
            {estado.error}
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
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
          <Campo etiqueta="Fecha en que se detectó" nombre="detectadoEn">
            <input type="date" required max={hoy} defaultValue={texto(v, "detectadoEn", hoy)} className={claseControl} />
          </Campo>
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
          {origenDelCaso ? (
            <Campo etiqueta="Referencia del caso" nombre="referenciaCaso" ayuda="El número del caso, por ejemplo el de la PQRSF o el del evento.">
              <input type="text" required maxLength={100} defaultValue={texto(v, "referenciaCaso")} autoComplete="off" className={claseControl} />
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
          <input type="text" required maxLength={200} defaultValue={texto(v, "fuente")} autoComplete="off" className={claseControl} />
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
        <fieldset className="flex flex-col gap-3 rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-medium">{esNc ? "Requisito incumplido" : "Requisito incumplido (opcional)"}</legend>
          {esNc ? <p className="text-xs text-muted-foreground">Indique al menos uno: la cláusula, una norma o un documento interno.</p> : null}
        <Campo etiqueta="Cláusula o requisito" nombre="requisitoClausula" ayuda="Por ejemplo «ISO 9001: 8.5.1».">
          <input type="text" maxLength={200} defaultValue={texto(v, "requisitoClausula")} autoComplete="off" className={claseControl} />
        </Campo>
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
        <Campo etiqueta="Riesgo asociado (opcional)" nombre="riesgo">
          <input type="text" maxLength={200} defaultValue={texto(v, "riesgo")} autoComplete="off" className={claseControl} />
        </Campo>

        <div role="status" className="flex flex-col gap-2">
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
            />
          )}
          {lateral}
        </aside>
      )}
    </div>
  );
}
