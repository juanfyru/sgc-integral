"use client";

import Link from "next/link";
import { useActionState } from "react";
import { registrarHistoricosAccion } from "@/app/acciones-indicadores";
import { ErrorAccion } from "@/componentes/tramites/AccionesSolicitud";
import { Boton, claseBoton } from "@/componentes/ui/Boton";
import { claseControl } from "@/componentes/ui/Campo";
import { celda, celdaNumerica, TablaDatos, type ColumnaTabla } from "@/componentes/ui/TablaDatos";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/** Un periodo histórico de la tabla del año, con sus valores por letra (coma decimal) y el resultado guardado. */
export type FilaHistoricaVista = {
  periodo: string;
  /** «Tercer trimestre de 2025». */
  etiqueta: string;
  cerrada: boolean;
  valores: { letra: string; valor: string | null }[];
  resultado: string | null;
};

/**
 * La tabla del año en modo edición (spec §8.8): una fila por periodo histórico y una celda por variable, y se guardan
 * todas a la vez. Cada celda viaja en su propio campo (`h_2025-T3_A`): funciona antes de hidratar. Una fila en blanco no
 * se registra; una cerrada se muestra sin campos.
 */
export function EdicionDeHistoricos({
  indicadorId,
  anio,
  variables,
  filas,
  volver,
}: {
  indicadorId: number;
  anio: number;
  variables: { letra: string; nombre: string }[];
  filas: FilaHistoricaVista[];
  /** La tabla del año sin el modo edición: adonde vuelve al guardar o al cancelar. */
  volver: string;
}) {
  const [estado, enviar, pendiente] = useActionState(registrarHistoricosAccion, null);
  const v = estado?.valores ?? {};
  const columnas: ColumnaTabla[] = [
    { clave: "periodo", etiqueta: "Periodo" },
    ...variables.map((x) => ({ clave: `var-${x.letra}`, etiqueta: x.nombre })),
    { clave: "resultado", etiqueta: "Resultado guardado", numerica: true },
  ];
  return (
    <form action={enviar} className="flex min-w-0 flex-col gap-3">
      <input type="hidden" name="id" value={indicadorId} />
      <input type="hidden" name="volver" value={volver} />
      <p className="text-sm text-muted-foreground">
        Los periodos que terminaron antes de aprobarse la ficha se registran aquí, varios a la vez. Quedan marcados «Registro histórico»; el análisis y el
        soporte son opcionales. Deje en blanco los que no tenga.
      </p>
      <TablaDatos titulo={`Históricos de ${anio}`} columnas={columnas} filas={filas.length} vacio={`No hay históricos que registrar en ${anio}.`}>
        {filas.map((f) => (
          <tr key={f.periodo}>
            <th scope="row" className={`${celda} text-left font-medium`}>
              {f.etiqueta}
              {f.cerrada ? <span className="block text-xs font-normal text-muted-foreground">Cerrada</span> : null}
            </th>
            {variables.map((x) => {
              const guardado = f.valores.find((y) => y.letra === x.letra)?.valor ?? null;
              const campo = `h_${f.periodo}_${x.letra}`;
              return (
                <td key={x.letra} className={celda}>
                  {f.cerrada ? (
                    <span className="tabular-nums">{guardado ?? "—"}</span>
                  ) : (
                    <input
                      name={campo}
                      aria-label={`${x.nombre}, ${f.etiqueta.toLowerCase()}`}
                      inputMode="decimal"
                      autoComplete="off"
                      defaultValue={typeof v[campo] === "string" ? (v[campo] as string) : (guardado ?? "")}
                      className={`${claseControl} w-28 min-w-0`}
                    />
                  )}
                </td>
              );
            })}
            <td className={celdaNumerica}>{f.resultado ?? "—"}</td>
          </tr>
        ))}
      </TablaDatos>
      <ErrorAccion estado={estado} />
      <div className="flex flex-wrap gap-2">
        <Boton type="submit" pendiente={pendiente}>
          {pendiente ? "Guardando…" : "Guardar los históricos"}
        </Boton>
        <Link href={volver} className={`${claseBoton("secundario")} ${FOCO}`}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
