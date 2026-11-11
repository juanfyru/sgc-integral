import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ResumenDeCierre } from "@/componentes/indicadores/cierre/ResumenDeCierre";
import { apruebaFichas, PestanasIndicadores, pestanasVisibles } from "@/componentes/indicadores/PestanasIndicadores";
import { claseBoton } from "@/componentes/ui/Boton";
import { claseControl } from "@/componentes/ui/Campo";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { celda, celdaNumerica, TablaDatos } from "@/componentes/ui/TablaDatos";
import { cierres, mesPorOmision, resumenDeCierre } from "@/db/consultas/indicadores/cierre";
import { esMesTerminado, etiquetaDeMes, mesesParaCerrar, PATRON_MES } from "@/lib/indicadores/cierre";
import { periodoDe } from "@/lib/indicadores-documentales/periodo";
import { exigirSesion } from "@/lib/paginas";
import { puede } from "@/lib/permisos";
import { cuenta } from "@/lib/plural";
import { fechaHoraLarga, zonaHoraria } from "@/lib/zona-horaria";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Cierre del mes" };

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";
const COLUMNAS_CIERRES = [
  { clave: "mes", etiqueta: "Mes" },
  { clave: "por", etiqueta: "Cerrado por" },
  { clave: "cuando", etiqueta: "Cuándo" },
  { clave: "cerradas", etiqueta: "Mediciones cerradas", numerica: true },
];

type Parametros = Record<string, string | string[] | undefined>;

/** «Se cerró marzo de 2026: 12 mediciones cerradas.» tras cerrar (`?cerrado=AAAA-MM&cerradas=N`); `null` sin eso. */
function avisoDeCierre(sp: Parametros): string | null {
  const { cerrado, cerradas } = sp;
  if (typeof cerrado !== "string" || !PATRON_MES.test(cerrado) || typeof cerradas !== "string" || !/^\d{1,6}$/.test(cerradas)) return null;
  return `Se cerró ${etiquetaDeMes(cerrado).toLowerCase()}: ${cuenta(Number(cerradas), "medición cerrada", "mediciones cerradas")}.`;
}

/**
 * «Cierre del mes» (spec §9 y §12.6), solo para quien administra: el mes que se cierra (por omisión, el siguiente al último
 * cerrado; `?mes=AAAA-MM` para otro que ya terminó), su resumen previo con la confirmación y los cierres anteriores. El
 * selector es un formulario `GET`: funciona antes de hidratar. Un mes que no ha terminado, o lo que no es un mes, «no
 * encontrada».
 */
export default async function PaginaCierre({ searchParams }: { searchParams: Promise<Parametros> }) {
  const sesion = await exigirSesion();
  if (!puede(sesion, "indicadores.administrar")) notFound();
  const sp = await searchParams;
  const ahora = new Date();
  const zona = zonaHoraria();
  const pedido = sp.mes;
  if (pedido !== undefined && !esMesTerminado(pedido, ahora)) notFound();
  const porOmision = await mesPorOmision({ ahora });
  const mes = pedido ?? porOmision;
  const opciones = mesesParaCerrar(porOmision, ahora, zona);
  if (mes && !opciones.includes(mes)) opciones.unshift(mes);
  const [resumen, anteriores] = await Promise.all([mes ? resumenDeCierre(sesion, mes, { ahora }) : null, cierres()]);
  const aviso = avisoDeCierre(sp);
  const periodos = Object.fromEntries((resumen?.sinDato ?? []).map((s) => [s.periodo, periodoDe(s.periodo, zona)?.etiqueta ?? s.periodo]));

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <EncabezadoPagina
        titulo="Indicadores"
        descripcion="El cierre del mes deja fijas las mediciones de los periodos que terminaron: después solo se corrigen reabriéndolas, con una justificación."
        tituloEnfocable
      />
      <PestanasIndicadores activa="cierre" visibles={pestanasVisibles(sesion, { aprueba: apruebaFichas(sesion) })} />
      {aviso ? (
        <p role="status" className="rounded-lg border border-border bg-muted p-3 text-sm text-foreground">
          {aviso}
        </p>
      ) : null}

      <section aria-labelledby="cierre-mes" className="flex min-w-0 flex-col gap-3">
        <h2 id="cierre-mes" className="text-lg font-semibold">
          Cerrar un mes
        </h2>
        {opciones.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todos los meses que terminaron ya están cerrados: el siguiente se podrá cerrar cuando termine el mes en curso.
          </p>
        ) : (
          <form method="get" action="/indicadores/cierre" className="flex flex-wrap items-end gap-2">
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="cierre-mes-elegido" className="text-sm font-medium">
                Cerrar hasta
              </label>
              <select id="cierre-mes-elegido" name="mes" defaultValue={mes ?? undefined} className={`${claseControl} min-w-0 max-w-full`}>
                {opciones.map((m) => (
                  <option key={m} value={m}>
                    {etiquetaDeMes(m)}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className={`${claseBoton("secundario")} ${FOCO}`}>
              Ver el resumen
            </button>
          </form>
        )}
      </section>

      {resumen && mes ? (
        resumen.yaCerrado ? (
          <p className="text-sm">{`${etiquetaDeMes(mes)} ya está cerrado. Para corregir una de sus mediciones, reábrala desde la página del indicador.`}</p>
        ) : (
          // Por mes: tras cerrar, la página vuelve con el siguiente y su confirmación empieza cerrada.
          <ResumenDeCierre key={resumen.mes} resumen={resumen} mes={etiquetaDeMes(mes).toLowerCase()} periodos={periodos} />
        )
      ) : null}

      <section aria-labelledby="cierre-anteriores" className="flex min-w-0 flex-col gap-3">
        <h2 id="cierre-anteriores" className="text-lg font-semibold">
          Cierres anteriores
        </h2>
        <TablaDatos titulo="Cierres anteriores" columnas={COLUMNAS_CIERRES} filas={anteriores.length} vacio="Aún no se ha cerrado ningún mes.">
          {anteriores.map((c) => (
            <tr key={c.mes}>
              <td className={celda}>{etiquetaDeMes(c.mes)}</td>
              <td className={celda}>{c.cerradoPor}</td>
              <td className={celda}>{fechaHoraLarga(c.cerradoEn)}</td>
              <td className={celdaNumerica}>{c.cerradas}</td>
            </tr>
          ))}
        </TablaDatos>
      </section>
    </div>
  );
}
