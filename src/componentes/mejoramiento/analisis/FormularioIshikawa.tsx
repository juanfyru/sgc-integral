"use client";

import { useActionState, useState } from "react";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { Boton } from "@/componentes/ui/Boton";
import { claseControl } from "@/componentes/ui/Campo";
import { CATEGORIAS_6M, ETIQUETA_6M, ETIQUETA_IMPACTO, IMPACTOS, type Categoria6M } from "@/lib/mejoramiento/analisis";
import { AVISO_SIN_PACIENTES } from "@/lib/mejoramiento/textos";
import {
  CamposComunes,
  ErrorDeAnalisis,
  PieDelAnalisis,
  useGuardado,
  useQuitar,
  type AccionDeAnalisis,
  type AnalisisGuardado,
} from "./Partes";

type Causa = { categoria: Categoria6M; texto: string; confirmada: boolean; impacto: string; requiereAccion: boolean };

function causasDe(contenido: unknown): Causa[] {
  const crudo = (contenido as { causas?: unknown } | null)?.causas;
  if (!Array.isArray(crudo)) return [];
  return crudo.flatMap((x) => {
    const c = x as Partial<Causa> | null;
    if (!c || typeof c.texto !== "string" || !(CATEGORIAS_6M as readonly string[]).includes(c.categoria as string)) return [];
    return [
      {
        categoria: c.categoria as Categoria6M,
        texto: c.texto,
        confirmada: c.confirmada === true,
        impacto: typeof c.impacto === "string" ? c.impacto : "",
        requiereAccion: c.requiereAccion === true,
      },
    ];
  });
}

/**
 * Ishikawa, las 6M (spec 15 §9.1): una rejilla con las seis categorías; en cada una, las causas posibles. Cada causa se marca
 * confirmada o no; las confirmadas llevan su impacto y si requieren acción. Completo con al menos una confirmada.
 */
export function FormularioIshikawa({
  hallazgoId,
  analisis,
  guardar,
  quitar,
  alGuardar,
  idBase,
}: {
  hallazgoId: number;
  analisis: AnalisisGuardado | null;
  guardar: AccionDeAnalisis;
  quitar: AccionDeAnalisis;
  alGuardar?: () => void;
  idBase: string;
}) {
  const [causas, setCausas] = useState<Causa[]>(() => causasDe(analisis?.contenido));
  const [estado, enviar, pendiente] = useActionState(guardar, null);
  const guardado = useGuardado(estado, pendiente, alGuardar);
  const q = useQuitar(quitar, hallazgoId, analisis?.id ?? null);
  const cambiar = (i: number, cambio: Partial<Causa>) => setCausas((cs) => cs.map((c, j) => (j === i ? { ...c, ...cambio } : c)));
  const contenido = JSON.stringify({
    causas: causas
      .filter((c) => c.texto.trim() !== "")
      .map((c) => ({
        categoria: c.categoria,
        texto: c.texto,
        confirmada: c.confirmada,
        ...(c.confirmada ? { impacto: c.impacto || undefined, requiereAccion: c.requiereAccion } : {}),
      })),
  });

  return (
    <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex flex-col gap-4">
      <input type="hidden" name="hallazgoId" value={hallazgoId} />
      <input type="hidden" name="metodo" value="ishikawa" />
      {analisis ? <input type="hidden" name="analisisId" value={analisis.id} /> : null}
      <input type="hidden" name="contenido" value={contenido} />
      <p id={`${idBase}-aviso`} className="text-xs text-muted-foreground">
        {AVISO_SIN_PACIENTES} Marque como confirmada cada causa que la evidencia sostenga: es la que cuenta para completar el análisis.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {CATEGORIAS_6M.map((cat) => (
          <fieldset key={cat} className="flex min-w-0 flex-col gap-2 rounded-md border border-border p-3">
            <legend className="px-1 text-sm font-semibold">{ETIQUETA_6M[cat]}</legend>
            {causas.map((c, i) =>
              c.categoria !== cat ? null : (
                <div key={i} className="flex flex-col gap-2 border-b border-linea-suave pb-2 last:border-b-0">
                  <label htmlFor={`${idBase}-t${i}`} className="sr-only">
                    Causa de {ETIQUETA_6M[cat]}
                  </label>
                  <input
                    id={`${idBase}-t${i}`}
                    type="text"
                    maxLength={500}
                    value={c.texto}
                    onChange={(e) => cambiar(i, { texto: e.target.value })}
                    aria-describedby={`${idBase}-aviso`}
                    className={claseControl}
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={c.confirmada}
                      onChange={(e) => cambiar(i, { confirmada: e.target.checked })}
                      className="size-4"
                    />
                    Causa confirmada
                  </label>
                  {c.confirmada ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2 text-sm">
                        Impacto
                        <select value={c.impacto} onChange={(e) => cambiar(i, { impacto: e.target.value })} className={claseControl}>
                          <option value="">Elija</option>
                          {IMPACTOS.map((v) => (
                            <option key={v} value={v}>
                              {ETIQUETA_IMPACTO[v]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={c.requiereAccion}
                          onChange={(e) => cambiar(i, { requiereAccion: e.target.checked })}
                          className="size-4"
                        />
                        Requiere acción
                      </label>
                    </div>
                  ) : null}
                  <Boton variante="fantasma" tamano="sm" className="self-start" onClick={() => setCausas((cs) => cs.filter((_, j) => j !== i))}>
                    Quitar esta causa
                  </Boton>
                </div>
              ),
            )}
            <Boton
              variante="secundario"
              tamano="sm"
              className="self-start"
              onClick={() => setCausas((cs) => [...cs, { categoria: cat, texto: "", confirmada: false, impacto: "", requiereAccion: false }])}
            >
              Añadir una causa
              <span className="sr-only"> de {ETIQUETA_6M[cat]}</span>
            </Boton>
          </fieldset>
        ))}
      </div>
      <CamposComunes idBase={idBase} equipo={analisis?.equipo ?? null} observaciones={analisis?.observaciones ?? null} />
      <ErrorDeAnalisis estado={estado} />
      <ErrorDeAnalisis estado={q.estado} />
      <PieDelAnalisis pendiente={pendiente} guardado={guardado} alQuitar={q.quitar} quitando={q.pendiente} />
    </form>
  );
}
