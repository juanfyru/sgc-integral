/**
 * Los hallazgos que citan lo que muestra otra página (Fase 15B, anexo §10.1, §10.2 y §10.5; maqueta 8): un documento, un proceso, un
 * subproceso, un indicador o una norma; y cuántos sin terminar apuntan a cada objetivo («Objetivos» de Indicadores). **Solo los que la
 * persona ve** (`filtroHallazgos`, tal cual: también los que ve por una actividad suya): a quien no ve ninguno no le llega ni una fila,
 * ni un conteo, ni un cero. La misma condición (`citaDe`) filtra la lista de Mejoramiento a la que lleva «Ver todos»
 * (`listarHallazgos`), así la sección y la lista dicen lo mismo. El botón de la sección: «Abrir hallazgo» si la persona puede registrar
 * en el proceso propuesto (`puedeRegistrarEn`, la regla del registro), «Reportar» si no; en la norma, ninguno.
 *
 * Liviano: no importa `lectura.ts` (que lo importa para sus filtros) ni nada que escriba. Las consultas de Indicadores no lo importan:
 * lo llaman las páginas.
 */
import { obtenerSql, type Cliente } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { alcanceProcesos, filtroHallazgos, procesosQueImprime } from "@/lib/alcance";
import { yaSePuedeEvaluar } from "@/lib/mejoramiento/eficacia";
import { etiquetaDeEstado } from "@/lib/mejoramiento/estados";
import { rutaDeListaFiltrada, TODOS_LOS_ESTADOS } from "@/lib/mejoramiento/filtro";
import { rutaDeReportarSobre } from "@/lib/mejoramiento/reportes";
import { rutaDelConsolidado, rutaDeRegistro } from "@/lib/mejoramiento/rutas";
import { TERMINALES, type EstadoHallazgo, type ResultadoCierre } from "@/lib/mejoramiento/tipos";
import { puede } from "@/lib/permisos";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { procesoAdmiteRegistro } from "./donde-registra";
import { fechasMinimasDe } from "./espera";

/** Lo que muestra la página que lleva la sección. */
export type Cita = { documentoId: number } | { procesoId: number } | { subprocesoId: number } | { indicadorId: number } | { normaId: number };

/** Cuántos trae la sección; si hay más, «Ver todos» lleva a la lista filtrada. */
export const MAXIMO_DE_CITAS = 10;

/** Cómo cita el hallazgo lo que muestra la página (anexo §10.1). */
export const SE_REFIERE_AL_DOCUMENTO = "Se refiere a este documento";
export const SE_REFIERE_AL_INDICADOR = "Se refiere a este indicador";
export const COMO_REQUISITO = "Lo cita como requisito incumplido";
export const COMO_CRITERIO_DE_EFICACIA = "Lo usa como criterio de eficacia";
export const CITA_UNA_MEDICION = "Cita una de sus mediciones";
export const ES_DEL_PROCESO = "Es de este proceso";
export const ES_DEL_SUBPROCESO = "Es de este subproceso";

const COMO: Record<string, string> = {
  documento: SE_REFIERE_AL_DOCUMENTO,
  indicador: SE_REFIERE_AL_INDICADOR,
  requisito: COMO_REQUISITO,
  eficacia: COMO_CRITERIO_DE_EFICACIA,
  medicion: CITA_UNA_MEDICION,
  proceso: ES_DEL_PROCESO,
  subproceso: ES_DEL_SUBPROCESO,
};

/** El id de lo citado, sea cual sea su clase. */
const idDe = (que: Cita): number =>
  "documentoId" in que ? que.documentoId
  : "procesoId" in que ? que.procesoId
  : "subprocesoId" in que ? que.subprocesoId
  : "indicadorId" in que ? que.indicadorId
  : que.normaId;

const esId = (n: number) => Number.isSafeInteger(n) && n > 0;

/** La medición del hallazgo es una del indicador. */
const porMedicion = (sql: Cliente, id: number) =>
  sql`EXISTS (SELECT 1 FROM mediciones ct_m WHERE ct_m.id = h.medicion_id AND ct_m.indicador_id = ${id})`;
/** Alguna ronda del hallazgo usa el indicador como criterio de eficacia (la de `citadoEnMejoramiento`). */
const porEficacia = (sql: Cliente, id: number) =>
  sql`EXISTS (SELECT 1 FROM mejora_rondas ct_r WHERE ct_r.hallazgo_id = h.id AND ct_r.indicador_eficacia_id = ${id})`;

/**
 * Que el hallazgo `h` cite lo de la página, para un `WHERE` sobre `mejora_hallazgos h`: un documento, como «a qué se refiere» o como
 * requisito incumplido; un proceso o un subproceso, los suyos; un indicador, como «a qué se refiere», por una de sus mediciones o como
 * criterio de eficacia de una ronda; una norma, como requisito incumplido. Sin la visibilidad: la pone quien llama.
 */
export function citaDe(sql: Cliente, que: Cita) {
  if ("documentoId" in que) return sql`(h.documento_id = ${que.documentoId} OR h.requisito_documento_id = ${que.documentoId})`;
  if ("procesoId" in que) return sql`h.proceso_id = ${que.procesoId}`;
  if ("subprocesoId" in que) return sql`h.subproceso_id = ${que.subprocesoId}`;
  if ("normaId" in que) return sql`h.requisito_norma_id = ${que.normaId}`;
  const id = que.indicadorId;
  return sql`(h.indicador_id = ${id} OR ${porMedicion(sql, id)} OR ${porEficacia(sql, id)})`;
}

/**
 * Cómo lo cita, si lo cita de más de una manera: en un documento, como requisito antes que «se refiere»; en un indicador, por su
 * medición (la más precisa), después como «a qué se refiere» y al final como criterio de eficacia.
 */
function comoDe(sql: Cliente, que: Cita) {
  if ("documentoId" in que) return sql`CASE WHEN h.requisito_documento_id = ${que.documentoId} THEN 'requisito' ELSE 'documento' END`;
  if ("procesoId" in que) return sql`'proceso'`;
  if ("subprocesoId" in que) return sql`'subproceso'`;
  if ("normaId" in que) return sql`'requisito'`;
  const id = que.indicadorId;
  return sql`CASE WHEN ${porMedicion(sql, id)} THEN 'medicion' WHEN h.indicador_id = ${id} THEN 'indicador' ELSE 'eficacia' END`;
}

/** Un hallazgo de la sección: su estado guardado y cómo lo dice la lista (`etiqueta`), si terminó y cómo cita lo de la página. */
export type HallazgoQueCita = {
  id: number;
  codigo: string;
  titulo: string;
  estado: EstadoHallazgo;
  etiqueta: string;
  terminado: boolean;
  como: string;
};

/**
 * Los hallazgos que la persona ve y citan lo de la página (anexo §10.1): hasta `MAXIMO_DE_CITAS`, los no terminados primero y, en
 * cada grupo, del más reciente al más antiguo; `hayMas` si hay otros que también ve. Quien no ve ninguno recibe `filas: []` y
 * `hayMas: false`, haya los que haya. La etiqueta es la de la lista («Por evaluar la eficacia» desde la fecha mínima, con `ahora`).
 */
export async function hallazgosQueCitan(
  sesion: SesionFlujo,
  que: Cita,
  opciones?: { sql?: Cliente; ahora?: Date },
): Promise<{ filas: HallazgoQueCita[]; hayMas: boolean }> {
  if (!esId(idDe(que))) return { filas: [], hayMas: false };
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const filas = await sql`SELECT h.id, h.codigo, h.titulo, h.estado, h.resultado_cierre, h.correccion_requerida,
      h.estado IN ${sql([...TERMINALES])} AS terminado, ${comoDe(sql, que)} AS como
    FROM mejora_hallazgos h
    WHERE ${filtroHallazgos(sql, sesion)} AND ${citaDe(sql, que)}
    ORDER BY terminado, h.id DESC
    LIMIT ${MAXIMO_DE_CITAS + 1}`;
  const mostradas = filas.slice(0, MAXIMO_DE_CITAS);
  const zona = zonaHoraria();
  const minimas = await fechasMinimasDe(
    sql,
    mostradas.filter((f) => f.estado === "en_espera").map((f) => Number(f.id)),
    zona,
  );
  return {
    filas: mostradas.map((f) => {
      const minima = minimas.get(Number(f.id));
      return {
        id: Number(f.id),
        codigo: f.codigo as string,
        titulo: f.titulo as string,
        estado: f.estado as EstadoHallazgo,
        etiqueta: etiquetaDeEstado(
          {
            estado: f.estado as EstadoHallazgo,
            resultadoCierre: (f.resultado_cierre as ResultadoCierre | null) ?? null,
            correccionRequerida: (f.correccion_requerida as boolean | null) ?? null,
          },
          { yaSePuedeEvaluar: minima !== undefined && yaSePuedeEvaluar(minima.minima, ahora, zona) },
        ),
        terminado: f.terminado === true,
        como: COMO[f.como as string],
      };
    }),
    hayMas: filas.length > MAXIMO_DE_CITAS,
  };
}

/**
 * Si la persona puede registrar un hallazgo en ese proceso (anexo §10.2): con `mejora.registrar` (el permiso va primero:
 * `alcanceProcesos` le da todos a Consulta y a Gerencia) y con la regla única de dónde se registra (`procesoAdmiteRegistro`, de
 * `donde-registra.ts`: la que aplica el registro mismo). El Admin SGC y Control Interno, en cualquier proceso activo; el líder, en los
 * suyos; Consulta y Gerencia, en ninguno.
 */
export async function puedeRegistrarEn(sql: Cliente, sesion: SesionFlujo, procesoId: number): Promise<boolean> {
  if (!puede(sesion, "mejora.registrar")) return false;
  return procesoAdmiteRegistro(sql, await alcanceProcesos(sesion, { sql }), procesoId);
}

/**
 * Cuántos hallazgos sin terminar, que la persona ve, apuntan a cada objetivo (anexo §10.5). Un objetivo sin ninguno que la persona vea
 * no está en el mapa: la página no dice nada de él, ni un cero.
 */
export async function abiertosPorObjetivo(sesion: SesionFlujo, opciones?: { sql?: Cliente }): Promise<Map<number, number>> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`SELECT c.objetivo_id, count(*)::int AS n
    FROM mejora_clasificacion c
    JOIN mejora_hallazgos h ON h.id = c.hallazgo_id
    WHERE c.objetivo_id IS NOT NULL AND h.estado NOT IN ${sql([...TERMINALES])} AND ${filtroHallazgos(sql, sesion)}
    GROUP BY c.objetivo_id`;
  return new Map(filas.map((f) => [Number(f.objetivo_id), Number(f.n)]));
}

/**
 * «SGC-FO-14 del proceso» de la sección (anexo §10.1, la fila «un proceso (o un subproceso)»): el consolidado del proceso en el año en
 * curso (en la zona de la instalación, con el `ahora` de quien llama), solo a quien lo imprime (anexo §5.5, `procesosQueImprime`:
 * `mejora.ver_todo` o líder de ese proceso). Nulo para los demás. Lo usan la página del proceso y la de sus subprocesos.
 */
export async function consolidadoDelProceso(
  sesion: SesionFlujo,
  procesoId: number,
  opciones?: { sql?: Cliente; ahora?: Date },
): Promise<string | null> {
  const imprime = await procesosQueImprime(sesion, [procesoId], { sql: opciones?.sql });
  if (imprime.length === 0) return null;
  return rutaDelConsolidado(procesoId, Number(fechaEnZona(opciones?.ahora ?? new Date(), zonaHoraria()).slice(0, 4)));
}

// ─────────────────────────────────────────────────────────────────────────────
// La sección de cada página
// ─────────────────────────────────────────────────────────────────────────────

/** Con qué llegan «Abrir hallazgo» y «Reportar»: el código del documento o del indicador, o el slug del proceso. */
export type EnlaceDeLaSeccion = { documento: string } | { indicador: string } | { proceso: string };

export type BotonDeLaSeccion = { texto: "Abrir hallazgo" | "Reportar"; href: string };

/** Lo que pinta `SeccionMejoramiento`. */
export type SeccionDeCitas = { filas: HallazgoQueCita[]; hayMas: boolean; verTodos: string; boton: BotonDeLaSeccion | null };

/**
 * «Ver todos»: la lista de Mejoramiento filtrada con la misma condición de la sección (`citaDe`) y en cualquier estado: la sección
 * lista también los terminados, después de los abiertos, y la lista por omisión solo muestra los abiertos (anexo §11.1).
 */
function verTodosDe(que: Cita): string {
  const todos = { estado: TODOS_LOS_ESTADOS } as const;
  if ("documentoId" in que) return rutaDeListaFiltrada({ documento: que.documentoId, ...todos });
  if ("procesoId" in que) return rutaDeListaFiltrada({ procesoId: que.procesoId, ...todos });
  if ("subprocesoId" in que) return rutaDeListaFiltrada({ subproceso: que.subprocesoId, ...todos });
  if ("indicadorId" in que) return rutaDeListaFiltrada({ indicador: que.indicadorId, ...todos });
  return rutaDeListaFiltrada({ norma: que.normaId, ...todos });
}

/**
 * La sección «Mejoramiento» de una página (anexo §10.1 y §10.2): los hallazgos que la persona ve y citan lo de la página, «Ver todos»
 * y el botón. Con `propuesta` (todas salvo la norma), «Abrir hallazgo» hacia el registro con el enlace puesto si la persona puede
 * registrar en el proceso propuesto (`puedeRegistrarEn`) y, si no, «Reportar» con el mismo enlace. Sin proceso propuesto (un documento
 * sin proceso propietario), «Abrir hallazgo» a quien registra: el formulario le pide el proceso entre los suyos.
 */
export async function seccionDeMejoramiento(
  sesion: SesionFlujo,
  que: Cita,
  propuesta: { procesoId: number | null; enlace: EnlaceDeLaSeccion } | null,
  opciones?: { sql?: Cliente; ahora?: Date },
): Promise<SeccionDeCitas> {
  const sql = opciones?.sql ?? obtenerSql();
  const { filas, hayMas } = await hallazgosQueCitan(sesion, que, { sql, ahora: opciones?.ahora });
  let boton: BotonDeLaSeccion | null = null;
  if (propuesta) {
    const registra =
      propuesta.procesoId === null ? puede(sesion, "mejora.registrar") : await puedeRegistrarEn(sql, sesion, propuesta.procesoId);
    boton = registra
      ? { texto: "Abrir hallazgo", href: rutaDeRegistro(propuesta.enlace) }
      : { texto: "Reportar", href: rutaDeReportarSobre(propuesta.enlace) };
  }
  return { filas, hayMas, verTodos: verTodosDe(que), boton };
}
