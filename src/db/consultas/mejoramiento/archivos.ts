/**
 * Los archivos del módulo de mejoramiento (spec 15 §6.3 y §12.2): filas de `archivos` con contexto `mejora_hallazgo`,
 * `mejora_ronda`, `mejora_actividad` o `mejora_reporte`, siempre con `version_id` nulo. El control de acceso de un archivo
 * es el de su dueño: quién lo sube (`autorizarSubida`), quién lo abre (`puedeAbrirArchivoDeMejora`, `src/lib/alcance.ts`) y
 * quién lo quita (`quitarArchivoDeMejora`). Quien no puede abrir un archivo recibe «no existe», nunca «sin permiso».
 *
 * Módulo liviano: lo importa `registrarArchivo` (`admin.ts`); no importa `lectura` ni `flujo`.
 */
import { unlink } from "node:fs/promises";
import type { TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { enTransaccion, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { puedeAbrirArchivoDeMejora, puedeVerificar, type SujetoVisibilidad } from "@/lib/alcance";
import { resolverRutaAlmacen } from "@/lib/almacen";
import { MAXIMO_POR_REPORTE } from "@/lib/mejoramiento/reportes";
import { ErrorMejora, TERMINALES } from "@/lib/mejoramiento/tipos";
import type { ArchivoServible } from "@/lib/servir-archivo";
import { actuaPorElProceso } from "./avisos";

export type DestinoDeMejora =
  | { contexto: "mejora_hallazgo"; id: number; rol: "evidencia" | "correccion" | "carga" }
  | { contexto: "mejora_ronda"; id: number; rol: "analisis" | "verificacion" }
  | { contexto: "mejora_actividad"; id: number }
  | { contexto: "mejora_reporte"; id: number };

const CARPETAS_POR_CONTEXTO = {
  mejora_hallazgo: "hallazgos",
  mejora_ronda: "rondas",
  mejora_actividad: "actividades",
  mejora_reporte: "reportes",
} as const;

/** Los roles de archivo que admite cada destino, para validar `?rol=` antes de recibir el cuerpo. */
export const ROLES_POR_DESTINO = {
  mejora_hallazgo: ["evidencia", "correccion", "carga"],
  mejora_ronda: ["analisis", "verificacion"],
} as const;

// El tope de archivos de un reporte vive en `src/lib/mejoramiento/reportes.ts` (lo pinta también el formulario de reportar).
export { MAXIMO_POR_REPORTE };

const NO_EXISTE = "El archivo no existe";
const SIN_DUENO = "Ya no existe a qué adjuntar el archivo";

type Persona = Pick<SesionFlujo, "usuarioId" | "rol">;
type Resultado = { ok: true; carpeta: string } | { ok: false; estado: 403 | 404 | 409; error: string };

/** Lo que hace falta del dueño de un archivo, de su hallazgo y, si lo hay, de su ronda, actividad o reporte. */
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
};

const SIN_NADA: Dueno = {
  hallazgoId: null, procesoId: null, estado: null, ronda: null, cargado: false, registradoPor: null, rondaNumero: null,
  responsableId: null, estadoActividad: null, reportadoPor: null, estadoReporte: null, archivos: 0,
};

/** Los cuatro contextos de `archivos` de este módulo. */
export const CONTEXTOS_DE_MEJORA: string[] = Object.keys(CARPETAS_POR_CONTEXTO);

const esId = (n: number) => Number.isSafeInteger(n) && n > 0;

/**
 * Lee el dueño. Con `bloquear`, el hallazgo `FOR SHARE` (choca con el `FOR UPDATE` de `transicionarHallazgo`: el estado que
 * se lee es el que rige al escribir la fila) o, en un reporte, el reporte `FOR UPDATE`, y los archivos del reporte se cuentan
 * en otra sentencia, después del candado: en READ COMMITTED cada sentencia toma su propia foto, así quien esperó el candado
 * cuenta el archivo que la otra subida acaba de confirmar (dos subidas a la vez respetan el tope).
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
  }
}

/** La frase de por qué el destino ya no admite el archivo, o `null` si sigue abierto («Mientras» de la tabla). */
function cerrado(d: DestinoDeMejora, f: Dueno): string | null {
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
 * sigue siendo quien sube (el estado puede cambiar entre la autorización y el registro). Lanza `ErrorMejora`.
 */
export async function exigirDestinoAbierto(
  tx: TransactionSql,
  contexto: string,
  contextoId: number,
  usuarioId: number,
  rol?: string,
): Promise<void> {
  if (contexto in ROLES_POR_DESTINO && rol === undefined) {
    throw new Error(`exigirDestinoAbierto: el destino ${contexto} exige el rol del archivo`);
  }
  const f = await cargarDueno(tx, contexto, contextoId, true);
  if (!f) throw new ErrorMejora(SIN_DUENO);
  const [u] = await tx`SELECT rol FROM usuarios WHERE id = ${usuarioId} AND activo`;
  if (!u) throw new ErrorMejora(SIN_PERMISO);
  const roles: readonly string[] = ROLES_POR_DESTINO[contexto as keyof typeof ROLES_POR_DESTINO] ?? [];
  if (roles.length > 0 && !roles.includes(rol ?? "")) throw new ErrorMejora("El rol del archivo no es válido para este destino");
  const destino = { contexto, id: contextoId, ...(roles.length > 0 ? { rol } : {}) } as DestinoDeMejora;
  const r = await evaluar(tx, { usuarioId, rol: u.rol }, destino, f);
  if (r && !r.ok) throw new ErrorMejora(r.error);
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

export type ArchivoDeMejora = { id: number; nombre: string; rol: string; tamano: number; mime: string };

/** Los archivos de un dueño, en el orden en que se subieron; vacío para quien no los abre. */
export async function archivosDe(
  sql: Cliente,
  sesion: SujetoVisibilidad,
  x: { contexto: string; contextoId: number },
): Promise<ArchivoDeMejora[]> {
  if (!(await puedeAbrirArchivoDeMejora(x, sesion, { sql }))) return [];
  const filas = await sql`SELECT id, nombre_original, rol, tamano_bytes, mime FROM archivos
    WHERE contexto = ${x.contexto} AND contexto_id = ${x.contextoId} AND version_id IS NULL ORDER BY id`;
  return filas.map((a) => ({
    id: Number(a.id), nombre: a.nombre_original as string, rol: a.rol as string, tamano: Number(a.tamano_bytes), mime: a.mime as string,
  }));
}

type ArchivoPorQuitar = { id: number; contexto: string; contextoId: number; rol: string };

/** La frase de por qué la persona no puede quitar el archivo, o `null` si puede (las reglas de `quitarArchivoDeMejora`). */
async function porQueNoSeQuita(sql: Cliente, sesion: SesionFlujo, a: ArchivoPorQuitar, bloquear: boolean): Promise<string | null> {
  const f = await cargarDueno(sql, a.contexto, a.contextoId, bloquear);
  if (!f) return NO_EXISTE;
  const destino = { contexto: a.contexto, id: a.contextoId, rol: a.rol } as DestinoDeMejora;
  const esReporte = a.contexto === "mejora_reporte";
  if (a.contexto === "mejora_ronda" && f.rondaNumero !== f.ronda) return RONDA_CONGELADA;
  if (!esReporte && (TERMINALES as readonly string[]).includes(f.estado ?? "")) {
    return "El hallazgo ya terminó: sus archivos no se quitan";
  }
  // La evidencia de la corrección es lo que se decide y se valida (SGC-PR-03, PC-02: no se cierra sin evidencia): pasada la
  // corrección nadie la quita, tampoco el Admin SGC. Si hay que cambiarla, se devuelve la corrección.
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
  if (a.contexto === "mejora_ronda" && a.rol === "verificacion" && f.hallazgoId !== null) {
    const [usada] = await sql`SELECT 1 FROM mejora_eventos
      WHERE hallazgo_id = ${f.hallazgoId} AND tipo = 'verificar_implementacion'
        AND detalle->'archivosVerificados' @> jsonb_build_array(${a.id}::bigint) LIMIT 1`;
    if (usada) return EVIDENCIA_VERIFICADA;
    const [evaluada] = await sql`SELECT 1 FROM mejora_rondas WHERE id = ${a.contextoId} AND evaluada_en IS NOT NULL`;
    if (evaluada) return EVIDENCIA_EVALUADA;
  }
  const [subio] = await sql`SELECT usuario_id FROM auditoria
    WHERE accion = 'subir_archivo' AND entidad = 'archivo' AND entidad_id = ${a.id} ORDER BY id LIMIT 1`;
  const suyo = subio !== undefined && Number(subio.usuario_id) === sesion.usuarioId;
  const admin = sesion.rol === "admin_sgc" && (!esReporte || f.estadoReporte === "recibido");
  const abierto = esReporte ? f.estadoReporte === "recibido" : cerrado(destino, f) === null;
  return admin || (suyo && abierto) ? null : "No puede quitar este archivo";
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
 * Quita un archivo: quien lo subió, mientras su paso sigue abierto, o el Admin SGC mientras el hallazgo no termine (un
 * reporte, mientras esté recibido); en un hallazgo terminado, nadie. La evidencia de la corrección, solo mientras está «Por
 * corregir», la de una actividad, solo mientras está abierta o en proceso, y la de la verificación, solo hasta verificar (la que se
 * sube en la espera, hasta registrar la evaluación): después, tampoco el Admin SGC. Quien no abre el archivo recibe «no existe». Borra la
 * fila y deja `eliminar_archivo` en la bitácora; el archivo del almacén se borra después de confirmar y uno ya ausente no
 * es un error.
 */
export async function quitarArchivoDeMejora(
  sesion: SesionFlujo,
  archivoId: number,
  opciones?: { sql?: Cliente },
): Promise<void> {
  if (!esId(archivoId)) throw new ErrorMejora(NO_EXISTE);
  const ruta = await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    // Orden de candados: el dueño (el hallazgo, o el reporte) primero y la fila de `archivos` después, como al subir.
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
    return a.ruta as string;
  });
  const absoluta = resolverRutaAlmacen(ruta);
  if (absoluta) await unlink(absoluta).catch(() => {});
}
