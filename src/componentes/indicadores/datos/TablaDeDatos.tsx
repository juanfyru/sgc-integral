import Link from "next/link";
import { Insignia } from "@/componentes/ui/Insignia";
import { celda, celdaNumerica, TablaDatos, type ColumnaTabla } from "@/componentes/ui/TablaDatos";
import type { DatoCompartido, IndicadorQueLoUsa, ResumenDeDato } from "@/db/consultas/indicadores/datos";
import { CONSOLIDACION } from "@/lib/indicadores/ficha-en-texto";
import { rutaDeDato, rutaDeIndicador } from "@/lib/indicadores/rutas";
import { ETIQUETA_PERIODICIDAD } from "@/lib/indicadores/tipos";
import { cuenta } from "@/lib/plural";
import { cifraDeDato, diaCorto, etiquetaDePeriodo, InsigniaPorReportar } from "./comun";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";
const ENLACE = `rounded-sm text-marca underline-offset-2 hover:underline ${FOCO}`;

export type FilaDeDato = { dato: DatoCompartido; resumen: ResumenDeDato | undefined; usan: IndicadorQueLoUsa[] };

const COLUMNAS: readonly ColumnaTabla[] = [
  { clave: "dato", etiqueta: "Dato" },
  { clave: "periodicidad", etiqueta: "Periodicidad" },
  { clave: "ultimo", etiqueta: "Último valor", numerica: true },
  { clave: "reporto", etiqueta: "Lo reportó" },
  { clave: "usan", etiqueta: "Lo usan" },
  { clave: "estado", etiqueta: "Estado" },
];

/** «Facturación · se suma · por sedes»: el proceso dueño, cómo se junta y, si la tiene, la dimensión. */
const deDondeEs = (d: DatoCompartido) =>
  [d.proceso, CONSOLIDACION[d.consolidacion].toLowerCase(), d.dimension ? `por ${d.dimension.toLowerCase()}` : null].filter(Boolean).join(" · ");

/**
 * El estado de un dato en la lista (maqueta 11): el periodo que se pide con la fecha límite más próxima, por reportar o
 * vencido; sin ninguno que se pida, «Reportado» si ya tiene algún valor y, si no, que aún no se pide (ningún indicador lo
 * ha necesitado).
 */
function Estado({ resumen, ahora }: { resumen: ResumenDeDato | undefined; ahora: Date }) {
  if (resumen?.porReportar) return <InsigniaPorReportar venceEn={resumen.porReportar.venceEn} ahora={ahora} />;
  if (resumen?.ultimo) return <Insignia variante="neutra">Reportado</Insignia>;
  return <Insignia variante="sin-dato">Aún no se pide</Insignia>;
}

/**
 * «Datos compartidos» (anexo 14C, §4.7, maqueta 11): por dato, su proceso y cómo se junta, la periodicidad, el último valor
 * con su periodo, quién lo reportó y cuándo, los indicadores que lo usan y que la persona ve (sin decir si hay más) y su
 * estado. Cada nombre lleva a la página del dato.
 */
export function TablaDeDatos({ filas, ahora }: { filas: FilaDeDato[]; ahora: Date }) {
  return (
    <TablaDatos titulo="Datos compartidos" columnas={COLUMNAS} filas={filas.length} vacio="Aún no hay datos compartidos.">
      {filas.map(({ dato, resumen, usan }) => {
        const ultimo = resumen?.ultimo ?? null;
        return (
          <tr key={dato.id}>
            <td className={celda}>
              <span className="flex flex-wrap items-center gap-2">
                <Link href={rutaDeDato(dato.id)} className={`font-medium break-words ${ENLACE}`}>
                  {dato.nombre}
                </Link>
                {dato.activa ? null : <Insignia variante="sin-dato">Inactivo</Insignia>}
              </span>
              <span className="block text-xs text-muted-foreground">{deDondeEs(dato)}</span>
            </td>
            <td className={celda}>{ETIQUETA_PERIODICIDAD[dato.periodicidad]}</td>
            <td className={`${celdaNumerica} whitespace-nowrap`}>
              {ultimo ? (
                <>
                  {cifraDeDato(ultimo.valor)}
                  <span className="block text-xs text-muted-foreground">
                    {etiquetaDePeriodo(ultimo.periodo)}
                    {ultimo.categorias ? ` · ${cuenta(ultimo.categorias, "categoría", "categorías")}` : ""}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </td>
            <td className={celda}>
              {ultimo?.reporto ? (
                <>
                  {ultimo.reporto}
                  {ultimo.reportadoEn ? <span className="block text-xs text-muted-foreground">{diaCorto(ultimo.reportadoEn)}</span> : null}
                </>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </td>
            <td className={celda}>
              {usan.length > 0 ? (
                <ul className="flex list-none flex-wrap gap-x-2 gap-y-1">
                  {usan.map((i, k) => (
                    <li key={i.id}>
                      <Link href={rutaDeIndicador(i.codigo)} title={i.nombre} className={`font-mono text-xs ${ENLACE}`}>
                        {i.codigo}
                      </Link>
                      {k < usan.length - 1 ? "," : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </td>
            <td className={celda}>
              <Estado resumen={resumen} ahora={ahora} />
            </td>
          </tr>
        );
      })}
    </TablaDatos>
  );
}
