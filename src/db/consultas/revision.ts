/**
 * La revisión de un documento: lista de verificación por ronda y observaciones numeradas
 * (spec 13A §9.2 y §9.3). Cada función comprueba la persona y la etapa leyendo el trámite
 * con la fila bloqueada; una acción fuera de su turno lanza `ErrorTramite`.
 */
import type { TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { rotuloDeTramite, tramiteVisto } from "@/db/consultas/tramites";
import { evaluarTransicion } from "@/lib/tramites/transiciones";
import { ErrorTramite, enTransaccion, type FilaTramite, type SesionFlujo } from "./flujo/contrato";

export type Resultado = "cumple" | "no_cumple" | "no_aplica";
export const RESULTADOS: readonly Resultado[] = ["cumple", "no_cumple", "no_aplica"];

export type ItemVerificacion = { id: number; texto: string; critico: boolean; orden: number; activo: boolean };

export type RespuestaItem = {
  itemId: number;
  texto: string;
  critico: boolean;
  resultado: Resultado | null;
  nota: string | null;
};

export type Observacion = {
  id: number;
  numero: number;
  ronda: number;
  origen: "revision" | "aprobacion";
  texto: string;
  autor: string;
  respuesta: string | null;
  estado: "abierta" | "atendida" | "cerrada";
  notaReapertura: string | null;
  creadoEn: Date;
};

export const LARGO_MIN_OBSERVACION = 5;
export const LARGO_MAX_OBSERVACION = 2000;

function textoValido(valor: string, que: string): string {
  const limpio = valor.trim();
  if (limpio.length < LARGO_MIN_OBSERVACION || limpio.length > LARGO_MAX_OBSERVACION)
    throw new ErrorTramite(`${que} debe tener entre ${LARGO_MIN_OBSERVACION} y ${LARGO_MAX_OBSERVACION} caracteres`);
  return limpio;
}

export async function listarItemsVerificacion(opciones?: {
  sql?: Cliente;
  soloActivos?: boolean;
}): Promise<ItemVerificacion[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`SELECT id, texto, critico, orden, activo FROM lista_verificacion_items
    WHERE ${opciones?.soloActivos ? sql`activo` : sql`true`}
    ORDER BY orden, id`;
  return filas.map((f) => ({ id: Number(f.id), texto: f.texto, critico: f.critico, orden: f.orden, activo: f.activo }));
}

/**
 * Los ítems activos con la respuesta de esa ronda. Si la ronda no tiene ninguna, propone las
 * de la última ronda anterior que sí tenga (sin guardarlas): la revisión siguiente parte de ahí.
 * `sinPropuesta` es para quien solo mira: lo no respondido en la ronda se ve sin responder.
 */
export async function obtenerVerificacion(
  tramiteId: number,
  ronda: number,
  opciones?: { sql?: Cliente; sinPropuesta?: boolean },
): Promise<RespuestaItem[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const [propia] = await sql`SELECT 1 FROM tramite_verificaciones WHERE tramite_id = ${tramiteId} AND ronda = ${ronda} LIMIT 1`;
  let deRonda = ronda;
  if (!propia && !opciones?.sinPropuesta) {
    const [previa] = await sql`SELECT max(ronda) AS ronda FROM tramite_verificaciones
      WHERE tramite_id = ${tramiteId} AND ronda < ${ronda}`;
    if (previa?.ronda !== null && previa?.ronda !== undefined) deRonda = previa.ronda;
  }
  const propuesta = deRonda !== ronda;
  const filas = await sql`SELECT i.id, i.texto, i.critico, r.texto_item, r.critico AS critico_guardado, r.resultado, r.nota
    FROM lista_verificacion_items i
    LEFT JOIN tramite_verificaciones r ON r.item_id = i.id AND r.tramite_id = ${tramiteId} AND r.ronda = ${deRonda}
    WHERE i.activo
    ORDER BY i.orden, i.id`;
  return filas.map((f) => ({
    itemId: Number(f.id),
    // Lo guardado en esta ronda conserva el texto con que se respondió; lo propuesto, el de hoy.
    texto: propuesta ? f.texto : (f.texto_item ?? f.texto),
    critico: propuesta ? f.critico : (f.critico_guardado ?? f.critico),
    resultado: f.resultado,
    nota: f.nota,
  }));
}

/** Bloquea el trámite y comprueba que `sesion` tiene el turno (revisor en revisión o elaborador en elaboración). */
async function bloquearComo(
  tx: TransactionSql,
  tramiteId: number,
  sesion: SesionFlujo,
  quien: "revisor" | "elaborador",
): Promise<FilaTramite> {
  const visto = await tramiteVisto(tx, tramiteId, sesion, true);
  if (!visto?.visible) throw new ErrorTramite("El trámite no existe");
  const veredicto = evaluarTransicion(quien === "revisor" ? "devolver_revision" : "enviar_a_revision", visto.tramite, {
    usuarioId: sesion.usuarioId,
    rol: sesion.rol,
    lideraPropietario: visto.lideraPropietario,
  });
  if (!veredicto.ok) throw new ErrorTramite(veredicto.motivo);
  return visto.tramite;
}

async function auditar(
  tx: TransactionSql,
  tramite: FilaTramite,
  usuarioId: number,
  accion: string,
  detalle: Record<string, unknown>,
): Promise<void> {
  const { codigo } = await rotuloDeTramite(tx, tramite);
  await registrarAuditoria(tx, {
    usuarioId,
    accion: `tramite_${accion}`,
    entidad: "tramite",
    entidadId: tramite.id,
    detalle: { numero: tramite.numero, codigo, documentoId: tramite.documentoId, ronda: tramite.ronda, ...detalle },
  });
}

export async function guardarVerificacion(
  tramiteId: number,
  sesion: SesionFlujo,
  respuestas: { itemId: number; resultado: Resultado; nota?: string }[],
  opciones?: { sql?: Cliente },
): Promise<void> {
  if (respuestas.length === 0) throw new ErrorTramite("Marque al menos un ítem");
  await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    const tramite = await bloquearComo(tx, tramiteId, sesion, "revisor");
    for (const r of respuestas) {
      if (!RESULTADOS.includes(r.resultado)) throw new ErrorTramite("Resultado no válido");
      const nota = r.nota?.trim() || null;
      if (nota && nota.length > LARGO_MAX_OBSERVACION)
        throw new ErrorTramite(`La nota no puede pasar de ${LARGO_MAX_OBSERVACION} caracteres`);
      const [item] = await tx`SELECT texto, critico FROM lista_verificacion_items WHERE id = ${r.itemId} AND activo`;
      if (!item) throw new ErrorTramite("Un ítem de la lista no existe o está inactivo");
      await tx`INSERT INTO tramite_verificaciones (tramite_id, ronda, item_id, texto_item, critico, resultado, nota)
        VALUES (${tramiteId}, ${tramite.ronda}, ${r.itemId}, ${item.texto}, ${item.critico}, ${r.resultado}, ${nota})
        ON CONFLICT (tramite_id, ronda, item_id)
        DO UPDATE SET texto_item = EXCLUDED.texto_item, critico = EXCLUDED.critico,
                      resultado = EXCLUDED.resultado, nota = EXCLUDED.nota`;
    }
    await auditar(tx, tramite, sesion.usuarioId, "guardar_lista", { respondidos: respuestas.length });
  });
}

export async function listarObservaciones(tramiteId: number, opciones?: { sql?: Cliente }): Promise<Observacion[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`SELECT o.id, o.numero, o.ronda, o.origen, o.texto, u.nombre AS autor, o.respuesta,
      o.estado, o.nota_reapertura, o.creado_en
    FROM tramite_observaciones o JOIN usuarios u ON u.id = o.autor_id
    WHERE o.tramite_id = ${tramiteId}
    ORDER BY o.numero`;
  return filas.map((o) => ({
    id: Number(o.id),
    numero: o.numero,
    ronda: o.ronda,
    origen: o.origen,
    texto: o.texto,
    autor: o.autor,
    respuesta: o.respuesta,
    estado: o.estado,
    notaReapertura: o.nota_reapertura,
    creadoEn: o.creado_en,
  }));
}

async function insertarObservacion(
  tx: TransactionSql,
  tramite: FilaTramite,
  autorId: number,
  origen: "revision" | "aprobacion",
  texto: string,
): Promise<{ id: number; numero: number }> {
  // El trámite está bloqueado: nadie más numera a la vez.
  const [{ numero }] = await tx`SELECT COALESCE(max(numero), 0) + 1 AS numero FROM tramite_observaciones WHERE tramite_id = ${tramite.id}`;
  const [fila] = await tx`INSERT INTO tramite_observaciones (tramite_id, numero, ronda, origen, texto, autor_id)
    VALUES (${tramite.id}, ${numero}, ${tramite.ronda}, ${origen}, ${texto}, ${autorId})
    RETURNING id`;
  return { id: Number(fila.id), numero: Number(numero) };
}

/** Devuelve el id de la observación, con el que se responde, cierra o reabre; su número es `numero`. */
export async function crearObservacion(
  tramiteId: number,
  sesion: SesionFlujo,
  texto: string,
  opciones?: { sql?: Cliente },
): Promise<number> {
  return enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    const tramite = await bloquearComo(tx, tramiteId, sesion, "revisor");
    const { id, numero } = await insertarObservacion(tx, tramite, sesion.usuarioId, "revision", textoValido(texto, "La observación"));
    await auditar(tx, tramite, sesion.usuarioId, "crear_observacion", { observacion: numero });
    return id;
  });
}

/** Para el manejador `devolver_aprobacion`: el trámite ya viene bloqueado por `transicionar`. */
export async function crearObservacionesDeAprobacion(
  tx: TransactionSql,
  tramite: FilaTramite,
  autorId: number,
  textos: string[],
): Promise<void> {
  for (const texto of textos) {
    const { numero } = await insertarObservacion(tx, tramite, autorId, "aprobacion", textoValido(texto, "La observación"));
    await auditar(tx, tramite, autorId, "crear_observacion", { observacion: numero, origen: "aprobacion" });
  }
}

type FilaObservacion = { id: number; numero: number; estado: Observacion["estado"]; respuesta: string | null };

/** Lee la observación, bloquea su trámite y la vuelve a leer ya bloqueada. */
async function observacionDelTurno(
  tx: TransactionSql,
  observacionId: number,
  sesion: SesionFlujo,
  quien: "revisor" | "elaborador",
): Promise<{ tramite: FilaTramite; observacion: FilaObservacion }> {
  const [previa] = await tx`SELECT tramite_id FROM tramite_observaciones WHERE id = ${observacionId}`;
  if (!previa) throw new ErrorTramite("La observación no existe");
  const tramite = await bloquearComo(tx, Number(previa.tramite_id), sesion, quien);
  const [o] = await tx`SELECT id, numero, estado, respuesta FROM tramite_observaciones WHERE id = ${observacionId} FOR UPDATE`;
  return { tramite, observacion: { id: Number(o.id), numero: o.numero, estado: o.estado, respuesta: o.respuesta } };
}

export async function responderObservacion(
  observacionId: number,
  sesion: SesionFlujo,
  respuesta: string,
  opciones?: { sql?: Cliente },
): Promise<void> {
  await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    const { tramite, observacion: o } = await observacionDelTurno(tx, observacionId, sesion, "elaborador");
    if (o.estado === "cerrada") throw new ErrorTramite("La observación ya está cerrada");
    const limpia = textoValido(respuesta, "La respuesta");
    await tx`UPDATE tramite_observaciones
      SET respuesta = ${limpia}, respondida_por = ${sesion.usuarioId}, respondida_en = now(), estado = 'atendida'
      WHERE id = ${o.id}`;
    await auditar(tx, tramite, sesion.usuarioId, "responder_observacion", { observacion: o.numero });
  });
}

export async function cerrarObservacion(
  observacionId: number,
  sesion: SesionFlujo,
  opciones?: { sql?: Cliente },
): Promise<void> {
  await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    const { tramite, observacion: o } = await observacionDelTurno(tx, observacionId, sesion, "revisor");
    if (o.estado !== "atendida") throw new ErrorTramite("Solo se cierra una observación que ya fue respondida");
    await tx`UPDATE tramite_observaciones SET estado = 'cerrada', cerrada_por = ${sesion.usuarioId}, cerrada_en = now()
      WHERE id = ${o.id}`;
    await auditar(tx, tramite, sesion.usuarioId, "cerrar_observacion", { observacion: o.numero });
  });
}

/**
 * La observación vuelve a abierta y su respuesta se vacía: el envío a revisión exige que toda
 * observación abierta tenga respuesta, y la vieja no responde a esta nota. La anterior queda
 * en el detalle de la auditoría.
 */
export async function reabrirObservacion(
  observacionId: number,
  sesion: SesionFlujo,
  nota: string,
  opciones?: { sql?: Cliente },
): Promise<void> {
  await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    const { tramite, observacion: o } = await observacionDelTurno(tx, observacionId, sesion, "revisor");
    if (o.estado === "abierta") throw new ErrorTramite("La observación ya está abierta");
    const limpia = textoValido(nota, "La nota");
    await tx`UPDATE tramite_observaciones
      SET estado = 'abierta', nota_reapertura = ${limpia}, respuesta = NULL, respondida_por = NULL, respondida_en = NULL,
          cerrada_por = NULL, cerrada_en = NULL
      WHERE id = ${o.id}`;
    await auditar(tx, tramite, sesion.usuarioId, "reabrir_observacion", {
      observacion: o.numero,
      nota: limpia,
      respuestaAnterior: o.respuesta,
    });
  });
}
