import {
  alternarTipoNormaAccion,
  crearTipoNormaAccion,
  editarTipoNormaAccion,
  moverTipoNormaAccion,
} from "@/app/acciones-normograma";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { Insignia } from "@/componentes/ui/Insignia";
import type { TipoNorma } from "@/db/consultas/normograma/tipos-norma";
import { cuenta } from "@/lib/plural";
import { AccionNormograma } from "./AccionNormograma";

const CONTROL = `${claseControl} w-full min-w-0 max-w-full`;

/**
 * El maestro de tipos de norma (spec 13C §10.6), al pie del normograma para quien administra: crear, renombrar, ordenar y
 * desactivar, como los ítems de la lista de verificación. Un tipo no se borra: sus normas lo citan.
 */
export function TiposNorma({ tipos }: { tipos: TipoNorma[] }) {
  return (
    <section aria-labelledby="titulo-tipos-norma" className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-4">
      <div>
        <h2 id="titulo-tipos-norma" className="text-sm font-semibold">
          Tipos de norma
        </h2>
        <p className="text-sm text-muted-foreground">
          El tipo forma el nombre de la norma («Resolución 3100 de 2019»). Uno inactivo deja de ofrecerse al registrar.
        </p>
      </div>
      <ol className="flex list-none flex-col gap-2">
        {tipos.map((t, i) => (
          <li key={t.id} className="flex min-w-0 flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
            <div className="min-w-0">
              <span className="font-medium">{t.nombre}</span>{" "}
              <Insignia variante={t.activo ? "bien" : "sin-dato"}>{t.activo ? "Activo" : "Inactivo"}</Insignia>
              <span className="block text-xs text-muted-foreground">{cuenta(t.normas, "norma", "normas")}</span>
            </div>
            <div className="flex min-w-0 flex-wrap items-start gap-2">
              {i > 0 ? (
                <AccionNormograma accion={moverTipoNormaAccion} boton={`Subir ${t.nombre}`} campos={{ id: t.id, direccion: "arriba" }} variante="secundario" tamano="sm" />
              ) : null}
              {i < tipos.length - 1 ? (
                <AccionNormograma accion={moverTipoNormaAccion} boton={`Bajar ${t.nombre}`} campos={{ id: t.id, direccion: "abajo" }} variante="secundario" tamano="sm" />
              ) : null}
              <AccionNormograma
                accion={alternarTipoNormaAccion}
                boton={t.activo ? `Desactivar ${t.nombre}` : `Activar ${t.nombre}`}
                campos={{ id: t.id, activo: t.activo ? "false" : "true" }}
                variante="secundario"
                tamano="sm"
              />
              <AccionNormograma accion={editarTipoNormaAccion} boton="Guardar el nombre" campos={{ id: t.id }} desplegable={`Renombrar ${t.nombre}`} tamano="sm">
                <Campo etiqueta="Nombre" nombre="nombre" id={`tipo-${t.id}-nombre`} ayuda="Entre 2 y 60 caracteres.">
                  <input required minLength={2} maxLength={60} defaultValue={t.nombre} className={CONTROL} />
                </Campo>
              </AccionNormograma>
            </div>
          </li>
        ))}
      </ol>
      <AccionNormograma accion={crearTipoNormaAccion} boton="Crear el tipo" campos={{}} desplegable="Nuevo tipo de norma">
        <Campo etiqueta="Nombre del tipo" nombre="nombre" id="tipo-nuevo-nombre" ayuda="Entre 2 y 60 caracteres. Por ejemplo, «Ordenanza».">
          <input required minLength={2} maxLength={60} className={CONTROL} />
        </Campo>
      </AccionNormograma>
    </section>
  );
}
