"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { EstadoAccion } from "@/app/admin/comun";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { MAXIMO_POR_REPORTE, RUTA_MIS_REPORTES } from "@/lib/mejoramiento/reportes";
import { AVISO_SIN_PACIENTES } from "@/lib/mejoramiento/textos";

const texto = (v: Record<string, string | string[]> | undefined, c: string, defecto = ""): string => {
  const x = v?.[c];
  return typeof x === "string" ? x : defecto;
};

/**
 * Reportar una posible no conformidad (spec 15 §7.3): qué vio, cuándo, en qué proceso (opcional: «No sé») y, si aplica, la
 * referencia del caso, con el aviso de §6.4. Los archivos se adjuntan después de enviarlo, en el paso siguiente. Pensado para el
 * teléfono: una columna. Los nombres de los campos son los de `EsquemaReporte`, que es estricto.
 */
export function FormularioReporte({
  accion,
  procesos,
  hoy,
}: {
  accion: (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;
  /** Todos los procesos activos: quien reporta puede haberlo visto en cualquiera. */
  procesos: ReadonlyArray<{ id: number; nombre: string }>;
  /** Hoy en la zona de la instalación (`yyyy-mm-dd`): el tope de la fecha. */
  hoy: string;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const v = estado?.valores;
  return (
    <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex min-w-0 max-w-2xl flex-col gap-4">
      {estado?.ok === false ? (
        <p role="alert" className="rounded-md border border-estado-critico/40 bg-estado-critico-fondo px-3 py-2 text-sm text-estado-critico-texto">
          {estado.error}
        </p>
      ) : null}
      <Campo etiqueta="¿Qué vio?" nombre="descripcion" ayuda={AVISO_SIN_PACIENTES}>
        <textarea required minLength={10} maxLength={2000} rows={6} defaultValue={texto(v, "descripcion")} className={claseControl} />
      </Campo>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo etiqueta="¿Cuándo lo vio?" nombre="vistoEn">
          <input type="date" required max={hoy} defaultValue={texto(v, "vistoEn", hoy)} className={claseControl} />
        </Campo>
        <Campo etiqueta="¿En qué proceso?" nombre="procesoId" ayuda="Si no lo sabe, déjelo en «No sé».">
          <select defaultValue={texto(v, "procesoId")} className={claseControl}>
            <option value="">No sé</option>
            {procesos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </Campo>
      </div>
      <Campo
        etiqueta="Referencia del caso (si aplica)"
        nombre="referenciaCaso"
        ayuda="El radicado de la PQRSF o el código del evento, si lo tiene."
      >
        <input type="text" maxLength={100} defaultValue={texto(v, "referenciaCaso")} autoComplete="off" className={claseControl} />
      </Campo>
      <p className="text-sm text-muted-foreground">
        {`Al enviarlo, el Administrador del SGC lo recibe y lo clasifica. Después de enviarlo puede adjuntar hasta ${MAXIMO_POR_REPORTE} archivos de evidencia. Enviado, no se puede editar.`}
      </p>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Link
          href={RUTA_MIS_REPORTES}
          className="inline-flex items-center rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
        >
          Cancelar
        </Link>
        <Boton type="submit" variante="primario" pendiente={pendiente}>
          Enviar el reporte
        </Boton>
      </div>
    </form>
  );
}
