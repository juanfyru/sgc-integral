"use client";

import { useEffect, useState } from "react";
import { Boton } from "@/componentes/ui/Boton";
import type { TipoAccion } from "@/lib/mejoramiento/tipos";
import type { AccionDeAnalisis } from "../analisis/Partes";
import { TarjetaDeAccion, type AccionDelFormulario, type UsuarioAsignable } from "./TarjetaDeAccion";

/** El botón «Añadir otra acción»: recibe el foco cuando la tarjeta que lo tenía desaparece. */
const ANADIR = "plan-anadir-accion";

/** Qué identifica a una acción guardada y a sus actividades: si cambia, la tarjeta se vuelve a montar con los ids nuevos. */
const firmaDe = (a: AccionDelFormulario) => `${a.id}:${a.actividades.map((x) => x.id).join(".")}`;

/**
 * Las acciones del plan en borrador (spec 15 §10, maqueta 5): una tarjeta por acción guardada y las nuevas que se añaden con
 * «Añadir otra acción». El caso simple es una acción con una actividad: sin acciones, el formulario abre una vacía. Una
 * acción nueva, al guardarse, deja su lugar a la que llega de la página (con su id: un segundo «Guardar» no la duplica).
 */
export function FormularioPlan({
  hallazgoId,
  tipoPropuesto,
  acciones,
  causas,
  usuarios,
  inactivos,
  guardar,
  quitar,
}: {
  hallazgoId: number;
  tipoPropuesto: TipoAccion;
  acciones: readonly AccionDelFormulario[];
  causas: ReadonlyArray<{ id: number; orden: number; texto: string }>;
  usuarios: readonly UsuarioAsignable[];
  inactivos?: ReadonlyArray<{ id: number; nombre: string }>;
  guardar: AccionDeAnalisis;
  quitar: AccionDeAnalisis;
}) {
  const [nuevas, setNuevas] = useState<number[]>(() => (acciones.length === 0 ? [1] : []));
  const [siguiente, setSiguiente] = useState(2);
  // Lo guardado llega con la página: la tarjeta que se vuelve a montar con sus ids nuevos no conserva su «Guardado.», así
  // que este aviso dice qué cambió.
  const firmas = acciones.map(firmaDe).join("|");
  const [vistas, setVistas] = useState(firmas);
  const [aviso, setAviso] = useState("");
  // La tarjeta que tenía el foco se vuelve a montar (guardada) o desaparece (quitada): el foco va a su «Guardar» o a «Añadir».
  const [foco, setFoco] = useState<{ id: string; vez: number } | null>(null);
  if (vistas !== firmas) {
    const antes = new Set(vistas.split("|"));
    const cambiada = acciones.find((a) => !antes.has(firmaDe(a)));
    setVistas(firmas);
    setAviso(cambiada ? `Se guardó la acción A${cambiada.orden}.` : "Se quitó la acción.");
    setFoco((f) => ({ id: cambiada ? `accion-${cambiada.id}-guardar` : ANADIR, vez: (f?.vez ?? 0) + 1 }));
  }
  useEffect(() => {
    if (foco) document.getElementById(foco.id)?.focus();
  }, [foco]);
  const anadir = () => {
    setNuevas((l) => [...l, siguiente]);
    setSiguiente((n) => n + 1);
  };
  const retirar = (clave: number) => setNuevas((l) => l.filter((x) => x !== clave));

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {acciones.map((a) => (
        <TarjetaDeAccion
          key={firmaDe(a)}
          hallazgoId={hallazgoId}
          accion={a}
          causas={causas}
          usuarios={usuarios}
          inactivos={inactivos}
          guardar={guardar}
          quitar={quitar}
        />
      ))}
      {nuevas.map((clave, i) => (
        <TarjetaDeAccion
          key={`nueva-${clave}`}
          hallazgoId={hallazgoId}
          accion={{
            id: null,
            orden: acciones.length + i + 1,
            tipo: tipoPropuesto,
            descripcion: "",
            causaIds: [],
            recursos: "",
            indicadorCumplimiento: "",
            meta: "",
            actividades: [],
          }}
          causas={causas}
          usuarios={usuarios}
          guardar={guardar}
          quitar={quitar}
          alGuardar={() => retirar(clave)}
          alDescartar={() => {
            retirar(clave);
            document.getElementById(ANADIR)?.focus();
          }}
        />
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <Boton id={ANADIR} variante="secundario" onClick={anadir}>
          {acciones.length + nuevas.length === 0 ? "Añadir una acción" : "Añadir otra acción"}
        </Boton>
        <span role="status" className="text-sm text-muted-foreground">
          {aviso}
        </span>
      </div>
    </div>
  );
}
