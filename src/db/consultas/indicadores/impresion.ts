/**
 * Lo que la ficha impresa y el Excel de un indicador leen de él (spec §7.8 y §13): la ficha de la versión que regía el
 * año elegido con sus firmas, su control de cambios hasta ella, los datos de operación y los resultados del año. Solo lee,
 * salvo abrir los periodos terminados (`asegurarMediciones`), como la página del indicador.
 */
import { obtenerSql } from "@/db/cliente";
import type { SujetoVisibilidad } from "@/lib/alcance";
import { versionQueRigeEntre } from "@/lib/indicadores/periodos";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { fichaDeVersion, versionesDe, type FichaLeida, type OperacionLeida, type VersionResumen } from "./aprobacion";
import { anioValido, obtenerIndicador, periodosDelAnio, resultadosDelAnio, type Opciones, type ResultadosDelAnio } from "./lectura";
import { obtenerParametros } from "./maestros";
import { asegurarMediciones, versionesAprobadas, type VersionDeCalculo } from "./mediciones";

export type ImpresionDelAnio = {
  /** El indicador. */
  indicadorId: number;
  codigo: string;
  anio: number;
  /**
   * La ficha de la versión que rige el último periodo ya empezado del año (spec §3.9: «con la versión de ficha que
   * regía»); en el año en curso, la que rige hoy. Su encabezado, su contenido y sus firmas.
   */
  ficha: FichaLeida;
  operacion: OperacionLeida;
  /** El control de cambios hasta esa versión, de la más reciente a la primera. */
  versiones: VersionResumen[];
  /** Las filas del año (con la versión de cada una), su acumulado y la serie de la gráfica del año. */
  resultados: ResultadosDelAnio;
  /** El parámetro de «N periodos sin cumplir», para la marca. */
  periodosSinCumplir: number;
};

/** La versión que rige el último periodo de `anio` que ya empezó; `null` si ninguno ha empezado. */
function versionDelAnio(versiones: readonly VersionDeCalculo[], inicio: string, anio: number, ahora: Date, zona: string): VersionDeCalculo | null {
  const empezados = periodosDelAnio(versiones, inicio, anio, zona).filter((p) => p.desde.getTime() <= ahora.getTime());
  const ultimo = empezados.reduce<(typeof empezados)[number] | null>((u, p) => (u === null || p.desde.getTime() > u.desde.getTime() ? p : u), null);
  return ultimo ? versionQueRigeEntre(versiones, ultimo, zona) : null;
}

/**
 * La ficha impresa (o el Excel) de un indicador en `anio`, para quien lo ve y tiene ficha aprobada; `null` si no (quien
 * no lo ve recibe «no encontrado», spec §6.4) o si el año no se puede pedir: va del año del inicio de medición (si ya
 * llegó) al en curso, la misma regla de la página. Antes de leer abre los periodos terminados. Sin soportes ni
 * observaciones.
 */
export async function impresionDelAnio(
  sesion: SujetoVisibilidad,
  codigo: string,
  anio: number,
  opciones?: Opciones,
): Promise<ImpresionDelAnio | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const zona = zonaHoraria();
  const vista = await obtenerIndicador(sesion, codigo, { sql, ahora });
  if (!vista) return null;
  const enCurso = Number(fechaEnZona(ahora, zona).slice(0, 4));
  const primerAnio = Math.min(Number(vista.operacion.inicioMedicion.slice(0, 4)) || enCurso, enCurso);
  if (!anioValido(anio) || anio < primerAnio || anio > enCurso) return null;

  await asegurarMediciones({ sql, ahora, indicadorId: vista.id });
  const [versiones, resultados, resumen, parametros] = await Promise.all([
    versionesAprobadas(sql, vista.id),
    resultadosDelAnio(sesion, vista.id, anio, { sql, ahora }),
    versionesDe(vista.id, { sql }),
    obtenerParametros({ sql }),
  ]);
  const rige = versionDelAnio(versiones, vista.operacion.inicioMedicion, anio, ahora, zona);
  const ficha = rige && rige.id !== vista.ficha.versionId ? await fichaDeVersion(sesion, rige.id, { sql }) : vista.ficha;
  if (!ficha) return null;
  return {
    indicadorId: vista.id,
    codigo: vista.codigo,
    anio,
    ficha,
    operacion: vista.operacion,
    versiones: resumen.filter((v) => v.numero <= ficha.numero),
    resultados,
    periodosSinCumplir: parametros.incumplimientoPeriodos,
  };
}
