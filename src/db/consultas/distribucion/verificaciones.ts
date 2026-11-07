import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import { enTransaccion, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { adminsActivos } from "@/db/consultas/tramites";
import { puedeVerVerificacion } from "@/lib/alcance";
import { armarListaDeChequeo, esConforme } from "@/lib/distribucion/verificacion";
import {
  ErrorDistribucion,
  RESPUESTAS_ITEM,
  type OrigenItem,
  type RespuestaItem,
} from "@/lib/distribucion/tipos";
import { ErrorPermiso, puede } from "@/lib/permisos";
import { recogerEnVerificacion } from "./copias";
import { evidenciasDe, type Evidencia } from "./evidencias";
import { abrirHallazgo, leerHallazgos, type Hallazgo } from "./hallazgos";

type Opciones = { sql?: Cliente; ahora?: Date };

export type ItemVerificacion = {
  id: number;
  orden: number;
  origen: OrigenItem;
  copiaId: number | null;
  texto: string;
  respuesta: RespuestaItem | null;
  nota: string | null;
  fotos: Evidencia[];
};

export type Verificacion = {
  id: number;
  punto: { id: number; nombre: string; sede: string | null };
  responsable: { id: number; nombre: string };
  estado: "abierta" | "cerrada" | "descartada";
  abiertaPor: string;
  abiertaEn: Date;
  cerradaPor: string | null;
  cerradaEn: Date | null;
  conforme: boolean | null;
  propioPunto: boolean;
  motivoDescarte: string | null;
  items: ItemVerificacion[];
  hallazgos: Hallazgo[];
  puedeEditar: boolean;
};

export type RespuestaDeItem = { itemId: number; respuesta: RespuestaItem | null; nota: string | null };

const YA_CERRADA = "La verificación ya está cerrada";
const NO_EXISTE = "La verificación no existe";
const TOPE_NOTA = 1000;

/** Bloquea la verificación y exige que siga abierta; el trigger de la BD lo vuelve a exigir. */
async function bloquearAbierta(tx: Cliente, id: number) {
  const [v] = await tx`SELECT id, estado, punto_uso_id, abierta_por, punto_nombre, responsable_id
    FROM verificaciones WHERE id = ${id} FOR UPDATE`;
  if (!v) throw new ErrorDistribucion(NO_EXISTE);
  if (v.estado === "descartada") throw new ErrorDistribucion("La verificación fue descartada");
  if (v.estado !== "abierta") throw new ErrorDistribucion(YA_CERRADA);
  return v;
}

/**
 * Abre la verificación de un punto, o devuelve la que ya está abierta. Quien es el responsable del punto no
 * lo verifica si hay otro Administrador del SGC activo; si no lo hay, se abre marcada como «propio punto».
 */
export async function abrirVerificacion(
  sesion: SesionFlujo,
  puntoId: number,
  opciones?: Opciones,
): Promise<{ verificacionId: number }> {
  if (!puede(sesion, "verificaciones.realizar")) throw new ErrorPermiso();
  const ahora = opciones?.ahora ?? new Date();
  return enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    const [p] = await tx`
      SELECT pu.id, pu.nombre, pu.activo, pu.responsable_id, ur.nombre AS responsable_nombre
      FROM puntos_uso pu JOIN usuarios ur ON ur.id = pu.responsable_id
      WHERE pu.id = ${puntoId} FOR UPDATE OF pu`;
    if (!p || !p.activo) throw new ErrorDistribucion("El punto de uso no existe o está inactivo");

    const [abierta] = await tx`SELECT id FROM verificaciones WHERE punto_uso_id = ${puntoId} AND estado = 'abierta'`;
    if (abierta) return { verificacionId: Number(abierta.id) };

    const propioPunto = Number(p.responsable_id) === sesion.usuarioId;
    if (propioPunto) {
      const otros = (await adminsActivos({ sql: tx })).filter((id) => id !== sesion.usuarioId);
      if (otros.length > 0) {
        throw new ErrorDistribucion("Otro Administrador del SGC debe verificar este punto: usted es su responsable");
      }
    }

    const [v] = await tx`
      INSERT INTO verificaciones
        (punto_uso_id, estado, abierta_por, abierta_en, propio_punto, punto_nombre, responsable_id, responsable_nombre)
      VALUES (${puntoId}, 'abierta', ${sesion.usuarioId}, ${ahora}, ${propioPunto}, ${p.nombre},
              ${p.responsable_id}, ${p.responsable_nombre})
      RETURNING id`;
    const verificacionId = Number(v.id);

    const copias = await tx`
      SELECT cc.id, d.codigo, ver.numero AS version, cc.numero, cc.estado
      FROM copias_controladas cc
      JOIN documento_versiones ver ON ver.id = cc.version_id
      JOIN documentos d ON d.id = ver.documento_id
      WHERE cc.punto_uso_id = ${puntoId} AND cc.estado IN ('emitida', 'recibida', 'por_recoger')`;
    const filas = armarListaDeChequeo(
      copias.map((c) => ({
        id: Number(c.id),
        codigo: c.codigo as string,
        version: Number(c.version),
        numero: Number(c.numero),
        estado: c.estado as "emitida" | "recibida" | "por_recoger",
      })),
    );
    let orden = 0;
    for (const fila of filas) {
      orden += 1;
      await tx`INSERT INTO verificacion_items (verificacion_id, orden, origen, copia_id, texto)
        VALUES (${verificacionId}, ${orden}, ${fila.origen}, ${fila.copiaId}, ${fila.texto})`;
    }
    return { verificacionId };
  });
}

/** Guarda respuestas y notas de los ítems; no cierra ni crea hallazgos. */
export async function guardarAvance(
  id: number,
  sesion: SesionFlujo,
  respuestas: RespuestaDeItem[],
  opciones?: Opciones,
): Promise<void> {
  if (!puede(sesion, "verificaciones.realizar")) throw new ErrorPermiso();
  for (const r of respuestas) {
    if (r.respuesta !== null && !RESPUESTAS_ITEM.includes(r.respuesta)) throw new ErrorDistribucion("Respuesta inválida");
    if (r.nota !== null && r.nota.length > TOPE_NOTA) throw new ErrorDistribucion(`La nota no puede pasar de ${TOPE_NOTA} caracteres`);
  }
  await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    await bloquearAbierta(tx, id);
    const propios = new Set(
      (await tx`SELECT id FROM verificacion_items WHERE verificacion_id = ${id}`).map((f) => Number(f.id)),
    );
    for (const r of respuestas) {
      if (!propios.has(r.itemId)) throw new ErrorDistribucion("Un ítem no pertenece a esta verificación");
      await tx`UPDATE verificacion_items SET respuesta = ${r.respuesta}, nota = ${r.nota?.trim() || null}
        WHERE id = ${r.itemId} AND verificacion_id = ${id}`;
    }
  });
}

export async function agregarItemLibre(
  id: number,
  sesion: SesionFlujo,
  texto: string,
  opciones?: Opciones,
): Promise<{ itemId: number }> {
  if (!puede(sesion, "verificaciones.realizar")) throw new ErrorPermiso();
  const limpio = texto.trim();
  if (limpio.length < 5 || limpio.length > 200) throw new ErrorDistribucion("El ítem debe tener entre 5 y 200 caracteres");
  return enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    await bloquearAbierta(tx, id);
    const [{ siguiente }] = await tx`SELECT COALESCE(max(orden), 0) + 1 AS siguiente FROM verificacion_items WHERE verificacion_id = ${id}`;
    const [item] = await tx`INSERT INTO verificacion_items (verificacion_id, orden, origen, texto)
      VALUES (${id}, ${siguiente}, 'libre', ${limpio}) RETURNING id`;
    return { itemId: Number(item.id) };
  });
}

/**
 * Cierra la verificación. Todo ocurre en una transacción: el cierre, un hallazgo por cada ítem no conforme y la
 * recogida de las copias obsoletas que ya no estaban. `retirados` son los ítems no conformes cuyo hallazgo se
 * resolvió retirando la copia en el acto; el dato va al hallazgo, no al ítem (que queda inmutable).
 */
export async function cerrarVerificacion(
  id: number,
  sesion: SesionFlujo,
  datos: { retirados: number[] },
  opciones?: Opciones,
): Promise<{ conforme: boolean; hallazgos: number }> {
  if (!puede(sesion, "verificaciones.realizar")) throw new ErrorPermiso();
  const ahora = opciones?.ahora ?? new Date();
  return enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    const v = await bloquearAbierta(tx, id);
    const items = await tx`
      SELECT i.id, i.origen, i.copia_id, i.texto, i.respuesta, i.nota, ver.documento_id
      FROM verificacion_items i
      LEFT JOIN copias_controladas cc ON cc.id = i.copia_id
      LEFT JOIN documento_versiones ver ON ver.id = cc.version_id
      WHERE i.verificacion_id = ${id} ORDER BY i.orden, i.id`;
    if (items.some((i) => i.respuesta === null)) throw new ErrorDistribucion("Responda todos los ítems antes de cerrar");

    const conforme = esConforme(items.map((i) => ({ respuesta: i.respuesta as RespuestaItem })));
    const [punto] = await tx`SELECT responsable_id FROM puntos_uso WHERE id = ${v.punto_uso_id}`;
    const { plazoCorreccionDias } = (await obtenerConfigDocumental({ sql: tx })).distribucion;

    // Una sola sentencia: el trigger rechaza cualquier cambio posterior a la verificación cerrada.
    await tx`UPDATE verificaciones
      SET estado = 'cerrada', conforme = ${conforme}, cerrada_por = ${sesion.usuarioId}, cerrada_en = ${ahora}
      WHERE id = ${id}`;

    let hallazgos = 0;
    let recogidas = 0;
    for (const item of items) {
      const itemId = Number(item.id);
      const retirado = item.respuesta === "no_conforme" && datos.retirados.includes(itemId);
      if (item.respuesta === "no_conforme") {
        await abrirHallazgo(tx, {
          puntoId: Number(v.punto_uso_id),
          origen: "verificacion",
          verificacionId: id,
          itemId,
          copiaId: item.copia_id === null ? undefined : Number(item.copia_id),
          documentoId: item.documento_id === null ? undefined : Number(item.documento_id),
          descripcion: item.nota ? `${item.texto}: ${item.nota}` : (item.texto as string),
          retiradoEnElActo: retirado,
          responsableId: Number(punto.responsable_id),
          ahora,
          plazoDias: plazoCorreccionDias,
        });
        hallazgos += 1;
      }
      if (
        item.origen === "copia_por_recoger" &&
        item.copia_id !== null &&
        (item.respuesta === "conforme" || retirado) &&
        (await recogerEnVerificacion(tx, Number(item.copia_id), id, sesion.usuarioId, ahora))
      ) {
        recogidas += 1;
      }
    }

    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "verificacion_cerrada",
      entidad: "verificacion",
      entidadId: id,
      detalle: { puntoId: Number(v.punto_uso_id), punto: v.punto_nombre, conforme, hallazgos, copiasRecogidas: recogidas },
    });
    return { conforme, hallazgos };
  });
}

/** Descartar libera el punto; no deja hallazgos ni mueve copias. Las fotos subidas quedan como archivos de sus ítems. */
export async function descartarVerificacion(
  id: number,
  sesion: SesionFlujo,
  motivo: string,
  opciones?: Opciones,
): Promise<void> {
  const ahora = opciones?.ahora ?? new Date();
  const texto = motivo.trim();
  if (texto.length < 5) throw new ErrorDistribucion("Escriba el motivo (mínimo 5 caracteres)");
  await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    const v = await bloquearAbierta(tx, id);
    const propia = Number(v.abierta_por) === sesion.usuarioId && puede(sesion, "verificaciones.realizar");
    if (!propia && !puede(sesion, "distribucion.gestionar")) throw new ErrorPermiso();
    await tx`UPDATE verificaciones SET estado = 'descartada', motivo_descarte = ${texto} WHERE id = ${id}`;
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "verificacion_descartada",
      entidad: "verificacion",
      entidadId: id,
      detalle: { puntoId: Number(v.punto_uso_id), punto: v.punto_nombre, motivo: texto, fecha: ahora.toISOString() },
    });
  });
}

/** La verificación, o `null` si no existe o la persona no la ve. */
export async function obtenerVerificacion(
  id: number,
  sesion: SesionFlujo,
  opciones?: Opciones,
): Promise<Verificacion | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const [f] = await sql`
    SELECT v.id, v.punto_uso_id, v.punto_nombre, v.estado, v.abierta_en, v.cerrada_en, v.conforme, v.propio_punto,
           v.motivo_descarte, v.responsable_id, v.responsable_nombre, ua.nombre AS abierta_por_nombre,
           uc.nombre AS cerrada_por_nombre, pu.sede, pu.responsable_id AS actual_id,
           COALESCE((SELECT array_agg(pp.proceso_id) FROM punto_uso_procesos pp WHERE pp.punto_uso_id = pu.id), '{}') AS procesos
    FROM verificaciones v
    JOIN puntos_uso pu ON pu.id = v.punto_uso_id
    JOIN usuarios ua ON ua.id = v.abierta_por
    LEFT JOIN usuarios uc ON uc.id = v.cerrada_por
    WHERE v.id = ${id}`;
  if (!f) return null;
  const ve = await puedeVerVerificacion(
    sesion,
    {
      puntoId: Number(f.punto_uso_id),
      responsableId: Number(f.actual_id),
      procesoIds: (f.procesos as (string | number)[]).map(Number),
    },
    { sql },
  );
  if (!ve) return null;

  const filas = await sql`SELECT id, orden, origen, copia_id, texto, respuesta, nota
    FROM verificacion_items WHERE verificacion_id = ${id} ORDER BY orden, id`;
  const items: ItemVerificacion[] = [];
  for (const i of filas) {
    items.push({
      id: Number(i.id),
      orden: Number(i.orden),
      origen: i.origen as OrigenItem,
      copiaId: i.copia_id === null ? null : Number(i.copia_id),
      texto: i.texto as string,
      respuesta: (i.respuesta as RespuestaItem | null) ?? null,
      nota: (i.nota as string | null) ?? null,
      fotos: await evidenciasDe("verificacion_item", Number(i.id), { sql }),
    });
  }
  const estado = f.estado as Verificacion["estado"];
  return {
    id,
    punto: { id: Number(f.punto_uso_id), nombre: f.punto_nombre as string, sede: (f.sede as string | null) ?? null },
    responsable: { id: Number(f.responsable_id), nombre: f.responsable_nombre as string },
    estado,
    abiertaPor: f.abierta_por_nombre as string,
    abiertaEn: f.abierta_en as Date,
    cerradaPor: (f.cerrada_por_nombre as string | null) ?? null,
    cerradaEn: (f.cerrada_en as Date | null) ?? null,
    conforme: (f.conforme as boolean | null) ?? null,
    propioPunto: f.propio_punto as boolean,
    motivoDescarte: (f.motivo_descarte as string | null) ?? null,
    items,
    hallazgos: await leerHallazgos(sql, sql`h.verificacion_id = ${id}`),
    puedeEditar: estado === "abierta" && puede(sesion, "verificaciones.realizar"),
  };
}

export async function ultimaVerificacionDe(
  puntoId: number,
  opciones?: Opciones,
): Promise<{ cerradaEn: Date; conforme: boolean } | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const [f] = await sql`SELECT cerrada_en, conforme FROM verificaciones
    WHERE punto_uso_id = ${puntoId} AND estado = 'cerrada' ORDER BY cerrada_en DESC, id DESC LIMIT 1`;
  return f ? { cerradaEn: f.cerrada_en as Date, conforme: f.conforme as boolean } : null;
}

/**
 * Quién adjunta o quita fotos de un ítem: quien realiza verificaciones, mientras la verificación esté abierta y
 * el ítem sea de ella. Para quien no puede hacerlo, o si el ítem no es de la verificación, no existe (404).
 */
export async function autorizarFotoDeItem(
  verificacionId: number,
  itemId: number,
  sesion: Pick<SesionFlujo, "usuarioId" | "rol" | "verHistorial">,
  opciones?: { sql?: Cliente },
): Promise<{ ok: true } | { ok: false; estado: 404 | 409 }> {
  const sql = opciones?.sql ?? obtenerSql();
  if (!puede(sesion, "verificaciones.realizar")) return { ok: false, estado: 404 };
  const [f] = await sql`SELECT v.estado FROM verificacion_items i JOIN verificaciones v ON v.id = i.verificacion_id
    WHERE i.id = ${itemId} AND i.verificacion_id = ${verificacionId}`;
  if (!f) return { ok: false, estado: 404 };
  return f.estado === "abierta" ? { ok: true } : { ok: false, estado: 409 };
}
