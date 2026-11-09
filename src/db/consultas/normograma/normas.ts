/**
 * El catálogo de normas (spec 13C §10.1, §10.2 y §10.7). Lo administra quien tiene `normograma.administrar`; lo lee
 * toda sesión. Cada cambio de estado queda en `norma_cambios` (solo inserción) en la misma transacción que el cambio
 * y que sus impactos documentales. Nada se borra salvo una norma sin historia: las demás se retiran.
 */
import type { PendingQuery, Row, TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import { evidenciasDe, type Evidencia } from "@/db/consultas/distribucion/evidencias";
import { enTransaccion, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { alcanceProcesos, filtroAcceso, puedeAsociarNorma, type SujetoVisibilidad } from "@/lib/alcance";
import {
  acotado,
  ErrorNormograma,
  ESTADOS_CON_IMPACTO,
  ESTADOS_NORMA,
  fechaValida,
  nombreDeNorma,
  opcionalAcotado,
  type EstadoNorma,
  type TipoRelacion,
} from "@/lib/normograma/tipos";
import { ErrorPermiso, puede } from "@/lib/permisos";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { condicionTexto, escaparLike, nombreSql } from "./busqueda";
import { crearImpactos } from "./impactos";

type Opciones = { sql?: Cliente; ahora?: Date };

export const NORMA_NO_EXISTE = "La norma no existe";

export type DatosNorma = {
  tipoNormaId: number;
  numero: string;
  anio: number;
  fechaExpedicion: string | null;
  entidadEmisora: string;
  titulo: string;
  tema: string | null;
  enlaceOficial: string | null;
  notas: string | null;
};

export function exigirAdministrar(sesion: SesionFlujo): void {
  if (!puede(sesion, "normograma.administrar")) throw new ErrorPermiso();
}

/** Los datos recortados y acotados. El enlace oficial es texto: no se valida como URL ni se abre (F13C-DC19). */
function limpiar(d: DatosNorma): DatosNorma {
  if (!Number.isInteger(d.anio) || d.anio < 1800 || d.anio > 2100) throw new ErrorNormograma("El año debe estar entre 1800 y 2100");
  if (!Number.isInteger(d.tipoNormaId) || d.tipoNormaId <= 0) throw new ErrorNormograma("Elija el tipo de norma");
  return {
    tipoNormaId: d.tipoNormaId,
    numero: acotado(d.numero, "El número", 1, 40),
    anio: d.anio,
    fechaExpedicion: d.fechaExpedicion ? fechaValida(d.fechaExpedicion, "La fecha de expedición") : null,
    entidadEmisora: acotado(d.entidadEmisora, "La entidad emisora", 2, 200),
    titulo: acotado(d.titulo, "El título", 3, 500),
    tema: opcionalAcotado(d.tema, "El tema", 2000),
    enlaceOficial: opcionalAcotado(d.enlaceOficial, "El enlace oficial", 500),
    notas: opcionalAcotado(d.notas, "Las notas", 2000),
  };
}

/** El nombre del tipo; uno inactivo solo vale si es el que la norma ya tiene. */
async function exigirTipo(tx: TransactionSql, tipoNormaId: number, actual: number | null): Promise<string> {
  const [t] = await tx`SELECT nombre, activo FROM tipos_norma WHERE id = ${tipoNormaId} FOR SHARE`;
  if (!t || (!t.activo && tipoNormaId !== actual)) throw new ErrorNormograma("El tipo de norma no existe o está inactivo");
  return t.nombre as string;
}

/** Tipo, número (sin distinguir mayúsculas) y año identifican una norma. */
async function exigirLibre(tx: TransactionSql, d: DatosNorma, nombre: string, salvo: number | null): Promise<void> {
  const [otra] = await tx`SELECT 1 FROM normas
    WHERE tipo_norma_id = ${d.tipoNormaId} AND lower(numero) = lower(${d.numero}) AND anio = ${d.anio}
      ${salvo === null ? tx`` : tx`AND id <> ${salvo}`}`;
  if (otra) throw new ErrorNormograma(`Ya existe ${nombre}`);
}

const esDuplicado = (err: unknown) => (err as { code?: string }).code === "23505";

export async function crearNorma(sesion: SesionFlujo, d: DatosNorma, opciones?: Opciones): Promise<{ id: number }> {
  exigirAdministrar(sesion);
  const datos = limpiar(d);
  const ahora = opciones?.ahora ?? new Date();
  let nombre = `${datos.numero} de ${datos.anio}`;
  try {
    return await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
      const tipo = await exigirTipo(tx, datos.tipoNormaId, null);
      nombre = nombreDeNorma({ tipo, numero: datos.numero, anio: datos.anio });
      await exigirLibre(tx, datos, nombre, null);
      const [n] = await tx`INSERT INTO normas
          (tipo_norma_id, numero, anio, fecha_expedicion, entidad_emisora, titulo, tema, enlace_oficial, notas, creado_por, creado_en, actualizado_en)
        VALUES (${datos.tipoNormaId}, ${datos.numero}, ${datos.anio}, ${datos.fechaExpedicion}, ${datos.entidadEmisora}, ${datos.titulo},
                ${datos.tema}, ${datos.enlaceOficial}, ${datos.notas}, ${sesion.usuarioId}, ${ahora}, ${ahora})
        RETURNING id`;
      const id = Number(n.id);
      await registrarAuditoria(tx, { usuarioId: sesion.usuarioId, accion: "norma_creada", entidad: "norma", entidadId: id, detalle: { nombre, tipo, ...datos } });
      return { id };
    });
  } catch (err) {
    // Dos altas simultáneas de la misma norma: la segunda choca con el índice único.
    if (esDuplicado(err)) throw new ErrorNormograma(`Ya existe ${nombre}`);
    throw err;
  }
}

export async function editarNorma(sesion: SesionFlujo, id: number, d: DatosNorma, opciones?: Opciones): Promise<void> {
  exigirAdministrar(sesion);
  const datos = limpiar(d);
  const ahora = opciones?.ahora ?? new Date();
  let nombre = `${datos.numero} de ${datos.anio}`;
  try {
    await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
      const [a] = await tx`SELECT n.tipo_norma_id, tn.nombre AS tipo, n.numero, n.anio, n.fecha_expedicion::text AS fecha_expedicion,
          n.entidad_emisora, n.titulo, n.tema, n.enlace_oficial, n.notas
        FROM normas n JOIN tipos_norma tn ON tn.id = n.tipo_norma_id WHERE n.id = ${id} FOR UPDATE OF n`;
      if (!a) throw new ErrorNormograma(NORMA_NO_EXISTE);
      const antes: DatosNorma = {
        tipoNormaId: Number(a.tipo_norma_id),
        numero: a.numero,
        anio: a.anio,
        fechaExpedicion: a.fecha_expedicion,
        entidadEmisora: a.entidad_emisora,
        titulo: a.titulo,
        tema: a.tema,
        enlaceOficial: a.enlace_oficial,
        notas: a.notas,
      };
      const tipo = await exigirTipo(tx, datos.tipoNormaId, antes.tipoNormaId);
      nombre = nombreDeNorma({ tipo, numero: datos.numero, anio: datos.anio });
      if (JSON.stringify(antes) === JSON.stringify(datos)) return;
      await exigirLibre(tx, datos, nombre, id);
      await tx`UPDATE normas SET tipo_norma_id = ${datos.tipoNormaId}, numero = ${datos.numero}, anio = ${datos.anio},
          fecha_expedicion = ${datos.fechaExpedicion}, entidad_emisora = ${datos.entidadEmisora}, titulo = ${datos.titulo},
          tema = ${datos.tema}, enlace_oficial = ${datos.enlaceOficial}, notas = ${datos.notas}, actualizado_en = ${ahora}
        WHERE id = ${id}`;
      await registrarAuditoria(tx, {
        usuarioId: sesion.usuarioId,
        accion: "norma_editada",
        entidad: "norma",
        entidadId: id,
        detalle: { nombre, antes: { ...antes, tipo: a.tipo }, despues: { ...datos, tipo } },
      });
    });
  } catch (err) {
    if (esDuplicado(err)) throw new ErrorNormograma(`Ya existe ${nombre}`);
    throw err;
  }
}

/**
 * El cambio de estado dentro de una transacción abierta (también la de `registrarRelacion`): la norma bloqueada, su
 * fila en `norma_cambios` y, si pasa a modificada, derogada o retirada, sus impactos. Si el estado no cambia, nada.
 */
export async function cambiarEstadoEn(
  tx: TransactionSql,
  sesion: SesionFlujo,
  d: { normaId: number; estado: EstadoNorma; fecha: string; nota: string | null; relacionId: number | null },
  c: { ahora: Date; plazoDias: number },
): Promise<{ cambioId: number | null; impactos: number }> {
  const [n] = await tx`SELECT n.estado, ${nombreSql(tx)} AS nombre
    FROM normas n JOIN tipos_norma tn ON tn.id = n.tipo_norma_id WHERE n.id = ${d.normaId} FOR UPDATE OF n`;
  if (!n) throw new ErrorNormograma(NORMA_NO_EXISTE);
  if (n.estado === d.estado) return { cambioId: null, impactos: 0 };
  await tx`UPDATE normas SET estado = ${d.estado}, estado_en = ${d.fecha}, actualizado_en = ${c.ahora} WHERE id = ${d.normaId}`;
  const [cambio] = await tx`INSERT INTO norma_cambios (norma_id, estado_anterior, estado_nuevo, fecha, relacion_id, usuario_id, nota, creado_en)
    VALUES (${d.normaId}, ${n.estado}, ${d.estado}, ${d.fecha}, ${d.relacionId}, ${sesion.usuarioId}, ${d.nota}, ${c.ahora})
    RETURNING id`;
  const cambioId = Number(cambio.id);
  const impactos = ESTADOS_CON_IMPACTO.includes(d.estado)
    ? await crearImpactos(tx, { cambioId, normaId: d.normaId, ahora: c.ahora, plazoDias: c.plazoDias })
    : 0;
  const retiro = d.estado === "retirada";
  await registrarAuditoria(tx, {
    usuarioId: sesion.usuarioId,
    accion: retiro ? "norma_retirada" : "norma_estado",
    entidad: "norma",
    entidadId: d.normaId,
    detalle: {
      nombre: n.nombre,
      estadoAnterior: n.estado,
      estadoNuevo: d.estado,
      fecha: d.fecha,
      [retiro ? "motivo" : "nota"]: d.nota,
      cambioId,
      relacionId: d.relacionId,
      impactos,
    },
  });
  return { cambioId, impactos };
}

/** El plazo de respuesta de los impactos, de la configuración documental (15 días por defecto). */
export async function plazoDeImpactos(sql: Cliente): Promise<number> {
  return (await obtenerConfigDocumental({ sql })).vigencia.impactoPlazoDias;
}

/** «Cambiar estado» a mano, con fecha y nota (spec 13C §10.2). */
export async function cambiarEstadoNorma(
  sesion: SesionFlujo,
  d: { normaId: number; estado: EstadoNorma; fecha: string; nota: string | null },
  opciones?: Opciones,
): Promise<{ cambioId: number | null; impactos: number }> {
  exigirAdministrar(sesion);
  if (!ESTADOS_NORMA.includes(d.estado)) throw new ErrorNormograma("Elija el estado de la norma");
  const fecha = fechaValida(d.fecha);
  const nota = opcionalAcotado(d.nota, "La nota", 1000);
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const plazoDias = await plazoDeImpactos(sql);
  return enTransaccion(sql, (tx) => cambiarEstadoEn(tx, sesion, { normaId: d.normaId, estado: d.estado, fecha, nota, relacionId: null }, { ahora, plazoDias }));
}

/** Retira con motivo (spec 13C §10.7): sale de las listas y de la búsqueda, queda en su ficha y también abre impactos. */
export async function retirarNorma(
  sesion: SesionFlujo,
  d: { normaId: number; motivo: string },
  opciones?: Opciones,
): Promise<{ cambioId: number | null; impactos: number }> {
  exigirAdministrar(sesion);
  const motivo = acotado(d.motivo, "El motivo", 5, 500);
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const plazoDias = await plazoDeImpactos(sql);
  const fecha = fechaEnZona(ahora, zonaHoraria());
  return enTransaccion(sql, (tx) =>
    cambiarEstadoEn(tx, sesion, { normaId: d.normaId, estado: "retirada", fecha, nota: motivo, relacionId: null }, { ahora, plazoDias }),
  );
}

/** Solo una norma sin relaciones, asociaciones, cambios, impactos ni PDF (D47); las demás se retiran. */
export async function borrarNorma(sesion: SesionFlujo, normaId: number, opciones?: Opciones): Promise<void> {
  exigirAdministrar(sesion);
  await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    const [n] = await tx`SELECT ${nombreSql(tx)} AS nombre, n.titulo
      FROM normas n JOIN tipos_norma tn ON tn.id = n.tipo_norma_id WHERE n.id = ${normaId} FOR UPDATE OF n`;
    if (!n) throw new ErrorNormograma(NORMA_NO_EXISTE);
    const [historia] = await tx`SELECT
        EXISTS (SELECT 1 FROM norma_relaciones WHERE norma_id = ${normaId} OR afectada_id = ${normaId})
        OR EXISTS (SELECT 1 FROM norma_procesos WHERE norma_id = ${normaId})
        OR EXISTS (SELECT 1 FROM norma_documentos WHERE norma_id = ${normaId})
        OR EXISTS (SELECT 1 FROM norma_cambios WHERE norma_id = ${normaId})
        OR EXISTS (SELECT 1 FROM impactos_normativos WHERE norma_id = ${normaId})
        OR EXISTS (SELECT 1 FROM archivos WHERE contexto = 'norma' AND contexto_id = ${normaId}) AS tiene`;
    if (historia.tiene) throw new ErrorNormograma("La norma tiene historia: retírela");
    await tx`DELETE FROM normas WHERE id = ${normaId}`;
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "norma_borrada",
      entidad: "norma",
      entidadId: normaId,
      detalle: { nombre: n.nombre, titulo: n.titulo },
    });
  });
}

/** Para las rutas del PDF: la norma existe (también una retirada, que conserva su ficha). */
export async function existeNorma(normaId: number, opciones?: Opciones): Promise<boolean> {
  const sql = opciones?.sql ?? obtenerSql();
  return (await sql`SELECT 1 FROM normas WHERE id = ${normaId}`).length > 0;
}

export type Norma = {
  id: number;
  tipoNormaId: number;
  tipo: string;
  numero: string;
  anio: number;
  nombre: string;
  fechaExpedicion: string | null;
  entidadEmisora: string;
  titulo: string;
  tema: string | null;
  estado: EstadoNorma;
  estadoEn: string | null;
  /** Texto tal como se guardó: no se convierte en un enlace navegable (F13C-DC19). */
  enlaceOficial: string | null;
  notas: string | null;
  /** `directa`: esta norma es la que modifica, deroga o reglamenta a la otra. `id` es el de la relación. */
  relaciones: { id: number; tipo: TipoRelacion; norma: { id: number; nombre: string; estado: EstadoNorma }; detalle: string | null; directa: boolean }[];
  cambios: { estadoAnterior: EstadoNorma; estadoNuevo: EstadoNorma; fecha: string; nombre: string; nota: string | null; creadoEn: Date }[];
  procesos: { id: number; nombre: string; sigla: string; slug: string; requisito: string | null; puedeEditar: boolean }[];
  /** Un documento que la persona no ve sale con `visible: false`, sin código ni título, después de los que ve. */
  documentos: { id: number; codigo: string | null; titulo: string | null; origen: "interno" | "externo"; visible: boolean }[];
  archivo: Evidencia | null;
  acciones: { administrar: boolean };
};

/** La ficha de una norma (spec 13C §10.6), para toda sesión; también la de una retirada. `null` si no existe. */
export async function obtenerNorma(id: number, sesion: SesionFlujo, opciones?: Opciones): Promise<Norma | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const [n] = await sql`SELECT n.id, n.tipo_norma_id, tn.nombre AS tipo, n.numero, n.anio, ${nombreSql(sql)} AS nombre,
      n.fecha_expedicion::text AS fecha_expedicion, n.entidad_emisora, n.titulo, n.tema, n.estado, n.estado_en::text AS estado_en,
      n.enlace_oficial, n.notas
    FROM normas n JOIN tipos_norma tn ON tn.id = n.tipo_norma_id WHERE n.id = ${id}`;
  if (!n) return null;
  const [relaciones, cambios, procesos, documentos, archivos, alcance] = await Promise.all([
    sql`SELECT r.id, r.tipo, r.detalle, true AS directa, o.id AS otra_id, o.estado AS otra_estado,
        concat_ws(' ', otn.nombre, o.numero, 'de', o.anio::text) AS otra_nombre
      FROM norma_relaciones r JOIN normas o ON o.id = r.afectada_id JOIN tipos_norma otn ON otn.id = o.tipo_norma_id
      WHERE r.norma_id = ${id}
      UNION ALL
      SELECT r.id, r.tipo, r.detalle, false AS directa, o.id AS otra_id, o.estado AS otra_estado,
        concat_ws(' ', otn.nombre, o.numero, 'de', o.anio::text) AS otra_nombre
      FROM norma_relaciones r JOIN normas o ON o.id = r.norma_id JOIN tipos_norma otn ON otn.id = o.tipo_norma_id
      WHERE r.afectada_id = ${id}
      ORDER BY directa DESC, id`,
    sql`SELECT c.estado_anterior, c.estado_nuevo, c.fecha::text AS fecha, u.nombre, c.nota, c.creado_en
      FROM norma_cambios c JOIN usuarios u ON u.id = c.usuario_id
      WHERE c.norma_id = ${id} ORDER BY c.creado_en, c.id`,
    sql`SELECT p.id, p.nombre, p.sigla, p.slug, np.requisito
      FROM norma_procesos np JOIN procesos p ON p.id = np.proceso_id
      WHERE np.norma_id = ${id} ORDER BY p.nombre`,
    sql`SELECT d.id, d.codigo, d.titulo, d.origen, ${filtroAcceso(sql, sesion)} AS visible
      FROM norma_documentos nd JOIN documentos d ON d.id = nd.documento_id
      WHERE nd.norma_id = ${id}
      ORDER BY 5 DESC, CASE WHEN ${filtroAcceso(sql, sesion)} THEN d.codigo END, nd.id`,
    evidenciasDe("norma", id, { sql }),
    alcanceProcesos(sesion, { sql }),
  ]);
  return {
    id: Number(n.id),
    tipoNormaId: Number(n.tipo_norma_id),
    tipo: n.tipo,
    numero: n.numero,
    anio: n.anio,
    nombre: n.nombre,
    fechaExpedicion: n.fecha_expedicion ?? null,
    entidadEmisora: n.entidad_emisora,
    titulo: n.titulo,
    tema: n.tema ?? null,
    estado: n.estado,
    estadoEn: n.estado_en ?? null,
    enlaceOficial: n.enlace_oficial ?? null,
    notas: n.notas ?? null,
    relaciones: relaciones.map((r) => ({
      id: Number(r.id),
      tipo: r.tipo,
      norma: { id: Number(r.otra_id), nombre: r.otra_nombre, estado: r.otra_estado },
      detalle: r.detalle ?? null,
      directa: r.directa,
    })),
    cambios: cambios.map((c) => ({
      estadoAnterior: c.estado_anterior,
      estadoNuevo: c.estado_nuevo,
      fecha: c.fecha,
      nombre: c.nombre,
      nota: c.nota ?? null,
      creadoEn: new Date(c.creado_en),
    })),
    procesos: procesos.map((p) => ({
      id: Number(p.id),
      nombre: p.nombre,
      sigla: p.sigla,
      slug: p.slug,
      requisito: p.requisito ?? null,
      puedeEditar: puedeAsociarNorma(sesion, Number(p.id), alcance),
    })),
    documentos: documentos.map((d) =>
      d.visible
        ? { id: Number(d.id), codigo: d.codigo, titulo: d.titulo, origen: d.origen, visible: true }
        : { id: Number(d.id), codigo: null, titulo: null, origen: d.origen, visible: false },
    ),
    archivo: archivos.at(-1) ?? null,
    acciones: { administrar: puede(sesion, "normograma.administrar") },
  };
}

export type FilaNorma = {
  id: number;
  nombre: string;
  titulo: string;
  entidadEmisora: string;
  estado: EstadoNorma;
  estadoEn: string | null;
  anio: number;
  tipo: string;
  /** Los nombres de los procesos asociados. */
  procesos: string[];
  /** Los documentos enlazados; con `sesion`, solo los que la persona ve. */
  documentos: number;
};

export type FiltroNormas = {
  tipoNormaId?: number;
  anio?: number;
  emisor?: string;
  estado?: EstadoNorma | "todas";
  procesoId?: number;
  q?: string;
  incluirRetiradas?: boolean;
};

/**
 * Las filas de las listas del normograma que cumplen `condicion` (sobre `normas n` y `tipos_norma tn`), de la más
 * reciente a la más antigua. `sujeto`: `documentos` cuenta solo lo que esa persona ve (un restringido que no ve no se
 * revela por diferencia). `requisitoDe`: el requisito que la norma impone a ese proceso.
 */
export async function filasDeNormas(
  sql: Cliente,
  condicion: PendingQuery<Row[]>,
  sujeto: SujetoVisibilidad | undefined,
  requisitoDe?: number,
): Promise<{ fila: FilaNorma; requisito: string | null }[]> {
  const filas = await sql`
    SELECT n.id, ${nombreSql(sql)} AS nombre, n.titulo, n.entidad_emisora, n.estado, n.estado_en::text AS estado_en, n.anio,
      tn.nombre AS tipo,
      ARRAY(SELECT p.nombre FROM norma_procesos np JOIN procesos p ON p.id = np.proceso_id
        WHERE np.norma_id = n.id ORDER BY p.nombre) AS procesos,
      (SELECT count(*) FROM norma_documentos nd JOIN documentos d ON d.id = nd.documento_id
        WHERE nd.norma_id = n.id AND ${sujeto ? filtroAcceso(sql, sujeto) : sql`true`})::int AS documentos,
      ${requisitoDe === undefined
        ? sql`NULL::text`
        : sql`(SELECT np.requisito FROM norma_procesos np WHERE np.norma_id = n.id AND np.proceso_id = ${requisitoDe})`} AS requisito
    FROM normas n JOIN tipos_norma tn ON tn.id = n.tipo_norma_id
    WHERE ${condicion}
    ORDER BY n.anio DESC, tn.orden, n.numero, n.id`;
  return filas.map((f) => ({
    fila: {
      id: Number(f.id),
      nombre: f.nombre,
      titulo: f.titulo,
      entidadEmisora: f.entidad_emisora,
      estado: f.estado,
      estadoEn: f.estado_en ?? null,
      anio: f.anio,
      tipo: f.tipo,
      procesos: f.procesos as string[],
      documentos: f.documentos,
    },
    requisito: f.requisito ?? null,
  }));
}

/**
 * El normograma institucional con sus filtros (spec 13C §10.6). Sin las retiradas salvo `incluirRetiradas` o
 * `estado: "retirada"`. Pase `sesion` para que `documentos` cuente solo lo que la persona ve.
 */
export async function listarNormas(filtro: FiltroNormas, opciones?: Opciones & { sesion?: SujetoVisibilidad }): Promise<FilaNorma[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const condiciones: PendingQuery<Row[]>[] = [];
  if (filtro.estado === "retirada") condiciones.push(sql`n.estado = 'retirada'`);
  else {
    if (!filtro.incluirRetiradas) condiciones.push(sql`n.estado <> 'retirada'`);
    if (filtro.estado && filtro.estado !== "todas") condiciones.push(sql`n.estado = ${filtro.estado}`);
  }
  if (filtro.tipoNormaId !== undefined) condiciones.push(sql`n.tipo_norma_id = ${filtro.tipoNormaId}`);
  if (filtro.anio !== undefined) condiciones.push(sql`n.anio = ${filtro.anio}`);
  if (filtro.emisor?.trim()) condiciones.push(sql`lower(n.entidad_emisora) = lower(${filtro.emisor.trim()})`);
  if (filtro.procesoId !== undefined) {
    condiciones.push(sql`EXISTS (SELECT 1 FROM norma_procesos fnp WHERE fnp.norma_id = n.id AND fnp.proceso_id = ${filtro.procesoId})`);
  }
  if (filtro.q?.trim()) condiciones.push(condicionTexto(sql, filtro.q.trim()));
  const condicion = condiciones.reduce((a, b) => sql`${a} AND ${b}`, sql`true`);
  return (await filasDeNormas(sql, condicion, opciones?.sesion)).map((f) => f.fila);
}

/** Hasta 10 entidades emisoras ya escritas que empiezan por `prefijo` (el `datalist` del formulario). */
export async function sugerirEmisores(prefijo: string, opciones?: Opciones): Promise<string[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`SELECT DISTINCT entidad_emisora FROM normas
    WHERE entidad_emisora ILIKE ${`${escaparLike(prefijo.trim())}%`}
    ORDER BY entidad_emisora LIMIT 10`;
  return filas.map((f) => f.entidad_emisora as string);
}

/** Los años y los emisores de las normas no retiradas, para los filtros de la lista. */
export async function aniosYEmisores(opciones?: Opciones): Promise<{ anios: number[]; emisores: string[] }> {
  const sql = opciones?.sql ?? obtenerSql();
  const [f] = await sql`SELECT
      ARRAY(SELECT DISTINCT anio FROM normas WHERE estado <> 'retirada' ORDER BY anio DESC) AS anios,
      ARRAY(SELECT DISTINCT entidad_emisora FROM normas WHERE estado <> 'retirada' ORDER BY entidad_emisora) AS emisores`;
  return { anios: (f.anios as number[]).map(Number), emisores: f.emisores as string[] };
}
