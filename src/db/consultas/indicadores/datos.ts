/**
 * El catálogo de datos compartidos (anexo 14C, §4.1): una variable que varios indicadores usan y que su responsable reporta
 * una sola vez. Cada dato pertenece a un proceso; lo mantiene quien tiene `indicadores.administrar`, que se comprueba antes
 * que cualquier otra cosa. Quién lo ve y quién lo reporta lo dicen `filtroDatos` y `puedeReportarDato` (`src/lib/alcance.ts`).
 *
 * Desde que una versión aprobada de alguna ficha lo cita, su periodicidad, su «cómo se junta» y su dimensión no cambian
 * (F14C-DC34): lo demás se edita siempre. Se desactiva solo si ningún indicador activo lo usa (`enUso`), y con historia
 * (alguna versión que lo cita o algún periodo) no se borra.
 *
 * Candados: el dato `FOR UPDATE` antes de leer si está citado o en uso y antes de tocar sus responsables.
 */
import type { TransactionSql } from "postgres";
import type { z } from "zod";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { enTransaccion, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { filtroDatos, type SujetoVisibilidad } from "@/lib/alcance";
import { EsquemaDato } from "@/lib/esquemas/indicadores-datos";
import { comparar, fraccion } from "@/lib/indicadores/formula/fraccion";
import { versionQueRigeEntre } from "@/lib/indicadores/periodos";
import { ErrorIndicador, type Consolidacion, type Periodicidad } from "@/lib/indicadores/tipos";
import { ErrorPermiso, puede } from "@/lib/permisos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { texto, versionesAprobadas } from "./mediciones";

type Opciones = { sql?: Cliente; ahora?: Date };

export type DatoCompartido = {
  id: number;
  procesoId: number;
  proceso: string;
  nombre: string;
  descripcion: string | null;
  fuente: string | null;
  unidad: string | null;
  periodicidad: Periodicidad;
  consolidacion: Consolidacion;
  capturaMin: string | null;
  capturaMax: string | null;
  admiteNegativos: boolean;
  plazoReporteDias: number;
  dimensionId: number | null;
  dimension: string | null;
  activa: boolean;
  /** Alguna versión aprobada de alguna ficha lo cita: su periodicidad, su «cómo se junta» y su dimensión ya no cambian. */
  citado: boolean;
  /** Los inactivos vienen marcados para que la página lo diga. */
  responsables: { id: number; nombre: string; activo: boolean }[];
};

const DATO_NO_EXISTE = "El dato no existe";
const NOMBRE_REPETIDO = "Ya hay un dato con ese nombre en ese proceso";
const YA_LO_CITA =
  "Este dato ya lo cita una ficha aprobada: su periodicidad, cómo se junta y su dimensión no se pueden cambiar. Cree otro dato";
const EN_USO = "Lo usa un indicador activo: cambie antes su ficha";
const CON_HISTORIA = "Este dato ya tiene historia: desactívelo";
const DIMENSION_INACTIVA = "Elija una dimensión activa";
const MAXIMO_RESPONSABLES = 20;

function exigirAdministrar(sesion: SesionFlujo): void {
  if (!puede(sesion, "indicadores.administrar")) throw new ErrorPermiso();
}

const esNombreRepetido = (err: unknown) =>
  (err as { code?: string }).code === "23505" && (err as { constraint_name?: string }).constraint_name === "variables_compartidas_nombre_idx";

const ascendente = (ids: readonly number[]) => [...ids].sort((a, b) => a - b);

/** Alguna versión aprobada cita el dato `datoId` (un id o un fragmento de SQL). */
const citadoPor = (sql: Cliente, datoId: number | ReturnType<Cliente>) => sql`EXISTS (
  SELECT 1 FROM indicador_variables cit_v
  JOIN indicador_versiones cit_fv ON cit_fv.id = cit_v.version_id AND cit_fv.estado = 'aprobada'
  WHERE cit_v.variable_compartida_id = ${datoId})`;

// ─────────────────────────────────────────────────────────────────────────────
// Lecturas
// ─────────────────────────────────────────────────────────────────────────────

/** Los datos que cumplen `condicion` (la consulta llama `d` al dato), por proceso y nombre, con sus responsables. */
async function leer(sql: Cliente, condicion: ReturnType<Cliente>): Promise<DatoCompartido[]> {
  const filas = await sql`
    SELECT d.id, d.proceso_id, p.nombre AS proceso, d.nombre, d.descripcion, d.fuente, d.unidad, d.periodicidad, d.consolidacion,
      d.captura_min, d.captura_max, d.admite_negativos, d.plazo_reporte_dias, d.dimension_id, dim.nombre AS dimension, d.activa,
      ${citadoPor(sql, sql`d.id`)} AS citado
    FROM variables_compartidas d
    JOIN procesos p ON p.id = d.proceso_id
    LEFT JOIN dimensiones dim ON dim.id = d.dimension_id
    WHERE ${condicion}
    ORDER BY p.nombre, lower(d.nombre), d.id`;
  if (filas.length === 0) return [];
  const responsables = new Map<number, DatoCompartido["responsables"]>();
  for (const r of await sql`
    SELECT r.variable_id, u.id, u.nombre, u.activo FROM variable_responsables r
    JOIN usuarios u ON u.id = r.usuario_id
    WHERE r.variable_id IN ${sql(filas.map((f) => Number(f.id)))}
    ORDER BY u.nombre, u.id`) {
    const datoId = Number(r.variable_id);
    responsables.set(datoId, [...(responsables.get(datoId) ?? []), { id: Number(r.id), nombre: r.nombre as string, activo: r.activo === true }]);
  }
  return filas.map((f) => ({
    id: Number(f.id),
    procesoId: Number(f.proceso_id),
    proceso: f.proceso as string,
    nombre: f.nombre as string,
    descripcion: texto(f.descripcion),
    fuente: texto(f.fuente),
    unidad: texto(f.unidad),
    periodicidad: f.periodicidad as Periodicidad,
    consolidacion: f.consolidacion as Consolidacion,
    capturaMin: texto(f.captura_min),
    capturaMax: texto(f.captura_max),
    admiteNegativos: f.admite_negativos === true,
    plazoReporteDias: Number(f.plazo_reporte_dias),
    dimensionId: f.dimension_id === null ? null : Number(f.dimension_id),
    dimension: texto(f.dimension),
    activa: f.activa === true,
    citado: f.citado === true,
    responsables: responsables.get(Number(f.id)) ?? [],
  }));
}

/** Los datos que la persona ve (`filtroDatos`); con `soloActivos`, sin los desactivados. */
export async function listarDatos(
  sesion: SujetoVisibilidad,
  opciones?: { sql?: Cliente; soloActivos?: boolean },
): Promise<DatoCompartido[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const activos = opciones?.soloActivos === true ? sql`d.activa` : sql`true`;
  return leer(sql, sql`${filtroDatos(sql, sesion)} AND ${activos}`);
}

/** El dato, o `null` si no existe o la persona no lo ve: para ella no existe. */
export async function datoPorId(
  sesion: SujetoVisibilidad,
  datoId: number,
  opciones?: { sql?: Cliente },
): Promise<DatoCompartido | null> {
  if (!Number.isInteger(datoId) || datoId <= 0) return null;
  const sql = opciones?.sql ?? obtenerSql();
  const [dato] = await leer(sql, sql`d.id = ${datoId} AND ${filtroDatos(sql, sesion)}`);
  return dato ?? null;
}

/** Los datos activos que ofrece el formulario de la ficha, que es de quien administra (anexo 14C, §4.2). */
export async function datosParaFicha(sql: Cliente): Promise<
  { id: number; nombre: string; proceso: string; periodicidad: Periodicidad; consolidacion: Consolidacion; dimensionId: number | null; dimension: string | null }[]
> {
  const filas = await sql`
    SELECT d.id, d.nombre, p.nombre AS proceso, d.periodicidad, d.consolidacion, d.dimension_id, dim.nombre AS dimension
    FROM variables_compartidas d
    JOIN procesos p ON p.id = d.proceso_id
    LEFT JOIN dimensiones dim ON dim.id = d.dimension_id
    WHERE d.activa
    ORDER BY p.nombre, lower(d.nombre), d.id`;
  return filas.map((f) => ({
    id: Number(f.id),
    nombre: f.nombre as string,
    proceso: f.proceso as string,
    periodicidad: f.periodicidad as Periodicidad,
    consolidacion: f.consolidacion as Consolidacion,
    dimensionId: f.dimension_id === null ? null : Number(f.dimension_id),
    dimension: texto(f.dimension),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Escrituras
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que la fila guarda, en la forma del esquema (y de la bitácora). */
type Campos = {
  procesoId: number;
  nombre: string;
  descripcion: string | null;
  fuente: string | null;
  unidad: string | null;
  periodicidad: Periodicidad;
  consolidacion: Consolidacion;
  capturaMin: string | null;
  capturaMax: string | null;
  admiteNegativos: boolean;
  plazoReporteDias: number;
  dimensionId: number | null;
};

type FilaDato = Campos & { id: number; activa: boolean };

/** El dato bloqueado `FOR UPDATE`; el primer candado de toda escritura sobre uno que ya existe. */
async function datoBloqueado(tx: TransactionSql, datoId: number): Promise<FilaDato> {
  if (!Number.isInteger(datoId) || datoId <= 0) throw new ErrorIndicador(DATO_NO_EXISTE);
  const [f] = await tx`SELECT * FROM variables_compartidas WHERE id = ${datoId} FOR UPDATE`;
  if (!f) throw new ErrorIndicador(DATO_NO_EXISTE);
  return {
    id: Number(f.id),
    procesoId: Number(f.proceso_id),
    nombre: f.nombre as string,
    descripcion: texto(f.descripcion),
    fuente: texto(f.fuente),
    unidad: texto(f.unidad),
    periodicidad: f.periodicidad as Periodicidad,
    consolidacion: f.consolidacion as Consolidacion,
    capturaMin: texto(f.captura_min),
    capturaMax: texto(f.captura_max),
    admiteNegativos: f.admite_negativos === true,
    plazoReporteDias: Number(f.plazo_reporte_dias),
    dimensionId: f.dimension_id === null ? null : Number(f.dimension_id),
    activa: f.activa === true,
  };
}

const camposDe = (f: FilaDato): Campos => ({
  procesoId: f.procesoId,
  nombre: f.nombre,
  descripcion: f.descripcion,
  fuente: f.fuente,
  unidad: f.unidad,
  periodicidad: f.periodicidad,
  consolidacion: f.consolidacion,
  capturaMin: f.capturaMin,
  capturaMax: f.capturaMax,
  admiteNegativos: f.admiteNegativos,
  plazoReporteDias: f.plazoReporteDias,
  dimensionId: f.dimensionId,
});

function validar(datos: unknown): Campos {
  const r = EsquemaDato.safeParse(datos);
  if (!r.success) throw new ErrorIndicador(r.error.issues[0].message);
  const d = r.data;
  const [min, max] = [d.capturaMin, d.capturaMax].map((v) => (v === undefined ? null : fraccion(v)));
  if (min && max && comparar(min, max) > 0) throw new ErrorIndicador("El mínimo de captura no puede pasar del máximo");
  return {
    procesoId: d.procesoId,
    nombre: d.nombre,
    descripcion: d.descripcion ?? null,
    fuente: d.fuente ?? null,
    unidad: d.unidad ?? null,
    periodicidad: d.periodicidad,
    consolidacion: d.consolidacion,
    capturaMin: d.capturaMin ?? null,
    capturaMax: d.capturaMax ?? null,
    admiteNegativos: d.admiteNegativos,
    plazoReporteDias: d.plazoReporteDias,
    dimensionId: d.dimensionId ?? null,
  };
}

/** El nombre del proceso; el que el dato ya tenía vale aunque se haya desactivado, uno nuevo debe estar activo. */
async function procesoValido(tx: TransactionSql, procesoId: number, actual: number | null): Promise<string> {
  const [p] = await tx`SELECT nombre, activo FROM procesos WHERE id = ${procesoId} FOR KEY SHARE`;
  if (!p || (p.activo !== true && procesoId !== actual)) throw new ErrorIndicador("El proceso no existe o está inactivo");
  return p.nombre as string;
}

/**
 * Crea (sin `id`) o edita (con `id`) un dato del catálogo. Una dimensión nueva o cambiada debe estar activa; la que ya
 * tenía sigue valiendo. Si una versión aprobada lo cita, la periodicidad, el «cómo se junta» y la dimensión no cambian.
 */
export async function guardarDato(
  sesion: SesionFlujo,
  d: z.infer<typeof EsquemaDato> & { id?: number },
  opciones?: Opciones,
): Promise<{ id: number }> {
  exigirAdministrar(sesion);
  const { id: idDado, ...resto } = d;
  const datos = validar(resto);
  const ahora = opciones?.ahora ?? new Date();

  return enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    const antes = idDado === undefined ? null : await datoBloqueado(tx, idDado);
    const proceso = await procesoValido(tx, datos.procesoId, antes?.procesoId ?? null);
    if (datos.dimensionId !== null && datos.dimensionId !== (antes?.dimensionId ?? null)) {
      const [dim] = await tx`SELECT activo FROM dimensiones WHERE id = ${datos.dimensionId} FOR KEY SHARE`;
      if (!dim || dim.activo !== true) throw new ErrorIndicador(DIMENSION_INACTIVA);
    }
    if (antes) {
      const congelado =
        datos.periodicidad !== antes.periodicidad || datos.consolidacion !== antes.consolidacion || datos.dimensionId !== antes.dimensionId;
      if (congelado) {
        const [c] = await tx`SELECT ${citadoPor(tx, antes.id)} AS citado`;
        if (c.citado === true) throw new ErrorIndicador(YA_LO_CITA);
      }
    }
    const [otro] = await tx`SELECT 1 FROM variables_compartidas
      WHERE proceso_id = ${datos.procesoId} AND lower(nombre) = lower(${datos.nombre}) AND id <> ${antes?.id ?? 0} LIMIT 1`;
    if (otro) throw new ErrorIndicador(NOMBRE_REPETIDO);

    let id: number;
    if (antes === null) {
      const [fila] = await tx`INSERT INTO variables_compartidas
          (proceso_id, nombre, descripcion, fuente, unidad, periodicidad, consolidacion, captura_min, captura_max, admite_negativos,
           plazo_reporte_dias, dimension_id, creado_por, creado_en)
        VALUES (${datos.procesoId}, ${datos.nombre}, ${datos.descripcion}, ${datos.fuente}, ${datos.unidad}, ${datos.periodicidad},
          ${datos.consolidacion}, ${datos.capturaMin}, ${datos.capturaMax}, ${datos.admiteNegativos}, ${datos.plazoReporteDias},
          ${datos.dimensionId}, ${sesion.usuarioId}, ${ahora})
        RETURNING id`;
      id = Number(fila.id);
    } else {
      id = antes.id;
      await tx`UPDATE variables_compartidas SET proceso_id = ${datos.procesoId}, nombre = ${datos.nombre},
          descripcion = ${datos.descripcion}, fuente = ${datos.fuente}, unidad = ${datos.unidad}, periodicidad = ${datos.periodicidad},
          consolidacion = ${datos.consolidacion}, captura_min = ${datos.capturaMin}, captura_max = ${datos.capturaMax},
          admite_negativos = ${datos.admiteNegativos}, plazo_reporte_dias = ${datos.plazoReporteDias}, dimension_id = ${datos.dimensionId}
        WHERE id = ${id}`;
    }
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "dato_compartido_guardado",
      entidad: "dato_compartido",
      entidadId: id,
      detalle: { nombre: datos.nombre, proceso, creado: antes === null, antes: antes ? camposDe(antes) : null, despues: datos },
    });
    return { id };
  }).catch((err: unknown) => {
    // Dos que crean a la vez el mismo nombre: la segunda choca con el índice único.
    if (esNombreRepetido(err)) throw new ErrorIndicador(NOMBRE_REPETIDO);
    throw err;
  });
}

/**
 * Reemplaza la lista de responsables (anexo 14C, §4.1), como `designar` en un indicador: solo se designa a usuarios
 * activos, y quien ya estaba y se queda conserva su fila (con quién y cuándo lo designó) aunque se haya desactivado.
 */
export async function designarResponsablesDeDato(
  sesion: SesionFlujo,
  d: { datoId: number; usuarioIds: number[] },
  opciones?: Opciones,
): Promise<void> {
  exigirAdministrar(sesion);
  // El tope cuenta antes de quitar los repetidos, como `EsquemaResponsablesDeDato`.
  if (d.usuarioIds.length > MAXIMO_RESPONSABLES) throw new ErrorIndicador(`Elija hasta ${MAXIMO_RESPONSABLES} personas`);
  const ids = [...new Set(d.usuarioIds)];
  if (!ids.every((x) => Number.isInteger(x) && x > 0)) throw new ErrorIndicador("Las personas elegidas no son válidas");
  const ahora = opciones?.ahora ?? new Date();
  await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    const dato = await datoBloqueado(tx, d.datoId);
    const actuales = (await tx`SELECT usuario_id FROM variable_responsables WHERE variable_id = ${dato.id}`).map((f) => Number(f.usuario_id));
    const entran = ids.filter((x) => !actuales.includes(x));
    const salen = actuales.filter((x) => !ids.includes(x));
    if (entran.length > 0) {
      const activos = await tx`SELECT id FROM usuarios WHERE id IN ${tx(entran)} AND activo FOR KEY SHARE`;
      if (activos.length !== entran.length) throw new ErrorIndicador("Solo se puede designar a usuarios activos");
    }
    if (entran.length === 0 && salen.length === 0) return;

    if (salen.length > 0) await tx`DELETE FROM variable_responsables WHERE variable_id = ${dato.id} AND usuario_id IN ${tx(salen)}`;
    for (const usuarioId of entran) {
      await tx`INSERT INTO variable_responsables (variable_id, usuario_id, designado_por, designado_en)
        VALUES (${dato.id}, ${usuarioId}, ${sesion.usuarioId}, ${ahora})`;
    }
    const nombres = async (lista: number[]) =>
      lista.length === 0 ? [] : (await tx`SELECT nombre FROM usuarios WHERE id IN ${tx(lista)} ORDER BY id`).map((u) => u.nombre as string);
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "dato_compartido_responsables",
      entidad: "dato_compartido",
      entidadId: dato.id,
      detalle: {
        nombre: dato.nombre,
        antes: ascendente(actuales),
        despues: ascendente(ids),
        nombresAntes: await nombres(ascendente(actuales)),
        nombresDespues: await nombres(ascendente(ids)),
      },
    });
  });
}

/**
 * Un indicador activo usa el dato (anexo 14C, §4.1): lo cita su ficha vigente, o lo cita la versión que rige alguna de sus
 * mediciones ordinarias sin cerrar (un histórico se digita completo y no lo usa, anexo 14C §3.6). Solo lee: no bloquea
 * indicadores ni mediciones, que pueden ser varios.
 */
async function enUso(tx: TransactionSql, datoId: number): Promise<boolean> {
  const citas = await tx`SELECT DISTINCT fv.indicador_id, fv.id AS version_id
    FROM indicador_variables iv
    JOIN indicador_versiones fv ON fv.id = iv.version_id AND fv.estado = 'aprobada'
    JOIN indicadores i ON i.id = fv.indicador_id AND i.estado = 'activo'
    WHERE iv.variable_compartida_id = ${datoId}`;
  const porIndicador = new Map<number, Set<number>>();
  for (const c of citas) {
    const indicadorId = Number(c.indicador_id);
    porIndicador.set(indicadorId, (porIndicador.get(indicadorId) ?? new Set()).add(Number(c.version_id)));
  }
  const zona = zonaHoraria();
  for (const [indicadorId, queLoCitan] of porIndicador) {
    // De mayor a menor número: la primera es la vigente.
    const versiones = await versionesAprobadas(tx, indicadorId);
    if (versiones[0] && queLoCitan.has(versiones[0].id)) return true;
    const abiertas = await tx`SELECT desde FROM mediciones
      WHERE indicador_id = ${indicadorId} AND estado <> 'cerrada' AND NOT historica`;
    for (const m of abiertas) {
      const rige = versionQueRigeEntre(versiones, { desde: new Date(m.desde as string) }, zona);
      if (rige && queLoCitan.has(rige.id)) return true;
    }
  }
  return false;
}

/** Activa o desactiva el dato; desactivarlo exige que ningún indicador activo lo use. El mismo estado no escribe nada. */
export async function cambiarEstadoDeDato(
  sesion: SesionFlujo,
  d: { datoId: number; activa: boolean },
  opciones?: Opciones,
): Promise<void> {
  exigirAdministrar(sesion);
  await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    const dato = await datoBloqueado(tx, d.datoId);
    if (dato.activa === d.activa) return;
    if (!d.activa && (await enUso(tx, dato.id))) throw new ErrorIndicador(EN_USO);
    await tx`UPDATE variables_compartidas SET activa = ${d.activa} WHERE id = ${dato.id}`;
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: d.activa ? "dato_compartido_activado" : "dato_compartido_desactivado",
      entidad: "dato_compartido",
      entidadId: dato.id,
      detalle: { nombre: dato.nombre },
    });
  });
}

/**
 * Borra un dato sin historia, con sus responsables. Lo citado por cualquier versión (también un borrador: la llave foránea
 * no lo deja) o con algún periodo ya tiene historia: se desactiva.
 */
export async function borrarDato(sesion: SesionFlujo, datoId: number, opciones?: Opciones): Promise<void> {
  exigirAdministrar(sesion);
  await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    const dato = await datoBloqueado(tx, datoId);
    const [h] = await tx`SELECT
        EXISTS (SELECT 1 FROM indicador_variables WHERE variable_compartida_id = ${dato.id})
        OR EXISTS (SELECT 1 FROM variable_valores WHERE variable_id = ${dato.id}) AS historia`;
    if (h.historia === true) throw new ErrorIndicador(CON_HISTORIA);
    const [p] = await tx`SELECT nombre FROM procesos WHERE id = ${dato.procesoId}`;
    await tx`DELETE FROM variable_responsables WHERE variable_id = ${dato.id}`;
    await tx`DELETE FROM variables_compartidas WHERE id = ${dato.id}`;
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "dato_compartido_borrado",
      entidad: "dato_compartido",
      entidadId: dato.id,
      detalle: { nombre: dato.nombre, proceso: (p?.nombre as string | undefined) ?? null },
    });
  });
}
