"use client";

import { useActionState } from "react";
import { cerrarHallazgoAccion } from "@/app/acciones-distribucion";
import type { EstadoAccion } from "@/app/admin/comun";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { ErrorAccion } from "@/componentes/tramites/AccionesSolicitud";
import { Boton } from "@/componentes/ui/Boton";
import { claseControl } from "@/componentes/ui/Campo";
import { Insignia } from "@/componentes/ui/Insignia";
import type { Hallazgo } from "@/db/consultas/distribucion/hallazgos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { urlDeFoto } from "./ItemChequeo";

function CerrarHallazgo({ hallazgoId, verificacionId }: { hallazgoId: number; verificacionId: number }) {
  const [estado, enviar, pendiente] = useActionState<EstadoAccion, FormData>(cerrarHallazgoAccion, null);
  return (
    <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
      <input type="hidden" name="id" value={hallazgoId} />
      <input type="hidden" name="verificacion" value={verificacionId} />
      <label className="flex flex-col gap-1 text-sm font-medium">
        Qué se hizo para corregirlo
        <textarea
          name="nota"
          required
          minLength={5}
          maxLength={1000}
          rows={2}
          defaultValue={estado?.valores?.nota as string | undefined}
          className={claseControl}
        />
      </label>
      <ErrorAccion estado={estado} />
      <div>
        <Boton type="submit" pendiente={pendiente}>
          {pendiente ? "Procesando…" : "Cerrar hallazgo"}
        </Boton>
      </div>
    </form>
  );
}

/** Los hallazgos que abrió una verificación, con su cierre; quien responde por el punto puede cerrarlos. */
export function ListaHallazgos({
  hallazgos,
  verificacionId,
  cerrables,
}: {
  hallazgos: Hallazgo[];
  verificacionId: number;
  /** Los hallazgos que la persona puede cerrar. */
  cerrables: number[];
}) {
  const fecha = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: zonaHoraria() });
  if (hallazgos.length === 0) return null;
  return (
    <section aria-labelledby="titulo-hallazgos" className="rounded-xl border border-border bg-card p-4 shadow-xs">
      <h2 id="titulo-hallazgos" className="mb-3 text-sm font-semibold">{`Hallazgos (${hallazgos.length})`}</h2>
      <ul className="flex list-none flex-col gap-4">
        {hallazgos.map((h) => (
          <li key={h.id} className="rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="min-w-0 break-words text-sm font-medium">{h.descripcion}</p>
              {h.estado === "abierto" ? <Insignia variante="atencion">Abierto</Insignia> : <Insignia variante="bien">Cerrado</Insignia>}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {`Responsable: ${h.responsable.nombre}`}
              {h.estado === "abierto" ? ` · Vence el ${fecha.format(h.venceEn)}` : ""}
              {h.retiradoEnElActo ? " · Retirado en el acto" : ""}
            </p>
            {h.fotos.length > 0 ? (
              <ul className="mt-2 flex list-none flex-col gap-1" aria-label="Fotos del hallazgo">
                {h.fotos.map((f) => (
                  <li key={f.id} className="text-sm">
                    <a
                      href={urlDeFoto(verificacionId, f.id, f.nombreOriginal)}
                      className="break-words rounded underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
                    >
                      {f.nombreOriginal}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
            {h.cierre ? (
              <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                <span className="text-xs text-muted-foreground">{`Cerrado por ${h.cierre.por} el ${fecha.format(h.cierre.en)}: `}</span>
                {h.cierre.nota}
              </p>
            ) : cerrables.includes(h.id) ? (
              <CerrarHallazgo hallazgoId={h.id} verificacionId={verificacionId} />
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
