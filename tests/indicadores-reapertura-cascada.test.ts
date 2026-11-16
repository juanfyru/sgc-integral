/**
 * La reapertura en cascada (anexo 14C, §3.5; Tarea 16 de la 14C): reabrir un periodo cerrado de un dato compartido, o la
 * medición cerrada de un componente, reabre también las mediciones cerradas que lo usaron y las que dependen de esas; las de
 * un indicador retirado o de otra periodicidad quedan como están. Antes de confirmar, la lista; al confirmar, cada una
 * «Corregida», con su evento, su aviso y su entrada de bitácora, que dicen que fue por la fuente; y «Cerrar de nuevo» no
 * cierra lo que tiene su fuente abierta.
 *
 * Contra la BD de desarrollo, dentro de una transacción que se revierte, en 2003 y con `ahora` inyectado, como
 * `indicadores-cierre.test.ts`. El dato es mensual y se abre el 1 de abril (`ABRE`); el mensual y el compuesto que lo toma
 * empiezan en marzo, el trimestral en el primer trimestre; todos de forma «porcentaje», meta 90, aprobados en diciembre de
 * 2002, y su plazo venció el 10 de abril: el cierre de marzo, el 20 de abril (`AHORA`), los cierra.
 */
import { existsSync } from "node:fs";
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { cerrarDeNuevo, cerrarMes, historialDeCorregidas, reabrirMedicion, resumenDeCierre } from "@/db/consultas/indicadores/cierre";
import { asegurarPeriodosDeDatos, cerrarDeNuevoElDato, reportarDato } from "@/db/consultas/indicadores/datos-periodos";
import { asegurarMediciones, reportar } from "@/db/consultas/indicadores/mediciones";
import { retirar } from "@/db/consultas/indicadores/operacion";
import { propagar } from "@/db/consultas/indicadores/propagacion";
import { listaDeReapertura, reabrirEnCascada, reaperturaEnTexto } from "@/db/consultas/indicadores/reapertura";
import { describirEvento } from "@/lib/bitacora-detalle";
import { EsquemaReapertura, MAXIMO_VISTAS } from "@/lib/esquemas/indicadores";
import { parsearFormulario } from "@/lib/validacion";
import { ErrorIndicador } from "@/lib/indicadores/tipos";
import { ErrorPermiso } from "@/lib/permisos";
import { datoDePrueba, indicadorDePrueba, versionTrimestral, type OpcionesIndicadorDePrueba } from "./utiles/indicadores";
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
const ABRE = new Date("2003-04-01T15:00:00Z");
const APROBADA = new Date("2002-12-15T15:00:00Z");
const MARZO = "2003-03";
const T1 = "2003-T1";
const dia = (d: number, mes = 4) => new Date(`2003-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}T15:00:00Z`);
const JUSTIFICACION = "Facturación detectó dos facturas anuladas que no se descontaron";
const FUENTE_ABIERTA = "Su fuente sigue abierta: ciérrela primero";

const opc = (tx: TransactionSql, ahora = AHORA) => ({ sql: tx, ahora });
const fila = async (tx: TransactionSql, id: number) => (await tx`SELECT * FROM mediciones WHERE id = ${id}`)[0];
const periodoDelDato = async (tx: TransactionSql, id: number) => (await tx`SELECT * FROM variable_valores WHERE id = ${id}`)[0];
const medicionDe = async (tx: TransactionSql, indicadorId: number, periodo: string) =>
  Number((await tx`SELECT id FROM mediciones WHERE indicador_id = ${indicadorId} AND periodo = ${periodo}`)[0].id);
const eventos = (tx: TransactionSql, id: number) => tx`SELECT tipo, usuario_id, detalle FROM medicion_eventos WHERE medicion_id = ${id} ORDER BY id`;
const eventosDelDato = (tx: TransactionSql, id: number) => tx`SELECT tipo, usuario_id, detalle FROM variable_eventos WHERE valor_id = ${id} ORDER BY id`;
const avisos = (tx: TransactionSql, id: number) =>
  tx`SELECT usuario_id, titulo, cuerpo FROM notificaciones WHERE tipo = 'indicadores.reabierta' AND entidad = 'medicion' AND entidad_id = ${id} ORDER BY usuario_id`;
const avisosDelDato = (tx: TransactionSql, datoId: number) =>
  tx`SELECT usuario_id, titulo, cuerpo, enlace FROM notificaciones
    WHERE tipo = 'indicadores.dato_reabierto' AND entidad = 'dato_compartido' AND entidad_id = ${datoId} ORDER BY usuario_id`;
const bitacora = (tx: TransactionSql, accion: string, entidad: string, entidadId: number) =>
  tx`SELECT usuario_id, detalle FROM auditoria WHERE accion = ${accion} AND entidad = ${entidad} AND entidad_id = ${entidadId} ORDER BY id`;

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

async function procesoNuevo(tx: TransactionSql): Promise<number> {
  const sigla = `Z${unico()}`;
  const [macro] = await tx`SELECT id FROM macroprocesos ORDER BY id LIMIT 1`;
  const [p] = await tx`INSERT INTO procesos (macroproceso_id, nombre, sigla, slug, icono, orden)
    VALUES (${macro.id}, ${`Proceso ${sigla}`}, ${sigla}, ${sigla.toLowerCase()}, 'circle', 99) RETURNING id`;
  return Number(p.id);
}

/** Quien administra, quien mide, quien analiza los compuestos y quien responde por el dato; los ayudantes de armar. */
async function entorno(tx: TransactionSql) {
  const admin = await sesionAdmin(tx);
  const mide = await usuarioDePrueba(tx, { rol: "consulta" });
  const analiza = await usuarioDePrueba(tx, { rol: "consulta" });
  const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
  const base = await resumenDeCierre(admin, MARZO, opc(tx));
  expect(base, "el año de las pruebas no debe alcanzar mediciones ni datos de la base").toMatchObject({ aCerrar: 0, datos: { seCierran: 0 } });
  const procesoId = Number((await tx`SELECT id FROM procesos WHERE sigla = 'GTH'`)[0].id);

  const nuevo = async (o: OpcionesIndicadorDePrueba = {}) => {
    const ind = await indicadorDePrueba(tx, { procesoId, inicioMedicion: MARZO, aprobadaEn: APROBADA, mide: [mide.usuarioId], ...o });
    await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: ind.id });
    return ind;
  };
  const espejo = (origen: number, o: OpcionesIndicadorDePrueba = {}) =>
    nuevo({
      mide: [],
      analiza: [analiza.usuarioId],
      formula: "A",
      variables: { A: { indicadorOrigenId: origen, toma: "valor" }, B: { indicadorOrigenId: origen, toma: "cumplimiento" } },
      ...o,
    });
  const dato = async () => {
    const id = await datoDePrueba(tx, { procesoId, nombre: `ZZ Total facturado ${unico()}`, responsables: [responsable.usuarioId] });
    const [d] = await tx`SELECT nombre FROM variables_compartidas WHERE id = ${id}`;
    return { id, nombre: d.nombre as string };
  };
  /** Abre los periodos del dato el 1 de abril y devuelve el id de cada uno, por clave. */
  const abrirDato = async (datoId: number) => {
    await asegurarPeriodosDeDatos({ sql: tx, ahora: ABRE, datoIds: [datoId] });
    const filas = await tx`SELECT id, periodo FROM variable_valores WHERE variable_id = ${datoId}`;
    return Object.fromEntries(filas.map((f) => [f.periodo as string, Number(f.id)])) as Record<string, number>;
  };
  const reportarElDato = async (periodoId: number, valor: string, ahora = AHORA) => {
    const r = await reportarDato(responsable, { periodoId, valor, confirmado: true }, opc(tx, ahora));
    expect(r.ok).toBe(true);
  };
  const reportarLoPropio = (quien: SesionFlujo, medicionId: number, valores: Record<string, string>, ahora = AHORA) =>
    reportar(quien, { medicionId, valores, parcial: false, confirmado: true }, opc(tx, ahora));
  return { admin, mide, analiza, responsable, procesoId, nuevo, espejo, dato, abrirDato, reportarElDato, reportarLoPropio };
}

/**
 * El dato de marzo que usan un mensual, un trimestral (que junta enero a marzo) y un compuesto que toma al mensual, todo
 * reportado, propagado y cerrado con el cierre de marzo. El mensual da 9/10 = 90 %; el trimestral, 27/30 = 90 %.
 */
async function cerradoConSusUsuarios(tx: TransactionSql) {
  const e = await entorno(tx);
  const d = await e.dato();
  const mensual = await e.nuevo({ variables: { B: { datoId: d.id } } });
  const trimestral = await e.nuevo({ periodicidad: "trimestral", inicioMedicion: T1, variables: { B: { datoId: d.id } } });
  const compuesto = await e.espejo(mensual.id);
  const periodos = await e.abrirDato(d.id);
  for (const clave of ["2003-01", "2003-02", MARZO]) await e.reportarElDato(periodos[clave], "10");
  const m = {
    mensual: await medicionDe(tx, mensual.id, MARZO),
    trimestral: await medicionDe(tx, trimestral.id, T1),
    compuesto: await medicionDe(tx, compuesto.id, MARZO),
  };
  await e.reportarLoPropio(e.mide, m.mensual, { A: "9" });
  await e.reportarLoPropio(e.mide, m.trimestral, { A: "27" });
  await propagar(opc(tx));
  const { cierreId } = await cerrarMes(e.admin, MARZO, opc(tx));
  for (const id of Object.values(m)) expect((await fila(tx, id)).estado).toBe("cerrada");
  expect((await periodoDelDato(tx, periodos[MARZO])).estado).toBe("cerrado");
  return { ...e, d, mensual, trimestral, compuesto, periodos, m, marzo: periodos[MARZO], cierreId };
}

/** Una constancia registrada del primer trimestre del indicador, enviada al ente el 12 de abril. */
async function constanciaRegistrada(tx: TransactionSql, indicadorId: number, usuarioId: number): Promise<number> {
  const [r] = await tx`INSERT INTO reportes_externos (indicador_id, periodo, desde, hasta, vence_en, ente, estado, fecha_envio, radicado,
      resultado_enviado, registrada_por, registrada_en)
    SELECT ${indicadorId}, ${T1}, m.desde, m.hasta, m.vence_en, 'Superintendencia', 'registrada', '2003-04-12', 'RAD-1', '90',
      ${usuarioId}, ${dia(12)}
    FROM mediciones m WHERE m.indicador_id = ${indicadorId} AND m.periodo = ${T1}
    RETURNING id`;
  return Number(r.id);
}

describe("la lista antes de confirmar", () => {
  it("reabrir el dato de marzo trae al mensual y al trimestral (nivel 1) y al compuesto que toma al mensual (nivel 2)", () =>
    revertida(sql, async (tx) => {
      const c = await cerradoConSusUsuarios(tx);
      await constanciaRegistrada(tx, c.trimestral.id, c.admin.usuarioId);
      const lista = await listaDeReapertura(c.admin, { clase: "dato", periodoId: c.marzo }, opc(tx));
      expect(lista.titulo).toBe(`Reabrir «${c.d.nombre}» · marzo de 2003`);
      const porCodigo = (x: { codigo: string }, y: { codigo: string }) => x.codigo.localeCompare(y.codigo, "es");
      const nivel1 = [
        { medicionId: c.m.mensual, indicadorId: c.mensual.id, codigo: c.mensual.codigo, periodo: MARZO },
        { medicionId: c.m.trimestral, indicadorId: c.trimestral.id, codigo: c.trimestral.codigo, periodo: T1 },
      ].sort(porCodigo);
      expect(lista.seReabren.map((x) => ({ medicionId: x.medicionId, indicadorId: x.indicadorId, codigo: x.codigo, periodo: x.periodo }))).toEqual([
        ...nivel1,
        { medicionId: c.m.compuesto, indicadorId: c.compuesto.id, codigo: c.compuesto.codigo, periodo: MARZO },
      ]);
      expect(lista.seReabren.map((x) => [x.nivel, x.seReabre, x.porQueNo])).toEqual([
        [1, true, null],
        [1, true, null],
        [2, true, null],
      ]);
      expect(lista.seReabren.find((x) => x.codigo === c.mensual.codigo)?.nombre).toBe(`Indicador de prueba ${c.mensual.codigo}`);
      // La constancia del trimestre ya registrada: la lista lo dice, con la fecha de envío.
      const deTrimestral = lista.seReabren.find((x) => x.codigo === c.trimestral.codigo)!;
      expect(deTrimestral.constanciaEn?.toISOString()).toBe(new Date("2003-04-12T05:00:00Z").toISOString());
      expect(lista.seReabren.find((x) => x.codigo === c.mensual.codigo)?.constanciaEn).toBeNull();
      expect(lista.noSeReabren).toEqual([]);

      // Con el trimestral retirado, queda como está.
      await retirar(c.admin, { indicadorId: c.trimestral.id, motivo: "Ya no se mide así" }, opc(tx, dia(21)));
      const otra = await listaDeReapertura(c.admin, { clase: "dato", periodoId: c.marzo }, opc(tx, dia(21)));
      expect(otra.seReabren.map((x) => x.codigo)).toEqual([c.mensual.codigo, c.compuesto.codigo]);
      expect(otra.noSeReabren.map((x) => [x.codigo, x.seReabre, x.porQueNo])).toEqual([[c.trimestral.codigo, false, "retirado"]]);

      // Solo quien administra.
      await sinPermiso(listaDeReapertura(c.mide, { clase: "dato", periodoId: c.marzo }, opc(tx)));
    }));
});

describe("la cascada", () => {
  it("reabre el dato y lo que lo usó, cada una «Corregida» con su evento, su aviso y su bitácora; el retirado no cambia ni lanza", () =>
    revertida(sql, async (tx) => {
      const c = await cerradoConSusUsuarios(tx);
      const constancia = await constanciaRegistrada(tx, c.trimestral.id, c.admin.usuarioId);
      const [antes] = await tx`SELECT * FROM reportes_externos WHERE id = ${constancia}`;
      await retirar(c.admin, { indicadorId: c.trimestral.id, motivo: "Ya no se mide así" }, opc(tx, dia(21)));
      const cerradoAntes = await periodoDelDato(tx, c.marzo);

      const r = await reabrirEnCascada(c.admin, { fuente: { clase: "dato", periodoId: c.marzo }, justificacion: `  ${JUSTIFICACION}  ` }, opc(tx, dia(22)));
      expect(r).toEqual({ reabiertas: 2, sinTocar: 1 });

      const p = await periodoDelDato(tx, c.marzo);
      expect([p.estado, p.corregido, Number(p.reabierto_por), p.reabierto_en, p.reapertura_justificacion, p.cierre_id]).toEqual([
        "reportado",
        true,
        c.admin.usuarioId,
        dia(22),
        JUSTIFICACION,
        null,
      ]);
      const [ev] = (await eventosDelDato(tx, c.marzo)).filter((e) => e.tipo === "reapertura");
      expect(Number(ev.usuario_id)).toBe(c.admin.usuarioId);
      expect(ev.detalle).toMatchObject({ justificacion: JUSTIFICACION, cierre: MARZO, antes: { estado: "cerrado" }, despues: { estado: "reportado" } });
      expect(ev.detalle).not.toHaveProperty("propioResponsable");
      const [bd] = await bitacora(tx, "dato_reabierto", "dato_compartido", c.d.id);
      expect(bd.detalle).toMatchObject({ periodo: MARZO, periodoId: c.marzo, justificacion: JUSTIFICACION, reabiertas: 2, sinTocar: 1 });

      for (const [id, destinatario] of [
        [c.m.mensual, c.mide.usuarioId],
        [c.m.compuesto, c.analiza.usuarioId],
      ] as const) {
        const m = await fila(tx, id);
        expect([m.estado, m.corregida, Number(m.reabierta_por), m.reabierta_en, m.cierre_id]).toEqual(["reportada", true, c.admin.usuarioId, dia(22), null]);
        const [e] = (await eventos(tx, id)).filter((x) => x.tipo === "reapertura");
        expect(e.detalle).toMatchObject({ justificacion: JUSTIFICACION, cierre: MARZO, porFuente: { clase: "dato", id: c.marzo }, antes: { estado: "cerrada" } });
        const lista = await avisos(tx, id);
        expect(lista.map((a) => Number(a.usuario_id))).toEqual([destinatario]);
        const [b] = await bitacora(tx, "medicion_reabierta", "medicion", id);
        expect(b.detalle).toMatchObject({ justificacion: JUSTIFICACION, porFuente: { clase: "dato", id: c.marzo } });
      }
      // Quien mide el mensual no ve el dato (no es su responsable ni líder de su proceso): el aviso no lo nombra.
      const [aviso] = await avisos(tx, c.m.mensual);
      expect(aviso.cuerpo).toBe(`${c.admin.nombre} reabrió ${c.mensual.codigo}, marzo de 2003, por un cambio en una de sus fuentes: ${JUSTIFICACION}`);
      // El historial de la reabierta dice por qué fuente fue, resuelto al leer según quien lee.
      const porLaFuente = async (quien: SesionFlujo) =>
        (await historialDeCorregidas(quien, c.mensual.id, [c.m.mensual], opc(tx))).get(c.m.mensual)!.find((x) => x.que === "Reabrió")?.fuente;
      expect(await porLaFuente(c.admin)).toBe(`Por un cambio en el dato «${c.d.nombre}», marzo de 2003`);
      expect(await porLaFuente(c.mide)).toBe("Por un cambio en una de sus fuentes");
      const [bm] = await bitacora(tx, "medicion_reabierta", "medicion", c.m.mensual);
      expect(describirEvento({ accion: "medicion_reabierta", entidad: "medicion", entidadId: c.m.mensual, detalle: bm.detalle })).toContain(
        ", por un cambio en un dato compartido",
      );
      // Los responsables del dato reciben su aviso (D1): el periodo vuelve para que lo corrijan o lo reporten tarde.
      const [delDato] = await avisosDelDato(tx, c.d.id);
      expect(delDato).toMatchObject({
        usuario_id: c.responsable.usuarioId,
        titulo: `Dato compartido reabierto: ${c.d.nombre}`,
        cuerpo: `${c.admin.nombre} reabrió el dato «${c.d.nombre}», marzo de 2003: ${JUSTIFICACION}`,
        enlace: `/indicadores/datos/${c.d.id}`,
      });
      expect(await avisosDelDato(tx, c.d.id)).toHaveLength(1);
      // Su plazo y sus marcas de aviso no se tocan.
      expect(p.vence_en).toEqual(cerradoAntes.vence_en);

      // El retirado queda como estaba, y su constancia no cambia.
      const t = await fila(tx, c.m.trimestral);
      expect([t.estado, t.corregida, Number(t.cierre_id)]).toEqual(["cerrada", false, c.cierreId]);
      expect((await eventos(tx, c.m.trimestral)).filter((x) => x.tipo === "reapertura")).toHaveLength(0);
      const [despues] = await tx`SELECT * FROM reportes_externos WHERE id = ${constancia}`;
      expect(despues).toEqual(antes);

      // Corregido el dato y propagado, las reabiertas tienen el resultado nuevo: 9/18 = 50 %.
      await c.reportarElDato(c.marzo, "18", dia(23));
      await propagar(opc(tx, dia(23)));
      expect((await fila(tx, c.m.mensual)).resultado_exacto).toBe("50/1");
      expect((await fila(tx, c.m.compuesto)).resultado_exacto).toBe("50/1");
      expect((await fila(tx, c.m.trimestral)).resultado_exacto).toBe("90/1");
    }));

  it("si quien reabre el dato es además quien lo reporta, el evento lo marca", () =>
    revertida(sql, async (tx) => {
      const c = await cerradoConSusUsuarios(tx);
      await tx`INSERT INTO variable_responsables (variable_id, usuario_id) VALUES (${c.d.id}, ${c.admin.usuarioId})`;
      await reabrirEnCascada(c.admin, { fuente: { clase: "dato", periodoId: c.marzo }, justificacion: JUSTIFICACION }, opc(tx, dia(22)));
      const [ev] = (await eventosDelDato(tx, c.marzo)).filter((e) => e.tipo === "reapertura");
      expect(ev.detalle).toMatchObject({ propioResponsable: true });
      const [bd] = await bitacora(tx, "dato_reabierto", "dato_compartido", c.d.id);
      expect(bd.detalle).toMatchObject({ propioResponsable: true });
      // Quien reabre no se avisa a sí mismo; el otro responsable, sí.
      expect((await avisosDelDato(tx, c.d.id)).map((a) => Number(a.usuario_id))).toEqual([c.responsable.usuarioId]);
      const frase = describirEvento({ accion: "dato_reabierto", entidad: "dato_compartido", entidadId: c.d.id, detalle: bd.detalle });
      expect(frase).toBe(
        `Reabrió el dato compartido «${c.d.nombre}», marzo de 2003, y con él 3 mediciones que lo usaron; quien lo reabrió también lo reporta: ${JUSTIFICACION}`,
      );
    }));

  it("se confirma lo que se vio: si lo que se reabre cambió desde que se pintó la lista, no se reabre nada", () =>
    revertida(sql, async (tx) => {
      const c = await cerradoConSusUsuarios(tx);
      const fuente = { clase: "dato" as const, periodoId: c.marzo };
      const vistas = [c.m.mensual, c.m.trimestral, c.m.compuesto].sort((a, b) => a - b);
      // El diálogo listó solo el mensual: entretanto se cerraron el trimestral y el compuesto.
      await rechaza(
        reabrirEnCascada(c.admin, { fuente, justificacion: JUSTIFICACION, vistas: [c.m.mensual] }, opc(tx, dia(22))),
        "Lo que se reabre cambió mientras se confirmaba: revise la lista y vuelva a intentarlo",
      );
      expect((await periodoDelDato(tx, c.marzo)).estado).toBe("cerrado");
      for (const id of vistas) expect((await fila(tx, id)).estado).toBe("cerrada");
      // La misma lista, en otro orden, pasa.
      expect(await reabrirEnCascada(c.admin, { fuente, justificacion: JUSTIFICACION, vistas: [...vistas].reverse() }, opc(tx, dia(22)))).toEqual({
        reabiertas: 3,
        sinTocar: 0,
      });
    }));

  it("se confirma lo que se vio también al reabrir una medición con dependientes (la fuente va en lo que se listó)", () =>
    revertida(sql, async (tx) => {
      const e = await entorno(tx);
      const componente = await e.nuevo();
      const compuesto = await e.espejo(componente.id);
      const deComponente = await medicionDe(tx, componente.id, MARZO);
      const deCompuesto = await medicionDe(tx, compuesto.id, MARZO);
      await e.reportarLoPropio(e.mide, deComponente, { A: "9", B: "10" });
      await propagar(opc(tx));
      await cerrarMes(e.admin, MARZO, opc(tx));
      expect((await fila(tx, deCompuesto)).estado).toBe("cerrada");
      await rechaza(
        reabrirMedicion(e.admin, { medicionId: deComponente, justificacion: JUSTIFICACION, vistas: [deComponente] }, opc(tx, dia(22))),
        "Lo que se reabre cambió mientras se confirmaba: revise la lista y vuelva a intentarlo",
      );
      expect((await fila(tx, deComponente)).estado).toBe("cerrada");
      await reabrirMedicion(e.admin, { medicionId: deComponente, justificacion: JUSTIFICACION, vistas: [deCompuesto, deComponente] }, opc(tx, dia(22)));
      expect((await fila(tx, deCompuesto)).corregida).toBe(true);
    }));

  it("el aviso nombra el dato a quien sí lo ve", () =>
    revertida(sql, async (tx) => {
      const e = await entorno(tx);
      const gerente = await usuarioDePrueba(tx, { rol: "gerencia" });
      const d = await e.dato();
      const mixto = await e.nuevo({ mide: [gerente.usuarioId], variables: { B: { datoId: d.id } } });
      const periodos = await e.abrirDato(d.id);
      await e.reportarElDato(periodos[MARZO], "10");
      const marzo = await medicionDe(tx, mixto.id, MARZO);
      await e.reportarLoPropio(gerente, marzo, { A: "9" });
      await propagar(opc(tx));
      await cerrarMes(e.admin, MARZO, opc(tx));
      await reabrirEnCascada(e.admin, { fuente: { clase: "dato", periodoId: periodos[MARZO] }, justificacion: JUSTIFICACION }, opc(tx, dia(22)));
      const [aviso] = await avisos(tx, marzo);
      expect(aviso.cuerpo).toBe(`${e.admin.nombre} reabrió ${mixto.codigo}, marzo de 2003, por un cambio en el dato «${d.nombre}», marzo de 2003: ${JUSTIFICACION}`);
    }));

  it("justificación corta, sin administrar o sin cerrar: rechazo, y nada cambia", () =>
    revertida(sql, async (tx) => {
      const c = await cerradoConSusUsuarios(tx);
      const fuente = { clase: "dato" as const, periodoId: c.marzo };
      await rechaza(reabrirEnCascada(c.admin, { fuente, justificacion: "123456789" }, opc(tx, dia(22))), "La justificación debe tener al menos 10 caracteres");
      await sinPermiso(reabrirEnCascada(c.mide, { fuente, justificacion: JUSTIFICACION }, opc(tx, dia(22))));
      expect((await periodoDelDato(tx, c.marzo)).estado).toBe("cerrado");
      expect((await fila(tx, c.m.mensual)).estado).toBe("cerrada");

      await reabrirEnCascada(c.admin, { fuente, justificacion: JUSTIFICACION }, opc(tx, dia(22)));
      await rechaza(reabrirEnCascada(c.admin, { fuente, justificacion: JUSTIFICACION }, opc(tx, dia(23))), "Solo se reabre lo que está cerrado");
      await rechaza(
        reabrirEnCascada(c.admin, { fuente: { clase: "medicion", medicionId: c.m.mensual }, justificacion: JUSTIFICACION }, opc(tx, dia(23))),
        "Solo se reabre lo que está cerrado",
      );
    }));

  it("reportar tarde: un dato cerrado sin valor se reabre pendiente, se reporta y lo que se cerró «Sin dato» tiene resultado", () =>
    revertida(sql, async (tx) => {
      const e = await entorno(tx);
      const d = await e.dato();
      const mixto = await e.nuevo({ variables: { B: { datoId: d.id } } });
      const periodos = await e.abrirDato(d.id);
      const marzo = await medicionDe(tx, mixto.id, MARZO);
      await e.reportarLoPropio(e.mide, marzo, { A: "9" });
      await cerrarMes(e.admin, MARZO, opc(tx));
      const cerrado = await periodoDelDato(tx, periodos[MARZO]);
      expect([cerrado.estado, cerrado.valor]).toEqual(["cerrado", null]);
      expect([(await fila(tx, marzo)).estado, (await fila(tx, marzo)).resultado_exacto]).toEqual(["cerrada", null]);

      const r = await reabrirEnCascada(e.admin, { fuente: { clase: "dato", periodoId: periodos[MARZO] }, justificacion: JUSTIFICACION }, opc(tx, dia(22)));
      expect(r).toEqual({ reabiertas: 1, sinTocar: 0 });
      expect((await periodoDelDato(tx, periodos[MARZO])).estado).toBe("pendiente");
      expect((await fila(tx, marzo)).estado).toBe("abierta");
      await e.reportarElDato(periodos[MARZO], "10", dia(23));
      await propagar(opc(tx, dia(23)));
      expect((await fila(tx, marzo)).resultado_exacto).toBe("90/1");
    }));

  it("cerrar de nuevo: no con su fuente abierta; tras cerrar de nuevo el dato, sí", () =>
    revertida(sql, async (tx) => {
      const c = await cerradoConSusUsuarios(tx);
      await rechaza(cerrarDeNuevoElDato(c.admin, c.marzo, opc(tx, dia(21))), "Solo se cierra de nuevo un periodo reabierto");
      await reabrirEnCascada(c.admin, { fuente: { clase: "dato", periodoId: c.marzo }, justificacion: JUSTIFICACION }, opc(tx, dia(22)));
      await rechaza(cerrarDeNuevo(c.admin, c.m.mensual, opc(tx, dia(23))), FUENTE_ABIERTA);
      // El compuesto toma al mensual, que sigue reabierto.
      await rechaza(cerrarDeNuevo(c.admin, c.m.compuesto, opc(tx, dia(23))), FUENTE_ABIERTA);
      await sinPermiso(cerrarDeNuevoElDato(c.mide, c.marzo, opc(tx, dia(23))));

      await cerrarDeNuevoElDato(c.admin, c.marzo, opc(tx, dia(23)));
      const p = await periodoDelDato(tx, c.marzo);
      const [ultimo] = await tx`SELECT id, to_char(mes, 'YYYY-MM') AS mes FROM cierres_indicadores ORDER BY mes DESC LIMIT 1`;
      expect([p.estado, Number(p.cierre_id)]).toEqual(["cerrado", Number(ultimo.id)]);
      const [ev] = (await eventosDelDato(tx, c.marzo)).filter((e) => e.tipo === "cierre").slice(-1);
      expect(ev.detalle).toMatchObject({ deNuevo: true, cierreId: Number(ultimo.id), antes: { estado: "reportado" }, despues: { estado: "cerrado" } });
      const [b] = await bitacora(tx, "dato_cerrado_de_nuevo", "dato_compartido", c.d.id);
      expect(b.detalle).toMatchObject({ periodo: MARZO, periodoId: c.marzo, cierreId: Number(ultimo.id) });

      await cerrarDeNuevo(c.admin, c.m.mensual, opc(tx, dia(24)));
      await cerrarDeNuevo(c.admin, c.m.compuesto, opc(tx, dia(24)));
      expect((await fila(tx, c.m.mensual)).estado).toBe("cerrada");
      expect((await fila(tx, c.m.compuesto)).estado).toBe("cerrada");
    }));

  it("reabrir la medición de un componente desde su página reabre también el compuesto", () =>
    revertida(sql, async (tx) => {
      const e = await entorno(tx);
      const componente = await e.nuevo();
      const compuesto = await e.espejo(componente.id);
      const deComponente = await medicionDe(tx, componente.id, MARZO);
      const deCompuesto = await medicionDe(tx, compuesto.id, MARZO);
      await e.reportarLoPropio(e.mide, deComponente, { A: "9", B: "10" });
      await propagar(opc(tx));
      await cerrarMes(e.admin, MARZO, opc(tx));

      const lista = await listaDeReapertura(e.admin, { clase: "medicion", medicionId: deComponente }, opc(tx));
      expect(lista.titulo).toBe(`Reabrir ${componente.codigo}, marzo de 2003`);
      expect(lista.seReabren.map((x) => [x.medicionId, x.nivel])).toEqual([[deCompuesto, 1]]);

      await reabrirMedicion(e.admin, { medicionId: deComponente, justificacion: JUSTIFICACION }, opc(tx, dia(22)));
      for (const id of [deComponente, deCompuesto]) {
        const m = await fila(tx, id);
        expect([m.estado, m.corregida]).toEqual(["reportada", true]);
      }
      const [deLaFuente] = (await eventos(tx, deComponente)).filter((x) => x.tipo === "reapertura");
      expect(deLaFuente.detalle).not.toHaveProperty("porFuente");
      const [delCompuesto] = (await eventos(tx, deCompuesto)).filter((x) => x.tipo === "reapertura");
      expect(delCompuesto.detalle).toMatchObject({ porFuente: { clase: "medicion", id: deComponente } });
      await rechaza(cerrarDeNuevo(e.admin, deCompuesto, opc(tx, dia(23))), FUENTE_ABIERTA);
    }));

  it("un componente cerrado «Sin dato» y su compuesto, cerrado «Sin dato» por él: reabrir el componente reabre el compuesto", () =>
    revertida(sql, async (tx) => {
      const e = await entorno(tx);
      const componente = await e.nuevo();
      const compuesto = await e.espejo(componente.id);
      const deComponente = await medicionDe(tx, componente.id, MARZO);
      const deCompuesto = await medicionDe(tx, compuesto.id, MARZO);
      await cerrarMes(e.admin, MARZO, opc(tx));
      for (const id of [deComponente, deCompuesto]) expect([(await fila(tx, id)).estado, (await fila(tx, id)).resultado_exacto]).toEqual(["cerrada", null]);

      const lista = await listaDeReapertura(e.admin, { clase: "medicion", medicionId: deComponente }, opc(tx));
      expect(lista.seReabren.map((x) => [x.medicionId, x.nivel])).toEqual([[deCompuesto, 1]]);
      await reabrirMedicion(e.admin, { medicionId: deComponente, justificacion: JUSTIFICACION }, opc(tx, dia(22)));
      expect((await fila(tx, deCompuesto)).corregida).toBe(true);
      // Reportado tarde el componente, la propagación completa al compuesto reabierto.
      await e.reportarLoPropio(e.mide, deComponente, { A: "9", B: "10" }, dia(23));
      await propagar(opc(tx, dia(23)));
      expect((await fila(tx, deCompuesto)).resultado_exacto).toBe("90/1");
    }));

  it("el aviso nombra la fuente solo a quien la ve: un general que toma un restringido avisa sin nombrarlo a quien no lo ve", () =>
    revertida(sql, async (tx) => {
      const e = await entorno(tx);
      const otroProceso = await procesoNuevo(tx);
      const ana = await usuarioDePrueba(tx, { rol: "consulta" });
      const gerente = await usuarioDePrueba(tx, { rol: "gerencia" });
      const restringido = await e.nuevo({ procesoId: otroProceso, nivelAcceso: "restringido" });
      const general = await e.nuevo({ mide: [ana.usuarioId, gerente.usuarioId], variables: { B: { indicadorOrigenId: restringido.id, toma: "valor" } } });
      const deRestringido = await medicionDe(tx, restringido.id, MARZO);
      const deGeneral = await medicionDe(tx, general.id, MARZO);
      await e.reportarLoPropio(e.mide, deRestringido, { A: "9", B: "10" });
      await propagar(opc(tx));
      await e.reportarLoPropio(ana, deGeneral, { A: "81" });
      await cerrarMes(e.admin, MARZO, opc(tx));
      expect((await fila(tx, deGeneral)).estado).toBe("cerrada");

      await reabrirMedicion(e.admin, { medicionId: deRestringido, justificacion: JUSTIFICACION }, opc(tx, dia(22)));
      const porUsuario = new Map((await avisos(tx, deGeneral)).map((a) => [Number(a.usuario_id), a.cuerpo as string]));
      expect([...porUsuario.keys()].sort((x, y) => x - y)).toEqual([ana.usuarioId, gerente.usuarioId].sort((x, y) => x - y));
      const nombre = `Indicador de prueba ${restringido.codigo}`;
      expect(porUsuario.get(ana.usuarioId)).toBe(`${e.admin.nombre} reabrió ${general.codigo}, marzo de 2003, por un cambio en un componente: ${JUSTIFICACION}`);
      expect(porUsuario.get(gerente.usuarioId)).toBe(
        `${e.admin.nombre} reabrió ${general.codigo}, marzo de 2003, por un cambio en ${restringido.codigo} ${nombre}, marzo de 2003: ${JUSTIFICACION}`,
      );
      // Ni el evento ni la bitácora del general guardan el código o el nombre de la fuente: solo su referencia.
      const lo = JSON.stringify([...(await eventos(tx, deGeneral)), ...(await bitacora(tx, "medicion_reabierta", "medicion", deGeneral))]);
      expect(lo).not.toContain(restringido.codigo);
      expect(lo).not.toContain(nombre);
      expect(lo).toContain('"porFuente"');
      // El historial de la reabierta, el mismo evento para dos lectores: lo resuelve al leer, según quien lee.
      const historial = async (quien: SesionFlujo) => (await historialDeCorregidas(quien, general.id, [deGeneral], opc(tx))).get(deGeneral)!;
      const deAna = await historial(ana);
      expect(deAna.find((x) => x.que === "Reabrió")?.fuente).toBe("Por un cambio en un componente");
      expect(JSON.stringify(deAna)).not.toContain(restringido.codigo);
      expect((await historial(gerente)).find((x) => x.que === "Reabrió")?.fuente).toBe(`Por un cambio en ${restringido.codigo} ${nombre}, marzo de 2003`);
      const [b] = await bitacora(tx, "medicion_reabierta", "medicion", deGeneral);
      const frase = describirEvento({ accion: "medicion_reabierta", entidad: "medicion", entidadId: deGeneral, detalle: b.detalle });
      expect(frase).toContain(", por un cambio en un componente");
      expect(frase).not.toContain(restringido.codigo);
    }));

  it("la lista del diálogo, en texto: la fuente primero, la retirada, la de otra periodicidad y la constancia ya enviada", () =>
    revertida(sql, async (tx) => {
      const e = await entorno(tx);
      const componente = await e.nuevo();
      const sigue = await e.espejo(componente.id);
      const retirado = await e.espejo(componente.id);
      const otraPeriodicidad = await e.espejo(componente.id);
      const deComponente = await medicionDe(tx, componente.id, MARZO);
      await e.reportarLoPropio(e.mide, deComponente, { A: "9", B: "10" });
      await propagar(opc(tx));
      await cerrarMes(e.admin, MARZO, opc(tx));
      await retirar(e.admin, { indicadorId: retirado.id, motivo: "Ya no se mide así" }, opc(tx, dia(21)));
      // Un cambio mayor a trimestral que rige desde el primer trimestre: su marzo cerrado queda de la periodicidad vieja.
      await versionTrimestral(tx, { indicadorId: otraPeriodicidad.id, usuarioId: e.admin.usuarioId, rigeDesde: T1, aprobadaEn: dia(21) });
      // La constancia del primer trimestre del que sigue, ya registrada: se envió al ente el 12 de abril.
      await tx`INSERT INTO reportes_externos (indicador_id, periodo, desde, hasta, vence_en, ente, estado, fecha_envio, radicado,
          resultado_enviado, registrada_por, registrada_en)
        VALUES (${sigue.id}, ${T1}, '2003-01-01T05:00:00Z', '2003-04-01T04:59:59.999Z', '2003-04-20T04:59:59.999Z', 'Superintendencia', 'registrada',
          '2003-04-12', 'RAD-2', '90', ${e.admin.usuarioId}, ${dia(12)})`;

      const r = await reaperturaEnTexto(e.admin, { clase: "medicion", medicionId: deComponente }, opc(tx, dia(22)));
      // El nombre es el de la ficha vigente: el cambio mayor de `versionTrimestral` la llama «Trimestral».
      const linea = (ind: { codigo: string }, nombre = `Indicador de prueba ${ind.codigo}`) => `${ind.codigo} ${nombre} · marzo de 2003`;
      expect(r).toEqual({
        titulo: `Reabrir ${componente.codigo}, marzo de 2003`,
        deDato: false,
        seReabren: [
          { id: deComponente, texto: linea(componente), constancia: null },
          { id: await medicionDe(tx, sigue.id, MARZO), texto: linea(sigue), constancia: "Ya se reportó al ente el 12 abr 2003" },
        ],
        noSeReabren: [
          { id: await medicionDe(tx, retirado.id, MARZO), texto: `${linea(retirado)} · indicador retirado: queda como está` },
          { id: await medicionDe(tx, otraPeriodicidad.id, MARZO), texto: `${linea(otraPeriodicidad, "Trimestral")} · de otra periodicidad: queda como está` },
        ].sort((x, y) => x.texto.localeCompare(y.texto, "es")),
      });
    }));
});

describe("«Cerrar de nuevo» y lo copiado", () => {
  it("no cierra lo copiado que no coincide con su fuente; la pasada que corre antes lo pone al día y entonces sí", () =>
    revertida(sql, async (tx) => {
      const e = await entorno(tx);
      const componente = await e.nuevo();
      const compuesto = await e.espejo(componente.id);
      const deComponente = await medicionDe(tx, componente.id, MARZO);
      const deCompuesto = await medicionDe(tx, compuesto.id, MARZO);
      await e.reportarLoPropio(e.mide, deComponente, { A: "9", B: "10" });
      await propagar(opc(tx));
      await cerrarMes(e.admin, MARZO, opc(tx));
      // Se reabre solo el compuesto (nadie lo toma): su componente sigue cerrado.
      await reabrirMedicion(e.admin, { medicionId: deCompuesto, justificacion: JUSTIFICACION }, opc(tx, dia(22)));
      // Lo copiado se desvía y la pasada no lo arregla: sin inicio de medición, no se propaga.
      await tx`UPDATE medicion_valores SET valor = 50, valor_exacto = NULL WHERE medicion_id = ${deCompuesto} AND variable_id = ${compuesto.variables.A}`;
      await tx`UPDATE indicadores SET inicio_medicion = NULL WHERE id = ${compuesto.id}`;
      await rechaza(cerrarDeNuevo(e.admin, deCompuesto, opc(tx, dia(23))), "Lo copiado de sus fuentes aún no está al día: vuelva a intentarlo en un momento");
      expect((await fila(tx, deCompuesto)).estado).toBe("reportada");
      // Con su inicio, la propagación que corre antes lo pone al día y se cierra de nuevo.
      await tx`UPDATE indicadores SET inicio_medicion = ${MARZO} WHERE id = ${compuesto.id}`;
      await cerrarDeNuevo(e.admin, deCompuesto, opc(tx, dia(23)));
      const m = await fila(tx, deCompuesto);
      expect([m.estado, m.resultado_exacto]).toEqual(["cerrada", "90/1"]);
    }));
});

/**
 * Las sentencias que pasan por `tx`, en orden, con «<<transacción>>» al empezar cada `savepoint` (las transacciones de
 * `enTransaccion` dentro de la de la prueba). Como `espiar` de `indicadores-compuestos-ficha.test.ts`.
 */
function espiar(tx: TransactionSql, sentencias: string[]): TransactionSql {
  return new Proxy(tx, {
    apply(objetivo, esto, args: unknown[]) {
      const plantilla = args[0];
      if (Array.isArray(plantilla) && "raw" in plantilla) sentencias.push((plantilla as readonly string[]).join("?"));
      return Reflect.apply(objetivo as unknown as (...a: unknown[]) => unknown, esto, args);
    },
    get(objetivo, clave) {
      if (clave === "savepoint") {
        return (fn: (sp: TransactionSql) => Promise<unknown>) =>
          objetivo.savepoint((sp) => {
            sentencias.push(TRANSACCION);
            return fn(espiar(sp, sentencias));
          });
      }
      const valor = Reflect.get(objetivo, clave) as unknown;
      return typeof valor === "function" ? valor.bind(objetivo) : valor;
    },
  });
}

const TRANSACCION = "<<transacción>>";
const CANDADO = "pg_advisory_xact_lock(hashtext('sgc.indicadores.cierre'))";

/**
 * La transacción que hace `escritura`: la primera sentencia después de que empieza es el candado consultivo del cierre, y
 * la lectura que decide (`decide`) va después de él, en la misma transacción.
 */
function candadoAntesDe(sentencias: readonly string[], escritura: string, decide: string) {
  const escribe = sentencias.findIndex((s) => s.includes(escritura));
  expect(escribe, `no se vio «${escritura}»`).toBeGreaterThan(0);
  const empieza = sentencias.lastIndexOf(TRANSACCION, escribe);
  expect(empieza).toBeGreaterThanOrEqual(0);
  expect(sentencias[empieza + 1]).toContain(CANDADO);
  const lee = sentencias.findIndex((s, i) => i > empieza + 1 && i < escribe && s.includes(decide));
  expect(lee, `la lectura «${decide}» debe ir después del candado y antes de «${escritura}»`).toBeGreaterThan(empieza + 1);
}

describe("el candado consultivo del cierre, paso 0 del orden de candados", () => {
  it("cerrarMes lo toma primero y clasifica después", () =>
    revertida(sql, async (tx) => {
      const e = await entorno(tx);
      await e.nuevo();
      const sentencias: string[] = [];
      await cerrarMes(e.admin, MARZO, opc(espiar(tx, sentencias)));
      candadoAntesDe(sentencias, "INSERT INTO cierres_indicadores", "FROM variable_valores WHERE hasta <=");
      candadoAntesDe(sentencias, "INSERT INTO cierres_indicadores", "FROM cierres_indicadores WHERE mes =");
    }));

  it("reabrirEnCascada lo toma primero y calcula lo que depende después", () =>
    revertida(sql, async (tx) => {
      const c = await cerradoConSusUsuarios(tx);
      const sentencias: string[] = [];
      await reabrirEnCascada(c.admin, { fuente: { clase: "dato", periodoId: c.marzo }, justificacion: JUSTIFICACION }, opc(espiar(tx, sentencias), dia(22)));
      candadoAntesDe(sentencias, "UPDATE variable_valores SET estado =", "JOIN variable_valores p ON p.id =");
    }));

  it("el camino directo de reabrirMedicion lo toma primero y mira después si hay dependientes", () =>
    revertida(sql, async (tx) => {
      const e = await entorno(tx);
      const x = await e.nuevo();
      const marzo = await medicionDe(tx, x.id, MARZO);
      await e.reportarLoPropio(e.mide, marzo, { A: "9", B: "10" });
      await cerrarMes(e.admin, MARZO, opc(tx));
      const sentencias: string[] = [];
      await reabrirMedicion(e.admin, { medicionId: marzo, justificacion: JUSTIFICACION }, opc(espiar(tx, sentencias), dia(22)));
      candadoAntesDe(sentencias, "UPDATE mediciones SET estado = 'abierta', reabierta_por", "JOIN mediciones x ON x.id =");
    }));

  it("cerrarDeNuevo lo toma primero y revisa las entradas después", () =>
    revertida(sql, async (tx) => {
      const e = await entorno(tx);
      const x = await e.nuevo();
      const marzo = await medicionDe(tx, x.id, MARZO);
      await e.reportarLoPropio(e.mide, marzo, { A: "9", B: "10" });
      await cerrarMes(e.admin, MARZO, opc(tx));
      await reabrirMedicion(e.admin, { medicionId: marzo, justificacion: JUSTIFICACION }, opc(tx, dia(22)));
      const sentencias: string[] = [];
      await cerrarDeNuevo(e.admin, marzo, opc(espiar(tx, sentencias), dia(23)));
      candadoAntesDe(sentencias, "UPDATE mediciones SET estado = 'cerrada', cierre_id", "SELECT * FROM mediciones WHERE id IN");
    }));
});

describe("lo que listó el diálogo, en el formulario (`vistas`)", () => {
  const formulario = (campos: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return fd;
  };
  const leer = (vistas?: string) => parsearFormulario(formulario({ justificacion: JUSTIFICACION, ...(vistas === undefined ? {} : { vistas }) }), EsquemaReapertura);
  const INVALIDA = "La lista de lo que se reabre no es válida: recargue la página";

  it("una lista de enteros positivos, con tope; sin ella, nada", () => {
    expect(leer()).toEqual({ justificacion: JUSTIFICACION });
    expect(leer("[3, 1]")).toEqual({ justificacion: JUSTIFICACION, vistas: [3, 1] });
    expect(leer("[]")).toEqual({ justificacion: JUSTIFICACION, vistas: [] });
    for (const mala of ["[0]", "[-2]", "[1.5]", '["x"]', "no es json", "{}"]) expect(() => leer(mala)).toThrow(INVALIDA);
    expect(() => leer(JSON.stringify(Array.from({ length: MAXIMO_VISTAS + 1 }, (_, i) => i + 1)))).toThrow(INVALIDA);
  });
});
