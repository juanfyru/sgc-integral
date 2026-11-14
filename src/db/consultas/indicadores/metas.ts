/**
 * Las metas por periodo de un indicador (spec 14 §8.9 y F14-DC41, Tarea 10 de la 14A). Las programa el Admin SGC, sin
 * clave y con antes y después en la bitácora: antes de que el periodo termine, libremente; después y antes del cierre,
 * con justificación y la marca «Meta ajustada después del periodo»; cerrado, solo reabriendo. Un histórico no pide
 * justificación ni deja marca. En rangos fijos el límite es el de la ficha y una meta que lo deja del lado equivocado
 * necesita una versión nueva. La medición del periodo, si existe, se recalcula (`recalcularMedicion`, evento `meta`).
 *
 * Candados: el indicador `FOR UPDATE` (primero, como en el resto del módulo), la medición del periodo `FOR UPDATE` y
 * después la meta (`indicador_metas`). El indicador va `FOR UPDATE` porque un periodo sin medición no tiene otra fila que
 * bloquear: así dos programaciones simultáneas no leen la misma meta anterior y la bitácora no lleva un «antes» viejo.
 */
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { enTransaccion, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { periodoDe } from "@/lib/indicadores-documentales/periodo";
import { comparar, fraccion, type Fraccion } from "@/lib/indicadores/formula/fraccion";
import { periodicidadDe, versionQueRigeEntre } from "@/lib/indicadores/periodos";
import { decimalCorto, reglaDeTexto } from "@/lib/indicadores/reporte";
import { errorDeRegla } from "@/lib/indicadores/semaforo";
import { textoMeta } from "@/lib/indicadores/textos";
import { ErrorIndicador } from "@/lib/indicadores/tipos";
import { ErrorPermiso, puede } from "@/lib/permisos";
import { zonaHoraria } from "@/lib/zona-horaria";
import {
  asegurarMediciones,
  conMayuscula,
  primeraAprobada,
  recalcularMedicion,
  reglaDelPeriodo,
  versionesAprobadas,
  type VersionDeCalculo,
} from "./mediciones";
import { periodosDelAnio } from "./lectura";

type Opciones = { sql?: Cliente; ahora?: Date };

const NO_SE_MIDE = "Ese periodo no se mide en este indicador";
const TARDIA = "Ese periodo ya terminó: escriba la justificación del cambio de meta";
const CERRADA = "La medición de ese periodo está cerrada: reábrala para cambiar su meta";
const SIN_META_EN_EL_PERIODO = "Este indicador no tiene meta en ese periodo: no se le programan metas";
const SIN_PROGRAMADA = "Ese periodo no tiene una meta programada";
const LADO_EQUIVOCADO = "Con esa meta el límite de crítico queda del lado equivocado: hace falta una versión nueva de la ficha";
const RELATIVO_NO_SIRVE = "Con esa meta el semáforo relativo no se puede calcular: hace falta una versión nueva de la ficha con rangos fijos";

/** «90», «96.5»: una meta como se guarda y se compara; `null` si no hay. */
const normal = (v: string | null): string | null => (v === null ? null : decimalCorto(fraccion(v)!));

function numeroDe(valor: string, mensaje: string): Fraccion {
  const f = typeof valor === "string" ? fraccion(valor.trim()) : null;
  if (!f) throw new ErrorIndicador(mensaje);
  return f;
}

/** De 10 a 500 caracteres cuando se exige; si no, opcional y hasta 500. */
function justificacionDe(valor: string | undefined, exigida: boolean): string | null {
  const t = typeof valor === "string" ? valor.trim() : "";
  if (t.length > 500) throw new ErrorIndicador("La justificación no puede pasar de 500 caracteres");
  if (exigida && t.length < 10) throw new ErrorIndicador(TARDIA);
  return t === "" ? null : t;
}

/** El mensaje de una meta que deja la regla de la ficha sin sentido (`errorDeRegla`). */
function errorDeMeta(version: VersionDeCalculo, error: string): string {
  if (version.regla.modo === "rangos" || version.regla.tendencia === "constante") return error;
  if (version.regla.modo === null) return "La ficha no define el semáforo: hace falta una versión nueva de la ficha";
  return version.regla.modo === "fijo" ? LADO_EQUIVOCADO : RELATIVO_NO_SIRVE;
}

type Meta = { meta: string | null; metaMax: string | null };
const mismaMeta = (a: Meta, b: Meta) => {
  const igual = (x: string | null, y: string | null) => (x === null || y === null ? x === y : comparar(fraccion(x)!, fraccion(y)!) === 0);
  return igual(a.meta, b.meta) && igual(a.metaMax, b.metaMax);
};

/**
 * Programa la meta de un periodo del indicador (spec §8.9): un periodo válido de la periodicidad de la versión que lo rige,
 * desde el inicio de medición. Antes abre los periodos terminados (F14-DC12): un periodo que terminó y aún no tenía su
 * medición también pide la justificación. La misma meta otra vez no deja nada.
 */
export async function programarMeta(
  sesion: SesionFlujo,
  d: { indicadorId: number; periodo: string; meta: string; metaMax?: string; justificacion?: string },
  opciones?: Opciones,
): Promise<void> {
  if (!puede(sesion, "indicadores.administrar")) throw new ErrorPermiso();
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const zona = zonaHoraria();
  const meta = numeroDe(d.meta, "La meta debe ser un número");
  const metaMax = d.metaMax === undefined || d.metaMax.trim() === "" ? null : numeroDe(d.metaMax, "El máximo del rango debe ser un número");
  const periodo = typeof d.periodo === "string" && periodicidadDe(d.periodo) !== null ? periodoDe(d.periodo, zona) : null;
  if (!periodo) throw new ErrorIndicador(NO_SE_MIDE);
  await asegurarMediciones({ sql, ahora, indicadorId: d.indicadorId });

  await enTransaccion(sql, async (tx) => {
    const [i] = await tx`SELECT id, codigo, estado, inicio_medicion FROM indicadores WHERE id = ${d.indicadorId} FOR UPDATE`;
    if (!i) throw new ErrorIndicador("El indicador no existe");
    if (i.estado !== "activo") {
      throw new ErrorIndicador(i.estado === "retirado" ? "El indicador está retirado: ya no admite cambios de meta" : "El indicador no tiene una ficha aprobada");
    }
    const versiones = await versionesAprobadas(tx, Number(i.id));
    const anio = Number(periodo.clave.slice(0, 4));
    if (!i.inicio_medicion || !periodosDelAnio(versiones, i.inicio_medicion as string, anio, zona).some((p) => p.clave === periodo.clave)) {
      throw new ErrorIndicador(NO_SE_MIDE);
    }
    const version = versionQueRigeEntre(versiones, periodo, zona)!;
    const [m] = await tx`SELECT id, estado, historica FROM mediciones WHERE indicador_id = ${i.id} AND periodo = ${periodo.clave} FOR UPDATE`;
    if (m?.estado === "cerrada") throw new ErrorIndicador(CERRADA);
    if (version.regla.meta === null) throw new ErrorIndicador(SIN_META_EN_EL_PERIODO);
    const tardia = m !== undefined && m.historica !== true && periodo.hasta.getTime() < ahora.getTime();
    const justificacion = justificacionDe(d.justificacion, tardia);
    if (metaMax !== null && version.regla.tendencia !== "constante") {
      throw new ErrorIndicador("El máximo del rango solo aplica a un indicador de tendencia constante");
    }
    const despues: Meta = { meta: decimalCorto(meta), metaMax: metaMax ? decimalCorto(metaMax) : null };
    const error = errorDeRegla(reglaDeTexto({ ...version.regla, ...despues }));
    if (error) throw new ErrorIndicador(errorDeMeta(version, error));
    const anterior = await reglaDelPeriodo(tx, Number(i.id), periodo.clave, version);
    const antes: Meta = { meta: normal(anterior.meta), metaMax: normal(anterior.metaMax) };
    if (mismaMeta(antes, despues)) return;

    await tx`INSERT INTO indicador_metas (indicador_id, periodo, meta, meta_max, justificacion, tardia, programada_por, programada_en)
      VALUES (${i.id}, ${periodo.clave}, ${despues.meta}, ${despues.metaMax}, ${justificacion}, ${tardia}, ${sesion.usuarioId}, ${ahora})
      ON CONFLICT (indicador_id, periodo) DO UPDATE SET meta = EXCLUDED.meta, meta_max = EXCLUDED.meta_max,
        justificacion = EXCLUDED.justificacion, tardia = EXCLUDED.tardia, programada_por = EXCLUDED.programada_por,
        programada_en = EXCLUDED.programada_en`;
    if (m) {
      if (tardia) await tx`UPDATE mediciones SET meta_tardia = true WHERE id = ${m.id} AND NOT meta_tardia`;
      await recalcularMedicion(tx, Number(m.id), {
        ahora,
        actorId: sesion.usuarioId,
        evento: "meta",
        detalle: { antes, despues, ...(justificacion ? { justificacion } : {}) },
      });
    }
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "indicador_meta_programada",
      entidad: "indicador",
      entidadId: Number(i.id),
      detalle: { codigo: i.codigo, periodo: periodo.clave, antes, despues, tardia, ...(justificacion ? { justificacion } : {}) },
    });
  });
}

/**
 * Quita la meta programada de un periodo: el periodo vuelve a la meta de la ficha que lo rige (spec 14A §3.4). Mismas reglas
 * que `programarMeta` (permiso, candado del indicador, periodo cerrado, justificación y marca de un cambio tardío), salvo
 * que no valida la meta: volver a la de la ficha siempre es válido. La medición, si existe, se recalcula (evento `meta`).
 */
export async function quitarMetaProgramada(
  sesion: SesionFlujo,
  d: { indicadorId: number; periodo: string; justificacion?: string },
  opciones?: Opciones,
): Promise<void> {
  if (!puede(sesion, "indicadores.administrar")) throw new ErrorPermiso();
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const zona = zonaHoraria();
  const periodo = typeof d.periodo === "string" && periodicidadDe(d.periodo) !== null ? periodoDe(d.periodo, zona) : null;
  if (!periodo) throw new ErrorIndicador(NO_SE_MIDE);
  await asegurarMediciones({ sql, ahora, indicadorId: d.indicadorId });

  await enTransaccion(sql, async (tx) => {
    const [i] = await tx`SELECT id, codigo, estado, inicio_medicion FROM indicadores WHERE id = ${d.indicadorId} FOR UPDATE`;
    if (!i) throw new ErrorIndicador("El indicador no existe");
    if (i.estado !== "activo") {
      throw new ErrorIndicador(i.estado === "retirado" ? "El indicador está retirado: ya no admite cambios de meta" : "El indicador no tiene una ficha aprobada");
    }
    const versiones = await versionesAprobadas(tx, Number(i.id));
    const anio = Number(periodo.clave.slice(0, 4));
    if (!i.inicio_medicion || !periodosDelAnio(versiones, i.inicio_medicion as string, anio, zona).some((p) => p.clave === periodo.clave)) {
      throw new ErrorIndicador(NO_SE_MIDE);
    }
    const version = versionQueRigeEntre(versiones, periodo, zona)!;
    const [m] = await tx`SELECT id, estado, historica FROM mediciones WHERE indicador_id = ${i.id} AND periodo = ${periodo.clave} FOR UPDATE`;
    if (m?.estado === "cerrada") throw new ErrorIndicador(CERRADA);
    const [programada] = await tx`SELECT meta, meta_max FROM indicador_metas WHERE indicador_id = ${i.id} AND periodo = ${periodo.clave} FOR UPDATE`;
    if (!programada) throw new ErrorIndicador(SIN_PROGRAMADA);
    const tardia = m !== undefined && m.historica !== true && periodo.hasta.getTime() < ahora.getTime();
    const justificacion = justificacionDe(d.justificacion, tardia);
    const antes: Meta = { meta: normal(programada.meta === null ? null : String(programada.meta)), metaMax: normal(programada.meta_max === null ? null : String(programada.meta_max)) };
    const despues: Meta = { meta: normal(version.regla.meta), metaMax: normal(version.regla.metaMax) };

    await tx`DELETE FROM indicador_metas WHERE indicador_id = ${i.id} AND periodo = ${periodo.clave}`;
    if (m) {
      if (tardia) await tx`UPDATE mediciones SET meta_tardia = true WHERE id = ${m.id} AND NOT meta_tardia`;
      await recalcularMedicion(tx, Number(m.id), {
        ahora,
        actorId: sesion.usuarioId,
        evento: "meta",
        detalle: { antes, despues, ...(justificacion ? { justificacion } : {}) },
      });
    }
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "indicador_meta_quitada",
      entidad: "indicador",
      entidadId: Number(i.id),
      detalle: { codigo: i.codigo, periodo: periodo.clave, antes, ...(justificacion ? { justificacion } : {}) },
    });
  });
}

/** Un periodo de «Programar metas» (spec §8.9): la meta que hereda de la ficha, la programada y sus marcas. */
export type MetaDelPeriodo = {
  periodo: string;
  /** «Primer trimestre de 2026». */
  etiqueta: string;
  /** La meta de la ficha que rige el periodo («90», con punto decimal); `null` si la ficha no tiene. */
  heredada: string | null;
  heredadaMax: string | null;
  /** «≥ 90 %», «sin meta». */
  textoHeredada: string;
  programada: string | null;
  programadaMax: string | null;
  /** Se programó después de terminado el periodo. */
  tardia: boolean;
  cerrada: boolean;
  terminado: boolean;
  historica: boolean;
  /** Cambiarla pide justificación: terminó, no es histórico y no está cerrado. */
  pideJustificacion: boolean;
  /** Tendencia constante: la meta es un rango. */
  constante: boolean;
  sufijo: string;
};

/**
 * Los periodos de `anio` que se miden, con su meta heredada y la programada (spec §8.9). Sin sesión: la página la pide
 * solo para quien administra. Vacía si el indicador no tiene ficha aprobada o no se mide ese año.
 */
export async function metasDelAnio(indicadorId: number, anio: number, opciones?: Opciones): Promise<MetaDelPeriodo[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  if (!Number.isInteger(anio) || anio < 1900 || anio > 9999) return [];
  const [i] = await sql`SELECT inicio_medicion FROM indicadores WHERE id = ${indicadorId}`;
  if (!i?.inicio_medicion) return [];
  const zona = zonaHoraria();
  const versiones = await versionesAprobadas(sql, indicadorId);
  const periodos = periodosDelAnio(versiones, i.inicio_medicion as string, anio, zona);
  if (periodos.length === 0) return [];
  const claves = periodos.map((p) => p.clave);
  const mediciones = await sql`SELECT periodo, estado, historica FROM mediciones WHERE indicador_id = ${indicadorId} AND periodo IN ${sql(claves)}`;
  const metas = await sql`SELECT periodo, meta, meta_max, tardia FROM indicador_metas WHERE indicador_id = ${indicadorId} AND periodo IN ${sql(claves)}`;
  const aprobada = primeraAprobada(versiones)?.aprobadaEn ?? null;
  return periodos.map((p) => {
    const version = versionQueRigeEntre(versiones, p, zona)!;
    const m = mediciones.find((x) => x.periodo === p.clave);
    const programada = metas.find((x) => x.periodo === p.clave);
    const terminado = p.hasta.getTime() < ahora.getTime();
    // Sin medición todavía, es histórico lo que terminó antes de aprobarse la primera versión (spec §8.8).
    const historica = m ? m.historica === true : aprobada !== null && p.hasta.getTime() < aprobada.getTime();
    const cerrada = m?.estado === "cerrada";
    const texto = (v: unknown) => (v === null || v === undefined ? null : normal(String(v)));
    return {
      periodo: p.clave,
      etiqueta: conMayuscula(p.etiqueta),
      heredada: normal(version.regla.meta),
      heredadaMax: normal(version.regla.metaMax),
      textoHeredada: textoMeta(reglaDeTexto(version.regla), version.unidad),
      programada: programada ? texto(programada.meta) : null,
      programadaMax: programada ? texto(programada.meta_max) : null,
      tardia: programada?.tardia === true,
      cerrada,
      terminado,
      historica,
      pideJustificacion: terminado && !historica && !cerrada,
      constante: version.regla.tendencia === "constante",
      sufijo: version.unidad.sufijo,
    };
  });
}
