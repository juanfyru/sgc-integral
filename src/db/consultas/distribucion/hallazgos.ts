import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { enTransaccion, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { crearNotificacion } from "@/db/consultas/notificaciones";
import { filtroPuntos } from "@/lib/alcance";
import { numeroDeCopia } from "@/lib/distribucion/copias";
import { ErrorDistribucion } from "@/lib/distribucion/tipos";
import { puede } from "@/lib/permisos";
import { fechaLimite } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import type { Copia } from "./copias";
import { evidenciasDe, type Evidencia } from "./evidencias";

type Opciones = { sql?: Cliente; ahora?: Date };

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
  estado: "abierto" | "cerrado";
  venceEn: Date;
  creadoEn: Date;
  cierre: { en: Date; por: string; nota: string } | null;
  fotos: Evidencia[];
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
            ${fechaLimite(d.ahora, d.plazoDias, zonaHoraria())}, ${d.ahora})
    RETURNING id`;
  const hallazgoId = Number(h.id);
  let titulo = d.titulo;
  if (!titulo) {
    const [p] = await tx`SELECT nombre FROM puntos_uso WHERE id = ${d.puntoId}`;
    titulo = `Hallazgo abierto en ${p.nombre}: ${d.descripcion}`;
  }
  const enlace =
    d.origen === "verificacion" && d.verificacionId !== undefined
      ? `/distribucion/verificaciones/${d.verificacionId}`
      : d.copiaId !== undefined
        ? `/distribucion/copias/${d.copiaId}`
        : "/distribucion/verificaciones";
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
 * del punto, el mismo de la tarea, el cierre y los vencimientos.
 */
export async function leerHallazgos(sql: Cliente, condicion: ReturnType<Cliente>): Promise<Hallazgo[]> {
  const filas = await sql`
    SELECT h.id, h.punto_uso_id, pu.nombre AS punto_nombre, h.origen, h.verificacion_id, h.item_id, h.copia_id,
           h.descripcion, h.retirado_en_el_acto, pu.responsable_id, ur.nombre AS responsable_nombre, h.estado,
           h.vence_en, h.creado_en, h.cerrado_en, uc.nombre AS cerrado_por_nombre, h.nota_cierre,
           d.codigo AS copia_codigo, v.numero AS copia_version, cc.numero AS copia_numero
    FROM hallazgos h
    JOIN puntos_uso pu ON pu.id = h.punto_uso_id
    JOIN usuarios ur ON ur.id = pu.responsable_id
    LEFT JOIN usuarios uc ON uc.id = h.cerrado_por
    LEFT JOIN copias_controladas cc ON cc.id = h.copia_id
    LEFT JOIN documento_versiones v ON v.id = cc.version_id
    LEFT JOIN documentos d ON d.id = v.documento_id
    WHERE ${condicion}
    ORDER BY (h.estado = 'abierto') DESC, h.vence_en, h.id`;
  const hallazgos: Hallazgo[] = [];
  for (const f of filas) {
    hallazgos.push({
      id: Number(f.id),
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
      estado: f.estado as Hallazgo["estado"],
      venceEn: f.vence_en as Date,
      creadoEn: f.creado_en as Date,
      cierre: f.cerrado_en
        ? { en: f.cerrado_en as Date, por: f.cerrado_por_nombre as string, nota: f.nota_cierre as string }
        : null,
      fotos: f.item_id === null ? [] : await evidenciasDe("verificacion_item", Number(f.item_id), { sql }),
    });
  }
  return hallazgos;
}

export async function hallazgosDe(
  filtro: { puntoId?: number; estado?: "abierto" | "cerrado" },
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

/** Los hallazgos abiertos de los puntos de los que la persona responde hoy: lo que ve como tarea. */
export async function hallazgosAbiertosDe(usuarioId: number, opciones?: Opciones): Promise<Hallazgo[]> {
  const sql = opciones?.sql ?? obtenerSql();
  return leerHallazgos(sql, sql`pu.responsable_id = ${usuarioId} AND h.estado = 'abierto'`);
}

/**
 * Lo cierra el responsable actual del punto o quien gestiona la distribución. Para cualquier otra persona el
 * hallazgo «no existe».
 */
export async function cerrarHallazgo(id: number, sesion: SesionFlujo, nota: string, opciones?: Opciones): Promise<void> {
  const ahora = opciones?.ahora ?? new Date();
  const texto = nota.trim();
  if (texto.length < 5) throw new ErrorDistribucion("Escriba qué se hizo para corregirlo (mínimo 5 caracteres)");
  await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    const [h] = await tx`
      SELECT h.estado, h.punto_uso_id, h.origen, h.verificacion_id, pu.responsable_id AS actual_id
      FROM hallazgos h JOIN puntos_uso pu ON pu.id = h.punto_uso_id
      WHERE h.id = ${id} FOR UPDATE OF h`;
    const esResponsable = h && Number(h.actual_id) === sesion.usuarioId && puede(sesion, "distribucion.responder");
    if (!h || !(esResponsable || puede(sesion, "distribucion.gestionar"))) throw new ErrorDistribucion("El hallazgo no existe");
    if (h.estado !== "abierto") throw new ErrorDistribucion("El hallazgo ya está cerrado");
    await tx`UPDATE hallazgos SET estado = 'cerrado', cerrado_en = ${ahora}, cerrado_por = ${sesion.usuarioId}, nota_cierre = ${texto}
      WHERE id = ${id}`;
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "hallazgo_cerrado",
      entidad: "hallazgo",
      entidadId: id,
      detalle: {
        puntoId: Number(h.punto_uso_id),
        origen: h.origen,
        verificacionId: h.verificacion_id === null ? null : Number(h.verificacion_id),
        nota: texto,
      },
    });
  });
}
