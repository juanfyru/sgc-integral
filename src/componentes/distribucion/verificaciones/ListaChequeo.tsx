"use client";

import { useActionState, useState } from "react";
import {
  agregarItemLibreAccion,
  cerrarVerificacionAccion,
  descartarVerificacionAccion,
  guardarAvanceAccion,
} from "@/app/acciones-distribucion";
import type { EstadoAccion } from "@/app/admin/comun";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { ErrorAccion } from "@/componentes/tramites/AccionesSolicitud";
import { Boton } from "@/componentes/ui/Boton";
import { claseControl } from "@/componentes/ui/Campo";
import { Dialogo } from "@/componentes/ui/Dialogo";
import type { ItemVerificacion, Verificacion } from "@/db/consultas/distribucion/verificaciones";
import { resumenDeChequeo } from "@/lib/distribucion/verificacion";
import { ItemChequeo, type ValorItem } from "./ItemChequeo";
import { textoResumen } from "./ResumenCierre";

const CLASE_DIALOGO = "m-auto w-full max-w-md rounded-lg border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40";
const ID_FORMULARIO = "chequeo";

const valorInicial = (i: ItemVerificacion): ValorItem => ({ respuesta: i.respuesta, nota: i.nota ?? "", retirado: i.retirado });

function Descartar({ id, abierto, alCerrar }: { id: number; abierto: boolean; alCerrar: () => void }) {
  const [estado, enviar, pendiente] = useActionState<EstadoAccion, FormData>(descartarVerificacionAccion, null);
  return (
    <Dialogo abierto={abierto} alCerrar={alCerrar} titulo="Descartar la verificación" className={CLASE_DIALOGO}>
      <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex flex-col gap-4 p-5">
        <input type="hidden" name="id" value={id} />
        <p aria-hidden="true" className="font-semibold">Descartar la verificación</p>
        <p className="text-sm text-muted-foreground">
          Se libera el punto y no se abre ningún hallazgo ni se mueve ninguna copia. Queda en la bitácora con el motivo.
        </p>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Motivo
          <textarea name="motivo" required minLength={5} maxLength={1000} rows={3} className={claseControl} />
        </label>
        <ErrorAccion estado={estado} />
        <div className="flex flex-wrap justify-end gap-2">
          <Boton variante="secundario" onClick={alCerrar}>Cancelar</Boton>
          <Boton type="submit" variante="peligro" pendiente={pendiente}>{pendiente ? "Procesando…" : "Descartar"}</Boton>
        </div>
      </form>
    </Dialogo>
  );
}

/**
 * La lista de chequeo de una verificación. Editable, lleva todo lo escrito en un solo formulario: guardar, añadir
 * un ítem y cerrar envían las respuestas actuales, así que ninguna acción las pierde. Pensada para el celular.
 */
export function ListaChequeo({ verificacion: v }: { verificacion: Verificacion }) {
  const [valores, setValores] = useState<Record<number, ValorItem>>(() =>
    Object.fromEntries(v.items.map((i) => [i.id, valorInicial(i)])),
  );
  const [confirmando, setConfirmando] = useState(false);
  const [descartando, setDescartando] = useState(false);
  const [estadoGuardar, guardar, guardando] = useActionState<EstadoAccion, FormData>(guardarAvanceAccion, null);
  const [estadoAnadir, anadir, anadiendo] = useActionState<EstadoAccion, FormData>(agregarItemLibreAccion, null);
  const [estadoCerrar, cerrar, cerrando] = useActionState<EstadoAccion, FormData>(cerrarVerificacionAccion, null);
  // Solo se muestra el error de la última acción que la persona envió.
  const [ultima, setUltima] = useState<"guardar" | "anadir" | "cerrar">("guardar");
  const enviarComo = (cual: "guardar" | "anadir" | "cerrar", enviar: (datos: FormData) => void) => (datos: FormData) => {
    setUltima(cual);
    enviar(datos);
  };

  if (!v.puedeEditar) {
    return (
      <ol className="flex list-none flex-col gap-3">
        {v.items.map((i) => (
          <li key={i.id} className="rounded-xl border border-border bg-card p-3 shadow-xs">
            <ItemChequeo verificacionId={v.id} item={i} valor={valorInicial(i)} editable={false} />
          </li>
        ))}
      </ol>
    );
  }

  const valorDe = (i: ItemVerificacion) => valores[i.id] ?? valorInicial(i);
  const resumen = resumenDeChequeo(v.items.map((i) => ({ respuesta: valorDe(i).respuesta })));
  const noConformes = v.items.filter((i) => valorDe(i).respuesta === "no_conforme").length;
  const estado = ultima === "cerrar" ? estadoCerrar : ultima === "anadir" ? estadoAnadir : estadoGuardar;

  return (
    <div className="flex flex-col gap-4">
      <form
        id={ID_FORMULARIO}
        onKeyDown={(e) => {
          // Enter en un radio o una casilla no debe enviar el formulario (el primer botón es «Añadir ítem»).
          const destino = e.target as HTMLInputElement;
          if (e.key === "Enter" && (destino.type === "radio" || destino.type === "checkbox")) e.preventDefault();
        }}
        className="flex flex-col gap-4"
      >
        <input type="hidden" name="id" value={v.id} />
        <ol className="flex list-none flex-col gap-3">
          {v.items.map((i) => (
            <li key={i.id} className="rounded-xl border border-border bg-card p-3 shadow-xs">
              <ItemChequeo
                verificacionId={v.id}
                item={i}
                valor={valorDe(i)}
                editable
                alCambiar={(valor) => setValores((previos) => ({ ...previos, [i.id]: valor }))}
              />
            </li>
          ))}
        </ol>

        <div className="rounded-xl border border-dashed border-border p-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Añadir un ítem a esta verificación
            <input name="texto" type="text" minLength={5} maxLength={200} autoComplete="off" className={claseControl} />
          </label>
          <div className="mt-2">
            <Boton type="submit" variante="secundario" formAction={enviarComo("anadir", anadir)} pendiente={anadiendo}>
              Añadir ítem
            </Boton>
          </div>
        </div>
      </form>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-2 border-t border-border bg-card px-4 py-3 shadow-lg sm:mx-0 sm:rounded-xl sm:border">
        <p className="text-sm font-medium" aria-live="polite">
          {textoResumen(resumen, true)}
          {resumen.sinResponder > 0
            ? ` · ${resumen.sinResponder === 1 ? "falta 1 ítem por responder" : `faltan ${resumen.sinResponder} ítems por responder`}`
            : ""}
        </p>
        <ErrorAccion estado={estado} />
        <div className="flex flex-wrap gap-2">
          <Boton type="submit" form={ID_FORMULARIO} formAction={enviarComo("guardar", guardar)} variante="secundario" pendiente={guardando}>
            Guardar avance
          </Boton>
          <Boton
            onClick={() => setConfirmando(true)}
            disabled={resumen.sinResponder > 0}
            aria-describedby={resumen.sinResponder > 0 ? "ayuda-cerrar" : undefined}
          >
            Cerrar verificación
          </Boton>
          <Boton variante="peligro" onClick={() => setDescartando(true)}>
            Descartar
          </Boton>
        </div>
        {resumen.sinResponder > 0 ? (
          <p id="ayuda-cerrar" className="text-xs text-muted-foreground">
            Responda todos los ítems para poder cerrarla.
          </p>
        ) : null}
      </div>

      <Dialogo abierto={confirmando} alCerrar={() => setConfirmando(false)} titulo="Cerrar la verificación" className={CLASE_DIALOGO}>
        <div className="flex flex-col gap-4 p-5">
          <p aria-hidden="true" className="font-semibold">Cerrar la verificación</p>
          <p className="text-sm">{textoResumen(resumen, false)}</p>
          <p className="text-sm text-muted-foreground">
            {noConformes === 0
              ? "No se abrirá ningún hallazgo."
              : noConformes === 1
                ? "Se abrirá 1 hallazgo para quien responde por el punto."
                : `Se abrirán ${noConformes} hallazgos para quien responde por el punto.`}{" "}
            Las copias obsoletas que ya no estaban quedan recogidas. Una verificación cerrada no se edita.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Boton variante="secundario" onClick={() => setConfirmando(false)}>Cancelar</Boton>
            <Boton type="submit" form={ID_FORMULARIO} formAction={enviarComo("cerrar", cerrar)} pendiente={cerrando} onClick={() => setConfirmando(false)}>
              {cerrando ? "Procesando…" : "Cerrar verificación"}
            </Boton>
          </div>
        </div>
      </Dialogo>
      <Descartar id={v.id} abierto={descartando} alCerrar={() => setDescartando(false)} />
    </div>
  );
}
