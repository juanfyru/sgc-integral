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

const ENTRE = `Entre ${JUSTIFICACION_MINIMA} y ${JUSTIFICACION_MAXIMA} caracteres.`;

/** Lo que pinta y manda el formulario de una reapertura: el id de la fuente, lo que listó (`vistas`) y sus textos. */
export type FormularioReabrir = {
  id: number;
  /** Las mediciones que el diálogo dice que se reabren, en orden: el servidor reabre solo si son esas (anexo 14C, §3.5). */
  vistas: number[];
  titulo: string;
  explicacion: string;
  ayuda: string;
  boton: string;
  reapertura: ReaperturaEnTexto | null;
};

const idsDe = (r: ReaperturaEnTexto) => r.seReabren.map((x) => x.id).sort((a, b) => a - b);

/**
 * El formulario de reabrir una medición: sin dependientes cerradas (`reapertura` nula), el diálogo de siempre y `vistas` con la
 * medición sola, así un dependiente que se cierre entre pintar y confirmar hace que no se reabra nada; con ellas, la lista
 * (que empieza por la medición) y sus ids.
 */
export function reaperturaDeMedicion(d: { medicionId: number; codigo: string; etiqueta: string; reapertura: ReaperturaEnTexto | null }): FormularioReabrir {
  const r = d.reapertura;
  return {
    id: d.medicionId,
    vistas: r ? idsDe(r) : [d.medicionId],
    titulo: r?.titulo ?? `Reabrir ${d.codigo}, ${d.etiqueta.toLowerCase()}`,
    explicacion: r
      ? "La medición se abre para que quien mide la corrija o la reporte tarde, y con ella las mediciones cerradas que la usaron. Cada una queda marcada «Corregida», con esta justificación en su historial, y se avisa a quien la mide; se cierran otra vez con el siguiente cierre del mes o con «Cerrar de nuevo». No pide clave."
      : "La medición se abre para que quien mide la corrija o la reporte tarde, y se le avisa. Queda marcada «Corregida», con esta justificación en su historial, y se cierra otra vez con el siguiente cierre del mes o con «Cerrar de nuevo». No pide clave.",
    ayuda: r ? `${ENTRE} La ve quien ve cualquiera de las mediciones que se reabren.` : `${ENTRE} La ve quien ve el indicador.`,
    boton: r ? textoDelBoton(r) : "Reabrir la medición",
    reapertura: r,
  };
}

/** El formulario de reabrir un periodo de un dato: siempre en cascada, con la lista y sus ids (vacía: solo el dato). */
export function reaperturaDeDato(d: { periodoId: number; reapertura: ReaperturaEnTexto }): FormularioReabrir {
  return {
    id: d.periodoId,
    vistas: idsDe(d.reapertura),
    titulo: d.reapertura.titulo,
    explicacion:
      "El periodo se abre para que sus responsables lo corrijan o lo reporten tarde, y con él las mediciones cerradas que lo usaron. Cada una queda marcada «Corregida», con esta justificación en su historial, y se avisa a quien la mide; se cierran otra vez con el siguiente cierre del mes o con «Cerrar de nuevo». No pide clave.",
    ayuda: `${ENTRE} Queda en el historial del dato y en el de cada medición que se reabre, y la ve quien ve cualquiera de ellas.`,
    boton: textoDelBoton(d.reapertura),
    reapertura: d.reapertura,
  };
}

/**
 * El formulario del diálogo «Reabrir», sin estado propio (lo lleva `Reabrir`): la fuente y lo que se listó en campos ocultos,
 * la justificación (no la clave) y, si va en cascada, la lista de lo que se reabre antes de confirmar (maqueta 13).
 */
export function FormularioDeReapertura({
  r,
  enviar,
  estado,
  pendiente,
  alCerrar,
}: {
  r: FormularioReabrir;
  enviar: (formData: FormData) => void;
  estado: EstadoAccion;
  pendiente: boolean;
  alCerrar: () => void;
}) {
  const previa = estado?.valores?.justificacion;
  return (
    <form action={enviar} className="flex flex-col gap-4 p-5">
      <input type="hidden" name="id" value={r.id} />
      {/* Lo que se listó: el servidor reabre solo si, con todo bloqueado, es lo mismo (se confirma lo que se vio). */}
      <input type="hidden" name="vistas" value={JSON.stringify(r.vistas)} />
      <p aria-hidden="true" className="font-semibold">
        {r.titulo}
      </p>
      <p className="text-sm text-muted-foreground">{r.explicacion}</p>
      <Campo etiqueta="Justificación" nombre="justificacion" id={`reabrir-${r.id}`} ayuda={r.ayuda}>
        <textarea
          required
          minLength={JUSTIFICACION_MINIMA}
          maxLength={JUSTIFICACION_MAXIMA}
          rows={4}
          defaultValue={typeof previa === "string" ? previa : ""}
          className={`${claseControl} w-full`}
        />
      </Campo>
      {r.reapertura ? <ListaDeReapertura reapertura={r.reapertura} /> : null}
      <ErrorAccion estado={estado} />
      <div className="flex flex-wrap justify-end gap-2">
        <Boton variante="secundario" onClick={alCerrar}>
          Volver
        </Boton>
        <Boton type="submit" pendiente={pendiente}>
          {pendiente ? "Reabriendo…" : r.boton}
        </Boton>
      </div>
    </form>
  );
}

/**
 * El botón «Reabrir» y su diálogo (`FormularioDeReapertura`). Tras reabrir, la fila cambia y este botón se va: el foco pasa
 * al título de la página.
 */
function Reabrir({ accion, etiqueta, r }: { accion: Accion; etiqueta: string; r: FormularioReabrir }) {
  const [abierto, setAbierto] = useState(false);
  const [hecho, setHecho] = useState(false);
  const cerrar = () => setAbierto(false);
  const [estado, enviar, pendiente] = useAccionDeDialogo(accion, () => {
    setHecho(true);
    cerrar();
  });
  useTituloAlDesaparecer(abierto || hecho);
  return (
    <>
      <Boton variante="secundario" tamano="sm" onClick={() => setAbierto(true)} aria-haspopup="dialog" className="whitespace-nowrap">
        {/* El periodo, en minúscula a mitad de frase: «Reabrir septiembre de 2026», como «Corregir septiembre de 2026». */}
        Reabrir<span className="sr-only">{` ${etiqueta.toLowerCase()}`}</span>
      </Boton>
      <Dialogo abierto={abierto} alCerrar={cerrar} titulo={r.titulo} className={CLASE_DIALOGO}>
        {/* Solo abierto: varios diálogos en la tabla no repiten el id del campo. */}
        {abierto ? <FormularioDeReapertura r={r} enviar={enviar} estado={estado} pendiente={pendiente} alCerrar={cerrar} /> : null}
      </Dialogo>
    </>
  );
}

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
  return <Reabrir accion={reabrirMedicionAccion} etiqueta={etiqueta} r={reaperturaDeMedicion({ medicionId, codigo, etiqueta, reapertura })} />;
}

/**
 * «Reabrir» un periodo cerrado de un dato compartido (anexo 14C, §3.5), también para reportarlo tarde. Va siempre en cascada:
 * el diálogo lista antes de confirmar las mediciones cerradas que lo usaron (`reapertura`).
 */
export function DialogoReabrirDato({ periodoId, etiqueta, reapertura }: { periodoId: number; etiqueta: string; reapertura: ReaperturaEnTexto }) {
  return <Reabrir accion={reabrirDatoCompartido} etiqueta={etiqueta} r={reaperturaDeDato({ periodoId, reapertura })} />;
}

/**
 * «Cerrar de nuevo» lo reabierto (F14-DC31; anexo 14C, §3.5), con el último cierre y como esté, sin confirmación (la única
 * excepción es `CerrarConAdvertencia`). Tras cerrarlo, la fila cambia y este botón se va: el foco pasa al título de la página.
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
        <span className="sr-only">{` ${etiqueta.toLowerCase()}`}</span>
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

/**
 * Lo que advierte «Cerrar de nuevo» un periodo reabierto de un dato con la lista de categorías vacía cuando su dimensión ya
 * tiene categorías activas (complemento de la 14C, decisión 12 del usuario): se cerraría sin dato aunque ya podría
 * reportarse. Nombra «Actualizar categorías» solo si la fila lo ofrece (`conActualizar`).
 */
export function advertenciaDelPeriodoVacio(conActualizar: boolean): string {
  const base = "Este periodo no tiene categorías y su dimensión ya tiene categorías activas. Si lo cierra ahora, queda cerrado sin dato.";
  return conActualizar ? `${base} Para que sus responsables lo reporten, pulse antes «Actualizar categorías» en su fila.` : base;
}

/**
 * El formulario del diálogo de `CerrarConAdvertencia`, sin estado propio: la advertencia y la confirmación. Manda solo el id,
 * como el botón directo: el servidor cierra igual (la decisión 12 fue advertir, no impedir).
 */
export function FormularioCerrarConAdvertencia({
  id,
  titulo,
  advertencia,
  enviar,
  estado,
  pendiente,
  alCerrar,
}: {
  id: number;
  titulo: string;
  advertencia: string;
  enviar: (formData: FormData) => void;
  estado: EstadoAccion;
  pendiente: boolean;
  alCerrar: () => void;
}) {
  return (
    <form action={enviar} className="flex flex-col gap-4 p-5">
      <input type="hidden" name="id" value={id} />
      <p aria-hidden="true" className="font-semibold">
        {titulo}
      </p>
      <p className="text-sm text-muted-foreground">{advertencia}</p>
      <ErrorAccion estado={estado} />
      <div className="flex flex-wrap justify-end gap-2">
        <Boton variante="secundario" onClick={alCerrar}>
          Volver
        </Boton>
        <Boton type="submit" pendiente={pendiente}>
          {pendiente ? "Cerrando…" : "Cerrar sin dato"}
        </Boton>
      </div>
    </form>
  );
}

/**
 * «Cerrar de nuevo» con un paso más: el botón, con el mismo texto que el directo, abre un diálogo que advierte antes de cerrar
 * (`FormularioCerrarConAdvertencia`). Tras cerrar, la fila cambia y este botón se va: el foco pasa al título de la página.
 */
function CerrarConAdvertencia({ accion, id, etiqueta, advertencia }: { accion: Accion; id: number; etiqueta: string; advertencia: string }) {
  const [abierto, setAbierto] = useState(false);
  const [hecho, setHecho] = useState(false);
  const cerrar = () => setAbierto(false);
  const [estado, enviar, pendiente] = useAccionDeDialogo(accion, () => {
    setHecho(true);
    cerrar();
  });
  useTituloAlDesaparecer(abierto || hecho);
  const titulo = `Cerrar de nuevo ${etiqueta.toLowerCase()}`;
  return (
    <>
      <Boton variante="secundario" tamano="sm" onClick={() => setAbierto(true)} aria-haspopup="dialog" className="whitespace-nowrap">
        Cerrar de nuevo<span className="sr-only">{` ${etiqueta.toLowerCase()}`}</span>
      </Boton>
      <Dialogo abierto={abierto} alCerrar={cerrar} titulo={titulo} className={CLASE_DIALOGO}>
        {abierto ? (
          <FormularioCerrarConAdvertencia
            id={id}
            titulo={titulo}
            advertencia={advertencia}
            enviar={enviar}
            estado={estado}
            pendiente={pendiente}
            alCerrar={cerrar}
          />
        ) : null}
      </Dialogo>
    </>
  );
}

/**
 * «Cerrar de nuevo» un periodo reabierto de un dato compartido. Con `advertencia` (el periodo está vacío y su dimensión ya
 * tiene categorías activas: `advertenciaDelPeriodoVacio`), advierte antes de cerrar; sin ella, cierra al pulsar.
 */
export function CerrarDeNuevoDato({ periodoId, etiqueta, advertencia = null }: { periodoId: number; etiqueta: string; advertencia?: string | null }) {
  return advertencia ? (
    <CerrarConAdvertencia accion={cerrarDeNuevoElDatoCompartido} id={periodoId} etiqueta={etiqueta} advertencia={advertencia} />
  ) : (
    <CerrarOtraVez accion={cerrarDeNuevoElDatoCompartido} id={periodoId} etiqueta={etiqueta} />
  );
}
