import { celda, TablaDatos, type ColumnaTabla } from "@/componentes/ui/TablaDatos";
import { Insignia } from "@/componentes/ui/Insignia";
import type { VistaPrevia } from "@/db/consultas/indicadores/importacion";
import { fraccion } from "@/lib/indicadores/formula/fraccion";
import { FORMA, periodoEnPalabras } from "@/lib/indicadores/ficha-en-texto";
import { enPalabras } from "@/lib/indicadores/formula/formas";
import { esImportable } from "@/lib/indicadores/importacion/formulario";
import type { FichaImportada } from "@/lib/indicadores/importacion/revisar";
import { rangosDeTexto } from "@/lib/indicadores/rangos";
import { numeroExacto, rangosEnPalabras } from "@/lib/indicadores/semaforo";
import { ETIQUETA_PERIODICIDAD, type Consolidacion } from "@/lib/indicadores/tipos";

const COLUMNAS: readonly ColumnaTabla[] = [
  { clave: "fila", etiqueta: "Fila", numerica: true },
  { clave: "codigo", etiqueta: "Código" },
  { clave: "nombre", etiqueta: "Nombre" },
  { clave: "proceso", etiqueta: "Proceso › subproceso" },
  { clave: "formula", etiqueta: "Forma y fórmula" },
  { clave: "periodicidad", etiqueta: "Periodicidad" },
  { clave: "inicio", etiqueta: "Inicio" },
  { clave: "meta", etiqueta: "Meta", numerica: true },
  { clave: "rangos", etiqueta: "Rangos" },
  { clave: "acumulado", etiqueta: "Cómo quedará el acumulado del año" },
  { clave: "estado", etiqueta: "Estado" },
  { clave: "problemas", etiqueta: "Problemas y avisos" },
];

const FRASE_ACUMULADO: Record<Consolidacion, string> = {
  suma: "suma de los periodos",
  ultimo: "el del último periodo",
  promedio: "el promedio de los periodos",
};

const TIPO_PENDIENTE = { subproceso: "el subproceso", cargo: "el cargo", tipo: "el tipo", unidad: "la unidad" } as const;

/** El factor de una tasa con punto de miles: «× 1.000». */
const conMiles = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** La forma con su factor, si lo tiene: «Porcentaje», «Tasa (× 1.000)». */
function formaEnPalabras(f: FichaImportada): string {
  const forma = FORMA[f.forma] ?? f.forma;
  return f.forma === "tasa" && f.factor !== null ? `${forma} (× ${conMiles(f.factor)})` : forma;
}

/** La fórmula con los nombres de sus variables: «(A: Vigentes ÷ B: Listado Maestro) × 100». */
const formulaConNombres = (f: FichaImportada) =>
  enPalabras(f.formula, Object.fromEntries(f.variables.map((v) => [v.letra, `${v.letra}: ${v.nombre}`])));

/** La meta con los decimales y el sufijo de su unidad; con tope, «meta hasta …». */
function metaEnTexto(f: FichaImportada, u: { sufijo: string; decimales: number }): { meta: string; hasta: string | null } {
  if (f.meta === null) return { meta: "Sin meta", hasta: null };
  try {
    const n = (v: string) => {
      const valor = fraccion(v);
      return `${valor ? numeroExacto(valor, u.decimales) : v}${u.sufijo}`;
    };
    return { meta: n(f.meta), hasta: f.metaMax === null ? null : `meta hasta ${n(f.metaMax)}` };
  } catch {
    return { meta: f.meta, hasta: null };
  }
}

/**
 * Cómo se juntan los periodos en el acumulado del año (spec 14A §5.3): una frase si todas las variables se juntan igual;
 * si no, una por variable.
 */
export function acumuladoEnPalabras(f: FichaImportada): string {
  const frases = f.variables.map((v) => FRASE_ACUMULADO[v.consolidacion]);
  if (frases.every((x) => x === frases[0])) return frases[0] ?? "—";
  return f.variables.map((v) => `${v.letra}: ${FRASE_ACUMULADO[v.consolidacion]}`).join("; ");
}

function rangosEnLetras(f: FichaImportada, unidad: { sufijo: string; decimales: number }): string {
  if (f.meta === null) return "Sin meta: solo se vigila";
  const rangos = f.rangos ? rangosDeTexto(f.rangos) : null;
  if (!rangos) return "—";
  try {
    return (
      rangosEnPalabras(
        {
          tendencia: f.tendencia,
          meta: fraccion(f.meta),
          metaMax: f.metaMax === null ? null : fraccion(f.metaMax),
          modo: "rangos",
          umbralPct: null,
          limite: null,
          tolerancia: null,
          rangos,
        },
        unidad,
      ) ?? "—"
    );
  } catch {
    return "—";
  }
}

/** La tabla de la vista previa (spec 14A §5.3, paso 4): lo que cada fila crearía y por qué una fila no entra. */
export function TablaVistaPrevia({ vista, desactualizada = false }: { vista: VistaPrevia; desactualizada?: boolean }) {
  const { opciones } = vista;
  return (
    <>
      {desactualizada ? (
        <p role="status" className="rounded-md border border-l-4 border-border border-l-estado-atencion bg-muted px-3 py-2 text-sm">
          La vista previa no refleja los cambios del formulario: pulse Actualizar
        </p>
      ) : null}
      <TablaDatos titulo="Vista previa de la importación" columnas={COLUMNAS} filas={vista.filas.length} vacio="La plantilla no trae filas.">
      {vista.filas.map((fila) => {
        const f = fila.ficha;
        const subproceso = f?.subprocesoId == null ? null : opciones.subprocesos.find((s) => s.id === f.subprocesoId);
        const proceso = f ? (opciones.procesos.find((p) => p.id === f.procesoId)?.nombre ?? subproceso?.proceso ?? "") : "";
        const unidad = f ? (opciones.unidades.find((u) => u.id === f.unidadId) ?? { sufijo: "", decimales: 0 }) : { sufijo: "", decimales: 0 };
        const lista = esImportable(fila);
        return (
          <tr key={fila.numero}>
            <td className={`${celda} text-right tabular-nums`}>{fila.numero}</td>
            <td className={`${celda} whitespace-nowrap font-mono`}>{fila.codigo || "—"}</td>
            <td className={`${celda} min-w-48`}>{f?.nombre ?? "—"}</td>
            <td className={`${celda} min-w-40`}>{f ? (subproceso ? `${proceso} › ${subproceso.nombre}` : proceso) : "—"}</td>
            <td className={`${celda} min-w-40`}>
              {f ? (
                <>
                  <span className="block font-medium">{formaEnPalabras(f)}</span>
                  <span className="block break-words text-xs">{formulaConNombres(f)}</span>
                </>
              ) : (
                "—"
              )}
            </td>
            <td className={`${celda} whitespace-nowrap`}>{f ? ETIQUETA_PERIODICIDAD[f.periodicidad] : "—"}</td>
            <td className={`${celda} min-w-32`}>{f ? periodoEnPalabras(f.inicioMedicion) : "—"}</td>
            <td className={`${celda} text-right tabular-nums`}>
              {f ? (
                <>
                  {metaEnTexto(f, unidad).meta}
                  {metaEnTexto(f, unidad).hasta ? <span className="block text-xs text-muted-foreground">{metaEnTexto(f, unidad).hasta}</span> : null}
                </>
              ) : (
                "—"
              )}
            </td>
            <td className={`${celda} min-w-64`}>{f ? rangosEnLetras(f, unidad) : "—"}</td>
            <td className={`${celda} min-w-40`}>{f ? acumuladoEnPalabras(f) : "—"}</td>
            <td className={`${celda} whitespace-nowrap`}>
              <div className="flex flex-col items-start gap-1">
                <Insignia variante={lista ? "bien" : fila.problemas.length > 0 ? "critico" : "atencion"}>
                  {lista ? "Lista" : fila.problemas.length > 0 ? "Con problemas" : "Por resolver"}
                </Insignia>
                {f ? <Insignia variante="neutra">{f.estado === "aprobado" ? "Aprobado" : "Propuesto"}</Insignia> : null}
              </div>
            </td>
            <td className={`${celda} min-w-56`}>
              {fila.problemas.length === 0 && fila.avisos.length === 0 && fila.pendientes.length === 0 ? (
                "—"
              ) : (
                <ul className="flex list-none flex-col gap-1">
                  {fila.problemas.map((p) => (
                    <li key={p} className="text-estado-critico-texto">{`Problema: ${p}`}</li>
                  ))}
                  {fila.pendientes.map((p) => (
                    <li key={`${p.tipo}:${p.texto}`}>{`Falta elegir ${TIPO_PENDIENTE[p.tipo]} de «${p.texto}»`}</li>
                  ))}
                  {fila.avisos.map((a) => (
                    <li key={a} className="text-estado-atencion-texto">{`Aviso: ${a}`}</li>
                  ))}
                </ul>
              )}
            </td>
          </tr>
        );
      })}
      </TablaDatos>
    </>
  );
}
