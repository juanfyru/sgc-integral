/**
 * La respuesta al ente desde el plan (Fase 15B, Tarea 5; anexo §3.8): un plan de «Ente de control» con H1 y H2 «En ejecución»
 * (listos: esperan respuesta), H3 «En revisión» (le falta aprobar su plan de acción), H4 cerrado con corrección y H5 de origen
 * interno. Lo que lee la página (`respuestaDelPlan`), el acto (`registrarRespuestaDelPlan`: todo o nada, y se confirma lo que se
 * vio, Review Focus 4), la respuesta de la 15A sobre un hallazgo que está en un plan y lo que lee la página del hallazgo. Contra
 * la BD de trabajo, dentro de una transacción que se revierte. Las vigencias son lejanas (2099): ningún plan confirmado la usa.
 */
import { existsSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import type { TransactionSql } from "postgres";
import { obtenerSql } from "@/db/cliente";
import { aprobarPlan, firmarRevision } from "@/db/consultas/mejoramiento/aprobacion";
import { ponerEnPlan, sacarDelPlan } from "@/db/consultas/mejoramiento/clasificacion";
import { leerHallazgo } from "@/db/consultas/mejoramiento/lectura";
import { leerPlan } from "@/db/consultas/mejoramiento/planes-lectura";
import { validarCorreccion } from "@/db/consultas/mejoramiento/recorrido";
import { anularHallazgo, registrarRespuestaAlEnte } from "@/db/consultas/mejoramiento/registro";
import {
  esperaRespuesta,
  planQueResponde,
  registrarRespuestaDelPlan,
  respuestaDelPlan,
} from "@/db/consultas/mejoramiento/respuesta-plan";
import { LISTOS_CAMBIARON, OFICIO_AJENO_AL_PLAN, OFICIO_DE_OTRA, RESPONDA_DESDE_EL_PLAN, SIN_LISTOS } from "@/lib/mejoramiento/planes";
import { ErrorPermiso } from "@/lib/permisos";
import {
  archivoDelPlan,
  baseDeMejora,
  c,
  evidenciaDelHallazgo,
  HORA_DE_ESCENA,
  hallazgoEn,
  planDeMejoraDePrueba,
  type BaseDeMejora,
} from "./utiles/mejoramiento";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();
afterAll(() => sql.end());

// Miércoles 18 de noviembre de 2026, 10:00 en Bogotá. `hallazgoEn` aprueba los planes de acción el 17 (`HORA_DE_ESCENA`).
const AHORA = "2026-11-18T15:00:00Z";
const o = (tx: TransactionSql) => c(AHORA, tx);
const ENTE = { origen: "ente_control" as const, fuente: "Superintendencia Nacional de Salud" };

/**
 * El plan de la escena. H2 se aprueba el 18 a las 9:00 (Gerencia, con recursos): es el plan de acción aprobado más reciente de
 * los listos, así que la respuesta no se envió antes del 18.
 */
async function escena(tx: TransactionSql) {
  const b = await baseDeMejora(tx);
  const plan = await planDeMejoraDePrueba(tx, b.control, {
    nombre: "Visita de la Superintendencia Nacional de Salud",
    origen: "ente_control",
    fechaLimiteEnte: "2026-12-30",
  });
  const h1 = await hallazgoEn(tx, b, "en_ejecucion", { ...ENTE, fechaLimiteEnte: "2026-12-30" });
  const h2 = await hallazgoEn(tx, b, "en_aprobacion", { ...ENTE, fechaLimiteEnte: "2026-12-20" });
  await aprobarPlan(b.gerencia, { hallazgoId: h2.id, credenciales: { clave: "ok" } }, c("2026-11-18T14:00:00Z", tx));
  const h3 = await hallazgoEn(tx, b, "en_revision", { ...ENTE, fechaLimiteEnte: "2026-12-10" });
  // Cerrado con corrección: Control Interno valida la corrección del líder (el Admin SGC decidió que no requería acción). Una no
  // conformidad externa exige acción (`accionObligada`): esta es interna, como H5.
  const h4 = await hallazgoEn(tx, b, "por_validar");
  await validarCorreccion(b.control, { hallazgoId: h4.id }, c(HORA_DE_ESCENA, tx));
  const h5 = await hallazgoEn(tx, b, "en_ejecucion");
  await ponerEnPlan(b.control, { planId: plan.id, hallazgoIds: [h1.id, h2.id, h3.id, h4.id, h5.id] }, o(tx));
  return { b, plan, h1, h2, h3, h4, h5 };
}

/** H3 sale de la revisión y Gerencia aprueba su plan (un externo lo aprueba siempre Gerencia): pasa a estar listo. */
async function aprobarH3(tx: TransactionSql, b: BaseDeMejora, id: number, ahora = AHORA): Promise<void> {
  await firmarRevision(b.admin, { hallazgoId: id, requiereRecursos: false, notaRecursos: null, credenciales: { clave: "ok" } }, c(ahora, tx));
  await aprobarPlan(b.gerencia, { hallazgoId: id, credenciales: { clave: "ok" } }, c(ahora, tx));
}

const respuestaDe = (tx: TransactionSql, id: number) =>
  tx`SELECT to_char(respuesta_ente_en, 'YYYY-MM-DD') AS en, respuesta_ente_por AS por FROM mejora_hallazgos WHERE id = ${id}`.then((f) => f[0]);

/** Lo que el acto escribe: si algo de esto aparece, se escribió. */
async function loEscrito(tx: TransactionSql, planId: number, ids: number[]) {
  const [f] = await tx`SELECT
      (SELECT count(*)::int FROM mejora_plan_respuestas WHERE plan_id = ${planId}) AS respuestas,
      (SELECT count(*)::int FROM mejora_plan_eventos WHERE plan_id = ${planId} AND tipo = 'respuesta') AS eventos_del_plan,
      (SELECT count(*)::int FROM mejora_eventos WHERE hallazgo_id = ANY(${tx.array(ids)}::bigint[]) AND tipo = 'respuesta_ente') AS eventos,
      (SELECT count(*)::int FROM mejora_hallazgos WHERE id = ANY(${tx.array(ids)}::bigint[]) AND respuesta_ente_en IS NOT NULL) AS respondidos`;
  return f;
}

const NADA = { respuestas: 0, eventos_del_plan: 0, eventos: 0, respondidos: 0 };

/**
 * Las sentencias, con sus valores, de un camino del dominio que abre su propia transacción (`enTransaccion` sobre la del test es
 * un savepoint): para ver en qué orden toma sus candados. Registra también los fragmentos que arma; los candados no son fragmentos.
 */
function conSentencias(tx: TransactionSql): { sql: TransactionSql; sentencias: Array<{ texto: string; valores: unknown[] }> } {
  const sentencias: Array<{ texto: string; valores: unknown[] }> = [];
  const contar = (sp: TransactionSql) =>
    new Proxy(sp, {
      apply(objetivo, propio, argumentos: unknown[]) {
        const plantilla = argumentos[0];
        if (Array.isArray(plantilla) && "raw" in plantilla) sentencias.push({ texto: (plantilla as string[]).join("?"), valores: argumentos.slice(1) });
        return Reflect.apply(objetivo, propio, argumentos);
      },
    });
  const envoltura = new Proxy(tx, {
    get(objetivo, clave, propio) {
      if (clave !== "savepoint") return Reflect.get(objetivo, clave, propio);
      return (fn: (sp: TransactionSql) => Promise<unknown>) => objetivo.savepoint((sp) => fn(contar(sp)));
    },
  });
  return { sql: envoltura, sentencias };
}

describe("lo que lee la página del plan (respuestaDelPlan)", () => {
  it("listos H1 y H2, falta H3 con su estado; vence la menor fecha del ente de los listos; los oficios, los archivos del plan", () =>
    revertida(sql, async (tx) => {
      const { b, plan, h1, h2, h3 } = await escena(tx);
      const leida = await respuestaDelPlan(b.admin, plan.id, { sql: tx, ahora: new Date(AHORA) });
      expect(leida).toEqual({
        listos: [
          { id: h1.id, codigo: h1.codigo, fechaLimiteEnte: "2026-12-30" },
          { id: h2.id, codigo: h2.codigo, fechaLimiteEnte: "2026-12-20" },
        ],
        faltan: [{ id: h3.id, codigo: h3.codigo, estado: "En revisión" }],
        respuestas: [],
        vence: "2026-12-20",
        desde: "2026-11-18",
        oficios: [],
      });
      const oficio = await archivoDelPlan(tx, plan.id, b.admin.usuarioId, { nombre: "Oficio de respuesta.pdf" });
      expect((await respuestaDelPlan(b.gerencia, plan.id, { sql: tx }))?.oficios).toEqual([{ id: oficio, nombre: "Oficio de respuesta.pdf" }]);
      expect(await respuestaDelPlan(b.control, plan.id, { sql: tx })).not.toBeNull();
      // Quien no ve todo no lee el bloque, aunque vea el plan.
      expect(await respuestaDelPlan(b.lider, plan.id, { sql: tx })).toBeNull();
    }));

  it("nulo en un plan sin ningún hallazgo de origen externo, y en uno que no existe", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const plan = await planDeMejoraDePrueba(tx, b.control);
      const interno = await hallazgoEn(tx, b, "en_ejecucion");
      await ponerEnPlan(b.control, { planId: plan.id, hallazgoIds: [interno.id] }, o(tx));
      expect(await respuestaDelPlan(b.admin, plan.id, { sql: tx })).toBeNull();
      expect(await respuestaDelPlan(b.admin, 999999999, { sql: tx })).toBeNull();
    }));

  it("esperaRespuesta es la definición única: externo, sin terminar, sin respuesta y con el plan de acción de su ronda aprobado", () =>
    revertida(sql, async (tx) => {
      const { b, h1, h2, h3, h4, h5 } = await escena(tx);
      const ids = [h1.id, h2.id, h3.id, h4.id, h5.id];
      const esperan = async () =>
        (await tx`SELECT h.id FROM mejora_hallazgos h WHERE h.id = ANY(${tx.array(ids)}::bigint[]) AND ${esperaRespuesta(tx)} ORDER BY h.id`).map(
          (f) => Number(f.id),
        );
      expect(await esperan()).toEqual([h1.id, h2.id]);
      // Uno externo que termina (anulado, aunque se quede en el plan) ya no espera respuesta.
      await anularHallazgo(b.admin, { hallazgoId: h1.id, justificacion: "Se registró dos veces por un error" }, o(tx));
      expect(await esperan()).toEqual([h2.id]);
    }));
});

describe("registrarRespuestaDelPlan", () => {
  it("con lo que se vio (H1 y H2): cada uno queda respondido con su evento y su bitácora; el plan, con su respuesta y su evento; H3 no cambia", () =>
    revertida(sql, async (tx) => {
      const { b, plan, h1, h2, h3 } = await escena(tx);
      const oficio = await archivoDelPlan(tx, plan.id, b.admin.usuarioId, { nombre: "Oficio de respuesta.pdf" });
      await registrarRespuestaDelPlan(b.admin, { planId: plan.id, enviadaEn: "2026-11-18", oficioId: oficio, vistos: [h2.id, h1.id] }, o(tx));

      const [r] = await tx`SELECT id, plan_id, to_char(enviada_en, 'YYYY-MM-DD') AS enviada, archivo_id, registrada_por, registrada_en
        FROM mejora_plan_respuestas WHERE plan_id = ${plan.id}`;
      expect(r).toEqual({
        id: expect.any(Number),
        plan_id: plan.id,
        enviada: "2026-11-18",
        archivo_id: oficio,
        registrada_por: b.admin.usuarioId,
        registrada_en: new Date(AHORA),
      });
      const incluidos = await tx`SELECT hallazgo_id FROM mejora_plan_respuesta_hallazgos WHERE respuesta_id = ${r.id} ORDER BY hallazgo_id`;
      expect(incluidos.map((f) => Number(f.hallazgo_id))).toEqual([h1.id, h2.id]);

      for (const h of [h1, h2]) {
        expect(await respuestaDe(tx, h.id)).toEqual({ en: "2026-11-18", por: b.admin.usuarioId });
        const [e] = await tx`SELECT detalle, usuario_id, ocurrio_en FROM mejora_eventos WHERE hallazgo_id = ${h.id} AND tipo = 'respuesta_ente'`;
        // El oficio es un archivo del plan: su id no va al evento del hallazgo, que lee su líder.
        expect(e).toEqual({
          detalle: { enviadaEn: "2026-11-18", planId: plan.id, respuestaId: r.id },
          usuario_id: b.admin.usuarioId,
          ocurrio_en: new Date(AHORA),
        });
        const [bit] = await tx`SELECT detalle, usuario_id FROM auditoria
          WHERE accion = 'mejora_respuesta_ente' AND entidad = 'mejora_hallazgo' AND entidad_id = ${h.id}`;
        expect(bit).toEqual({
          detalle: { codigo: h.codigo, enviadaEn: "2026-11-18", oficioId: oficio, planId: plan.id, plan: plan.codigo },
          usuario_id: b.admin.usuarioId,
        });
      }
      expect(await respuestaDe(tx, h3.id)).toEqual({ en: null, por: null });

      const [ev] = await tx`SELECT hallazgo_id, detalle, usuario_id, creado_en FROM mejora_plan_eventos WHERE plan_id = ${plan.id} AND tipo = 'respuesta'`;
      expect(ev).toEqual({
        hallazgo_id: null,
        detalle: {
          respuestaId: r.id,
          enviadaEn: "2026-11-18",
          oficioId: oficio,
          oficio: "Oficio de respuesta.pdf",
          hallazgoIds: [h1.id, h2.id],
          hallazgos: [h1.codigo, h2.codigo],
        },
        usuario_id: b.admin.usuarioId,
        creado_en: new Date(AHORA),
      });
      const [bitPlan] = await tx`SELECT entidad, detalle FROM auditoria WHERE accion = 'mejora_plan_respuesta' AND entidad_id = ${plan.id}`;
      expect(bitPlan).toEqual({
        entidad: "mejora_plan",
        detalle: { codigo: plan.codigo, nombre: "Visita de la Superintendencia Nacional de Salud", enviadaEn: "2026-11-18", oficioId: oficio, hallazgos: [h1.codigo, h2.codigo] },
      });

      const leida = await respuestaDelPlan(b.admin, plan.id, { sql: tx, ahora: new Date(AHORA) });
      expect(leida).toMatchObject({
        listos: [],
        faltan: [{ id: h3.id }],
        vence: null,
        desde: null,
        oficios: [],
        respuestas: [{ id: r.id, enviadaEn: "2026-11-18", por: b.admin.nombre, oficio: { id: oficio, nombre: "Oficio de respuesta.pdf" }, hallazgos: [h1.codigo, h2.codigo] }],
      });
      const deGerencia = await respuestaDelPlan(b.gerencia, plan.id, { sql: tx });
      expect(deGerencia?.respuestas).toHaveLength(1);
      // El historial del plan lo cuenta a quien ve todo.
      const historial = (await leerPlan(b.gerencia, plan.id, { sql: tx, ahora: new Date(AHORA) }))?.historial ?? [];
      expect(historial.find((e) => e.tipo === "respuesta")?.texto).toBe(
        `registró la respuesta al ente de ${h1.codigo} y ${h2.codigo}, enviada el 18 de noviembre de 2026, con el oficio «Oficio de respuesta.pdf»`,
      );
    }));

  it("toma el plan antes que nada y después los hallazgos, por id ascendente, aunque la lista llegue en otro orden (anexo §3.4)", () =>
    revertida(sql, async (tx) => {
      const { b, plan, h1, h2 } = await escena(tx);
      const oficio = await archivoDelPlan(tx, plan.id, b.admin.usuarioId);
      const { sql: contador, sentencias } = conSentencias(tx);
      await registrarRespuestaDelPlan(
        b.admin,
        { planId: plan.id, enviadaEn: "2026-11-18", oficioId: oficio, vistos: [h2.id, h1.id] },
        { ...o(tx), sql: contador },
      );
      const candados = sentencias.filter((x) => /FOR UPDATE/.test(x.texto));
      expect(candados[0].texto).toMatch(/FROM mejora_planes WHERE id = \? FOR UPDATE/);
      expect(candados[0].valores).toEqual([plan.id]);
      const deHallazgos = candados.filter((x) => /FROM mejora_hallazgos WHERE id = \? FOR UPDATE/.test(x.texto));
      expect(deHallazgos.map((x) => x.valores[0])).toEqual([h1.id, h2.id].sort((x, y) => x - y));
      expect(sentencias.findIndex((x) => /FROM mejora_planes WHERE id = \? FOR UPDATE/.test(x.texto))).toBeLessThan(
        sentencias.findIndex((x) => /FROM mejora_hallazgos WHERE id = \? FOR UPDATE/.test(x.texto)),
      );
      // Nada se escribe antes de tener todos los candados.
      const primeraEscritura = sentencias.findIndex((x) => /^\s*(INSERT|UPDATE)/.test(x.texto));
      const ultimoCandado = sentencias.findLastIndex((x) => /FOR UPDATE/.test(x.texto));
      expect(primeraEscritura).toBeGreaterThan(ultimoCandado);
    }));

  it("si la lista cambió (Review Focus 4: un hallazgo cambió de estado con el formulario abierto), LISTOS_CAMBIARON y no se escribe nada", () =>
    revertida(sql, async (tx) => {
      const { b, plan, h1, h2, h3, h4, h5 } = await escena(tx);
      const todos = [h1.id, h2.id, h3.id, h4.id, h5.id];
      const oficio = await archivoDelPlan(tx, plan.id, b.admin.usuarioId);
      const registrar = (vistos: number[]) =>
        registrarRespuestaDelPlan(b.admin, { planId: plan.id, enviadaEn: "2026-11-18", oficioId: oficio, vistos }, o(tx));
      for (const vistos of [[h1.id], [h1.id, h2.id, h3.id], [h1.id, h2.id, 999999999], [h1.id, h5.id]]) {
        await expect(registrar(vistos)).rejects.toThrow(LISTOS_CAMBIARON);
      }
      expect(await loEscrito(tx, plan.id, todos)).toEqual(NADA);

      // La persona abrió el formulario con H1 y H2; mientras tanto se aprobó el plan de acción de H3.
      const vistos = (await respuestaDelPlan(b.admin, plan.id, { sql: tx }))!.listos.map((l) => l.id);
      expect(vistos).toEqual([h1.id, h2.id]);
      await aprobarH3(tx, b, h3.id);
      await expect(registrar(vistos)).rejects.toThrow(LISTOS_CAMBIARON);
      expect(await loEscrito(tx, plan.id, todos)).toEqual(NADA);

      // Y si uno de los vistos deja de estar listo (se anula), tampoco.
      await anularHallazgo(b.admin, { hallazgoId: h2.id, justificacion: "Se registró dos veces por un error" }, o(tx));
      await expect(registrar([h1.id, h2.id, h3.id])).rejects.toThrow(LISTOS_CAMBIARON);
      expect(await loEscrito(tx, plan.id, todos)).toEqual(NADA);
      await registrar([h1.id, h3.id]);
      expect((await loEscrito(tx, plan.id, todos)).respondidos).toBe(2);
    }));

  it("si todos los que se vieron dejan de estar listos, la lista cambió (LISTOS_CAMBIARON, no SIN_LISTOS) y no se escribe nada", () =>
    revertida(sql, async (tx) => {
      const { b, plan, h1, h2, h3 } = await escena(tx);
      const todos = [h1.id, h2.id, h3.id];
      const oficio = await archivoDelPlan(tx, plan.id, b.admin.usuarioId);
      const otro = await archivoDelPlan(tx, plan.id, b.admin.usuarioId);
      const registrar = (oficioId: number) =>
        registrarRespuestaDelPlan(b.admin, { planId: plan.id, enviadaEn: "2026-11-18", oficioId, vistos: [h1.id, h2.id] }, o(tx));

      // El mismo formulario, enviado dos veces: la segunda vez ya no queda ningún listo (H3 sigue sin su plan aprobado).
      await registrar(oficio);
      const despuesDeLaPrimera = await loEscrito(tx, plan.id, todos);
      await expect(registrar(otro)).rejects.toThrow(LISTOS_CAMBIARON);
      expect(await loEscrito(tx, plan.id, todos)).toEqual(despuesDeLaPrimera);
      expect(await respuestaDelPlan(b.admin, plan.id, { sql: tx })).toMatchObject({ listos: [] });
    }));

  it("si los que se vieron se anulan todos con el formulario abierto, también LISTOS_CAMBIARON, sin escribir nada", () =>
    revertida(sql, async (tx) => {
      const { b, plan, h1, h2, h3 } = await escena(tx);
      const oficio = await archivoDelPlan(tx, plan.id, b.admin.usuarioId);
      for (const h of [h1, h2]) await anularHallazgo(b.admin, { hallazgoId: h.id, justificacion: "Se registró dos veces por un error" }, o(tx));
      await expect(
        registrarRespuestaDelPlan(b.admin, { planId: plan.id, enviadaEn: "2026-11-18", oficioId: oficio, vistos: [h1.id, h2.id] }, o(tx)),
      ).rejects.toThrow(LISTOS_CAMBIARON);
      expect(await loEscrito(tx, plan.id, [h1.id, h2.id, h3.id])).toEqual(NADA);
    }));

  it("sin listos y sin nada visto, SIN_LISTOS (con algo visto, la lista cambió); la fecha, ni futura ni anterior a la aprobación más reciente", () =>
    revertida(sql, async (tx) => {
      const { b, plan, h1, h2, h3 } = await escena(tx);
      const oficio = await archivoDelPlan(tx, plan.id, b.admin.usuarioId);
      const registrar = (enviadaEn: string) =>
        registrarRespuestaDelPlan(b.admin, { planId: plan.id, enviadaEn, oficioId: oficio, vistos: [h1.id, h2.id] }, o(tx));
      await expect(registrar("2026-11-19")).rejects.toThrow("La fecha de envío no puede ser futura");
      await expect(registrar("2026-11-17")).rejects.toThrow(
        "La fecha de envío no puede ser anterior a la aprobación del plan, el 18 de noviembre de 2026",
      );

      const soloFaltan = await planDeMejoraDePrueba(tx, b.control, { origen: "ente_control", fechaLimiteEnte: "2026-12-30" });
      await sacarDelPlan(b.control, { hallazgoId: h3.id, motivo: "Pasa al plan de la visita de seguimiento" }, o(tx));
      await ponerEnPlan(b.control, { planId: soloFaltan.id, hallazgoIds: [h3.id] }, o(tx));
      const delOtro = await archivoDelPlan(tx, soloFaltan.id, b.admin.usuarioId);
      const enElOtro = (vistos: number[]) =>
        registrarRespuestaDelPlan(b.admin, { planId: soloFaltan.id, enviadaEn: "2026-11-18", oficioId: delOtro, vistos }, o(tx));
      await expect(enElOtro([])).rejects.toThrow(SIN_LISTOS);
      // Quien dice haber visto H3 como listo vio otra lista: se le pide revisarla, no se le dice que no hay listos.
      await expect(enElOtro([h3.id])).rejects.toThrow(LISTOS_CAMBIARON);
      expect(await loEscrito(tx, plan.id, [h1.id, h2.id])).toEqual(NADA);
      expect(await loEscrito(tx, soloFaltan.id, [h3.id])).toEqual(NADA);
    }));

  it("el oficio es un archivo del plan que no es ya el oficio de otra respuesta; Control Interno no registra", () =>
    revertida(sql, async (tx) => {
      const { b, plan, h1, h2, h3 } = await escena(tx);
      const registrar = (oficioId: number, vistos = [h1.id, h2.id], quien = b.admin) =>
        registrarRespuestaDelPlan(quien, { planId: plan.id, enviadaEn: "2026-11-18", oficioId, vistos }, o(tx));
      const otroPlan = await planDeMejoraDePrueba(tx, b.control, { nombre: "Otro plan con su propio oficio" });
      for (const ajeno of [
        await evidenciaDelHallazgo(tx, h1.id, b.admin.usuarioId),
        await archivoDelPlan(tx, otroPlan.id, b.admin.usuarioId),
        999999999,
      ]) {
        await expect(registrar(ajeno)).rejects.toThrow(OFICIO_AJENO_AL_PLAN);
      }
      const oficio = await archivoDelPlan(tx, plan.id, b.admin.usuarioId);
      await expect(registrar(oficio, [h1.id, h2.id], b.control)).rejects.toThrow(ErrorPermiso);
      await registrar(oficio);

      // H3 se aprueba después: otra respuesta, con otro oficio; el de la primera ya no sirve.
      await aprobarH3(tx, b, h3.id);
      await expect(registrar(oficio, [h3.id])).rejects.toThrow(OFICIO_DE_OTRA);
      const segundo = await archivoDelPlan(tx, plan.id, b.admin.usuarioId);
      await registrar(segundo, [h3.id]);
      const leida = await respuestaDelPlan(b.admin, plan.id, { sql: tx });
      expect(leida?.respuestas.map((r) => r.hallazgos)).toEqual([[h1.codigo, h2.codigo], [h3.codigo]]);
      expect(leida?.respuestas.map((r) => r.oficio.id)).toEqual([oficio, segundo]);
    }));
});

describe("la respuesta de la 15A y la página del hallazgo", () => {
  it("un hallazgo que está en un plan se responde desde el plan (RESPONDA_DESDE_EL_PLAN); uno externo sin plan, como antes", () =>
    revertida(sql, async (tx) => {
      const { b, plan, h1 } = await escena(tx);
      expect(await planQueResponde(tx, h1.id)).toEqual({ id: plan.id, codigo: plan.codigo });
      const oficio = await evidenciaDelHallazgo(tx, h1.id, b.admin.usuarioId);
      await expect(registrarRespuestaAlEnte(b.admin, { hallazgoId: h1.id, enviadaEn: "2026-11-18", oficioId: oficio }, o(tx))).rejects.toThrow(
        RESPONDA_DESDE_EL_PLAN,
      );
      expect(await respuestaDe(tx, h1.id)).toEqual({ en: null, por: null });

      const suelto = await hallazgoEn(tx, b, "en_ejecucion", { ...ENTE, fechaLimiteEnte: "2026-12-30" });
      expect(await planQueResponde(tx, suelto.id)).toBeNull();
      const suyo = await evidenciaDelHallazgo(tx, suelto.id, b.admin.usuarioId);
      await registrarRespuestaAlEnte(b.admin, { hallazgoId: suelto.id, enviadaEn: "2026-11-18", oficioId: suyo }, o(tx));
      expect(await respuestaDe(tx, suelto.id)).toEqual({ en: "2026-11-18", por: b.admin.usuarioId });
    }));

  it("sacar del plan un hallazgo respondido no borra su respuesta, y el plan conserva que lo incluyó", () =>
    revertida(sql, async (tx) => {
      const { b, plan, h1, h2 } = await escena(tx);
      const oficio = await archivoDelPlan(tx, plan.id, b.admin.usuarioId);
      await registrarRespuestaDelPlan(b.admin, { planId: plan.id, enviadaEn: "2026-11-18", oficioId: oficio, vistos: [h1.id, h2.id] }, o(tx));
      await sacarDelPlan(b.control, { hallazgoId: h1.id, motivo: "Pasa al plan de la visita de seguimiento" }, o(tx));
      expect(await respuestaDe(tx, h1.id)).toEqual({ en: "2026-11-18", por: b.admin.usuarioId });
      expect(await planQueResponde(tx, h1.id)).toBeNull();
      expect((await respuestaDelPlan(b.admin, plan.id, { sql: tx }))?.respuestas[0].hallazgos).toEqual([h1.codigo, h2.codigo]);
    }));

  it("el líder lee en su hallazgo la fecha y quién, sin el nombre ni el enlace del oficio (es del plan); Gerencia, con el oficio", () =>
    revertida(sql, async (tx) => {
      const { b, plan, h1, h2 } = await escena(tx);
      const oficio = await archivoDelPlan(tx, plan.id, b.admin.usuarioId, { nombre: "Oficio único de respuesta al ente.pdf" });
      await registrarRespuestaDelPlan(b.admin, { planId: plan.id, enviadaEn: "2026-11-18", oficioId: oficio, vistos: [h1.id, h2.id] }, o(tx));
      const ahora = { sql: tx, ahora: new Date(AHORA) };

      const delLider = await leerHallazgo(b.lider, h1.id, ahora);
      expect(delLider?.respuestaAlEnte).toEqual({ enviadaEn: "2026-11-18", por: b.admin.nombre, delPlan: { oficio: null } });
      const texto = JSON.stringify(delLider);
      expect(texto).not.toContain("Oficio único de respuesta al ente");
      expect(texto).not.toContain(`/mejoramiento/archivos/${oficio}`);
      expect(texto).not.toContain(`"oficioId":${oficio}`);

      // En el plan, el líder no lee el bloque de la respuesta ni su línea del historial (Review Focus 1).
      const planDelLider = await leerPlan(b.lider, plan.id, ahora);
      expect(planDelLider).not.toBeNull();
      expect(planDelLider?.respuesta).toBeNull();
      expect(planDelLider?.historial.some((e) => e.tipo === "respuesta")).toBe(false);
      expect((await leerPlan(b.gerencia, plan.id, ahora))?.historial.some((e) => e.tipo === "respuesta")).toBe(true);

      const deGerencia = await leerHallazgo(b.gerencia, h1.id, ahora);
      expect(deGerencia?.respuestaAlEnte).toEqual({
        enviadaEn: "2026-11-18",
        por: b.admin.nombre,
        delPlan: { oficio: { id: oficio, nombre: "Oficio único de respuesta al ente.pdf", mime: "application/pdf", tamano: 10 } },
      });
    }));
});
