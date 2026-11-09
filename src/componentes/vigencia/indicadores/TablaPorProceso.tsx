import { Insignia } from "@/componentes/ui/Insignia";
import { TablaDatos, celda, celdaNumerica, type ColumnaTabla } from "@/componentes/ui/TablaDatos";
import type { ResultadoIndicadores } from "@/lib/indicadores-documentales/metas";
import { estadoDeCumple, textoCumple, textoPorcentaje } from "@/lib/indicadores-documentales/textos";

type Fila = ResultadoIndicadores["dentroPorProceso"][number];

const TITULO = "Dentro del plazo, por proceso";

const COLUMNAS: readonly ColumnaTabla[] = [
  { clave: "proceso", etiqueta: "Proceso" },
  { clave: "vigentes", etiqueta: "Vigentes", numerica: true },
  { clave: "dentro", etiqueta: "Dentro del plazo", numerica: true },
  { clave: "sin-fecha", etiqueta: "Sin fecha de revisión", numerica: true },
  { clave: "porcentaje", etiqueta: "Porcentaje" },
];

/**
 * «79 % · no cumple» frente a la meta de documentos dentro del plazo: el cumplimiento con texto, no solo con color, y la
 * cifra que no contradice el veredicto (18 de 19 frente a 95 es «94,7 %»). La píldora no se parte en dos renglones.
 */
function Porcentaje({ fila, meta }: { fila: Fila; meta: number }) {
  const cifra = { valor: fila.valor, numerador: fila.alDia, denominador: fila.vigentes - fila.sinFecha, cumple: fila.cumple };
  const texto = fila.valor === null ? textoCumple(null) : `${textoPorcentaje("dentro_plazo", cifra, meta)} · ${textoCumple(fila.cumple)}`;
  return (
    <Insignia variante={estadoDeCumple(fila.cumple)}>
      <span className="whitespace-nowrap">{texto}</span>
    </Insignia>
  );
}

/**
 * Los vigentes de cada proceso dentro de su plazo de revisión (spec 13C §11.4): tabla en pantallas anchas y tarjetas en
 * el celular. Los que no tienen fecha de revisión no entran al porcentaje y se cuentan aparte.
 */
export function TablaPorProceso({ filas, meta }: { filas: Fila[]; meta: number }) {
  return (
    <section aria-labelledby="titulo-dentro-proceso" className="flex min-w-0 flex-col gap-3">
      <h2 id="titulo-dentro-proceso" className="text-sm font-semibold">
        {TITULO}
      </h2>
      <div className="hidden md:block">
        <TablaDatos titulo={TITULO} columnas={COLUMNAS} filas={filas.length} vacio="No hay documentos vigentes en su alcance">
          {filas.map((f) => (
            <tr key={f.procesoId}>
              <td className={celda}>{`${f.sigla} · ${f.proceso}`}</td>
              <td className={celdaNumerica}>{f.vigentes}</td>
              <td className={celdaNumerica}>{f.alDia}</td>
              <td className={celdaNumerica}>{f.sinFecha}</td>
              <td className={celda}>
                <Porcentaje fila={f} meta={meta} />
              </td>
            </tr>
          ))}
        </TablaDatos>
      </div>
      <ul className="flex list-none flex-col gap-3 md:hidden" aria-label={TITULO}>
        {filas.length === 0 ? <li className="text-sm text-muted-foreground">No hay documentos vigentes en su alcance</li> : null}
        {filas.map((f) => (
          <li key={f.procesoId} className="min-w-0 rounded-lg border border-border bg-card p-3 text-sm">
            {/* La insignia va siempre en su renglón, bajo el nombre, quepa o no a su lado. */}
            <div className="flex flex-col items-start gap-1">
              <span className="min-w-0 break-words font-medium">{`${f.sigla} · ${f.proceso}`}</span>
              <Porcentaje fila={f} meta={meta} />
            </div>
            <p className="mt-1 text-muted-foreground">
              {`${f.alDia} de ${f.vigentes - f.sinFecha} dentro del plazo${f.sinFecha > 0 ? ` · ${f.sinFecha} sin fecha de revisión` : ""}`}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
