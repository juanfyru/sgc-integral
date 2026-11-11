"use client";

import { useActionState } from "react";
import {
  activarEnMaestroAccion,
  borrarDeMaestroAccion,
  guardarEnMaestroAccion,
} from "@/app/admin/acciones-indicadores";
import type { EstadoAccion } from "@/app/admin/comun";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { Boton, type VarianteBoton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { Insignia } from "@/componentes/ui/Insignia";
import type { FilaMaestro, Maestro } from "@/db/consultas/indicadores/maestros";
import { cuenta } from "@/lib/plural";

const CONTROL = `${claseControl} w-full min-w-0 max-w-full`;
const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

type Accion = (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;

/** Una acción en su propio formulario: el error se dice junto al botón, y los valores escritos no se pierden. */
function FormularioAccion({
  accion,
  campos,
  boton,
  etiquetaAria,
  variante = "primario",
  children,
}: {
  accion: Accion;
  campos: Record<string, string | number>;
  boton: string;
  etiquetaAria?: string;
  variante?: VarianteBoton;
  children?: React.ReactNode;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  return (
    <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex min-w-0 flex-col items-start gap-2">
      {Object.entries(campos).map(([nombre, valor]) => (
        <input key={nombre} type="hidden" name={nombre} value={valor} />
      ))}
      {children ? <div className="flex w-full min-w-0 flex-col gap-3">{children}</div> : null}
      <Boton type="submit" variante={variante} tamano="sm" pendiente={pendiente} aria-label={etiquetaAria}>
        {pendiente ? "Procesando…" : boton}
      </Boton>
      {estado ? (
        <p role="alert" className="text-sm text-estado-critico-texto">
          {estado.error}
        </p>
      ) : null}
    </form>
  );
}

function Desplegable({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <details className="min-w-0 rounded-md border border-border p-2">
      <summary className={`cursor-pointer rounded text-sm font-medium ${FOCO}`}>{titulo}</summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

/** Los campos propios de cada maestro; `f` es la fila que se edita, si la hay. */
function Campos({ maestro, f, sufijoId }: { maestro: Maestro; f?: FilaMaestro; sufijoId: string }) {
  const id = (campo: string) => `${maestro}-${sufijoId}-${campo}`;
  if (maestro === "objetivos") {
    return (
      <>
        <Campo etiqueta="Clase" nombre="clase" id={id("clase")}>
          <select required defaultValue={f?.clase ?? "calidad"} className={CONTROL}>
            <option value="calidad">De calidad</option>
            <option value="institucional">Institucional</option>
          </select>
        </Campo>
        <Campo etiqueta="Enunciado" nombre="enunciado" id={id("enunciado")} ayuda="Hasta 500 caracteres.">
          <textarea required maxLength={500} rows={3} defaultValue={f?.enunciado} className={CONTROL} />
        </Campo>
      </>
    );
  }
  return (
    <>
      <Campo etiqueta="Nombre" nombre="nombre" id={id("nombre")} ayuda="Entre 2 y 80 caracteres.">
        <input required minLength={2} maxLength={80} defaultValue={f?.nombre} className={CONTROL} />
      </Campo>
      {maestro === "clasificaciones" ? (
        <>
          <Campo etiqueta="Quién aprueba la ficha" nombre="aprueba" id={id("aprueba")}>
            <select required defaultValue={f?.aprueba ?? "gerencia"} className={CONTROL}>
              <option value="gerencia">Gerencia</option>
              <option value="lider">El líder del proceso</option>
            </select>
          </Campo>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="exigeNorma" defaultChecked={f?.exigeNorma ?? false} />
            Exige una norma que la respalde
          </label>
        </>
      ) : null}
      {maestro === "unidades" ? (
        <>
          <Campo etiqueta="Sufijo" nombre="sufijo" id={id("sufijo")} ayuda="Lo que se escribe tras la cifra, como «%» o « min». Hasta 12 caracteres.">
            <input maxLength={12} defaultValue={f?.sufijo} className={CONTROL} />
          </Campo>
          <Campo etiqueta="Decimales" nombre="decimales" id={id("decimales")} ayuda="De 0 a 4.">
            <input type="number" required min={0} max={4} step={1} defaultValue={f?.decimales ?? 0} className={CONTROL} />
          </Campo>
        </>
      ) : null}
    </>
  );
}

function detalleDe(maestro: Maestro, f: FilaMaestro): string {
  if (maestro === "clasificaciones") {
    return `Aprueba ${f.aprueba === "gerencia" ? "Gerencia" : "el líder del proceso"}${f.exigeNorma ? "; exige norma" : ""}`;
  }
  if (maestro === "unidades") return `Sufijo «${f.sufijo ?? ""}», ${cuenta(f.decimales ?? 0, "decimal", "decimales")}`;
  if (maestro === "objetivos") return f.clase === "calidad" ? "Objetivo de calidad" : "Objetivo institucional";
  return "";
}

const SINGULAR: Record<Maestro, string> = { tipos: "tipo", clasificaciones: "clasificación", unidades: "unidad", objetivos: "objetivo" };

/**
 * Un maestro de la ficha (spec 14 §12.6): crear, editar, activar o desactivar y, si ninguna versión lo usa, borrar.
 * Uno inactivo deja de ofrecerse al elaborar una ficha.
 */
export function TablaMaestro({
  maestro,
  filas,
  titulo,
  descripcion,
}: {
  maestro: Maestro;
  filas: FilaMaestro[];
  titulo: string;
  descripcion: string;
}) {
  const tituloId = `titulo-maestro-${maestro}`;
  const singular = SINGULAR[maestro];
  return (
    <section aria-labelledby={tituloId} className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-4">
      <div>
        <h2 id={tituloId} className="text-base font-semibold">
          {titulo}
        </h2>
        <p className="text-sm text-muted-foreground">{descripcion}</p>
      </div>
      {filas.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          Aún no hay elementos en este maestro. Cree el primero abajo.
        </p>
      ) : (
        <ul className="flex list-none flex-col gap-2">
          {filas.map((f) => (
            <li key={f.id} className="flex min-w-0 flex-col gap-2 rounded-lg border border-border p-3">
              <div className="min-w-0">
                <span className="font-medium">{f.nombre}</span>{" "}
                <Insignia variante={f.activo ? "bien" : "sin-dato"}>{f.activo ? "Activo" : "Inactivo"}</Insignia>
                <span className="block text-xs text-muted-foreground">
                  {[detalleDe(maestro, f), `Lo usan ${cuenta(f.usos, "versión", "versiones")} de ficha`].filter(Boolean).join(" · ")}
                </span>
              </div>
              <div className="flex min-w-0 flex-wrap items-start gap-2">
                <FormularioAccion
                  accion={activarEnMaestroAccion}
                  campos={{ id: f.id, maestro, activo: f.activo ? "false" : "true" }}
                  boton={f.activo ? "Desactivar" : "Activar"}
                  etiquetaAria={`${f.activo ? "Desactivar" : "Activar"} ${f.nombre}`}
                  variante="secundario"
                />
                {f.usos === 0 ? (
                  <FormularioAccion
                    accion={borrarDeMaestroAccion}
                    campos={{ id: f.id, maestro }}
                    boton="Borrar"
                    etiquetaAria={`Borrar ${f.nombre}`}
                    variante="peligro"
                  />
                ) : null}
                <Desplegable titulo={`Editar ${f.nombre}`}>
                  <FormularioAccion accion={guardarEnMaestroAccion} campos={{ id: f.id, maestro }} boton="Guardar los cambios">
                    <Campos maestro={maestro} f={f} sufijoId={String(f.id)} />
                  </FormularioAccion>
                </Desplegable>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Desplegable titulo={`Nuevo ${singular}`}>
        <FormularioAccion accion={guardarEnMaestroAccion} campos={{ maestro }} boton={`Crear el ${singular}`}>
          <Campos maestro={maestro} sufijoId="nuevo" />
        </FormularioAccion>
      </Desplegable>
    </section>
  );
}
