"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { aprobarFichasAccion, devolverFichaAccion } from "@/app/acciones-indicadores";
import { ErrorAccion } from "@/componentes/tramites/AccionesSolicitud";
import { DialogoFirma } from "@/componentes/tramites/DialogoFirma";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { Dialogo } from "@/componentes/ui/Dialogo";
import { useTituloAlDesaparecer } from "@/componentes/ui/foco";
import { Insignia } from "@/componentes/ui/Insignia";
import { celda, TablaDatos } from "@/componentes/ui/TablaDatos";
import type { TipoCambio } from "@/lib/indicadores/tipos";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/** Una ficha por aprobar, con las fechas ya en palabras y el enlace a su ficha. */
export type FilaPorAprobar = {
  versionId: number;
  codigo: string;
  nombre: string;
  proceso: string;
  numero: number;
  tipoCambio: TipoCambio;
  cambios: string[];
  motivo: string | null;
  elaboro: string;
  enviada: string;
  enlace: string;
};

const COLUMNAS = [
  { clave: "elegir", etiqueta: "Elegir", oculta: true },
  { clave: "indicador", etiqueta: "Indicador" },
  { clave: "cambio", etiqueta: "Qué cambió" },
  { clave: "elaboro", etiqueta: "Elaboró" },
  { clave: "acciones", etiqueta: "Acciones", oculta: true },
];

/** «Devolver» con nota obligatoria y sin clave (spec §7.6.3): vuelve a borrador y avisa a quien la elaboró. */
export function DevolverFicha({ versionId, codigo, tamano }: { versionId: number; codigo: string; tamano?: "sm" | "md" }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, enviar, pendiente] = useActionState(devolverFichaAccion, null);
  const nota = estado?.valores?.nota;
  useTituloAlDesaparecer(abierto);
  return (
    <>
      <Boton variante="secundario" tamano={tamano} onClick={() => setAbierto(true)} aria-haspopup="dialog" aria-label={`Devolver: ${codigo}`}>
        Devolver
      </Boton>
      <Dialogo
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
        titulo={`Devolver la ficha de ${codigo}`}
        className="m-auto w-full max-w-md rounded-lg border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40"
      >
        {/* Solo abierto: dos diálogos con nota en una página no repiten el id del campo. */}
        {abierto ? (
          <form action={enviar} className="flex flex-col gap-4 p-5">
            <input type="hidden" name="id" value={versionId} />
            <p aria-hidden="true" className="font-semibold">{`Devolver la ficha de ${codigo}`}</p>
            <p className="text-sm text-muted-foreground">La ficha vuelve a borrador para que quien la elaboró la corrija. No pide clave.</p>
            <Campo etiqueta="Nota" nombre="nota" ayuda="Entre 5 y 1000 caracteres. La verá quien la elaboró.">
              <textarea
                required
                minLength={5}
                maxLength={1000}
                rows={4}
                defaultValue={typeof nota === "string" ? nota : ""}
                className={`${claseControl} w-full`}
              />
            </Campo>
            <ErrorAccion estado={estado} />
            <div className="flex flex-wrap justify-end gap-2">
              <Boton variante="secundario" onClick={() => setAbierto(false)}>
                Volver
              </Boton>
              <Boton type="submit" pendiente={pendiente}>
                {pendiente ? "Devolviendo…" : "Devolver la ficha"}
              </Boton>
            </div>
          </form>
        ) : null}
      </Dialogo>
    </>
  );
}

/** Lo que se firma al aprobar: cuántas fichas y cuáles. */
function Resumen({ fichas }: { fichas: FilaPorAprobar[] }) {
  return (
    <>
      <p className="text-sm text-muted-foreground">
        {fichas.length === 1
          ? "Queda la firma «Aprobó» sobre la huella de la ficha."
          : `Queda la firma «Aprobó» sobre la huella de cada una. Es todo o nada: si alguna ya no está por aprobar, no se aprueba ninguna.`}
      </p>
      <ul className="max-h-40 list-none overflow-y-auto rounded-md border border-border p-2 text-sm">
        {fichas.map((f) => (
          <li key={f.versionId} className="break-words">{`${f.codigo} · ${f.nombre} (versión ${f.numero})`}</li>
        ))}
      </ul>
    </>
  );
}

/** «Aprobar» una sola ficha desde su página, con clave; vuelve a `volver`. */
export function AprobarFicha({ ficha, volver, pideCodigo }: { ficha: FilaPorAprobar; volver: string; pideCodigo: boolean }) {
  return (
    <DialogoFirma
      titulo={`Aprobar ${ficha.codigo}, versión ${ficha.numero}`}
      etiquetaBoton="Aprobar"
      accion={aprobarFichasAccion}
      ocultos={{ versionIds: JSON.stringify([ficha.versionId]), volver }}
      pideCodigo={pideCodigo}
    >
      <Resumen fichas={[ficha]} />
    </DialogoFirma>
  );
}

/**
 * «Por aprobar» (spec §12.6): las fichas que la persona puede aprobar, con qué cambió en cada una (o «Nueva»),
 * casillas de selección, «Aprobar las seleccionadas» con una sola clave y «Devolver» por ficha.
 */
export function ListaPorAprobar({ fichas, pideCodigo }: { fichas: FilaPorAprobar[]; pideCodigo: boolean }) {
  const [elegidas, setElegidas] = useState<number[]>([]);
  const seleccion = fichas.filter((f) => elegidas.includes(f.versionId));
  const todas = seleccion.length === fichas.length && fichas.length > 0;
  const alternar = (id: number) => setElegidas((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="por-aprobar-todas"
            checked={todas}
            onChange={() => setElegidas(todas ? [] : fichas.map((f) => f.versionId))}
          />
          <label htmlFor="por-aprobar-todas" className="text-sm">
            Elegir todas
          </label>
          <span aria-live="polite" className="text-sm text-muted-foreground">
            {seleccion.length === 0 ? "Ninguna elegida" : seleccion.length === 1 ? "1 elegida" : `${seleccion.length} elegidas`}
          </span>
        </div>
        {seleccion.length > 0 ? (
          <DialogoFirma
            titulo={seleccion.length === 1 ? "Aprobar la ficha elegida" : `Aprobar ${seleccion.length} fichas`}
            etiquetaBoton="Aprobar las seleccionadas"
            accion={aprobarFichasAccion}
            ocultos={{ versionIds: JSON.stringify(seleccion.map((f) => f.versionId)) }}
            pideCodigo={pideCodigo}
          >
            <Resumen fichas={seleccion} />
          </DialogoFirma>
        ) : (
          <Boton disabled aria-describedby="por-aprobar-ayuda">
            Aprobar las seleccionadas
          </Boton>
        )}
      </div>
      {seleccion.length === 0 ? (
        <p id="por-aprobar-ayuda" className="text-xs text-muted-foreground">
          Elija una o varias fichas para aprobarlas con una sola clave.
        </p>
      ) : null}
      <TablaDatos titulo="Fichas por aprobar" columnas={COLUMNAS} filas={fichas.length} vacio="No tiene fichas por aprobar.">
        {fichas.map((f) => (
          <tr key={f.versionId}>
            <td className={`${celda} w-10`}>
              <input
                type="checkbox"
                checked={elegidas.includes(f.versionId)}
                onChange={() => alternar(f.versionId)}
                aria-label={`Elegir ${f.codigo}`}
              />
            </td>
            <td className={celda}>
              <span className="block font-mono text-xs text-muted-foreground">{f.codigo}</span>
              <Link href={f.enlace} className={`rounded-sm text-marca underline-offset-2 hover:underline ${FOCO}`}>
                {f.nombre || f.codigo}
              </Link>
              <span className="block text-xs text-muted-foreground">{`${f.proceso} · versión ${f.numero}`}</span>
            </td>
            <td className={celda}>
              {f.tipoCambio === "inicial" ? (
                <Insignia variante="neutra">Nueva</Insignia>
              ) : (
                <>
                  <span className="flex flex-wrap gap-1">
                    <Insignia variante="atencion">Cambio mayor</Insignia>
                  </span>
                  <span className="mt-1 block">{f.cambios.join(", ")}</span>
                  {f.motivo ? <span className="block text-muted-foreground">{`Motivo: ${f.motivo}`}</span> : null}
                </>
              )}
            </td>
            <td className={celda}>
              <span className="block">{f.elaboro}</span>
              <span className="block text-xs text-muted-foreground">{f.enviada}</span>
            </td>
            <td className={`${celda} text-right`}>
              <DevolverFicha versionId={f.versionId} codigo={f.codigo} tamano="sm" />
            </td>
          </tr>
        ))}
      </TablaDatos>
    </div>
  );
}
