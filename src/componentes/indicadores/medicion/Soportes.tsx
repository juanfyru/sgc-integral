"use client";

import { useActionState } from "react";
import { quitarSoporteAccion } from "@/app/acciones-indicadores";
import type { EstadoAccion } from "@/app/admin/comun";
import { ZonaCarga } from "@/componentes/admin/ZonaCarga";
import { IconoFormato } from "@/componentes/documentos/IconoFormato";
import { Boton } from "@/componentes/ui/Boton";
import type { Soporte } from "@/db/consultas/indicadores/soportes";
import { enlaceDeSoporte } from "@/lib/indicadores/soportes";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

function Quitar({ soporte }: { soporte: Soporte }) {
  const [estado, enviar, pendiente] = useActionState<EstadoAccion, FormData>(quitarSoporteAccion, null);
  return (
    <form action={enviar} className="flex flex-col items-start gap-1">
      <input type="hidden" name="id" value={soporte.id} />
      <Boton type="submit" variante="peligro" tamano="sm" pendiente={pendiente} aria-label={`Quitar el soporte ${soporte.nombre}`}>
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
 * Los soportes de una medición (spec §8.2): la lista con su formato y su tamaño (cada uno, un enlace de descarga) y, para
 * quien puede medir antes del cierre (`editable`), subir uno más y quitar uno. Quien ve la medición pero no sus soportes
 * no recibe este componente (la página no los lee). El servidor vuelve a comprobar cada subida y cada quitada.
 */
export function Soportes({
  medicionId,
  codigo,
  soportes,
  editable,
  obligatorio = false,
}: {
  medicionId: number;
  codigo: string;
  soportes: Soporte[];
  editable: boolean;
  obligatorio?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-border px-4 py-3">
      {soportes.length > 0 ? (
        <ul className="flex list-none flex-col gap-2">
          {soportes.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <a href={enlaceDeSoporte(codigo, s)} className={`min-w-0 break-words rounded-sm text-marca underline-offset-2 hover:underline ${FOCO}`}>
                  {s.nombre}
                </a>
                <IconoFormato mime={s.mime} tamanoBytes={s.tamano} />
              </span>
              {editable ? <Quitar soporte={s} /> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {obligatorio ? "Este indicador exige un soporte: adjúntelo antes de reportar." : "Sin soportes adjuntos."}
        </p>
      )}
      {editable ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            Un soporte puede ser un PDF, una imagen o un Excel (.xlsx). Se puede quitar mientras la medición no esté cerrada. Solo lo ven quienes ven los soportes del indicador.
          </p>
          <ZonaCarga direccion={`/api/mediciones/${medicionId}/archivos`} soporte />
        </div>
      ) : null}
    </div>
  );
}
