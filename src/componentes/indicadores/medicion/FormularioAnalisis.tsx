"use client";

import { useActionState } from "react";
import { analizarAccion } from "@/app/acciones-indicadores";
import { ErrorAccion } from "@/componentes/tramites/AccionesSolicitud";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import type { DatosDeAnalisis } from "@/db/consultas/indicadores/analisis";
import { MINIMO_ANALISIS } from "@/lib/indicadores/estados";
import { MAXIMO_TEXTO_MEDICION } from "@/lib/indicadores/tipos";

const CONTROL = `${claseControl} w-full min-w-0`;
/** El análisis lo ve quien ve el indicador (en uno general, toda sesión): los datos personales van en el soporte (spec §21). */
const SIN_NOMBRES = "No escriba nombres de pacientes ni de funcionarios.";

function explicacion(d: DatosDeAnalisis): string {
  if (d.exigido === "dos_partes") {
    const por = d.semaforo === "critico" ? "El resultado quedó en crítico" : "El resultado no cumple por varios periodos seguidos";
    return `${por}: escriba la causa de la desviación y la acción propuesta. La medición queda marcada «Requiere acción de mejora».`;
  }
  if (d.exigido === "simple") return `El resultado no cumple: el análisis es obligatorio, de al menos ${MINIMO_ANALISIS} caracteres.`;
  return "El resultado cumple o no tiene meta: el análisis es opcional.";
}

/**
 * El análisis de una medición (spec §8.4): un campo si se exige el simple (u opcional si cumple), dos («Causa de la
 * desviación» y «Acción propuesta») si se exigen las dos partes; se pinta también lo que ya tenga texto, para poder
 * editarlo o borrarlo. Cada campo con su `name`: funciona antes de hidratar. Lo usan la pantalla de reporte y la página
 * del indicador.
 */
export function FormularioAnalisis({ datos, volver }: { datos: DatosDeAnalisis; volver: string }) {
  const [estado, enviar, pendiente] = useActionState(analizarAccion, null);
  const v = estado?.valores ?? {};
  const valor = (campo: string, guardado: string | null) => (typeof v[campo] === "string" ? (v[campo] as string) : (guardado ?? ""));
  const dosPartes = datos.exigido === "dos_partes";
  const conDosPartes = dosPartes || datos.causa !== null || datos.accionPropuesta !== null;
  const conAnalisis = !dosPartes || datos.analisis !== null;
  const id = (campo: string) => `analisis-${datos.medicionId}-${campo}`;
  const parte = (campo: "causa" | "accionPropuesta", etiqueta: string) => (
    <Campo etiqueta={etiqueta} nombre={campo} id={id(campo)} ayuda={SIN_NOMBRES}>
      <textarea
        rows={3}
        required={dosPartes}
        minLength={dosPartes ? MINIMO_ANALISIS : undefined}
        maxLength={MAXIMO_TEXTO_MEDICION}
        defaultValue={valor(campo, datos[campo])}
        className={CONTROL}
      />
    </Campo>
  );
  return (
    <form action={enviar} className="flex min-w-0 flex-col gap-3 rounded-lg border border-border px-4 py-3">
      <input type="hidden" name="id" value={datos.medicionId} />
      <input type="hidden" name="volver" value={volver} />
      <p className="text-sm">{explicacion(datos)}</p>
      {conDosPartes ? (
        <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
          {parte("causa", "Causa de la desviación")}
          {parte("accionPropuesta", "Acción propuesta")}
        </div>
      ) : null}
      {conAnalisis ? (
        <Campo etiqueta={datos.exigido === "ninguno" ? "Análisis (opcional)" : "Análisis"} nombre="analisis" id={id("analisis")} ayuda={SIN_NOMBRES}>
          <textarea
            rows={3}
            required={datos.exigido === "simple" && !conDosPartes}
            minLength={datos.exigido === "simple" && !conDosPartes ? MINIMO_ANALISIS : undefined}
            maxLength={MAXIMO_TEXTO_MEDICION}
            defaultValue={valor("analisis", datos.analisis)}
            className={CONTROL}
          />
        </Campo>
      ) : null}
      <ErrorAccion estado={estado} />
      <div>
        <Boton type="submit" pendiente={pendiente}>
          {pendiente ? "Guardando…" : "Guardar el análisis"}
        </Boton>
      </div>
    </form>
  );
}
