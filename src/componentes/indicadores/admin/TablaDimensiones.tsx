"use client";

import { useEffect, useRef } from "react";
import {
  borrarCategoriaDeDimension,
  borrarDimensionDeIndicadores,
  cambiarEstadoDeCategoriaDeDimension,
  cambiarEstadoDeDimensionDeIndicadores,
  guardarCategoriaDeDimension,
  guardarDimensionDeIndicadores,
  moverCategoriaDeDimension,
} from "@/app/admin/acciones-indicadores";
import { Campo } from "@/componentes/ui/Campo";
import { enfocarCuandoSePueda } from "@/componentes/ui/foco";
import { Insignia } from "@/componentes/ui/Insignia";
import type { Dimension } from "@/db/consultas/indicadores/dimensiones";
import { cuenta } from "@/lib/plural";
import { CONTROL, Desplegable, FormularioAccion } from "./TablaMaestro";

const AYUDA_NOMBRE = "Entre 2 y 80 caracteres.";

export type Sentido = "arriba" | "abajo";

/** El `id` del botón «Subir» o «Bajar» de una categoría. */
export const idDeMover = (categoriaId: number, sentido: Sentido) => `categoria-${categoriaId}-${sentido === "arriba" ? "subir" : "bajar"}`;

/**
 * El botón de mover que recibe el foco tras mover una categoría a `posicion` (desde 0) entre `total`: el mismo, si sigue
 * existiendo; si no (la categoría quedó en un extremo), el otro. «Subir» existe salvo en la primera y «Bajar», salvo en la
 * última; con una sola categoría, ninguno.
 */
export function botonTrasMover(posicion: number, total: number, sentido: Sentido): Sentido | null {
  const existe = (s: Sentido) => (s === "arriba" ? posicion > 0 : posicion < total - 1);
  const otro: Sentido = sentido === "arriba" ? "abajo" : "arriba";
  return existe(sentido) ? sentido : existe(otro) ? otro : null;
}

/**
 * El maestro de dimensiones (anexo 14C, §5.1): cada dimensión con sus categorías anidadas. Lo que ya se usó no se
 * borra: se desactiva y los periodos nuevos dejan de pedirlo. Cada acción lleva su texto y se maneja con el teclado;
 * a ancho de teléfono las categorías son una lista vertical y sus botones se envuelven. Tras «Subir» o «Bajar», el foco
 * sigue en la categoría que se movió (`botonTrasMover`): el botón se deshabilita mientras espera y la fila cambia de lugar,
 * y sin esto quien usa el teclado volvería al principio de la página.
 */
export function TablaDimensiones({ dimensiones }: { dimensiones: Dimension[] }) {
  const movida = useRef<{ categoriaId: number; sentido: Sentido; desde: number } | null>(null);
  // Las dimensiones llegan de nuevo cuando la acción termina: si la categoría cambió de lugar, el foco va a su botón.
  useEffect(() => {
    const pedido = movida.current;
    if (!pedido) return;
    movida.current = null;
    const dimension = dimensiones.find((d) => d.categorias.some((c) => c.id === pedido.categoriaId));
    const posicion = dimension?.categorias.findIndex((c) => c.id === pedido.categoriaId) ?? -1;
    if (!dimension || posicion === pedido.desde) return;
    const sentido = botonTrasMover(posicion, dimension.categorias.length, pedido.sentido);
    if (sentido) enfocarCuandoSePueda(idDeMover(pedido.categoriaId, sentido));
  }, [dimensiones]);
  const mover = (categoriaId: number, sentido: Sentido, desde: number) => () => {
    movida.current = { categoriaId, sentido, desde };
  };

  return (
    <section aria-labelledby="titulo-dimensiones" className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-4">
      <div>
        <h2 id="titulo-dimensiones" className="text-base font-semibold">
          Dimensiones
        </h2>
        <p className="text-sm text-muted-foreground">
          «Sede» con sus sedes, «Servicio» con sus servicios… Un indicador puede capturarse por las categorías de una dimensión.
          Una categoría que ya se usó no se borra: se desactiva.
        </p>
      </div>
      {dimensiones.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          Aún no hay dimensiones. Cree la primera abajo.
        </p>
      ) : (
        <ul className="flex list-none flex-col gap-3">
          {dimensiones.map((d) => (
            <li key={d.id} className="flex min-w-0 flex-col gap-3 rounded-lg border border-border p-3">
              <div className="min-w-0">
                <span className="font-medium">{d.nombre}</span>{" "}
                <Insignia variante={d.activo ? "bien" : "sin-dato"}>{d.activo ? "Activa" : "Inactiva"}</Insignia>
                <span className="block text-xs text-muted-foreground">
                  {cuenta(d.categorias.length, "categoría", "categorías")}
                  {d.usada ? " · Ya se usó en fichas o datos" : ""}
                </span>
              </div>
              <div className="flex min-w-0 flex-wrap items-start gap-2">
                <FormularioAccion
                  accion={cambiarEstadoDeDimensionDeIndicadores}
                  campos={{ id: d.id, activo: d.activo ? "false" : "true" }}
                  boton={d.activo ? "Desactivar" : "Activar"}
                  etiquetaAria={`${d.activo ? "Desactivar" : "Activar"} la dimensión ${d.nombre}`}
                  variante="secundario"
                />
                {d.usada ? null : (
                  <FormularioAccion
                    accion={borrarDimensionDeIndicadores}
                    campos={{ id: d.id }}
                    boton="Borrar"
                    etiquetaAria={`Borrar la dimensión ${d.nombre}`}
                    variante="peligro"
                  />
                )}
                <Desplegable titulo={`Renombrar ${d.nombre}`}>
                  <FormularioAccion accion={guardarDimensionDeIndicadores} campos={{ id: d.id }} boton="Guardar el nombre">
                    <Campo etiqueta="Nombre" nombre="nombre" id={`dimension-${d.id}-nombre`} ayuda={AYUDA_NOMBRE}>
                      <input required minLength={2} maxLength={80} defaultValue={d.nombre} className={CONTROL} />
                    </Campo>
                  </FormularioAccion>
                </Desplegable>
              </div>

              {d.categorias.length === 0 ? (
                <p className="text-sm text-muted-foreground">Esta dimensión aún no tiene categorías.</p>
              ) : (
                <ul aria-label={`Categorías de ${d.nombre}`} className="flex list-none flex-col gap-2 border-l-2 border-border pl-3">
                  {d.categorias.map((c, i) => (
                    <li key={c.id} className="flex min-w-0 flex-col gap-2 rounded-md border border-linea-suave p-2">
                      <div className="min-w-0">
                        <span className="font-medium">{c.nombre}</span>{" "}
                        <Insignia variante={c.activo ? "bien" : "sin-dato"}>{c.activo ? "Activa" : "Inactiva"}</Insignia>
                        {c.usada ? <span className="block text-xs text-muted-foreground">Ya se usó</span> : null}
                      </div>
                      <div className="flex min-w-0 flex-wrap items-start gap-2">
                        {i > 0 ? (
                          <FormularioAccion
                            accion={moverCategoriaDeDimension}
                            campos={{ id: c.id, sentido: "arriba" }}
                            boton="Subir"
                            etiquetaAria={`Subir la categoría ${c.nombre}`}
                            variante="secundario"
                            idBoton={idDeMover(c.id, "arriba")}
                            alEnviar={mover(c.id, "arriba", i)}
                          />
                        ) : null}
                        {i < d.categorias.length - 1 ? (
                          <FormularioAccion
                            accion={moverCategoriaDeDimension}
                            campos={{ id: c.id, sentido: "abajo" }}
                            boton="Bajar"
                            etiquetaAria={`Bajar la categoría ${c.nombre}`}
                            variante="secundario"
                            idBoton={idDeMover(c.id, "abajo")}
                            alEnviar={mover(c.id, "abajo", i)}
                          />
                        ) : null}
                        <FormularioAccion
                          accion={cambiarEstadoDeCategoriaDeDimension}
                          campos={{ id: c.id, activo: c.activo ? "false" : "true" }}
                          boton={c.activo ? "Desactivar" : "Activar"}
                          etiquetaAria={`${c.activo ? "Desactivar" : "Activar"} la categoría ${c.nombre}`}
                          variante="secundario"
                        />
                        {c.usada ? null : (
                          <FormularioAccion
                            accion={borrarCategoriaDeDimension}
                            campos={{ id: c.id }}
                            boton="Borrar"
                            etiquetaAria={`Borrar la categoría ${c.nombre}`}
                            variante="peligro"
                          />
                        )}
                        <Desplegable titulo={`Renombrar ${c.nombre}`}>
                          <FormularioAccion accion={guardarCategoriaDeDimension} campos={{ id: c.id }} boton="Guardar el nombre">
                            <Campo etiqueta="Nombre" nombre="nombre" id={`categoria-${c.id}-nombre`} ayuda={AYUDA_NOMBRE}>
                              <input required minLength={2} maxLength={80} defaultValue={c.nombre} className={CONTROL} />
                            </Campo>
                          </FormularioAccion>
                        </Desplegable>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <Desplegable titulo={`Nueva categoría en ${d.nombre}`}>
                {/* Se crean varias de corrido: al crear una, el campo queda vacío para la siguiente. */}
                <FormularioAccion accion={guardarCategoriaDeDimension} campos={{ dimensionId: d.id }} boton="Crear la categoría" limpiarAlTerminar>
                  <Campo
                    etiqueta="Nombre"
                    nombre="nombre"
                    id={`dimension-${d.id}-categoria-nueva`}
                    ayuda="Queda al final de la lista. Entre 2 y 80 caracteres."
                  >
                    <input required minLength={2} maxLength={80} className={CONTROL} />
                  </Campo>
                </FormularioAccion>
              </Desplegable>
            </li>
          ))}
        </ul>
      )}
      <Desplegable titulo="Nueva dimensión">
        <FormularioAccion accion={guardarDimensionDeIndicadores} campos={{}} boton="Crear la dimensión">
          <Campo etiqueta="Nombre" nombre="nombre" id="dimension-nueva-nombre" ayuda={AYUDA_NOMBRE}>
            <input required minLength={2} maxLength={80} className={CONTROL} />
          </Campo>
        </FormularioAccion>
      </Desplegable>
    </section>
  );
}
