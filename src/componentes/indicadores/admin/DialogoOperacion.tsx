"use client";

import { cambiarOperacionAccion } from "@/app/acciones-indicadores";
import { ErrorAccion } from "@/componentes/tramites/AccionesSolicitud";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { Dialogo } from "@/componentes/ui/Dialogo";
import type { DatosOperacion } from "@/lib/indicadores/tipos";
import { CLASE_DIALOGO } from "./DialogoRetirar";
import { useAccionDeDialogo } from "./useAccionDeDialogo";

const CONTROL = `${claseControl} w-full`;

/**
 * «Datos de operación» (spec §7.3): el plazo de reporte, el inicio de medición, el soporte obligatorio y el nivel de
 * acceso. No crean versión ni cambian la huella de la ficha; el cambio queda en la bitácora con antes y después.
 */
export function DialogoOperacion({
  abierto,
  alCerrar,
  indicadorId,
  codigo,
  operacion,
  periodos,
}: {
  abierto: boolean;
  alCerrar: () => void;
  indicadorId: number;
  codigo: string;
  operacion: DatosOperacion;
  periodos: { clave: string; etiqueta: string }[];
}) {
  const [estado, enviar, pendiente] = useAccionDeDialogo(cambiarOperacionAccion, alCerrar);
  const v = estado?.valores ?? {};
  const texto = (campo: string, porOmision: string) => (typeof v[campo] === "string" ? (v[campo] as string) : porOmision);
  const soporte = estado ? "soporteObligatorio" in v : operacion.soporteObligatorio;
  return (
    <Dialogo abierto={abierto} alCerrar={alCerrar} titulo={`Datos de operación de ${codigo}`} className={CLASE_DIALOGO}>
      {abierto ? (
        <form action={enviar} className="flex flex-col gap-4 p-5">
          <input type="hidden" name="id" value={indicadorId} />
          <p aria-hidden="true" className="font-semibold">{`Datos de operación de ${codigo}`}</p>
          <p className="text-sm text-muted-foreground">
            No crean una versión nueva ni cambian la huella de la ficha. Queda en la bitácora lo que había y lo que queda.
          </p>
          <Campo etiqueta="Plazo de reporte (días)" nombre="plazoReporteDias" ayuda="Días calendario después de terminar el periodo, de 0 a 90.">
            <input type="number" required min={0} max={90} step={1} inputMode="numeric" defaultValue={texto("plazoReporteDias", String(operacion.plazoReporteDias))} className={CONTROL} />
          </Campo>
          <Campo
            etiqueta="Inicio de medición"
            nombre="inicioMedicion"
            ayuda="El primer periodo que se mide. No puede dejar fuera una medición que ya tiene datos."
          >
            <select required defaultValue={texto("inicioMedicion", operacion.inicioMedicion)} className={CONTROL}>
              {periodos.map((p) => (
                <option key={p.clave} value={p.clave}>
                  {p.etiqueta}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Nivel de acceso" nombre="nivelAcceso" ayuda="Un indicador restringido solo lo ven Gerencia, Control Interno y el Admin SGC, y las personas de su proceso o designadas en él.">
            <select required defaultValue={texto("nivelAcceso", operacion.nivelAcceso)} className={CONTROL}>
              <option value="general">General</option>
              <option value="restringido">Restringido</option>
            </select>
          </Campo>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="soporteObligatorio" defaultChecked={soporte} className="mt-0.5 size-4 accent-marca-relleno" />
            <span>Pedir un soporte (archivo) con cada reporte</span>
          </label>
          <ErrorAccion estado={estado} />
          <div className="flex flex-wrap justify-end gap-2">
            <Boton variante="secundario" onClick={alCerrar}>
              Volver
            </Boton>
            <Boton type="submit" pendiente={pendiente}>
              {pendiente ? "Guardando…" : "Guardar"}
            </Boton>
          </div>
        </form>
      ) : null}
    </Dialogo>
  );
}
