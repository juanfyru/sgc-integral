"use client";

import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import type { EstadoAccion } from "@/app/admin/comun";
import { ErrorAccion } from "@/componentes/tramites/AccionesSolicitud";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { Dialogo } from "@/componentes/ui/Dialogo";
import { huellaAbreviada } from "@/lib/tramites/tipos";

type Props = {
  titulo: string;
  etiquetaBoton: string;
  resumen: { documento: string; version: number | null; huella: string | null };
  accion: (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;
  ocultos: Record<string, string>;
  pideCodigo: boolean;
  children?: React.ReactNode;
};

/** «Firmar y publicar»; con una etiqueta que ya lleva «y», «Firmar, aprobar y publicar». */
export function textoDeFirmar(etiqueta: string): string {
  const accion = `${etiqueta.charAt(0).toLowerCase()}${etiqueta.slice(1)}`;
  return accion.includes(" y ") ? `Firmar, ${accion}` : `Firmar y ${accion}`;
}

/** Vive solo mientras el diálogo está abierto: al cerrarlo no quedan ni la clave ni el error. */
export function FormularioFirma({
  titulo,
  etiquetaBoton,
  resumen,
  accion,
  ocultos,
  pideCodigo,
  alCancelar,
  children,
}: Props & { alCancelar: () => void }) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const clave = useRef<HTMLInputElement>(null);
  const codigo = useRef<HTMLInputElement>(null);

  // Enviar desde una transición conserva los campos de la acción tras un rechazo, como en
  // FormularioSolicitud. La clave y el código son lo único que no debe conservarse.
  const alEnviar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    startTransition(() => enviar(datos));
  };
  useEffect(() => {
    if (!estado) return;
    if (clave.current) clave.current.value = "";
    if (codigo.current) codigo.current.value = "";
    clave.current?.focus();
  }, [estado]);

  return (
    <form action={enviar} onSubmit={alEnviar} className="flex flex-col gap-4 p-5">
      {Object.entries(ocultos).map(([nombre, valor]) => (
        <input key={nombre} type="hidden" name={nombre} value={valor} />
      ))}
      {/* El título para lectores de pantalla ya lo pone Dialogo. */}
      <p aria-hidden="true" className="font-semibold">
        {titulo}
      </p>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Documento</dt>
        <dd className="break-words">{resumen.documento}</dd>
        <dt className="text-muted-foreground">Versión</dt>
        <dd>{resumen.version ?? "Sin versión"}</dd>
        <dt className="text-muted-foreground">Huella</dt>
        <dd className={resumen.huella ? "font-mono" : undefined}>
          {resumen.huella ? huellaAbreviada(resumen.huella) : "Sin archivo principal"}
        </dd>
      </dl>
      {children}
      <Campo etiqueta="Su clave" nombre="clave">
        <input
          ref={clave}
          type="password"
          required
          maxLength={128}
          autoComplete="current-password"
          className={claseControl}
        />
      </Campo>
      {pideCodigo ? (
        <Campo
          etiqueta="Código"
          nombre="codigo"
          ayuda="Código de su aplicación de autenticación o un código de recuperación"
        >
          <input
            ref={codigo}
            required
            minLength={6}
            maxLength={20}
            autoComplete="one-time-code"
            className={claseControl}
          />
        </Campo>
      ) : null}
      <ErrorAccion estado={estado} />
      <div className="flex flex-wrap justify-end gap-2">
        <Boton variante="secundario" onClick={alCancelar}>
          Cancelar
        </Boton>
        <Boton type="submit" pendiente={pendiente}>
          {pendiente ? "Firmando…" : textoDeFirmar(etiquetaBoton)}
        </Boton>
      </div>
    </form>
  );
}

/** La firma suele llevarse el botón que abrió el diálogo, y con él el foco: lo recibe el título de la página. */
function enfocarTitulo() {
  if (document.activeElement && document.activeElement !== document.body) return;
  document.querySelector<HTMLElement>('h1[tabindex="-1"]')?.focus();
}

/** Las acciones que firman: muestran qué se firma y piden la clave en el mismo envío (spec 13A §10.2). */
export function DialogoFirma(props: Props) {
  const [abierto, setAbierto] = useState(false);
  const abiertoAlDesmontar = useRef(false);
  useEffect(() => {
    abiertoAlDesmontar.current = abierto;
  }, [abierto]);
  useEffect(
    () => () => {
      if (abiertoAlDesmontar.current) enfocarTitulo();
    },
    [],
  );
  return (
    <>
      <Boton onClick={() => setAbierto(true)} aria-haspopup="dialog">
        {props.etiquetaBoton}
      </Boton>
      <Dialogo
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
        titulo={props.titulo}
        className="m-auto w-full max-w-md rounded-lg border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40"
      >
        {abierto ? <FormularioFirma {...props} alCancelar={() => setAbierto(false)} /> : null}
      </Dialogo>
    </>
  );
}
