/**
 * Los archivos del módulo de mejoramiento (spec 15 §6.3 y §12.2): filas de `archivos` con contexto `mejora_hallazgo`,
 * `mejora_ronda`, `mejora_actividad`, `mejora_reporte` o, desde la 15B, `mejora_plan` (los de un plan de mejoramiento, anexo
 * §3.7), siempre con `version_id` nulo. El control de acceso de un archivo es el de su dueño: quién lo sube (`autorizarSubida`),
 * quién lo abre (`puedeAbrirArchivoDeMejora`, `src/lib/alcance.ts`) y quién lo quita (`quitarArchivoDeMejora`). Quien no puede
 * abrir un archivo recibe «no existe», nunca «sin permiso». Desde la 15B (anexo §11.2), lo que ya se firmó no lo quita nadie
 * (`estaCongelado`): la única salida es el retiro por datos personales del Admin SGC (`retirarPorDatosPersonales`).
 *
 * Módulo liviano: lo importa `registrarArchivo` (`admin.ts`); no importa `lectura`. El primer formato firmado de un hallazgo
 * cargado confirma su carga (`confirmarCarga`, de `carga-confirmada.ts`, liviano también); subir y quitar un archivo de un plan
 * dejan su línea en el historial del plan (`dejarEventoDePlan`, de `planes.ts`, liviano también). El retiro deja su evento con el
 * motor (`bloquearHallazgo` y `dejarEvento`, de `flujo.ts`, que `carga-confirmada.ts` ya importaba).
 */
import { unlink } from "node:fs/promises";
import type { TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { enTransaccion, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { puedeAbrirArchivoDeMejora, puedeVerificar, type SujetoVisibilidad } from "@/lib/alcance";
import { resolverRutaAlmacen } from "@/lib/almacen";
import { EsquemaRetiroDeArchivo } from "@/lib/esquemas/mejoramiento";
import { MAXIMO_POR_REPORTE } from "@/lib/mejoramiento/reportes";
import { ARCHIVO_FIRMADO, NO_SE_RETIRA_POR_AQUI } from "@/lib/mejoramiento/textos";
import { ErrorMejora, TERMINALES } from "@/lib/mejoramiento/tipos";
import type { ArchivoServible } from "@/lib/servir-archivo";
import { PLAN_ANULADO } from "@/lib/mejoramiento/planes";
import { puede, requerirPermiso } from "@/lib/permisos";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { ENTIDAD_HALLAZGO } from "./avisos";
import { confirmarCarga } from "./carga-confirmada";
import { bloquearHallazgo, dejarEvento } from "./flujo";
import { HALLAZGO_TERMINADO, legible } from "./legible";
import { dejarEventoDePlan } from "./planes";
import { actuaPorElProceso } from "./proceso";

export type DestinoDeMejora =
  | { contexto: "mejora_hallazgo"; id: number; rol: "evidencia" | "correccion" | "carga" }
  | { contexto: "mejora_ronda"; id: number; rol: "analisis" | "verificacion" }
  | { contexto: "mejora_actividad"; id: number }
  | { contexto: "mejora_reporte"; id: number }
  | { contexto: "mejora_plan"; id: number };

const CARPETAS_POR_CONTEXTO = {
  mejora_hallazgo: "hallazgos",
  mejora_ronda: "rondas",
  mejora_actividad: "actividades",
  mejora_reporte: "reportes",
  mejora_plan: "planes",
} as const;

/**
 * Los roles de archivo que admite cada destino que distingue alguno: el hallazgo y la ronda los validan en `?rol=` antes de
 * recibir el cuerpo; el plan solo admite `evidencia` (anexo §3.7), que `registrarArchivo` vuelve a comprobar.
 */
export const ROLES_POR_DESTINO = {
  mejora_hallazgo: ["evidencia", "correccion", "carga"],
  mejora_ronda: ["analisis", "verificacion"],
  mejora_plan: ["evidencia"],
} as const;

// El tope de archivos de un reporte vive en `src/lib/mejoramiento/reportes.ts` (lo pinta también el formulario de reportar).
export { MAXIMO_POR_REPORTE };

const NO_EXISTE = "El archivo no existe";
const SIN_DUENO = "Ya no existe a qué adjuntar el archivo";

type Persona = Pick<SesionFlujo, "usuarioId" | "rol">;
type Resultado = { ok: true; carpeta: string } | { ok: false; estado: 403 | 404 | 409; error: string };

/** Lo que hace falta del dueño de un archivo, de su hallazgo y, si lo hay, de su ronda, actividad o reporte; o del plan. */
type Dueno = {
  hallazgoId: number | null;
  procesoId: number | null;
  estado: string | null;
  ronda: number | null;
  cargado: boolean;
  registradoPor: number | null;
  rondaNumero: number | null;
  responsableId: number | null;
  estadoActividad: string | null;
  reportadoPor: number | null;
  estadoReporte: string | null;
  archivos: number;
  /** De un plan: si está anulado (no admite archivos ni deja quitarlos). */
  planAnulado: boolean;
};

const SIN_NADA: Dueno = {
  hallazgoId: null, procesoId: null, estado: null, ronda: null, cargado: false, registradoPor: null, rondaNumero: null,
  responsableId: null, estadoActividad: null, reportadoPor: null, estadoReporte: null, archivos: 0, planAnulado: false,
};

/** Los cinco contextos de `archivos` de este módulo. */
export const CONTEXTOS_DE_MEJORA: string[] = Object.keys(CARPETAS_POR_CONTEXTO);

const esId = (n: number) => Number.isSafeInteger(n) && n > 0;

/**
 * Lee el dueño. Con `bloquear`, el hallazgo `FOR SHARE` (choca con el `FOR UPDATE` de `transicionarHallazgo`: el estado que
 * se lee es el que rige al escribir la fila) o, en un reporte, el reporte `FOR UPDATE`, y los archivos del reporte se cuentan
 * en otra sentencia, después del candado: en READ COMMITTED cada sentencia toma su propia foto, así quien esperó el candado
 * cuenta el archivo que la otra subida acaba de confirmar (dos subidas a la vez respetan el tope). En un plan, el plan `FOR
 * SHARE`: choca con el `FOR UPDATE` de anularlo y de registrar su respuesta al ente, así lo que se lee después (si está anulado,
 * si el archivo ya es el oficio de una respuesta) es lo que rige al escribir.
 */
async function cargarDueno(sql: Cliente, contexto: string, id: number, bloquear: boolean): Promise<Dueno | null> {
  if (!esId(id)) return null;
  const candado = (t: "SHARE" | "UPDATE", de: string) => (bloquear ? sql.unsafe(`FOR ${t} OF ${de}`) : sql``);
  let f;
  if (contexto === "mejora_hallazgo") {
    [f] = await sql`SELECT h.id AS hallazgo_id, h.proceso_id, h.estado, h.ronda, h.cargado, h.registrado_por
      FROM mejora_hallazgos h WHERE h.id = ${id} ${candado("SHARE", "h")}`;
  } else if (contexto === "mejora_ronda") {
    [f] = await sql`SELECT h.id AS hallazgo_id, h.proceso_id, h.estado, h.ronda, h.cargado, h.registrado_por, r.numero AS ronda_numero
      FROM mejora_rondas r JOIN mejora_hallazgos h ON h.id = r.hallazgo_id WHERE r.id = ${id} ${candado("SHARE", "h")}`;
  } else if (contexto === "mejora_actividad") {
    [f] = await sql`SELECT h.id AS hallazgo_id, h.proceso_id, h.estado, h.ronda, h.cargado, h.registrado_por,
        a.responsable_id, a.estado AS estado_actividad
      FROM mejora_actividades a JOIN mejora_hallazgos h ON h.id = a.hallazgo_id WHERE a.id = ${id} ${candado("SHARE", "h, a")}`;
  } else if (contexto === "mejora_reporte") {
    [f] = await sql`SELECT r.reportado_por, r.estado AS estado_reporte, r.hallazgo_id
      FROM mejora_reportes r WHERE r.id = ${id} ${candado("UPDATE", "r")}`;
    if (f) {
      const [n] = await sql`SELECT count(*) AS n FROM archivos WHERE contexto = 'mejora_reporte' AND contexto_id = ${id}`;
      f = { ...f, archivos: n.n };
    }
  } else if (contexto === "mejora_plan") {
    [f] = await sql`SELECT p.anulado_en IS NOT NULL AS plan_anulado FROM mejora_planes p WHERE p.id = ${id} ${candado("SHARE", "p")}`;
  } else {
    return null;
  }
  if (!f) return null;
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    ...SIN_NADA,
    hallazgoId: num(f.hallazgo_id),
    procesoId: num(f.proceso_id),
    estado: (f.estado as string | undefined) ?? null,
    ronda: num(f.ronda),
    cargado: f.cargado === true,
    registradoPor: num(f.registrado_por),
    rondaNumero: num(f.ronda_numero),
    responsableId: num(f.responsable_id),
    estadoActividad: (f.estado_actividad as string | undefined) ?? null,
    reportadoPor: num(f.reportado_por),
    estadoReporte: (f.estado_reporte as string | undefined) ?? null,
    archivos: num(f.archivos) ?? 0,
    planAnulado: f.plan_anulado === true,
  };
}

/** ¿Es la persona de la tabla «Quién sube qué» de este destino? */
async function esQuienSube(sql: Cliente, p: Persona, d: DestinoDeMejora, f: Dueno): Promise<boolean> {
  switch (d.contexto) {
    case "mejora_hallazgo":
      if (d.rol === "evidencia") return f.registradoPor === p.usuarioId || p.rol === "admin_sgc";
      if (d.rol === "carga") return p.rol === "admin_sgc";
      return f.procesoId !== null && (await actuaPorElProceso(sql, p, f.procesoId));
    case "mejora_ronda":
      if (d.rol === "analisis") return f.procesoId !== null && (await actuaPorElProceso(sql, p, f.procesoId));
      // Quien ejecutó no verifica, y tampoco sube la evidencia de la verificación (spec §11.1).
      return f.hallazgoId !== null && (await puedeVerificar(f.hallazgoId, { ...p, verHistorial: false }, { sql }));
    case "mejora_actividad":
      return f.responsableId === p.usuarioId;
    case "mejora_reporte":
      return f.reportadoPor === p.usuarioId;
    case "mejora_plan":
      // Quienes crean y llenan el plan (anexo §3.2 y §3.7).
      return puede(p, "mejora.planes");
  }
}

/** La frase de por qué el destino ya no admite el archivo, o `null` si sigue abierto («Mientras» de la tabla). */
function cerrado(d: DestinoDeMejora, f: Dueno): string | null {
  if (d.contexto === "mejora_plan") return f.planAnulado ? PLAN_ANULADO : null;
  if (d.contexto === "mejora_reporte") {
    if (f.estadoReporte !== "recibido") return "El reporte ya se clasificó: no admite más archivos";
    return f.archivos >= MAXIMO_POR_REPORTE ? `Un reporte admite como mucho ${MAXIMO_POR_REPORTE} archivos` : null;
  }
  const estado = f.estado ?? "";
  if ((TERMINALES as readonly string[]).includes(estado)) return "El hallazgo ya terminó: no admite más archivos";
  switch (d.contexto) {
    case "mejora_hallazgo":
      if (d.rol === "correccion" && estado !== "por_corregir") return "La corrección ya no está abierta: no admite más archivos";
      if (d.rol === "carga" && !f.cargado) return "El hallazgo no es uno cargado: no lleva el escaneo de la carga";
      return null;
    case "mejora_ronda":
      // Una ronda anterior queda congelada y a la vista (spec §8.7): solo la del hallazgo admite archivos.
      if (f.rondaNumero !== f.ronda) return RONDA_CONGELADA;
      if (d.rol === "analisis") return estado === "por_formular" ? null : "El análisis ya no está abierto: no admite más archivos";
      return estado === "por_verificar" || estado === "en_espera" ? null : "La verificación no está abierta: no admite más archivos";
    case "mejora_actividad":
      if (estado !== "en_ejecucion") return "El hallazgo no está en ejecución: la actividad no admite más archivos";
      return f.estadoActividad === "terminada" || f.estadoActividad === "cancelada"
        ? "La actividad ya terminó o se canceló: no admite más archivos"
        : null;
  }
}

const RONDA_CONGELADA = "Esa ronda ya está congelada: solo la ronda en curso admite archivos";

const EVIDENCIA_DE_ACTIVIDAD_CERRADA = "La evidencia de una actividad terminada o cancelada no se quita";

const EVIDENCIA_VERIFICADA = "La evidencia de la verificación ya se usó al verificar: no se quita";

const EVIDENCIA_EVALUADA = "La evaluación de la eficacia ya se registró: su evidencia no se quita";

const OFICIO_REGISTRADO = "El oficio de la respuesta al ente ya se registró: no se quita";

const FORMATO_DE_LA_CARGA = "El formato firmado de la carga es la evidencia de lo hecho en papel: no se quita";

const SIN_PERMISO = "Sin permiso para adjuntar este archivo";

/** El paso de la persona y del estado, sin saber si el dueño se ve (eso lo decide `autorizarSubida`). */
async function evaluar(sql: Cliente, p: Persona, d: DestinoDeMejora, f: Dueno): Promise<Resultado | null> {
  if (!(await esQuienSube(sql, p, d, f))) return { ok: false, estado: 403, error: SIN_PERMISO };
  const motivo = cerrado(d, f);
  return motivo ? { ok: false, estado: 409, error: motivo } : null;
}

/**
 * Quién puede subir un archivo a ese destino, antes de recibir el cuerpo: 404 si no existe o la persona no abre sus
 * archivos, 403 si los abre y no es quien sube, 409 si el destino ya no lo admite. Lo repite `exigirDestinoAbierto` con los
 * candados, dentro de la transacción de `registrarArchivo`.
 */
export async function autorizarSubida(
  sesion: SesionFlujo,
  destino: DestinoDeMejora,
  opciones?: { sql?: Cliente },
): Promise<Resultado> {
  const sql = opciones?.sql ?? obtenerSql();
  const f = await cargarDueno(sql, destino.contexto, destino.id, false);
  if (!f || !(await puedeAbrirArchivoDeMejora({ contexto: destino.contexto, contextoId: destino.id }, sesion, { sql }))) {
    return { ok: false, estado: 404, error: SIN_DUENO };
  }
  return (await evaluar(sql, sesion, destino, f)) ?? { ok: true, carpeta: `mejoramiento/${CARPETAS_POR_CONTEXTO[destino.contexto]}/${destino.id}` };
}

/**
 * Lo que `registrarArchivo` repite dentro de su transacción, con el dueño bloqueado: el destino sigue abierto y la persona
 * sigue siendo quien sube (el estado puede cambiar entre la autorización y el registro). Lanza `ErrorMejora`. El formato firmado
 * de una carga (rol `carga`) toma antes el hallazgo `FOR UPDATE` (pasar del `FOR SHARE` de `cargarDueno` a ese candado podría
 * interbloquear dos escaneos a la vez) y confirma la carga si es el primero (`confirmarCarga`).
 */
export async function exigirDestinoAbierto(
  tx: TransactionSql,
  contexto: string,
  contextoId: number,
  usuarioId: number,
  rol?: string,
  ahora: Date = new Date(),
): Promise<void> {
  if (contexto in ROLES_POR_DESTINO && rol === undefined) {
    throw new Error(`exigirDestinoAbierto: el destino ${contexto} exige el rol del archivo`);
  }
  const escaneo = contexto === "mejora_hallazgo" && rol === "carga";
  if (escaneo && esId(contextoId)) await tx`SELECT 1 FROM mejora_hallazgos WHERE id = ${contextoId} FOR UPDATE`;
  const f = await cargarDueno(tx, contexto, contextoId, true);
  if (!f) throw new ErrorMejora(SIN_DUENO);
  const [u] = await tx`SELECT rol FROM usuarios WHERE id = ${usuarioId} AND activo`;
  if (!u) throw new ErrorMejora(SIN_PERMISO);
  const roles: readonly string[] = ROLES_POR_DESTINO[contexto as keyof typeof ROLES_POR_DESTINO] ?? [];
  if (roles.length > 0 && !roles.includes(rol ?? "")) throw new ErrorMejora("El rol del archivo no es válido para este destino");
  const destino = { contexto, id: contextoId, ...(roles.length > 0 ? { rol } : {}) } as DestinoDeMejora;
  const r = await evaluar(tx, { usuarioId, rol: u.rol }, destino, f);
  if (r && !r.ok) throw new ErrorMejora(r.error);
  if (escaneo) await confirmarCarga(tx, contextoId, usuarioId, ahora);
}

/** El archivo, si es de mejoramiento y la persona lo abre; `null` en cualquier otro caso (404, siempre como descarga). */
export async function archivoServible(
  sesion: SujetoVisibilidad,
  archivoId: number,
  opciones?: { sql?: Cliente },
): Promise<ArchivoServible | null> {
  const sql = opciones?.sql ?? obtenerSql();
  if (!esId(archivoId)) return null;
  const [a] = await sql`SELECT ruta, mime, nombre_original, contexto, contexto_id FROM archivos
    WHERE id = ${archivoId} AND version_id IS NULL AND contexto = ANY(${CONTEXTOS_DE_MEJORA})`;
  if (!a || !(await puedeAbrirArchivoDeMejora({ contexto: a.contexto, contextoId: Number(a.contexto_id) }, sesion, { sql }))) return null;
  return { ruta: a.ruta as string, mime: a.mime as string, nombreOriginal: a.nombre_original as string };
}

/** `congelado`: ya es parte de lo firmado (`estaCongelado`): nadie lo quita, y solo se retira por datos personales. */
export type ArchivoDeMejora = { id: number; nombre: string; rol: string; tamano: number; mime: string; congelado: boolean };

/** Un archivo retirado por datos personales de ese dueño (anexo §11.2): su nombre y su rol (la sección donde estaba) y cuándo. */
export type RetiroDeArchivo = { nombre: string; rol: string; en: Date };

/** Los archivos de un dueño y los que se le retiraron por datos personales. */
export type ArchivosDeMejora = { archivos: ArchivoDeMejora[]; retirados: RetiroDeArchivo[] };

/** Los dos destinos que tienen archivos que se congelan (anexo §11.2), y por eso retiros. */
const CONTEXTOS_CON_RETIRO: readonly string[] = ["mejora_hallazgo", "mejora_ronda"];

/**
 * Los archivos que ya se firmaron (anexo §11.2, Fase 15B), en SQL sobre la fila `a` de `archivos`: la regla única que usan
 * `estaCongelado`, `archivosDe`, quitar y retirar, así «Quitar» y «Retirar por datos personales» nunca valen a la vez.
 *
 * - **La evidencia del registro** (el hallazgo, rol `evidencia`) que ya estaba subida cuando el plan se envió por primera vez:
 *   su `subir_archivo` va antes que la primera `mejora_enviar_plan` del hallazgo, en cualquier ronda. «Antes» lo dice el orden de
 *   la bitácora y no la hora, como `oficiosPosibles`: `archivos.creado_en` es la de la base y el envío guarda la de `ahora`. En un
 *   hallazgo cargado el plan llegó aprobado y el ancla es la carga confirmada (la `mejora_carga_confirmada` que deja el formato
 *   firmado; hasta entonces nada llegó a nadie): lo de antes queda congelado, lo de después se quita como hoy. Un archivo sin
 *   `subir_archivo` no se sabe cuándo se subió y no se congela (todo lo que se sube pasa por `registrarArchivo`, que la deja). El
 *   oficio de una respuesta al ente ya registrada no entra: lo deja sin quitar la regla de la 15A, y no se retira por aquí.
 * - **Los del análisis** de la ronda en curso (rol `analisis`) mientras su plan está enviado o aprobado: se mira el estado, no el
 *   orden (devuelto el plan, vuelven a quitarse hasta el reenvío). En una carga sin confirmar, como hoy.
 */
const congeladoSql = (sql: Cliente) => sql`(
  (a.contexto = 'mejora_hallazgo' AND a.rol = 'evidencia' AND EXISTS (
    SELECT 1 FROM mejora_hallazgos ch
    CROSS JOIN LATERAL (
      SELECT min(au.id) AS id FROM auditoria au
      WHERE au.entidad = 'mejora_hallazgo' AND au.entidad_id = ch.id
        AND au.accion = CASE WHEN ch.cargado THEN 'mejora_carga_confirmada' ELSE 'mejora_enviar_plan' END
    ) ancla
    WHERE ch.id = a.contexto_id AND ancla.id IS NOT NULL
      AND EXISTS (SELECT 1 FROM auditoria s
        WHERE s.accion = 'subir_archivo' AND s.entidad = 'archivo' AND s.entidad_id = a.id AND s.id < ancla.id)
      AND NOT EXISTS (SELECT 1 FROM mejora_eventos re
        WHERE re.hallazgo_id = ch.id AND re.tipo = 'respuesta_ente' AND re.detalle->>'oficioId' = a.id::text)))
  OR (a.contexto = 'mejora_ronda' AND a.rol = 'analisis' AND EXISTS (
    SELECT 1 FROM mejora_rondas cr JOIN mejora_hallazgos ch ON ch.id = cr.hallazgo_id AND ch.ronda = cr.numero
    WHERE cr.id = a.contexto_id AND cr.estado_plan IN ('enviado', 'aprobado')
      AND (NOT ch.cargado OR EXISTS (SELECT 1 FROM auditoria cc
        WHERE cc.entidad = 'mejora_hallazgo' AND cc.entidad_id = ch.id AND cc.accion = 'mejora_carga_confirmada'))))
)`;

/**
 * Si el archivo ya es parte de lo firmado (anexo §11.2; la regla, en `congeladoSql`): la evidencia del registro subida antes del
 * primer envío del plan (en uno cargado, antes de confirmarse la carga), o un archivo del análisis de la ronda en curso con el plan
 * enviado o aprobado. Nadie lo quita (`ARCHIVO_FIRMADO`); el Admin SGC lo retira por datos personales.
 */
export async function estaCongelado(
  sql: Cliente,
  archivo: { id: number; contexto: string; contextoId: number; rol: string },
): Promise<boolean> {
  if (!CONTEXTOS_CON_RETIRO.includes(archivo.contexto) || !esId(archivo.id)) return false;
  const [f] = await sql`SELECT 1 FROM archivos a
    WHERE a.id = ${archivo.id} AND a.contexto = ${archivo.contexto} AND a.contexto_id = ${archivo.contextoId} AND a.rol = ${archivo.rol}
      AND a.version_id IS NULL AND ${congeladoSql(sql)}`;
  return f !== undefined;
}

/**
 * Los archivos de un dueño, en el orden en que se subieron, con su marca de congelado, y los que se le retiraron por datos
 * personales (los eventos `archivo_retirado` de su hallazgo con ese dueño, en orden); los dos vacíos para quien no los abre.
 */
export async function archivosDe(
  sql: Cliente,
  sesion: SujetoVisibilidad,
  x: { contexto: string; contextoId: number },
): Promise<ArchivosDeMejora> {
  if (!(await puedeAbrirArchivoDeMejora(x, sesion, { sql }))) return { archivos: [], retirados: [] };
  const filas = await sql`SELECT a.id, a.nombre_original, a.rol, a.tamano_bytes, a.mime, ${congeladoSql(sql)} AS congelado FROM archivos a
    WHERE a.contexto = ${x.contexto} AND a.contexto_id = ${x.contextoId} AND a.version_id IS NULL ORDER BY a.id`;
  const delHallazgo =
    x.contexto === "mejora_hallazgo" ? sql`${x.contextoId}` : sql`(SELECT r.hallazgo_id FROM mejora_rondas r WHERE r.id = ${x.contextoId})`;
  const retirados = CONTEXTOS_CON_RETIRO.includes(x.contexto)
    ? await sql`SELECT e.detalle->>'nombre' AS nombre, e.detalle->>'rol' AS rol, e.ocurrio_en FROM mejora_eventos e
        WHERE e.hallazgo_id = ${delHallazgo} AND e.tipo = 'archivo_retirado'
          AND e.detalle->>'contexto' = ${x.contexto} AND e.detalle->>'contextoId' = ${String(x.contextoId)}
        ORDER BY e.ocurrio_en, e.id`
    : [];
  return {
    archivos: filas.map((a) => ({
      id: Number(a.id),
      nombre: a.nombre_original as string,
      rol: a.rol as string,
      tamano: Number(a.tamano_bytes),
      mime: a.mime as string,
      congelado: a.congelado === true,
    })),
    retirados: retirados.map((r) => ({ nombre: (r.nombre as string | null) ?? "", rol: (r.rol as string | null) ?? "", en: r.ocurrio_en as Date })),
  };
}

/** Los retiros de una sección (los de ese rol), con su día en la zona de la instalación: lo que pinta `ArchivosDe`. */
export function retiradosDeLaSeccion(lista: Pick<ArchivosDeMejora, "retirados">, rol: string, zona: string): Array<{ dia: string }> {
  return lista.retirados.filter((r) => r.rol === rol).map((r) => ({ dia: fechaEnZona(r.en, zona) }));
}

type ArchivoPorQuitar = { id: number; contexto: string; contextoId: number; rol: string };

/**
 * Lo que la 15A ya dejaba sin quitar, por nadie (tampoco el Admin SGC), con su frase; `null` si nada de eso aplica. Lo usan quitar
 * (antes de la regla de lo firmado y de la de quién) y el retiro por datos personales, que no alcanza a nada de esto (anexo §11.2).
 */
async function loQueNadieQuita(sql: Cliente, a: ArchivoPorQuitar, f: Dueno): Promise<string | null> {
  const esReporte = a.contexto === "mejora_reporte";
  // Un plan anulado no admite cambios, tampoco del Admin SGC; y el oficio de una respuesta al ente registrada desde el plan
  // (anexo §3.8) ya es evidencia: nadie lo quita. Se dice aquí, antes de que la llave de `mejora_plan_respuestas` dé un 23503.
  if (a.contexto === "mejora_plan") {
    if (f.planAnulado) return PLAN_ANULADO;
    const [oficio] = await sql`SELECT 1 FROM mejora_plan_respuestas WHERE archivo_id = ${a.id}`;
    if (oficio) return OFICIO_REGISTRADO;
  }
  if (a.contexto === "mejora_ronda" && f.rondaNumero !== f.ronda) return RONDA_CONGELADA;
  if (!esReporte && (TERMINALES as readonly string[]).includes(f.estado ?? "")) {
    return "El hallazgo ya terminó: sus archivos no se quitan";
  }
  // La evidencia de la corrección es lo que se decide y se valida (SGC-PR-03, PC-02: no se cierra sin evidencia): pasada la
  // corrección nadie la quita, tampoco el Admin SGC. Si hay que cambiarla, se devuelve la corrección.
  // El formato firmado de una carga es la evidencia de lo hecho en papel (spec §15): confirmó la carga y nadie lo quita, tampoco el
  // Admin SGC. Si se subió uno equivocado, se sube el bueno además.
  if (a.contexto === "mejora_hallazgo" && a.rol === "carga") return FORMATO_DE_LA_CARGA;
  if (a.contexto === "mejora_hallazgo" && a.rol === "correccion" && f.estado !== "por_corregir") {
    return "La evidencia de la corrección solo se quita mientras está por corregir";
  }
  // Lo mismo con la de una actividad (PC-05: no se termina sin evidencia): terminada o cancelada, nadie la quita, tampoco el
  // Admin SGC; si la verificación la devuelve y vuelve a estar en curso, sí.
  if (a.contexto === "mejora_actividad" && (f.estadoActividad === "terminada" || f.estadoActividad === "cancelada")) {
    return EVIDENCIA_DE_ACTIVIDAD_CERRADA;
  }
  // Lo mismo con la de la verificación (PC-08): la que había al verificar quedó en el evento de la verificación y ya no se
  // quita; la que se sube durante la espera (la de la eficacia), solo hasta que se registra la evaluación. Tampoco el Admin SGC.
  // El oficio de la respuesta al ente (spec §13.4), el archivo que eligió quien la registró, quedó en su evento: ya no se quita,
  // tampoco el Admin SGC. Las demás evidencias del hallazgo siguen su regla.
  if (a.contexto === "mejora_hallazgo" && a.rol === "evidencia" && f.hallazgoId !== null) {
    const [registrado] = await sql`SELECT 1 FROM mejora_eventos
      WHERE hallazgo_id = ${f.hallazgoId} AND tipo = 'respuesta_ente' AND detalle->>'oficioId' = ${String(a.id)} LIMIT 1`;
    if (registrado) return OFICIO_REGISTRADO;
  }
  if (a.contexto === "mejora_ronda" && a.rol === "verificacion" && f.hallazgoId !== null) {
    const [usada] = await sql`SELECT 1 FROM mejora_eventos
      WHERE hallazgo_id = ${f.hallazgoId} AND tipo = 'verificar_implementacion'
        AND detalle->'archivosVerificados' @> jsonb_build_array(${a.id}::bigint) LIMIT 1`;
    if (usada) return EVIDENCIA_VERIFICADA;
    const [evaluada] = await sql`SELECT 1 FROM mejora_rondas WHERE id = ${a.contextoId} AND evaluada_en IS NOT NULL`;
    if (evaluada) return EVIDENCIA_EVALUADA;
  }
  return null;
}

/** La frase de por qué la persona no puede quitar el archivo, o `null` si puede (las reglas de `quitarArchivoDeMejora`). */
async function porQueNoSeQuita(sql: Cliente, sesion: SesionFlujo, a: ArchivoPorQuitar, bloquear: boolean): Promise<string | null> {
  const f = await cargarDueno(sql, a.contexto, a.contextoId, bloquear);
  if (!f) return NO_EXISTE;
  const nadie = await loQueNadieQuita(sql, a, f);
  if (nadie) return nadie;
  // Lo que ya se firmó (anexo §11.2): nadie lo quita, tampoco el Admin SGC; se retira por datos personales.
  if (await estaCongelado(sql, a)) return ARCHIVO_FIRMADO;
  const esReporte = a.contexto === "mejora_reporte";
  const destino = { contexto: a.contexto, id: a.contextoId, rol: a.rol } as DestinoDeMejora;
  const [subio] = await sql`SELECT usuario_id FROM auditoria
    WHERE accion = 'subir_archivo' AND entidad = 'archivo' AND entidad_id = ${a.id} ORDER BY id LIMIT 1`;
  const suyo = subio !== undefined && Number(subio.usuario_id) === sesion.usuarioId;
  const admin = sesion.rol === "admin_sgc" && (!esReporte || f.estadoReporte === "recibido");
  const abierto = esReporte ? f.estadoReporte === "recibido" : cerrado(destino, f) === null;
  return admin || (suyo && abierto) ? null : "No puede quitar este archivo";
}

/**
 * La frase de por qué el archivo no se retira por datos personales, o `null` si se retira (anexo §11.2): solo uno de los que esa
 * sección congela (`estaCongelado`), de un hallazgo sin terminar, y nada de lo que la 15A ya dejaba sin quitar (`loQueNadieQuita`).
 * El permiso (`mejora.gestionar`) va aparte.
 */
async function porQueNoSeRetira(sql: Cliente, a: ArchivoPorQuitar, f: Dueno): Promise<string | null> {
  if (!CONTEXTOS_CON_RETIRO.includes(a.contexto)) return NO_SE_RETIRA_POR_AQUI;
  if ((TERMINALES as readonly string[]).includes(f.estado ?? "")) return HALLAZGO_TERMINADO;
  if (await loQueNadieQuita(sql, a, f)) return NO_SE_RETIRA_POR_AQUI;
  return (await estaCongelado(sql, a)) ? null : NO_SE_RETIRA_POR_AQUI;
}

/** De esos archivos, los que la persona puede quitar hoy (para pintar el botón; el servidor lo vuelve a decidir al quitar). */
export async function archivosQuitables(
  sql: Cliente,
  sesion: SesionFlujo,
  archivos: Array<{ id: number }>,
  x: { contexto: string; contextoId: number },
): Promise<number[]> {
  const salida: number[] = [];
  for (const a of archivos) {
    const [fila] = await sql`SELECT rol FROM archivos WHERE id = ${a.id}`;
    if (fila && (await porQueNoSeQuita(sql, sesion, { id: a.id, contexto: x.contexto, contextoId: x.contextoId, rol: fila.rol }, false)) === null) {
      salida.push(a.id);
    }
  }
  return salida;
}

/**
 * De esos archivos (los de `archivosDe`), los que la persona puede retirar hoy por datos personales: solo el Admin SGC
 * (`mejora.gestionar`) y solo los congelados (para pintar el botón; el servidor lo vuelve a decidir al retirar).
 */
export async function archivosRetirables(
  sql: Cliente,
  sesion: SesionFlujo,
  archivos: ReadonlyArray<Pick<ArchivoDeMejora, "id" | "rol" | "congelado">>,
  x: { contexto: string; contextoId: number },
): Promise<number[]> {
  const congelados = archivos.filter((a) => a.congelado);
  if (!puede(sesion, "mejora.gestionar") || congelados.length === 0) return [];
  const f = await cargarDueno(sql, x.contexto, x.contextoId, false);
  if (!f) return [];
  const salida: number[] = [];
  for (const a of congelados) {
    if ((await porQueNoSeRetira(sql, { id: a.id, contexto: x.contexto, contextoId: x.contextoId, rol: a.rol }, f)) === null) salida.push(a.id);
  }
  return salida;
}

/** El hallazgo del dueño de un archivo que puede congelarse (el hallazgo o la ronda); `null` para los demás dueños. */
async function hallazgoDelDueno(sql: Cliente, contexto: string, contextoId: number): Promise<number | null> {
  if (contexto === "mejora_hallazgo") return contextoId;
  if (contexto !== "mejora_ronda") return null;
  const [r] = await sql`SELECT hallazgo_id FROM mejora_rondas WHERE id = ${contextoId}`;
  return r ? Number(r.hallazgo_id) : null;
}

/**
 * Retira por datos personales un archivo que ya se firmó (anexo §11.2; Ley 1581 de 2012): la salida para uno subido por error con
 * datos de un paciente o de quien se quejó. Solo el Admin SGC (`mejora.gestionar`), con justificación (al menos diez caracteres) y
 * mientras el hallazgo no ha terminado, y solo un archivo de los que esa sección congela (`estaCongelado`); a lo demás,
 * `NO_SE_RETIRA_POR_AQUI`. En una transacción: el hallazgo `FOR UPDATE` primero (`bloquearHallazgo`) y la fila del archivo después;
 * el evento `archivo_retirado` del hallazgo con el nombre, el tamaño, la huella, el rol, el dueño y quién lo había subido, y la
 * justificación, que va **solo** al evento (spec §6.4); la bitácora `mejora_archivo_retirado`, con ids y el rol; y el borrado de la
 * fila. Ninguna huella firmada cambia: los archivos no entran a la huella del plan. Después de confirmar, el archivo sale del
 * almacén; si ese borrado falla, se registra y no se deshace nada (ya no se sirve). `opciones.ahora` es la hora del evento.
 */
export async function retirarPorDatosPersonales(
  sesion: SesionFlujo,
  d: { archivoId: number; justificacion: string },
  opciones?: { sql?: Cliente; ahora?: Date },
): Promise<void> {
  requerirPermiso(sesion, "mejora.gestionar");
  const leido = EsquemaRetiroDeArchivo.safeParse(d);
  if (!leido.success) throw new ErrorMejora(leido.error.issues[0].message);
  const { archivoId, justificacion } = leido.data;
  const ahora = opciones?.ahora ?? new Date();
  const ruta = await legible(
    enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
      // Sin candado, solo para saber de qué hallazgo es: el hallazgo va primero, como en todo camino del módulo.
      const [leida] = await tx`SELECT contexto, contexto_id FROM archivos
        WHERE id = ${archivoId} AND version_id IS NULL AND contexto = ANY(${CONTEXTOS_DE_MEJORA})`;
      if (!leida) throw new ErrorMejora(NO_EXISTE);
      const contexto = leida.contexto as string;
      const contextoId = Number(leida.contexto_id);
      const hallazgoId = await hallazgoDelDueno(tx, contexto, contextoId);
      const h = hallazgoId === null ? null : await bloquearHallazgo(tx, hallazgoId);
      if (!(await puedeAbrirArchivoDeMejora({ contexto, contextoId }, sesion, { sql: tx }))) throw new ErrorMejora(NO_EXISTE);
      if (!h) throw new ErrorMejora(NO_SE_RETIRA_POR_AQUI);
      const [a] = await tx`SELECT id, ruta, nombre_original, rol, tamano_bytes, hash_sha256 FROM archivos
        WHERE id = ${archivoId} AND contexto = ${contexto} AND contexto_id = ${contextoId} FOR UPDATE`;
      if (!a) throw new ErrorMejora(NO_EXISTE);
      const archivo = { id: archivoId, contexto, contextoId, rol: a.rol as string };
      const f = await cargarDueno(tx, contexto, contextoId, false);
      if (!f) throw new ErrorMejora(NO_EXISTE);
      const motivo = await porQueNoSeRetira(tx, archivo, f);
      if (motivo) throw new ErrorMejora(motivo);
      const [subio] = await tx`SELECT au.usuario_id, u.nombre FROM auditoria au LEFT JOIN usuarios u ON u.id = au.usuario_id
        WHERE au.accion = 'subir_archivo' AND au.entidad = 'archivo' AND au.entidad_id = ${archivoId} ORDER BY au.id LIMIT 1`;
      const lo = { archivoId, contexto, contextoId, rol: archivo.rol };
      await dejarEvento(tx, {
        hallazgoId: h.id,
        ronda: h.ronda,
        tipo: "archivo_retirado",
        detalle: {
          ...lo,
          nombre: a.nombre_original as string,
          tamano: Number(a.tamano_bytes),
          huella: a.hash_sha256 as string,
          subidoPor: subio?.usuario_id == null ? null : Number(subio.usuario_id),
          subidoPorNombre: (subio?.nombre as string | null | undefined) ?? null,
          // El porqué es texto libre: va al evento, que se lee con el hallazgo, nunca a la bitácora (spec §6.4).
          justificacion,
        },
        usuarioId: sesion.usuarioId,
        ocurrioEn: ahora,
      });
      await registrarAuditoria(tx, {
        usuarioId: sesion.usuarioId,
        accion: "mejora_archivo_retirado",
        entidad: ENTIDAD_HALLAZGO,
        entidadId: h.id,
        detalle: { codigo: h.codigo, ...lo },
      });
      await tx`DELETE FROM archivos WHERE id = ${archivoId}`;
      return a.ruta as string;
    }),
  );
  const absoluta = resolverRutaAlmacen(ruta);
  if (!absoluta) return;
  await unlink(absoluta).catch((err: NodeJS.ErrnoException) => {
    // Ya no se sirve (la fila no existe): que falte del almacén no es un error; otro fallo se registra y no se deshace nada.
    if (err?.code !== "ENOENT") console.error(`No se pudo borrar del almacén el archivo retirado ${archivoId}:`, err);
  });
}

/**
 * Lo que sigue a registrar un archivo de mejoramiento, en la misma transacción (`registrarArchivo`, después del `INSERT` y de su
 * bitácora): el de un plan deja su línea `archivo` en el historial del plan, con el archivo y quién (anexo §3.7). Los demás
 * dueños no llevan nada más.
 */
export async function alRegistrarArchivoDeMejora(
  tx: TransactionSql,
  a: { contexto: string; contextoId: number; archivoId: number; nombre: string; usuarioId: number; ahora: Date },
): Promise<void> {
  if (a.contexto !== "mejora_plan") return;
  await dejarEventoDePlan(tx, {
    planId: a.contextoId,
    tipo: "archivo",
    detalle: { archivoId: a.archivoId, nombre: a.nombre },
    usuarioId: a.usuarioId,
    ahora: a.ahora,
  });
}

/**
 * Quita un archivo: quien lo subió, mientras su paso sigue abierto, o el Admin SGC mientras el hallazgo no termine (un
 * reporte, mientras esté recibido; un plan, mientras no esté anulado); en un hallazgo terminado o un plan anulado, nadie. La
 * evidencia de la corrección, solo mientras está «Por corregir», la de una actividad, solo mientras está abierta o en proceso, y
 * la de la verificación, solo hasta verificar (la que se sube en la espera, hasta registrar la evaluación), y el oficio de una
 * respuesta al ente ya registrada (del hallazgo o del plan) y el formato firmado de una carga, nunca: después, tampoco el Admin
 * SGC. Lo que ya se firmó (`estaCongelado`, anexo 15B §11.2) tampoco, por nadie (`ARCHIVO_FIRMADO`): se retira por datos personales
 * (`retirarPorDatosPersonales`). Quien no abre el archivo recibe «no existe». Borra la fila y deja `eliminar_archivo` en la
 * bitácora (el de un plan, además, su línea `archivo_quitado` en el historial del plan, a la hora de `opciones.ahora`); el archivo
 * del almacén se borra después de confirmar y uno ya ausente no es un error.
 */
export async function quitarArchivoDeMejora(
  sesion: SesionFlujo,
  archivoId: number,
  opciones?: { sql?: Cliente; ahora?: Date },
): Promise<void> {
  if (!esId(archivoId)) throw new ErrorMejora(NO_EXISTE);
  const ahora = opciones?.ahora ?? new Date();
  const ruta = await legible(enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    // Orden de candados: el dueño (el hallazgo, el reporte o el plan) primero y la fila de `archivos` después, como al subir.
    const [a] = await tx`SELECT id, ruta, nombre_original, contexto, contexto_id, rol FROM archivos
      WHERE id = ${archivoId} AND version_id IS NULL AND contexto = ANY(${CONTEXTOS_DE_MEJORA})`;
    if (!a || !(await puedeAbrirArchivoDeMejora({ contexto: a.contexto, contextoId: Number(a.contexto_id) }, sesion, { sql: tx }))) {
      throw new ErrorMejora(NO_EXISTE);
    }
    const contextoId = Number(a.contexto_id);
    const motivo = await porQueNoSeQuita(tx, sesion, { id: archivoId, contexto: a.contexto, contextoId, rol: a.rol }, true);
    if (motivo) throw new ErrorMejora(motivo);
    const [vigente] = await tx`SELECT id FROM archivos WHERE id = ${archivoId} FOR UPDATE`;
    if (!vigente) throw new ErrorMejora(NO_EXISTE);
    await tx`DELETE FROM archivos WHERE id = ${archivoId}`;
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "eliminar_archivo",
      entidad: "archivo",
      entidadId: archivoId,
      detalle: { contexto: a.contexto, contextoId, rol: a.rol, nombre: a.nombre_original },
    });
    if (a.contexto === "mejora_plan") {
      await dejarEventoDePlan(tx, {
        planId: contextoId,
        tipo: "archivo_quitado",
        detalle: { archivoId, nombre: a.nombre_original },
        usuarioId: sesion.usuarioId,
        ahora,
      });
    }
    return a.ruta as string;
  }));
  const absoluta = resolverRutaAlmacen(ruta);
  if (absoluta) await unlink(absoluta).catch(() => {});
}
