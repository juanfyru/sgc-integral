import { Insignia, type VarianteInsignia } from "@/componentes/ui/Insignia";
import { celda, TablaDatos } from "@/componentes/ui/TablaDatos";
import { etiquetaDePeriodo, type VersionResumen } from "@/db/consultas/indicadores/aprobacion";
import type { TipoCambio } from "@/lib/indicadores/tipos";
import { fechaYHora } from "@/lib/indicadores/ficha-en-texto";

const TIPO: Record<TipoCambio, { etiqueta: string; variante: VarianteInsignia }> = {
  inicial: { etiqueta: "Inicial", variante: "neutra" },
  mayor: { etiqueta: "Mayor", variante: "atencion" },
  menor: { etiqueta: "Menor", variante: "neutra" },
};

const COLUMNAS = [
  { clave: "version", etiqueta: "Versión" },
  { clave: "rige", etiqueta: "Rige desde" },
  { clave: "cambios", etiqueta: "Qué cambió y por qué" },
  { clave: "elaboro", etiqueta: "Elaboró" },
  { clave: "aprobo", etiqueta: "Aprobó" },
];

function Quien({ nombre, fecha }: { nombre: string | null; fecha: Date | null }) {
  if (!nombre) return <span className="text-muted-foreground">(sin firma)</span>;
  return (
    <>
      <span className="block">{nombre}</span>
      {fecha ? <span className="block text-xs text-muted-foreground">{fechaYHora(fecha)}</span> : null}
    </>
  );
}

/**
 * El control de cambios (spec §7.6.6): por versión aprobada, desde cuándo rige, si fue inicial, mayor o menor, qué
 * campos cambiaron (la lista la genera el sistema), por qué, y quién elaboró y quién aprobó, con sus fechas.
 */
export function ControlDeCambios({ versiones, vigente }: { versiones: VersionResumen[]; vigente: number | null }) {
  return (
    <TablaDatos titulo="Control de cambios" columnas={COLUMNAS} filas={versiones.length} vacio="La ficha aún no tiene versiones aprobadas.">
      {versiones.map((v) => (
        <tr key={v.id}>
          <td className={`${celda} whitespace-nowrap`}>
            <span className="flex flex-wrap items-center gap-1">
              <span className="font-medium">{`Versión ${v.numero}`}</span>
              <Insignia variante={TIPO[v.tipoCambio].variante}>{TIPO[v.tipoCambio].etiqueta}</Insignia>
              {v.id === vigente ? <Insignia variante="bien">Vigente</Insignia> : null}
            </span>
          </td>
          <td className={celda}>{etiquetaDePeriodo(v.rigeDesde)}</td>
          <td className={celda}>
            <span className="block">{v.tipoCambio === "inicial" ? "Primera versión de la ficha" : v.cambios.join(", ")}</span>
            {v.motivo && v.tipoCambio !== "inicial" ? <span className="block text-muted-foreground">{`Motivo: ${v.motivo}`}</span> : null}
          </td>
          <td className={celda}>
            <Quien nombre={v.elaboro} fecha={v.elaboradaEn} />
          </td>
          <td className={celda}>
            {v.tipoCambio === "menor" ? (
              <span className="text-muted-foreground">No requiere: cambio menor</span>
            ) : (
              <Quien nombre={v.aprobo} fecha={v.aprobadaEn} />
            )}
          </td>
        </tr>
      ))}
    </TablaDatos>
  );
}
