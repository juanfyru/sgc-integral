"use client";

import { useActionState } from "react";
import type { EstadoAccion } from "@/app/admin/comun";

type Tipo = { id: number; nombre: string; sigla: string };
type ProcesoConSub = {
  id: number;
  nombre: string;
  subprocesos: Array<{ id: number; nombre: string }>;
};

export type ValoresDocumento = {
  codigo: string;
  titulo: string;
  tipoId: number;
  descripcion: string | null;
  palabrasClave: string | null;
  asociaciones: Array<{ procesoId: number | null; subprocesoId: number | null; esPrincipal: boolean }>;
};

type Props = {
  accion: (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;
  tipos: Tipo[];
  procesos: ProcesoConSub[];
  valores?: ValoresDocumento;
  documentoId?: number;
  codigoEditable: boolean;
};

const claseCampo =
  "rounded-md border border-border bg-card px-3 py-2 text-foreground outline-none transition-colors focus:border-marca focus:ring-2 focus:ring-marca/20";

export function FormularioDocumento({
  accion, tipos, procesos, valores, documentoId, codigoEditable,
}: Props) {
  const [estado, enviar, pendiente] = useActionState(accion, null);

  const marca = (procesoId: number | null, subprocesoId: number | null) =>
    procesoId !== null ? `p:${procesoId}` : `s:${subprocesoId}`;

  // React 19 resetea el formulario al terminar la action: si la action
  // devolvió error, los defaults salen de lo que el usuario envió
  // (estado.valores) y no de los valores originales.
  const enviados = estado?.valores;
  const campoEnviado = (campo: string): string | undefined => {
    const v = enviados?.[campo];
    return typeof v === "string" ? v : Array.isArray(v) ? v[0] : undefined;
  };
  const listaEnviada = (campo: string): string[] => {
    const v = enviados?.[campo];
    return v === undefined ? [] : Array.isArray(v) ? v : [v];
  };

  const principal = (valores?.asociaciones ?? []).find((a) => a.esPrincipal);
  const marcadas = enviados
    ? new Set(listaEnviada("asociaciones"))
    : new Set(
        (valores?.asociaciones ?? []).map((a) => marca(a.procesoId, a.subprocesoId)),
      );
  const marcaPrincipal = enviados
    ? (campoEnviado("principal") ?? "")
    : principal
      ? marca(principal.procesoId, principal.subprocesoId)
      : "";

  return (
    <form action={enviar} className="flex max-w-2xl flex-col gap-5">
      {documentoId && <input type="hidden" name="documentoId" value={documentoId} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Código
          <input
            name="codigo"
            defaultValue={campoEnviado("codigo") ?? valores?.codigo}
            required
            readOnly={!codigoEditable}
            placeholder="SGC-FO-02"
            className={`${claseCampo} font-mono uppercase ${codigoEditable ? "" : "bg-muted text-muted-foreground"}`}
          />
          {!codigoEditable && (
            <span className="text-xs text-muted-foreground">
              Inmutable: el documento ya fue publicado
            </span>
          )}
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Tipo
          <select name="tipoId" defaultValue={campoEnviado("tipoId") ?? valores?.tipoId} required className={claseCampo}>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre} ({t.sigla})</option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Título
        <input name="titulo" defaultValue={campoEnviado("titulo") ?? valores?.titulo} required className={claseCampo} />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Descripción
        <textarea name="descripcion" defaultValue={campoEnviado("descripcion") ?? valores?.descripcion ?? ""} rows={3} className={claseCampo} />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Palabras clave (separadas por coma — alimentan la búsqueda)
        <input name="palabrasClave" defaultValue={campoEnviado("palabrasClave") ?? valores?.palabrasClave ?? ""} className={claseCampo} />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">
          Dónde aplica (marque los procesos/subprocesos; el radio ● define el propietario)
        </legend>
        <div className="max-h-80 overflow-y-auto rounded-md border p-3">
          {procesos.map((p) => (
            <details key={p.id} open={marcadas.has(`p:${p.id}`) || p.subprocesos.some((s) => marcadas.has(`s:${s.id}`))}>
              <summary className="flex cursor-pointer items-center gap-2 py-1 text-sm">
                <input
                  type="checkbox"
                  name="asociaciones"
                  value={`p:${p.id}`}
                  defaultChecked={marcadas.has(`p:${p.id}`)}
                  aria-label={`Aplica a ${p.nombre}`}
                />
                <input
                  type="radio"
                  name="principal"
                  value={`p:${p.id}`}
                  defaultChecked={marcaPrincipal === `p:${p.id}`}
                  aria-label={`${p.nombre} es el propietario`}
                />
                <span className="font-medium">{p.nombre}</span>
              </summary>
              <div className="ml-8 flex flex-col gap-1 pb-2">
                {p.subprocesos.map((s) => (
                  <span key={s.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="asociaciones"
                      value={`s:${s.id}`}
                      defaultChecked={marcadas.has(`s:${s.id}`)}
                      aria-label={`Aplica a ${s.nombre}`}
                    />
                    <input
                      type="radio"
                      name="principal"
                      value={`s:${s.id}`}
                      defaultChecked={marcaPrincipal === `s:${s.id}`}
                      aria-label={`${s.nombre} es el propietario`}
                    />
                    {s.nombre}
                  </span>
                ))}
              </div>
            </details>
          ))}
        </div>
      </fieldset>

      {estado && (
        <p role="alert" className="rounded-md bg-estado-critico-fondo px-3 py-2 text-sm text-estado-critico-texto">
          {estado.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pendiente}
        className="self-start rounded-md bg-azul px-5 py-2 font-medium text-white transition-colors hover:bg-azul-profundo disabled:opacity-60"
      >
        {pendiente ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}
