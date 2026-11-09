"use client";

import { useActionState, useState } from "react";
import { prorrogarRevisionAccion } from "@/app/acciones-vigencia";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { ErrorAccion } from "@/componentes/tramites/AccionesSolicitud";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { Dialogo } from "@/componentes/ui/Dialogo";

type Props = {
  revisionId: number;
  anio: number;
  /** «31 dic 2026»: cuándo vence hoy. */
  venceTexto: string;
};

/** Vive solo mientras el diálogo está abierto: al cerrarlo no queda lo escrito ni el error. */
export function FormularioProrrogar({ revisionId, anio, venceTexto, alCerrar }: Props & { alCerrar: () => void }) {
  const [estado, enviar, pendiente] = useActionState(prorrogarRevisionAccion, null);
  return (
    <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex flex-col gap-4 p-5">
      <input type="hidden" name="revisionId" value={revisionId} />
      {/* El título para lectores de pantalla ya lo pone Dialogo. */}
      <p aria-hidden="true" className="font-semibold">
        {`Prorrogar la revisión anual ${anio}`}
      </p>
      <p className="text-sm text-muted-foreground">
        {`Hoy vence el ${venceTexto}. La prórroga cuenta desde ese día (o desde hoy, si ya pasó), queda en la bitácora con su motivo y se avisa a quienes tienen pendientes.`}
      </p>
      <Campo etiqueta="Días" nombre="dias" ayuda="De 1 a 365 días.">
        <input type="number" inputMode="numeric" required min={1} max={365} className={claseControl} />
      </Campo>
      <Campo etiqueta="Motivo" nombre="motivo" ayuda="Entre 5 y 500 caracteres.">
        <textarea required minLength={5} maxLength={500} rows={3} className={`${claseControl} w-full`} />
      </Campo>
      <ErrorAccion estado={estado} />
      <div className="flex flex-wrap justify-end gap-2">
        <Boton variante="secundario" onClick={alCerrar}>
          Cancelar
        </Boton>
        <Boton type="submit" pendiente={pendiente}>
          {pendiente ? "Prorrogando…" : "Prorrogar"}
        </Boton>
      </div>
    </form>
  );
}

/** «Prorrogar…» la revisión abierta (spec 13C §9.1): el motivo es obligatorio. */
export function DialogoProrrogar(props: Props) {
  const [abierto, setAbierto] = useState(false);
  const titulo = `Prorrogar la revisión anual ${props.anio}`;
  return (
    <>
      <Boton variante="secundario" onClick={() => setAbierto(true)} aria-haspopup="dialog">
        Prorrogar…
      </Boton>
      <Dialogo
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
        titulo={titulo}
        className="m-auto w-full max-w-md rounded-lg border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40"
      >
        {abierto ? <FormularioProrrogar {...props} alCerrar={() => setAbierto(false)} /> : null}
      </Dialogo>
    </>
  );
}
