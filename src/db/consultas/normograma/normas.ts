/**
 * El catálogo de normas (spec 13C §10.1, §10.2 y §10.7). Lo administra quien tiene `normograma.administrar`; lo lee
 * toda sesión. Cada cambio de estado queda en `norma_cambios` (solo inserción) en la misma transacción que el cambio
 * y que sus impactos documentales. Nada se borra salvo una norma sin historia: las demás se retiran. Las lecturas (la
 * ficha y las listas) viven en `lectura.ts` y se reexportan desde aquí.
 */
import type { TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import { enTransaccion, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import {
  acotado,
  ErrorNormograma,
  ESTADOS_A_MANO,
  ESTADOS_CON_IMPACTO,
  fechaValida,
  nombreDeNorma,
  opcionalAcotado,
  type EstadoNorma,
} from "@/lib/normograma/tipos";
import { ErrorPermiso, puede } from "@/lib/permisos";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { nombreSql } from "./busqueda";
import { crearImpactos } from "./impactos";

export {
  aniosYEmisores,
  existeNorma,
  filasDeNormas,
  filasDelExcel,
  listarNormas,
  normasParaElegir,
  normaParaSubir,
  obtenerNorma,
  sugerirEmisores,
  type FilaNorma,
  type FilaNormaDeLista,
  type FilaNormaExcel,
  type FiltroNormas,
  type Norma,
} from "./lectura";

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

/** «Cambiar estado» a mano, con fecha y nota (spec 13C §10.2). No retira: eso es `retirarNorma`, con su motivo. */
export async function cambiarEstadoNorma(
  sesion: SesionFlujo,
  d: { normaId: number; estado: EstadoNorma; fecha: string; nota: string | null },
  opciones?: Opciones,
): Promise<{ cambioId: number | null; impactos: number }> {
  exigirAdministrar(sesion);
  if (d.estado === "retirada") throw new ErrorNormograma("Para retirar una norma use «Retirar», que pide el motivo");
  if (!(ESTADOS_A_MANO as readonly string[]).includes(d.estado)) throw new ErrorNormograma("Elija el estado de la norma");
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
