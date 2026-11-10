import type { Row } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import { enTransaccion, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { crearNotificacion } from "@/db/consultas/notificaciones";
import { adminsActivos } from "@/db/consultas/tramites";
import { filtroPuntos, type SujetoVisibilidad } from "@/lib/alcance";
import { numeroDeCopia } from "@/lib/distribucion/copias";
import { enlaceDeHallazgo } from "@/lib/distribucion/hallazgos";
import { ErrorDistribucion } from "@/lib/distribucion/tipos";
import { ErrorPermiso, puede } from "@/lib/permisos";
import { fechaLimite } from "@/lib/tramites/plazos";
import { textoFecha } from "@/lib/vigencia/plazo";
import { zonaHoraria } from "@/lib/zona-horaria";
import type { Copia } from "./copias";
import { evidenciasDeVarios, type Evidencia } from "./evidencias";
import { exigirSinOtroAdmin, hayOtroAdmin } from "./otro-admin";

type Opciones = { sql?: Cliente; ahora?: Date };

export type EstadoHallazgo = "abierto" | "por_validar" | "cerrado";

export type Hallazgo = {
  id: number;
  punto: { id: number; nombre: string };
  origen: "verificacion" | "recogida";
  verificacionId: number | null;
  itemId: number | null;
  copia: { id: number; codigo: string; version: number; numero: number } | null;
  descripcion: string;
  retiradoEnElActo: boolean;
  responsable: { id: number; nombre: string };
  estado: EstadoHallazgo;
  venceEn: Date;
  creadoEn: Date;
  /** El «Corregido» del responsable, mientras el hallazgo espera validación o ya cerrado. */
  correccion: { en: Date; porId: number; por: string; nota: string } | null;
  cierre: { en: Date; porId: number; por: string; nota: string } | null;
  /** Quién cerró: el Admin SGC (validó o cerró directamente) o la siguiente verificación del punto. */
  validacion: "admin" | "verificacion" | null;
  validacionVerificacionId: number | null;
  reaperturas: number;
  /** Las fotos del ítem de la verificación que lo abrió. */
  fotos: Evidencia[];
  /** Las fotos que adjuntó quien lo corrigió (contexto `hallazgo`). */
  fotosCorreccion: Evidencia[];
};

export type DatosHallazgo = {
  puntoId: number;
  origen: "verificacion" | "recogida";
  verificacionId?: number;
  itemId?: number;
  copiaId?: number;
  documentoId?: number;
  descripcion: string;
  retiradoEnElActo: boolean;
  responsableId: number;
  ahora: Date;
  plazoDias: number;
  /** La fecha de corrección que eligió el verificador (fin de ese día); manda sobre `plazoDias`. */
  venceEn?: Date;
  /** Solo para el aviso: por defecto se arma con la descripción y el nombre del punto. */
  titulo?: string;
};

/** Inserta el hallazgo y avisa a su responsable, dentro de la transacción de quien lo origina. */
export async function abrirHallazgo(tx: Cliente, d: DatosHallazgo): Promise<{ hallazgoId: number }> {
  const [h] = await tx`
    INSERT INTO hallazgos
      (punto_uso_id, origen, verificacion_id, item_id, copia_id, documento_id, descripcion, retirado_en_el_acto,
       responsable_id, estado, vence_en, creado_en)
    VALUES (${d.puntoId}, ${d.origen}, ${d.verificacionId ?? null}, ${d.itemId ?? null}, ${d.copiaId ?? null},
            ${d.documentoId ?? null}, ${d.descripcion}, ${d.retiradoEnElActo}, ${d.responsableId}, 'abierto',
            ${d.venceEn ?? fechaLimite(d.ahora, d.plazoDias, zonaHoraria())}, ${d.ahora})
    RETURNING id`;
  const hallazgoId = Number(h.id);
  let titulo = d.titulo;
  if (!titulo) {
    const [p] = await tx`SELECT nombre FROM puntos_uso WHERE id = ${d.puntoId}`;
    titulo = `Hallazgo abierto en ${p.nombre}: ${d.descripcion}`;
  }
  const enlace = enlaceDeHallazgo({ origen: d.origen, verificacionId: d.verificacionId ?? null, copiaId: d.copiaId ?? null });
  await crearNotificacion(
    { usuarioId: d.responsableId, tipo: "distribucion.hallazgo", titulo, enlace, entidad: "hallazgo", entidadId: hallazgoId },
    tx,
  );
  return { hallazgoId };
}

/** La copia que no se encontró al recogerla: el hallazgo nace en la misma transacción de la recogida. */
export async function abrirHallazgoDeRecogida(tx: Cliente, copia: Copia, ahora: Date, plazoDias: number): Promise<void> {
  const numero = numeroDeCopia(copia.numero);
  await abrirHallazgo(tx, {
    puntoId: copia.punto.id,
    origen: "recogida",
    copiaId: copia.id,
    documentoId: copia.documentoId,
    descripcion: `La copia N.º ${numero} de ${copia.codigo} v${copia.version} no se encontró al recogerla`,
    retiradoEnElActo: false,
    responsableId: copia.responsableActual.id,
    ahora,
    plazoDias,
    titulo: `Hallazgo abierto: la copia N.º ${numero} de ${copia.codigo} v${copia.version} no se encontró en ${copia.punto.nombre}`,
  });
}

/**
 * Sin filtro de visibilidad: quien llama ya decidió que la persona ve esos hallazgos. El responsable es el actual
 * del punto, el mismo de la tarea, la corrección y los vencimientos. Las fotos (las del ítem y las de la corrección) van
 * en una lectura por contexto; `sinFotos`, para quien solo arma tareas, no las lee.
 */
export async function leerHallazgos(sql: Cliente, condicion: ReturnType<Cliente>, opciones?: { sinFotos?: boolean }): Promise<Hallazgo[]> {
  const filas = await sql`
    SELECT h.id, h.punto_uso_id, pu.nombre AS punto_nombre, h.origen, h.verificacion_id, h.item_id, h.copia_id,
           h.descripcion, h.retirado_en_el_acto, pu.responsable_id, ur.nombre AS responsable_nombre, h.estado,
           h.vence_en, h.creado_en, h.cerrado_en, h.cerrado_por, uc.nombre AS cerrado_por_nombre, h.nota_cierre,
           h.corregido_en, h.corregido_por, uco.nombre AS corregido_por_nombre, h.nota_correccion,
           h.validacion, h.validacion_verificacion_id, h.reaperturas,
           d.codigo AS copia_codigo, v.numero AS copia_version, cc.numero AS copia_numero
    FROM hallazgos h
    JOIN puntos_uso pu ON pu.id = h.punto_uso_id
    JOIN usuarios ur ON ur.id = pu.responsable_id
    LEFT JOIN usuarios uc ON uc.id = h.cerrado_por
    LEFT JOIN usuarios uco ON uco.id = h.corregido_por
    LEFT JOIN copias_controladas cc ON cc.id = h.copia_id
    LEFT JOIN documento_versiones v ON v.id = cc.version_id
    LEFT JOIN documentos d ON d.id = v.documento_id
    WHERE ${condicion}
    ORDER BY CASE h.estado WHEN 'abierto' THEN 0 WHEN 'por_validar' THEN 1 ELSE 2 END, h.vence_en, h.id`;
  const sinFotos = opciones?.sinFotos === true;
  const [correcciones, delItem] = sinFotos
    ? [new Map<number, Evidencia[]>(), new Map<number, Evidencia[]>()]
    : await Promise.all([
        evidenciasDeVarios("hallazgo", filas.map((f) => Number(f.id)), { sql }),
        evidenciasDeVarios("verificacion_item", [...new Set(filas.flatMap((f) => (f.item_id === null ? [] : [Number(f.item_id)])))], { sql }),
      ]);
  const hallazgos: Hallazgo[] = [];
  for (const f of filas) {
    const id = Number(f.id);
    hallazgos.push({
      id,
      punto: { id: Number(f.punto_uso_id), nombre: f.punto_nombre as string },
      origen: f.origen as Hallazgo["origen"],
      verificacionId: f.verificacion_id === null ? null : Number(f.verificacion_id),
      itemId: f.item_id === null ? null : Number(f.item_id),
      copia:
        f.copia_id === null
          ? null
          : { id: Number(f.copia_id), codigo: f.copia_codigo as string, version: Number(f.copia_version), numero: Number(f.copia_numero) },
      descripcion: f.descripcion as string,
      retiradoEnElActo: f.retirado_en_el_acto as boolean,
      responsable: { id: Number(f.responsable_id), nombre: f.responsable_nombre as string },
      estado: f.estado as EstadoHallazgo,
      venceEn: f.vence_en as Date,
      creadoEn: f.creado_en as Date,
      correccion: f.corregido_en
        ? {
            en: f.corregido_en as Date,
            porId: Number(f.corregido_por),
            por: f.corregido_por_nombre as string,
            nota: f.nota_correccion as string,
          }
        : null,
      cierre: f.cerrado_en
        ? { en: f.cerrado_en as Date, porId: Number(f.cerrado_por), por: f.cerrado_por_nombre as string, nota: f.nota_cierre as string }
        : null,
      validacion: (f.validacion as Hallazgo["validacion"]) ?? null,
      validacionVerificacionId: f.validacion_verificacion_id === null ? null : Number(f.validacion_verificacion_id),
      reaperturas: Number(f.reaperturas),
      fotos: f.item_id === null ? [] : (delItem.get(Number(f.item_id)) ?? []),
      fotosCorreccion: correcciones.get(id) ?? [],
    });
  }
  return hallazgos;
}

export async function hallazgosDe(
  filtro: { puntoId?: number; estado?: EstadoHallazgo },
  sesion: SesionFlujo,
  opciones?: Opciones,
): Promise<Hallazgo[]> {
  const sql = opciones?.sql ?? obtenerSql();
  return leerHallazgos(
    sql,
    sql`${filtroPuntos(sql, sesion)}
      AND ${filtro.puntoId === undefined ? sql`true` : sql`h.punto_uso_id = ${filtro.puntoId}`}
      AND ${filtro.estado === undefined ? sql`true` : sql`h.estado = ${filtro.estado}`}`,
  );
}

/** El hallazgo, o `null` si no existe o la persona no lo ve: lo ve quien ve su punto (`filtroPuntos`). */
export async function obtenerHallazgo(id: number, sesion: SesionFlujo, opciones?: Opciones): Promise<Hallazgo | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const [h] = await leerHallazgos(sql, sql`h.id = ${id} AND ${filtroPuntos(sql, sesion)}`);
  return h ?? null;
}

/** Los hallazgos abiertos de los puntos de los que la persona responde hoy: lo que ve como tarea, sin sus fotos. */
export async function hallazgosAbiertosDe(usuarioId: number, opciones?: Opciones): Promise<Hallazgo[]> {
  const sql = opciones?.sql ?? obtenerSql();
  return leerHallazgos(sql, sql`pu.responsable_id = ${usuarioId} AND h.estado = 'abierto'`, { sinFotos: true });
}

/** Corrige el responsable actual del punto o quien gestiona la distribución. */
export function puedeCorregirHallazgo(sesion: SesionFlujo, responsableActualId: number): boolean {
  return (responsableActualId === sesion.usuarioId && puede(sesion, "distribucion.responder")) || puede(sesion, "distribucion.gestionar");
}

/**
 * Lo que la persona puede hacer con cada hallazgo (spec 13C §12.5): «Corregido» el responsable actual del punto (o quien
 * gestiona) mientras está abierto; «Validar» y «Reabrir» quien realiza verificaciones, si no lo corrigió él; cerrar
 * directamente, quien gestiona la distribución, salvo su propia corrección y el hallazgo abierto del punto del que
 * responde, mientras haya otro Administrador del SGC.
 */
export type HallazgoConAcciones = Hallazgo & { puedeCorregir: boolean; puedeValidar: boolean; puedeCerrar: boolean };

/**
 * Las marcas de cada hallazgo; consulta si hay otro Admin SGC solo si alguno es suyo: una corrección suya por validar o
 * un hallazgo abierto del punto del que responde.
 */
export async function conAcciones(sql: Cliente, hallazgos: Hallazgo[], sesion: SesionFlujo): Promise<HallazgoConAcciones[]> {
  const suya = (h: Hallazgo) => h.estado === "por_validar" && h.correccion?.porId === sesion.usuarioId;
  const dePropioPunto = (h: Hallazgo) => h.estado === "abierto" && h.responsable.id === sesion.usuarioId;
  const propio = (h: Hallazgo) => suya(h) || dePropioPunto(h);
  const otroAdmin = hallazgos.some(propio) && puede(sesion, "distribucion.gestionar") ? await hayOtroAdmin(sql, sesion.usuarioId) : false;
  return hallazgos.map((h) => ({
    ...h,
    puedeCorregir: h.estado === "abierto" && puedeCorregirHallazgo(sesion, h.responsable.id),
    puedeValidar: h.estado === "por_validar" && puede(sesion, "verificaciones.realizar") && !suya(h),
    puedeCerrar: h.estado !== "cerrado" && puede(sesion, "distribucion.gestionar") && !(propio(h) && otroAdmin),
  }));
}

/** Los hallazgos de una recogida («No se encontró») de la copia que la persona ve por su punto, con sus acciones. */
export async function hallazgosDeCopia(copiaId: number, sesion: SesionFlujo, opciones?: Opciones): Promise<HallazgoConAcciones[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const hallazgos = await leerHallazgos(sql, sql`h.origen = 'recogida' AND h.copia_id = ${copiaId} AND ${filtroPuntos(sql, sesion)}`);
  return conAcciones(sql, hallazgos, sesion);
}

/**
 * Bloquea el hallazgo con lo que la bitácora y los avisos necesitan nombrar, y el texto del ítem que lo abrió. Con
 * `sesion`, solo si la persona ve su punto (`filtroPuntos`): para los demás no existe.
 */
async function bloquear(tx: Cliente, id: number, sesion?: SujetoVisibilidad): Promise<Row | undefined> {
  const [h] = await tx`
    SELECT h.id, h.estado, h.punto_uso_id, pu.nombre AS punto, h.origen, h.verificacion_id, h.copia_id, h.documento_id, h.descripcion,
           h.corregido_por, h.nota_correccion, h.reaperturas, pu.responsable_id AS actual_id,
           dd.codigo AS documento, cc.numero AS copia_numero, cv.numero AS copia_version, cd.codigo AS copia_codigo,
           vi.texto AS item_texto, vi.origen AS item_origen
    FROM hallazgos h
    JOIN puntos_uso pu ON pu.id = h.punto_uso_id
    LEFT JOIN documentos dd ON dd.id = h.documento_id
    LEFT JOIN copias_controladas cc ON cc.id = h.copia_id
    LEFT JOIN documento_versiones cv ON cv.id = cc.version_id
    LEFT JOIN documentos cd ON cd.id = cv.documento_id
    LEFT JOIN verificacion_items vi ON vi.id = h.item_id
    WHERE h.id = ${id} AND ${sesion ? filtroPuntos(tx, sesion) : tx`true`}
    FOR UPDATE OF h`;
  return h;
}

/** Lo que toda acción sobre un hallazgo deja en su `detalle`: el punto, el documento o la copia, y de dónde vino. */
function detalleBase(h: Row) {
  return {
    puntoId: Number(h.punto_uso_id),
    punto: h.punto as string,
    origen: h.origen as string,
    verificacionId: h.verificacion_id === null ? null : Number(h.verificacion_id),
    documento: (h.documento as string | null) ?? null,
    copiaId: h.copia_id === null ? null : Number(h.copia_id),
    copia:
      h.copia_id === null ? null : `N.º ${numeroDeCopia(Number(h.copia_numero))} de ${h.copia_codigo} v${Number(h.copia_version)}`,
    descripcion: h.descripcion as string,
  };
}

const enlaceDe = (h: Row) =>
  enlaceDeHallazgo({
    origen: h.origen as string,
    verificacionId: h.verificacion_id === null ? null : Number(h.verificacion_id),
    copiaId: h.copia_id === null ? null : Number(h.copia_id),
  });

function exigirNota(nota: string, mensaje: string): string {
  const texto = nota.trim();
  if (texto.length < 5) throw new ErrorDistribucion(mensaje);
  return texto;
}

const NO_EXISTE = "El hallazgo no existe";
const YA_CERRADO = "El hallazgo ya está cerrado";
const NO_POR_VALIDAR = "El hallazgo no está por validar";

/**
 * «Corregido» (spec 13C §12.5): el responsable actual del punto con `distribucion.responder`, o quien gestiona la
 * distribución, lo pasa a `por_validar` con su nota; se avisa a los Admin SGC (nadie a sí mismo). Para cualquier otra
 * persona el hallazgo «no existe».
 */
export async function corregirHallazgo(id: number, sesion: SesionFlujo, nota: string, opciones?: Opciones): Promise<void> {
  const ahora = opciones?.ahora ?? new Date();
  const texto = exigirNota(nota, "Escriba qué se hizo para corregirlo (mínimo 5 caracteres)");
  await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    const h = await bloquear(tx, id);
    if (!h || !puedeCorregirHallazgo(sesion, Number(h.actual_id))) throw new ErrorDistribucion(NO_EXISTE);
    if (h.estado === "por_validar") throw new ErrorDistribucion("El hallazgo ya está por validar");
    if (h.estado !== "abierto") throw new ErrorDistribucion(YA_CERRADO);
    await tx`UPDATE hallazgos SET estado = 'por_validar', corregido_en = ${ahora}, corregido_por = ${sesion.usuarioId},
        nota_correccion = ${texto}
      WHERE id = ${id}`;
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "hallazgo_corregido",
      entidad: "hallazgo",
      entidadId: id,
      detalle: { ...detalleBase(h), nota: texto, reaperturas: Number(h.reaperturas) },
    });
    const titulo = `Validar la corrección del hallazgo en ${h.punto}`;
    for (const usuarioId of (await adminsActivos({ sql: tx })).filter((a) => a !== sesion.usuarioId)) {
      await crearNotificacion(
        { usuarioId, tipo: "hallazgo.por_validar", titulo, cuerpo: texto, enlace: enlaceDe(h), entidad: "hallazgo", entidadId: id },
        tx,
      );
    }
  });
}

/** Cierra un hallazgo por validar: lo valida el Admin SGC (`admin`) o la siguiente verificación del punto. */
async function validarEn(
  tx: Cliente,
  h: Row,
  d: { usuarioId: number; ahora: Date; validacion: "admin" | "verificacion"; verificacionId?: number },
): Promise<void> {
  await tx`UPDATE hallazgos SET estado = 'cerrado', validacion = ${d.validacion},
      validacion_verificacion_id = ${d.verificacionId ?? null}, cerrado_en = ${d.ahora}, cerrado_por = ${d.usuarioId},
      nota_cierre = nota_correccion
    WHERE id = ${h.id}`;
  await registrarAuditoria(tx, {
    usuarioId: d.usuarioId,
    accion: "hallazgo_validado",
    entidad: "hallazgo",
    entidadId: Number(h.id),
    detalle: {
      ...detalleBase(h),
      validacion: d.validacion,
      verificacionQueValida: d.verificacionId ?? null,
      nota: h.nota_correccion as string,
      corregidoPor: Number(h.corregido_por),
    },
  });
}

/**
 * Devuelve un hallazgo por validar a `abierto` con una fecha nueva (`plazo_correccion_dias` desde hoy), los avisos de
 * vencimiento en blanco (el plazo nuevo vuelve a avisar) y la corrección borrada: la nota queda en la bitácora.
 */
async function reabrirEn(
  tx: Cliente,
  h: Row,
  d: { usuarioId: number; ahora: Date; nota: string; plazoDias: number; origen: "admin" | "verificacion"; verificacionId?: number },
): Promise<void> {
  const venceEn = fechaLimite(d.ahora, d.plazoDias, zonaHoraria());
  const reaperturas = Number(h.reaperturas) + 1;
  await tx`UPDATE hallazgos SET estado = 'abierto', reaperturas = ${reaperturas}, vence_en = ${venceEn},
      corregido_en = NULL, corregido_por = NULL, nota_correccion = NULL, aviso_vencido_en = NULL, escalado_en = NULL
    WHERE id = ${h.id}`;
  await registrarAuditoria(tx, {
    usuarioId: d.usuarioId,
    accion: "hallazgo_reabierto",
    entidad: "hallazgo",
    entidadId: Number(h.id),
    detalle: {
      ...detalleBase(h),
      reabiertoPor: d.origen,
      verificacionQueReabre: d.verificacionId ?? null,
      nota: d.nota,
      notaCorreccion: (h.nota_correccion as string | null) ?? null,
      reaperturas,
      venceEn: venceEn.toISOString(),
    },
  });
  await crearNotificacion(
    {
      usuarioId: Number(h.actual_id),
      tipo: "distribucion.hallazgo",
      titulo: `Se reabrió el hallazgo en ${h.punto}: ${d.nota}`,
      cuerpo: h.descripcion as string,
      enlace: enlaceDe(h),
      entidad: "hallazgo",
      entidadId: Number(h.id),
    },
    tx,
  );
}

/** «Validar» (`verificaciones.realizar`): cierra un hallazgo por validar con la nota de quien lo corrigió. Quien corrigió no valida. */
export async function validarHallazgo(id: number, sesion: SesionFlujo, opciones?: Opciones): Promise<void> {
  if (!puede(sesion, "verificaciones.realizar")) throw new ErrorPermiso();
  const ahora = opciones?.ahora ?? new Date();
  await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    const h = await bloquear(tx, id, sesion);
    if (!h) throw new ErrorDistribucion(NO_EXISTE);
    if (h.estado !== "por_validar") throw new ErrorDistribucion(NO_POR_VALIDAR);
    if (Number(h.corregido_por) === sesion.usuarioId) throw new ErrorDistribucion("Quien corrigió el hallazgo no puede validarlo");
    await validarEn(tx, h, { usuarioId: sesion.usuarioId, ahora, validacion: "admin" });
  });
}

/** «Reabrir» (`verificaciones.realizar`): la corrección no basta; el hallazgo vuelve a su responsable con un plazo nuevo. */
export async function reabrirHallazgo(id: number, sesion: SesionFlujo, nota: string, opciones?: Opciones): Promise<void> {
  if (!puede(sesion, "verificaciones.realizar")) throw new ErrorPermiso();
  const ahora = opciones?.ahora ?? new Date();
  const texto = exigirNota(nota, "Escriba por qué se reabre (mínimo 5 caracteres)");
  await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    const h = await bloquear(tx, id, sesion);
    if (!h) throw new ErrorDistribucion(NO_EXISTE);
    if (h.estado !== "por_validar") throw new ErrorDistribucion(NO_POR_VALIDAR);
    const { plazoCorreccionDias } = (await obtenerConfigDocumental({ sql: tx })).distribucion;
    await reabrirEn(tx, h, { usuarioId: sesion.usuarioId, ahora, nota: texto, plazoDias: plazoCorreccionDias, origen: "admin" });
  });
}

/** El texto de un ítem para compararlo con otro: sin mayúsculas ni espacios en los extremos. */
const textoComparable = (texto: string) => texto.trim().toLocaleLowerCase("es");

/** Un ítem no conforme de la verificación que se cierra, con lo que identifica de qué trata. */
export type ItemNoConforme = { copiaId: number | null; documentoId: number | null; texto: string; origen: string };

/**
 * La siguiente verificación cerrada del punto valida sus hallazgos por validar (spec 13C §12.5): si no trae un ítem no
 * conforme sobre la misma copia o el mismo documento, pasan a `cerrado` con `validacion = 'verificacion'`; si lo trae, se
 * reabren. Un hallazgo sin copia ni documento (de un ítem fijo o libre) «sigue no conforme» si un ítem no conforme sin
 * copia de este cierre tiene el mismo texto que el ítem que lo abrió (nunca por la descripción, que lleva la nota).
 * Corre al final de `cerrarVerificacion`, en su transacción, y solo escribe en `hallazgos` (la verificación cerrada no se
 * toca). Los hallazgos que abrió esta misma verificación quedan fuera.
 */
export async function validarPorVerificacion(
  tx: Cliente,
  verificacionId: number,
  puntoId: number,
  itemsNoConformes: ItemNoConforme[],
  ahora: Date,
): Promise<{ validados: number; reabiertos: number }> {
  const candidatos = await tx`SELECT h.id FROM hallazgos h
    WHERE h.punto_uso_id = ${puntoId} AND h.estado = 'por_validar' AND h.verificacion_id IS DISTINCT FROM ${verificacionId}
    ORDER BY h.id`;
  if (candidatos.length === 0) return { validados: 0, reabiertos: 0 };
  const [v] = await tx`SELECT cerrada_por FROM verificaciones WHERE id = ${verificacionId}`;
  const usuarioId = Number(v.cerrada_por);
  const { plazoCorreccionDias } = (await obtenerConfigDocumental({ sql: tx })).distribucion;
  const nota = `sigue no conforme en la verificación del ${textoFecha(ahora, zonaHoraria())}`;
  const copias = new Set(itemsNoConformes.flatMap((i) => (i.copiaId === null ? [] : [i.copiaId])));
  const documentos = new Set(itemsNoConformes.flatMap((i) => (i.documentoId === null ? [] : [i.documentoId])));
  const textos = new Set(itemsNoConformes.flatMap((i) => (i.copiaId === null ? [textoComparable(i.texto)] : [])));
  let validados = 0;
  let reabiertos = 0;
  for (const c of candidatos) {
    const h = await bloquear(tx, Number(c.id));
    if (!h || h.estado !== "por_validar") continue;
    const sinCopiaNiDocumento = h.copia_id === null && h.documento_id === null;
    const sigue =
      (h.copia_id !== null && copias.has(Number(h.copia_id))) ||
      (h.documento_id !== null && documentos.has(Number(h.documento_id))) ||
      (sinCopiaNiDocumento &&
        (h.item_origen === "fijo" || h.item_origen === "libre") &&
        textos.has(textoComparable(h.item_texto as string)));
    if (sigue) {
      await reabrirEn(tx, h, { usuarioId, ahora, nota, plazoDias: plazoCorreccionDias, origen: "verificacion", verificacionId });
      reabiertos += 1;
    } else {
      await validarEn(tx, h, { usuarioId, ahora, validacion: "verificacion", verificacionId });
      validados += 1;
    }
  }
  return { validados, reabiertos };
}

/**
 * Cerrar directamente queda para quien gestiona la distribución, desde abierto o por validar: cuenta como validado por
 * el Admin SGC. El responsable marca «Corregido» (`corregirHallazgo`). Quien corrigió no cierra su propia corrección, ni
 * quien responde por el punto un hallazgo abierto de su punto (Ruling 67), mientras haya otro Administrador del SGC
 * activo; si es el único, cierra y la bitácora lo marca (`propioCorrector`, `propioPunto`). Un hallazgo por validar del
 * propio punto que corrigió otro sí lo cierra: es validar una corrección ajena, como `validarHallazgo`.
 */
export async function cerrarHallazgo(id: number, sesion: SesionFlujo, nota: string, opciones?: Opciones): Promise<void> {
  if (!puede(sesion, "distribucion.gestionar")) throw new ErrorPermiso();
  const ahora = opciones?.ahora ?? new Date();
  const texto = exigirNota(nota, "Escriba qué se hizo para corregirlo (mínimo 5 caracteres)");
  await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    const h = await bloquear(tx, id, sesion);
    if (!h) throw new ErrorDistribucion(NO_EXISTE);
    if (h.estado === "cerrado") throw new ErrorDistribucion(YA_CERRADO);
    const propioCorrector = h.estado === "por_validar" && Number(h.corregido_por) === sesion.usuarioId;
    const propioPunto = h.estado === "abierto" && Number(h.actual_id) === sesion.usuarioId;
    if (propioCorrector) {
      await exigirSinOtroAdmin(tx, sesion.usuarioId, "Otro Administrador del SGC debe validar esta corrección: usted la hizo");
    }
    if (propioPunto) {
      await exigirSinOtroAdmin(tx, sesion.usuarioId, "Otro Administrador del SGC debe cerrar el hallazgo: usted responde por el punto");
    }
    await tx`UPDATE hallazgos SET estado = 'cerrado', validacion = 'admin', cerrado_en = ${ahora}, cerrado_por = ${sesion.usuarioId},
        nota_cierre = ${texto}
      WHERE id = ${id}`;
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "hallazgo_cerrado",
      entidad: "hallazgo",
      entidadId: id,
      detalle: { ...detalleBase(h), estadoPrevio: h.estado as string, validacion: "admin", propioCorrector, propioPunto, nota: texto },
    });
  });
}

/**
 * Quién adjunta la foto de la corrección: el responsable actual del punto con `distribucion.responder`, o quien gestiona,
 * mientras el hallazgo no esté cerrado. Quien no ve el hallazgo recibe 404; quien lo ve sin poder corregirlo, 403.
 */
export async function autorizarFotoDeHallazgo(
  id: number,
  sesion: SesionFlujo,
  opciones?: { sql?: Cliente },
): Promise<{ ok: true } | { ok: false; estado: 403 | 404 | 409 }> {
  const sql = opciones?.sql ?? obtenerSql();
  const [h] = await sql`SELECT h.estado, pu.responsable_id FROM hallazgos h JOIN puntos_uso pu ON pu.id = h.punto_uso_id
    WHERE h.id = ${id} AND ${filtroPuntos(sql, sesion)}`;
  if (!h) return { ok: false, estado: 404 };
  if (!puedeCorregirHallazgo(sesion, Number(h.responsable_id))) return { ok: false, estado: 403 };
  return h.estado === "cerrado" ? { ok: false, estado: 409 } : { ok: true };
}
