"use client";

import { useState } from "react";
import { cerrarDeNuevoAccion, cerrarDeNuevoElDatoCompartido, reabrirDatoCompartido, reabrirMedicionAccion } from "@/app/acciones-indicadores";
import type { EstadoAccion } from "@/app/admin/comun";
import { CLASE_DIALOGO } from "@/componentes/indicadores/admin/DialogoRetirar";
import { useAccionDeDialogo } from "@/componentes/indicadores/admin/useAccionDeDialogo";
import { ErrorAccion } from "@/componentes/tramites/AccionesSolicitud";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { Dialogo } from "@/componentes/ui/Dialogo";
import { useTituloAlDesaparecer } from "@/componentes/ui/foco";
import type { ReaperturaEnTexto } from "@/db/consultas/indicadores/reapertura";
import { JUSTIFICACION_MAXIMA, JUSTIFICACION_MINIMA } from "@/lib/indicadores/cierre";
import { ListaDeReapertura, textoDelBoton } from "./ListaDeReapertura";

type Accion = (previo: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;

/**
 * El botón «Reabrir» y su diálogo: la justificación (no la clave) y, si la reapertura va en cascada (`reapertura`), la lista
 * de lo que se reabre antes de confirmar (maqueta 13). Tras reabrir, la fila cambia y este botón se va: el foco pasa al
 * título de la página.
 */
function Reabrir({
  accion,
  id,
  titulo,
  etiqueta,
  explicacion,
  ayuda,
  boton,
  reapertura,
}: {
  accion: Accion;
  id: number;
  titulo: string;
  etiqueta: string;
  explicacion: string;
  ayuda: string;
  boton: string;
  reapertura: ReaperturaEnTexto | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const [hecho, setHecho] = useState(false);
  const cerrar = () => setAbierto(false);
  const [estado, enviar, pendiente] = useAccionDeDialogo(accion, () => {
    setHecho(true);
    cerrar();
  });
  useTituloAlDesaparecer(abierto || hecho);
  const previa = estado?.valores?.justificacion;
  return (
    <>
      <Boton variante="secundario" tamano="sm" onClick={() => setAbierto(true)} aria-haspopup="dialog" className="whitespace-nowrap">
        Reabrir<span className="sr-only">{` ${etiqueta}`}</span>
      </Boton>
      <Dialogo abierto={abierto} alCerrar={cerrar} titulo={titulo} className={CLASE_DIALOGO}>
        {/* Solo abierto: varios diálogos en la tabla no repiten el id del campo. */}
        {abierto ? (
          <form action={enviar} className="flex flex-col gap-4 p-5">
            <input type="hidden" name="id" value={id} />
            {/* Lo que se listó: el servidor reabre solo si, con todo bloqueado, es lo mismo (se confirma lo que se vio). */}
            {reapertura ? <input type="hidden" name="vistas" value={JSON.stringify(reapertura.seReabren.map((x) => x.id).sort((a, b) => a - b))} /> : null}
            <p aria-hidden="true" className="font-semibold">
              {titulo}
            </p>
            <p className="text-sm text-muted-foreground">{explicacion}</p>
            <Campo etiqueta="Justificación" nombre="justificacion" id={`reabrir-${id}`} ayuda={ayuda}>
              <textarea
                required
                minLength={JUSTIFICACION_MINIMA}
                maxLength={JUSTIFICACION_MAXIMA}
                rows={4}
                defaultValue={typeof previa === "string" ? previa : ""}
                className={`${claseControl} w-full`}
              />
            </Campo>
            {reapertura ? <ListaDeReapertura reapertura={reapertura} /> : null}
            <ErrorAccion estado={estado} />
            <div className="flex flex-wrap justify-end gap-2">
              <Boton variante="secundario" onClick={cerrar}>
                Volver
              </Boton>
              <Boton type="submit" pendiente={pendiente}>
                {pendiente ? "Reabriendo…" : boton}
              </Boton>
            </div>
          </form>
        ) : null}
      </Dialogo>
    </>
  );
}

const ENTRE = `Entre ${JUSTIFICACION_MINIMA} y ${JUSTIFICACION_MAXIMA} caracteres.`;

/**
 * «Reabrir» una medición cerrada (spec §8.7): pide la justificación y no la clave. Si otras mediciones cerradas la usaron
 * (la de un componente; `reapertura`, anexo 14C §3.5), se reabren con ella, y el diálogo las lista antes de confirmar.
 */
export function DialogoReabrir({
  medicionId,
  codigo,
  etiqueta,
  reapertura = null,
}: {
  medicionId: number;
  codigo: string;
  etiqueta: string;
  reapertura?: ReaperturaEnTexto | null;
}) {
  return (
    <Reabrir
      accion={reabrirMedicionAccion}
      id={medicionId}
      titulo={reapertura?.titulo ?? `Reabrir ${codigo}, ${etiqueta.toLowerCase()}`}
      etiqueta={etiqueta}
      explicacion={
        reapertura
          ? "La medición se abre para que quien mide la corrija o la reporte tarde, y con ella las mediciones cerradas que la usaron. Cada una queda marcada «Corregida», con esta justificación en su historial, y se avisa a quien la mide; se cierran otra vez con el siguiente cierre del mes o con «Cerrar de nuevo». No pide clave."
          : "La medición se abre para que quien mide la corrija o la reporte tarde, y se le avisa. Queda marcada «Corregida», con esta justificación en su historial, y se cierra otra vez con el siguiente cierre del mes o con «Cerrar de nuevo». No pide clave."
      }
      ayuda={reapertura ? `${ENTRE} La ve quien ve cualquiera de las mediciones que se reabren.` : `${ENTRE} La ve quien ve el indicador.`}
      boton={reapertura ? textoDelBoton(reapertura) : "Reabrir la medición"}
      reapertura={reapertura}
    />
  );
}

/**
 * «Reabrir» un periodo cerrado de un dato compartido (anexo 14C, §3.5), también para reportarlo tarde. Va siempre en cascada:
 * el diálogo lista antes de confirmar las mediciones cerradas que lo usaron (`reapertura`).
 */
export function DialogoReabrirDato({ periodoId, etiqueta, reapertura }: { periodoId: number; etiqueta: string; reapertura: ReaperturaEnTexto }) {
  return (
    <Reabrir
      accion={reabrirDatoCompartido}
      id={periodoId}
      titulo={reapertura.titulo}
      etiqueta={etiqueta}
      explicacion="El periodo se abre para que sus responsables lo corrijan o lo reporten tarde, y con él las mediciones cerradas que lo usaron. Cada una queda marcada «Corregida», con esta justificación en su historial, y se avisa a quien la mide; se cierran otra vez con el siguiente cierre del mes o con «Cerrar de nuevo». No pide clave."
      ayuda={`${ENTRE} Queda en el historial del dato y en el de cada medición que se reabre, y la ve quien ve cualquiera de ellas.`}
      boton={textoDelBoton(reapertura)}
      reapertura={reapertura}
    />
  );
}

/**
 * «Cerrar de nuevo» lo reabierto (F14-DC31; anexo 14C, §3.5), con el último cierre y como esté, sin confirmación. Tras
 * cerrarlo, la fila cambia y este botón se va: el foco pasa al título de la página.
 */
function CerrarOtraVez({ accion, id, etiqueta }: { accion: Accion; id: number; etiqueta: string }) {
  const [hecho, setHecho] = useState(false);
  const [estado, enviar, pendiente] = useAccionDeDialogo(accion, () => setHecho(true));
  useTituloAlDesaparecer(hecho);
  return (
    <form action={enviar} className="flex flex-col items-start gap-1">
      <input type="hidden" name="id" value={id} />
      <Boton type="submit" variante="secundario" tamano="sm" pendiente={pendiente} className="whitespace-nowrap">
        {pendiente ? "Cerrando…" : "Cerrar de nuevo"}
        <span className="sr-only">{` ${etiqueta}`}</span>
      </Boton>
      {estado && !estado.ok ? (
        <p role="alert" className="text-xs text-estado-critico-texto">
          {estado.error}
        </p>
      ) : null}
    </form>
  );
}

/** «Cerrar de nuevo» una medición reabierta; no si su fuente sigue abierta (anexo 14C, §3.5). */
export function CerrarDeNuevo({ medicionId, etiqueta }: { medicionId: number; etiqueta: string }) {
  return <CerrarOtraVez accion={cerrarDeNuevoAccion} id={medicionId} etiqueta={etiqueta} />;
}

/** «Cerrar de nuevo» un periodo reabierto de un dato compartido. */
export function CerrarDeNuevoDato({ periodoId, etiqueta }: { periodoId: number; etiqueta: string }) {
  return <CerrarOtraVez accion={cerrarDeNuevoElDatoCompartido} id={periodoId} etiqueta={etiqueta} />;
}
