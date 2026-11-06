"use client";

import { useActionState, useState } from "react";
import { guardarConfigDocumentalAccion } from "@/app/admin/acciones-config-documental";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import type { ConfigDocumental } from "@/db/consultas/config-documental";
import { FORMATO_CODIGO_DEFECTO, generarCodigo, validarFormato } from "@/lib/tramites/codigo";

const PLAZOS: { campo: string; clave: keyof ConfigDocumental["plazos"]; etiqueta: string }[] = [
  { campo: "plazoVistoBueno", clave: "visto_bueno", etiqueta: "Visto bueno del líder" },
  { campo: "plazoAceptacion", clave: "aceptacion", etiqueta: "Aceptación de la solicitud" },
  { campo: "plazoElaboracion", clave: "elaboracion", etiqueta: "Elaboración" },
  { campo: "plazoAjustes", clave: "ajustes", etiqueta: "Ajustes tras una devolución" },
  { campo: "plazoRevision", clave: "revision", etiqueta: "Revisión" },
  { campo: "plazoAprobacion", clave: "aprobacion", etiqueta: "Aprobación" },
  { campo: "plazoPublicacion", clave: "publicacion", etiqueta: "Publicación" },
];

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <h2 className="text-base font-semibold">{titulo}</h2>
      {children}
    </section>
  );
}

export function FormularioConfigDocumental({ config }: { config: ConfigDocumental }) {
  const [estado, enviar, pendiente] = useActionState(guardarConfigDocumentalAccion, null);
  const v = estado?.valores;
  const val = (campo: string): string | undefined => {
    const x = v?.[campo];
    return typeof x === "string" ? x : Array.isArray(x) ? x[0] : undefined;
  };
  const [formato, setFormato] = useState(val("formatoCodigo") ?? config.formatoCodigo ?? FORMATO_CODIGO_DEFECTO);
  const motivo = validarFormato(formato.trim());
  const ejemplo = motivo ? null : generarCodigo(formato.trim(), { proceso: "SGC", tipo: "FO", consecutivo: 2 });

  return (
    <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex max-w-3xl flex-col gap-6">
      <Seccion titulo="Formato del código">
        <Campo
          etiqueta="Formato"
          nombre="formatoCodigo"
          error={motivo ?? undefined}
          ayuda="Marcadores: {PROCESO} (sigla del proceso), {TIPO} (sigla del tipo) y {NN} o {NNN} (consecutivo de 2 o de 3 cifras como mínimo). Separe los marcadores con guiones. Cambiar el formato no cambia ningún código que ya exista."
        >
          <input
            required
            value={formato}
            onChange={(e) => setFormato(e.target.value)}
            className={`${claseControl} font-mono`}
            autoComplete="off"
            spellCheck={false}
          />
        </Campo>
        <p className="text-sm" aria-live="polite">
          Ejemplo:{" "}
          {ejemplo ? (
            <span className="font-mono font-semibold">{ejemplo}</span>
          ) : (
            <span className="text-muted-foreground">no disponible mientras el formato sea inválido</span>
          )}
        </p>
      </Seccion>

      <Seccion titulo="Plazos y escalamiento">
        <p className="text-sm text-muted-foreground">Plazos en días. Cero significa sin plazo para esa etapa.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {PLAZOS.map((p) => (
            <Campo key={p.campo} etiqueta={p.etiqueta} nombre={p.campo}>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={365}
                step={1}
                required
                defaultValue={val(p.campo) ?? config.plazos[p.clave]}
                className={claseControl}
              />
            </Campo>
          ))}
          <Campo
            etiqueta="Días para avisar al jefe"
            nombre="escalamientoDias"
            ayuda="Días de retraso a partir de los cuales se avisa al jefe de quien tiene el trámite."
          >
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={60}
              step={1}
              required
              defaultValue={val("escalamientoDias") ?? config.escalamientoDias}
              className={claseControl}
            />
          </Campo>
        </div>
      </Seccion>

      <Seccion titulo="Publicación directa">
        <label className="flex items-start gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="publicacionDirecta"
            className="mt-1"
            defaultChecked={v ? val("publicacionDirecta") === "on" : config.publicacionDirecta}
          />
          Permitir registrar documentos ya aprobados sin trámite
        </label>
        <p className="text-sm text-muted-foreground">
          Apáguela cuando termine la carga inicial. Desde ese momento todo documento nuevo y todo cambio pasan por un trámite.
        </p>
      </Seccion>

      {estado && estado.error !== motivo && (
        <p role="alert" className="rounded-md bg-estado-critico-fondo px-3 py-2 text-sm text-estado-critico-texto">
          {estado.error}
        </p>
      )}
      <Boton type="submit" pendiente={pendiente} className="self-start">
        {pendiente ? "Guardando…" : "Guardar configuración"}
      </Boton>
    </form>
  );
}
