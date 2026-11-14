/**
 * La página «Objetivos» (anexo 14B, §7): `objetivosDelPeriodo` contra la BD de desarrollo, dentro de una transacción que
 * se revierte. Los casos se cuentan en 2094, un año sin datos de la demo, y cada uno mira solo los objetivos que crea: la
 * demo trae los suyos. La regla de qué medición se toma de cada indicador es la del cálculo «Objetivos cumplidos» (§5.2),
 * sobre los indicadores que la persona ve. `periodosDeObjetivos` es puro.
 */
import { existsSync } from "node:fs";
import type { TransactionSql } from "postgres";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { Objetivos } from "@/componentes/indicadores/Objetivos";
import { obtenerSql } from "@/db/cliente";
import { tomarCalculo, type PeticionDeCalculo } from "@/db/consultas/indicadores/calculos";
import { objetivosDelPeriodo, periodosDeObjetivos, type ObjetivoLeido } from "@/db/consultas/indicadores/objetivos";
import { periodoDe } from "@/lib/indicadores-documentales/periodo";
import { objetivosCumplidos } from "@/lib/indicadores/objetivos";
import { fechaLimiteDeReporte } from "@/lib/indicadores/periodos";
import type { Semaforo } from "@/lib/indicadores/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { indicadorDePrueba, liberarCalculo, type IndicadorDePrueba, type OpcionesIndicadorDePrueba } from "./utiles/indicadores";
import { sesionAdmin, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();
const ZONA = zonaHoraria();
const REPORTADA = new Date("2094-04-05T15:00:00Z");

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

let consecutivo = 0;
const unico = () => `${Date.now() % 100_000_000}${(consecutivo += 1)}`;

async function objetivo(tx: TransactionSql, clase: "calidad" | "institucional" = "calidad", activo = true): Promise<number> {
  const [o] = await tx`INSERT INTO objetivos (clase, enunciado, orden, activo) VALUES (${clase}, ${`Objetivo de prueba ${unico()}`}, 900, ${activo}) RETURNING id`;
  return Number(o.id);
}

/**
 * Una medición reportada del indicador en `periodo` con resultado 95 (meta 90), su semáforo y si alcanzó la meta; sin
 * semáforo ni `cumple`, de una ficha sin meta.
 */
async function medida(
  tx: TransactionSql,
  ind: IndicadorDePrueba,
  periodo: string,
  r: { semaforo: Semaforo | null; cumple: boolean | null; noAplica?: boolean },
): Promise<void> {
  const p = periodoDe(periodo, ZONA)!;
  const sinMeta = r.semaforo === null && r.cumple === null;
  await tx`INSERT INTO mediciones (indicador_id, version_id, periodo, desde, hasta, vence_en, estado, no_aplica, resultado_exacto, resultado,
      semaforo, cumple, meta_aplicada, reportada_en)
    VALUES (${ind.id}, ${ind.versionId}, ${periodo}, ${p.desde}, ${p.hasta}, ${fechaLimiteDeReporte(p, 10, ZONA)}, 'reportada',
      ${r.noAplica ?? false}, ${r.noAplica ? null : "95/1"}, ${r.noAplica ? null : 95}, ${r.noAplica ? null : r.semaforo},
      ${r.noAplica ? null : r.cumple}, ${sinMeta ? null : 90}, ${REPORTADA})`;
}

const BIEN = { semaforo: "bien", cumple: true } as const;
const NO_CUMPLE = { semaforo: "critico", cumple: false } as const;
const SIN_META = { semaforo: null, cumple: null } as const;

/** Lo que prepara cada caso: quien elabora las fichas y un indicador mensual de 2094 que apunta al objetivo. */
async function preparar(tx: TransactionSql) {
  const admin = await sesionAdmin(tx);
  const de = (objetivoId: number, o: OpcionesIndicadorDePrueba = {}) =>
    indicadorDePrueba(tx, { periodicidad: "mensual", inicioMedicion: "2094-01", elaboradaPor: admin.usuarioId, objetivoId, ...o });
  return { admin, de };
}

const el = (lista: ObjetivoLeido[], id: number): ObjetivoLeido => {
  const o = lista.find((x) => x.id === id);
  if (!o) throw new Error(`El objetivo ${id} no salió`);
  return o;
};
const codigos = (o: ObjetivoLeido) => o.indicadores.map((i) => i.codigo).sort();

/** La petición del cálculo «Objetivos cumplidos» de todos los objetivos, sin ficha que la pida. */
function peticionDeObjetivos(periodo: string): PeticionDeCalculo {
  const p = periodoDe(periodo, ZONA)!;
  return {
    clave: "objetivos_cumplidos",
    alcance: "todos",
    procesoId: 0,
    indicadorId: 0,
    periodo: { clave: p.clave, desde: p.desde, hasta: p.hasta },
    ahora: REPORTADA,
  };
}

describe("periodosDeObjetivos", () => {
  it("del año en curso y del anterior: el año, sus semestres y sus trimestres, del más reciente al más antiguo", () => {
    const periodos = periodosDeObjetivos(new Date("2026-11-14T15:00:00Z"), ZONA);
    expect(periodos.map((p) => p.clave)).toEqual([
      "2026", "2026-S2", "2026-S1", "2026-T4", "2026-T3", "2026-T2", "2026-T1",
      "2025", "2025-S2", "2025-S1", "2025-T4", "2025-T3", "2025-T2", "2025-T1",
    ]);
    expect(periodos[0]).toEqual({ clave: "2026", etiqueta: "2026" });
    expect(periodos[1]).toEqual({ clave: "2026-S2", etiqueta: "Segundo semestre de 2026" });
    expect(periodos[3]).toEqual({ clave: "2026-T4", etiqueta: "Cuarto trimestre de 2026" });
  });

  it("sin los que no han empezado", () => {
    const claves = periodosDeObjetivos(new Date("2026-03-10T15:00:00Z"), ZONA).map((p) => p.clave);
    expect(claves.slice(0, 4)).toEqual(["2026", "2026-S1", "2026-T1", "2025"]);
    expect(claves).not.toContain("2027");
    expect(claves).not.toContain("2026-S2");
    expect(claves).not.toContain("2026-T2");
    expect(claves).toHaveLength(10);
  });
});

describe("objetivosDelPeriodo", () => {
  it("cada objetivo activo con sus indicadores, la medición que se toma de cada uno y su estado", () => revertida(sql, async (tx) => {
    const { admin, de } = await preparar(tx);

    // Cumplido: dos indicadores que cumplen; del segundo manda marzo, la última del trimestre, no febrero.
    const cumplido = await objetivo(tx);
    const primero = await de(cumplido);
    await medida(tx, primero, "2094-03", BIEN);
    const segundo = await de(cumplido);
    await medida(tx, segundo, "2094-02", NO_CUMPLE);
    await medida(tx, segundo, "2094-03", BIEN);
    // La de marzo no tiene meta: no se toma, y manda febrero, que cumple.
    const conMetaAntes = await de(cumplido);
    await medida(tx, conMetaAntes, "2094-02", BIEN);
    await medida(tx, conMetaAntes, "2094-03", SIN_META);

    // No cumplido: «Bien» que no alcanza la meta.
    const noCumplido = await objetivo(tx);
    const bienSinMeta = await de(noCumplido);
    await medida(tx, bienSinMeta, "2094-03", { semaforo: "bien", cumple: false });

    // Sin medición: la suya es de diciembre del año anterior y la de marzo es «no aplica».
    const sinMedicion = await objetivo(tx);
    const fuera = await de(sinMedicion);
    await medida(tx, fuera, "2093-12", BIEN);
    await medida(tx, fuera, "2094-03", { ...NO_CUMPLE, noAplica: true });

    // Uno inactivo no sale, aunque tenga indicadores medidos.
    const inactivo = await objetivo(tx, "calidad", false);
    await medida(tx, await de(inactivo), "2094-03", NO_CUMPLE);

    const lista = await objetivosDelPeriodo(admin, "2094-T1", { sql: tx });
    expect(lista.some((o) => o.id === inactivo)).toBe(false);

    const c = el(lista, cumplido);
    expect(c.clase).toBe("calidad");
    expect(c.enunciado).toMatch(/^Objetivo de prueba /);
    expect(c.estado).toBe("cumplido");
    expect(codigos(c)).toEqual([primero.codigo, segundo.codigo, conMetaAntes.codigo].sort());
    const [proceso] = await tx`SELECT nombre FROM procesos WHERE id = ${primero.procesoId}`;
    expect(c.indicadores.find((i) => i.codigo === segundo.codigo)).toEqual({
      codigo: segundo.codigo,
      nombre: `Indicador de prueba ${segundo.codigo}`,
      proceso: proceso.nombre,
      periodo: "Marzo de 2094",
      resultado: expect.stringMatching(/^95\s?%$/),
      semaforo: "bien",
      cumple: true,
    });
    expect(c.indicadores.find((i) => i.codigo === conMetaAntes.codigo)?.periodo).toBe("Febrero de 2094");

    const n = el(lista, noCumplido);
    expect(n.estado).toBe("no_cumplido");
    expect(n.indicadores).toEqual([expect.objectContaining({ codigo: bienSinMeta.codigo, semaforo: "bien", cumple: false })]);

    const s = el(lista, sinMedicion);
    expect(s.estado).toBe("sin_medicion");
    // El indicador sale, sin resultado del periodo.
    expect(s.indicadores).toEqual([expect.objectContaining({ codigo: fuera.codigo, periodo: null, resultado: null, semaforo: null, cumple: null })]);

    // Por clase y orden: los de calidad antes que los institucionales.
    const clases = lista.map((o) => o.clase);
    expect(clases.indexOf("institucional") === -1 || clases.lastIndexOf("calidad") < clases.indexOf("institucional")).toBe(true);
  }));

  it("solo los indicadores que la persona ve, y el estado se calcula sin los que no ve", () => revertida(sql, async (tx) => {
    const { admin, de } = await preparar(tx);
    const consulta = await usuarioDePrueba(tx, { rol: "consulta" });

    // Con uno general que cumple y uno restringido que no.
    const mixto = await objetivo(tx);
    const general = await de(mixto);
    await medida(tx, general, "2094-03", BIEN);
    const restringido = await de(mixto, { nivelAcceso: "restringido" });
    await medida(tx, restringido, "2094-03", NO_CUMPLE);
    // Con solo el restringido, que no cumple.
    const soloRestringido = await objetivo(tx);
    const otroRestringido = await de(soloRestringido, { nivelAcceso: "restringido" });
    await medida(tx, otroRestringido, "2094-03", NO_CUMPLE);

    const deConsulta = await objetivosDelPeriodo(consulta, "2094-T1", { sql: tx });
    expect(codigos(el(deConsulta, mixto))).toEqual([general.codigo]);
    expect(el(deConsulta, mixto).estado).toBe("cumplido");
    // El objetivo sale, sin indicadores que mostrar y sin decir que hay uno que no ve.
    expect(el(deConsulta, soloRestringido).indicadores).toEqual([]);
    expect(el(deConsulta, soloRestringido).estado).toBe("sin_medicion");

    const delAdmin = await objetivosDelPeriodo(admin, "2094-T1", { sql: tx });
    expect(codigos(el(delAdmin, mixto))).toEqual([general.codigo, restringido.codigo].sort());
    expect(el(delAdmin, mixto).estado).toBe("no_cumplido");
    expect(el(delAdmin, soloRestringido).estado).toBe("no_cumplido");
  }));

  it("el indicador que calcula «Objetivos cumplidos» sale bajo su objetivo como cualquier otro", () => revertida(sql, async (tx) => {
    const { admin, de } = await preparar(tx);
    const o = await objetivo(tx);
    await medida(tx, await de(o), "2094-03", BIEN);
    const calcula = await de(o);
    await medida(tx, calcula, "2094-03", NO_CUMPLE);
    await liberarCalculo(tx, "objetivos_cumplidos", "todos");
    await tx`UPDATE indicadores SET calculo = 'objetivos_cumplidos', calculo_alcance = 'todos' WHERE id = ${calcula.id}`;

    const leido = el(await objetivosDelPeriodo(admin, "2094-T1", { sql: tx }), o);
    expect(leido.indicadores.map((i) => i.codigo)).toContain(calcula.codigo);
    expect(leido.estado).toBe("no_cumplido");
  }));

  it("sin ninguna medición que cuente, muestra la última del periodo con resultado y sin meta, que no cuenta para el estado", () => revertida(sql, async (tx) => {
    const { admin, de } = await preparar(tx);
    // Su único indicador se midió en febrero y en marzo, sin meta: sale marzo, «Sin meta», y el objetivo sigue sin medición.
    const soloSinMeta = await objetivo(tx);
    const sinMeta = await de(soloSinMeta);
    await medida(tx, sinMeta, "2094-02", SIN_META);
    await medida(tx, sinMeta, "2094-03", SIN_META);
    // Con otro que alcanza la meta, cumplido: el sin meta no lo cambia.
    const conOtro = await objetivo(tx);
    const sinMetaAcompanado = await de(conOtro);
    await medida(tx, sinMetaAcompanado, "2094-03", SIN_META);
    await medida(tx, await de(conOtro), "2094-02", BIEN);

    const lista = await objetivosDelPeriodo(admin, "2094-T1", { sql: tx });
    const solo = el(lista, soloSinMeta);
    expect(solo.indicadores).toEqual([
      expect.objectContaining({ codigo: sinMeta.codigo, periodo: "Marzo de 2094", resultado: expect.stringMatching(/^95\s?%$/), semaforo: null, cumple: null }),
    ]);
    expect(solo.estado).toBe("sin_medicion");
    const acompanado = el(lista, conOtro);
    expect(acompanado.estado).toBe("cumplido");
    expect(acompanado.indicadores.find((i) => i.codigo === sinMetaAcompanado.codigo)).toEqual(
      expect.objectContaining({ periodo: "Marzo de 2094", resultado: expect.stringMatching(/^95\s?%$/), semaforo: null, cumple: null }),
    );

    // La fila lo dice: «Sin meta», nunca «Sin dato» ni «sin dato».
    const html = renderToStaticMarkup(createElement(Objetivos, { objetivos: [solo] }));
    expect(html).toMatch(/data-variante="sin-dato"[^>]*>Sin meta</);
    expect(html).toMatch(/>95\s?%</);
    expect(html).not.toMatch(/sin dato/i);

    // El cálculo no cuenta al sin meta: solo el objetivo con el otro indicador tiene medición, y se cumple.
    expect(await tomarCalculo(tx, peticionDeObjetivos("2094-T1"))).toEqual({ A: "1", B: "1" });
  }));

  it("para quien ve todo, coincide con el cálculo «Objetivos cumplidos»", () => revertida(sql, async (tx) => {
    const { admin, de } = await preparar(tx);
    const cumplido = await objetivo(tx);
    await medida(tx, await de(cumplido), "2094-02", BIEN);
    const noCumplido = await objetivo(tx, "institucional");
    await medida(tx, await de(noCumplido), "2094-03", { semaforo: "bien", cumple: false });
    await medida(tx, await de(noCumplido, { nivelAcceso: "restringido" }), "2094-03", BIEN);
    await medida(tx, await de(await objetivo(tx)), "2093-12", BIEN);

    // Uno sin meta tampoco cuenta en la página.
    await medida(tx, await de(await objetivo(tx)), "2094-03", SIN_META);

    const lista = await objetivosDelPeriodo(admin, "2094-T1", { sql: tx });
    const pagina = objetivosCumplidos(lista.map((o) => o.indicadores.map((i) => i.cumple)));
    const calculo = await tomarCalculo(tx, peticionDeObjetivos("2094-T1"));
    expect(calculo).toEqual({ A: String(pagina.cumplidos), B: String(pagina.conMedicion) });
    expect(pagina).toEqual({ cumplidos: 1, conMedicion: 2 });
  }));
});
