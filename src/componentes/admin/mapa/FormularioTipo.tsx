"use client";

import { useActionState } from "react";
import type { EstadoAccion } from "@/app/admin/comun";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";

type Valores = {
  nombre: string;
  sigla: string;
  esDiligenciable: boolean;
  autoridad: "estrategico" | "operativo";
  plantillaDocumentoId: number | null;
  plantillaCodigo?: string | null;
  mesesRevision?: number;
};

export function FormularioTipo({
  accion,
  id,
  valores,
  plantillas,
}: {
  accion: (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;
  id?: number;
  valores?: Valores;
  /** Los documentos con versión vigente: los únicos que pueden ser plantilla. */
  plantillas: { id: number; codigo: string; titulo: string }[];
}) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const v = estado?.valores;
  const val = (campo: string): string | undefined => {
    const x = v?.[campo];
    return typeof x === "string" ? x : Array.isArray(x) ? x[0] : undefined;
  };
  const plantillaActual = String(valores?.plantillaDocumentoId ?? "");
  const plantillaVigente = plantillas.some((p) => String(p.id) === plantillaActual);
  const aviso =
    valores?.plantillaDocumentoId != null && !plantillaVigente
      ? `La plantilla actual (${valores.plantillaCodigo ?? "sin código"}) ya no está vigente; las solicitudes de este tipo se aceptan y elaboran sin plantilla. Elija otra o déjelo sin plantilla.`
      : "El documento que se muestra como punto de partida al aceptar la solicitud y al elaborar un documento de este tipo.";

  return (
    <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex max-w-lg flex-col gap-5">
      {id && <input type="hidden" name="id" value={id} />}
      <Campo etiqueta="Nombre" nombre="nombre">
        <input required defaultValue={val("nombre") ?? valores?.nombre} className={claseControl} />
      </Campo>
      <Campo etiqueta="Sigla (2–4 letras, para los códigos: PR, FO, MN…)" nombre="sigla">
        <input required defaultValue={val("sigla") ?? valores?.sigla} className={`${claseControl} font-mono uppercase`} />
      </Campo>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          name="esDiligenciable"
          defaultChecked={v ? val("esDiligenciable") === "on" : valores?.esDiligenciable}
        />
        Es diligenciable (formato que se llena, no solo lectura)
      </label>
      <Campo
        etiqueta="Quién aprueba"
        nombre="autoridad"
        ayuda="Los documentos estratégicos los aprueba Gerencia; los operativos, el Administrador del SGC."
      >
        <select defaultValue={val("autoridad") ?? valores?.autoridad ?? "operativo"} className={claseControl}>
          <option value="estrategico">Gerencia (documento estratégico)</option>
          <option value="operativo">Administrador del SGC (documento operativo)</option>
        </select>
      </Campo>
      <Campo etiqueta="Plantilla" nombre="plantillaDocumentoId" ayuda={aviso}>
        <select defaultValue={val("plantillaDocumentoId") ?? (plantillaVigente ? plantillaActual : "")} className={claseControl}>
          <option value="">Sin plantilla</option>
          {plantillas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.codigo} — {p.titulo}
            </option>
          ))}
        </select>
      </Campo>
      <Campo
        etiqueta="Plazo de revisión (meses)"
        nombre="mesesRevision"
        ayuda="Cada cuántos meses se revisa un documento de este tipo para confirmar que sigue vigente (1 a 120). Cada documento puede tener su propio plazo."
      >
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={120}
          step={1}
          required
          defaultValue={val("mesesRevision") ?? valores?.mesesRevision ?? 12}
          className={claseControl}
        />
      </Campo>
      {estado && (
        <p role="alert" className="rounded-md bg-estado-critico-fondo px-3 py-2 text-sm text-estado-critico-texto">
          {estado.error}
        </p>
      )}
      <Boton type="submit" pendiente={pendiente} className="self-start">
        {pendiente ? "Guardando…" : "Guardar"}
      </Boton>
    </form>
  );
}
