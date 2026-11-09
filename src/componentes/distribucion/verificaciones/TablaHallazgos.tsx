import Link from "next/link";
import { TablaDatos, celda, type ColumnaTabla } from "@/componentes/ui/TablaDatos";
import type { Hallazgo } from "@/db/consultas/distribucion/hallazgos";
import { comoSeCerro, enlaceDeHallazgo } from "@/lib/distribucion/hallazgos";
import { textoFecha } from "@/lib/vigencia/plazo";
import { zonaHoraria } from "@/lib/zona-horaria";
import { fechaConAnio } from "./fecha";
import { InsigniaHallazgo } from "./ListaHallazgos";

const COLUMNAS: readonly ColumnaTabla[] = [
  { clave: "punto", etiqueta: "Punto de uso" },
  { clave: "hallazgo", etiqueta: "Hallazgo" },
  { clave: "responsable", etiqueta: "Responsable" },
  { clave: "estado", etiqueta: "Estado" },
  { clave: "vence", etiqueta: "Vence / cierre" },
];

function enlaceDe(h: Hallazgo): string | null {
  if (h.origen !== "verificacion" && !h.copia) return null;
  return enlaceDeHallazgo({ origen: h.origen, verificacionId: h.verificacionId, copiaId: h.copia?.id ?? null });
}

/**
 * Cómo terminó el hallazgo, en una línea: quien valida no firma la nota de quien corrigió (va aparte, como
 * «Corrección de…»); en un cierre directo, la nota es la de quien cerró.
 */
function lineasDeCierre(h: Hallazgo): string[] {
  const como = comoSeCerro(h);
  const correccion = h.correccion ? `Corrección de ${h.correccion.por}: ${h.correccion.nota}` : null;
  if (!h.cierre || !como) return h.correccion ? [`Corregido por ${h.correccion.por}: ${h.correccion.nota}`] : [];
  if (como === "verificacion") {
    return [`Validado por la verificación del ${textoFecha(h.cierre.en, zonaHoraria())}`, ...(correccion ? [correccion] : [])];
  }
  if (como === "validado") return [`Validado por ${h.cierre.por}`, ...(correccion ? [correccion] : [])];
  if (como === "propio_corrector") return [`Cerrado por quien lo corrigió (único Administrador del SGC activo): ${h.cierre.nota}`];
  return [`Cerrado por ${h.cierre.por}: ${h.cierre.nota}`];
}

/** Los hallazgos abiertos primero, luego los que esperan validación y los cerrados con su cierre. */
export function TablaHallazgos({ hallazgos, ahora }: { hallazgos: Hallazgo[]; ahora: Date }) {
  return (
    <section aria-labelledby="hallazgos-verificaciones" className="flex flex-col gap-3">
      <h2 id="hallazgos-verificaciones" className="text-sm font-semibold">
        Hallazgos
      </h2>
      <TablaDatos titulo="Hallazgos de verificación" columnas={COLUMNAS} filas={hallazgos.length} vacio="No hay hallazgos.">
        {hallazgos.map((h) => {
          const enlace = enlaceDe(h);
          const vencido = h.estado === "abierto" && h.venceEn < ahora;
          return (
            <tr key={h.id}>
              <td className={celda}>{h.punto.nombre}</td>
              <td className={celda}>
                {enlace ? (
                  <Link href={enlace} className="rounded hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca">
                    {h.descripcion}
                  </Link>
                ) : (
                  h.descripcion
                )}
                {lineasDeCierre(h).map((linea) => (
                  <div key={linea} className="text-xs text-muted-foreground">
                    {linea}
                  </div>
                ))}
              </td>
              <td className={celda}>{h.responsable.nombre}</td>
              <td className={celda}>
                <InsigniaHallazgo estado={h.estado} vencido={vencido} />
              </td>
              <td className={celda}>{fechaConAnio(h.cierre ? h.cierre.en : h.venceEn)}</td>
            </tr>
          );
        })}
      </TablaDatos>
    </section>
  );
}
