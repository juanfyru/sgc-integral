"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { EstadoAccion } from "@/app/admin/comun";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { ORIGENES, esExterno, pideReferenciaDelCaso } from "@/lib/mejoramiento/origenes";
import { AVISO_SIN_PACIENTES, ETIQUETA_CLASE, ETIQUETA_CRITERIO, ETIQUETA_CRITICIDAD, ETIQUETA_TIPO_ACCION, textoDeUsuario } from "@/lib/mejoramiento/textos";
import { CLASES, CRITERIOS_EFICACIA, CRITICIDADES, TIPOS_ACCION, type Clase, type Criticidad, type Origen, type TipoAccion } from "@/lib/mejoramiento/tipos";

type Usuario = { id: number; nombre: string; cargo: string | null; etiqueta?: string };

type Props = {
  accion: (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;
  procesos: ReadonlyArray<{ id: number; nombre: string }>;
  normas: ReadonlyArray<{ id: number; nombre: string; titulo: string }>;
  documentos: ReadonlyArray<{ id: number; codigo: string; titulo: string }>;
  /** Los usuarios activos, responsables posibles de una actividad. */
  usuarios: readonly Usuario[];
  /** Los indicadores que se pueden enlazar al criterio de eficacia. */
  indicadores: ReadonlyArray<{ id: number; codigo: string; nombre: string }>;
  /** Hoy en la zona de la instalación (`yyyy-mm-dd`): el tope de toda fecha del papel. */
  hoy: string;
};

type Actividad = { descripcion: string; responsableId: string; inicio: string; fin: string; avance: string; terminada: boolean; terminadaEn: string };
type Accion = { tipo: TipoAccion; descripcion: string; causas: number[]; actividades: Actividad[] };

const actividadVacia = (): Actividad => ({ descripcion: "", responsableId: "", inicio: "", fin: "", avance: "0", terminada: false, terminadaEn: "" });
const accionVacia = (tipo: TipoAccion): Accion => ({ tipo, descripcion: "", causas: [], actividades: [actividadVacia()] });

const METODOS: ReadonlyArray<readonly [string, string]> = [
  ["cinco_porques", "5 porqués"],
  ["ishikawa", "Ishikawa (6M)"],
  ["otro", "Otro método"],
];

const NOTA = "rounded-md border border-border bg-muted px-3 py-2 text-sm";
const BLOQUE = "flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-card p-4";
const TITULO = "font-display text-base font-semibold";

/**
 * Registrar un hallazgo ya en curso (spec 15 §15): el plan que se aprobó en papel, por bloques en el orden del SGC-FO-AC-01
 * (identificación, corrección, análisis, plan y aprobación en papel). Las causas y las acciones con sus actividades se editan en
 * filas y viajan como JSON (`causas`, `acciones`); lo demás, con los nombres de `EsquemaHallazgo` y `CAMPOS_DE_LA_CARGA`. Guardado,
 * lleva a la página del hallazgo, que pide el formato firmado.
 */
export function FormularioCarga({ accion, procesos, normas, documentos, usuarios, indicadores, hoy }: Props) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const [clase, setClase] = useState<string>("");
  const [origen, setOrigen] = useState<string>("");
  const [criticidad, setCriticidad] = useState<string>("");
  const [requerida, setRequerida] = useState<string>("si");
  const [causas, setCausas] = useState<string[]>([""]);
  const [acciones, setAcciones] = useState<Accion[]>([accionVacia("correctiva")]);
  const [criterios, setCriterios] = useState<string[]>([]);
  const esNc = clase === "no_conformidad";
  const externo = origen !== "" && esExterno(origen as Origen);
  const conReferencia = origen !== "" && pideReferenciaDelCaso(origen as Origen);
  const apruebaGerencia = externo || (esNc && criticidad === "alta");

  const cambiarAccion = (i: number, cambio: Partial<Accion>) => setAcciones((l) => l.map((a, j) => (j === i ? { ...a, ...cambio } : a)));
  const cambiarActividad = (i: number, k: number, cambio: Partial<Actividad>) =>
    setAcciones((l) => l.map((a, j) => (j === i ? { ...a, actividades: a.actividades.map((x, m) => (m === k ? { ...x, ...cambio } : x)) } : a)));
  const quitarCausa = (i: number) => {
    setCausas((l) => l.filter((_, j) => j !== i));
    // Las acciones dicen sus causas por número: la quitada sale y las siguientes bajan uno.
    setAcciones((l) => l.map((a) => ({ ...a, causas: a.causas.filter((n) => n !== i + 1).map((n) => (n > i + 1 ? n - 1 : n)) })));
    document.getElementById("carga-anadir-causa")?.focus();
  };

  const causasEnJson = JSON.stringify(causas.map((c) => c.trim()).filter((c) => c !== ""));
  const accionesEnJson = JSON.stringify(
    acciones.map((a) => ({
      tipo: a.tipo,
      descripcion: a.descripcion,
      causas: a.causas,
      actividades: a.actividades.map((x) => ({
        descripcion: x.descripcion,
        responsableId: x.responsableId === "" ? null : Number(x.responsableId),
        inicio: x.inicio,
        fin: x.fin,
        avance: x.terminada ? 100 : Number(x.avance || 0),
        terminadaEn: x.terminada ? x.terminadaEn || null : null,
      })),
    })),
  );

  return (
    <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex min-w-0 flex-col gap-4">
      <input type="hidden" name="causas" value={causasEnJson} />
      <input type="hidden" name="acciones" value={accionesEnJson} />
      <div className={NOTA}>
        <p>Lo que se hizo en papel quedará marcado como hecho fuera de la plataforma, sin firma del sistema.</p>
        <p className="mt-1">
          Guardado, la página del hallazgo le pide el formato firmado escaneado: sin él, las actividades no llegan a sus responsables
          y el plan no se verifica.
        </p>
      </div>
      <p id="carga-aviso" className="text-sm text-muted-foreground">
        {AVISO_SIN_PACIENTES}
      </p>
      {estado?.ok === false ? (
        <p role="alert" className="rounded-md border border-estado-critico/40 bg-estado-critico-fondo px-3 py-2 text-sm text-estado-critico-texto">
          {estado.error}
        </p>
      ) : null}

      <section aria-labelledby="carga-identificacion" className={BLOQUE}>
        <h2 id="carga-identificacion" className={TITULO}>
          1. Identificación
        </h2>
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
            <input type="date" required max={hoy} className={claseControl} />
          </Campo>
          <Campo etiqueta="Fecha en que se registró en papel" nombre="registradoEnPapel">
            <input type="date" required max={hoy} className={claseControl} />
          </Campo>
          <Campo etiqueta="Proceso" nombre="procesoId">
            <select required defaultValue="" className={claseControl}>
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
          {conReferencia ? (
            <Campo etiqueta="Referencia del caso" nombre="referenciaCaso" ayuda="El número del caso, por ejemplo el de la PQRSF o el del evento.">
              <input type="text" required maxLength={100} autoComplete="off" className={claseControl} />
            </Campo>
          ) : null}
          {externo ? (
            <Campo
              etiqueta={origen === "ente_control" ? "Fecha límite de respuesta al ente" : "Fecha límite de respuesta al ente (opcional)"}
              nombre="fechaLimiteEnte"
            >
              <input type="date" required={origen === "ente_control"} className={claseControl} />
            </Campo>
          ) : null}
        </div>
        <Campo etiqueta="Fuente: qué auditoría, visita o caso" nombre="fuente">
          <input type="text" required maxLength={200} autoComplete="off" className={claseControl} />
        </Campo>
        <Campo etiqueta="Título" nombre="titulo">
          <input type="text" required maxLength={150} autoComplete="off" className={claseControl} />
        </Campo>
        <Campo etiqueta="Descripción, con la evidencia objetiva" nombre="descripcion" ayuda={AVISO_SIN_PACIENTES}>
          <textarea required minLength={10} maxLength={4000} rows={4} className={claseControl} />
        </Campo>
        <fieldset className="flex flex-col gap-3 rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-medium">{esNc ? "Requisito incumplido" : "Requisito incumplido (opcional)"}</legend>
          {esNc ? <p className="text-xs text-muted-foreground">Indique al menos uno: la cláusula, una norma o un documento interno.</p> : null}
          <Campo etiqueta="Cláusula o requisito" nombre="requisitoClausula" ayuda="Por ejemplo «ISO 9001: 8.5.1».">
            <input type="text" maxLength={200} autoComplete="off" className={claseControl} />
          </Campo>
          <Campo etiqueta="Norma del normograma" nombre="requisitoNormaId">
            <select defaultValue="" className={claseControl}>
              <option value="">Ninguna</option>
              {normas.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Documento interno" nombre="requisitoDocumentoId">
            <select defaultValue="" className={claseControl}>
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
          <input type="text" maxLength={200} autoComplete="off" className={claseControl} />
        </Campo>
      </section>

      {esNc ? (
        <section aria-labelledby="carga-correccion" className={BLOQUE}>
          <h2 id="carga-correccion" className={TITULO}>
            2. Corrección
          </h2>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">¿Requirió corrección?</legend>
            {[
              ["si", "Sí requirió corrección"],
              ["no", "No requiere corrección inmediata"],
            ].map(([valor, texto]) => (
              <label key={valor} className="flex items-center gap-2 text-sm">
                <input type="radio" name="correccionRequerida" value={valor} checked={requerida === valor} onChange={() => setRequerida(valor)} className="size-4" />
                {texto}
              </label>
            ))}
          </fieldset>
          <Campo
            etiqueta={requerida === "si" ? "Qué se hizo" : "Por qué no la requirió"}
            nombre="correccionDescripcion"
            tambienDescritoPor="carga-aviso"
          >
            <textarea required minLength={10} maxLength={4000} rows={3} className={claseControl} />
          </Campo>
          {requerida === "si" ? (
            <Campo etiqueta="Fecha en que se implementó" nombre="correccionImplementadaEn">
              <input type="date" required max={hoy} className={claseControl} />
            </Campo>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="carga-analisis" className={BLOQUE}>
        <h2 id="carga-analisis" className={TITULO}>
          {esNc ? "3. Análisis de causa raíz" : "3. Análisis de causa raíz (opcional)"}
        </h2>
        <Campo etiqueta="Método" nombre="analisisMetodo">
          <select required defaultValue="cinco_porques" className={claseControl}>
            {METODOS.map(([valor, texto]) => (
              <option key={valor} value={valor}>
                {texto}
              </option>
            ))}
          </select>
        </Campo>
        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="text-sm font-medium">Causas raíz</legend>
          <ol className="flex list-none flex-col gap-2">
            {causas.map((c, i) => (
              <li key={i} className="flex min-w-0 items-end gap-2">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <label htmlFor={`carga-causa-${i}`} className="text-xs font-medium">{`Causa ${i + 1}`}</label>
                  <input
                    id={`carga-causa-${i}`}
                    type="text"
                    maxLength={500}
                    value={c}
                    onChange={(e) => setCausas((l) => l.map((x, j) => (j === i ? e.target.value : x)))}
                    aria-describedby="carga-aviso"
                    className={claseControl}
                  />
                </div>
                {causas.length > 1 ? (
                  <Boton variante="fantasma" tamano="sm" onClick={() => quitarCausa(i)}>
                    Quitar<span className="sr-only">{` la causa ${i + 1}`}</span>
                  </Boton>
                ) : null}
              </li>
            ))}
          </ol>
          {causas.length < 20 ? (
            <Boton id="carga-anadir-causa" variante="secundario" tamano="sm" className="self-start" onClick={() => setCausas((l) => [...l, ""])}>
              Añadir otra causa
            </Boton>
          ) : null}
        </fieldset>
      </section>

      <section aria-labelledby="carga-plan" className={BLOQUE}>
        <h2 id="carga-plan" className={TITULO}>
          4. Plan de acción
        </h2>
        {acciones.map((a, i) => {
          const etiqueta = `A${i + 1}`;
          const clave = `carga-accion-${i}`;
          return (
            <fieldset key={i} className="flex min-w-0 flex-col gap-3 rounded-md border border-linea-suave p-3">
              <legend className="px-1 text-sm font-semibold">{`Acción ${etiqueta}`}</legend>
              <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
                <div className="flex flex-col gap-1">
                  <label htmlFor={`${clave}-tipo`} className="text-sm font-medium">
                    Tipo<span className="sr-only">{` de la acción ${etiqueta}`}</span>
                  </label>
                  <select id={`${clave}-tipo`} value={a.tipo} onChange={(e) => cambiarAccion(i, { tipo: e.target.value as TipoAccion })} className={claseControl}>
                    {TIPOS_ACCION.map((t) => (
                      <option key={t} value={t}>
                        {ETIQUETA_TIPO_ACCION[t]}
                      </option>
                    ))}
                  </select>
                </div>
                <fieldset className="flex min-w-0 flex-col gap-1">
                  <legend className="text-sm font-medium">
                    Causa que ataca<span className="sr-only">{` la acción ${etiqueta}`}</span>
                  </legend>
                  {causas.map((c, n) => (
                    <label key={n} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={a.causas.includes(n + 1)}
                        onChange={(e) =>
                          cambiarAccion(i, { causas: e.target.checked ? [...a.causas.filter((x) => x !== n + 1), n + 1] : a.causas.filter((x) => x !== n + 1) })
                        }
                        className="mt-0.5 size-4 shrink-0"
                      />
                      <span className="min-w-0 break-words">{`${n + 1}. ${c.trim() || "(sin escribir)"}`}</span>
                    </label>
                  ))}
                </fieldset>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor={`${clave}-descripcion`} className="text-sm font-medium">{`Qué se va a hacer (acción ${etiqueta})`}</label>
                <textarea
                  id={`${clave}-descripcion`}
                  rows={2}
                  maxLength={2000}
                  value={a.descripcion}
                  onChange={(e) => cambiarAccion(i, { descripcion: e.target.value })}
                  aria-describedby="carga-aviso"
                  className={claseControl}
                />
              </div>
              <ol className="flex list-none flex-col gap-3">
                {a.actividades.map((x, k) => {
                  const numero = `${etiqueta}.${k + 1}`;
                  const id = `${clave}-act-${k}`;
                  return (
                    <li key={k} className="grid min-w-0 gap-2 rounded-md border border-linea-suave p-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,13rem)_9.5rem_9.5rem]">
                      <div className="flex min-w-0 flex-col gap-1">
                        <label htmlFor={`${id}-descripcion`} className="text-xs font-medium">{`Actividad ${numero}`}</label>
                        <input
                          id={`${id}-descripcion`}
                          type="text"
                          maxLength={1000}
                          value={x.descripcion}
                          onChange={(e) => cambiarActividad(i, k, { descripcion: e.target.value })}
                          aria-describedby="carga-aviso"
                          className={claseControl}
                        />
                      </div>
                      <div className="flex min-w-0 flex-col gap-1">
                        <label htmlFor={`${id}-responsable`} className="text-xs font-medium">
                          Responsable<span className="sr-only">{` de la actividad ${numero}`}</span>
                        </label>
                        <select
                          id={`${id}-responsable`}
                          value={x.responsableId}
                          onChange={(e) => cambiarActividad(i, k, { responsableId: e.target.value })}
                          className={`${claseControl} min-w-0`}
                        >
                          <option value="">Elija el responsable</option>
                          {usuarios.map((u) => (
                            <option key={u.id} value={u.id}>
                              {textoDeUsuario(u)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex min-w-0 flex-col gap-1">
                        <label htmlFor={`${id}-inicio`} className="text-xs font-medium">
                          Inicio<span className="sr-only">{` de la actividad ${numero}`}</span>
                        </label>
                        <input id={`${id}-inicio`} type="date" value={x.inicio} onChange={(e) => cambiarActividad(i, k, { inicio: e.target.value })} className={claseControl} />
                      </div>
                      <div className="flex min-w-0 flex-col gap-1">
                        <label htmlFor={`${id}-fin`} className="text-xs font-medium">
                          Fin<span className="sr-only">{` de la actividad ${numero}`}</span>
                        </label>
                        <input id={`${id}-fin`} type="date" value={x.fin} onChange={(e) => cambiarActividad(i, k, { fin: e.target.value })} className={claseControl} />
                      </div>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={x.terminada}
                          onChange={(e) => cambiarActividad(i, k, { terminada: e.target.checked })}
                          className="size-4"
                        />
                        Ya terminó<span className="sr-only">{` la actividad ${numero}`}</span>
                      </label>
                      {x.terminada ? (
                        <div className="flex min-w-0 flex-col gap-1">
                          <label htmlFor={`${id}-terminada`} className="text-xs font-medium">
                            Terminó el<span className="sr-only">{` (actividad ${numero})`}</span>
                          </label>
                          <input
                            id={`${id}-terminada`}
                            type="date"
                            max={hoy}
                            value={x.terminadaEn}
                            onChange={(e) => cambiarActividad(i, k, { terminadaEn: e.target.value })}
                            className={claseControl}
                          />
                        </div>
                      ) : (
                        <div className="flex min-w-0 flex-col gap-1">
                          <label htmlFor={`${id}-avance`} className="text-xs font-medium">
                            Avance de hoy (%)<span className="sr-only">{` de la actividad ${numero}`}</span>
                          </label>
                          <input
                            id={`${id}-avance`}
                            type="number"
                            min={0}
                            max={99}
                            value={x.avance}
                            onChange={(e) => cambiarActividad(i, k, { avance: e.target.value })}
                            className={claseControl}
                          />
                        </div>
                      )}
                      {a.actividades.length > 1 ? (
                        <Boton
                          variante="fantasma"
                          tamano="sm"
                          className="justify-self-start"
                          onClick={() => {
                            cambiarAccion(i, { actividades: a.actividades.filter((_, m) => m !== k) });
                            document.getElementById(`${clave}-anadir-actividad`)?.focus();
                          }}
                        >
                          Quitar<span className="sr-only">{` la actividad ${numero}`}</span>
                        </Boton>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
              <div className="flex flex-wrap gap-2">
                {a.actividades.length < 30 ? (
                  <Boton
                    id={`${clave}-anadir-actividad`}
                    variante="secundario"
                    tamano="sm"
                    onClick={() => cambiarAccion(i, { actividades: [...a.actividades, actividadVacia()] })}
                  >
                    Añadir otra actividad<span className="sr-only">{` a la acción ${etiqueta}`}</span>
                  </Boton>
                ) : null}
                {acciones.length > 1 ? (
                  <Boton
                    variante="fantasma"
                    tamano="sm"
                    onClick={() => {
                      setAcciones((l) => l.filter((_, j) => j !== i));
                      document.getElementById("carga-anadir-accion")?.focus();
                    }}
                  >
                    Quitar la acción {etiqueta}
                  </Boton>
                ) : null}
              </div>
            </fieldset>
          );
        })}
        {acciones.length < 20 ? (
          <Boton
            id="carga-anadir-accion"
            variante="secundario"
            className="self-start"
            onClick={() => setAcciones((l) => [...l, accionVacia(esNc ? "correctiva" : clase === "observacion" ? "preventiva" : "mejora")])}
          >
            Añadir otra acción
          </Boton>
        ) : null}

        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="text-sm font-semibold">Criterio de eficacia</legend>
          {CRITERIOS_EFICACIA.map((c) => (
            <label key={c} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="criterios"
                value={c}
                checked={criterios.includes(c)}
                onChange={(e) => setCriterios((l) => (e.target.checked ? [...l.filter((x) => x !== c), c] : l.filter((x) => x !== c)))}
                className="size-4"
              />
              {ETIQUETA_CRITERIO[c]}
            </label>
          ))}
        </fieldset>
        {criterios.includes("mejora_indicador") ? (
          <Campo etiqueta="Indicador enlazado" nombre="indicadorEficaciaId">
            <select required defaultValue="" className={claseControl}>
              <option value="">Elija el indicador</option>
              {indicadores.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.codigo} · {x.nombre}
                </option>
              ))}
            </select>
          </Campo>
        ) : null}
        {criterios.includes("otro") ? (
          <Campo etiqueta="El otro criterio" nombre="criterioOtro" tambienDescritoPor="carga-aviso">
            <input type="text" required maxLength={500} className={claseControl} />
          </Campo>
        ) : null}
        {clase !== "" && !esNc ? (
          <Campo etiqueta="Fecha de evaluación de la eficacia" nombre="fechaEvaluacion">
            <input type="date" required className={claseControl} />
          </Campo>
        ) : null}
      </section>

      <section aria-labelledby="carga-aprobacion" className={BLOQUE}>
        <h2 id="carga-aprobacion" className={TITULO}>
          5. Aprobación en papel
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Nombre de quien aprobó el plan" nombre="aprobacionNombre">
            <input type="text" required maxLength={150} autoComplete="off" className={claseControl} />
          </Campo>
          <Campo etiqueta="Su cargo" nombre="aprobacionCargo">
            <input type="text" required maxLength={150} autoComplete="off" className={claseControl} />
          </Campo>
          <Campo etiqueta="Fecha en que se aprobó" nombre="aprobacionFecha">
            <input type="date" required max={hoy} className={claseControl} />
          </Campo>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Qué rol lo aprobó</legend>
          {[
            ["gerencia", "Gerencia"],
            ["admin_sgc", "El Coordinador del SGC"],
          ].map(([valor, texto]) => (
            <label key={valor} className="flex items-center gap-2 text-sm">
              <input type="radio" name="aprobacionRol" value={valor} required defaultChecked={valor === "gerencia"} className="size-4" />
              {texto}
            </label>
          ))}
        </fieldset>
        <p role="status" className="text-sm text-muted-foreground">
          {apruebaGerencia
            ? "Es de criticidad alta o de origen externo: los ajustes de su plan los decide Gerencia, sea cual sea el rol que lo aprobó."
            : "Los ajustes de su plan los decide el rol que lo aprobó."}
        </p>
      </section>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Link
          href="/mejoramiento"
          className="inline-flex items-center rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
        >
          Cancelar
        </Link>
        <Boton type="submit" variante="primario" pendiente={pendiente}>
          Cargar el hallazgo
        </Boton>
      </div>
    </form>
  );
}
