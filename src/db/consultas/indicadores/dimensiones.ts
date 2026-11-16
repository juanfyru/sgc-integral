/**
 * El maestro de dimensiones y sus categorías (anexo 14C, §5.1): «Sede» con sus sedes, «Servicio» con sus servicios… Lo
 * administra quien tiene `indicadores.administrar`, que se comprueba antes que cualquier otra cosa. Lo que ya se usó
 * (una ficha, un dato o un valor reportado) no se borra: se desactiva y los periodos nuevos dejan de pedirlo. Módulo
 * liviano: lo importan `fichas`, `mediciones` y `datos-periodos`, así que no importa ninguno de ellos.
 *
 * Candados: la tabla de categorías (o la de dimensiones al crear una) en `SHARE ROW EXCLUSIVE` antes de calcular un
 * orden o comprobar un nombre, y después la fila `FOR UPDATE`.
 */
import type { TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { enTransaccion, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { EsquemaCategoria, EsquemaDimension } from "@/lib/esquemas/indicadores-maestros";
import { ErrorIndicador } from "@/lib/indicadores/tipos";
import { ErrorPermiso, puede } from "@/lib/permisos";

type Opciones = { sql?: Cliente; ahora?: Date };

export type Categoria = { id: number; dimensionId: number; nombre: string; orden: number; activo: boolean; usada: boolean };
export type Dimension = { id: number; nombre: string; orden: number; activo: boolean; usada: boolean; categorias: Categoria[] };

const DIMENSION_REPETIDA = "Ya hay una dimensión con ese nombre";
const CATEGORIA_REPETIDA = "Ya hay una categoría con ese nombre en esta dimensión";
const YA_SE_USO = "Ya se usó: desactívela";
const SIN_CATEGORIAS = "Esta dimensión la usa una ficha vigente: no puede quedar sin categorías activas";

function exigirAdministrar(sesion: SesionFlujo): void {
  if (!puede(sesion, "indicadores.administrar")) throw new ErrorPermiso();
}

const idValido = (n: number, mensaje: string) => {
  if (!Number.isInteger(n) || n <= 0) throw new ErrorIndicador(mensaje);
};

/** Algún valor, medición o dato guarda la categoría `categoriaId` (un id o un fragmento de SQL). */
const categoriaUsada = (sql: Cliente, categoriaId: number | ReturnType<Cliente>) => sql`(
  EXISTS (SELECT 1 FROM medicion_valores mv WHERE mv.categoria_id = ${categoriaId})
  OR EXISTS (SELECT 1 FROM mediciones m WHERE m.categorias @> jsonb_build_array(jsonb_build_object('id', ${categoriaId}::int)))
  OR EXISTS (SELECT 1 FROM variable_valores vv WHERE vv.categorias @> jsonb_build_array(jsonb_build_object('id', ${categoriaId}::int))))`;

/** Alguna versión (cualquiera) o algún dato cita la dimensión, o alguna de sus categorías se usó. */
const dimensionUsada = (sql: Cliente, dimensionId: number | ReturnType<Cliente>) => sql`(
  EXISTS (SELECT 1 FROM indicador_versiones iv WHERE iv.dimension_id = ${dimensionId})
  OR EXISTS (SELECT 1 FROM variables_compartidas vc WHERE vc.dimension_id = ${dimensionId})
  OR EXISTS (SELECT 1 FROM dimension_categorias dc WHERE dc.dimension_id = ${dimensionId} AND ${categoriaUsada(sql, sql`dc.id`)}))`;

/** La ficha vigente de un indicador activo (su última versión aprobada) cita la dimensión. */
async function laUsaUnaFichaVigente(tx: TransactionSql, dimensionId: number): Promise<boolean> {
  const [r] = await tx`SELECT EXISTS (
    SELECT 1 FROM indicador_versiones v
    JOIN indicadores i ON i.id = v.indicador_id AND i.estado = 'activo'
    WHERE v.dimension_id = ${dimensionId} AND v.estado = 'aprobada'
      AND v.numero = (SELECT max(w.numero) FROM indicador_versiones w WHERE w.indicador_id = v.indicador_id AND w.estado = 'aprobada')
  ) AS si`;
  return r.si === true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lecturas
// ─────────────────────────────────────────────────────────────────────────────

/** Las dimensiones con sus categorías, en su orden; `usada` dice si algo ya las cita. */
export async function listarDimensiones(opciones?: { sql?: Cliente; soloActivas?: boolean }): Promise<Dimension[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const solo = opciones?.soloActivas === true;
  const dimensiones = await sql`
    SELECT d.id, d.nombre, d.orden, d.activo, ${dimensionUsada(sql, sql`d.id`)} AS usada
    FROM dimensiones d ${solo ? sql`WHERE d.activo` : sql``} ORDER BY d.orden, d.id`;
  if (dimensiones.length === 0) return [];
  const categorias = await sql`
    SELECT c.id, c.dimension_id, c.nombre, c.orden, c.activo, ${categoriaUsada(sql, sql`c.id`)} AS usada
    FROM dimension_categorias c
    WHERE c.dimension_id IN ${sql(dimensiones.map((d) => Number(d.id)))} ${solo ? sql`AND c.activo` : sql``}
    ORDER BY c.orden, c.id`;
  return dimensiones.map((d) => ({
    id: Number(d.id),
    nombre: d.nombre as string,
    orden: Number(d.orden),
    activo: d.activo === true,
    usada: d.usada === true,
    categorias: categorias
      .filter((c) => Number(c.dimension_id) === Number(d.id))
      .map((c) => ({
        id: Number(c.id),
        dimensionId: Number(c.dimension_id),
        nombre: c.nombre as string,
        orden: Number(c.orden),
        activo: c.activo === true,
        usada: c.usada === true,
      })),
  }));
}

/**
 * Todas las categorías de la dimensión, activas o no, con cuándo nacieron y cuándo se desactivaron: la lista de un periodo.
 * Con `bloquear`, dentro de la transacción que guarda la lista en un `jsonb` (que no tiene llave foránea), cada fila
 * `FOR KEY SHARE`: `borrarCategoria`, que la toma `FOR UPDATE` antes de ver si está usada, espera a que la lista quede
 * guardada y la ve.
 */
export async function maestroDeCategorias(
  sql: Cliente,
  dimensionId: number,
  opciones?: { bloquear?: boolean },
): Promise<{ id: number; nombre: string; orden: number; activo: boolean; creadoEn: Date; desactivadaEn: Date | null }[]> {
  const filas = await sql`SELECT id, nombre, orden, activo, creado_en, desactivada_en FROM dimension_categorias
    WHERE dimension_id = ${dimensionId} ORDER BY orden, id ${opciones?.bloquear === true ? sql`FOR KEY SHARE` : sql``}`;
  return filas.map((f) => ({
    id: Number(f.id),
    nombre: f.nombre as string,
    orden: Number(f.orden),
    activo: f.activo === true,
    creadoEn: f.creado_en as Date,
    desactivadaEn: (f.desactivada_en as Date | null) ?? null,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Dimensiones
// ─────────────────────────────────────────────────────────────────────────────

const bloquearDimensiones = (tx: TransactionSql) => tx`LOCK TABLE dimensiones IN SHARE ROW EXCLUSIVE MODE`;
const bloquearCategorias = (tx: TransactionSql) => tx`LOCK TABLE dimension_categorias IN SHARE ROW EXCLUSIVE MODE`;

async function dimensionBloqueada(tx: TransactionSql, id: number): Promise<{ id: number; nombre: string; activo: boolean }> {
  idValido(id, "La dimensión no existe");
  const [d] = await tx`SELECT id, nombre, activo FROM dimensiones WHERE id = ${id} FOR UPDATE`;
  if (!d) throw new ErrorIndicador("La dimensión no existe");
  return { id: Number(d.id), nombre: d.nombre as string, activo: d.activo === true };
}

/** El nombre, validado con el esquema de su formulario. */
function nombreValido(esquema: typeof EsquemaDimension | typeof EsquemaCategoria, nombre: string): string {
  const r = esquema.safeParse({ nombre });
  if (!r.success) throw new ErrorIndicador(r.error.issues[0].message);
  return r.data.nombre;
}

/** Crea (sin `id`; queda al final) o renombra una dimensión. */
export async function guardarDimension(
  sesion: SesionFlujo,
  d: { id?: number; nombre: string },
  opciones?: Opciones,
): Promise<{ id: number }> {
  exigirAdministrar(sesion);
  const nombre = nombreValido(EsquemaDimension, d.nombre);
  return enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    await bloquearDimensiones(tx);
    const [otra] = await tx`SELECT id FROM dimensiones WHERE lower(nombre) = lower(${nombre}) AND id <> ${d.id ?? 0} LIMIT 1`;
    if (otra) throw new ErrorIndicador(DIMENSION_REPETIDA);
    let id: number;
    let antes: string | null = null;
    if (d.id === undefined) {
      const [fila] = await tx`INSERT INTO dimensiones (nombre, orden)
        VALUES (${nombre}, (SELECT coalesce(max(orden), 0) + 1 FROM dimensiones)) RETURNING id`;
      id = Number(fila.id);
    } else {
      antes = (await dimensionBloqueada(tx, d.id)).nombre;
      id = d.id;
      await tx`UPDATE dimensiones SET nombre = ${nombre} WHERE id = ${id}`;
    }
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "dimension_guardada",
      entidad: "dimension",
      entidadId: id,
      detalle: { nombre, creada: d.id === undefined, antes },
    });
    return { id };
  });
}

export async function cambiarEstadoDeDimension(
  sesion: SesionFlujo,
  d: { id: number; activo: boolean },
  opciones?: Opciones,
): Promise<void> {
  exigirAdministrar(sesion);
  await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    await bloquearDimensiones(tx);
    const dim = await dimensionBloqueada(tx, d.id);
    if (dim.activo === d.activo) return;
    await tx`UPDATE dimensiones SET activo = ${d.activo} WHERE id = ${dim.id}`;
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: d.activo ? "dimension_activada" : "dimension_desactivada",
      entidad: "dimension",
      entidadId: dim.id,
      detalle: { nombre: dim.nombre },
    });
  });
}

/** Borra una dimensión que nada usa, con sus categorías. */
export async function borrarDimension(sesion: SesionFlujo, id: number, opciones?: Opciones): Promise<void> {
  exigirAdministrar(sesion);
  await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    await bloquearDimensiones(tx);
    await bloquearCategorias(tx);
    const dim = await dimensionBloqueada(tx, id);
    const [uso] = await tx`SELECT ${dimensionUsada(tx, dim.id)} AS usada`;
    if (uso.usada === true) throw new ErrorIndicador(YA_SE_USO);
    const [n] = await tx`SELECT count(*)::int AS n FROM dimension_categorias WHERE dimension_id = ${dim.id}`;
    await tx`DELETE FROM dimension_categorias WHERE dimension_id = ${dim.id}`;
    await tx`DELETE FROM dimensiones WHERE id = ${dim.id}`;
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "dimension_borrada",
      entidad: "dimension",
      entidadId: dim.id,
      detalle: { nombre: dim.nombre, categorias: Number(n.n) },
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Categorías
// ─────────────────────────────────────────────────────────────────────────────

type FilaCategoria = { id: number; dimensionId: number; nombre: string; activo: boolean; orden: number; dimension: string };

async function categoriaBloqueada(tx: TransactionSql, id: number): Promise<FilaCategoria> {
  idValido(id, "La categoría no existe");
  const [c] = await tx`SELECT c.id, c.dimension_id, c.nombre, c.activo, c.orden, d.nombre AS dimension
    FROM dimension_categorias c JOIN dimensiones d ON d.id = c.dimension_id WHERE c.id = ${id} FOR UPDATE OF c`;
  if (!c) throw new ErrorIndicador("La categoría no existe");
  return {
    id: Number(c.id),
    dimensionId: Number(c.dimension_id),
    nombre: c.nombre as string,
    activo: c.activo === true,
    orden: Number(c.orden),
    dimension: c.dimension as string,
  };
}

/** Que, quitada esta categoría activa, la dimensión de una ficha vigente siga teniendo alguna otra activa. */
async function exigirOtraActiva(tx: TransactionSql, c: FilaCategoria): Promise<void> {
  if (!c.activo) return;
  const [otra] = await tx`SELECT 1 FROM dimension_categorias WHERE dimension_id = ${c.dimensionId} AND activo AND id <> ${c.id} LIMIT 1`;
  if (!otra && (await laUsaUnaFichaVigente(tx, c.dimensionId))) throw new ErrorIndicador(SIN_CATEGORIAS);
}

/**
 * Crea (queda al final de su dimensión) o renombra una categoría; la que se edita no cambia de dimensión. La nueva nace con
 * la hora de `opciones.ahora` (sin ella, la de la base): desde ella la piden los periodos (`listaDelPeriodo`).
 */
export async function guardarCategoria(
  sesion: SesionFlujo,
  d: { id?: number; dimensionId: number; nombre: string },
  opciones?: Opciones,
): Promise<{ id: number }> {
  exigirAdministrar(sesion);
  const nombre = nombreValido(EsquemaCategoria, d.nombre);
  return enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    await bloquearCategorias(tx);
    let dimensionId: number;
    let dimension: string;
    let antes: string | null = null;
    if (d.id === undefined) {
      const dim = await dimensionBloqueada(tx, d.dimensionId);
      dimensionId = dim.id;
      dimension = dim.nombre;
    } else {
      const c = await categoriaBloqueada(tx, d.id);
      dimensionId = c.dimensionId;
      dimension = c.dimension;
      antes = c.nombre;
    }
    const [otra] = await tx`SELECT id FROM dimension_categorias
      WHERE dimension_id = ${dimensionId} AND lower(nombre) = lower(${nombre}) AND id <> ${d.id ?? 0} LIMIT 1`;
    if (otra) throw new ErrorIndicador(CATEGORIA_REPETIDA);
    let id: number;
    if (d.id === undefined) {
      const [fila] = await tx`INSERT INTO dimension_categorias (dimension_id, nombre, orden, creado_en)
        VALUES (${dimensionId}, ${nombre}, (SELECT coalesce(max(orden), 0) + 1 FROM dimension_categorias WHERE dimension_id = ${dimensionId}),
          ${opciones?.ahora ?? tx`now()`})
        RETURNING id`;
      id = Number(fila.id);
    } else {
      id = d.id;
      await tx`UPDATE dimension_categorias SET nombre = ${nombre} WHERE id = ${id}`;
    }
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "categoria_guardada",
      entidad: "dimension_categoria",
      entidadId: id,
      detalle: { nombre, dimension, creada: d.id === undefined, antes },
    });
    return { id };
  });
}

/** Intercambia el orden de la categoría con su vecina; en el extremo no cambia nada ni se audita. */
export async function moverCategoria(
  sesion: SesionFlujo,
  d: { id: number; sentido: "arriba" | "abajo" },
  opciones?: Opciones,
): Promise<void> {
  exigirAdministrar(sesion);
  if (d.sentido !== "arriba" && d.sentido !== "abajo") throw new ErrorIndicador("El sentido no es válido");
  await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    await bloquearCategorias(tx);
    const c = await categoriaBloqueada(tx, d.id);
    const hermanas = await tx`SELECT id, orden FROM dimension_categorias WHERE dimension_id = ${c.dimensionId} ORDER BY orden, id`;
    const posicion = hermanas.findIndex((h) => Number(h.id) === c.id);
    const vecina = hermanas[posicion + (d.sentido === "arriba" ? -1 : 1)];
    if (!vecina) return;
    const propio = Number(hermanas[posicion].orden);
    const ajeno = Number(vecina.orden);
    // Con el mismo orden, intercambiar los valores no movería nada: se separan por posición.
    const [nuevoPropio, nuevoAjeno] =
      propio === ajeno ? (d.sentido === "arriba" ? [propio - 1, propio] : [propio + 1, propio]) : [ajeno, propio];
    await tx`UPDATE dimension_categorias SET orden = ${nuevoPropio} WHERE id = ${c.id}`;
    await tx`UPDATE dimension_categorias SET orden = ${nuevoAjeno} WHERE id = ${Number(vecina.id)}`;
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "categoria_movida",
      entidad: "dimension_categoria",
      entidadId: c.id,
      detalle: { nombre: c.nombre, dimension: c.dimension, sentido: d.sentido },
    });
  });
}

/** Al desactivarla queda desde cuándo (`desactivada_en`, la hora de `opciones.ahora`); al activarla se borra. */
export async function cambiarEstadoDeCategoria(
  sesion: SesionFlujo,
  d: { id: number; activo: boolean },
  opciones?: Opciones,
): Promise<void> {
  exigirAdministrar(sesion);
  await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    await bloquearCategorias(tx);
    const c = await categoriaBloqueada(tx, d.id);
    if (c.activo === d.activo) return;
    if (!d.activo) await exigirOtraActiva(tx, c);
    await tx`UPDATE dimension_categorias SET activo = ${d.activo}, desactivada_en = ${d.activo ? null : (opciones?.ahora ?? new Date())}
      WHERE id = ${c.id}`;
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: d.activo ? "categoria_activada" : "categoria_desactivada",
      entidad: "dimension_categoria",
      entidadId: c.id,
      detalle: { nombre: c.nombre, dimension: c.dimension },
    });
  });
}

/** Borra una categoría que ningún valor, medición ni dato guarda. */
export async function borrarCategoria(sesion: SesionFlujo, id: number, opciones?: Opciones): Promise<void> {
  exigirAdministrar(sesion);
  await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    await bloquearCategorias(tx);
    const c = await categoriaBloqueada(tx, id);
    const [uso] = await tx`SELECT ${categoriaUsada(tx, c.id)} AS usada`;
    if (uso.usada === true) throw new ErrorIndicador(YA_SE_USO);
    await exigirOtraActiva(tx, c);
    await tx`DELETE FROM dimension_categorias WHERE id = ${c.id}`;
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "categoria_borrada",
      entidad: "dimension_categoria",
      entidadId: c.id,
      detalle: { nombre: c.nombre, dimension: c.dimension },
    });
  });
}
