"use client";

import { useState } from "react";
import { DialogoFirma } from "@/componentes/tramites/DialogoFirma";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { AVISO_SIN_PACIENTES } from "@/lib/mejoramiento/textos";
import type { AccionDelPaso } from "./Partes";

/**
 * «Por cerrar», para el Administrador del SGC (spec 15 §11.5, PC-10): las lecciones aprendidas (al menos diez caracteres) y, si
 * la segunda pregunta del análisis pidió cambios en documentos, riesgos o controles (`cambios` los nombra), cómo se atendió cada
 * uno; firma «Cerró». Al cerrar se avisa a los líderes del proceso, a quien lo registró y a Gerencia.
 */
export function PasoCerrar({
  hallazgoId,
  cambios,
  pideCodigo,
  accion,
}: {
  hallazgoId: number;
  /** Los cambios que pidió el análisis («documentos, matriz de riesgos»), o nulo si no pidió ninguno. */
  cambios: string | null;
  pideCodigo: boolean;
  accion: AccionDelPaso;
}) {
  const [lecciones, setLecciones] = useState("");
  const [atendidos, setAtendidos] = useState("");
  const id = (c: string) => `cerrar-${hallazgoId}-${c}`;
  const ocultos: Record<string, string> = { hallazgoId: String(hallazgoId), lecciones, ...(cambios ? { cambiosAtendidos: atendidos } : {}) };
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="text-sm">La eficacia se evaluó «Eficaz». Con su firma, el hallazgo queda «Cerrado · eficaz» y se avisa a quienes lo siguieron.</p>
      <Campo etiqueta="Lecciones aprendidas (al menos 10 caracteres)" nombre="lecciones" id={id("lecciones")} ayuda={AVISO_SIN_PACIENTES}>
        <textarea value={lecciones} onChange={(e) => setLecciones(e.target.value)} required minLength={10} maxLength={4000} rows={3} className={claseControl} />
      </Campo>
      {cambios ? (
        <Campo
          etiqueta={`Cómo se atendieron los cambios que pidió el análisis (${cambios})`}
          nombre="cambiosAtendidos"
          id={id("cambios")}
          ayuda={AVISO_SIN_PACIENTES}
        >
          <textarea value={atendidos} onChange={(e) => setAtendidos(e.target.value)} required minLength={10} maxLength={4000} rows={2} className={claseControl} />
        </Campo>
      ) : null}
      <div>
        <DialogoFirma
          titulo="Cerrar el hallazgo"
          etiquetaBoton="Cerrar el hallazgo"
          textoAlFirmar="Firmar «Cerró»"
          accion={accion}
          ocultos={ocultos}
          pideCodigo={pideCodigo}
        >
          <p className="whitespace-pre-line break-words text-sm">{`Lecciones aprendidas: ${lecciones.trim() || "(sin escribir)"}`}</p>
        </DialogoFirma>
      </div>
    </div>
  );
}
