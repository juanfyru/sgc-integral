"use client";

import { useActionState, useState } from "react";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
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

/**
 * Otro método (spec 15 §9.1): su nombre y su descripción (una lluvia de ideas, el Protocolo de Londres en un evento
 * adverso). Los adjuntos son los de la ronda: los pinta `PestanasDeMetodo` debajo del formulario, no dentro (un formulario no se anida). El contenido viaja como un campo JSON.
 */
export function FormularioOtroMetodo({
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
  const inicial = (analisis?.contenido ?? {}) as { nombre?: unknown; descripcion?: unknown };
  const [nombre, setNombre] = useState(typeof inicial.nombre === "string" ? inicial.nombre : "");
  const [descripcion, setDescripcion] = useState(typeof inicial.descripcion === "string" ? inicial.descripcion : "");
  const [estado, enviar, pendiente] = useActionState(guardar, null);
  const guardado = useGuardado(estado, pendiente, alGuardar);
  const q = useQuitar(quitar, hallazgoId, analisis?.id ?? null);
  return (
    <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex flex-col gap-4">
      <input type="hidden" name="hallazgoId" value={hallazgoId} />
      <input type="hidden" name="metodo" value="otro" />
      {analisis ? <input type="hidden" name="analisisId" value={analisis.id} /> : null}
      <input type="hidden" name="contenido" value={JSON.stringify({ nombre, descripcion })} />
      <div className="flex flex-col gap-1">
        <label htmlFor={`${idBase}-nombre`} className="text-sm font-medium">
          Nombre del método
        </label>
        <input id={`${idBase}-nombre`} type="text" maxLength={120} value={nombre} onChange={(e) => setNombre(e.target.value)} className={claseControl} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${idBase}-descripcion`} className="text-sm font-medium">
          Descripción: cómo se hizo y qué concluyó
        </label>
        <textarea
          id={`${idBase}-descripcion`}
          rows={5}
          maxLength={4000}
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          aria-describedby={`${idBase}-aviso`}
          className={claseControl}
        />
        <p id={`${idBase}-aviso`} className="text-xs text-muted-foreground">
          {AVISO_SIN_PACIENTES}
        </p>
      </div>
      <CamposComunes idBase={idBase} equipo={analisis?.equipo ?? null} observaciones={analisis?.observaciones ?? null} />
      <ErrorDeAnalisis estado={estado} />
      <ErrorDeAnalisis estado={q.estado} />
      <PieDelAnalisis pendiente={pendiente} guardado={guardado} alQuitar={q.quitar} quitando={q.pendiente} />
    </form>
  );
}
