/**
 * El cierre del mes y la reapertura de una medición (Fase 14A, Tarea 12; spec §8.7, §9, F14-DC3, F14-DC9 y F14-DC31).
 * Contra la BD de desarrollo, dentro de una transacción que se revierte: ningún test deja un cierre confirmado.
 *
 * El resumen y el cierre abarcan todo el sistema. Para que no alcancen nada de la base ni choquen con sus cierres
 * confirmados (el del punto de control, los de la demo), los casos viven en 2003, antes de todo inicio de medición de la
 * base, con `ahora` en ese año: `entorno` comprueba que el resumen de base esté vacío. Los indicadores de prueba son
 * mensuales, de forma «porcentaje», meta 90 y umbral 70 (límite de crítico 63), con inicio en marzo de 2003 y aprobados el
 * 15 de diciembre de 2002: el 20 de abril de 2003 (`AHORA`), marzo es su único periodo terminado, es ordinario y su plazo
 * venció el 10 de abril. Los mide una persona de rol Consulta. «El último cierre» se lee de la base: puede ser uno
 * confirmado, posterior.
 */
import { existsSync } from "node:fs";
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { analizar } from "@/db/consultas/indicadores/analisis";
import {
  cerrarDeNuevo,
  cerrarMes,
  cierres,
  historialDeCorregidas,
  mesPorOmision,
  reabrirMedicion,
  resumenDeCierre,
  type CuentasDeProceso,
} from "@/db/consultas/indicadores/cierre";
import { registrarHistoricos } from "@/db/consultas/indicadores/historicos";
import { asegurarMediciones, marcarNoAplica, reportar } from "@/db/consultas/indicadores/mediciones";
import { programarMeta } from "@/db/consultas/indicadores/metas";
import { observar } from "@/db/consultas/indicadores/observaciones";
import { retirar } from "@/db/consultas/indicadores/operacion";
import { quitarSoporte } from "@/db/consultas/indicadores/soportes";
import { describirEvento } from "@/lib/bitacora-detalle";
import { fraseDelCierre, frasesDeNoSeCierran, mesPorOmisionDe } from "@/lib/indicadores/cierre";
import { historialDeCorreccion, type EventoDeMedicion } from "@/lib/indicadores/historial";
import { ErrorIndicador } from "@/lib/indicadores/tipos";
import { ErrorPermiso } from "@/lib/permisos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { indicadorDePrueba, type OpcionesIndicadorDePrueba } from "./utiles/indicadores";
import { sesionAdmin, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

let consecutivo = 0;
const unico = () => `${Date.now() % 100_000_000}${(consecutivo += 1)}`;

const AHORA = new Date("2003-04-20T15:00:00Z");
const APROBADA = new Date("2002-12-15T15:00:00Z");
/** Aprobado después de terminar marzo: marzo queda histórico. */
const APROBADA_EN_ABRIL = new Date("2003-04-05T15:00:00Z");
const MARZO = "2003-03";
const ABRIL = "2003-04";
const dia = (d: number, mes = 4) => new Date(`2003-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}T15:00:00Z`);
const CERRADA = "La medición está cerrada: pida al Administrador del SGC que la reabra";
const JUSTIFICACION = "El dato de casos evaluados venía del informe equivocado";

async function rechaza(promesa: Promise<unknown>, mensaje: string) {
  const err = await promesa.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ErrorIndicador);
  expect((err as Error).message).toBe(mensaje);
}

async function sinPermiso(promesa: Promise<unknown>) {
  const err = await promesa.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ErrorPermiso);
}

const opc = (tx: TransactionSql, ahora = AHORA) => ({ sql: tx, ahora });

const reportarCon = (tx: TransactionSql, sesion: SesionFlujo, medicionId: number, valores: Record<string, string>, ahora = AHORA) =>
  reportar(sesion, { medicionId, valores, parcial: false, confirmado: true }, opc(tx, ahora));

const fila = async (tx: TransactionSql, medicionId: number) => (await tx`SELECT * FROM mediciones WHERE id = ${medicionId}`)[0];

const eventos = (tx: TransactionSql, medicionId: number) =>
  tx`SELECT tipo, usuario_id, detalle, creado_en FROM medicion_eventos WHERE medicion_id = ${medicionId} ORDER BY id`;

const bitacora = (tx: TransactionSql, accion: string, entidad: string, entidadId: number) =>
  tx`SELECT usuario_id, detalle FROM auditoria WHERE accion = ${accion} AND entidad = ${entidad} AND entidad_id = ${entidadId} ORDER BY id`;

const avisos = (tx: TransactionSql, medicionId: number) =>
  tx`SELECT usuario_id, titulo, cuerpo, enlace FROM notificaciones
    WHERE tipo = 'indicadores.reabierta' AND entidad = 'medicion' AND entidad_id = ${medicionId} ORDER BY id`;

/** El cierre de mes más reciente de la base: el que toman «Cerrar de nuevo» y la lista de cierres. */
async function ultimoCierre(tx: TransactionSql): Promise<{ id: number; mes: string }> {
  const [c] = await tx`SELECT id, to_char(mes, 'YYYY-MM') AS mes FROM cierres_indicadores ORDER BY mes DESC LIMIT 1`;
  return { id: Number(c.id), mes: c.mes as string };
}

/** Un proceso que solo existe en la transacción, sin líderes: si nadie está designado, solo el Admin SGC mide sus indicadores. */
async function procesoSinLider(tx: TransactionSql): Promise<{ id: number; nombre: string }> {
  const sigla = `Z${unico()}`;
  const [macro] = await tx`SELECT id FROM macroprocesos ORDER BY id LIMIT 1`;
  const [p] = await tx`INSERT INTO procesos (macroproceso_id, nombre, sigla, slug, icono, orden)
    VALUES (${macro.id}, ${`Proceso ${sigla}`}, ${sigla}, ${sigla.toLowerCase()}, 'circle', 99) RETURNING id, nombre`;
  return { id: Number(p.id), nombre: p.nombre as string };
}

const procesoPorSigla = async (tx: TransactionSql, sigla: string) => {
  const [p] = await tx`SELECT id, nombre FROM procesos WHERE sigla = ${sigla}`;
  return { id: Number(p.id), nombre: p.nombre as string };
};

/**
 * Quien administra y quien mide; `nuevo` crea un indicador de la cabecera y devuelve su medición de marzo (o la de
 * `periodo`). Antes comprueba que el resumen de base esté vacío: 2003 no alcanza nada de la base.
 */
async function entorno(tx: TransactionSql) {
  const admin = await sesionAdmin(tx);
  const mide = await usuarioDePrueba(tx, { rol: "consulta" });
  const base = await resumenDeCierre(admin, MARZO, opc(tx));
  expect(base, "el año de las pruebas no debe alcanzar mediciones de la base").toMatchObject({
    aCerrar: 0,
    enPlazo: 0,
    historicosSinRegistrar: 0,
    observacionesSinRespuesta: 0,
    porProceso: [],
  });
  const nuevo = async (o: OpcionesIndicadorDePrueba & { plazo?: number } = {}) => {
    const { plazo, ...resto } = o;
    const ind = await indicadorDePrueba(tx, { inicioMedicion: MARZO, aprobadaEn: APROBADA, mide: [mide.usuarioId], ...resto });
    if (plazo !== undefined) await tx`UPDATE indicadores SET plazo_reporte_dias = ${plazo} WHERE id = ${ind.id}`;
    await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: ind.id });
    const medicion = async (periodo: string) => {
      const [m] = await tx`SELECT id FROM mediciones WHERE indicador_id = ${ind.id} AND periodo = ${periodo}`;
      return Number(m.id);
    };
    return { ind, marzo: await medicion(MARZO), medicion };
  };
  return { admin, mide, nuevo };
}

const fila0 = (proceso: string, o: Partial<CuentasDeProceso>): CuentasDeProceso => ({
  proceso,
  reportadas: 0,
  sinDato: 0,
  noAplica: 0,
  sinAnalisis: 0,
  observacionesSinRespuesta: 0,
  ...o,
});
const porNombre = (filas: CuentasDeProceso[]) => [...filas].sort((x, y) => x.proceso.localeCompare(y.proceso, "es"));

describe("el resumen y el cierre del mes", () => {
  it("el resumen de marzo cuenta cada grupo, en total y por proceso", () =>
    revertida(sql, async (tx) => {
      const { admin, mide, nuevo } = await entorno(tx);
      const gth = await procesoPorSigla(tx, "GTH");
      const sgc = await procesoPorSigla(tx, "SGC");
      const tercero = await procesoSinLider(tx);
      const reportada = await nuevo();
      await reportarCon(tx, mide, reportada.marzo, { A: "9", B: "10" });
      await observar(admin, { medicionId: reportada.marzo, texto: "¿De qué informe salen los casos evaluados?" }, opc(tx));
      const sinDato = await nuevo();
      const noAplica = await nuevo();
      await marcarNoAplica(mide, { medicionId: noAplica.marzo, motivo: "No hubo casos en marzo" }, opc(tx));
      const sinAnalisis = await nuevo({ procesoId: sgc.id });
      await reportarCon(tx, mide, sinAnalisis.marzo, { A: "5", B: "10" });
      await observar(admin, { medicionId: sinAnalisis.marzo, texto: "¿Por qué bajó tanto?" }, opc(tx));
      // Un proceso con solo una medición en plazo no tiene fila «por proceso».
      await nuevo({ plazo: 30, procesoId: tercero.id });
      await nuevo({ aprobadaEn: APROBADA_EN_ABRIL });

      const r = await resumenDeCierre(admin, MARZO, opc(tx));
      expect(r).toEqual({
        mes: MARZO,
        yaCerrado: false,
        aCerrar: 4,
        reportadas: 1,
        sinDato: [{ codigo: sinDato.ind.codigo, nombre: `Indicador de prueba ${sinDato.ind.codigo}`, proceso: gth.nombre, periodo: MARZO, quien: [mide.nombre] }],
        noAplica: 1,
        sinAnalisis: 1,
        observacionesSinRespuesta: 2,
        enPlazo: 1,
        historicosSinRegistrar: 1,
        porProceso: porNombre([
          fila0(gth.nombre, { reportadas: 1, sinDato: 1, noAplica: 1, observacionesSinRespuesta: 1 }),
          fila0(sgc.nombre, { sinAnalisis: 1, observacionesSinRespuesta: 1 }),
        ]),
      });
      // El resumen no escribe nada: ni el cierre ni un cambio en las mediciones.
      expect((await tx`SELECT count(*)::int AS n FROM cierres_indicadores WHERE mes = '2003-03-31'`)[0].n).toBe(0);
      expect((await fila(tx, sinDato.marzo)).estado).toBe("abierta");
    }));

  it("cerrar deja cada medición como corresponde y guarda el resumen, también por proceso", () =>
    revertida(sql, async (tx) => {
      const { admin, mide, nuevo } = await entorno(tx);
      const gth = await procesoPorSigla(tx, "GTH");
      const reportada = await nuevo();
      await reportarCon(tx, mide, reportada.marzo, { A: "9", B: "10" });
      const sinDato = await nuevo();
      const noAplica = await nuevo();
      await marcarNoAplica(mide, { medicionId: noAplica.marzo, motivo: "No hubo casos en marzo" }, opc(tx));
      const sinAnalisis = await nuevo();
      await reportarCon(tx, mide, sinAnalisis.marzo, { A: "5", B: "10" });
      const enPlazo = await nuevo({ plazo: 30 });
      const sinRegistrar = await nuevo({ aprobadaEn: APROBADA_EN_ABRIL });
      const registrado = await nuevo({ aprobadaEn: APROBADA_EN_ABRIL });
      await registrarHistoricos(admin, { indicadorId: registrado.ind.id, filas: [{ periodo: MARZO, valores: { A: "8", B: "10" } }] }, opc(tx));

      const { cierreId, cerradas } = await cerrarMes(admin, MARZO, opc(tx));
      const [c] = await tx`SELECT to_char(mes, 'YYYY-MM-DD') AS mes, cerrado_por, cerrado_en, resumen FROM cierres_indicadores WHERE id = ${cierreId}`;
      expect([c.mes, Number(c.cerrado_por), c.cerrado_en]).toEqual(["2003-03-31", admin.usuarioId, AHORA]);
      expect(c.resumen).toEqual({
        cerradas: 5,
        reportadas: 2,
        sinDato: 1,
        noAplica: 1,
        sinAnalisis: 1,
        observacionesSinRespuesta: 0,
        enPlazo: 1,
        historicosSinRegistrar: 1,
        porProceso: [fila0(gth.nombre, { reportadas: 2, sinDato: 1, noAplica: 1, sinAnalisis: 1 })],
      });
      expect(cerradas).toBe(5);

      const estado = async (id: number) => {
        const m = await fila(tx, id);
        return { estado: m.estado, cierre: m.cierre_id === null ? null : Number(m.cierre_id), resultado: m.resultado_exacto !== null, sinAnalisis: m.sin_analisis };
      };
      expect(await estado(reportada.marzo)).toEqual({ estado: "cerrada", cierre: cierreId, resultado: true, sinAnalisis: false });
      expect(await estado(sinDato.marzo)).toEqual({ estado: "cerrada", cierre: cierreId, resultado: false, sinAnalisis: false });
      expect(await estado(noAplica.marzo)).toEqual({ estado: "cerrada", cierre: cierreId, resultado: false, sinAnalisis: false });
      expect(await estado(sinAnalisis.marzo)).toEqual({ estado: "cerrada", cierre: cierreId, resultado: true, sinAnalisis: true });
      expect(await estado(enPlazo.marzo)).toEqual({ estado: "abierta", cierre: null, resultado: false, sinAnalisis: false });
      expect(await estado(sinRegistrar.marzo)).toEqual({ estado: "abierta", cierre: null, resultado: false, sinAnalisis: false });
      expect(await estado(registrado.marzo)).toEqual({ estado: "cerrada", cierre: cierreId, resultado: true, sinAnalisis: false });

      // Un evento `cierre` por medición cerrada, ninguno en las que siguen abiertas.
      const cierresDe = async (id: number) => (await eventos(tx, id)).filter((e) => e.tipo === "cierre");
      for (const x of [reportada, sinDato, noAplica, sinAnalisis, registrado]) {
        const lista = await cierresDe(x.marzo);
        expect(lista).toHaveLength(1);
        expect(Number(lista[0].usuario_id)).toBe(admin.usuarioId);
        expect(lista[0].creado_en).toEqual(AHORA);
        expect(lista[0].detalle).toMatchObject({ cierreId, mes: MARZO, despues: { estado: "cerrada" } });
      }
      expect((await cierresDe(sinAnalisis.marzo))[0].detalle).toMatchObject({ antes: { estado: "abierta" }, sinAnalisis: true });
      expect(await cierresDe(enPlazo.marzo)).toHaveLength(0);
      expect(await cierresDe(sinRegistrar.marzo)).toHaveLength(0);

      const [b] = await bitacora(tx, "indicadores_mes_cerrado", "cierre_indicadores", cierreId);
      expect(Number(b.usuario_id)).toBe(admin.usuarioId);
      expect(b.detalle).toEqual({ mes: MARZO, ...c.resumen });
      expect((await cierres(opc(tx))).find((x) => x.id === cierreId)).toEqual({ id: cierreId, mes: MARZO, cerradoPor: admin.nombre, cerradoEn: AHORA, cerradas: 5 });
    }));

  it("«cerrar hasta marzo» alcanza también enero y febrero", () =>
    revertida(sql, async (tx) => {
      const { admin, mide, nuevo } = await entorno(tx);
      const x = await nuevo({ inicioMedicion: "2003-01" });
      const enero = await x.medicion("2003-01");
      const febrero = await x.medicion("2003-02");
      await reportarCon(tx, mide, enero, { A: "9", B: "10" });
      await reportarCon(tx, mide, x.marzo, { A: "10", B: "10" });
      const { cierreId } = await cerrarMes(admin, MARZO, opc(tx));
      for (const id of [enero, febrero, x.marzo]) {
        const m = await fila(tx, id);
        expect([m.estado, Number(m.cierre_id)]).toEqual(["cerrada", cierreId]);
      }
      expect((await fila(tx, febrero)).resultado_exacto).toBeNull();
    }));

  it("cierra lo que tiene datos de un indicador retirado y no cierra lo de otra periodicidad", () =>
    revertida(sql, async (tx) => {
      const { admin, mide, nuevo } = await entorno(tx);
      const retirado = await nuevo();
      await reportarCon(tx, mide, retirado.marzo, { A: "9", B: "10" });
      await retirar(admin, { indicadorId: retirado.ind.id, motivo: "Ya no se mide" }, opc(tx));

      // Un cambio mayor a trimestral que rige desde el primer trimestre: los meses que ya tenían datos quedan y no se miden.
      const cambio = await nuevo({ inicioMedicion: "2003-01" });
      const enero = await cambio.medicion("2003-01");
      await reportarCon(tx, mide, enero, { A: "9", B: "10" });
      const [v2] = await tx`INSERT INTO indicador_versiones (indicador_id, numero, estado, tipo_cambio, nombre, forma, formula, periodicidad,
          tendencia, meta, semaforo_modo, umbral_atencion_pct, unidad_sufijo, decimales, creado_por)
        VALUES (${cambio.ind.id}, 2, 'borrador', 'mayor', 'Trimestral', 'porcentaje', 'A / B * 100', 'trimestral', 'ascendente', 90, 'relativo', 70,
          ' %', 1, ${admin.usuarioId}) RETURNING id`;
      await tx`SELECT id FROM indicador_versiones WHERE id = ${v2.id} FOR UPDATE`;
      for (const [orden, letra] of [[1, "A"], [2, "B"]] as const) {
        await tx`INSERT INTO indicador_variables (version_id, letra, nombre, orden) VALUES (${v2.id}, ${letra}, ${letra}, ${orden})`;
      }
      await tx`UPDATE indicador_versiones SET estado = 'aprobada', elaborada_por = ${admin.usuarioId}, huella = ${"1".repeat(64)},
          rige_desde = '2003-T1', aprobada_por = ${admin.usuarioId}, aprobada_en = '2003-02-15T15:00:00Z'
        WHERE id = ${v2.id}`;
      await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: cambio.ind.id });
      const t1 = await cambio.medicion("2003-T1");

      const { cierreId } = await cerrarMes(admin, MARZO, opc(tx));
      const r = await fila(tx, retirado.marzo);
      expect([r.estado, Number(r.cierre_id)]).toEqual(["cerrada", cierreId]);
      expect((await fila(tx, t1)).estado).toBe("cerrada");
      expect((await fila(tx, enero)).estado).toBe("reportada");
      expect((await fila(tx, cambio.marzo)).estado).toBe("abierta");
      expect((await eventos(tx, enero)).map((e) => e.tipo)).toEqual(["reporte"]);
    }));

  it("no se cierra un mes sin terminar ni dos veces el mismo", () =>
    revertida(sql, async (tx) => {
      const { admin, mide, nuevo } = await entorno(tx);
      const x = await nuevo();
      await reportarCon(tx, mide, x.marzo, { A: "9", B: "10" });
      await rechaza(cerrarMes(admin, ABRIL, opc(tx)), "Ese mes no ha terminado");
      await rechaza(resumenDeCierre(admin, ABRIL, opc(tx)), "Ese mes no ha terminado");
      await rechaza(cerrarMes(admin, "2003-13", opc(tx)), "El mes no es válido");
      await rechaza(cerrarMes(admin, "2003-T1", opc(tx)), "El mes no es válido");
      expect((await fila(tx, x.marzo)).estado).toBe("reportada");

      const { cierreId } = await cerrarMes(admin, MARZO, opc(tx));
      await rechaza(cerrarMes(admin, MARZO, opc(tx, dia(21))), "Ese mes ya está cerrado");
      expect((await resumenDeCierre(admin, MARZO, opc(tx, dia(21)))).yaCerrado).toBe(true);
      const filas = await tx`SELECT id FROM cierres_indicadores WHERE mes = '2003-03-31'`;
      expect(filas.map((f) => Number(f.id))).toEqual([cierreId]);
      expect((await eventos(tx, x.marzo)).filter((e) => e.tipo === "cierre")).toHaveLength(1);
      expect(await bitacora(tx, "indicadores_mes_cerrado", "cierre_indicadores", cierreId)).toHaveLength(1);
    }));

  it("un mes anterior al último cerrado también se cierra y alcanza lo que siga abierto", () =>
    revertida(sql, async (tx) => {
      const { admin, mide, nuevo } = await entorno(tx);
      const x = await nuevo({ inicioMedicion: "2003-01" });
      const enero = await x.medicion("2003-01");
      for (const id of [enero, await x.medicion("2003-02"), x.marzo]) await reportarCon(tx, mide, id, { A: "9", B: "10" });
      const marzo = await cerrarMes(admin, MARZO, opc(tx));
      await reabrirMedicion(admin, { medicionId: enero, justificacion: JUSTIFICACION }, opc(tx, dia(21)));

      const febrero = await cerrarMes(admin, "2003-02", opc(tx, dia(22)));
      expect(febrero.cerradas).toBe(1);
      expect(Number((await fila(tx, enero)).cierre_id)).toBe(febrero.cierreId);
      expect(Number((await fila(tx, x.marzo)).cierre_id)).toBe(marzo.cierreId);
    }));

  it("solo quien administra", () =>
    revertida(sql, async (tx) => {
      const { admin, mide, nuevo } = await entorno(tx);
      const x = await nuevo();
      await reportarCon(tx, mide, x.marzo, { A: "9", B: "10" });
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [x.ind.procesoId] });
      await sinPermiso(resumenDeCierre(lider, MARZO, opc(tx)));
      await sinPermiso(cerrarMes(lider, MARZO, opc(tx)));
      expect((await fila(tx, x.marzo)).estado).toBe("reportada");
      await cerrarMes(admin, MARZO, opc(tx));
      await sinPermiso(reabrirMedicion(lider, { medicionId: x.marzo, justificacion: JUSTIFICACION }, opc(tx, dia(21))));
      await sinPermiso(reabrirMedicion(mide, { medicionId: x.marzo, justificacion: JUSTIFICACION }, opc(tx, dia(21))));
      expect((await fila(tx, x.marzo)).estado).toBe("cerrada");
      await reabrirMedicion(admin, { medicionId: x.marzo, justificacion: JUSTIFICACION }, opc(tx, dia(21)));
      await sinPermiso(cerrarDeNuevo(lider, x.marzo, opc(tx, dia(22))));
      expect((await fila(tx, x.marzo)).estado).toBe("reportada");
    }));

  it("después del cierre no se reporta, no se analiza, no se cambia la meta ni se quita un soporte; sí se observa", () =>
    revertida(sql, async (tx) => {
      const { admin, mide, nuevo } = await entorno(tx);
      const x = await nuevo({ analiza: [mide.usuarioId] });
      await reportarCon(tx, mide, x.marzo, { A: "5", B: "10" });
      const [archivo] = await tx`INSERT INTO archivos (rol, ruta, nombre_original, extension, mime, tamano_bytes, hash_sha256, contexto, contexto_id)
        VALUES ('evidencia', ${`zz/${unico()}.pdf`}, 'soporte.pdf', 'pdf', 'application/pdf', 10, ${"a".repeat(64)}, 'medicion', ${x.marzo})
        RETURNING id`;
      await cerrarMes(admin, MARZO, opc(tx));

      await rechaza(reportarCon(tx, mide, x.marzo, { A: "9", B: "10" }, dia(21)), CERRADA);
      await rechaza(marcarNoAplica(mide, { medicionId: x.marzo, motivo: "No hubo casos en marzo" }, opc(tx, dia(21))), CERRADA);
      await rechaza(
        analizar(mide, { medicionId: x.marzo, causa: "Faltó personal en marzo", accionPropuesta: "Contratar el reemplazo" }, opc(tx, dia(21))),
        CERRADA,
      );
      await rechaza(
        programarMeta(admin, { indicadorId: x.ind.id, periodo: MARZO, meta: "50", justificacion: "Ajuste posterior al cierre" }, opc(tx, dia(21))),
        "La medición de ese periodo está cerrada: reábrala para cambiar su meta",
      );
      await rechaza(quitarSoporte(mide, { archivoId: Number(archivo.id) }, opc(tx, dia(21))), CERRADA);
      // Ni por SQL directo: el trigger de la 0011.
      await expect(tx.savepoint((s) => s`UPDATE mediciones SET analisis = 'Cambio directo' WHERE id = ${x.marzo}`)).rejects.toThrow(/cerrada/);

      const m = await fila(tx, x.marzo);
      expect([m.estado, m.analisis, m.causa, m.no_aplica, m.resultado_exacto]).toEqual(["cerrada", null, null, false, "50/1"]);
      expect((await tx`SELECT count(*)::int AS n FROM archivos WHERE id = ${archivo.id}`)[0].n).toBe(1);

      const { id } = await observar(admin, { medicionId: x.marzo, texto: "¿Por qué no se analizó antes del cierre?" }, opc(tx, dia(21)));
      expect(id).toBeGreaterThan(0);
    }));
});

describe("la reapertura", () => {
  it("reabrir exige justificación, vuelve a reportada (o a abierta si no tenía datos), marca «corregida» y avisa a quien mide", () =>
    revertida(sql, async (tx) => {
      const { admin, mide, nuevo } = await entorno(tx);
      const conDatos = await nuevo();
      await reportarCon(tx, mide, conDatos.marzo, { A: "9", B: "10" });
      const vacia = await nuevo();
      await cerrarMes(admin, MARZO, opc(tx));

      await rechaza(
        reabrirMedicion(admin, { medicionId: conDatos.marzo, justificacion: "123456789" }, opc(tx, dia(21))),
        "La justificación debe tener al menos 10 caracteres",
      );
      await rechaza(
        reabrirMedicion(admin, { medicionId: conDatos.marzo, justificacion: "  12345678   " }, opc(tx, dia(21))),
        "La justificación debe tener al menos 10 caracteres",
      );
      await rechaza(
        reabrirMedicion(admin, { medicionId: conDatos.marzo, justificacion: "x".repeat(1001) }, opc(tx, dia(21))),
        "La justificación no puede pasar de 1000 caracteres",
      );
      expect((await fila(tx, conDatos.marzo)).estado).toBe("cerrada");

      await reabrirMedicion(admin, { medicionId: conDatos.marzo, justificacion: `  ${JUSTIFICACION}  ` }, opc(tx, dia(21)));
      const m = await fila(tx, conDatos.marzo);
      expect([m.estado, m.corregida, Number(m.reabierta_por), m.reabierta_en, m.reabierta_motivo, m.cierre_id, m.resultado_exacto]).toEqual([
        "reportada",
        true,
        admin.usuarioId,
        dia(21),
        JUSTIFICACION,
        null,
        "90/1",
      ]);
      const reaperturas = (await eventos(tx, conDatos.marzo)).filter((e) => e.tipo === "reapertura");
      expect(reaperturas).toHaveLength(1);
      expect(Number(reaperturas[0].usuario_id)).toBe(admin.usuarioId);
      expect(reaperturas[0].creado_en).toEqual(dia(21));
      // El estado de antes es el verdadero: estaba cerrada.
      expect(reaperturas[0].detalle).toEqual({
        justificacion: JUSTIFICACION,
        cierre: MARZO,
        antes: { resultado: "90", semaforo: "bien", estado: "cerrada" },
        despues: { resultado: "90", semaforo: "bien", estado: "reportada" },
      });

      const lista = await avisos(tx, conDatos.marzo);
      expect(lista.map((a) => Number(a.usuario_id))).toEqual([mide.usuarioId]);
      expect(lista[0].titulo).toBe(`Medición reabierta en ${conDatos.ind.codigo}`);
      expect(lista[0].cuerpo).toBe(`${admin.nombre} reabrió ${conDatos.ind.codigo}, marzo de 2003: ${JUSTIFICACION}`);
      expect(lista[0].enlace).toBe(`/indicadores/${conDatos.ind.codigo}?vista=resultados&anio=2003`);

      const [b] = await bitacora(tx, "medicion_reabierta", "medicion", conDatos.marzo);
      expect(Number(b.usuario_id)).toBe(admin.usuarioId);
      expect(b.detalle).toEqual({ codigo: conDatos.ind.codigo, indicadorId: conDatos.ind.id, periodo: MARZO, justificacion: JUSTIFICACION, cierre: MARZO, estado: "reportada" });

      // Sin datos vuelve a abierta: el evento dice «cerrada → abierta» aunque ninguna columna calculada cambie.
      await reabrirMedicion(admin, { medicionId: vacia.marzo, justificacion: "Quien mide reportará el dato tarde" }, opc(tx, dia(21)));
      const v = await fila(tx, vacia.marzo);
      expect([v.estado, v.corregida, v.cierre_id]).toEqual(["abierta", true, null]);
      const deLaVacia = await eventos(tx, vacia.marzo);
      expect(deLaVacia.map((e) => e.tipo)).toEqual(["cierre", "reapertura"]);
      expect(deLaVacia[1].detalle).toMatchObject({ antes: { estado: "cerrada" }, despues: { estado: "abierta" } });
      expect((await avisos(tx, vacia.marzo)).map((a) => Number(a.usuario_id))).toEqual([mide.usuarioId]);
    }));

  it("si quien reabre está designado para medir, el evento lo marca", () =>
    revertida(sql, async (tx) => {
      const { admin, nuevo } = await entorno(tx);
      const x = await nuevo({ mide: [admin.usuarioId] });
      await reportarCon(tx, admin, x.marzo, { A: "9", B: "10" });
      await cerrarMes(admin, MARZO, opc(tx));
      await reabrirMedicion(admin, { medicionId: x.marzo, justificacion: JUSTIFICACION }, opc(tx, dia(21)));
      const [e] = (await eventos(tx, x.marzo)).filter((f) => f.tipo === "reapertura");
      expect(e.detalle).toMatchObject({ justificacion: JUSTIFICACION, propioMedidor: true });
      expect(e.detalle).not.toHaveProperty("sinMedidor");
      const [b] = await bitacora(tx, "medicion_reabierta", "medicion", x.marzo);
      expect(b.detalle).toMatchObject({ propioMedidor: true });
      expect(describirEvento({ accion: "medicion_reabierta", entidad: "medicion", entidadId: x.marzo, detalle: b.detalle })).toContain("que también mide");
      // Quien mide es quien reabre: nadie más a quien avisar.
      expect(await avisos(tx, x.marzo)).toHaveLength(0);
    }));

  it("si quien reabre mide solo como respaldo (nadie más puede), el evento dice sinMedidor y no propioMedidor", () =>
    revertida(sql, async (tx) => {
      const { admin, nuevo } = await entorno(tx);
      const sinLider = await procesoSinLider(tx);
      const x = await nuevo({ procesoId: sinLider.id, mide: [] });
      await cerrarMes(admin, MARZO, opc(tx));
      await reabrirMedicion(admin, { medicionId: x.marzo, justificacion: JUSTIFICACION }, opc(tx, dia(21)));
      const [e] = (await eventos(tx, x.marzo)).filter((f) => f.tipo === "reapertura");
      expect(e.detalle).toMatchObject({ justificacion: JUSTIFICACION, sinMedidor: true });
      expect(e.detalle).not.toHaveProperty("propioMedidor");
      const [b] = await bitacora(tx, "medicion_reabierta", "medicion", x.marzo);
      expect(b.detalle).toMatchObject({ sinMedidor: true });
      expect(b.detalle).not.toHaveProperty("propioMedidor");
      expect(describirEvento({ accion: "medicion_reabierta", entidad: "medicion", entidadId: x.marzo, detalle: b.detalle })).not.toContain("que también mide");
    }));

  it("la reabierta se corrige y se cierra de nuevo, a mano o con el siguiente cierre", () =>
    revertida(sql, async (tx) => {
      const { admin, mide, nuevo } = await entorno(tx);
      const a = await nuevo();
      await reportarCon(tx, mide, a.marzo, { A: "9", B: "10" });
      const b = await nuevo();
      await cerrarMes(admin, MARZO, opc(tx));
      await reabrirMedicion(admin, { medicionId: a.marzo, justificacion: JUSTIFICACION }, opc(tx, dia(21)));
      await reabrirMedicion(admin, { medicionId: b.marzo, justificacion: "Quien mide reportará el dato tarde" }, opc(tx, dia(21)));

      // Quien mide corrige y el Admin SGC la cierra de nuevo a mano, con el último cierre de la base.
      await reportarCon(tx, mide, a.marzo, { A: "10", B: "10" }, dia(22));
      await tx`INSERT INTO medicion_eventos (medicion_id, tipo, usuario_id, detalle, creado_en)
        VALUES (${a.marzo}, 'soporte', ${mide.usuarioId},
          ${tx.json({ accion: "subido", nombre: "nomina-confidencial.pdf", antes: { soportes: 0 }, despues: { soportes: 1 } })}, ${dia(22)})`;
      const conCierre = await ultimoCierre(tx);
      await cerrarDeNuevo(admin, a.marzo, opc(tx, dia(23)));
      const ma = await fila(tx, a.marzo);
      expect([ma.estado, Number(ma.cierre_id), ma.corregida, ma.resultado_exacto]).toEqual(["cerrada", conCierre.id, true, "100/1"]);
      expect((await eventos(tx, a.marzo)).map((e) => e.tipo)).toEqual(["reporte", "cierre", "reapertura", "correccion", "soporte", "cierre"]);
      const [otraVez] = (await eventos(tx, a.marzo)).slice(-1);
      expect(otraVez.detalle).toMatchObject({ cierreId: conCierre.id, mes: conCierre.mes, deNuevo: true, antes: { estado: "reportada" }, despues: { estado: "cerrada" } });
      const [bit] = await bitacora(tx, "medicion_cerrada_de_nuevo", "medicion", a.marzo);
      expect(bit.detalle).toMatchObject({ codigo: a.ind.codigo, periodo: MARZO, mes: conCierre.mes, cierreId: conCierre.id });
      await rechaza(reportarCon(tx, mide, a.marzo, { A: "8", B: "10" }, dia(24)), CERRADA);

      // El historial de «Corregida», desde la reapertura: con el soporte para quien ve los soportes.
      const historial = (await historialDeCorregidas(admin, a.ind.id, [a.marzo, b.marzo], opc(tx))).get(a.marzo)!;
      expect(historial.map((e) => [e.que, e.quien, e.porque])).toEqual([
        ["Reabrió", admin.nombre, JUSTIFICACION],
        ["Corrigió", mide.nombre, null],
        ["Subió el soporte «nomina-confidencial.pdf»", mide.nombre, null],
        ["Cerró de nuevo", admin.nombre, null],
      ]);
      expect(historial[0].cambios).toEqual(["Estado: Cerrada → Reportada"]);
      expect(historial[1].cambios).toEqual(["Casos que cumplen: 9 → 10", "Resultado: 90 % → 100 %"]);
      expect(historial[2].cambios).toEqual(["Soportes: 0 → 1"]);
      expect(historial[3].cambios).toEqual(["Estado: Reportada → Cerrada"]);
      expect(historial[0].cuando).toBe("21 de abril de 2003, 10:00");
      // Quien ve el indicador y no sus soportes: el mismo historial, sin el soporte.
      const ajeno = await usuarioDePrueba(tx, { rol: "consulta" });
      const sinSoportes = (await historialDeCorregidas(ajeno, a.ind.id, [a.marzo], opc(tx))).get(a.marzo)!;
      expect(sinSoportes.map((e) => e.que)).toEqual(["Reabrió", "Corrigió", "Cerró de nuevo"]);
      expect(JSON.stringify(sinSoportes)).not.toContain("nomina-confidencial");

      // La otra se reporta tarde y la cierra el siguiente cierre.
      await reportarCon(tx, mide, b.marzo, { A: "10", B: "10" }, dia(24));
      expect((await fila(tx, b.marzo)).estado).toBe("reportada");
      const abril = await cerrarMes(admin, ABRIL, opc(tx, dia(15, 5)));
      const mb = await fila(tx, b.marzo);
      expect([mb.estado, Number(mb.cierre_id)]).toEqual(["cerrada", abril.cierreId]);
      expect((await historialDeCorregidas(admin, b.ind.id, [b.marzo], opc(tx))).get(b.marzo)!.map((e) => e.que)).toEqual([
        "Reabrió",
        "Reportó",
        "Cerró con el cierre de abril de 2003",
      ]);

      // La misma medición se reabre otra vez y se cierra de nuevo con el último cierre de la base.
      await reabrirMedicion(admin, { medicionId: a.marzo, justificacion: "Segunda revisión del dato de marzo" }, opc(tx, dia(16, 5)));
      await rechaza(
        reabrirMedicion(admin, { medicionId: a.marzo, justificacion: "Tercera revisión del dato de marzo" }, opc(tx, dia(17, 5))),
        "Solo se reabre una medición cerrada",
      );
      const otra = await fila(tx, a.marzo);
      expect([otra.estado, otra.reabierta_motivo, otra.reabierta_en]).toEqual(["reportada", "Segunda revisión del dato de marzo", dia(16, 5)]);
      expect((await eventos(tx, a.marzo)).filter((e) => e.tipo === "reapertura")).toHaveLength(2);
      const otroCierre = await ultimoCierre(tx);
      expect(otroCierre.mes >= ABRIL).toBe(true);
      await cerrarDeNuevo(admin, a.marzo, opc(tx, dia(18, 5)));
      expect(Number((await fila(tx, a.marzo)).cierre_id)).toBe(otroCierre.id);
    }));

  it("solo se reabre lo cerrado", () =>
    revertida(sql, async (tx) => {
      const { admin, mide, nuevo } = await entorno(tx);
      const x = await nuevo();
      await reportarCon(tx, mide, x.marzo, { A: "9", B: "10" });
      await rechaza(reabrirMedicion(admin, { medicionId: x.marzo, justificacion: JUSTIFICACION }, opc(tx)), "Solo se reabre una medición cerrada");
      await rechaza(cerrarDeNuevo(admin, x.marzo, opc(tx)), "Solo se cierra de nuevo una medición reabierta");
      await rechaza(reabrirMedicion(admin, { medicionId: 999_999_999, justificacion: JUSTIFICACION }, opc(tx)), "La medición no existe");
      await rechaza(cerrarDeNuevo(admin, 999_999_999, opc(tx)), "La medición no existe");
      await cerrarMes(admin, MARZO, opc(tx));
      await rechaza(cerrarDeNuevo(admin, x.marzo, opc(tx, dia(21))), "Solo se cierra de nuevo una medición reabierta");
      expect((await eventos(tx, x.marzo)).map((e) => e.tipo)).toEqual(["reporte", "cierre"]);

      // Un indicador retirado no se reabre: nadie podría corregirlo.
      await retirar(admin, { indicadorId: x.ind.id, motivo: "Ya no se mide" }, opc(tx, dia(21)));
      await rechaza(
        reabrirMedicion(admin, { medicionId: x.marzo, justificacion: JUSTIFICACION }, opc(tx, dia(22))),
        "El indicador está retirado: ya no admite reportes",
      );
    }));
});

describe("el mes por omisión y la confirmación", () => {
  it("mesPorOmision: el siguiente al último cerrado; sin cierres, el mes anterior al actual", async () => {
    const zona = zonaHoraria();
    const abril2026 = new Date("2026-04-20T15:00:00Z");
    expect(mesPorOmisionDe(null, abril2026, zona)).toBe("2026-03");
    expect(mesPorOmisionDe("2026-01", abril2026, zona)).toBe("2026-02");
    expect(mesPorOmisionDe("2026-02", abril2026, zona)).toBe("2026-03");
    // Abril no ha terminado: no hay mes que cerrar.
    expect(mesPorOmisionDe("2026-03", abril2026, zona)).toBeNull();
    // El mes en curso es el de la zona: el 1 de mayo a las 03:00 UTC aún es 30 de abril en la instalación.
    expect(mesPorOmisionDe(null, new Date("2026-05-01T03:00:00Z"), zona)).toBe("2026-03");
    expect(mesPorOmisionDe(null, new Date("2026-05-01T06:00:00Z"), zona)).toBe("2026-04");
    expect(mesPorOmisionDe("2025-11", new Date("2026-01-01T04:00:00Z"), zona)).toBeNull();
    expect(mesPorOmisionDe("2025-11", new Date("2026-01-01T06:00:00Z"), zona)).toBe("2025-12");

    await revertida(sql, async (tx) => {
      // Lo que diga la base hoy (puede haber cierres confirmados en ella).
      const [u] = await tx`SELECT to_char(max(mes), 'YYYY-MM') AS mes FROM cierres_indicadores`;
      expect(await mesPorOmision(opc(tx))).toBe(mesPorOmisionDe((u.mes as string | null) ?? null, AHORA, zona));
      // Con un cierre en un año que nadie cierra todavía.
      const admin = await sesionAdmin(tx);
      const junio = new Date("2090-06-15T15:00:00Z");
      await tx`INSERT INTO cierres_indicadores (mes, cerrado_por) VALUES ('2090-02-28', ${admin.usuarioId})`;
      expect(await mesPorOmision(opc(tx, junio))).toBe("2090-03");
      await tx`INSERT INTO cierres_indicadores (mes, cerrado_por) VALUES ('2090-05-31', ${admin.usuarioId})`;
      expect(await mesPorOmision(opc(tx, junio))).toBeNull();
    });
  });

  it("«No se cierran» concuerda en número y calla los grupos en cero", () => {
    expect(frasesDeNoSeCierran({ enPlazo: 0, historicosSinRegistrar: 0 })).toEqual([]);
    expect(frasesDeNoSeCierran({ enPlazo: 1, historicosSinRegistrar: 1 })).toEqual([
      "1 medición sigue dentro de su plazo de reporte: queda para el siguiente cierre.",
      "1 histórico sin registrar sigue abierto hasta que se registre.",
    ]);
    expect(frasesDeNoSeCierran({ enPlazo: 4, historicosSinRegistrar: 0 })).toEqual([
      "4 mediciones siguen dentro de su plazo de reporte: quedan para el siguiente cierre.",
    ]);
    expect(frasesDeNoSeCierran({ enPlazo: 0, historicosSinRegistrar: 2 })).toEqual(["2 históricos sin registrar siguen abiertos hasta que se registren."]);
  });

  it("la confirmación dice lo que se cierra, en singular o en plural", () => {
    expect(fraseDelCierre({ aCerrar: 1, reportadas: 1, sinDato: 0, noAplica: 0, sinAnalisis: 0 })).toBe(
      "Se cerrará 1 medición: 1 reportada, 0 sin dato, 0 «No aplica» y 0 sin análisis.",
    );
    expect(fraseDelCierre({ aCerrar: 5, reportadas: 2, sinDato: 1, noAplica: 1, sinAnalisis: 1 })).toBe(
      "Se cerrarán 5 mediciones: 2 reportadas, 1 sin dato, 1 «No aplica» y 1 sin análisis.",
    );
    expect(fraseDelCierre({ aCerrar: 0, reportadas: 0, sinDato: 0, noAplica: 0, sinAnalisis: 0 })).toBe(
      "No hay mediciones que cerrar: el mes queda cerrado igual y el siguiente cierre empieza después de él.",
    );
  });
});

describe("el historial de «Corregida»", () => {
  const unidad = { sufijo: " %", decimales: 1 };
  const nombres = { A: "Casos que cumplen", B: "Casos evaluados" };
  const en = new Date("2026-04-21T15:00:00Z");
  const evento = (id: number, tipo: EventoDeMedicion["tipo"], detalle: Record<string, unknown>, quien: string | null = "Ana"): EventoDeMedicion => ({
    id,
    tipo,
    quien,
    creadoEn: en,
    detalle,
  });
  const lista = [
    evento(1, "reporte", { antes: { A: null }, despues: { A: "9" } }),
    evento(2, "cierre", { mes: "2026-03", antes: { estado: "reportada" }, despues: { estado: "cerrada" } }, "Admin"),
    evento(3, "reapertura", { justificacion: JUSTIFICACION, antes: { estado: "cerrada" }, despues: { estado: "abierta" } }, "Admin"),
    evento(4, "soporte", { accion: "subido", nombre: "informe.pdf", antes: { soportes: 0 }, despues: { soportes: 1 } }),
    evento(5, "no_aplica", { antes: { noAplica: false, motivo: null }, despues: { noAplica: true, motivo: "No hubo casos" } }),
    evento(6, "analisis", { antes: { analisis: null, causa: null, accionPropuesta: null }, despues: { analisis: "Faltó personal en marzo" } }),
    evento(7, "analisis", { antes: { analisis: "Faltó personal en marzo" }, despues: { analisis: "Faltó personal" } }),
    evento(8, "meta", { justificacion: "Ajuste del plan anual", antes: { meta: "90", metaMax: null }, despues: { meta: "85", metaMax: null } }, "Admin"),
    evento(9, "recalculo", { antes: { semaforo: "bien" }, despues: { semaforo: "atencion" } }, null),
  ];

  it("empieza en la primera reapertura y dice qué había y qué quedó; los soportes, solo para quien los ve", () => {
    const h = historialDeCorreccion(lista, { unidad, nombres, conSoportes: false });
    expect(h.map((e) => [e.id, e.que, e.quien, e.porque])).toEqual([
      [3, "Reabrió", "Admin", JUSTIFICACION],
      [5, "Marcó «No aplica»", "Ana", null],
      [6, "Escribió el análisis", "Ana", null],
      [7, "Editó el análisis", "Ana", null],
      [8, "Cambió la meta", "Admin", "Ajuste del plan anual"],
      [9, "Se recalculó", "El sistema", null],
    ]);
    expect(h[0].cambios).toEqual(["Estado: Cerrada → Abierta"]);
    expect(h[1].cambios).toEqual(["No aplica: No → Sí", "Motivo: — → No hubo casos"]);
    expect(h[2].cambios).toEqual(["Análisis: (vacío) → «Faltó personal en marzo»"]);
    expect(h[4].cambios).toEqual(["Meta: 90 % → 85 %"]);
    expect(h[5].cambios).toEqual(["Semáforo: Bien → Atención"]);
    expect(h[0].cuando).toBe("21 de abril de 2026, 10:00");

    const conSoportes = historialDeCorreccion(lista, { unidad, nombres, conSoportes: true });
    expect(conSoportes.map((e) => e.id)).toEqual([3, 4, 5, 6, 7, 8, 9]);
    expect([conSoportes[1].que, conSoportes[1].cambios]).toEqual(["Subió el soporte «informe.pdf»", ["Soportes: 0 → 1"]]);
  });

  it("sin reapertura no hay historial", () => {
    expect(historialDeCorreccion([evento(1, "reporte", { antes: {}, despues: { A: "9" } })], { unidad, nombres, conSoportes: true })).toEqual([]);
  });
});
