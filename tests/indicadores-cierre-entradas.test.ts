/**
 * El cierre del mes conoce las entradas de cada medición (anexo 14C, §3.5; Tarea 16 de la 14C): «una medición cerrada tiene
 * cerradas todas sus entradas». El cierre cierra también los periodos de los datos compartidos que terminaron en el mes o
 * antes (salvo los que siguen en plazo, pendientes o ya reportados, y los que ya nadie pide), no cierra lo que espera una fuente abierta (y esa
 * espera se contagia hacia arriba) y, antes de clasificar, propaga lo que nadie propagó.
 *
 * Contra la BD de desarrollo, dentro de una transacción que se revierte: ningún test deja un cierre confirmado. Como en
 * `indicadores-cierre.test.ts`, los casos viven en 2003 con `ahora` en ese año (`entorno` comprueba que el resumen de base
 * esté vacío). Los indicadores son mensuales desde marzo de 2003, aprobados el 15 de diciembre de 2002, de forma
 * «porcentaje» (`A / B * 100`), meta 90; el 20 de abril (`AHORA`) marzo terminó y su plazo de 10 días venció el 10 de abril.
 * Un «espejo» de X no tiene variables propias: A toma el valor de X, B su cumplimiento, y su fórmula es «A». Los periodos
 * de un dato se abren el 1 de abril (`ABRE`): con plazo 10 vencen el 10 de abril; con 30, el 30 (no nacen vencidos).
 */
import { existsSync } from "node:fs";
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { cerrarMes, resumenDeCierre } from "@/db/consultas/indicadores/cierre";
import { asegurarPeriodosDeDatos, reportarDato } from "@/db/consultas/indicadores/datos-periodos";
import { registrarHistoricos } from "@/db/consultas/indicadores/historicos";
import { asegurarMediciones, reportar } from "@/db/consultas/indicadores/mediciones";
import { propagar } from "@/db/consultas/indicadores/propagacion";
import { datoDePrueba, dimensionDePrueba, indicadorDePrueba, periodoDeDatoDePrueba, type OpcionesIndicadorDePrueba } from "./utiles/indicadores";
import { sesionAdmin, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

const AHORA = new Date("2003-04-20T15:00:00Z");
const ABRE = new Date("2003-04-01T15:00:00Z");
const APROBADA = new Date("2002-12-15T15:00:00Z");
/** Aprobado después de terminar marzo: su marzo queda histórico. */
const APROBADA_EN_ABRIL = new Date("2003-04-05T15:00:00Z");
/** Pasado el 30 de abril: lo que tenía plazo de 30 días ya venció. */
const EN_MAYO = new Date("2003-05-15T15:00:00Z");
const MARZO = "2003-03";
const ABRIL = "2003-04";

const opc = (tx: TransactionSql, ahora = AHORA) => ({ sql: tx, ahora });
const fila = async (tx: TransactionSql, id: number) => (await tx`SELECT * FROM mediciones WHERE id = ${id}`)[0];
const periodoDelDato = async (tx: TransactionSql, id: number) => (await tx`SELECT * FROM variable_valores WHERE id = ${id}`)[0];
const medicionDe = async (tx: TransactionSql, indicadorId: number, periodo: string) =>
  Number((await tx`SELECT id FROM mediciones WHERE indicador_id = ${indicadorId} AND periodo = ${periodo}`)[0].id);
const eventosDelDato = (tx: TransactionSql, id: number) => tx`SELECT tipo, usuario_id, detalle FROM variable_eventos WHERE valor_id = ${id} ORDER BY id`;

/** Quien administra, quien mide y quien responde por los datos; antes, que el resumen de base esté vacío en 2003. */
async function entorno(tx: TransactionSql) {
  const admin = await sesionAdmin(tx);
  const mide = await usuarioDePrueba(tx, { rol: "consulta" });
  const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
  const base = await resumenDeCierre(admin, MARZO, opc(tx));
  expect(base, "el año de las pruebas no debe alcanzar mediciones ni datos de la base").toMatchObject({
    aCerrar: 0,
    enPlazo: 0,
    historicosSinRegistrar: 0,
    datos: { seCierran: 0, sinDato: 0, esperan: 0 },
    esperanEntrada: [],
  });
  const procesoId = Number((await tx`SELECT id FROM procesos WHERE sigla = 'GTH'`)[0].id);

  /** Un indicador con sus periodos terminados abiertos a `AHORA`; `plazo` cambia su plazo de reporte antes de abrirlos. */
  const nuevo = async (o: OpcionesIndicadorDePrueba & { plazo?: number } = {}) => {
    const { plazo, ...resto } = o;
    const ind = await indicadorDePrueba(tx, { procesoId, inicioMedicion: MARZO, aprobadaEn: APROBADA, mide: [mide.usuarioId], ...resto });
    if (plazo !== undefined) await tx`UPDATE indicadores SET plazo_reporte_dias = ${plazo} WHERE id = ${ind.id}`;
    await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: ind.id });
    return ind;
  };
  /** El espejo de `origen`: sin variables propias, A toma su valor y B su cumplimiento. */
  const espejo = (origen: number, o: OpcionesIndicadorDePrueba & { plazo?: number } = {}) =>
    nuevo({
      mide: [],
      formula: "A",
      variables: { A: { indicadorOrigenId: origen, toma: "valor" }, B: { indicadorOrigenId: origen, toma: "cumplimiento" } },
      ...o,
    });
  /** Un dato mensual del proceso con su responsable; `plazo` en días (sin valor, 10). */
  const dato = (nombre: string, plazo = 10) =>
    datoDePrueba(tx, { procesoId, nombre: `${nombre} ${Date.now() % 100_000_000}`, plazoReporteDias: plazo, responsables: [responsable.usuarioId] });
  /** Abre los periodos del dato el 1 de abril (no nacen vencidos) y devuelve el de `periodo`. */
  const abrirDato = async (datoId: number, periodo = MARZO) => {
    await asegurarPeriodosDeDatos({ sql: tx, ahora: ABRE, datoIds: [datoId] });
    return Number((await tx`SELECT id FROM variable_valores WHERE variable_id = ${datoId} AND periodo = ${periodo}`)[0].id);
  };
  const reportarElDato = async (periodoId: number, valor: string) => {
    const r = await reportarDato(responsable, { periodoId, valor, confirmado: true }, opc(tx));
    expect(r.ok).toBe(true);
  };
  const reportarLoPropio = (quien: SesionFlujo, medicionId: number, valores: Record<string, string>, ahora = AHORA) =>
    reportar(quien, { medicionId, valores, parcial: false, confirmado: true }, opc(tx, ahora));
  return { admin, mide, responsable, procesoId, nuevo, espejo, dato, abrirDato, reportarElDato, reportarLoPropio };
}

describe("el cierre cierra los periodos de los datos", () => {
  it("cierra el reportado de marzo y el vencido sin valor; no el pendiente en plazo ni el que ya nadie pide", () =>
    revertida(sql, async (tx) => {
      const { admin, mide, nuevo, dato, abrirDato, reportarElDato, reportarLoPropio } = await entorno(tx);
      const reportado = await dato("ZZ Reportado");
      const enPlazo = await dato("ZZ En plazo", 30);
      const vencido = await dato("ZZ Vencido");
      // Cada uno lo pide un mixto: A propia, B el dato.
      const conReportado = await nuevo({ variables: { B: { datoId: reportado } } });
      const conEnPlazo = await nuevo({ variables: { B: { datoId: enPlazo } } });
      const conVencido = await nuevo({ variables: { B: { datoId: vencido } } });
      const pReportado = await abrirDato(reportado);
      const pEnPlazo = await abrirDato(enPlazo);
      const pVencido = await abrirDato(vencido);
      await reportarElDato(pReportado, "10");
      for (const ind of [conReportado, conEnPlazo, conVencido]) await reportarLoPropio(mide, await medicionDe(tx, ind.id, MARZO), { A: "9" });

      // Un dato que nadie pide: su pendiente se conserva por su historia y no se cierra ni cuenta; su reportado sí se cierra.
      const sinPedir = await dato("ZZ Sin pedir");
      const pSinPedir = await periodoDeDatoDePrueba(tx, { datoId: sinPedir, periodo: MARZO, ahora: ABRE });
      await tx`INSERT INTO variable_eventos (valor_id, tipo, usuario_id, detalle, creado_en)
        VALUES (${pSinPedir}, 'soporte', ${admin.usuarioId}, ${tx.json({ accion: "subido", nombre: "acta.pdf" })}, ${ABRE})`;
      const pSinPedirFebrero = await periodoDeDatoDePrueba(tx, { datoId: sinPedir, periodo: "2003-02", valor: "7", ahora: ABRE });

      const r = await resumenDeCierre(admin, MARZO, opc(tx));
      expect(r.datos).toEqual({ seCierran: 3, sinDato: 1, esperan: 1 });
      // El resumen no escribe: nada se cierra todavía.
      expect((await periodoDelDato(tx, pReportado)).estado).toBe("reportado");
      expect((await periodoDelDato(tx, pSinPedir)).se_pide).toBe(false);

      const { cierreId } = await cerrarMes(admin, MARZO, opc(tx));
      const cerrado = await periodoDelDato(tx, pReportado);
      expect([cerrado.estado, Number(cerrado.cierre_id), cerrado.valor === null]).toEqual(["cerrado", cierreId, false]);
      const sinValor = await periodoDelDato(tx, pVencido);
      expect([sinValor.estado, Number(sinValor.cierre_id), sinValor.valor]).toEqual(["cerrado", cierreId, null]);
      expect((await periodoDelDato(tx, pEnPlazo)).estado).toBe("pendiente");
      expect((await periodoDelDato(tx, pSinPedir)).estado).toBe("pendiente");
      expect((await periodoDelDato(tx, pSinPedirFebrero)).estado).toBe("cerrado");

      const [e] = (await eventosDelDato(tx, pReportado)).filter((x) => x.tipo === "cierre");
      expect(Number(e.usuario_id)).toBe(admin.usuarioId);
      expect(e.detalle).toMatchObject({ cierreId, mes: MARZO, antes: { estado: "reportado" }, despues: { estado: "cerrado" } });
      const [s] = (await eventosDelDato(tx, pVencido)).filter((x) => x.tipo === "cierre");
      expect(s.detalle).toMatchObject({ cierreId, sinDato: true, antes: { estado: "pendiente" } });
      expect((await eventosDelDato(tx, pEnPlazo)).filter((x) => x.tipo === "cierre")).toHaveLength(0);

      // El mixto con su dato cerrado se cierra con su resultado; el del vencido, «Sin dato»; el del dato en plazo espera.
      const m1 = await fila(tx, await medicionDe(tx, conReportado.id, MARZO));
      expect([m1.estado, m1.resultado_exacto]).toEqual(["cerrada", "90/1"]);
      const m3 = await fila(tx, await medicionDe(tx, conVencido.id, MARZO));
      expect([m3.estado, m3.resultado_exacto]).toEqual(["cerrada", null]);
      expect((await fila(tx, await medicionDe(tx, conEnPlazo.id, MARZO))).estado).toBe("abierta");
    }));
});

describe("un periodo de un dato ya reportado que sigue dentro de su plazo", () => {
  it("no se cierra: se corrige sin justificación, lo que lo usa espera y el resumen lo dice; pasado el plazo, se cierran los dos", () =>
    revertida(sql, async (tx) => {
      const { admin, mide, responsable, nuevo, dato, abrirDato, reportarElDato, reportarLoPropio } = await entorno(tx);
      const enPlazo = await dato("ZZ Reportado en plazo", 30);
      const [d] = await tx`SELECT nombre FROM variables_compartidas WHERE id = ${enPlazo}`;
      const mixto = await nuevo({ variables: { B: { datoId: enPlazo } } });
      const p = await abrirDato(enPlazo);
      const marzo = await medicionDe(tx, mixto.id, MARZO);
      await reportarLoPropio(mide, marzo, { A: "9" });
      await reportarElDato(p, "10");
      // Reportado el 20 de abril, con plazo hasta el 30; la medición de marzo ya venció (el 10 de abril).
      const antes = await periodoDelDato(tx, p);
      expect(antes.estado).toBe("reportado");
      expect((antes.vence_en as Date).getTime()).toBeGreaterThan(AHORA.getTime());
      expect(((await fila(tx, marzo)).vence_en as Date).getTime()).toBeLessThan(AHORA.getTime());

      const r = await resumenDeCierre(admin, MARZO, opc(tx));
      expect(r.datos).toEqual({ seCierran: 0, sinDato: 0, esperan: 1 });
      expect(r.aCerrar).toBe(0);
      expect(r.esperanEntrada).toEqual([{ codigo: mixto.codigo, periodo: MARZO, espera: `El dato «${d.nombre as string}», marzo de 2003` }]);

      await cerrarMes(admin, MARZO, opc(tx));
      expect((await periodoDelDato(tx, p)).estado).toBe("reportado");
      expect((await eventosDelDato(tx, p)).filter((x) => x.tipo === "cierre")).toHaveLength(0);
      const m = await fila(tx, marzo);
      expect([m.estado, m.resultado_exacto]).toEqual(["reportada", "90/1"]);

      // Sigue abierto: su responsable lo corrige antes del cierre, sin justificación (anexo 14C, §4.4).
      expect(await reportarDato(responsable, { periodoId: p, valor: "9.5", confirmado: true }, opc(tx))).toEqual({ ok: true, corregido: true });

      // El cierre siguiente, pasado el 30 de abril, cierra el periodo del dato y la medición que lo usa, con el valor corregido.
      await cerrarMes(admin, ABRIL, opc(tx, EN_MAYO));
      expect((await periodoDelDato(tx, p)).estado).toBe("cerrado");
      const cerrada = await fila(tx, marzo);
      expect([cerrada.estado, cerrada.resultado_exacto]).toEqual(["cerrada", "1800/19"]);
    }));
});

describe("lo que espera una fuente no se cierra", () => {
  it("un mixto reportado que espera un dato en plazo no se cierra y el resumen lo cuenta en esperanEntrada", () =>
    revertida(sql, async (tx) => {
      const { admin, mide, nuevo, dato, abrirDato, reportarLoPropio } = await entorno(tx);
      const enPlazo = await dato("ZZ Facturado", 30);
      const [d] = await tx`SELECT nombre FROM variables_compartidas WHERE id = ${enPlazo}`;
      const mixto = await nuevo({ variables: { B: { datoId: enPlazo } } });
      await abrirDato(enPlazo);
      const marzo = await medicionDe(tx, mixto.id, MARZO);
      await reportarLoPropio(mide, marzo, { A: "9" });

      const r = await resumenDeCierre(admin, MARZO, opc(tx));
      expect(r.aCerrar).toBe(0);
      expect(r.enPlazo).toBe(0);
      expect(r.esperanEntrada).toEqual([{ codigo: mixto.codigo, periodo: MARZO, espera: `El dato «${d.nombre as string}», marzo de 2003` }]);
      expect(r.datos).toEqual({ seCierran: 0, sinDato: 0, esperan: 1 });
      await cerrarMes(admin, MARZO, opc(tx));
      expect((await fila(tx, marzo)).estado).toBe("abierta");
    }));

  it("«Sin dato»: con el dato vencido, la medición se cierra y lo debían los responsables del dato; con un componente sin dato, el indicador", () =>
    revertida(sql, async (tx) => {
      const { admin, mide, nuevo, espejo, dato, abrirDato, reportarLoPropio } = await entorno(tx);
      const vencido = await dato("ZZ Glosas");
      const [d] = await tx`SELECT nombre FROM variables_compartidas WHERE id = ${vencido}`;
      const mixto = await nuevo({ variables: { B: { datoId: vencido } } });
      await abrirDato(vencido);
      await reportarLoPropio(mide, await medicionDe(tx, mixto.id, MARZO), { A: "9" });
      // Un componente que nadie reportó, vencido: se cierra «Sin dato» y su espejo también.
      const componente = await nuevo();
      const compuesto = await espejo(componente.id);

      const r = await resumenDeCierre(admin, MARZO, opc(tx));
      const quien = (codigo: string) => r.sinDato.find((s) => s.codigo === codigo)?.quien;
      expect(quien(mixto.codigo)).toEqual([`Los responsables del dato «${d.nombre as string}»`]);
      expect(quien(compuesto.codigo)).toEqual([`El indicador ${componente.codigo}`]);
      expect(quien(componente.codigo)).toEqual([mide.nombre]);
      expect(r.esperanEntrada).toEqual([]);

      await cerrarMes(admin, MARZO, opc(tx));
      for (const ind of [mixto, componente, compuesto]) {
        const m = await fila(tx, await medicionDe(tx, ind.id, MARZO));
        expect([m.estado, m.resultado_exacto]).toEqual(["cerrada", null]);
      }
    }));

  it("la regla: un compuesto ya calculado cuyo componente sigue en plazo no se cierra; al cerrar el componente, se cierran los dos", () =>
    revertida(sql, async (tx) => {
      const { admin, mide, nuevo, espejo, reportarLoPropio } = await entorno(tx);
      const componente = await nuevo({ plazo: 30 });
      const compuesto = await espejo(componente.id);
      const deComponente = await medicionDe(tx, componente.id, MARZO);
      const deCompuesto = await medicionDe(tx, compuesto.id, MARZO);
      await reportarLoPropio(mide, deComponente, { A: "9", B: "10" });
      await propagar(opc(tx));
      expect((await fila(tx, deCompuesto)).resultado_exacto).toBe("90/1");

      const r = await resumenDeCierre(admin, MARZO, opc(tx));
      expect(r.enPlazo).toBe(1);
      expect(r.esperanEntrada).toEqual([{ codigo: compuesto.codigo, periodo: MARZO, espera: `El indicador ${componente.codigo}, marzo de 2003` }]);
      await cerrarMes(admin, MARZO, opc(tx));
      expect((await fila(tx, deComponente)).estado).toBe("reportada");
      expect((await fila(tx, deCompuesto)).estado).toBe("reportada");

      const abril = await cerrarMes(admin, ABRIL, opc(tx, EN_MAYO));
      for (const id of [deComponente, deCompuesto]) {
        const m = await fila(tx, id);
        expect([m.estado, Number(m.cierre_id)]).toEqual(["cerrada", abril.cierreId]);
      }
    }));

  it("en cadena: C toma B y B toma A; con A en plazo no se cierra ninguno, y cuando A vence un solo cierre cierra los tres", () =>
    revertida(sql, async (tx) => {
      const { admin, mide, nuevo, espejo, reportarLoPropio } = await entorno(tx);
      const a = await nuevo({ plazo: 30 });
      const b = await espejo(a.id);
      const c = await espejo(b.id);
      const ids = [await medicionDe(tx, a.id, MARZO), await medicionDe(tx, b.id, MARZO), await medicionDe(tx, c.id, MARZO)];
      await reportarLoPropio(mide, ids[0], { A: "9", B: "10" });
      await propagar(opc(tx));
      for (const id of ids) expect((await fila(tx, id)).resultado_exacto).toBe("90/1");

      const r = await resumenDeCierre(admin, MARZO, opc(tx));
      expect(r.aCerrar).toBe(0);
      expect(r.enPlazo).toBe(1);
      expect(r.esperanEntrada).toEqual(
        [
          { codigo: b.codigo, periodo: MARZO, espera: `El indicador ${a.codigo}, marzo de 2003` },
          { codigo: c.codigo, periodo: MARZO, espera: `El indicador ${b.codigo}, marzo de 2003` },
        ].sort((x, y) => x.codigo.localeCompare(y.codigo, "es")),
      );
      await cerrarMes(admin, MARZO, opc(tx));
      for (const id of ids) expect((await fila(tx, id)).estado).toBe("reportada");

      const abril = await cerrarMes(admin, ABRIL, opc(tx, EN_MAYO));
      for (const id of ids) {
        const m = await fila(tx, id);
        expect([m.estado, Number(m.cierre_id)]).toEqual(["cerrada", abril.cierreId]);
      }
    }));

  it("lo que nadie propagó: el cierre propaga antes de clasificar y el compuesto se cierra con el valor nuevo", () =>
    revertida(sql, async (tx) => {
      const { admin, mide, nuevo, espejo, reportarLoPropio } = await entorno(tx);
      const componente = await nuevo();
      const compuesto = await espejo(componente.id);
      const deComponente = await medicionDe(tx, componente.id, MARZO);
      const deCompuesto = await medicionDe(tx, compuesto.id, MARZO);
      await reportarLoPropio(mide, deComponente, { A: "9", B: "10" });
      await propagar(opc(tx));
      expect((await fila(tx, deCompuesto)).resultado_exacto).toBe("90/1");
      // Se corrige el componente y no corre la propagación.
      await reportarLoPropio(mide, deComponente, { A: "10", B: "10" });
      expect((await fila(tx, deCompuesto)).resultado_exacto).toBe("90/1");

      await cerrarMes(admin, MARZO, opc(tx));
      const m = await fila(tx, deCompuesto);
      expect([m.estado, m.resultado_exacto]).toEqual(["cerrada", "100/1"]);
    }));

  it("lo copiado que ya no coincide con su fuente espera, aunque la fuente esté cerrada", () =>
    revertida(sql, async (tx) => {
      const { admin, mide, nuevo, espejo, reportarLoPropio } = await entorno(tx);
      const componente = await nuevo();
      const compuesto = await espejo(componente.id);
      const deComponente = await medicionDe(tx, componente.id, MARZO);
      const deCompuesto = await medicionDe(tx, compuesto.id, MARZO);
      await reportarLoPropio(mide, deComponente, { A: "9", B: "10" });
      await propagar(opc(tx));
      // Lo copiado se desvía de la fuente sin que la pasada lo arregle (el indicador queda sin inicio: no se propaga).
      await tx`UPDATE medicion_valores SET valor = 50, valor_exacto = NULL
        WHERE medicion_id = ${deCompuesto} AND variable_id = ${compuesto.variables.A}`;
      await tx`UPDATE indicadores SET inicio_medicion = NULL WHERE id = ${compuesto.id}`;

      const r = await resumenDeCierre(admin, MARZO, opc(tx));
      expect(r.esperanEntrada).toEqual([{ codigo: compuesto.codigo, periodo: MARZO, espera: "Lo copiado de sus fuentes aún no está al día" }]);
      await cerrarMes(admin, MARZO, opc(tx));
      expect((await fila(tx, deComponente)).estado).toBe("cerrada");
      expect((await fila(tx, deCompuesto)).estado).toBe("reportada");
    }));

  it("un compuesto cuyo componente sigue en plazo y aún no tiene dato espera: no se cierra «Sin dato» bajo un componente abierto", () =>
    revertida(sql, async (tx) => {
      const { admin, nuevo, espejo } = await entorno(tx);
      const componente = await nuevo({ plazo: 30 });
      const compuesto = await espejo(componente.id);
      const deCompuesto = await medicionDe(tx, compuesto.id, MARZO);

      const r = await resumenDeCierre(admin, MARZO, opc(tx));
      expect(r.enPlazo).toBe(1);
      expect(r.sinDato.map((s) => s.codigo)).not.toContain(compuesto.codigo);
      expect(r.esperanEntrada).toEqual([{ codigo: compuesto.codigo, periodo: MARZO, espera: `El indicador ${componente.codigo}, marzo de 2003` }]);
      await cerrarMes(admin, MARZO, opc(tx));
      expect((await fila(tx, deCompuesto)).estado).toBe("abierta");
      expect((await fila(tx, await medicionDe(tx, componente.id, MARZO))).estado).toBe("abierta");
    }));

  it("un desagregado que toma un dato por categoría se cierra con su dato, y espera si una celda ya no coincide con el dato", () =>
    revertida(sql, async (tx) => {
      const { admin, mide, procesoId, nuevo } = await entorno(tx);
      const sede = await dimensionDePrueba(tx, `Sede ${Date.now() % 100_000_000}`, ["S1", "S2"]);
      // Que las sedes entren a los periodos de 2003.
      await tx`UPDATE dimension_categorias SET creado_en = '2000-01-01T00:00:00Z' WHERE dimension_id = ${sede.id}`;
      const [s1, s2] = sede.categorias;
      const dato = await datoDePrueba(tx, { procesoId, nombre: `ZZ Auditados ${Date.now() % 100_000_000}`, dimensionId: sede.id });
      const pMarzo = await periodoDeDatoDePrueba(tx, { datoId: dato, periodo: MARZO, valor: "30", ahora: ABRE });
      await tx`UPDATE variable_valores SET por_categoria = ${tx.json({ [s1]: "10", [s2]: "20" })} WHERE id = ${pMarzo}`;
      const coherente = await nuevo({ dimensionId: sede.id, variables: { B: { datoId: dato } } });
      const desviado = await nuevo({ dimensionId: sede.id, variables: { B: { datoId: dato } } });
      const filas = [
        { categoriaId: s1, valores: { A: "9" } },
        { categoriaId: s2, valores: { A: "18" } },
      ];
      const ids = { coherente: await medicionDe(tx, coherente.id, MARZO), desviado: await medicionDe(tx, desviado.id, MARZO) };
      for (const id of Object.values(ids)) {
        expect((await fila(tx, id)).categorias).toHaveLength(2);
        await reportar(mide, { medicionId: id, valores: {}, filas, parcial: false, confirmado: true }, opc(tx));
      }
      await propagar(opc(tx));
      for (const id of Object.values(ids)) expect((await fila(tx, id)).resultado_exacto).toBe("90/1");
      // La celda de S2 del desviado se aparta del dato y la pasada no la arregla (su indicador queda sin inicio: no se propaga).
      await tx`UPDATE medicion_valores SET valor = 25 WHERE medicion_id = ${ids.desviado} AND categoria_id = ${s2} AND variable_id = ${desviado.variables.B}`;
      await tx`UPDATE indicadores SET inicio_medicion = NULL WHERE id = ${desviado.id}`;

      const r = await resumenDeCierre(admin, MARZO, opc(tx));
      expect(r.esperanEntrada).toEqual([{ codigo: desviado.codigo, periodo: MARZO, espera: "Lo copiado de sus fuentes aún no está al día" }]);
      await cerrarMes(admin, MARZO, opc(tx));
      expect((await periodoDelDato(tx, pMarzo)).estado).toBe("cerrado");
      expect((await fila(tx, ids.coherente)).estado).toBe("cerrada");
      expect((await fila(tx, ids.desviado)).estado).toBe("reportada");
    }));

  it("un histórico sin registrar del componente no frena el cierre del compuesto", () =>
    revertida(sql, async (tx) => {
      const { admin, nuevo, espejo } = await entorno(tx);
      const componente = await nuevo({ aprobadaEn: APROBADA_EN_ABRIL });
      const compuesto = await espejo(componente.id);
      const deComponente = await medicionDe(tx, componente.id, MARZO);
      const deCompuesto = await medicionDe(tx, compuesto.id, MARZO);
      expect((await fila(tx, deComponente)).historica).toBe(true);

      const r = await resumenDeCierre(admin, MARZO, opc(tx));
      expect(r.historicosSinRegistrar).toBe(1);
      expect(r.esperanEntrada).toEqual([]);
      await cerrarMes(admin, MARZO, opc(tx));
      const m = await fila(tx, deCompuesto);
      expect([m.estado, m.resultado_exacto]).toEqual(["cerrada", null]);
      expect((await fila(tx, deComponente)).estado).toBe("abierta");
    }));

  it("el componente interior sin periodo dentro de lo que usa el intermedio no frena el cierre del compuesto (caso aparcado de la Tarea 12)", () =>
    revertida(sql, async (tx) => {
      const { admin, nuevo, espejo } = await entorno(tx);
      // A (interior) y B (intermedio, espejo de A) se aprobaron en abril: su marzo es histórico. B lo registra; A no.
      const a = await nuevo({ aprobadaEn: APROBADA_EN_ABRIL });
      const b = await espejo(a.id, { aprobadaEn: APROBADA_EN_ABRIL });
      await registrarHistoricos(admin, { indicadorId: b.id, filas: [{ periodo: MARZO, valores: { A: "90", B: "100" } }] }, opc(tx));
      // C, trimestral y ordinario, toma a B (más fino): su primer trimestre espera el acumulado de B, que no tiene el de A.
      const c = await nuevo({
        periodicidad: "trimestral",
        inicioMedicion: "2003-T1",
        mide: [],
        formula: "A",
        variables: { A: { indicadorOrigenId: b.id, toma: "valor" }, B: { indicadorOrigenId: b.id, toma: "cumplimiento" } },
      });
      const t1 = await medicionDe(tx, c.id, "2003-T1");
      await propagar(opc(tx));
      expect((await fila(tx, t1)).resultado_exacto).toBeNull();

      const r = await resumenDeCierre(admin, MARZO, opc(tx));
      expect(r.esperanEntrada).toEqual([]);
      expect(r.sinDato.find((s) => s.codigo === c.codigo)?.quien).toEqual([`El indicador ${b.codigo}`]);
      await cerrarMes(admin, MARZO, opc(tx));
      expect((await fila(tx, t1)).estado).toBe("cerrada");
      expect((await fila(tx, await medicionDe(tx, b.id, MARZO))).estado).toBe("cerrada");
      expect((await fila(tx, await medicionDe(tx, a.id, MARZO))).estado).toBe("abierta");
    }));
});
