"use client";

import { useActionState } from "react";
import {
  alternarItemVerificacionAccion,
  crearItemVerificacionAccion,
  editarItemVerificacionAccion,
  moverItemVerificacionAccion,
} from "@/app/admin/acciones-config-documental";
import type { EstadoAccion } from "@/app/admin/comun";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { Insignia } from "@/componentes/ui/Insignia";
import type { ItemVerificacion } from "@/db/consultas/revision";

type Accion = (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;

function Rechazo({ estado }: { estado: EstadoAccion }) {
  return estado ? (
    <p role="alert" className="text-sm text-estado-critico-texto">
      {estado.error}
    </p>
  ) : null;
}

/** Un botón que envía su propia acción con campos ocultos. */
function BotonAccion({
  accion,
  campos,
  etiqueta,
  descripcion,
  deshabilitado,
}: {
  accion: Accion;
  campos: Record<string, string | number>;
  etiqueta: string;
  descripcion: string;
  deshabilitado?: boolean;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  return (
    <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex flex-col gap-1">
      {Object.entries(campos).map(([nombre, valor]) => (
        <input key={nombre} type="hidden" name={nombre} value={valor} />
      ))}
      <Boton type="submit" variante="secundario" tamano="sm" pendiente={pendiente} disabled={deshabilitado} aria-label={descripcion}>
        {etiqueta}
      </Boton>
      <Rechazo estado={estado} />
    </form>
  );
}

function FormularioItem({
  accion,
  id,
  inicial,
  etiquetaBoton,
}: {
  accion: Accion;
  id?: number;
  inicial?: { texto: string; critico: boolean };
  etiquetaBoton: string;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const v = estado?.valores;
  const texto = typeof v?.texto === "string" ? v.texto : undefined;
  const sufijo = id ?? "nuevo";
  return (
    <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex flex-col gap-3">
      {id && <input type="hidden" name="id" value={id} />}
      <Campo etiqueta="Texto del ítem" nombre={`texto-${sufijo}`} ayuda="De 5 a 300 caracteres.">
        <input name="texto" required minLength={5} maxLength={300} defaultValue={texto ?? inicial?.texto} className={claseControl} />
      </Campo>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" name="critico" defaultChecked={v ? v.critico === "on" : inicial?.critico} />
        Crítico
      </label>
      <Rechazo estado={estado} />
      <Boton type="submit" pendiente={pendiente} className="self-start">
        {pendiente ? "Guardando…" : etiquetaBoton}
      </Boton>
    </form>
  );
}

export function ListaItemsVerificacion({ items }: { items: ItemVerificacion[] }) {
  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-2">
        {items.map((item, i) => (
          <li key={item.id} className={`flex flex-col gap-3 rounded-lg border p-3 ${item.activo ? "" : "border-dashed"}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{i + 1}.</span>
              <span className="flex-1 text-sm font-medium">{item.texto}</span>
              {item.critico && <Insignia variante="critico">Crítico</Insignia>}
              {!item.activo && <Insignia variante="sin-dato">Desactivado</Insignia>}
            </div>
            <div className="flex flex-wrap items-start gap-2">
              <BotonAccion
                accion={moverItemVerificacionAccion}
                campos={{ id: item.id, direccion: "arriba" }}
                etiqueta="Subir"
                descripcion={`Subir el ítem ${i + 1}`}
                deshabilitado={i === 0}
              />
              <BotonAccion
                accion={moverItemVerificacionAccion}
                campos={{ id: item.id, direccion: "abajo" }}
                etiqueta="Bajar"
                descripcion={`Bajar el ítem ${i + 1}`}
                deshabilitado={i === items.length - 1}
              />
              <BotonAccion
                accion={alternarItemVerificacionAccion}
                campos={{ id: item.id, activo: String(!item.activo) }}
                etiqueta={item.activo ? "Desactivar" : "Activar"}
                descripcion={`${item.activo ? "Desactivar" : "Activar"} el ítem ${i + 1}`}
              />
            </div>
            <details className="rounded-md border p-2">
              <summary className="cursor-pointer text-sm font-medium">Editar ítem {i + 1}</summary>
              <div className="mt-3">
                <FormularioItem accion={editarItemVerificacionAccion} id={item.id} inicial={item} etiquetaBoton="Guardar ítem" />
              </div>
            </details>
          </li>
        ))}
      </ol>
      <div className="rounded-lg border border-border p-4">
        <h3 className="mb-3 text-sm font-semibold">Añadir un ítem</h3>
        <FormularioItem accion={crearItemVerificacionAccion} etiquetaBoton="Añadir ítem" />
      </div>
    </div>
  );
}
