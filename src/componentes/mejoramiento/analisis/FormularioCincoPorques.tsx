"use client";

import { useActionState, useState } from "react";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { Boton } from "@/componentes/ui/Boton";
import { claseControl } from "@/componentes/ui/Campo";
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

type Nivel = { respuesta: string; evidencia: string };

/** Los niveles guardados, o el primero en blanco. */
function nivelesDe(contenido: unknown): Nivel[] {
  const crudo = (contenido as { niveles?: unknown } | null)?.niveles;
  const lista = Array.isArray(crudo)
    ? crudo.flatMap((n) =>
        typeof n === "object" && n !== null && typeof (n as { respuesta?: unknown }).respuesta === "string"
          ? [{ respuesta: (n as Nivel).respuesta, evidencia: typeof (n as Nivel).evidencia === "string" ? (n as Nivel).evidencia : "" }]
          : [],
      )
    : [];
  return lista.length > 0 ? lista : [{ respuesta: "", evidencia: "" }];
}

/**
 * Los 5 porqués (spec 15 §9.1): de uno a cinco niveles, en orden. No siempre hacen falta los cinco: el análisis se detiene en
 * una causa sobre la que se pueda actuar. El contenido viaja como un solo campo JSON que el servidor valida.
 */
export function FormularioCincoPorques({
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
  const [niveles, setNiveles] = useState<Nivel[]>(() => nivelesDe(analisis?.contenido));
  const [estado, enviar, pendiente] = useActionState(guardar, null);
  const guardado = useGuardado(estado, pendiente, alGuardar);
  const q = useQuitar(quitar, hallazgoId, analisis?.id ?? null);
  const cambiar = (i: number, cambio: Partial<Nivel>) => setNiveles((ns) => ns.map((n, j) => (j === i ? { ...n, ...cambio } : n)));
  const contenido = JSON.stringify({ niveles: niveles.map((n) => ({ respuesta: n.respuesta, evidencia: n.evidencia })) });

  return (
    <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex flex-col gap-4">
      <input type="hidden" name="hallazgoId" value={hallazgoId} />
      <input type="hidden" name="metodo" value="cinco_porques" />
      {analisis ? <input type="hidden" name="analisisId" value={analisis.id} /> : null}
      <input type="hidden" name="contenido" value={contenido} />
      <p className="text-sm text-muted-foreground">
        No siempre hacen falta los cinco porqués: deténgase en una causa sobre la que se pueda actuar.
      </p>
      <ol className="flex list-none flex-col gap-3">
        {niveles.map((n, i) => (
          <li key={i} className="flex flex-col gap-2 rounded-md border border-border p-3">
            <label htmlFor={`${idBase}-r${i}`} className="text-sm font-medium">
              {i === 0 ? "¿Por qué ocurrió el hallazgo?" : `¿Por qué? (nivel ${i + 1})`}
            </label>
            <textarea
              id={`${idBase}-r${i}`}
              rows={2}
              maxLength={1000}
              value={n.respuesta}
              onChange={(e) => cambiar(i, { respuesta: e.target.value })}
              aria-describedby={`${idBase}-aviso`}
              className={claseControl}
            />
            <label htmlFor={`${idBase}-e${i}`} className="text-xs font-medium text-muted-foreground">
              Evidencia que sostiene la respuesta (opcional)
            </label>
            <input
              id={`${idBase}-e${i}`}
              type="text"
              maxLength={1000}
              value={n.evidencia}
              onChange={(e) => cambiar(i, { evidencia: e.target.value })}
              className={claseControl}
            />
          </li>
        ))}
      </ol>
      <p id={`${idBase}-aviso`} className="text-xs text-muted-foreground">
        {AVISO_SIN_PACIENTES}
      </p>
      <div className="flex flex-wrap gap-2">
        {niveles.length < 5 ? (
          <Boton variante="secundario" tamano="sm" onClick={() => setNiveles((ns) => [...ns, { respuesta: "", evidencia: "" }])}>
            Añadir otro porqué
          </Boton>
        ) : null}
        {niveles.length > 1 ? (
          <Boton variante="fantasma" tamano="sm" onClick={() => setNiveles((ns) => ns.slice(0, -1))}>
            Quitar el último nivel
          </Boton>
        ) : null}
      </div>
      <CamposComunes idBase={idBase} equipo={analisis?.equipo ?? null} observaciones={analisis?.observaciones ?? null} />
      <ErrorDeAnalisis estado={estado} />
      <ErrorDeAnalisis estado={q.estado} />
      <PieDelAnalisis pendiente={pendiente} guardado={guardado} alQuitar={q.quitar} quitando={q.pendiente} />
    </form>
  );
}
