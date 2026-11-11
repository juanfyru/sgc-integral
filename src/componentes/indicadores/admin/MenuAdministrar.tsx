"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { borrarIndicadorAccion, duplicarAccion } from "@/app/acciones-indicadores";
import { ErrorAccion } from "@/componentes/tramites/AccionesSolicitud";
import { Boton, claseBoton } from "@/componentes/ui/Boton";
import { claseControl } from "@/componentes/ui/Campo";
import { Dialogo } from "@/componentes/ui/Dialogo";
import { useTituloAlDesaparecer } from "@/componentes/ui/foco";
import type { PanelDeAdministracion } from "@/db/consultas/indicadores/operacion";
import { DialogoDesignar } from "./DialogoDesignar";
import { DialogoOperacion } from "./DialogoOperacion";
import { CLASE_DIALOGO, DialogoRetirar } from "./DialogoRetirar";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";
const ITEM = `block w-full rounded-sm px-3 py-2 text-left text-sm hover:bg-muted ${FOCO}`;

type Dialogos = "designar" | "operacion" | "duplicar" | "retirar" | "descartar" | "borrar";

/** «Crear a partir de este» (spec §7.7): pide el proceso, muestra el código que se propone y lleva al borrador nuevo. */
function DialogoDuplicar({
  abierto,
  alCerrar,
  panel,
}: {
  abierto: boolean;
  alCerrar: () => void;
  panel: PanelDeAdministracion;
}) {
  const [estado, enviar, pendiente] = useActionState(duplicarAccion, null);
  const [procesoId, setProcesoId] = useState(panel.procesoId);
  const idProceso = useId();
  const propuesto = panel.procesos.find((p) => p.id === procesoId)?.codigoPropuesto ?? "";
  return (
    <Dialogo abierto={abierto} alCerrar={alCerrar} titulo={`Crear a partir de ${panel.codigo}`} className={CLASE_DIALOGO}>
      {abierto ? (
        <form action={enviar} className="flex flex-col gap-4 p-5">
          <input type="hidden" name="id" value={panel.indicadorId} />
          <p aria-hidden="true" className="font-semibold">{`Crear a partir de ${panel.codigo}`}</p>
          <p className="text-sm text-muted-foreground">
            Abre un indicador nuevo en borrador, versión 1, con el contenido de la ficha, los datos de operación y las personas designadas de
            este. No copia mediciones ni metas programadas. Si cambia de proceso, el subproceso y el procedimiento se quitan.
          </p>
          <div className="flex flex-col gap-1">
            <label htmlFor={idProceso} className="text-sm font-medium">
              Proceso del indicador nuevo
            </label>
            <select id={idProceso} name="procesoId" value={procesoId} onChange={(e) => setProcesoId(Number(e.target.value))} className={`${claseControl} w-full`}>
              {panel.procesos.map((p) => (
                <option key={p.id} value={p.id}>
                  {`${p.sigla} · ${p.nombre}`}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">{`Código que se le propone: ${propuesto}`}</p>
          </div>
          <ErrorAccion estado={estado} />
          <div className="flex flex-wrap justify-end gap-2">
            <Boton variante="secundario" onClick={alCerrar}>
              Volver
            </Boton>
            <Boton type="submit" pendiente={pendiente}>
              {pendiente ? "Creando…" : "Crear el borrador"}
            </Boton>
          </div>
        </form>
      ) : null}
    </Dialogo>
  );
}

/** «Borrar» un indicador que nunca se envió a aprobación: no deja rastro de la ficha, solo la bitácora. */
function DialogoBorrar({ abierto, alCerrar, panel }: { abierto: boolean; alCerrar: () => void; panel: PanelDeAdministracion }) {
  const [estado, enviar, pendiente] = useActionState(borrarIndicadorAccion, null);
  return (
    <Dialogo abierto={abierto} alCerrar={alCerrar} titulo={`Borrar ${panel.codigo}`} className={CLASE_DIALOGO}>
      {abierto ? (
        <form action={enviar} className="flex flex-col gap-4 p-5">
          <input type="hidden" name="id" value={panel.indicadorId} />
          <p aria-hidden="true" className="font-semibold">{`Borrar ${panel.codigo}`}</p>
          <p className="text-sm text-muted-foreground">
            El indicador nunca se envió a aprobación: se borra con su ficha y sus personas designadas, y su código queda libre. Queda en la bitácora. No se
            puede deshacer.
          </p>
          <ErrorAccion estado={estado} />
          <div className="flex flex-wrap justify-end gap-2">
            <Boton variante="secundario" onClick={alCerrar}>
              Volver
            </Boton>
            <Boton type="submit" variante="peligro" pendiente={pendiente}>
              {pendiente ? "Borrando…" : "Borrar el indicador"}
            </Boton>
          </div>
        </form>
      ) : null}
    </Dialogo>
  );
}

/**
 * «Administrar» (spec §12.3): lo que quien administra puede hacer con el indicador, según su estado. Cada opción abre su
 * diálogo; «Editar ficha» lleva a la edición. Solo se pinta para quien tiene `indicadores.administrar`: el servidor le
 * entrega el panel y las acciones vuelven a comprobar el permiso.
 */
export function MenuAdministrar({ panel, hrefEditar }: { panel: PanelDeAdministracion; hrefEditar: string }) {
  const [menu, setMenu] = useState(false);
  const [dialogo, setDialogo] = useState<Dialogos | null>(null);
  const [reinicio, setReinicio] = useState(0);
  const raiz = useRef<HTMLDivElement>(null);
  const disparador = useRef<HTMLButtonElement>(null);
  const idLista = useId();
  useTituloAlDesaparecer(dialogo !== null);

  useEffect(() => {
    if (!menu) return;
    const fuera = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [menu]);

  const { estado } = panel;
  const abre = (d: Dialogos) => () => {
    setMenu(false);
    setReinicio((n) => n + 1); // cada apertura monta el diálogo de nuevo: sin errores ni valores de la anterior
    setDialogo(d);
  };
  const cierra = () => {
    setDialogo(null);
    setTimeout(() => disparador.current?.focus(), 0);
  };

  const opciones: { dialogo: Dialogos; etiqueta: string }[] = [];
  if (estado === "borrador" || estado === "activo") {
    opciones.push({ dialogo: "designar", etiqueta: "Designar personas" }, { dialogo: "operacion", etiqueta: "Datos de operación" });
  }
  opciones.push({ dialogo: "duplicar", etiqueta: "Crear a partir de este" });
  if (estado === "activo") opciones.push({ dialogo: "retirar", etiqueta: "Retirar" });
  if (estado === "borrador") opciones.push(panel.enviado ? { dialogo: "descartar", etiqueta: "Descartar" } : { dialogo: "borrar", etiqueta: "Borrar" });

  return (
    <div
      ref={raiz}
      className="relative"
      onKeyDown={(e) => {
        if (e.key === "Escape" && menu) {
          setMenu(false);
          disparador.current?.focus();
        }
      }}
    >
      <button
        ref={disparador}
        type="button"
        aria-expanded={menu}
        aria-controls={idLista}
        onClick={() => setMenu((m) => !m)}
        className={`${claseBoton("secundario")} ${FOCO}`}
      >
        Administrar
        <ChevronDown aria-hidden="true" className="size-4" />
      </button>
      {menu ? (
        <ul id={idLista} className="absolute right-0 z-20 mt-1 w-60 list-none rounded-md border border-border bg-card p-1 shadow-lg">
          {estado === "borrador" || estado === "activo" ? (
            <li>
              <Link href={hrefEditar} className={ITEM}>
                Editar ficha
              </Link>
            </li>
          ) : null}
          {opciones.map((o) => (
            <li key={o.dialogo}>
              <button type="button" aria-haspopup="dialog" onClick={abre(o.dialogo)} className={ITEM}>
                {o.etiqueta}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <DialogoDesignar
        key={reinicio}
        abierto={dialogo === "designar"}
        alCerrar={cierra}
        indicadorId={panel.indicadorId}
        codigo={panel.codigo}
        usuarios={panel.usuarios}
        designados={panel.designados}
      />
      <DialogoOperacion
        key={`op${reinicio}`}
        abierto={dialogo === "operacion"}
        alCerrar={cierra}
        indicadorId={panel.indicadorId}
        codigo={panel.codigo}
        operacion={panel.operacion}
        periodos={panel.periodos}
      />
      <DialogoDuplicar key={`du${reinicio}`} abierto={dialogo === "duplicar"} alCerrar={cierra} panel={panel} />
      {estado === "activo" ? (
        <DialogoRetirar key={`re${reinicio}`} modo="retirar" abierto={dialogo === "retirar"} alCerrar={cierra} indicadorId={panel.indicadorId} codigo={panel.codigo} />
      ) : null}
      {estado === "borrador" && panel.enviado ? (
        <DialogoRetirar key={`de${reinicio}`} modo="descartar" abierto={dialogo === "descartar"} alCerrar={cierra} indicadorId={panel.indicadorId} codigo={panel.codigo} />
      ) : null}
      {estado === "borrador" && !panel.enviado ? <DialogoBorrar key={`bo${reinicio}`} abierto={dialogo === "borrar"} alCerrar={cierra} panel={panel} /> : null}
    </div>
  );
}
