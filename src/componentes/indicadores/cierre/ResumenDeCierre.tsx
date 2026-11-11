"use client";

import { useActionState, useState } from "react";
import { cerrarMesAccion } from "@/app/acciones-indicadores";
import type { EstadoAccion } from "@/app/admin/comun";
import { CLASE_DIALOGO } from "@/componentes/indicadores/admin/DialogoRetirar";
import { ErrorAccion } from "@/componentes/tramites/AccionesSolicitud";
import { Boton } from "@/componentes/ui/Boton";
import { Dialogo } from "@/componentes/ui/Dialogo";
import { useTituloAlDesaparecer } from "@/componentes/ui/foco";
import { celda, TablaDatos } from "@/componentes/ui/TablaDatos";
import { TarjetaCifra } from "@/componentes/ui/TarjetaCifra";
import type { ResumenDeCierre as Resumen } from "@/db/consultas/indicadores/cierre";
import { cuenta } from "@/lib/plural";

const COLUMNAS_SIN_DATO = [
  { clave: "proceso", etiqueta: "Proceso" },
  { clave: "indicador", etiqueta: "Indicador" },
  { clave: "periodo", etiqueta: "Periodo" },
  { clave: "quien", etiqueta: "Debía medirla" },
];

/** La confirmación del cierre (spec §9.3): sin clave, con lo que va a pasar. */
function ConfirmarCierre({ resumen, mes }: { resumen: Resumen; mes: string }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, enviar, pendiente] = useActionState<EstadoAccion, FormData>(cerrarMesAccion, null);
  // La acción lleva a la página con el aviso del cierre: el botón se va con la página.
  useTituloAlDesaparecer(abierto);
  const titulo = `Cerrar ${mes}`;
  return (
    <>
      <div>
        <Boton onClick={() => setAbierto(true)} aria-haspopup="dialog">
          {titulo}
        </Boton>
      </div>
      <Dialogo abierto={abierto} alCerrar={() => setAbierto(false)} titulo={titulo} className={CLASE_DIALOGO}>
        {abierto ? (
          <form action={enviar} className="flex flex-col gap-4 p-5">
            <input type="hidden" name="mes" value={resumen.mes} />
            <p aria-hidden="true" className="font-semibold">
              {titulo}
            </p>
            <p className="text-sm">
              {resumen.aCerrar === 0
                ? "No hay mediciones que cerrar: el mes queda cerrado igual y el siguiente cierre empieza después de él."
                : `Se cerrarán ${cuenta(resumen.aCerrar, "medición", "mediciones")}: ${resumen.reportadas} reportadas, ${resumen.sinDato.length} sin dato, ${resumen.noAplica} «No aplica» y ${resumen.sinAnalisis} sin análisis.`}
            </p>
            <p className="text-sm text-muted-foreground">
              Después del cierre, los datos, el resultado, el análisis y los soportes de esas mediciones no cambian: para corregir una hay que
              reabrirla con una justificación. Las observaciones se siguen admitiendo. No pide clave.
            </p>
            <ErrorAccion estado={estado} />
            <div className="flex flex-wrap justify-end gap-2">
              <Boton variante="secundario" onClick={() => setAbierto(false)}>
                Volver
              </Boton>
              <Boton type="submit" pendiente={pendiente}>
                {pendiente ? "Cerrando…" : "Cerrar el mes"}
              </Boton>
            </div>
          </form>
        ) : null}
      </Dialogo>
    </>
  );
}

/**
 * El resumen previo del cierre (spec §9.2): cuántas mediciones se cerrarán y cómo, las que quedarán sin dato con quién
 * debía medirlas (por proceso), las observaciones sin respuesta y los dos grupos que no se cierran (F14-DC3); al final,
 * la confirmación. `mes` es el mes en palabras, en minúscula («marzo de 2026»); `periodos`, cada periodo en palabras.
 */
export function ResumenDeCierre({ resumen, mes, periodos }: { resumen: Resumen; mes: string; periodos: Readonly<Record<string, string>> }) {
  const r = resumen;
  return (
    <section aria-labelledby="cierre-resumen" className="flex min-w-0 flex-col gap-4">
      <h2 id="cierre-resumen" className="text-lg font-semibold">
        {`Resumen de ${mes}`}
      </h2>
      <p className="text-sm text-muted-foreground">
        {`El cierre alcanza las mediciones cuyo periodo terminó en ${mes} o antes y aún no están cerradas.`}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <TarjetaCifra etiqueta="Se cerrarán" valor={r.aCerrar} />
        <TarjetaCifra etiqueta="Reportadas" valor={r.reportadas} detalle="Con su resultado" />
        <TarjetaCifra etiqueta="Quedarán sin dato" valor={r.sinDato.length} estado="sin-dato" />
        <TarjetaCifra etiqueta="No aplica" valor={r.noAplica} />
        <TarjetaCifra etiqueta="Sin análisis" valor={r.sinAnalisis} detalle="Con datos y sin el análisis exigido" estado={r.sinAnalisis > 0 ? "atencion" : undefined} />
      </div>

      <section aria-labelledby="cierre-sin-dato" className="flex min-w-0 flex-col gap-2">
        <h3 id="cierre-sin-dato" className="font-semibold">
          Quedarán sin dato
        </h3>
        <TablaDatos titulo="Mediciones que quedarán sin dato" columnas={COLUMNAS_SIN_DATO} filas={r.sinDato.length} vacio="Ninguna medición quedará sin dato.">
          {r.sinDato.map((s) => (
            <tr key={`${s.codigo}-${s.periodo}`}>
              <td className={celda}>{s.proceso}</td>
              <td className={celda}>
                <span className="block font-mono text-xs text-muted-foreground">{s.codigo}</span>
                <span className="break-words">{s.nombre}</span>
              </td>
              <td className={celda}>{periodos[s.periodo] ?? s.periodo}</td>
              <td className={celda}>{s.quien.length > 0 ? s.quien.join(", ") : <span className="text-muted-foreground">Nadie</span>}</td>
            </tr>
          ))}
        </TablaDatos>
      </section>

      <ul className="flex list-none flex-col gap-2 text-sm">
        <li>
          {r.observacionesSinRespuesta === 0
            ? "No hay observaciones sin respuesta en mediciones de este mes o anteriores."
            : `${cuenta(r.observacionesSinRespuesta, "observación sigue", "observaciones siguen")} sin respuesta en mediciones de este mes o anteriores: no impiden el cierre.`}
        </li>
      </ul>

      <div className="flex flex-col gap-2 rounded-lg border border-l-4 border-border border-l-mod-indicadores bg-muted px-4 py-3 text-sm">
        <p className="font-semibold">No se cierran</p>
        <p>{`${cuenta(r.enPlazo, "medición sigue", "mediciones siguen")} dentro de su plazo de reporte: quedan para el siguiente cierre.`}</p>
        <p>{`${cuenta(r.historicosSinRegistrar, "histórico sin registrar sigue abierto", "históricos sin registrar siguen abiertos")} hasta que se registren.`}</p>
      </div>

      <ConfirmarCierre resumen={r} mes={mes} />
    </section>
  );
}
