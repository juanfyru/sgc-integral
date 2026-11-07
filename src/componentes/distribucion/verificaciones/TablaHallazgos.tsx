import Link from "next/link";
import { Insignia } from "@/componentes/ui/Insignia";
import { TablaDatos, celda, type ColumnaTabla } from "@/componentes/ui/TablaDatos";
import type { Hallazgo } from "@/db/consultas/distribucion/hallazgos";
import { fechaConAnio } from "./fecha";

const COLUMNAS: readonly ColumnaTabla[] = [
  { clave: "punto", etiqueta: "Punto de uso" },
  { clave: "hallazgo", etiqueta: "Hallazgo" },
  { clave: "responsable", etiqueta: "Responsable" },
  { clave: "estado", etiqueta: "Estado" },
  { clave: "vence", etiqueta: "Vence / cierre" },
];

function enlaceDe(h: Hallazgo): string | null {
  if (h.origen === "verificacion" && h.verificacionId !== null) return `/distribucion/verificaciones/${h.verificacionId}`;
  return h.copia ? `/distribucion/copias/${h.copia.id}` : null;
}

/** Los hallazgos abiertos primero, luego los cerrados con su cierre. */
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
                {h.cierre ? <div className="text-xs text-muted-foreground">{`Cerrado por ${h.cierre.por}: ${h.cierre.nota}`}</div> : null}
              </td>
              <td className={celda}>{h.responsable.nombre}</td>
              <td className={celda}>
                {h.estado === "cerrado" ? (
                  <Insignia variante="bien">Cerrado</Insignia>
                ) : vencido ? (
                  <Insignia variante="critico">Abierto y vencido</Insignia>
                ) : (
                  <Insignia variante="atencion">Abierto</Insignia>
                )}
              </td>
              <td className={celda}>{fechaConAnio(h.cierre ? h.cierre.en : h.venceEn)}</td>
            </tr>
          );
        })}
      </TablaDatos>
    </section>
  );
}
