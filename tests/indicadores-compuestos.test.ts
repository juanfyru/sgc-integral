/**
 * La propagación de los componentes (anexo 14C, §6.3 y §3.3; Tarea 12 de la 14C): una variable que toma el resultado de otro
 * indicador recibe su valor o su porcentaje de cumplimiento (con la meta que se le aplicó a esa medición) cuando el
 * componente lo tiene o lo cambia; si el componente es más fino, su acumulado propio en el periodo del compuesto; y si no
 * aplicó, el compuesto queda «No aplica» por contagio. Una sola pasada deja al día a un compuesto de compuestos: recorre los
 * indicadores por nivel de dependencia (`nivelesBajo`). Contra la BD de desarrollo, dentro de una transacción que se revierte
 * y con `ahora` inyectado.
 *
 * Los indicadores de prueba son de forma «porcentaje» (`A / B * 100`), meta 90 y umbral 70 (Atención desde 63). El «espejo»
 * de un componente X no tiene variables propias: A toma el valor de X, B su cumplimiento y su fórmula es «A»: su resultado es
 * el de X.
 */
import { existsSync } from "node:fs";
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { CONFIG_DOCUMENTAL_DEFECTO } from "@/db/consultas/config-documental";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { tomarCalculo } from "@/db/consultas/indicadores/calculos";
import { registrarHistoricos } from "@/db/consultas/indicadores/historicos";
import { asegurarMediciones, marcarNoAplica, NO_APLICA_DEL_SISTEMA, quitarNoAplica, reportar } from "@/db/consultas/indicadores/mediciones";
import { programarMeta } from "@/db/consultas/indicadores/metas";
import { asegurarMedicionesConFuentes, propagar, valorDeComponente } from "@/db/consultas/indicadores/propagacion";
import { columnasDePendiente, esPendiente, queFalta, tareasDeIndicadores } from "@/db/consultas/indicadores/tareas";
import { revisarVencimientosDeIndicadores } from "@/db/consultas/indicadores/vencimientos";
import { periodoDe } from "@/lib/indicadores-documentales/periodo";
import { aTexto } from "@/lib/indicadores/formula/fraccion";
import { historialDeCorreccion } from "@/lib/indicadores/historial";
import { MOTIVO_COMPONENTE_NO_APLICA, type Toma } from "@/lib/indicadores/tipos";
import { fechaLimite } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import {
  fotoDePrueba,
  indicadorDePrueba,
  silenciarIndicadores,
  versionNueva,
  type IndicadorDePrueba,
  type OpcionesIndicadorDePrueba,
} from "./utiles/indicadores";
import { sesionAdmin, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();
const ZONA = zonaHoraria();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

let consecutivo = 0;
const unico = () => `${Date.now() % 100_000_000}${(consecutivo += 1)}`;

const AHORA = new Date("2026-10-05T15:00:00Z");
/** Pasada la fecha límite de septiembre y del tercer trimestre (el 10 de octubre). */
const TARDE = new Date("2026-10-20T15:00:00Z");
const DESPUES = new Date("2026-10-25T15:00:00Z");
/** Para los que se miden desde septiembre. */
const AGOSTO = new Date("2026-08-15T15:00:00Z");
/** Para los que se miden desde julio o el tercer trimestre. */
const JUNIO = new Date("2026-06-15T15:00:00Z");
const MOTIVO_DE_X = "Sin casos en el mes";
const config = { ...CONFIG_DOCUMENTAL_DEFECTO, escalamientoDias: 3 };

const sinCambios = { escritas: 0, noAplica: 0, fallidas: 0 };

const propagarA = (tx: TransactionSql, ahora: Date, indicadorIds?: number[]) =>
  propagar({ sql: tx, ahora, ...(indicadorIds ? { indicadorIds } : {}) });

const fila = async (tx: TransactionSql, medicionId: number) => (await tx`SELECT * FROM mediciones WHERE id = ${medicionId}`)[0];

const eventos = async (tx: TransactionSql, medicionId: number) =>
  (await tx`SELECT tipo, usuario_id, detalle FROM medicion_eventos WHERE medicion_id = ${medicionId} ORDER BY id`).map((e) => ({
    tipo: e.tipo as string,
    usuarioId: e.usuario_id === null ? null : Number(e.usuario_id),
    detalle: e.detalle as Record<string, unknown>,
  }));

/** Las filas de valores de la medición, por letra: el valor, su fracción exacta y quién lo puso. */
const valores = async (tx: TransactionSql, medicionId: number) =>
  Object.fromEntries(
    (
      await tx`SELECT iv.letra, mv.valor::text AS valor, mv.valor_exacto, mv.reportado_por
        FROM medicion_valores mv JOIN indicador_variables iv ON iv.id = mv.variable_id
        WHERE mv.medicion_id = ${medicionId} AND mv.categoria_id IS NULL ORDER BY iv.letra`
    ).map((v) => [
      v.letra as string,
      { valor: v.valor as string, exacto: (v.valor_exacto as string | null) ?? null, por: v.reportado_por === null ? null : Number(v.reportado_por) },
    ]),
  );

/** Lo que le falta a la medición según `queFalta`, como la leen las tareas y la pasada; `null` si no está pendiente. */
async function falta(tx: TransactionSql, medicionId: number) {
  const filas = await tx`SELECT ${columnasDePendiente(tx)} FROM mediciones m JOIN indicadores i ON i.id = m.indicador_id
    WHERE m.id = ${medicionId} AND ${esPendiente(tx)}`;
  return queFalta(filas).get(medicionId)?.falta ?? null;
}

async function procesoNuevo(tx: TransactionSql): Promise<number> {
  const sigla = `Z${unico()}`;
  const [macro] = await tx`SELECT id FROM macroprocesos ORDER BY id LIMIT 1`;
  const [p] = await tx`INSERT INTO procesos (macroproceso_id, nombre, sigla, slug, icono, orden)
    VALUES (${macro.id}, ${`Proceso ${sigla}`}, ${sigla}, ${sigla.toLowerCase()}, 'circle', 99) RETURNING id`;
  return Number(p.id);
}

const medicionDe = async (tx: TransactionSql, indicadorId: number, periodo: string) =>
  Number((await tx`SELECT id FROM mediciones WHERE indicador_id = ${indicadorId} AND periodo = ${periodo}`)[0].id);

/** Un indicador que mide una persona, con ella: mensual desde septiembre salvo lo que diga `o`. Sin abrir periodos. */
async function componente(tx: TransactionSql, procesoId: number, o: OpcionesIndicadorDePrueba = {}) {
  const mide = await usuarioDePrueba(tx, { rol: "consulta" });
  const ind = await indicadorDePrueba(tx, {
    procesoId,
    periodicidad: "mensual",
    inicioMedicion: "2026-09",
    aprobadaEn: AGOSTO,
    mide: [mide.usuarioId],
    ...o,
  });
  return { ind, mide };
}

/** Las variables del espejo de `origen`: A toma su valor y B su cumplimiento. */
const deEspejo = (origen: number): OpcionesIndicadorDePrueba["variables"] => ({
  A: { indicadorOrigenId: origen, toma: "valor" },
  B: { indicadorOrigenId: origen, toma: "cumplimiento" },
});

/** El espejo de `origen` (sin variables propias, fórmula «A»), mensual desde septiembre salvo lo que diga `o`. */
const espejo = (tx: TransactionSql, procesoId: number, origen: number, o: OpcionesIndicadorDePrueba = {}) =>
  indicadorDePrueba(tx, {
    procesoId,
    periodicidad: "mensual",
    inicioMedicion: "2026-09",
    aprobadaEn: AGOSTO,
    formula: "A",
    variables: deEspejo(origen),
    ...o,
  });

const abrir = async (tx: TransactionSql, ahora: Date, ...indicadores: IndicadorDePrueba[]) => {
  for (const i of indicadores) await asegurarMediciones({ sql: tx, ahora, indicadorId: i.id });
};

const reportarAB = (tx: TransactionSql, sesion: SesionFlujo, medicionId: number, A: string, B: string, ahora = AHORA) =>
  reportar(sesion, { medicionId, valores: { A, B }, parcial: false, confirmado: true }, { sql: tx, ahora });

/** `valorDeComponente` para el periodo de la medición `medicionId` (del compuesto), en texto. */
async function valorPara(tx: TransactionSql, origen: number, toma: Toma, medicionId: number) {
  const m = await fila(tx, medicionId);
  const r = await valorDeComponente(tx, { indicadorId: origen, toma, periodo: m.periodo as string, desde: m.desde as Date, hasta: m.hasta as Date });
  return r.estado === "listo" ? { ...r, valor: aTexto(r.valor) } : r;
}

describe("misma periodicidad", () => {
  async function escenario(tx: TransactionSql) {
    const procesoId = await procesoNuevo(tx);
    const x = await componente(tx, procesoId);
    const c = await espejo(tx, procesoId, x.ind.id);
    await abrir(tx, AHORA, x.ind, c);
    return { ...x, c, deX: await medicionDe(tx, x.ind.id, "2026-09"), deC: await medicionDe(tx, c.id, "2026-09") };
  }

  it("copia el resultado exacto de X y su cumplimiento (60 frente a 90 es 200/3), con el evento del sistema; otra vez no escribe nada", () =>
    revertida(sql, async (tx) => {
      const { ind: x, mide, c, deX, deC } = await escenario(tx);
      expect(await propagarA(tx, AHORA, [x.id])).toEqual(sinCambios);
      expect(await valorPara(tx, x.id, "valor", deC)).toEqual({ estado: "falta" });
      expect(await falta(tx, deC)).toBe("dato");

      await reportarAB(tx, mide, deX, "60", "100");
      expect(await valorPara(tx, x.id, "valor", deC)).toEqual({ estado: "listo", valor: "60/1", mediciones: [deX], desde: null });
      expect(await valorPara(tx, x.id, "cumplimiento", deC)).toEqual({ estado: "listo", valor: "200/3", mediciones: [deX], desde: null });

      expect(await propagarA(tx, AHORA, [x.id])).toEqual({ escritas: 1, noAplica: 0, fallidas: 0 });
      expect(await valores(tx, deC)).toEqual({
        A: { valor: "60", exacto: null, por: null },
        B: { valor: "66.6666", exacto: "200/3", por: null },
      });
      const m = await fila(tx, deC);
      expect(m.resultado_exacto).toBe((await fila(tx, deX)).resultado_exacto);
      expect([m.resultado_exacto, m.semaforo, m.reportada_en, m.reportada_por]).toEqual(["60/1", "critico", AHORA, null]);

      const [propagacion] = await eventos(tx, deC);
      expect(propagacion).toMatchObject({
        tipo: "propagacion",
        usuarioId: null,
        detalle: {
          fuentes: [
            { letra: "A", clase: "indicador", id: x.id, antes: null, despues: "60" },
            { letra: "B", clase: "indicador", id: x.id, antes: null, despues: "66.6666" },
          ],
        },
      });
      // El evento lleva la referencia del componente, nunca su código.
      expect(JSON.stringify(propagacion.detalle)).not.toContain(x.codigo);

      expect(await propagarA(tx, AHORA, [x.id])).toEqual(sinCambios);
      expect(await propagarA(tx, AHORA, [c.id])).toEqual(sinCambios);
      expect(await eventos(tx, deC)).toHaveLength(1);
    }));

  it("reprogramar la meta de X sin cambiar su resultado cambia el cumplimiento copiado y deja su evento", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const { ind: x, mide, deX, deC } = await escenario(tx);
      await reportarAB(tx, mide, deX, "60", "100");
      await propagarA(tx, AHORA, [x.id]);

      await programarMeta(admin, { indicadorId: x.id, periodo: "2026-09", meta: "80", justificacion: "La meta de septiembre se ajusta al plan" }, { sql: tx, ahora: TARDE });
      const deX2 = await fila(tx, deX);
      expect([deX2.resultado_exacto, String(deX2.meta_aplicada)]).toEqual(["60/1", "80"]);

      expect(await propagarA(tx, TARDE, [x.id])).toEqual({ escritas: 1, noAplica: 0, fallidas: 0 });
      expect((await valores(tx, deC)).B).toEqual({ valor: "75", exacto: null, por: null });
      expect((await valores(tx, deC)).A).toEqual({ valor: "60", exacto: null, por: null });
      const ultimo = (await eventos(tx, deC)).at(-1)!;
      expect(ultimo.tipo).toBe("propagacion");
      expect(ultimo.detalle.fuentes).toEqual([{ letra: "B", clase: "indicador", id: x.id, antes: "66.6666", despues: "75" }]);
    }));

  it("un componente cerrado «Sin dato» deja al compuesto en «Falta un dato»", () =>
    revertida(sql, async (tx) => {
      const { ind: x, deX, deC } = await escenario(tx);
      await tx`UPDATE mediciones SET estado = 'cerrada' WHERE id = ${deX}`;
      expect(await valorPara(tx, x.id, "valor", deC)).toEqual({ estado: "falta" });
      expect(await propagarA(tx, AHORA, [x.id])).toEqual(sinCambios);
      expect(await valores(tx, deC)).toEqual({});
      expect(await falta(tx, deC)).toBe("dato");
    }));
});

describe("componente más fino", () => {
  /** X mensual desde julio y su espejo trimestral desde el tercer trimestre. */
  async function escenario(tx: TransactionSql, antesDeAbrir?: (x: IndicadorDePrueba) => Promise<void>) {
    const procesoId = await procesoNuevo(tx);
    const x = await componente(tx, procesoId, { inicioMedicion: "2026-07", aprobadaEn: JUNIO });
    const c = await espejo(tx, procesoId, x.ind.id, { periodicidad: "trimestral", inicioMedicion: "2026-T3", aprobadaEn: JUNIO });
    await antesDeAbrir?.(x.ind);
    await abrir(tx, AHORA, x.ind, c);
    const mes = (p: string) => medicionDe(tx, x.ind.id, p);
    return { ...x, c, julio: await mes("2026-07"), agosto: await mes("2026-08"), septiembre: await mes("2026-09"), deC: await medicionDe(tx, c.id, "2026-T3") };
  }

  it("espera los tres meses y copia el acumulado de X (sus variables juntadas, no el promedio de sus resultados); un mes «No aplica» se salta", () =>
    revertida(sql, async (tx) => {
      const { ind: x, mide, julio, agosto, septiembre, deC } = await escenario(tx);
      await reportarAB(tx, mide, julio, "1", "2");
      await reportarAB(tx, mide, agosto, "4", "4");
      expect(await valorPara(tx, x.id, "valor", deC)).toEqual({ estado: "falta" });
      expect(await propagarA(tx, AHORA, [x.id])).toEqual(sinCambios);
      expect(await valores(tx, deC)).toEqual({});
      expect(await falta(tx, deC)).toBe("dato");

      // 50 %, 100 % y 100 %: su promedio sería 83,33 %; el acumulado, 9 de 10.
      await reportarAB(tx, mide, septiembre, "4", "4");
      expect(await valorPara(tx, x.id, "valor", deC)).toEqual({ estado: "listo", valor: "90/1", mediciones: [julio, agosto, septiembre], desde: null });
      expect(await propagarA(tx, AHORA, [x.id])).toEqual({ escritas: 1, noAplica: 0, fallidas: 0 });
      expect(await valores(tx, deC)).toEqual({
        A: { valor: "90", exacto: null, por: null },
        // Cumple la meta de septiembre (90): 100 %.
        B: { valor: "100", exacto: null, por: null },
      });

      // Agosto no aplica: 5 de 6, que no cumple; su cumplimiento, contra la meta del último medido.
      await marcarNoAplica(mide, { medicionId: agosto, motivo: MOTIVO_DE_X }, { sql: tx, ahora: TARDE });
      expect(await valorPara(tx, x.id, "valor", deC)).toEqual({ estado: "listo", valor: "250/3", mediciones: [julio, agosto, septiembre], desde: null });
      expect(await propagarA(tx, TARDE, [x.id])).toEqual({ escritas: 1, noAplica: 0, fallidas: 0 });
      expect(await valores(tx, deC)).toEqual({
        A: { valor: "83.3333", exacto: "250/3", por: null },
        B: { valor: "92.5925", exacto: "2500/27", por: null },
      });
    }));

  it("un mes del componente que aún no se abrió también se espera", () =>
    revertida(sql, async (tx) => {
      const procesoId = await procesoNuevo(tx);
      const { ind: x, mide } = await componente(tx, procesoId, { inicioMedicion: "2026-07", aprobadaEn: JUNIO });
      const c = await espejo(tx, procesoId, x.id, { periodicidad: "trimestral", inicioMedicion: "2026-T3", aprobadaEn: JUNIO });
      // Los periodos de X se abrieron a mediados de septiembre: el de septiembre no está.
      await abrir(tx, new Date("2026-09-15T15:00:00Z"), x);
      await abrir(tx, AHORA, c);
      const deC = await medicionDe(tx, c.id, "2026-T3");
      await reportarAB(tx, mide, await medicionDe(tx, x.id, "2026-07"), "1", "2");
      await reportarAB(tx, mide, await medicionDe(tx, x.id, "2026-08"), "4", "4");
      expect((await tx`SELECT periodo FROM mediciones WHERE indicador_id = ${x.id} ORDER BY periodo`).map((f) => f.periodo)).toEqual(["2026-07", "2026-08"]);
      expect(await valorPara(tx, x.id, "valor", deC)).toEqual({ estado: "falta" });
      expect(await propagarA(tx, AHORA, [x.id])).toEqual(sinCambios);
    }));

  it("un cambio de fórmula a mitad del trimestre: el acumulado de la versión que rige al final, con su «desde»", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const { ind: x, mide, julio, agosto, septiembre, deC } = await escenario(tx, async (x) => {
        await versionNueva(tx, { indicadorId: x.id, usuarioId: admin.usuarioId, tipoCambio: "mayor", rigeDesde: "2026-09", aprobadaEn: AGOSTO, formula: "A / B * 1000" });
      });
      await reportarAB(tx, mide, julio, "1", "2");
      await reportarAB(tx, mide, agosto, "4", "4");
      await reportarAB(tx, mide, septiembre, "3", "4");
      expect((await fila(tx, septiembre)).resultado_exacto).toBe("750/1");
      expect(await valorPara(tx, x.id, "valor", deC)).toEqual({ estado: "listo", valor: "750/1", mediciones: [septiembre], desde: "2026-09" });
      expect(await propagarA(tx, AHORA, [x.id])).toEqual({ escritas: 1, noAplica: 0, fallidas: 0 });
      expect((await valores(tx, deC)).A).toEqual({ valor: "750", exacto: null, por: null });
    }));

  it("un cambio menor a mitad del trimestre no parte el acumulado", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const { ind: x, mide, julio, agosto, septiembre, deC } = await escenario(tx, async (x) => {
        await versionNueva(tx, { indicadorId: x.id, usuarioId: admin.usuarioId, tipoCambio: "menor", rigeDesde: "2026-09", aprobadaEn: AGOSTO });
      });
      await reportarAB(tx, mide, julio, "1", "2");
      await reportarAB(tx, mide, agosto, "4", "4");
      await reportarAB(tx, mide, septiembre, "3", "4");
      expect(await valorPara(tx, x.id, "valor", deC)).toEqual({ estado: "listo", valor: "80/1", mediciones: [julio, agosto, septiembre], desde: null });
    }));

  it("un componente que empezó a medirse a mitad del periodo del compuesto dice desde cuándo", () =>
    revertida(sql, async (tx) => {
      const ABRIL = new Date("2026-04-05T15:00:00Z");
      const ENERO = new Date("2026-01-15T15:00:00Z");
      const procesoId = await procesoNuevo(tx);
      const { ind: x, mide } = await componente(tx, procesoId, { inicioMedicion: "2026-02", aprobadaEn: ENERO });
      const c = await espejo(tx, procesoId, x.id, { periodicidad: "trimestral", inicioMedicion: "2026-T1", aprobadaEn: ENERO });
      await abrir(tx, ABRIL, x, c);
      const [febrero, marzo] = [await medicionDe(tx, x.id, "2026-02"), await medicionDe(tx, x.id, "2026-03")];
      await reportarAB(tx, mide, febrero, "1", "2", ABRIL);
      await reportarAB(tx, mide, marzo, "3", "4", ABRIL);
      expect(await valorPara(tx, x.id, "valor", await medicionDe(tx, c.id, "2026-T1"))).toEqual({
        estado: "listo",
        valor: "200/3",
        mediciones: [febrero, marzo],
        desde: "2026-02",
      });
    }));
});

describe("un componente que es compuesto", () => {
  it("da su acumulado propio: lo que él toma vale el acumulado de su componente en el tramo, no su último mes", () =>
    revertida(sql, async (tx) => {
      // X mensual con 1/2, 4/4 y 4/4; B, su espejo mensual; C, trimestral, el espejo de B. Si C tomara a X recibiría 90.
      const procesoId = await procesoNuevo(tx);
      const { ind: x, mide } = await componente(tx, procesoId, { inicioMedicion: "2026-07", aprobadaEn: JUNIO });
      const b = await espejo(tx, procesoId, x.id, { inicioMedicion: "2026-07", aprobadaEn: JUNIO });
      const c = await espejo(tx, procesoId, b.id, { periodicidad: "trimestral", inicioMedicion: "2026-T3", aprobadaEn: JUNIO });
      await abrir(tx, AHORA, x, b, c);
      const meses = ["2026-07", "2026-08", "2026-09"];
      const deX = await Promise.all(meses.map((p) => medicionDe(tx, x.id, p)));
      const deB = await Promise.all(meses.map((p) => medicionDe(tx, b.id, p)));
      const deC = await medicionDe(tx, c.id, "2026-T3");
      for (const [i, [A, B]] of [["1", "2"], ["4", "4"], ["4", "4"]].entries()) await reportarAB(tx, mide, deX[i], A, B);

      expect(await propagarA(tx, AHORA, [x.id])).toEqual({ escritas: 4, noAplica: 0, fallidas: 0 });
      expect(await valorPara(tx, b.id, "valor", deC)).toEqual({ estado: "listo", valor: "90/1", mediciones: deB, desde: null });
      expect(await valores(tx, deC)).toEqual({
        A: { valor: "90", exacto: null, por: null },
        B: { valor: "100", exacto: null, por: null },
      });
      expect(await propagarA(tx, AHORA, [x.id])).toEqual(sinCambios);
    }));

  it("en una cadena de tres niveles con periodicidades distintas (mensual, trimestral y semestral), el acumulado del de abajo llega arriba", () =>
    revertida(sql, async (tx) => {
      const ENERO = new Date("2027-01-05T15:00:00Z");
      const procesoId = await procesoNuevo(tx);
      const { ind: x, mide } = await componente(tx, procesoId, { inicioMedicion: "2026-07", aprobadaEn: JUNIO });
      const b = await espejo(tx, procesoId, x.id, { periodicidad: "trimestral", inicioMedicion: "2026-T3", aprobadaEn: JUNIO });
      const c = await espejo(tx, procesoId, b.id, { periodicidad: "semestral", inicioMedicion: "2026-S2", aprobadaEn: JUNIO });
      await abrir(tx, ENERO, x, b, c);
      for (const [mes, A, B] of [["2026-07", "1", "2"], ["2026-08", "4", "4"], ["2026-09", "4", "4"], ["2026-10", "4", "4"], ["2026-11", "4", "4"], ["2026-12", "4", "4"]]) {
        await reportarAB(tx, mide, await medicionDe(tx, x.id, mes), A, B, ENERO);
      }
      const deC = await medicionDe(tx, c.id, "2026-S2");

      expect(await propagarA(tx, ENERO, [x.id])).toEqual({ escritas: 3, noAplica: 0, fallidas: 0 });
      // Los trimestres de B: 90 y 100. El semestre de X: 21 de 22. El último trimestre de B daría 100.
      expect((await fila(tx, await medicionDe(tx, b.id, "2026-T3"))).resultado_exacto).toBe("90/1");
      expect((await fila(tx, await medicionDe(tx, b.id, "2026-T4"))).resultado_exacto).toBe("100/1");
      expect(await valores(tx, deC)).toEqual({
        A: { valor: "95.4545", exacto: "1050/11", por: null },
        B: { valor: "100", exacto: null, por: null },
      });
      expect((await fila(tx, deC)).resultado_exacto).toBe("1050/11");
    }));

  it("si lo que él toma no aplicó en el tramo, él tampoco", () =>
    revertida(sql, async (tx) => {
      const procesoId = await procesoNuevo(tx);
      const { ind: x, mide } = await componente(tx, procesoId, { inicioMedicion: "2026-07", aprobadaEn: JUNIO });
      const b = await espejo(tx, procesoId, x.id, { inicioMedicion: "2026-07", aprobadaEn: JUNIO });
      const c = await espejo(tx, procesoId, b.id, { periodicidad: "trimestral", inicioMedicion: "2026-T3", aprobadaEn: JUNIO });
      await abrir(tx, AHORA, x, b, c);
      const meses = ["2026-07", "2026-08", "2026-09"];
      for (const p of meses) await marcarNoAplica(mide, { medicionId: await medicionDe(tx, x.id, p), motivo: MOTIVO_DE_X }, { sql: tx, ahora: AHORA });
      expect(await propagarA(tx, AHORA, [x.id])).toEqual({ escritas: 0, noAplica: 4, fallidas: 0 });
      const deB = await Promise.all(meses.map((p) => medicionDe(tx, b.id, p)));
      const deC = await medicionDe(tx, c.id, "2026-T3");
      expect(await valorPara(tx, b.id, "valor", deC)).toEqual({ estado: "no_aplica", mediciones: deB });
      expect([(await fila(tx, deC)).no_aplica, (await fila(tx, deC)).no_aplica_motivo]).toEqual([true, MOTIVO_COMPONENTE_NO_APLICA]);
    }));

  it("con B medido y su componente «No aplica» en esos meses (aún sin propagar a B), B tampoco aplica, con sus mediciones", () =>
    revertida(sql, async (tx) => {
      const procesoId = await procesoNuevo(tx);
      const { ind: x, mide } = await componente(tx, procesoId, { inicioMedicion: "2026-07", aprobadaEn: JUNIO });
      const b = await espejo(tx, procesoId, x.id, { inicioMedicion: "2026-07", aprobadaEn: JUNIO });
      const c = await espejo(tx, procesoId, b.id, { periodicidad: "trimestral", inicioMedicion: "2026-T3", aprobadaEn: JUNIO });
      await abrir(tx, AHORA, x, b, c);
      const meses = ["2026-07", "2026-08", "2026-09"];
      const deX = await Promise.all(meses.map((p) => medicionDe(tx, x.id, p)));
      const deB = await Promise.all(meses.map((p) => medicionDe(tx, b.id, p)));
      for (const id of deX) await reportarAB(tx, mide, id, "4", "4");
      await propagarA(tx, AHORA, [x.id]);
      // X deja de aplicar en los tres meses y nadie propaga: B sigue medido.
      for (const id of deX) await marcarNoAplica(mide, { medicionId: id, motivo: MOTIVO_DE_X }, { sql: tx, ahora: TARDE });
      expect((await fila(tx, deB[2])).resultado_exacto).toBe("100/1");
      expect(await valorPara(tx, b.id, "valor", await medicionDe(tx, c.id, "2026-T3"))).toEqual({ estado: "no_aplica", mediciones: deB });
    }));

  it("lo que B toma se acumula solo sobre los meses que B usa: con un cambio mayor de B desde septiembre, C recibe septiembre", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const procesoId = await procesoNuevo(tx);
      const { ind: x, mide } = await componente(tx, procesoId, { inicioMedicion: "2026-07", aprobadaEn: JUNIO });
      const b = await espejo(tx, procesoId, x.id, { inicioMedicion: "2026-07", aprobadaEn: JUNIO });
      // Otra fórmula desde septiembre: la racha de B al final del trimestre es solo septiembre.
      await versionNueva(tx, {
        indicadorId: b.id,
        usuarioId: admin.usuarioId,
        tipoCambio: "mayor",
        rigeDesde: "2026-09",
        aprobadaEn: AGOSTO,
        formula: "A * 1",
        variables: { A: { indicadorOrigenId: x.id, toma: "valor" }, B: { indicadorOrigenId: x.id, toma: "cumplimiento" } },
      });
      const c = await espejo(tx, procesoId, b.id, { periodicidad: "trimestral", inicioMedicion: "2026-T3", aprobadaEn: JUNIO });
      await abrir(tx, AHORA, x, b, c);
      const deX = await Promise.all(["2026-07", "2026-08", "2026-09"].map((p) => medicionDe(tx, x.id, p)));
      for (const [i, [A, B]] of [["1", "2"], ["4", "4"], ["4", "4"]].entries()) await reportarAB(tx, mide, deX[i], A, B);
      await propagarA(tx, AHORA, [x.id]);

      const septiembreDeB = await medicionDe(tx, b.id, "2026-09");
      const deC = await medicionDe(tx, c.id, "2026-T3");
      // No el acumulado de X de julio a septiembre (90): el de septiembre, lo que B muestra para septiembre.
      expect(await valorPara(tx, b.id, "valor", deC)).toEqual({ estado: "listo", valor: "100/1", mediciones: [septiembreDeB], desde: "2026-09" });
      expect((await valores(tx, deC)).A).toEqual({ valor: "100", exacto: null, por: null });
    }));

  it("B empieza en febrero y X se mide desde enero: C no lleva enero, ni lo espera si no se reportó", () =>
    revertida(sql, async (tx) => {
      const ABRIL = new Date("2026-04-05T15:00:00Z");
      const DICIEMBRE = new Date("2025-12-15T15:00:00Z");
      const procesoId = await procesoNuevo(tx);
      const { ind: x, mide } = await componente(tx, procesoId, { inicioMedicion: "2026-01", aprobadaEn: DICIEMBRE });
      const b = await espejo(tx, procesoId, x.id, { inicioMedicion: "2026-02", aprobadaEn: DICIEMBRE });
      const c = await espejo(tx, procesoId, b.id, { periodicidad: "trimestral", inicioMedicion: "2026-T1", aprobadaEn: DICIEMBRE });
      await abrir(tx, ABRIL, x, b, c);
      const [enero, febrero, marzo] = await Promise.all(["2026-01", "2026-02", "2026-03"].map((p) => medicionDe(tx, x.id, p)));
      const deB = await Promise.all(["2026-02", "2026-03"].map((p) => medicionDe(tx, b.id, p)));
      const deC = await medicionDe(tx, c.id, "2026-T1");
      await reportarAB(tx, mide, febrero, "4", "4", ABRIL);
      await reportarAB(tx, mide, marzo, "4", "4", ABRIL);
      await propagarA(tx, ABRIL, [x.id]);
      // Enero de X sin reportar: B no lo usa, así que C no lo espera.
      expect(await valorPara(tx, b.id, "valor", deC)).toEqual({ estado: "listo", valor: "100/1", mediciones: deB, desde: "2026-02" });
      expect((await valores(tx, deC)).A).toEqual({ valor: "100", exacto: null, por: null });

      // Con enero de X en 1 de 2 (el trimestre de X sería 90), C sigue sin llevarlo.
      await reportarAB(tx, mide, enero, "1", "2", ABRIL);
      await propagarA(tx, ABRIL, [x.id]);
      expect(await valorPara(tx, b.id, "valor", deC)).toEqual({ estado: "listo", valor: "100/1", mediciones: deB, desde: "2026-02" });
      expect((await valores(tx, deC)).A).toEqual({ valor: "100", exacto: null, por: null });
    }));

  it("un mes de B que su medidor marcó «No aplica» tampoco entra en la letra tomada", () =>
    revertida(sql, async (tx) => {
      const procesoId = await procesoNuevo(tx);
      const { ind: x, mide } = await componente(tx, procesoId, { inicioMedicion: "2026-07", aprobadaEn: JUNIO });
      // B, mixto: A toma el valor de X, B la digita quien mide B; su fórmula es «A».
      const mideB = await usuarioDePrueba(tx, { rol: "consulta" });
      const b = await indicadorDePrueba(tx, {
        procesoId,
        periodicidad: "mensual",
        inicioMedicion: "2026-07",
        aprobadaEn: JUNIO,
        formula: "A",
        mide: [mideB.usuarioId],
        variables: { A: { indicadorOrigenId: x.id, toma: "valor" }, B: { nombre: "Casos evaluados" } },
      });
      const c = await espejo(tx, procesoId, b.id, { periodicidad: "trimestral", inicioMedicion: "2026-T3", aprobadaEn: JUNIO });
      await abrir(tx, AHORA, x, b, c);
      const meses = ["2026-07", "2026-08", "2026-09"];
      const deX = await Promise.all(meses.map((p) => medicionDe(tx, x.id, p)));
      const deB = await Promise.all(meses.map((p) => medicionDe(tx, b.id, p)));
      for (const [i, [A, B]] of [["1", "2"], ["4", "4"], ["4", "4"]].entries()) await reportarAB(tx, mide, deX[i], A, B);
      for (const id of deB) await reportar(mideB, { medicionId: id, valores: { B: "1" }, parcial: false, confirmado: true }, { sql: tx, ahora: AHORA });
      await marcarNoAplica(mideB, { medicionId: deB[1], motivo: "El servicio no operó en el mes" }, { sql: tx, ahora: AHORA });
      await propagarA(tx, AHORA, [x.id]);
      expect([(await fila(tx, deB[1])).no_aplica, (await fila(tx, deB[1])).no_aplica_motivo]).toEqual([true, "El servicio no operó en el mes"]);

      // X sobre julio y septiembre: 5 de 6, no sus tres meses (90).
      const deC = await medicionDe(tx, c.id, "2026-T3");
      expect(await valorPara(tx, b.id, "valor", deC)).toEqual({ estado: "listo", valor: "250/3", mediciones: deB, desde: null });
      expect((await valores(tx, deC)).A).toEqual({ valor: "83.3333", exacto: "250/3", por: null });
    }));

  it("el «desde» del componente interior gana si es el más tardío", () =>
    revertida(sql, async (tx) => {
      const ENERO = new Date("2027-01-05T15:00:00Z");
      const APROBADAS = new Date("2026-08-05T15:00:00Z");
      const procesoId = await procesoNuevo(tx);
      // Julio de X terminó antes de aprobarse su ficha: es un histórico que nadie registra.
      const { ind: x, mide } = await componente(tx, procesoId, { inicioMedicion: "2026-07", aprobadaEn: APROBADAS });
      const b = await espejo(tx, procesoId, x.id, { periodicidad: "trimestral", inicioMedicion: "2026-T3", aprobadaEn: APROBADAS });
      const c = await espejo(tx, procesoId, b.id, { periodicidad: "semestral", inicioMedicion: "2026-S2", aprobadaEn: APROBADAS });
      await abrir(tx, ENERO, x, b, c);
      expect((await fila(tx, await medicionDe(tx, x.id, "2026-07"))).historica).toBe(true);
      for (const mes of ["2026-08", "2026-09", "2026-10", "2026-11", "2026-12"]) await reportarAB(tx, mide, await medicionDe(tx, x.id, mes), "4", "4", ENERO);
      await propagarA(tx, ENERO, [x.id]);

      const deB = await Promise.all(["2026-T3", "2026-T4"].map((p) => medicionDe(tx, b.id, p)));
      // B cubre el semestre entero (su «desde» propio no se pone); X, desde agosto.
      expect(await valorPara(tx, b.id, "valor", await medicionDe(tx, c.id, "2026-S2"))).toEqual({ estado: "listo", valor: "100/1", mediciones: deB, desde: "2026-08" });
    }));
});

describe("históricos del componente", () => {
  it("los que nadie registró se saltan y el valor dice desde cuándo; uno registrado entra", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const ABRIL = new Date("2026-04-05T15:00:00Z");
      const procesoId = await procesoNuevo(tx);
      // Enero y febrero terminaron antes de aprobarse la ficha de X: son históricos.
      const { ind: x, mide } = await componente(tx, procesoId, { inicioMedicion: "2026-01", aprobadaEn: new Date("2026-03-10T15:00:00Z") });
      const c = await espejo(tx, procesoId, x.id, { periodicidad: "trimestral", inicioMedicion: "2026-T1", aprobadaEn: new Date("2026-03-15T15:00:00Z") });
      await abrir(tx, ABRIL, x, c);
      const [enero, marzo, deC] = [await medicionDe(tx, x.id, "2026-01"), await medicionDe(tx, x.id, "2026-03"), await medicionDe(tx, c.id, "2026-T1")];
      expect([(await fila(tx, enero)).historica, (await fila(tx, marzo)).historica, (await fila(tx, deC)).historica]).toEqual([true, false, false]);

      await reportarAB(tx, mide, marzo, "3", "4", ABRIL);
      expect(await valorPara(tx, x.id, "valor", deC)).toEqual({ estado: "listo", valor: "75/1", mediciones: [marzo], desde: "2026-03" });
      expect(await propagarA(tx, ABRIL, [x.id])).toEqual({ escritas: 1, noAplica: 0, fallidas: 0 });
      expect((await valores(tx, deC)).A).toMatchObject({ valor: "75" });

      await registrarHistoricos(admin, { indicadorId: x.id, filas: [{ periodo: "2026-01", valores: { A: "1", B: "4" } }] }, { sql: tx, ahora: ABRIL });
      expect(await valorPara(tx, x.id, "valor", deC)).toEqual({ estado: "listo", valor: "50/1", mediciones: [enero, marzo], desde: null });
      expect(await propagarA(tx, ABRIL, [x.id])).toEqual({ escritas: 1, noAplica: 0, fallidas: 0 });
      expect((await valores(tx, deC)).A).toMatchObject({ valor: "50" });
    }));
});

describe("el contagio del «No aplica»", () => {
  it("los tres meses de X «No aplica»: el compuesto queda «No aplica» con el motivo del sistema y el id de X; al aplicar X, se desmarca y se calcula", () =>
    revertida(sql, async (tx) => {
      const procesoId = await procesoNuevo(tx);
      const { ind: x, mide } = await componente(tx, procesoId, { inicioMedicion: "2026-07", aprobadaEn: JUNIO });
      const c = await espejo(tx, procesoId, x.id, { periodicidad: "trimestral", inicioMedicion: "2026-T3", aprobadaEn: JUNIO });
      await abrir(tx, AHORA, x, c);
      const meses = [await medicionDe(tx, x.id, "2026-07"), await medicionDe(tx, x.id, "2026-08"), await medicionDe(tx, x.id, "2026-09")];
      const deC = await medicionDe(tx, c.id, "2026-T3");
      for (const id of meses) await marcarNoAplica(mide, { medicionId: id, motivo: MOTIVO_DE_X }, { sql: tx, ahora: AHORA });
      // Con las mediciones que lo deciden: las entradas del cierre (Tarea 16).
      expect(await valorPara(tx, x.id, "valor", deC)).toEqual({ estado: "no_aplica", mediciones: meses });

      expect(await propagarA(tx, AHORA, [x.id])).toEqual({ escritas: 0, noAplica: 1, fallidas: 0 });
      let m = await fila(tx, deC);
      expect([m.no_aplica, m.no_aplica_motivo, m.reportada_en, m.reportada_por, m.estado, m.resultado_exacto]).toEqual([
        true,
        MOTIVO_COMPONENTE_NO_APLICA,
        AHORA,
        null,
        "reportada",
        null,
      ]);
      const marcado = (await eventos(tx, deC)).at(-1)!;
      expect(marcado).toMatchObject({ tipo: "propagacion", usuarioId: null, detalle: { componente: x.id } });
      expect(marcado.detalle.despues).toMatchObject({ noAplica: true, motivo: MOTIVO_COMPONENTE_NO_APLICA });
      // Ni el código ni el nombre del componente.
      const nombreDeX = (await tx`SELECT nombre FROM indicador_versiones WHERE id = ${x.versionId}`)[0].nombre as string;
      expect(JSON.stringify(marcado.detalle)).not.toContain(x.codigo);
      expect(JSON.stringify(marcado.detalle)).not.toContain(nombreDeX);
      expect(await propagarA(tx, AHORA, [x.id])).toEqual(sinCambios);

      // Septiembre vuelve a aplicar, aún sin dato: el compuesto se desmarca y espera.
      await quitarNoAplica(mide, meses[2], { sql: tx, ahora: TARDE });
      expect(await propagarA(tx, TARDE, [x.id])).toEqual({ escritas: 1, noAplica: 0, fallidas: 0 });
      m = await fila(tx, deC);
      expect([m.no_aplica, m.no_aplica_motivo, m.reportada_en, m.estado]).toEqual([false, null, null, "abierta"]);
      expect(await falta(tx, deC)).toBe("dato");

      // Con septiembre medido, el acumulado es el de septiembre: julio y agosto se saltan.
      await reportarAB(tx, mide, meses[2], "3", "4", DESPUES);
      expect(await propagarA(tx, DESPUES, [x.id])).toEqual({ escritas: 1, noAplica: 0, fallidas: 0 });
      m = await fila(tx, deC);
      expect([m.no_aplica, m.resultado_exacto, m.reportada_en]).toEqual([false, "75/1", DESPUES]);
      expect(await valores(tx, deC)).toEqual({
        A: { valor: "75", exacto: null, por: null },
        B: { valor: "83.3333", exacto: "250/3", por: null },
      });
    }));

  /** X mensual desde septiembre y un mixto mensual: A toma el valor de X y B la digita quien mide el compuesto. */
  async function mixto(tx: TransactionSql) {
    const procesoId = await procesoNuevo(tx);
    const x = await componente(tx, procesoId);
    const mideC = await usuarioDePrueba(tx, { rol: "consulta" });
    const c = await indicadorDePrueba(tx, {
      procesoId,
      periodicidad: "mensual",
      inicioMedicion: "2026-09",
      aprobadaEn: AGOSTO,
      mide: [mideC.usuarioId],
      variables: { A: { indicadorOrigenId: x.ind.id, toma: "valor" }, B: { nombre: "Casos evaluados" } },
    });
    await abrir(tx, AHORA, x.ind, c);
    return { ...x, mideC, c, deX: await medicionDe(tx, x.ind.id, "2026-09"), deC: await medicionDe(tx, c.id, "2026-09") };
  }

  it("el «No aplica» que puso quien mide el compuesto no se quita", () =>
    revertida(sql, async (tx) => {
      const { ind: x, mide, mideC, deX, deC } = await mixto(tx);
      const MOTIVO = "El servicio no operó en el mes";
      await marcarNoAplica(mideC, { medicionId: deC, motivo: MOTIVO }, { sql: tx, ahora: AHORA });
      const marca = async () => {
        const m = await fila(tx, deC);
        return [m.no_aplica, m.no_aplica_motivo, m.reportada_por];
      };
      const sigue = [true, MOTIVO, mideC.usuarioId];

      await marcarNoAplica(mide, { medicionId: deX, motivo: MOTIVO_DE_X }, { sql: tx, ahora: AHORA });
      expect(await propagarA(tx, AHORA, [x.id])).toEqual(sinCambios);
      expect(await marca()).toEqual(sigue);

      await quitarNoAplica(mide, deX, { sql: tx, ahora: TARDE });
      await reportarAB(tx, mide, deX, "60", "100", TARDE);
      expect(await propagarA(tx, TARDE, [x.id])).toEqual({ escritas: 1, noAplica: 0, fallidas: 0 });
      expect(await marca()).toEqual(sigue);
      expect((await valores(tx, deC)).A).toEqual({ valor: "60", exacto: null, por: null });
    }));

  it("en un mixto sin reportar, el contagio lo da por reportado y, al quitarse, se lo devuelve a quien mide", () =>
    revertida(sql, async (tx) => {
      const { ind: x, mide, mideC, deX, deC } = await mixto(tx);
      await marcarNoAplica(mide, { medicionId: deX, motivo: MOTIVO_DE_X }, { sql: tx, ahora: AHORA });
      expect(await propagarA(tx, AHORA, [x.id])).toEqual({ escritas: 0, noAplica: 1, fallidas: 0 });
      let m = await fila(tx, deC);
      expect([m.no_aplica, m.no_aplica_motivo, m.reportada_en, m.reportada_por]).toEqual([true, MOTIVO_COMPONENTE_NO_APLICA, AHORA, null]);
      expect((await tareasDeIndicadores(mideC, { sql: tx, ahora: AHORA })).tareas.map((t) => t.id)).not.toContain(`medir:${deC}`);

      await quitarNoAplica(mide, deX, { sql: tx, ahora: TARDE });
      expect(await propagarA(tx, TARDE, [x.id])).toEqual({ escritas: 1, noAplica: 0, fallidas: 0 });
      m = await fila(tx, deC);
      expect([m.no_aplica, m.no_aplica_motivo, m.reportada_en, m.reportada_por]).toEqual([false, null, null, null]);
      expect(await falta(tx, deC)).toBe("reporte");
      expect((await tareasDeIndicadores(mideC, { sql: tx, ahora: TARDE })).tareas.map((t) => t.id)).toContain(`medir:${deC}`);

      // Su reporte es el primero: cuenta para «Reportes a tiempo».
      expect(await reportar(mideC, { medicionId: deC, valores: { B: "100" }, parcial: false, confirmado: true }, { sql: tx, ahora: TARDE })).toMatchObject({
        ok: true,
        faltaDato: true,
      });
      expect((await eventos(tx, deC)).at(-1)!.tipo).toBe("reporte");
    }));

  it("al quitarse el contagio con la fecha límite ya pasada, el reporte de quien mide se cuenta desde hoy: la pasada no lo avisa vencido ni lo escala", () =>
    revertida(sql, async (tx) => {
      await silenciarIndicadores(tx);
      const { ind: x, mide, deX, deC } = await mixto(tx);
      await marcarNoAplica(mide, { medicionId: deX, motivo: MOTIVO_DE_X }, { sql: tx, ahora: AHORA });
      await propagarA(tx, AHORA, [x.id]);
      const vencia = (await fila(tx, deC)).vence_en as Date;
      expect(vencia.getTime()).toBeLessThan(TARDE.getTime());

      await quitarNoAplica(mide, deX, { sql: tx, ahora: TARDE });
      expect(await propagarA(tx, TARDE, [x.id])).toEqual({ escritas: 1, noAplica: 0, fallidas: 0 });
      const movida = fechaLimite(TARDE, 10, ZONA);
      expect((await fila(tx, deC)).vence_en).toEqual(movida);
      expect((await eventos(tx, deC)).at(-1)!.detalle.venceEn).toBe(movida.toISOString());

      await revisarVencimientosDeIndicadores({ sql: tx, ahora: TARDE, config });
      const m = await fila(tx, deC);
      expect([m.aviso_vencido_en, m.escalado_en]).toEqual([null, null]);
      const avisos = await tx`SELECT tipo FROM notificaciones WHERE entidad = 'medicion' AND entidad_id = ${deC}`;
      expect(avisos.map((a) => a.tipo)).not.toContain("indicadores.vencido");
    }));

  it("si el contagio llegó después de la fecha límite, al quitarse no mueve la fecha ni borra los avisos: quien mide ya debía su reporte", () =>
    revertida(sql, async (tx) => {
      await silenciarIndicadores(tx);
      const { ind: x, mide, deX, deC } = await mixto(tx);
      const vencia = (await fila(tx, deC)).vence_en as Date;
      // Quien mide el compuesto no reportó: la pasada lo avisa vencido.
      await revisarVencimientosDeIndicadores({ sql: tx, ahora: new Date("2026-10-16T15:00:00Z"), config });
      const avisado = await fila(tx, deC);
      expect(avisado.aviso_vencido_en).not.toBeNull();

      // El contagio llega tarde y después se quita.
      await marcarNoAplica(mide, { medicionId: deX, motivo: MOTIVO_DE_X }, { sql: tx, ahora: TARDE });
      expect(await propagarA(tx, TARDE, [x.id])).toEqual({ escritas: 0, noAplica: 1, fallidas: 0 });
      await quitarNoAplica(mide, deX, { sql: tx, ahora: DESPUES });
      expect(await propagarA(tx, DESPUES, [x.id])).toEqual({ escritas: 1, noAplica: 0, fallidas: 0 });

      const m = await fila(tx, deC);
      expect([m.no_aplica, m.reportada_en]).toEqual([false, null]);
      expect([m.vence_en, m.aviso_vencido_en, m.escalado_en]).toEqual([vencia, avisado.aviso_vencido_en, avisado.escalado_en]);
      expect((await eventos(tx, deC)).at(-1)!.detalle).not.toHaveProperty("venceEn");
    }));

  it("una persona no quita el «No aplica» que puso el contagio", () =>
    revertida(sql, async (tx) => {
      const { ind: x, mide, mideC, deX, deC } = await mixto(tx);
      await marcarNoAplica(mide, { medicionId: deX, motivo: MOTIVO_DE_X }, { sql: tx, ahora: AHORA });
      await propagarA(tx, AHORA, [x.id]);
      const err = await quitarNoAplica(mideC, deC, { sql: tx, ahora: TARDE }).then(
        () => null,
        (e: unknown) => e,
      );
      expect((err as Error | null)?.message).toBe(NO_APLICA_DEL_SISTEMA);
      expect(NO_APLICA_DEL_SISTEMA).toBe("Este «No aplica» lo puso el sistema: se quita solo cuando cambie el dato");
      const m = await fila(tx, deC);
      expect([m.no_aplica, m.no_aplica_motivo, m.reportada_en]).toEqual([true, MOTIVO_COMPONENTE_NO_APLICA, AHORA]);
    }));
});

describe("«Reportes a tiempo» ante el contagio", () => {
  const OCTUBRE = periodoDe("2026-10", ZONA)!;
  /** «Reportes a tiempo» del proceso para las mediciones que vencen en octubre (septiembre vence el 10). */
  const reportesDeOctubre = (tx: TransactionSql, procesoId: number) =>
    tomarCalculo(tx, {
      clave: "reportes_a_tiempo",
      alcance: "proceso",
      procesoId,
      indicadorId: 0,
      periodo: { clave: OCTUBRE.clave, desde: OCTUBRE.desde, hasta: OCTUBRE.hasta },
      ahora: DESPUES,
    });

  async function mixtoEnSuProceso(tx: TransactionSql) {
    const procesoId = await procesoNuevo(tx);
    const x = await componente(tx, procesoId);
    const mideC = await usuarioDePrueba(tx, { rol: "consulta" });
    const c = await indicadorDePrueba(tx, {
      procesoId,
      periodicidad: "mensual",
      inicioMedicion: "2026-09",
      aprobadaEn: AGOSTO,
      mide: [mideC.usuarioId],
      variables: { A: { indicadorOrigenId: x.ind.id, toma: "valor" }, B: { nombre: "Casos evaluados" } },
    });
    await abrir(tx, AHORA, x.ind, c);
    return { procesoId, ...x, deX: await medicionDe(tx, x.ind.id, "2026-09") };
  }

  it("un mixto que el contagio marcó antes de su fecha límite no cuenta: quien mide no debía nada", () =>
    revertida(sql, async (tx) => {
      const { procesoId, ind: x, mide, deX } = await mixtoEnSuProceso(tx);
      // X lo marca a tiempo quien lo mide: cuenta, a tiempo.
      await marcarNoAplica(mide, { medicionId: deX, motivo: MOTIVO_DE_X }, { sql: tx, ahora: AHORA });
      await propagarA(tx, AHORA, [x.id]);
      expect(await reportesDeOctubre(tx, procesoId)).toEqual({ A: "1", B: "1" });
    }));

  it("si el contagio llegó después de la fecha límite, sigue contando como tarde", () =>
    revertida(sql, async (tx) => {
      const { procesoId, ind: x, mide, deX } = await mixtoEnSuProceso(tx);
      // X se marca tarde: cuenta tarde; el compuesto, que ya debía su reporte, también.
      await marcarNoAplica(mide, { medicionId: deX, motivo: MOTIVO_DE_X }, { sql: tx, ahora: TARDE });
      await propagarA(tx, TARDE, [x.id]);
      expect(await reportesDeOctubre(tx, procesoId)).toEqual({ A: "0", B: "2" });
    }));
});

describe("niveles", () => {
  /** A lo mide una persona; B es el espejo de A y C el de B. */
  async function cadena(tx: TransactionSql) {
    const procesoId = await procesoNuevo(tx);
    const { ind: a, mide } = await componente(tx, procesoId);
    const b = await espejo(tx, procesoId, a.id);
    const c = await espejo(tx, procesoId, b.id);
    await abrir(tx, AHORA, a, b, c);
    const de = (i: IndicadorDePrueba) => medicionDe(tx, i.id, "2026-09");
    const medidas = { deA: await de(a), deB: await de(b), deC: await de(c) };
    await reportarAB(tx, mide, medidas.deA, "60", "100");
    return { a, b, c, ...medidas };
  }

  async function alDia(tx: TransactionSql, m: { deB: number; deC: number }) {
    expect((await fila(tx, m.deB)).resultado_exacto).toBe("60/1");
    expect(await valores(tx, m.deC)).toEqual({
      A: { valor: "60", exacto: null, por: null },
      B: { valor: "66.6666", exacto: "200/3", por: null },
    });
    expect((await fila(tx, m.deC)).resultado_exacto).toBe("60/1");
  }

  it("C toma B y B toma A: un solo propagar tras reportar A deja al día a B y a C", () =>
    revertida(sql, async (tx) => {
      await silenciarIndicadores(tx);
      const m = await cadena(tx);
      expect(await propagarA(tx, AHORA)).toEqual({ escritas: 2, noAplica: 0, fallidas: 0 });
      await alDia(tx, m);
      expect(await propagarA(tx, AHORA)).toEqual(sinCambios);
    }));

  it("con `indicadorIds: [A]`, también: trabaja A y los que dependen de él", () =>
    revertida(sql, async (tx) => {
      const m = await cadena(tx);
      expect(await propagarA(tx, AHORA, [m.a.id])).toEqual({ escritas: 2, noAplica: 0, fallidas: 0 });
      await alDia(tx, m);
    }));

  it("en un diamante (D toma A y toma B, que toma A), D queda al día en una sola llamada aunque su id sea menor que el de B", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const procesoId = await procesoNuevo(tx);
      const { ind: a, mide } = await componente(tx, procesoId);
      // D nace antes que B (en borrador) y después se le da B como componente.
      const d = await indicadorDePrueba(tx, {
        procesoId,
        estado: "borrador",
        periodicidad: "mensual",
        inicioMedicion: "2026-09",
        formula: "A + B",
        variables: { A: { indicadorOrigenId: a.id, toma: "valor" }, B: { nombre: "Por asignar" } },
      });
      const b = await espejo(tx, procesoId, a.id);
      expect(d.id).toBeLessThan(b.id);
      const [deB] = await tx`SELECT i.codigo, v.nombre FROM indicadores i JOIN indicador_versiones v ON v.indicador_id = i.id WHERE i.id = ${b.id}`;
      await tx`SELECT id FROM indicador_versiones WHERE id = ${d.versionId} FOR UPDATE`;
      await tx`UPDATE indicador_variables SET origen = 'indicador', indicador_origen_id = ${b.id}, toma = 'valor', consolidacion = 'ultimo',
          origen_codigo = ${deB.codigo as string}, origen_nombre = ${deB.nombre as string}
        WHERE id = ${d.variables.B}`;
      const aprobadora = await usuarioDePrueba(tx, { rol: "gerencia" });
      await tx`UPDATE indicador_versiones SET estado = 'aprobada', elaborada_por = ${admin.usuarioId}, elaborada_en = ${AGOSTO},
          huella = ${"0".repeat(64)}, rige_desde = '2026-09', aprobada_por = ${aprobadora.usuarioId}, aprobada_en = ${AGOSTO}
        WHERE id = ${d.versionId}`;
      await tx`UPDATE indicadores SET estado = 'activo' WHERE id = ${d.id}`;
      await abrir(tx, AHORA, a, b, d);
      const deA = await medicionDe(tx, a.id, "2026-09");
      const deD = await medicionDe(tx, d.id, "2026-09");
      await reportarAB(tx, mide, deA, "60", "100");

      expect(await propagarA(tx, AHORA, [a.id])).toEqual({ escritas: 2, noAplica: 0, fallidas: 0 });
      expect(await valores(tx, deD)).toEqual({
        A: { valor: "60", exacto: null, por: null },
        B: { valor: "60", exacto: null, por: null },
      });
      expect((await fila(tx, deD)).resultado_exacto).toBe("120/1");
      expect(await propagarA(tx, AHORA, [a.id])).toEqual(sinCambios);
    }));
});

describe("un compuesto mixto", () => {
  it("con lo propio reportado y el componente sin resultado está en «Falta un dato», sin tarea para quien mide; al llegar el componente, se calcula", () =>
    revertida(sql, async (tx) => {
      const procesoId = await procesoNuevo(tx);
      const { ind: x, mide } = await componente(tx, procesoId);
      const mideC = await usuarioDePrueba(tx, { rol: "consulta" });
      const c = await indicadorDePrueba(tx, {
        procesoId,
        periodicidad: "mensual",
        inicioMedicion: "2026-09",
        aprobadaEn: AGOSTO,
        mide: [mideC.usuarioId],
        variables: { A: { indicadorOrigenId: x.id, toma: "valor" }, B: { nombre: "Casos evaluados" } },
      });
      await abrir(tx, AHORA, x, c);
      const deX = await medicionDe(tx, x.id, "2026-09");
      const deC = await medicionDe(tx, c.id, "2026-09");
      expect(await reportar(mideC, { medicionId: deC, valores: { B: "100" }, parcial: false, confirmado: true }, { sql: tx, ahora: AHORA })).toMatchObject({
        ok: true,
        faltaDato: true,
      });
      expect(await falta(tx, deC)).toBe("dato");
      expect((await tareasDeIndicadores(mideC, { sql: tx, ahora: AHORA })).tareas.map((t) => t.id)).not.toContain(`medir:${deC}`);

      await reportarAB(tx, mide, deX, "60", "100");
      expect(await propagarA(tx, AHORA, [x.id])).toEqual({ escritas: 1, noAplica: 0, fallidas: 0 });
      const m = await fila(tx, deC);
      expect([m.resultado_exacto, m.semaforo, m.reportada_por]).toEqual(["60/1", "critico", mideC.usuarioId]);
      expect((await valores(tx, deC)).A).toEqual({ valor: "60", exacto: null, por: null });
      expect(await falta(tx, deC)).toBe("analisis");
    }));
});

describe("al abrir la medición del compuesto en un camino de lectura", () => {
  it("toma lo que el componente ya tiene: X tenía resultado cuando la medición del compuesto aún no existía", () =>
    revertida(sql, async (tx) => {
      const procesoId = await procesoNuevo(tx);
      const { ind: x, mide } = await componente(tx, procesoId);
      const c = await espejo(tx, procesoId, x.id);
      await abrir(tx, AHORA, x);
      await reportarAB(tx, mide, await medicionDe(tx, x.id, "2026-09"), "60", "100");
      await propagarA(tx, AHORA, [x.id]);
      expect((await tx`SELECT id FROM mediciones WHERE indicador_id = ${c.id}`).length).toBe(0);

      expect(await asegurarMedicionesConFuentes({ sql: tx, ahora: AHORA, indicadorId: c.id })).toBe(1);
      const deC = await medicionDe(tx, c.id, "2026-09");
      expect(await valores(tx, deC)).toEqual({
        A: { valor: "60", exacto: null, por: null },
        B: { valor: "66.6666", exacto: "200/3", por: null },
      });
      const m = await fila(tx, deC);
      expect([m.reportada_en, m.reportada_por, m.resultado_exacto]).toEqual([AHORA, null, "60/1"]);
    }));
});

describe("un automático como componente", () => {
  it("al tomarse su foto y correr la pasada, el compuesto queda al día; como llega después de su plazo, el del análisis se cuenta desde hoy", () =>
    revertida(sql, async (tx) => {
      await silenciarIndicadores(tx);
      const procesoId = await procesoNuevo(tx);
      // Un cálculo de flujo: su foto se toma al vencer su plazo de reporte, que es el del compuesto.
      const x = await indicadorDePrueba(tx, {
        procesoId,
        periodicidad: "mensual",
        inicioMedicion: "2026-09",
        aprobadaEn: AGOSTO,
        calculo: { clave: "reportes_a_tiempo", alcance: "proceso" },
      });
      const c = await espejo(tx, procesoId, x.id);
      await abrir(tx, AHORA, x, c);
      const deX = await medicionDe(tx, x.id, "2026-09");
      const deC = await medicionDe(tx, c.id, "2026-09");
      const vencia = (await fila(tx, deC)).vence_en as Date;
      expect(vencia.getTime()).toBeLessThan(TARDE.getTime());

      await fotoDePrueba(tx, deX, { A: "3", B: "4" }, TARDE);
      await revisarVencimientosDeIndicadores({ sql: tx, ahora: TARDE, config });
      expect(await valores(tx, deC)).toEqual({
        A: { valor: "75", exacto: null, por: null },
        B: { valor: "83.3333", exacto: "250/3", por: null },
      });
      const m = await fila(tx, deC);
      expect([m.resultado_exacto, m.semaforo]).toEqual(["75/1", "atencion"]);
      // Pide el análisis y su fecha ya había pasado: se cuenta otra vez desde la llegada del valor.
      const movida = fechaLimite(TARDE, 10, ZONA);
      expect(m.vence_en).toEqual(movida);
      expect((await eventos(tx, deC)).at(-1)!.detalle.venceEn).toBe(movida.toISOString());
    }));
});

describe("el historial", () => {
  const evento = (id: number, tipo: "reapertura" | "propagacion", detalle: Record<string, unknown>) => ({
    id,
    tipo,
    quien: null,
    creadoEn: new Date("2026-10-20T15:00:00Z"),
    detalle,
  });
  const nombres = { A: "Casos que cumplen", B: "Casos evaluados" };
  const unidad = { sufijo: " %", decimales: 1 };

  it("el contagio se lee «El sistema marcó «No aplica»», con su motivo; al quitarlo, «El sistema quitó «No aplica»»", () => {
    const [, marco, quito] = historialDeCorreccion(
      [
        evento(1, "reapertura", { justificacion: "Se corrige el componente" }),
        evento(2, "propagacion", {
          fuentes: [],
          componente: 9,
          antes: { A: null, B: null, noAplica: false, motivo: null },
          despues: { A: null, B: null, noAplica: true, motivo: MOTIVO_COMPONENTE_NO_APLICA },
        }),
        evento(3, "propagacion", {
          fuentes: [{ letra: "A", clase: "indicador", id: 9, antes: null, despues: "75" }],
          antes: { A: null, B: null, noAplica: true, motivo: MOTIVO_COMPONENTE_NO_APLICA },
          despues: { A: "75", B: null, noAplica: false, motivo: null },
        }),
      ],
      { unidad, nombres, conSoportes: false },
    );
    expect(marco.que).toBe("El sistema marcó «No aplica»");
    expect(marco.quien).toBe("El sistema");
    expect(marco.cambios).toContain(`Motivo: — → ${MOTIVO_COMPONENTE_NO_APLICA}`);
    expect(quito.que).toBe("El sistema quitó «No aplica»");
    expect(quito.cambios).toContain("Casos que cumplen: — → 75");
  });

  it("un componente que cambia se lee por el nombre de la variable", () => {
    const [, entrada] = historialDeCorreccion(
      [
        evento(1, "reapertura", { justificacion: "Se corrige el componente" }),
        evento(2, "propagacion", {
          fuentes: [{ letra: "B", clase: "indicador", id: 9, antes: "66.6666", despues: "75" }],
          antes: { A: "60", B: "66.6666" },
          despues: { A: "60", B: "75" },
        }),
      ],
      { unidad, nombres, conSoportes: false },
    );
    expect(entrada.que).toBe("El sistema actualizó «Casos evaluados»: de 66,6666 a 75");
  });
});
