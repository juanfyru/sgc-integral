"use client";

import { useActionState, useState } from "react";
import type { EstadoAccion } from "@/app/admin/comun";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { hexValido } from "@/lib/color";
import { validarMarca } from "@/lib/marca";
import type { DatosEntidad } from "@/db/consultas/entidad";
import { VistaPreviaMarca } from "./VistaPreviaMarca";

/** Selector de color y texto hex sincronizados; solo el texto lleva el `name` que se envía. */
function EntradaColor({
  valor,
  alCambiar,
  ...resto
}: {
  valor: string;
  alCambiar: (v: string) => void;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        aria-label="Elegir color"
        value={hexValido(valor) ? valor.toLowerCase() : "#000000"}
        onChange={(e) => alCambiar(e.target.value)}
        className="h-10 w-12 shrink-0 cursor-pointer rounded-md border border-border bg-card p-1"
      />
      <input
        {...resto}
        type="text"
        value={valor}
        onChange={(e) => alCambiar(e.target.value.trim())}
        maxLength={7}
        spellCheck={false}
        autoComplete="off"
        className={`${claseControl} w-32 font-mono`}
      />
    </div>
  );
}

export function FormularioEntidad({
  accion,
  entidad,
  guardado,
  children,
}: {
  accion: (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;
  entidad: DatosEntidad;
  guardado: boolean;
  children?: React.ReactNode;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const v = estado?.valores;
  const valor = (c: string, defecto: string) => {
    const x = v?.[c];
    return typeof x === "string" ? x : defecto;
  };
  const [nombre, setNombre] = useState(valor("nombre_entidad", entidad.nombre));
  const [sigla, setSigla] = useState(valor("sigla_entidad", entidad.sigla));
  const [primario, setPrimario] = useState(entidad.primario);
  const [secundario, setSecundario] = useState(entidad.secundario);

  const errores =
    hexValido(primario) && hexValido(secundario)
      ? validarMarca({ primario: primario.toLowerCase(), secundario: secundario.toLowerCase() })
      : [];
  const errorDe = (campo: string) =>
    hexValido(campo === "color_primario" ? primario : secundario)
      ? errores.find((e) => e.campo === campo)?.mensaje
      : "Use un color de seis dígitos, por ejemplo #1b4e8e.";

  return (
    <div className="contents">
      <div className="space-y-5">
        <form action={enviar} className="flex flex-col gap-5">
          <Campo etiqueta="Nombre de la entidad" nombre="nombre_entidad">
            <input
              required
              minLength={3}
              maxLength={120}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className={claseControl}
            />
          </Campo>
          <Campo etiqueta="Sigla" nombre="sigla_entidad" ayuda="Aparece en el monograma de la barra lateral y en la pestaña.">
            <input
              required
              minLength={2}
              maxLength={12}
              value={sigla}
              onChange={(e) => setSigla(e.target.value)}
              className={`${claseControl} w-40`}
            />
          </Campo>
          <Campo etiqueta="Lema" nombre="lema">
            <input maxLength={200} defaultValue={valor("lema", entidad.lema)} className={claseControl} />
          </Campo>
          <Campo
            etiqueta="Aviso de datos personales"
            nombre="aviso_datos_personales"
            ayuda="Texto que cada persona acepta en su primer ingreso."
          >
            <textarea
              rows={6}
              maxLength={5000}
              defaultValue={valor("aviso_datos_personales", entidad.avisoDatosPersonales)}
              className={claseControl}
            />
          </Campo>
          <Campo etiqueta="Color primario" nombre="color_primario" error={errorDe("color_primario")}>
            <EntradaColor valor={primario} alCambiar={setPrimario} />
          </Campo>
          <Campo etiqueta="Color secundario" nombre="color_secundario" error={errorDe("color_secundario")}>
            <EntradaColor valor={secundario} alCambiar={setSecundario} />
          </Campo>
          {estado ? (
            <p role="alert" className="rounded-md bg-estado-critico-fondo px-3 py-2 text-sm text-estado-critico-texto">
              {estado.error}
            </p>
          ) : null}
          {guardado && !estado ? (
            <p role="status" className="text-sm text-estado-bien-texto">
              Cambios guardados
            </p>
          ) : null}
          <Boton type="submit" pendiente={pendiente} className="self-start">
            {pendiente ? "Guardando…" : "Guardar"}
          </Boton>
        </form>
      </div>
      <div className="space-y-8">
        <VistaPreviaMarca primario={primario} secundario={secundario} sigla={sigla} nombre={nombre} />
        {children}
      </div>
    </div>
  );
}
