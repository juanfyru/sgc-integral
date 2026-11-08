"use client";

import { Check, Minus, X } from "lucide-react";
import { ZonaCarga } from "@/componentes/admin/ZonaCarga";
import { claseControl } from "@/componentes/ui/Campo";
import { Insignia, type VarianteInsignia } from "@/componentes/ui/Insignia";
import type { ItemVerificacion } from "@/db/consultas/distribucion/verificaciones";
import { ETIQUETA_RESPUESTA, RESPUESTAS_ITEM, type RespuestaItem } from "@/lib/distribucion/tipos";
import { BotonQuitarFoto } from "./BotonQuitarFoto";

export type ValorItem = { respuesta: RespuestaItem | null; nota: string; retirado: boolean };

const ICONO = { conforme: Check, no_conforme: X, no_aplica: Minus } as const;

// Clases literales: Tailwind solo genera las que ve escritas completas. El estado elegido se dice con
// el texto marcado, el ícono y el borde grueso, no solo con el color.
const CLASE_ELEGIDA: Record<RespuestaItem, string> = {
  conforme: "has-checked:border-estado-bien has-checked:bg-estado-bien-fondo has-checked:text-estado-bien-texto",
  no_conforme: "has-checked:border-estado-critico has-checked:bg-estado-critico-fondo has-checked:text-estado-critico-texto",
  no_aplica: "has-checked:border-foreground has-checked:bg-muted has-checked:text-foreground",
};

const VARIANTE: Record<RespuestaItem, VarianteInsignia> = { conforme: "bien", no_conforme: "critico", no_aplica: "neutra" };

export const urlDeFoto = (verificacionId: number, fotoId: number, nombre: string) =>
  `/distribucion/verificaciones/${verificacionId}/archivos/${fotoId}/${encodeURIComponent(nombre)}`;

const tamano = (bytes: number) => (bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

function Fotos({ verificacionId, item, editable }: { verificacionId: number; item: ItemVerificacion; editable: boolean }) {
  if (item.fotos.length === 0) return editable ? null : <p className="text-xs text-muted-foreground">Sin fotos.</p>;
  return (
    <ul className="flex list-none flex-col gap-1.5" aria-label={`Fotos del ítem: ${item.texto}`}>
      {item.fotos.map((f) => (
        <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <a
            href={urlDeFoto(verificacionId, f.id, f.nombreOriginal)}
            className="min-w-0 break-words rounded underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
          >
            {f.nombreOriginal}
          </a>
          <span className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{`${f.mime} · ${tamano(f.tamanoBytes)}`}</span>
            {editable ? <BotonQuitarFoto verificacionId={verificacionId} itemId={item.id} archivoId={f.id} nombre={f.nombreOriginal} /> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Una fila de la lista de chequeo. Editable, los campos viajan como `respuesta_<id>`, `nota_<id>` y
 * `retirado_<id>`; «no conforme» despliega la nota, «Retirado en el acto» y la foto. De solo lectura, es el
 * registro de lo que se respondió.
 */
export function ItemChequeo({
  verificacionId,
  item,
  valor,
  editable,
  alCambiar,
}: {
  verificacionId: number;
  item: ItemVerificacion;
  valor: ValorItem;
  editable: boolean;
  alCambiar?: (valor: ValorItem) => void;
}) {
  if (!editable) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="min-w-0 break-words text-sm font-medium">{item.texto}</p>
          {item.respuesta ? <Insignia variante={VARIANTE[item.respuesta]}>{ETIQUETA_RESPUESTA[item.respuesta]}</Insignia> : null}
        </div>
        {item.nota ? <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{`Nota: ${item.nota}`}</p> : null}
        {item.respuesta === "no_conforme" ? <Fotos verificacionId={verificacionId} item={item} editable={false} /> : null}
      </div>
    );
  }

  const cambiar = (parcial: Partial<ValorItem>) => alCambiar?.({ ...valor, ...parcial });
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-1 break-words text-sm font-medium">{item.texto}</legend>
      <div className="grid grid-cols-3 gap-1.5">
        {RESPUESTAS_ITEM.map((r) => {
          const Icono = ICONO[r];
          return (
            <label
              key={r}
              className={`flex min-h-11 cursor-pointer items-center justify-center gap-1 rounded-md border-2 border-border bg-card px-1 text-center text-xs font-medium has-checked:font-semibold has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-marca sm:text-sm ${CLASE_ELEGIDA[r]}`}
            >
              <input
                type="radio"
                name={`respuesta_${item.id}`}
                value={r}
                checked={valor.respuesta === r}
                onChange={() => cambiar({ respuesta: r })}
                className="sr-only"
              />
              <Icono aria-hidden="true" className="size-4 shrink-0" />
              {ETIQUETA_RESPUESTA[r]}
            </label>
          );
        })}
      </div>

      {valor.respuesta === "no_conforme" ? (
        <div className="flex flex-col gap-3 rounded-lg border border-estado-critico/40 bg-estado-critico-fondo/40 p-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Nota del hallazgo
            <textarea
              name={`nota_${item.id}`}
              value={valor.nota}
              onChange={(e) => cambiar({ nota: e.target.value })}
              rows={2}
              maxLength={1000}
              className={claseControl}
            />
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              name={`retirado_${item.id}`}
              checked={valor.retirado}
              onChange={(e) => cambiar({ retirado: e.target.checked })}
              className="size-5"
            />
            Retirado en el acto
          </label>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Foto</p>
            <Fotos verificacionId={verificacionId} item={item} editable />
            <ZonaCarga direccion={`/api/verificaciones/${verificacionId}/items/${item.id}/archivos`} evidencia />
          </div>
        </div>
      ) : null}
    </fieldset>
  );
}
