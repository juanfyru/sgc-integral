/**
 * El camino de sistema (anexo 14B, §5.2 y §5.5): `tomarCalculo` contra la BD de desarrollo, dentro de una transacción que
 * se revierte. Los ocho documentales se comparan con lo que la consulta de Vigencia le da a un Administrador del SGC de
 * prueba; «Reportes a tiempo» y «Objetivos cumplidos» se cuentan en años sin datos de la demo (2093 y 2094), así que el
 * periodo solo tiene lo que siembra cada caso.
 */
import { existsSync } from "node:fs";
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { tomarCalculo, type PeticionDeCalculo } from "@/db/consultas/indicadores/calculos";
import { marcarNoAplica, quitarNoAplica, reportar } from "@/db/consultas/indicadores/mediciones";
import { indicadoresDocumentales } from "@/db/consultas/vigencia/indicadores";
import type { Indicador, ResultadoIndicadores } from "@/lib/indicadores-documentales/metas";
import { periodoDe } from "@/lib/indicadores-documentales/periodo";
import type { AlcanceDeCalculo, ClaveDeCalculo } from "@/lib/indicadores/calculos/registro";
import { fechaLimiteDeReporte } from "@/lib/indicadores/periodos";
import type { Semaforo } from "@/lib/indicadores/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { puntoDePrueba, verificarPunto } from "./utiles/distribucion";
import {
  indicadorDePrueba,
  liberarCalculo,
  versionAutomatica,
  versionTrimestral,
  type IndicadorDePrueba,
  type OpcionesIndicadorDePrueba,
} from "./utiles/indicadores";
import { documentoLibre, sesionAdmin, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();
const ZONA = zonaHoraria();
const ahora = new Date("2026-11-08T15:00:00Z");

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

let consecutivo = 0;
const unico = () => `${Date.now() % 100_000_000}${(consecutivo += 1)}`;

const procesoId = async (tx: TransactionSql, sigla: string) => Number((await tx`SELECT id FROM procesos WHERE sigla = ${sigla}`)[0].id);

/** La petición de un cálculo para el periodo `periodo`; sin ficha que la pida, salvo que se diga. */
function peticion(
  clave: ClaveDeCalculo,
  alcance: AlcanceDeCalculo,
  d: { procesoId: number; periodo: string; indicadorId?: number; ahora?: Date },
): PeticionDeCalculo {
  const p = periodoDe(d.periodo, ZONA)!;
  return { clave, alcance, procesoId: d.procesoId, indicadorId: d.indicadorId ?? 0, periodo: { clave: p.clave, desde: p.desde, hasta: p.hasta }, ahora: d.ahora ?? ahora };
}

/** Un interno vigente aprobado fuera el 10 de enero de 2025, con revisión cada año: vencido a `ahora`. */
async function vencidoEn(tx: TransactionSql, sigla: string, nivelAcceso: "general" | "restringido" = "general") {
  const d = await documentoLibre(tx, { proceso: sigla, tipo: "PR" });
  await tx`UPDATE documento_versiones SET fecha_aprobacion = '2025-01-10', origen_aprobacion = 'fuera', publicado_en = now() - interval '1 day'
    WHERE documento_id = ${d.id} AND estado = 'vigente'`;
  await tx`UPDATE documentos SET meses_revision = 12, nivel_acceso = ${nivelAcceso} WHERE id = ${d.id}`;
  return d;
}

/** La tarjeta de Vigencia que corresponde a cada documental, escrita aquí y no leída del registro. */
const TARJETA: Record<Exclude<ClaveDeCalculo, "conformidad_periodo" | "reportes_a_tiempo" | "objetivos_cumplidos">, Indicador> = {
  dentro_plazo: "dentro_plazo",
  vencidos: "vencidos",
  aprobacion: "aprobacion",
  acuses: "acuses",
  conformidad_fecha: "conformidad",
  externos: "externos",
  etapas: "etapas",
};
const DOCUMENTALES = [...(Object.keys(TARJETA) as (keyof typeof TARJETA)[]), "conformidad_periodo"] as const;
const SOLO_ENTIDAD: readonly ClaveDeCalculo[] = ["conformidad_fecha", "conformidad_periodo"];

/** Lo que la tarjeta de Vigencia dice de un documental: el numerador y el denominador (de un conteo, solo su valor). */
function deLaTarjeta(r: ResultadoIndicadores, clave: (typeof DOCUMENTALES)[number]): { A: string; B?: string } {
  if (clave === "conformidad_periodo") return { A: String(r.conformidadDelPeriodo.numerador), B: String(r.conformidadDelPeriodo.denominador) };
  const m = r.indicadores.find((i) => i.clave === TARJETA[clave])!;
  return clave === "vencidos" ? { A: String(m.valor) } : { A: String(m.numerador), B: String(m.denominador) };
}

describe("tomarCalculo: los ocho documentales", () => {
  it("cada uno da el numerador y el denominador que la Vigencia le da a un Administrador del SGC, con y sin proceso", () => revertida(sql, async (tx) => {
    const gth = await procesoId(tx, "GTH");
    await vencidoEn(tx, "GTH");
    const admin = await sesionAdmin(tx);
    const deAdmin = async (proceso?: number) => (await indicadoresDocumentales(admin, { periodo: "2026", procesoId: proceso }, { sql: tx, ahora }))!;
    const [todo, soloGth] = [await deAdmin(), await deAdmin(gth)];

    // Un solo memo para toda la pasada: el resultado de la entidad no se reutiliza para un proceso, ni al revés.
    const memo = new Map<string, ResultadoIndicadores>();
    const tomados: { A: string; B?: string }[] = [];
    for (const clave of DOCUMENTALES) {
      const entidad = await tomarCalculo(tx, peticion(clave, "entidad", { procesoId: gth, periodo: "2026" }), memo);
      expect(entidad, clave).toEqual(deLaTarjeta(todo, clave));
      tomados.push(entidad);
      if (SOLO_ENTIDAD.includes(clave)) continue;
      const delProceso = await tomarCalculo(tx, peticion(clave, "proceso", { procesoId: gth, periodo: "2026" }), memo);
      expect(delProceso, `${clave} en GTH`).toEqual(deLaTarjeta(soloGth, clave));
      tomados.push(delProceso);
    }
    expect([...memo.keys()].sort()).toEqual(["2026|", `2026|${gth}`].sort());
    expect(Number(deLaTarjeta(soloGth, "vencidos").A)).toBeGreaterThan(0);
    // En texto con punto decimal: lo que lee `fotoDe`.
    for (const t of tomados) for (const v of Object.values(t)) expect(v).toMatch(/^\d+(\.\d+)?$/);

    // Los de estado se miden a la hora de la petición, como la tarjeta: en 2090 todo lo que tiene fecha ya venció.
    const lejos = new Date("2090-01-15T15:00:00Z");
    const enLejos = (await indicadoresDocumentales(admin, { periodo: "2090" }, { sql: tx, ahora: lejos }))!;
    const vencidosLejos = await tomarCalculo(tx, peticion("vencidos", "entidad", { procesoId: gth, periodo: "2090", ahora: lejos }));
    expect(vencidosLejos).toEqual(deLaTarjeta(enLejos, "vencidos"));
    expect(Number(vencidosLejos.A)).toBeGreaterThan(Number(deLaTarjeta(todo, "vencidos").A));
  }));

  it("cuenta un documento restringido vencido que un líder de otro proceso no vería", () => revertida(sql, async (tx) => {
    const gth = await procesoId(tx, "GTH");
    const cex = await procesoId(tx, "CEX");
    const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [cex] });
    const tomar = (alcance: AlcanceDeCalculo) => tomarCalculo(tx, peticion("vencidos", alcance, { procesoId: gth, periodo: "2026" }));
    const [entidad, delProceso] = [await tomar("entidad"), await tomar("proceso")];

    const d = await vencidoEn(tx, "GTH", "restringido");
    expect(await tomar("entidad")).toEqual({ A: String(Number(entidad.A) + 1) });
    expect(await tomar("proceso")).toEqual({ A: String(Number(delProceso.A) + 1) });
    const delLider = (await indicadoresDocumentales(lider, { periodo: "2026" }, { sql: tx, ahora }))!;
    expect(delLider.vencidos.map((v) => v.documentoId)).not.toContain(d.id);
  }));

  it("la conformidad del periodo cuenta las verificaciones cerradas en él: una conforme de dos", () => revertida(sql, async (tx) => {
    const gth = await procesoId(tx, "GTH");
    const admin = await sesionAdmin(tx);
    const responsable = await usuarioDePrueba(tx, { rol: "lider_proceso" });
    for (const respuesta of ["conforme", "no_conforme"] as const) {
      const punto = await puntoDePrueba(tx, { responsable });
      await verificarPunto(tx, { verificador: admin, punto, ahora: new Date("2093-03-10T15:00:00Z"), respuesta });
    }
    const tomar = (periodo: string) =>
      tomarCalculo(tx, peticion("conformidad_periodo", "entidad", { procesoId: gth, periodo, ahora: new Date("2093-04-02T12:00:00Z") }));
    expect(await tomar("2093-03")).toEqual({ A: "1", B: "2" });
    // Fuera del periodo no hay ninguna: B en cero, que la foto lee como «no aplica».
    expect(await tomar("2093-02")).toEqual({ A: "0", B: "0" });
  }));

  it("un alcance que el cálculo no admite es un error, no una cifra", async () => {
    await expect(tomarCalculo(sql, peticion("conformidad_fecha", "proceso", { procesoId: 1, periodo: "2026" }))).rejects.toThrow(
      "El cálculo «conformidad_fecha» no admite el alcance «proceso»",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Reportes de indicadores a tiempo
// ─────────────────────────────────────────────────────────────────────────────

/** Antes y después de la fecha límite de febrero de 2094 (el 10 de marzo, con el plazo de 10 días por omisión). */
const A_TIEMPO = new Date("2094-03-05T15:00:00Z");
const TARDE = new Date("2094-03-15T15:00:00Z");
const MAS_TARDE = new Date("2094-03-20T15:00:00Z");

/** Una medición abierta del indicador en `periodo`, con la fecha límite del plazo por omisión. */
async function medicion(tx: TransactionSql, ind: IndicadorDePrueba, periodo: string, o: { historica?: boolean } = {}): Promise<number> {
  const p = periodoDe(periodo, ZONA)!;
  const [m] = await tx`INSERT INTO mediciones (indicador_id, version_id, periodo, desde, hasta, vence_en, historica)
    VALUES (${ind.id}, ${ind.versionId}, ${periodo}, ${p.desde}, ${p.hasta}, ${fechaLimiteDeReporte(p, 10, ZONA)}, ${o.historica ?? false})
    RETURNING id`;
  return Number(m.id);
}

async function preparar(tx: TransactionSql) {
  const elabora = await sesionAdmin(tx);
  const mide = await usuarioDePrueba(tx, { rol: "consulta" });
  const manual = (o: OpcionesIndicadorDePrueba = {}) =>
    indicadorDePrueba(tx, { periodicidad: "mensual", inicioMedicion: "2094-01", elaboradaPor: elabora.usuarioId, mide: [mide.usuarioId], ...o });
  const enviar = (medicionId: number, valores: Record<string, string>, cuando: Date) =>
    reportar(mide, { medicionId, valores, parcial: false, confirmado: true }, { sql: tx, ahora: cuando });
  return { elabora, mide, manual, enviar };
}

describe("tomarCalculo: reportes de indicadores a tiempo", () => {
  it("cuenta el primer reporte o «no aplica» contra la fecha límite, sin históricos ni automáticos; con proceso, solo los suyos", () => revertida(sql, async (tx) => {
    const gth = await procesoId(tx, "GTH");
    const cex = await procesoId(tx, "CEX");
    const { mide, manual, enviar } = await preparar(tx);

    const aTiempo = await medicion(tx, await manual(), "2094-02");
    await enviar(aTiempo, { A: "9", B: "10" }, A_TIEMPO);
    await enviar(await medicion(tx, await manual(), "2094-02"), { A: "9", B: "10" }, TARDE);
    // Nunca reportada, de un indicador restringido: cuenta, y tarde.
    await medicion(tx, await manual({ nivelAcceso: "restringido" }), "2094-02");
    const noAplica = await medicion(tx, await manual(), "2094-02");
    await marcarNoAplica(mide, { medicionId: noAplica, motivo: "Sin casos en el mes" }, { sql: tx, ahora: A_TIEMPO });
    await medicion(tx, await manual(), "2094-02", { historica: true });
    await medicion(tx, await indicadorDePrueba(tx, { periodicidad: "mensual", inicioMedicion: "2094-01", calculo: { clave: "aprobacion", alcance: "proceso" } }), "2094-02");
    await medicion(tx, await manual({ procesoId: cex }), "2094-02");

    const tomar = (alcance: AlcanceDeCalculo, proceso: number) => tomarCalculo(tx, peticion("reportes_a_tiempo", alcance, { procesoId: proceso, periodo: "2094-03" }));
    expect(await tomar("proceso", gth)).toEqual({ A: "2", B: "4" });
    expect(await tomar("proceso", cex)).toEqual({ A: "0", B: "1" });
    expect(await tomar("entidad", gth)).toEqual({ A: "2", B: "5" });
    // Ninguna vence en febrero.
    expect(await tomarCalculo(tx, peticion("reportes_a_tiempo", "entidad", { procesoId: gth, periodo: "2094-02" }))).toEqual({ A: "0", B: "0" });

    // Las correcciones posteriores no vuelven tardía la que se reportó a tiempo, aunque cambien la fecha de reporte.
    await enviar(aTiempo, { A: "7", B: "10" }, MAS_TARDE);
    await quitarNoAplica(mide, noAplica, { sql: tx, ahora: TARDE });
    await enviar(noAplica, { A: "1", B: "2" }, MAS_TARDE);
    const [{ reportada_en: reportadaEn }] = await tx`SELECT reportada_en FROM mediciones WHERE id = ${noAplica}`;
    expect((reportadaEn as Date).getTime()).toBe(MAS_TARDE.getTime());
    const [{ n }] = await tx`SELECT count(*)::int AS n FROM medicion_eventos WHERE medicion_id IN ${tx([aTiempo, noAplica])} AND tipo = 'correccion'`;
    expect(n).toBe(3);
    expect(await tomar("proceso", gth)).toEqual({ A: "2", B: "4" });
  }));

  it("manda la versión que rige el periodo: no cuenta las de otra periodicidad ni las que seguían sin reportar cuando se retiró el indicador antes de su fecha límite", () => revertida(sql, async (tx) => {
    const gth = await procesoId(tx, "GTH");
    const { elabora, manual, enviar } = await preparar(tx);
    const retirar = (ind: IndicadorDePrueba, cuando: string) =>
      tx`UPDATE indicadores SET estado = 'retirado', baja_por = ${elabora.usuarioId}, baja_en = ${new Date(cuando)}, baja_motivo = 'Ya no se mide'
        WHERE id = ${ind.id}`;

    // Retirado el 1 de marzo sin reportar febrero: no cuenta. Retirado el 12, ya vencido: cuenta, y tarde. Retirado el 7
    // después de reportar a tiempo: cuenta, a tiempo.
    const retiradoAntes = await manual();
    await medicion(tx, retiradoAntes, "2094-02");
    await retirar(retiradoAntes, "2094-03-01T15:00:00Z");
    const retiradoDespues = await manual();
    await medicion(tx, retiradoDespues, "2094-02");
    await retirar(retiradoDespues, "2094-03-12T15:00:00Z");
    const retiradoReportado = await manual();
    await enviar(await medicion(tx, retiradoReportado, "2094-02"), { A: "9", B: "10" }, A_TIEMPO);
    await retirar(retiradoReportado, "2094-03-07T15:00:00Z");
    // Febrero lo rige ya una versión trimestral: la medición mensual quedó de otra periodicidad.
    const trimestral = await manual();
    await medicion(tx, trimestral, "2094-02");
    await versionTrimestral(tx, { indicadorId: trimestral.id, usuarioId: elabora.usuarioId, rigeDesde: "2094-T1", aprobadaEn: A_TIEMPO });
    // Pasó a automático desde marzo: febrero lo sigue rigiendo la versión manual, y cuenta.
    const pasoAAutomatico = await manual();
    await enviar(await medicion(tx, pasoAAutomatico, "2094-02"), { A: "9", B: "10" }, A_TIEMPO);
    await versionAutomatica(tx, {
      indicadorId: pasoAAutomatico.id,
      usuarioId: elabora.usuarioId,
      rigeDesde: "2094-03",
      aprobadaEn: A_TIEMPO,
      periodicidad: "mensual",
      calculo: { clave: "etapas", alcance: "proceso" },
    });

    expect(await tomarCalculo(tx, peticion("reportes_a_tiempo", "proceso", { procesoId: gth, periodo: "2094-03" }))).toEqual({ A: "2", B: "3" });
  }));
});

// ─────────────────────────────────────────────────────────────────────────────
// Objetivos cumplidos
// ─────────────────────────────────────────────────────────────────────────────

async function objetivo(tx: TransactionSql, clase: "calidad" | "institucional", activo = true): Promise<number> {
  const [o] = await tx`INSERT INTO objetivos (clase, enunciado, orden, activo) VALUES (${clase}, ${`Objetivo de prueba ${unico()}`}, 900, ${activo}) RETURNING id`;
  return Number(o.id);
}

/**
 * Un indicador activo mensual cuya ficha vigente apunta al objetivo. `indicadorDePrueba` no lo elige y una versión
 * aprobada ya no cambia: nace en borrador, se le pone el objetivo y se aprueba aquí, como lo hace el ayudante al final.
 */
async function conObjetivo(tx: TransactionSql, objetivoId: number, elaboradaPor: number): Promise<IndicadorDePrueba> {
  const ind = await indicadorDePrueba(tx, { periodicidad: "mensual", inicioMedicion: "2094-01", elaboradaPor, estado: "borrador" });
  await tx`UPDATE indicador_versiones SET objetivo_id = ${objetivoId}, objetivo_nombre = (SELECT enunciado FROM objetivos WHERE id = ${objetivoId}),
      estado = 'aprobada', elaborada_por = ${elaboradaPor}, elaborada_en = ${A_TIEMPO}, huella = ${"0".repeat(64)}, rige_desde = '2094-01',
      aprobada_por = ${elaboradaPor}, aprobada_en = ${A_TIEMPO}
    WHERE id = ${ind.versionId}`;
  await tx`UPDATE indicadores SET estado = 'activo' WHERE id = ${ind.id}`;
  return ind;
}

/** Una medición reportada del indicador en `periodo`, con su resultado, su semáforo y si alcanzó la meta. */
async function medida(
  tx: TransactionSql,
  ind: IndicadorDePrueba,
  periodo: string,
  r: { semaforo: Semaforo; cumple: boolean | null; noAplica?: boolean },
): Promise<void> {
  const p = periodoDe(periodo, ZONA)!;
  await tx`INSERT INTO mediciones (indicador_id, version_id, periodo, desde, hasta, vence_en, estado, no_aplica, resultado_exacto, resultado,
      semaforo, cumple, meta_aplicada, reportada_en)
    VALUES (${ind.id}, ${ind.versionId}, ${periodo}, ${p.desde}, ${p.hasta}, ${fechaLimiteDeReporte(p, 10, ZONA)}, 'reportada', ${r.noAplica ?? false},
      ${r.noAplica ? null : "95/1"}, ${r.noAplica ? null : 95}, ${r.noAplica ? null : r.semaforo}, ${r.noAplica ? null : r.cumple}, 90, ${A_TIEMPO})`;
}

const BIEN = { semaforo: "bien", cumple: true } as const;
const NO_CUMPLE = { semaforo: "critico", cumple: false } as const;

describe("tomarCalculo: objetivos cumplidos", () => {
  it("un objetivo se cumple si las últimas mediciones del periodo de sus indicadores alcanzan todas la meta; cuenta los de la clase del alcance", () => revertida(sql, async (tx) => {
    const gth = await procesoId(tx, "GTH");
    const elabora = await sesionAdmin(tx);
    const de = (o: number) => conObjetivo(tx, o, elabora.usuarioId);

    // Cumplido: dos indicadores que cumplen; del segundo manda marzo, la última del trimestre, no febrero.
    const cumplido = await objetivo(tx, "calidad");
    await medida(tx, await de(cumplido), "2094-03", BIEN);
    const segundo = await de(cumplido);
    await medida(tx, segundo, "2094-02", NO_CUMPLE);
    await medida(tx, segundo, "2094-03", BIEN);
    // Una ficha que también calcula «Objetivos cumplidos» no entra, aunque apunte al objetivo.
    const otroCalculo = await de(cumplido);
    await medida(tx, otroCalculo, "2094-03", NO_CUMPLE);
    await liberarCalculo(tx, "objetivos_cumplidos", "todos");
    await tx`UPDATE indicadores SET calculo = 'objetivos_cumplidos', calculo_alcance = 'todos' WHERE id = ${otroCalculo.id}`;
    // Tampoco uno retirado, ni uno cuya ficha vigente (una versión 2 sin objetivo) ya no apunta a él.
    const retirado = await de(cumplido);
    await medida(tx, retirado, "2094-03", NO_CUMPLE);
    await tx`UPDATE indicadores SET estado = 'retirado', baja_por = ${elabora.usuarioId}, baja_en = ${A_TIEMPO}, baja_motivo = 'Ya no se mide'
      WHERE id = ${retirado.id}`;
    const cambioDeFicha = await de(cumplido);
    await medida(tx, cambioDeFicha, "2094-03", NO_CUMPLE);
    await versionTrimestral(tx, { indicadorId: cambioDeFicha.id, usuarioId: elabora.usuarioId, rigeDesde: "2094-T2", aprobadaEn: A_TIEMPO });

    // No cumplido: «Bien» que no alcanza la meta (rangos escritos, spec 14A §3).
    await medida(tx, await de(await objetivo(tx, "calidad")), "2094-03", { semaforo: "bien", cumple: false });

    // Sin medición en el periodo: la suya es de diciembre y la de marzo es «no aplica». El indicador que pide el cálculo
    // también apunta a él, y no entra en su propia cuenta.
    const sinMedicion = await objetivo(tx, "calidad");
    const anterior = await de(sinMedicion);
    await medida(tx, anterior, "2093-12", BIEN);
    await medida(tx, anterior, "2094-03", { ...NO_CUMPLE, noAplica: true });
    const pide = await de(sinMedicion);
    await medida(tx, pide, "2094-03", NO_CUMPLE);

    // De la otra clase, y uno inactivo: con «calidad» no cuentan.
    await medida(tx, await de(await objetivo(tx, "institucional")), "2094-03", NO_CUMPLE);
    await medida(tx, await de(await objetivo(tx, "calidad", false)), "2094-03", NO_CUMPLE);

    const tomar = (alcance: AlcanceDeCalculo) =>
      tomarCalculo(tx, peticion("objetivos_cumplidos", alcance, { procesoId: gth, indicadorId: pide.id, periodo: "2094-T1" }));
    expect(await tomar("calidad")).toEqual({ A: "1", B: "2" });
    expect(await tomar("institucional")).toEqual({ A: "0", B: "1" });
    expect(await tomar("todos")).toEqual({ A: "1", B: "3" });
    // Pedido por otra ficha, el que pedía antes sí cuenta: el objetivo sin medición pasa a no cumplido.
    expect(await tomarCalculo(tx, peticion("objetivos_cumplidos", "calidad", { procesoId: gth, indicadorId: 0, periodo: "2094-T1" }))).toEqual({ A: "1", B: "3" });
  }));

  it("una medición anterior a la 0012 (sin `cumple`) se lee como siempre: «Bien» cumple y «Atención» no", () => revertida(sql, async (tx) => {
    const gth = await procesoId(tx, "GTH");
    const elabora = await sesionAdmin(tx);
    await medida(tx, await conObjetivo(tx, await objetivo(tx, "calidad"), elabora.usuarioId), "2094-03", { semaforo: "bien", cumple: null });
    await medida(tx, await conObjetivo(tx, await objetivo(tx, "calidad"), elabora.usuarioId), "2094-03", { semaforo: "atencion", cumple: null });
    expect(await tomarCalculo(tx, peticion("objetivos_cumplidos", "calidad", { procesoId: gth, periodo: "2094-T1" }))).toEqual({ A: "1", B: "2" });
  }));
});
