"use client";

import { useState } from "react";
import { guardarConfigMejoraAccion } from "@/app/admin/acciones-mejoramiento";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { useAccionDeDialogo } from "@/componentes/indicadores/admin/useAccionDeDialogo";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import type { ConfigMejora, DocumentoParaFormato } from "@/db/consultas/mejoramiento/config";

const CONTROL = `${claseControl} w-full min-w-0 max-w-full`;

const IMPRESOS: ReadonlyArray<{ impreso: keyof ConfigMejora["formatos"]; etiqueta: string }> = [
  { impreso: "registro", etiqueta: "Registro del hallazgo" },
  { impreso: "porques", etiqueta: "Análisis de los cinco porqués" },
  { impreso: "ishikawa", etiqueta: "Diagrama de Ishikawa" },
];

/** El documento del sistema de calidad que da el código y la versión de cada impreso (spec 15 §16.4). */
export function FormatosDeImpresos({ formatos, documentos }: { formatos: ConfigMejora["formatos"]; documentos: DocumentoParaFormato[] }) {
  const [guardado, setGuardado] = useState(false);
  const [estado, enviar, pendiente] = useAccionDeDialogo(guardarConfigMejoraAccion, () => setGuardado(true));
  const v = estado?.valores;
  return (
    <section aria-labelledby="titulo-formatos" className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-4">
      <div>
        <h2 id="titulo-formatos" className="text-base font-semibold">
          Formatos de los impresos
        </h2>
        <p className="text-sm text-muted-foreground">
          El encabezado de cada impreso lleva el código, la versión y la fecha de emisión vigentes del documento que elija aquí.
        </p>
      </div>
      <form
        action={enviar}
        onSubmit={(e) => {
          setGuardado(false);
          enviarSinReiniciar(enviar)(e);
        }}
        className="flex max-w-xl flex-col gap-3"
      >
        <input type="hidden" name="bloque" value="formatos" />
        {IMPRESOS.map((i) => {
          const previo = v?.[`formato_${i.impreso}`];
          const actual = typeof previo === "string" ? previo : String(formatos[i.impreso] ?? "");
          return (
            <Campo key={i.impreso} etiqueta={i.etiqueta} nombre={`formato_${i.impreso}`} id={`mej-formato-${i.impreso}`}>
              <select defaultValue={actual} className={CONTROL}>
                <option value="">Sin documento</option>
                {documentos.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.codigo} · {d.titulo}{d.sinVigente ? " (sin versión vigente)" : ""}
                  </option>
                ))}
              </select>
            </Campo>
          );
        })}
        {estado ? (
          <p role="alert" className="text-sm text-estado-critico-texto">
            {estado.error}
          </p>
        ) : null}
        {guardado && !estado ? (
          <p role="status" className="text-sm text-estado-bien-texto">
            Formatos guardados.
          </p>
        ) : null}
        <Boton type="submit" pendiente={pendiente} className="self-start">
          {pendiente ? "Guardando…" : "Guardar los formatos"}
        </Boton>
      </form>
    </section>
  );
}
