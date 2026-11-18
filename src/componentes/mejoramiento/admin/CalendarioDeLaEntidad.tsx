"use client";

import { useRef, useState } from "react";
import { agregarDiaAccion, quitarDiaAccion } from "@/app/admin/acciones-mejoramiento";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { useAccionDeDialogo } from "@/componentes/indicadores/admin/useAccionDeDialogo";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { celda, TablaDatos } from "@/componentes/ui/TablaDatos";
import type { DiaDeCalendario } from "@/db/consultas/mejoramiento/config";

const CONTROL = `${claseControl} w-full min-w-0 max-w-full`;
const TIPO: Record<DiaDeCalendario["tipo"], string> = { no_habil: "No hábil", habil: "Hábil (anula un festivo)" };

export type FestivoCalculado = { fecha: string; etiqueta: string };

function FilaDelDia({ dia, etiqueta }: { dia: DiaDeCalendario; etiqueta: string }) {
  const [estado, enviar, pendiente] = useAccionDeDialogo(quitarDiaAccion, () => undefined);
  return (
    <tr>
      <td className={celda}>{etiqueta}</td>
      <td className={celda}>{TIPO[dia.tipo]}</td>
      <td className={celda}>{dia.motivo}</td>
      <td className={celda}>
        <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex flex-col items-start gap-1">
          <input type="hidden" name="id" value={dia.id} />
          <Boton type="submit" variante="secundario" tamano="sm" pendiente={pendiente}>
            {pendiente ? "Quitando…" : "Quitar"}
            <span className="sr-only">{` el día ${etiqueta}`}</span>
          </Boton>
          {estado ? (
            <p role="alert" className="text-xs text-estado-critico-texto">
              {estado.error}
            </p>
          ) : null}
        </form>
      </td>
    </tr>
  );
}

/**
 * El calendario de la entidad (spec 15 §13.1): los días no hábiles que añade el Admin SGC, los festivos
 * calculados que anula y, en solo lectura, los festivos de Colombia del año en curso y del siguiente.
 */
export function CalendarioDeLaEntidad({
  dias,
  etiquetas,
  festivos,
}: {
  dias: DiaDeCalendario[];
  /** La fecha de cada día de la lista, escrita con su día de la semana (la arma el servidor). */
  etiquetas: Record<string, string>;
  festivos: { anio: number; dias: FestivoCalculado[] }[];
}) {
  const formulario = useRef<HTMLFormElement>(null);
  const [guardado, setGuardado] = useState(false);
  const [estado, enviar, pendiente] = useAccionDeDialogo(agregarDiaAccion, () => {
    setGuardado(true);
    formulario.current?.reset();
  });
  const v = estado?.valores;
  const previo = (campo: string) => (typeof v?.[campo] === "string" ? (v[campo] as string) : "");
  return (
    <section aria-labelledby="titulo-calendario" className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-4">
      <div>
        <h2 id="titulo-calendario" className="text-base font-semibold">
          Calendario de la entidad
        </h2>
        <p className="text-sm text-muted-foreground">
          Un día no hábil (un día cívico, un cierre institucional o un festivo nuevo) o un festivo calculado que vuelve a ser hábil. Lo que se añade o se
          quita vale para los plazos que se calculen desde entonces; los ya calculados no se mueven.
        </p>
      </div>
      <TablaDatos
        titulo="Días del calendario de la entidad"
        columnas={[
          { clave: "fecha", etiqueta: "Fecha" },
          { clave: "tipo", etiqueta: "Tipo" },
          { clave: "motivo", etiqueta: "Motivo" },
          { clave: "acciones", etiqueta: "Acciones", oculta: true },
        ]}
        filas={dias.length}
        vacio="No hay días añadidos: rigen solo los sábados, los domingos y los festivos calculados."
      >
        {dias.map((d) => (
          <FilaDelDia key={d.id} dia={d} etiqueta={etiquetas[d.fecha] ?? d.fecha} />
        ))}
      </TablaDatos>
      <form
        ref={formulario}
        action={enviar}
        onSubmit={(e) => {
          setGuardado(false);
          enviarSinReiniciar(enviar)(e);
        }}
        className="flex max-w-xl flex-col gap-3"
      >
        <h3 className="text-sm font-semibold">Añadir un día</h3>
        <Campo etiqueta="Fecha" nombre="fecha" id="mej-dia-fecha">
          <input type="date" required defaultValue={previo("fecha")} className={CONTROL} />
        </Campo>
        <Campo
          etiqueta="Tipo"
          nombre="tipo"
          id="mej-dia-tipo"
          ayuda="«Hábil» solo se admite para un festivo de los que se calculan abajo."
        >
          <select required defaultValue={previo("tipo") || "no_habil"} className={CONTROL}>
            <option value="no_habil">No hábil</option>
            <option value="habil">Hábil (anula un festivo)</option>
          </select>
        </Campo>
        <Campo etiqueta="Motivo" nombre="motivo" id="mej-dia-motivo">
          <input type="text" required maxLength={200} defaultValue={previo("motivo")} className={CONTROL} />
        </Campo>
        {estado ? (
          <p role="alert" className="text-sm text-estado-critico-texto">
            {estado.error}
          </p>
        ) : null}
        {guardado && !estado ? (
          <p role="status" className="text-sm text-estado-bien-texto">
            Día añadido.
          </p>
        ) : null}
        <Boton type="submit" pendiente={pendiente} className="self-start">
          {pendiente ? "Añadiendo…" : "Añadir el día"}
        </Boton>
      </form>
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">Festivos de Colombia que calcula el sistema</h3>
        <p className="text-sm text-muted-foreground">Solo lectura: se calculan con la Ley 51 de 1983, sin consultar internet.</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {festivos.map((a) => (
            <div key={a.anio}>
              <h4 className="text-sm font-medium">{a.anio}</h4>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {a.dias.map((f) => (
                  <li key={f.fecha}>{f.etiqueta}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
