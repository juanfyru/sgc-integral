import Link from "next/link";
import { Insignia } from "@/componentes/ui/Insignia";
import { celda, celdaNumerica, TablaDatos, type ColumnaTabla } from "@/componentes/ui/TablaDatos";
import type { FilaDelAnio } from "@/db/consultas/indicadores/mediciones";
import { ETIQUETA_ESTADO } from "@/lib/indicadores/estados";
import { ETIQUETA_SEMAFORO } from "@/lib/indicadores/tipos";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";
const ENLACE = `rounded-sm text-marca underline-offset-2 hover:underline ${FOCO}`;

function Estado({ f }: { f: FilaDelAnio }) {
  const marcas = [
    f.historica ? "Registro histórico" : null,
    f.requiereAccion ? "Requiere acción de mejora" : null,
    f.repetido ? "Incumplimiento repetido" : null,
    f.corregida ? "Corregida" : null,
    f.metaTardia ? "Meta ajustada después del periodo" : null,
    f.sinAnalisis ? "Cerrada sin análisis" : null,
  ].filter((m): m is string => m !== null);
  const estado = f.estado === "por_venir" || f.estado === "sin_dato" ? null : `${ETIQUETA_ESTADO[f.estado]}${f.vencida ? " · vencida" : ""}`;
  return (
    <div className="flex flex-col items-start gap-1">
      {f.semaforo ? (
        <Insignia variante={f.semaforo}>{ETIQUETA_SEMAFORO[f.semaforo]}</Insignia>
      ) : f.noAplica ? (
        <Insignia variante="sin-dato">No aplica</Insignia>
      ) : f.resultado ? (
        <Insignia variante="sin-dato">Sin meta</Insignia>
      ) : (
        <Insignia variante="sin-dato">Sin dato</Insignia>
      )}
      {estado ? <span className="text-xs text-muted-foreground">{estado}</span> : null}
      {marcas.map((m) => (
        <Insignia key={m} variante="neutra">
          {m}
        </Insignia>
      ))}
    </div>
  );
}

function Analisis({ f }: { f: FilaDelAnio }) {
  if (f.noAplica) return <span className="break-words">{f.motivo ? `No aplica: ${f.motivo}` : "No aplica"}</span>;
  if (f.causa || f.accionPropuesta) {
    return (
      <span className="break-words">
        {f.causa ? (
          <>
            <b>Causa:</b> {f.causa}{" "}
          </>
        ) : null}
        {f.accionPropuesta ? (
          <>
            <b>Acción propuesta:</b> {f.accionPropuesta}
          </>
        ) : null}
      </span>
    );
  }
  if (f.analisis) return <span className="break-words">{f.analisis}</span>;
  return <span className="text-muted-foreground">{f.cumple ? "Sin análisis (cumple)" : "—"}</span>;
}

/**
 * La tabla del año (spec §8.5, §8.3 y §12.3; maqueta 2): una fila por periodo con sus valores, el resultado, la meta, la
 * columna «Cumple», el estado con sus marcas y el análisis; sin soportes. Quien puede medir tiene en cada periodo abierto
 * el enlace para reportarlo o corregirlo (un histórico se registra en el modo edición, spec §8.8); quien puede analizar,
 * el de escribir o editar el análisis de lo que tiene resultado.
 */
export function TablaDelAnio({
  filas,
  variables,
  anio,
  codigo,
  puedeMedir,
  puedeAnalizar = false,
}: {
  filas: FilaDelAnio[];
  variables: { letra: string; nombre: string }[];
  anio: number;
  codigo: string;
  puedeMedir: boolean;
  puedeAnalizar?: boolean;
}) {
  const columnas: ColumnaTabla[] = [
    { clave: "periodo", etiqueta: "Periodo" },
    ...variables.map((v) => ({ clave: `var-${v.letra}`, etiqueta: v.nombre, numerica: true })),
    { clave: "resultado", etiqueta: "Resultado", numerica: true },
    { clave: "meta", etiqueta: "Meta", numerica: true },
    { clave: "cumple", etiqueta: "Cumple" },
    { clave: "estado", etiqueta: "Estado" },
    { clave: "analisis", etiqueta: "Análisis" },
    ...(puedeMedir || puedeAnalizar ? [{ clave: "acciones", etiqueta: "Acciones", oculta: true }] : []),
  ];
  return (
    <TablaDatos titulo={`Resultados de ${anio}`} columnas={columnas} filas={filas.length} vacio={`No hay periodos que medir en ${anio}.`}>
      {filas.map((f) => {
        const cabecera = (
          <th scope="row" className={`${celda} text-left font-medium`}>
            {f.etiqueta}
            {f.vence && f.estado !== "cerrada" && f.estado !== "reportada" && !f.historica ? (
              <span className="block text-xs font-normal text-muted-foreground">{`Plazo hasta el ${f.vence}`}</span>
            ) : null}
          </th>
        );
        if (f.estado === "por_venir" || f.estado === "sin_dato") {
          return (
            <tr key={f.periodo}>
              {cabecera}
              <td colSpan={columnas.length - 1} className={`${celda} text-muted-foreground`}>
                {f.estado === "por_venir" ? "Por venir: el periodo no ha terminado." : "Sin dato: no se midió."}
              </td>
            </tr>
          );
        }
        const reportable = puedeMedir && f.medicionId !== null && f.estado !== "cerrada" && !f.historica;
        const analizable = puedeAnalizar && f.medicionId !== null && f.estado !== "cerrada" && f.resultado !== null && !f.noAplica;
        const conAnalisis = f.analisis !== null || f.causa !== null || f.accionPropuesta !== null;
        return (
          <tr key={f.periodo}>
            {cabecera}
            {variables.map((v) => (
              <td key={v.letra} className={celdaNumerica}>
                {f.valores.find((x) => x.letra === v.letra)?.valor ?? "—"}
              </td>
            ))}
            <td className={celdaNumerica}>{f.resultado ?? (f.noAplica ? "n. a." : "—")}</td>
            <td className={celdaNumerica}>{f.meta}</td>
            <td className={celda}>{f.cumple === null ? "—" : f.cumple ? "Sí" : "No"}</td>
            <td className={celda}>
              <Estado f={f} />
            </td>
            <td className={`${celda} min-w-48`}>
              <Analisis f={f} />
            </td>
            {puedeMedir || puedeAnalizar ? (
              <td className={celda}>
                <div className="flex flex-col items-start gap-1">
                  {reportable ? (
                    <Link href={`/indicadores/${encodeURIComponent(codigo)}/reportar/${f.periodo}`} className={ENLACE}>
                      {f.estado === "por_reportar" ? "Reportar" : "Corregir"}
                      <span className="sr-only">{` ${f.etiqueta}`}</span>
                    </Link>
                  ) : null}
                  {analizable ? (
                    <Link href={`/indicadores/${encodeURIComponent(codigo)}?vista=resultados&anio=${anio}&analizar=${f.periodo}#analisis`} className={ENLACE}>
                      {conAnalisis ? "Editar el análisis" : "Analizar"}
                      <span className="sr-only">{` ${f.etiqueta}`}</span>
                    </Link>
                  ) : null}
                </div>
              </td>
            ) : null}
          </tr>
        );
      })}
    </TablaDatos>
  );
}
