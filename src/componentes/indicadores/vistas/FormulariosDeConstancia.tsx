"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { corregirConstanciaAccion, quitarSoporteDeConstanciaAccion, registrarConstanciaAccion } from "@/app/acciones-indicadores";
import type { EstadoAccion } from "@/app/admin/comun";
import { ZonaCarga } from "@/componentes/admin/ZonaCarga";
import { IconoFormato } from "@/componentes/documentos/IconoFormato";
import { useAccionDeDialogo } from "@/componentes/indicadores/admin/useAccionDeDialogo";
import { cerrarTrasGuardar } from "@/componentes/indicadores/medicion/cerrar-tras-guardar";
import { ErrorAccion } from "@/componentes/tramites/AccionesSolicitud";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { useTituloAlDesaparecer } from "@/componentes/ui/foco";
import type { Soporte } from "@/db/consultas/indicadores/soportes";
import { JUSTIFICACION_MAXIMA_CONSTANCIA, JUSTIFICACION_MINIMA_CONSTANCIA, NOTA_MAXIMA, RADICADO_MAXIMO } from "@/lib/indicadores/constancias";
import { enlaceDeSoporte } from "@/lib/indicadores/soportes";
import { ENLACE, FOCO } from "./comun";

const CONTROL = `${claseControl} w-full min-w-0`;

/** Lo que el formulario necesita de la constancia. */
export type ConstanciaDelFormulario = { id: number; etiqueta: string; fechaEnvio: string | null; radicado: string | null; nota: string | null };

/** Lo enviado que volvió con un error, o lo que la constancia ya tenía. */
const valorPrevio = (estado: EstadoAccion, campo: string, inicial: string | null) => {
  const v = estado?.valores?.[campo];
  return typeof v === "string" ? v : (inicial ?? "");
};

function QuitarSoporte({ soporte }: { soporte: Soporte }) {
  const [estado, enviar, pendiente] = useActionState<EstadoAccion, FormData>(quitarSoporteDeConstanciaAccion, null);
  return (
    <form action={enviar} className="flex flex-col items-start gap-1">
      <input type="hidden" name="id" value={soporte.id} />
      <Boton type="submit" variante="peligro" tamano="sm" pendiente={pendiente} aria-label={`Quitar el soporte ${soporte.nombre}`}>
        {pendiente ? "Quitando…" : "Quitar"}
      </Boton>
      {estado && !estado.ok ? (
        <p role="alert" className="text-xs text-estado-critico-texto">
          {estado.error}
        </p>
      ) : null}
    </form>
  );
}

/**
 * Los soportes de una constancia, como los de una medición (`medicion/Soportes`): cada uno, un enlace de descarga con su
 * formato y su tamaño, y la zona de carga de las evidencias (PDF o imagen, nunca Excel), que sube por
 * `/api/reportes-externos/<id>/archivos`. Solo en una pendiente se quitan (`quitables`).
 */
function SoportesDeConstancia({ constanciaId, codigo, soportes, quitables }: { constanciaId: number; codigo: string; soportes: Soporte[]; quitables: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="text-sm font-medium">Soportes del envío</p>
      {soportes.length > 0 ? (
        <ul className="flex list-none flex-col gap-2">
          {soportes.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <a href={enlaceDeSoporte(codigo, s)} className={`min-w-0 break-words ${ENLACE}`}>
                  {s.nombre}
                </a>
                <IconoFormato mime={s.mime} tamanoBytes={s.tamano} />
              </span>
              {quitables ? <QuitarSoporte soporte={s} /> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Sin soportes adjuntos.</p>
      )}
      <p className="text-sm text-muted-foreground">
        {quitables
          ? "Un soporte puede ser un PDF o una imagen: la constancia del ente, el radicado o la captura del cargue. Se puede quitar mientras el envío no esté registrado. Solo lo ven quienes ven los soportes del indicador."
          : "Puede adjuntar el documento correcto. Los soportes de un envío registrado no se quitan. Solo los ven quienes ven los soportes del indicador."}
      </p>
      <ZonaCarga direccion={`/api/reportes-externos/${constanciaId}/archivos`} evidencia />
    </div>
  );
}

/** Los campos del envío: fecha (no futura), radicado y nota, con un `id` por constancia. */
function CamposDelEnvio({ prefijo, id, hoy, estado, constancia }: { prefijo: string; id: number; hoy: string; estado: EstadoAccion; constancia: ConstanciaDelFormulario | null }) {
  return (
    <>
      <Campo etiqueta="Fecha de envío" nombre="fechaEnvio" id={`${prefijo}-fecha-${id}`} ayuda="El día en que se envió al ente; no puede ser futura.">
        <input type="date" required max={hoy} defaultValue={valorPrevio(estado, "fechaEnvio", constancia?.fechaEnvio ?? null)} className={`${CONTROL} sm:w-48`} />
      </Campo>
      <Campo etiqueta="Radicado o número de constancia" nombre="radicado" id={`${prefijo}-radicado-${id}`}>
        <input type="text" required maxLength={RADICADO_MAXIMO} defaultValue={valorPrevio(estado, "radicado", constancia?.radicado ?? null)} className={CONTROL} />
      </Campo>
      <Campo etiqueta="Nota (opcional)" nombre="nota" id={`${prefijo}-nota-${id}`} ayuda={`Hasta ${NOTA_MAXIMA} caracteres.`}>
        <textarea rows={2} maxLength={NOTA_MAXIMA} defaultValue={valorPrevio(estado, "nota", constancia?.nota ?? null)} className={CONTROL} />
      </Campo>
    </>
  );
}

/**
 * «Registrar el envío» de una constancia pendiente (anexo 14B, §8): antes, el resultado del periodo que se congela al
 * registrar y, si es parcial, qué falta (se puede registrar así); los soportes, con su zona de carga (registrar exige al
 * menos uno); y la fecha, el radicado y la nota. Sin clave. Registrada, la sección se va: el foco pasa al título.
 */
export function RegistrarEnvio({
  constancia,
  codigo,
  soportes,
  resultado,
  aviso,
  hoy,
}: {
  constancia: { id: number; etiqueta: string };
  codigo: string;
  soportes: Soporte[];
  /** «Resultado del periodo: 86,7 %». */
  resultado: string;
  /** El aviso de un resultado parcial; `null` si no lo es. */
  aviso: string | null;
  /** `AAAA-MM-DD`, el límite de la fecha de envío. */
  hoy: string;
}) {
  const [hecho, setHecho] = useState(false);
  const [estado, enviar, pendiente] = useAccionDeDialogo(registrarConstanciaAccion, () => setHecho(true));
  useTituloAlDesaparecer(hecho);
  const { id, etiqueta } = constancia;
  return (
    <section id={`constancia-${id}`} aria-labelledby={`constancia-${id}-titulo`} className="flex min-w-0 scroll-mt-24 flex-col gap-4 rounded-lg border border-border px-4 py-3">
      <h3 id={`constancia-${id}-titulo`} className="font-semibold">{`Registrar el envío · ${etiqueta}`}</h3>
      <div className="flex flex-col gap-2">
        <p className="text-sm">{resultado}</p>
        {aviso ? <p className="rounded-md bg-estado-atencion-fondo px-3 py-2 text-sm text-estado-atencion-texto">{aviso}</p> : null}
        <p className="text-xs text-muted-foreground">Al registrar, este resultado queda congelado en la constancia: una corrección posterior de las mediciones no lo cambia.</p>
      </div>
      <SoportesDeConstancia constanciaId={id} codigo={codigo} soportes={soportes} quitables />
      <form action={enviar} className="flex min-w-0 flex-col gap-3">
        <input type="hidden" name="id" value={id} />
        <CamposDelEnvio prefijo="envio" id={id} hoy={hoy} estado={estado} constancia={null} />
        <ErrorAccion estado={estado} />
        <div>
          <Boton type="submit" pendiente={pendiente}>
            {pendiente ? "Registrando…" : "Registrar el envío"}
            <span className="sr-only">{`, ${etiqueta.toLowerCase()}`}</span>
          </Boton>
        </div>
      </form>
    </section>
  );
}

/**
 * «Corregir» una constancia registrada (anexo 14B, §8): la fecha, el radicado o la nota, con su justificación; no recalcula
 * el resultado enviado. Admite un soporte más (el documento correcto), y los que tiene no se quitan. Un desplegable que se
 * cierra cuando la corrección se guarda.
 */
export function CorregirEnvio({
  constancia,
  codigo,
  soportes,
  hoy,
}: {
  constancia: ConstanciaDelFormulario;
  codigo: string;
  soportes: Soporte[];
  hoy: string;
}) {
  const [estado, enviar, pendiente] = useActionState<EstadoAccion, FormData>(corregirConstanciaAccion, null);
  const desplegable = useRef<HTMLDetailsElement>(null);
  const enviaba = useRef(false);
  useEffect(() => {
    if (desplegable.current) cerrarTrasGuardar(desplegable.current, { enviaba: enviaba.current, pendiente, estado });
    enviaba.current = pendiente;
  }, [pendiente, estado]);
  const { id, etiqueta } = constancia;
  return (
    <details id={`constancia-${id}`} ref={desplegable} className="min-w-0 scroll-mt-24 rounded-lg border border-border px-4 py-3">
      <summary className={`cursor-pointer rounded-sm text-sm font-medium ${FOCO}`}>{`Corregir el envío · ${etiqueta}`}</summary>
      <div className="mt-3 flex min-w-0 flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          La corrección no recalcula el resultado enviado. Queda en el historial con lo que había, lo que quedó y su justificación.
        </p>
        <SoportesDeConstancia constanciaId={id} codigo={codigo} soportes={soportes} quitables={false} />
        <form action={enviar} className="flex min-w-0 flex-col gap-3">
          <input type="hidden" name="id" value={id} />
          <CamposDelEnvio prefijo="corregir" id={id} hoy={hoy} estado={estado} constancia={constancia} />
          <Campo
            etiqueta="Justificación"
            nombre="justificacion"
            id={`corregir-justificacion-${id}`}
            ayuda={`Entre ${JUSTIFICACION_MINIMA_CONSTANCIA} y ${JUSTIFICACION_MAXIMA_CONSTANCIA} caracteres. La ve quien ve los soportes del indicador.`}
          >
            <textarea
              required
              minLength={JUSTIFICACION_MINIMA_CONSTANCIA}
              maxLength={JUSTIFICACION_MAXIMA_CONSTANCIA}
              rows={3}
              defaultValue={valorPrevio(estado, "justificacion", null)}
              className={CONTROL}
            />
          </Campo>
          <ErrorAccion estado={estado} />
          <div>
            <Boton type="submit" variante="secundario" pendiente={pendiente}>
              {pendiente ? "Guardando…" : "Guardar la corrección"}
              <span className="sr-only">{`, ${etiqueta.toLowerCase()}`}</span>
            </Boton>
          </div>
        </form>
      </div>
    </details>
  );
}
