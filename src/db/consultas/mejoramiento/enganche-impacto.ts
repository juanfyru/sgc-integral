/**
 * El enganche de un impacto de norma con mejoramiento (Fase 15B, anexo §8): desde el impacto de un documento o de un proceso
 * (`impactos_normativos`, en la página del cambio de norma, en cualquier estado) o desde la revisión de un indicador
 * (`impactos_indicadores`, en la página del indicador, mientras está pendiente), quien puede abre un hallazgo que nace enlazado a él.
 * Aquí, lo que leen los dos lados: lo que pintan esas dos páginas (`engancheDeImpactos`), lo que el registro y su prellenado necesitan
 * del impacto (`impactoParaAbrir`) y el enlace desde el hallazgo (`enlaceDelImpacto`).
 *
 * Liviano: lo importan las dos páginas, el registro, el prellenado y la lectura del hallazgo. No importa las consultas del normograma ni
 * las de los indicadores (que no importan nada de mejoramiento: `tests/indicadores-ciclos.test.ts`): lee con SQL las columnas que
 * necesita, con las reglas de `alcance`. Solo lecturas.
 */
import { obtenerSql, type Cliente } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { nombreSql } from "@/db/consultas/normograma/busqueda";
import { alcanceProcesos, enAlcance, filtroAcceso, filtroHallazgos, filtroIndicadores, puedeVerImpacto, type Alcance } from "@/lib/alcance";
import { rutaDeIndicador } from "@/lib/indicadores/rutas";
import { fuenteDeImpacto } from "@/lib/mejoramiento/enganches";
import { etiquetaDeEstado } from "@/lib/mejoramiento/estados";
import type { EstadoHallazgo, ResultadoCierre } from "@/lib/mejoramiento/tipos";
import { enlaceDeImpacto } from "@/lib/normograma/tipos";
import { puede } from "@/lib/permisos";

/** `documento`: un impacto de `impactos_normativos` (sobre un documento o sobre un proceso); `indicador`: una revisión de `impactos_indicadores`. */
export type ClaseDeImpacto = "documento" | "indicador";

type Opciones = { sql?: Cliente; ahora?: Date };

/**
 * Lo que pinta un impacto (anexo §8, maqueta 6): el hallazgo que cuenta (ni rechazado ni anulado), con su código y en qué va, **solo a
 * quien lo ve** (`visible`); a quien no, `visible: false` sin id, código ni estado (vacíos), y nada se pinta de él. Si quien mira puede
 * abrir uno (mientras no haya uno que cuente, lo vea o no) y, solo entonces, si se le sugiere: el impacto está pendiente, su plazo pasó
 * y ya se avisó al jefe (`escalado_en`). Sin números que configurar, sin tarea y sin aviso.
 */
export type EngancheDeImpacto = {
  hallazgo: { id: number; codigo: string; estado: string; visible: boolean } | null;
  puedeAbrir: boolean;
  sugerir: boolean;
};

/**
 * Lo que el registro (y su prellenado) necesita del impacto del que nace un hallazgo (anexo §8): su norma, que es el requisito
 * incumplido, y su proceso, fijos; el documento (con versión vigente) o el indicador (activo o retirado) que «A qué se refiere» propone;
 * y si ya tiene un hallazgo que cuenta (`yaTiene`), que quien registra ve.
 */
export type ImpactoParaAbrir = {
  clase: ClaseDeImpacto;
  id: number;
  normaId: number;
  norma: string;
  procesoId: number;
  documentoId: number | null;
  indicadorId: number | null;
  yaTiene: boolean;
};

/** El enlace desde el hallazgo con su impacto: a quien ve el impacto, su nombre y la página donde se resuelve; a los demás, que hay uno. */
export type EnlaceDelImpacto = { visible: true; nombre: string; href: string } | { visible: false };

type FilaDeImpacto = {
  id: number;
  cambioId: number;
  procesoId: number;
  procesoActivo: boolean;
  normaId: number;
  norma: string;
  pendiente: boolean;
  vencido: boolean;
  escalado: boolean;
  /** Quien mira ve lo que el impacto toca: el documento (`filtroAcceso`; el de un proceso, siempre) o el indicador (`filtroIndicadores`). */
  ve: boolean;
  /** El documento con versión vigente o el indicador activo o retirado: lo que «A qué se refiere» puede proponer. */
  ofrecido: number | null;
  indicadorCodigo: string | null;
  hallazgo: { id: number; codigo: string; estado: string; visible: boolean } | null;
};

/** Un hallazgo cuenta si no terminó rechazado ni anulado: la regla de los índices únicos parciales de la `0019`. */
const CUENTA = (sql: Cliente) => sql`h.estado NOT IN ('rechazado', 'anulado')`;

/** Los impactos `ids` de la clase, con su norma, su proceso, su plazo, lo que quien mira ve de él y el hallazgo que cuenta. Una consulta. */
async function leerImpactos(sql: Cliente, sesion: SesionFlujo, clase: ClaseDeImpacto, ids: readonly number[], ahora: Date): Promise<FilaDeImpacto[]> {
  const hallazgo = (enlace: ReturnType<Cliente>) => sql`LEFT JOIN LATERAL (
      SELECT h.id, h.codigo, h.estado, h.resultado_cierre, h.correccion_requerida, ${filtroHallazgos(sql, sesion)} AS visible
      FROM mejora_hallazgos h WHERE ${enlace} AND ${CUENTA(sql)} ORDER BY h.id LIMIT 1
    ) hz ON true`;
  const filas =
    clase === "documento"
      ? await sql`SELECT imp.id, imp.cambio_id, imp.proceso_id, p.activo AS proceso_activo, imp.norma_id, ${nombreSql(sql)} AS norma,
            imp.estado, imp.vence_en < ${ahora}::timestamptz AS vencido, imp.escalado_en IS NOT NULL AS escalado,
            (imp.documento_id IS NULL OR ${filtroAcceso(sql, sesion)}) AS ve,
            CASE WHEN EXISTS (SELECT 1 FROM documento_versiones v WHERE v.documento_id = d.id AND v.estado = 'vigente') THEN d.id END AS ofrecido,
            NULL::text AS indicador_codigo,
            hz.id AS h_id, hz.codigo AS h_codigo, hz.estado AS h_estado, hz.resultado_cierre AS h_resultado,
            hz.correccion_requerida AS h_correccion, hz.visible AS h_visible
          FROM impactos_normativos imp
          JOIN procesos p ON p.id = imp.proceso_id
          JOIN normas n ON n.id = imp.norma_id
          JOIN tipos_norma tn ON tn.id = n.tipo_norma_id
          LEFT JOIN documentos d ON d.id = imp.documento_id
          ${hallazgo(sql`h.impacto_id = imp.id`)}
          WHERE imp.id = ANY(${sql.array([...ids])}::bigint[])`
      : await sql`SELECT ii.id, ii.norma_cambio_id AS cambio_id, i.proceso_id, p.activo AS proceso_activo, ii.norma_id, ${nombreSql(sql)} AS norma,
            ii.estado, ii.vence_en < ${ahora}::timestamptz AS vencido, ii.escalado_en IS NOT NULL AS escalado,
            ${filtroIndicadores(sql, sesion)} AS ve,
            CASE WHEN i.estado IN ('activo', 'retirado') THEN i.id END AS ofrecido,
            i.codigo AS indicador_codigo,
            hz.id AS h_id, hz.codigo AS h_codigo, hz.estado AS h_estado, hz.resultado_cierre AS h_resultado,
            hz.correccion_requerida AS h_correccion, hz.visible AS h_visible
          FROM impactos_indicadores ii
          JOIN indicadores i ON i.id = ii.indicador_id
          JOIN procesos p ON p.id = i.proceso_id
          JOIN normas n ON n.id = ii.norma_id
          JOIN tipos_norma tn ON tn.id = n.tipo_norma_id
          ${hallazgo(sql`h.impacto_indicador_id = ii.id`)}
          WHERE ii.id = ANY(${sql.array([...ids])}::bigint[])`;
  return filas.map((f) => ({
    id: Number(f.id),
    cambioId: Number(f.cambio_id),
    procesoId: Number(f.proceso_id),
    procesoActivo: f.proceso_activo === true,
    normaId: Number(f.norma_id),
    norma: f.norma as string,
    pendiente: f.estado === "pendiente",
    vencido: f.vencido === true,
    escalado: f.escalado === true,
    ve: f.ve === true,
    ofrecido: f.ofrecido === null ? null : Number(f.ofrecido),
    indicadorCodigo: (f.indicador_codigo as string | null) ?? null,
    hallazgo:
      f.h_id === null
        ? null
        : {
            id: Number(f.h_id),
            codigo: f.h_codigo as string,
            estado: etiquetaDeEstado({
              estado: f.h_estado as EstadoHallazgo,
              resultadoCierre: (f.h_resultado as ResultadoCierre | null) ?? null,
              correccionRequerida: (f.h_correccion as boolean | null) ?? null,
            }),
            visible: f.h_visible === true,
          },
  }));
}

/**
 * El alcance de quien puede abrir un hallazgo desde un impacto (anexo §12: `mejora.registrar`, y Admin SGC o líder de proceso); nulo
 * para los demás. Control Interno registra el hallazgo a mano, sin el enlace.
 */
async function alcanceDeQuienAbre(sql: Cliente, sesion: SesionFlujo): Promise<Alcance | null> {
  const registra = puede(sesion, "mejora.registrar") && (sesion.rol === "admin_sgc" || sesion.rol === "lider_proceso");
  return registra ? alcanceProcesos(sesion, { sql }) : null;
}

/**
 * Quién abre un hallazgo desde el impacto (anexo §8 y §12), sin mirar si ya tiene uno: el Admin SGC o un líder de su proceso (el del
 * impacto o, en la revisión de un indicador, el del indicador), activo, que ve el impacto: el de un documento o un proceso, con la regla
 * del normograma (`puedeVerImpacto`) y el documento que toca; la revisión de un indicador, quien ve el indicador y mientras está
 * pendiente (la página solo muestra las pendientes).
 */
function abre(sesion: SesionFlujo, alcance: Alcance | null, clase: ClaseDeImpacto, f: FilaDeImpacto): boolean {
  if (alcance === null || !f.ve || !f.procesoActivo) return false;
  if (sesion.rol === "lider_proceso" && !enAlcance(alcance, f.procesoId)) return false;
  return clase === "documento" ? puedeVerImpacto(sesion, f.procesoId, alcance) : f.pendiente;
}

const valido = (id: number) => Number.isSafeInteger(id) && id > 0;

/**
 * Lo que pinta cada impacto que la página ya lista (los del cambio de norma que la persona ve, o las revisiones pendientes del
 * indicador): una consulta para todos, y otra para el alcance de un líder. Una lista vacía no consulta nada. Un id que no existe no está
 * en el mapa.
 */
export async function engancheDeImpactos(
  sesion: SesionFlujo,
  clase: ClaseDeImpacto,
  ids: number[],
  opciones?: Opciones,
): Promise<Map<number, EngancheDeImpacto>> {
  const resultado = new Map<number, EngancheDeImpacto>();
  const unicos = [...new Set(ids)].filter(valido);
  if (unicos.length === 0) return resultado;
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await leerImpactos(sql, sesion, clase, unicos, opciones?.ahora ?? new Date());
  const alcance = await alcanceDeQuienAbre(sql, sesion);
  for (const f of filas) {
    const puedeAbrir = f.hallazgo === null && abre(sesion, alcance, clase, f);
    resultado.set(f.id, {
      // A quien no ve el hallazgo, nada de él: ni su id, ni su código, ni en qué va.
      hallazgo: f.hallazgo === null ? null : f.hallazgo.visible ? f.hallazgo : { id: 0, codigo: "", estado: "", visible: false },
      puedeAbrir,
      sugerir: puedeAbrir && f.pendiente && f.vencido && f.escalado,
    });
  }
  return resultado;
}

/**
 * El impacto `id` de la clase, para el registro (dentro de su transacción) y su prellenado: nulo si no existe o si quien registra no
 * puede abrirlo (`abre`), y también si ya tiene un hallazgo que cuenta que quien registra no ve: para él, ese hallazgo no existe, y la
 * respuesta es la de un impacto que no existe. `ahora` es la hora de quien llama (su `opciones.ahora`).
 */
export async function impactoParaAbrir(
  sql: Cliente,
  sesion: SesionFlujo,
  clase: ClaseDeImpacto,
  id: number,
  ahora: Date,
): Promise<ImpactoParaAbrir | null> {
  if (!valido(id)) return null;
  const alcance = await alcanceDeQuienAbre(sql, sesion);
  if (alcance === null) return null;
  const [f] = await leerImpactos(sql, sesion, clase, [id], ahora);
  if (!f || !abre(sesion, alcance, clase, f) || (f.hallazgo !== null && !f.hallazgo.visible)) return null;
  return {
    clase,
    id: f.id,
    normaId: f.normaId,
    norma: f.norma,
    procesoId: f.procesoId,
    documentoId: clase === "documento" ? f.ofrecido : null,
    indicadorId: clase === "indicador" ? f.ofrecido : null,
    yaTiene: f.hallazgo !== null,
  };
}

/**
 * El enlace desde un hallazgo con el impacto del que nació (anexo §8: «quedan enlazados en los dos sentidos, cada lado con su regla de
 * visibilidad»), con la regla de la página adonde lleva: el de un documento o un proceso, a quien ve ese impacto (`puedeVerImpacto` y
 * el documento que toca), a la página del cambio de norma en su proceso; la revisión de un indicador, a quien ve el indicador, a su
 * página. Nulo si el hallazgo no nació de un impacto. `ahora` es la hora de quien lee.
 */
export async function enlaceDelImpacto(
  sql: Cliente,
  sesion: SesionFlujo,
  x: { impactoId: number | null; impactoIndicadorId: number | null },
  ahora: Date,
): Promise<EnlaceDelImpacto | null> {
  const clase: ClaseDeImpacto | null = x.impactoId !== null ? "documento" : x.impactoIndicadorId !== null ? "indicador" : null;
  if (clase === null) return null;
  const [f] = await leerImpactos(sql, sesion, clase, [(x.impactoId ?? x.impactoIndicadorId) as number], ahora);
  if (!f || !f.ve) return { visible: false };
  if (clase === "documento") {
    if (!puedeVerImpacto(sesion, f.procesoId, await alcanceProcesos(sesion, { sql }))) return { visible: false };
    return { visible: true, nombre: fuenteDeImpacto(f.norma), href: enlaceDeImpacto(f.cambioId, f.procesoId) };
  }
  return { visible: true, nombre: fuenteDeImpacto(f.norma), href: rutaDeIndicador(f.indicadorCodigo as string) };
}
