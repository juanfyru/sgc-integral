"use client";

import { CircleCheck, FileText, TriangleAlert } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { guardarConfigDocumentalAccion } from "@/app/admin/acciones-config-documental";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import type { ConfigDocumental } from "@/db/consultas/config-documental";
import type { EstadoFormato } from "@/db/consultas/formato-acta";
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

const DIAS_DISTRIBUCION: {
  clave: keyof ConfigDocumental["distribucion"];
  etiqueta: string;
  ayuda: string;
  minimo: number;
  maximo: number;
}[] = [
  { clave: "plazoRecibidoDias", etiqueta: "Confirmar el recibido (días)", ayuda: "Días que tiene un punto de uso para confirmar que recibió la copia.", minimo: 1, maximo: 365 },
  { clave: "plazoRecogidaDias", etiqueta: "Recoger copias obsoletas (días)", ayuda: "Días para retirar la copia anterior cuando sale una versión nueva.", minimo: 1, maximo: 365 },
  { clave: "plazoAcuseDias", etiqueta: "Acuse de lectura (días)", ayuda: "Días que tiene cada persona para confirmar que leyó la versión nueva.", minimo: 1, maximo: 365 },
  { clave: "plazoSocializacionDias", etiqueta: "Socialización (días)", ayuda: "Días para socializar un documento nuevo con quienes lo aplican.", minimo: 1, maximo: 365 },
  { clave: "plazoCorreccionDias", etiqueta: "Corregir una no conformidad (días)", ayuda: "Días para corregir lo que una verificación encuentre mal.", minimo: 1, maximo: 365 },
  { clave: "verificacionCadaDias", etiqueta: "Verificar cada (días)", ayuda: "Cada cuántos días se verifica que los puntos de uso tengan la versión vigente.", minimo: 1, maximo: 365 },
  { clave: "umbralConformidadPct", etiqueta: "Umbral de conformidad (%)", ayuda: "Porcentaje mínimo de conformidad para dar por buena una verificación (50 a 100).", minimo: 50, maximo: 100 },
];

const CM_DISTRIBUCION: { clave: keyof ConfigDocumental["distribucion"]; etiqueta: string; ayuda: string }[] = [
  { clave: "selloFranjaCm", etiqueta: "Alto de la franja del sello (cm)", ayuda: "De 0,5 a 3,0 cm. Se acepta coma o punto." },
  { clave: "selloQrCm", etiqueta: "Tamaño del código QR (cm)", ayuda: "De 1,0 a 3,0 cm. Se acepta coma o punto." },
];

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <h2 className="text-base font-semibold">{titulo}</h2>
      {children}
    </section>
  );
}

/** Sobre el formato guardado, no sobre lo que esté elegido en la lista sin guardar. */
function AvisoFormato({ estado }: { estado: EstadoFormato }) {
  if (estado.estado === "sin_formato") return null;
  if (estado.estado === "listo") {
    return (
      <div role="status" className="flex items-start gap-2 text-sm text-estado-bien-texto">
        <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p>
          Las actas nuevas usarán{" "}
          <span className="font-mono font-semibold">
            {estado.codigo}, versión {estado.version}
          </span>
          .
        </p>
      </div>
    );
  }
  const perdido = estado.estado === "perdido";
  const color = perdido ? "bg-estado-critico-fondo text-estado-critico-texto" : "bg-estado-atencion-fondo text-estado-atencion-texto";
  return (
    <div role="status" className={`flex items-start gap-2 rounded-md px-3 py-2 text-sm ${color}`}>
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p>
        {perdido ? (
          <span className="font-semibold">No se podrán generar actas hasta restaurar el archivo del formato.</span>
        ) : (
          <>
            <span className="font-semibold">Las actas saldrán con el diseño básico.</span> {estado.motivo}.
          </>
        )}
      </p>
    </div>
  );
}

export function FormularioConfigDocumental({
  config,
  documentosFormato,
  estadoFormato,
}: {
  config: ConfigDocumental;
  /** Trae el documento guardado aunque ya no sirva: así sigue elegido y guardar otra sección no lo quita. */
  documentosFormato: { id: number; codigo: string; titulo: string }[];
  estadoFormato: EstadoFormato;
}) {
  const [estado, enviar, pendiente] = useActionState(guardarConfigDocumentalAccion, null);
  const v = estado?.valores;
  const val = (campo: string): string | undefined => {
    const x = v?.[campo];
    return typeof x === "string" ? x : Array.isArray(x) ? x[0] : undefined;
  };
  const [formato, setFormato] = useState(val("formatoCodigo") ?? config.formatoCodigo ?? FORMATO_CODIGO_DEFECTO);
  const motivo = validarFormato(formato.trim());
  const ejemplo = motivo ? null : generarCodigo(formato.trim(), { proceso: "SGC", tipo: "FO", consecutivo: 2 });
  const [enviado, setEnviado] = useState(false);
  const confirmacion = useRef<HTMLParagraphElement>(null);
  const guardado = enviado && !pendiente && !estado;
  useEffect(() => {
    if (guardado) confirmacion.current?.focus();
  }, [guardado]);

  return (
    <form
      action={enviar}
      onSubmit={(evento) => {
        setEnviado(true);
        enviarSinReiniciar(enviar)(evento);
      }}
      onChange={() => setEnviado(false)}
      className="flex max-w-3xl flex-col gap-6"
    >
      <Seccion titulo="Formato del código">
        <Campo
          etiqueta="Formato"
          nombre="formatoCodigo"
          error={motivo ?? undefined}
          ayuda="Marcadores: {PROCESO} (sigla del proceso), {TIPO} (sigla del tipo) y {NN} o {NNN} (consecutivo de 2 o de 3 cifras como mínimo). Separe los marcadores con guiones. Cambiar el formato no cambia ningún código que ya exista. Si cambia el orden de los marcadores, revise el consecutivo sugerido antes de aceptar."
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
        {config.formatoCodigo === null && (
          <p className="rounded-md bg-estado-atencion-fondo px-3 py-2 text-sm text-estado-atencion-texto">
            Todavía no hay un formato guardado: el valor mostrado es el sugerido y no se aplica hasta que guarde.
          </p>
        )}
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
        <p className="text-sm text-muted-foreground">Plazos en días. Cero: la etapa vence el mismo día en que empieza.</p>
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
            ayuda="Se avisa al jefe de quien tiene el trámite cuando el paso lleva más de estos días de vencido."
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

      <Seccion titulo="Formato del acta">
        <Campo
          etiqueta="Documento del formato"
          nombre="formatoActaDocumentoId"
          ayuda="Un PDF de una página, tamaño carta, con el cuerpo en blanco. Guarde y use Ver acta de ejemplo para comprobar los espacios."
        >
          <select
            defaultValue={val("formatoActaDocumentoId") ?? String(config.formatoActa.documentoId ?? "")}
            className={`${claseControl} w-full min-w-0`}
          >
            <option value="">Sin formato: diseño básico</option>
            {documentosFormato.map((d) => (
              <option key={d.id} value={d.id}>
                {d.codigo} — {d.titulo}
              </option>
            ))}
          </select>
        </Campo>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Espacio del encabezado (cm)" nombre="margenSuperiorCm">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={12}
              step="0.1"
              required
              defaultValue={val("margenSuperiorCm") ?? config.formatoActa.margenSuperiorCm}
              className={claseControl}
            />
          </Campo>
          <Campo etiqueta="Espacio del pie (cm)" nombre="margenInferiorCm">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={12}
              step="0.1"
              required
              defaultValue={val("margenInferiorCm") ?? config.formatoActa.margenInferiorCm}
              className={claseControl}
            />
          </Campo>
        </div>
        <a
          href="/admin/api/acta-ejemplo"
          target="_blank"
          rel="noopener"
          aria-label="Ver acta de ejemplo (PDF), se abre en una pestaña nueva"
          className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-foreground underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          Ver acta de ejemplo
        </a>
        <AvisoFormato estado={estadoFormato} />
      </Seccion>

      <Seccion titulo="Distribución">
        <div className="grid gap-4 sm:grid-cols-2">
          {DIAS_DISTRIBUCION.map((d) => (
            <Campo key={d.clave} etiqueta={d.etiqueta} nombre={d.clave} ayuda={d.ayuda}>
              <input
                type="number"
                inputMode="numeric"
                min={d.minimo}
                max={d.maximo}
                step={1}
                required
                defaultValue={val(d.clave) ?? config.distribucion[d.clave]}
                className={claseControl}
              />
            </Campo>
          ))}
          {CM_DISTRIBUCION.map((d) => (
            <Campo key={d.clave} etiqueta={d.etiqueta} nombre={d.clave} ayuda={d.ayuda}>
              <input
                type="text"
                inputMode="decimal"
                pattern="[0-9]{1,2}([.,][0-9])?"
                required
                defaultValue={val(d.clave) ?? String(config.distribucion[d.clave]).replace(".", ",")}
                className={claseControl}
              />
            </Campo>
          ))}
        </div>
      </Seccion>

      {estado && estado.error !== motivo && (
        <p role="alert" className="rounded-md bg-estado-critico-fondo px-3 py-2 text-sm text-estado-critico-texto">
          {estado.error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Boton type="submit" pendiente={pendiente}>
          {pendiente ? "Guardando…" : "Guardar configuración"}
        </Boton>
        <p ref={confirmacion} role="status" tabIndex={-1} className="text-sm text-estado-bien-texto">
          {guardado ? "Configuración guardada" : ""}
        </p>
      </div>
    </form>
  );
}
