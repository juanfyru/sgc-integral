"use client";

import { useActionState } from "react";
import { quitarArchivoAccion } from "@/app/acciones-mejoramiento";
import type { EstadoAccion } from "@/app/admin/comun";
import { ZonaCarga } from "@/componentes/admin/ZonaCarga";
import { IconoFormato } from "@/componentes/documentos/IconoFormato";
import { Boton } from "@/componentes/ui/Boton";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

export type ArchivoParaLista = { id: number; nombre: string; mime: string; tamano: number };

function Quitar({ archivo }: { archivo: ArchivoParaLista }) {
  const [estado, enviar, pendiente] = useActionState<EstadoAccion, FormData>(quitarArchivoAccion, null);
  return (
    <form action={enviar} className="flex flex-col items-start gap-1">
      <input type="hidden" name="archivoId" value={archivo.id} />
      <Boton type="submit" variante="peligro" tamano="sm" pendiente={pendiente} aria-label={`Quitar el archivo ${archivo.nombre}`}>
        {pendiente ? "Quitando…" : "Quitar"}
      </Boton>
      {estado && !estado.ok ? (
        <p role="alert" className="text-xs text-estado-critico-texto">
          {estado.error}
        </p>
      ) : null}
    </form>
  );
}

/**
 * Los archivos de un dueño del módulo (spec 15 §12.2): la lista con nombre, formato y tamaño (cada uno, una descarga) y,
 * para quien puede subir (`direccionDeSubida`), la zona de carga. `quitables` dice cuáles puede quitar la persona; el
 * servidor vuelve a comprobar cada subida y cada quitada. Quien no abre los archivos recibe la lista vacía y no ve nada.
 */
export function ArchivosDe({
  archivos,
  direccionDeSubida = null,
  quitables = [],
  nombre,
  vacio = "Sin archivos adjuntos.",
}: {
  archivos: ArchivoParaLista[];
  direccionDeSubida?: string | null;
  quitables?: number[];
  /** El nombre accesible de la zona de carga cuando la página tiene varias. */
  nombre?: string;
  vacio?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {archivos.length > 0 ? (
        <ul className="flex list-none flex-col gap-2">
          {archivos.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <a
                  href={`/mejoramiento/archivos/${a.id}/${encodeURIComponent(a.nombre)}`}
                  className={`min-w-0 break-words rounded-sm text-marca underline-offset-2 hover:underline ${FOCO}`}
                >
                  {a.nombre}
                </a>
                <IconoFormato mime={a.mime} tamanoBytes={a.tamano} />
              </span>
              {quitables.includes(a.id) ? <Quitar archivo={a} /> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{vacio}</p>
      )}
      {direccionDeSubida ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">Un archivo puede ser un PDF, una imagen o un Excel (.xlsx), de hasta 25 MB.</p>
          <ZonaCarga direccion={direccionDeSubida} soporte nombre={nombre} />
        </div>
      ) : null}
    </div>
  );
}
