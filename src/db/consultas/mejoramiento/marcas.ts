/**
 * La marca «Requiere acción de mejora» de una medición de indicador (Fase 15B, anexo §6): sus pendientes, sus tres salidas (un
 * hallazgo nuevo, una ocurrencia de uno abierto o «No requiere») y lo que la página del indicador muestra de ellas. Las salidas se
 * guardan en `mejora_marcas`, de solo inserción, una fila por decisión; a lo sumo una en vigor por medición, que garantiza el
 * candado de la medición (`bloquearMarca`, la primera sentencia de cada salida) con la comprobación repetida bajo él.
 *
 * Un pendiente se calcula al leer: la parte exacta en SQL (`marcaSinSalida`) y si ya se puede decidir con las reglas de los
 * indicadores (`estadoDeLaMarca`). Lee `mediciones` e `indicadores` por SQL: no importa nada de `src/db/consultas/indicadores/`;
 * las páginas de Indicadores llaman a este módulo, no al revés.
 */
import { obtenerSql, type Cliente } from "@/db/cliente";
import { enTransaccion, type OpcionesFlujo, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { filtroHallazgos, filtroIndicadores } from "@/lib/alcance";
import { EsquemaMarcaConOcurrencia, EsquemaMarcaNoRequiere } from "@/lib/esquemas/mejoramiento";
import { etiquetaDeEstado } from "@/lib/mejoramiento/estados";
import { estadoDeLaMarca, MARCA_SIN_PENDIENTE, MARCA_YA_DECIDIDA, NO_REQUIERE_ACCION, textoDeSalida } from "@/lib/mejoramiento/marcas";
import { rutaDeHallazgo } from "@/lib/mejoramiento/rutas";
import { ErrorMejora, TERMINALES, type EstadoHallazgo } from "@/lib/mejoramiento/tipos";
import type { Semaforo } from "@/lib/indicadores/tipos";
import { ErrorPermiso, requerirPermiso } from "@/lib/permisos";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { bloquearHallazgo, legible, NO_EXISTE } from "./flujo";
import {
  aMarcaLeida,
  bloquearMarca,
  columnasDeMarca,
  dejarSalida,
  desdeLaMedicion,
  etiquetaDelPeriodo,
  leerMarca,
  marcaSinSalida,
  puedeResolverMarca,
  textosDeLaMarca,
  type MarcaParaDecidir,
} from "./marcas-base";
import { registrarOcurrencia } from "./registro";

export {
  bloquearMarca,
  marcaSinSalida,
  puedeResolverMarca,
  salidaAlNacer,
  salidaEnVigor,
  type MarcaLeida,
} from "./marcas-base";

type Opciones = { sql?: Cliente; ahora?: Date };

/** Un pendiente, o una medición marcada que todavía espera su análisis (anexo §6.5), tal como la pinta el panel. */
export type MarcaDeMedicion = {
  medicionId: number;
  /** «Octubre de 2026». */
  periodo: string;
  /** «10 % frente a una meta de 90 %» (o la cifra sola, sin meta). */
  resultado: string;
  /** El color, para el punto junto al resultado: el texto lo dice `resultado` y la marca. */
  semaforo: Semaforo | null;
  estado: "pendiente" | "espera_analisis";
  /** El día (`AAAA-MM-DD`, en la zona de la instalación) en que se pedirá la decisión si no tiene antes su análisis. */
  esperaHasta: string | null;
  causa: string | null;
  accionPropuesta: string | null;
};

/** La salida en vigor de una medición, tal como la pinta la página del indicador (`salidasVisibles`). */
export type SalidaDeMedicion = { texto: string; enlace: string | null; justificacion: string | null; por: string; en: Date };

/** Un hallazgo que sirve para la ocurrencia: el más reciente primero. `estado` es su etiqueta («En ejecución»). */
export type CandidatoDeMarca = { id: number; codigo: string; titulo: string; estado: string };

const conMayuscula = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);

/**
 * Los hallazgos que sirven para resolver una marca del indicador como ocurrencia (anexo §6.2), para un `WHERE` sobre
 * `mejora_hallazgos h`: sin terminar, que citan el indicador (§10.1: por `indicador_id`, por una de sus mediciones o como indicador
 * de eficacia de una ronda), que la persona ve (`filtroHallazgos`) y a los que puede añadir ocurrencias (spec 15 §7.5: el líder,
 * solo los de sus procesos activos, la regla de `registrarOcurrencia`). Una sola regla para la lista y para el acto.
 */
function candidatoDeMarca(sql: Cliente, sesion: SesionFlujo, indicadorId: number) {
  const enSusProcesos =
    sesion.rol === "lider_proceso"
      ? sql`EXISTS (SELECT 1 FROM usuario_procesos cm_up JOIN procesos cm_p ON cm_p.id = cm_up.proceso_id AND cm_p.activo
          WHERE cm_up.usuario_id = ${sesion.usuarioId} AND cm_up.proceso_id = h.proceso_id)`
      : sql`true`;
  return sql`(h.estado NOT IN ${sql([...TERMINALES])}
    AND (h.indicador_id = ${indicadorId}
      OR EXISTS (SELECT 1 FROM mediciones cm_m WHERE cm_m.id = h.medicion_id AND cm_m.indicador_id = ${indicadorId})
      OR EXISTS (SELECT 1 FROM mejora_rondas cm_r WHERE cm_r.hallazgo_id = h.id AND cm_r.indicador_eficacia_id = ${indicadorId}))
    AND ${filtroHallazgos(sql, sesion)} AND ${enSusProcesos})`;
}

const MAXIMO_INT8 = Number.MAX_SAFE_INTEGER;
const idValido = (id: number) => Number.isSafeInteger(id) && id > 0 && id <= MAXIMO_INT8;

/**
 * El panel de las marcas de un indicador (anexo §6.5) para quien puede darles alguna salida: el Admin SGC (las tres) y los líderes
 * activos de su proceso (las dos primeras), que ven el indicador. A cualquier otra persona, nulo: el panel no existe. `marcas`
 * trae, de la más antigua a la más reciente, las mediciones marcadas sin salida en vigor: los pendientes y las que esperan su
 * análisis (con el día en que se pedirá la decisión); `candidatos`, los hallazgos que sirven para la ocurrencia, el más reciente
 * primero, solo a quien puede usarlos y solo si hay alguna marca.
 */
export async function marcasDelIndicador(
  sesion: SesionFlujo,
  indicadorId: number,
  opciones?: Opciones,
): Promise<{ puede: { hallazgo: boolean; noRequiere: boolean }; marcas: MarcaDeMedicion[]; candidatos: CandidatoDeMarca[] } | null> {
  if (!idValido(indicadorId)) return null;
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const [i] = await sql`SELECT i.id, i.proceso_id FROM indicadores i WHERE i.id = ${indicadorId} AND ${filtroIndicadores(sql, sesion)}`;
  if (!i) return null;
  const puede = await puedeResolverMarca(sql, sesion, { id: indicadorId, procesoId: Number(i.proceso_id) });
  if (!puede.hallazgo && !puede.noRequiere) return null;
  const filas = await sql`SELECT ${columnasDeMarca(sql)} FROM ${desdeLaMedicion(sql)}
    WHERE m.indicador_id = ${indicadorId} AND ${marcaSinSalida(sql)}
    ORDER BY m.desde, m.id`;
  const zona = zonaHoraria();
  const marcas = filas.map((f): MarcaDeMedicion => {
    const m = aMarcaLeida(f);
    const estado = estadoDeLaMarca(m, ahora);
    return {
      medicionId: m.medicionId,
      periodo: conMayuscula(etiquetaDelPeriodo(m)),
      resultado: m.frente ?? m.valor ?? "Sin resultado",
      semaforo: m.semaforo,
      estado,
      esperaHasta: estado === "espera_analisis" ? fechaEnZona(m.venceEn, zona) : null,
      causa: m.causa,
      accionPropuesta: m.accionPropuesta,
    };
  });
  const candidatos = puede.hallazgo && marcas.length > 0 ? await candidatosDe(sql, sesion, indicadorId) : [];
  return { puede, marcas, candidatos };
}

async function candidatosDe(sql: Cliente, sesion: SesionFlujo, indicadorId: number): Promise<CandidatoDeMarca[]> {
  const filas = await sql`SELECT h.id, h.codigo, h.titulo, h.estado, h.correccion_requerida FROM mejora_hallazgos h
    WHERE ${candidatoDeMarca(sql, sesion, indicadorId)}
    ORDER BY h.registrado_en DESC, h.id DESC`;
  return filas.map((f) => ({
    id: Number(f.id),
    codigo: f.codigo as string,
    titulo: f.titulo as string,
    estado: etiquetaDeEstado({
      estado: f.estado as EstadoHallazgo,
      resultadoCierre: null,
      correccionRequerida: (f.correccion_requerida as boolean | null) ?? null,
    }),
  }));
}

/**
 * La salida en vigor de cada medición del indicador (anexo §6.5, «Ya decidida»), por medición: «Hallazgo HZ-…» u «Ocurrencia de
 * HZ-…», con su enlace, **solo a quien puede ver ese hallazgo** (a los demás, la medición no está en el mapa: siguen viendo la marca
 * como hoy, sin nada que diga que hay un hallazgo); «No requiere acción de mejora», con su justificación, quién y cuándo, a quien ve
 * el indicador. A quien no ve el indicador, el mapa vacío.
 */
export async function salidasVisibles(
  sesion: SesionFlujo,
  indicadorId: number,
  opciones?: Opciones,
): Promise<Map<number, SalidaDeMedicion>> {
  const salida = new Map<number, SalidaDeMedicion>();
  if (!idValido(indicadorId)) return salida;
  const sql = opciones?.sql ?? obtenerSql();
  const [i] = await sql`SELECT 1 FROM indicadores i WHERE i.id = ${indicadorId} AND ${filtroIndicadores(sql, sesion)}`;
  if (!i) return salida;
  const filas = await sql`SELECT DISTINCT ON (sv_k.medicion_id) sv_k.medicion_id, sv_k.salida, sv_k.hallazgo_id, sv_k.justificacion,
      sv_k.decidido_en, u.nombre AS por, h.codigo, (h.id IS NOT NULL AND ${filtroHallazgos(sql, sesion)}) AS ve_hallazgo
    FROM mejora_marcas sv_k
    JOIN usuarios u ON u.id = sv_k.decidido_por
    LEFT JOIN mejora_hallazgos h ON h.id = sv_k.hallazgo_id
    WHERE sv_k.indicador_id = ${indicadorId} AND (sv_k.salida = 'no_requiere' OR h.estado NOT IN ('rechazado', 'anulado'))
    ORDER BY sv_k.medicion_id, sv_k.id DESC`;
  for (const f of filas) {
    const comun = { por: f.por as string, en: f.decidido_en as Date };
    if (f.salida === "no_requiere") {
      salida.set(Number(f.medicion_id), { texto: NO_REQUIERE_ACCION, enlace: null, justificacion: f.justificacion as string, ...comun });
    } else if (f.ve_hallazgo === true) {
      salida.set(Number(f.medicion_id), {
        texto: textoDeSalida(f.salida as "hallazgo" | "ocurrencia", f.codigo as string),
        enlace: rutaDeHallazgo(Number(f.hallazgo_id)),
        justificacion: null,
        ...comun,
      });
    }
  }
  return salida;
}

/**
 * Las comprobaciones de toda salida, con el candado de la medición ya tomado y en este orden: que exista y la persona vea su
 * indicador (si no, «no pide decidir», la misma respuesta que para una que no existe), que pueda dar esa salida, que no tenga ya
 * una en vigor (`MARCA_YA_DECIDIDA`) y que sea un pendiente (`MARCA_SIN_PENDIENTE`).
 */
async function marcaPorDecidir(
  tx: Cliente,
  sesion: SesionFlujo,
  medicionId: number,
  salida: "hallazgo" | "noRequiere",
  ahora: Date,
): Promise<MarcaParaDecidir> {
  const m = await leerMarca(tx, sesion, medicionId);
  if (!m || !m.ve) throw new ErrorMejora(MARCA_SIN_PENDIENTE);
  if (!(await puedeResolverMarca(tx, sesion, { id: m.indicadorId, procesoId: m.procesoId }))[salida]) throw new ErrorPermiso();
  if (m.decidida) throw new ErrorMejora(MARCA_YA_DECIDIDA);
  if (!m.marcada || estadoDeLaMarca(m, ahora) !== "pendiente") throw new ErrorMejora(MARCA_SIN_PENDIENTE);
  return m;
}

/**
 * Resuelve un pendiente como una ocurrencia más de un hallazgo sin terminar que cita el indicador (anexo §6.2): la ocurrencia nace
 * con la fecha del último día del periodo, la frase del resultado como descripción y la medición como su origen, por
 * `registrarOcurrencia` (que avisa como toda ocurrencia), y la salida «ocurrencia» queda en `mejora_marcas` con su bitácora. Lo
 * pueden el Admin SGC y los líderes del proceso del indicador. Un hallazgo que no sirve (terminado, que no cita el indicador, que la
 * persona no ve o al que no puede añadir ocurrencias) se rechaza como uno que no existe.
 *
 * El candado de la medición es la primera sentencia de la transacción y todo lo demás se lee después; el hallazgo se bloquea
 * después de él, como en el registro.
 */
export async function resolverConOcurrencia(sesion: SesionFlujo, d: { medicionId: number; hallazgoId: number }, opciones?: OpcionesFlujo): Promise<void> {
  requerirPermiso(sesion, "mejora.registrar");
  const leido = EsquemaMarcaConOcurrencia.safeParse(d);
  if (!leido.success) throw new ErrorMejora(leido.error.issues[0].message);
  const r = leido.data;
  const ahora = opciones?.ahora ?? new Date();
  return legible(
    enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
      await bloquearMarca(tx, r.medicionId);
      const m = await marcaPorDecidir(tx, sesion, r.medicionId, "hallazgo", ahora);
      const h = await bloquearHallazgo(tx, r.hallazgoId);
      const [sirve] = await tx`SELECT 1 FROM mejora_hallazgos h WHERE h.id = ${h.id} AND ${candidatoDeMarca(tx, sesion, m.indicadorId)}`;
      if (!sirve) throw new ErrorMejora(NO_EXISTE);
      await registrarOcurrencia(
        sesion,
        {
          hallazgoId: h.id,
          fecha: fechaEnZona(m.hasta, zonaHoraria()),
          descripcion: textosDeLaMarca(m).descripcion,
          origen: "medicion",
          medicionId: m.medicionId,
        },
        { ...opciones, sql: tx, ahora },
      );
      await dejarSalida(tx, sesion, m, { salida: "ocurrencia", hallazgo: { id: h.id, codigo: h.codigo } }, ahora);
    }),
  );
}

/**
 * Resuelve un pendiente con «No requiere acción de mejora» (anexo §6.2): solo el Admin SGC (`mejora.gestionar`), con justificación
 * (al menos 10 caracteres), que queda en la fila de la marca y se ve en la página del indicador; a la bitácora va el acto, sin el
 * texto. Es definitiva. El candado de la medición es la primera sentencia de la transacción.
 */
export async function resolverNoRequiere(sesion: SesionFlujo, d: { medicionId: number; justificacion: string }, opciones?: OpcionesFlujo): Promise<void> {
  requerirPermiso(sesion, "mejora.gestionar");
  const leido = EsquemaMarcaNoRequiere.safeParse(d);
  if (!leido.success) throw new ErrorMejora(leido.error.issues[0].message);
  const r = leido.data;
  const ahora = opciones?.ahora ?? new Date();
  return legible(
    enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
      await bloquearMarca(tx, r.medicionId);
      const m = await marcaPorDecidir(tx, sesion, r.medicionId, "noRequiere", ahora);
      await dejarSalida(tx, sesion, m, { salida: "no_requiere", justificacion: r.justificacion }, ahora);
    }),
  );
}

