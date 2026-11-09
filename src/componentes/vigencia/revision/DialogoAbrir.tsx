"use client";

import { useActionState, useState } from "react";
import { abrirRevisionAccion } from "@/app/acciones-vigencia";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { ErrorAccion } from "@/componentes/tramites/AccionesSolicitud";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { Dialogo } from "@/componentes/ui/Dialogo";

type Props = {
  /** El año propuesto: el actual o, si ya tuvo su revisión, el siguiente libre. */
  anio: number;
  anioMinimo: number;
  anioMaximo: number;
  /** El plazo y la ventana de Configuración documental. */
  plazoDias: number;
  ventanaMeses: number;
};

/** Vive solo mientras el diálogo está abierto: al cerrarlo no queda lo escrito ni el error. */
export function FormularioAbrir({ anio, anioMinimo, anioMaximo, plazoDias, ventanaMeses, alCerrar }: Props & { alCerrar: () => void }) {
  const [estado, enviar, pendiente] = useActionState(abrirRevisionAccion, null);
  return (
    <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex flex-col gap-4 p-5">
      {/* El título para lectores de pantalla ya lo pone Dialogo. */}
      <p aria-hidden="true" className="font-semibold">
        Abrir la revisión anual
      </p>
      <p className="text-sm text-muted-foreground">
        Al abrirla se toma la foto de todos los documentos vigentes: los revisados dentro de la ventana y los que están en
        trámite quedan decididos solos, y cada líder recibe la tarea de decidir sobre los demás de sus procesos.
      </p>
      <Campo etiqueta="Año" nombre="anio" ayuda={`Una revisión por año, de ${anioMinimo} a ${anioMaximo}.`}>
        <input type="number" inputMode="numeric" required min={anioMinimo} max={anioMaximo} defaultValue={anio} className={claseControl} />
      </Campo>
      <Campo etiqueta="Plazo (días)" nombre="plazoDias" ayuda="De 7 a 365 días; la tarea de cada líder vence con él.">
        <input type="number" inputMode="numeric" required min={7} max={365} defaultValue={plazoDias} className={claseControl} />
      </Campo>
      <Campo
        etiqueta="Revisado recientemente (meses)"
        nombre="ventanaMeses"
        ayuda="De 0 a 24: los documentos revisados dentro de esta ventana quedan como «revisado recientemente»."
      >
        <input type="number" inputMode="numeric" required min={0} max={24} defaultValue={ventanaMeses} className={claseControl} />
      </Campo>
      <ErrorAccion estado={estado} />
      <div className="flex flex-wrap justify-end gap-2">
        <Boton variante="secundario" onClick={alCerrar}>
          Cancelar
        </Boton>
        <Boton type="submit" pendiente={pendiente}>
          {pendiente ? "Abriendo…" : "Abrir la revisión"}
        </Boton>
      </div>
    </form>
  );
}

/** «Abrir la revisión anual <año>» (spec 13C §9.1), para quien gestiona la revisión. */
export function DialogoAbrir(props: Props) {
  const [abierto, setAbierto] = useState(false);
  const etiqueta = `Abrir la revisión anual ${props.anio}`;
  return (
    <>
      <Boton onClick={() => setAbierto(true)} aria-haspopup="dialog">
        {etiqueta}
      </Boton>
      <Dialogo
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
        titulo={etiqueta}
        className="m-auto w-full max-w-md rounded-lg border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40"
      >
        {abierto ? <FormularioAbrir {...props} alCerrar={() => setAbierto(false)} /> : null}
      </Dialogo>
    </>
  );
}
