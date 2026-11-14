/**
 * «Una sola meta» (anexo 14B, §6): con una ficha activa de su cálculo y con meta, la tarjeta de Vigencia, Distribución y
 * Configuración documental usan la meta de la ficha. Contra la BD de desarrollo, dentro de una transacción que se
 * revierte: cada caso libera antes los cálculos que toca (`liberarCalculo`), así no depende de las fichas de la base. Las
 * etapas se cuentan en 2091, un año sin datos de la demo: el periodo solo tiene las que siembra cada caso.
 */
import { existsSync } from "node:fs";
import ExcelJS from "exceljs";
import type { TransactionSql } from "postgres";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { TarjetaConformidad } from "@/componentes/distribucion/verificaciones/EstadoPuntos";
import { TarjetasIndicadores } from "@/componentes/vigencia/indicadores/TarjetasIndicadores";
import { obtenerSql } from "@/db/cliente";
import { guardarConfigDocumentalEn, obtenerConfigDocumental, type ConfigDocumental } from "@/db/consultas/config-documental";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { estadoDePuntos, historialVerificaciones } from "@/db/consultas/distribucion/verificaciones-resumen";
import { fichaActivaDelCalculo, metaDeConformidad, metasQueFijaUnaFicha } from "@/db/consultas/indicadores/fichas-de-calculo";
import { indicadoresDocumentales } from "@/db/consultas/vigencia/indicadores";
import { INDICADORES, metaDe, type Indicador, type IndicadorMedido, type ResultadoIndicadores } from "@/lib/indicadores-documentales/metas";
import { periodoDe } from "@/lib/indicadores-documentales/periodo";
import { periodoQueContiene } from "@/lib/indicadores/periodos";
import { FORMATO_CODIGO_DEFECTO } from "@/lib/tramites/codigo";
import { construirExcelIndicadores } from "@/lib/vigencia/indicadores-excel";
import { zonaHoraria } from "@/lib/zona-horaria";
import { puntoDePrueba, verificarPunto } from "./utiles/distribucion";
import { indicadorDePrueba, liberarCalculo, sinFichasDocumentales } from "./utiles/indicadores";
import { sesionAdmin, tramiteEn, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();
const ZONA = zonaHoraria();
const ahora = new Date("2026-11-08T15:00:00Z");

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

const procesoId = async (tx: TransactionSql, sigla: string) => Number((await tx`SELECT id FROM procesos WHERE sigla = ${sigla}`)[0].id);
const de = (r: ResultadoIndicadores, clave: Indicador): IndicadorMedido => r.indicadores.find((i) => i.clave === clave)!;
const fijarConfig = (tx: TransactionSql, clave: string, valor: string) =>
  tx`INSERT INTO configuracion (clave, valor) VALUES (${clave}, ${valor}) ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor`;

/**
 * Tres etapas cerradas en plazo y una tarde, en marzo de 2091, de un trámite de GTH: 75 %. Con la meta de
 * Configuración documental en 90 no cumple; con una de 70 o de 60, sí.
 */
async function etapasEn2091(tx: TransactionSql): Promise<void> {
  const t = await tramiteEn(tx, "elaboracion");
  const cierres = [
    ["2091-03-10T15:00:00Z", "2091-03-20T15:00:00Z"],
    ["2091-03-11T15:00:00Z", "2091-03-20T15:00:00Z"],
    ["2091-03-12T15:00:00Z", "2091-03-20T15:00:00Z"],
    ["2091-03-25T15:00:00Z", "2091-03-20T15:00:00Z"],
  ];
  for (const [cerradaEn, venceEn] of cierres) {
    await tx`INSERT INTO tramite_eventos (tramite_id, tipo, usuario_id, ronda, detalle, creado_en)
      VALUES (${t.tramiteId}, 'aceptar', ${t.admin.usuarioId}, 1, ${tx.json({ venceEn })}, ${new Date(cerradaEn)})`;
  }
  await fijarConfig(tx, "meta_etapas_plazo_pct", "90");
}

const leer = async (tx: TransactionSql, sesion: SesionFlujo, procesoId?: number) =>
  (await indicadoresDocumentales(sesion, { periodo: "2091", procesoId }, { sql: tx, ahora }))!;

describe("la tarjeta de Vigencia usa la meta de la ficha de su cálculo", () => {
  it("sin ficha, las metas de Configuración documental y ninguna ficha en las siete", () => revertida(sql, async (tx) => {
    const gth = await procesoId(tx, "GTH");
    await sinFichasDocumentales(tx, [gth]);
    const admin = await sesionAdmin(tx);
    const config = await obtenerConfigDocumental({ sql: tx });
    const metas = { metas: config.metas, umbralConformidadPct: config.distribucion.umbralConformidadPct };
    for (const r of [await leer(tx, admin), await leer(tx, admin, gth)]) {
      expect(r.indicadores.map((i) => i.clave)).toEqual([...INDICADORES]);
      for (const i of r.indicadores) {
        expect(i.meta, i.clave).toBe(metaDe(i.clave, metas));
        expect(i.ficha, i.clave).toBeNull();
      }
    }
  }));

  it("con una ficha de etapas de la entidad con meta 70, la tarjeta la usa; con un proceso elegido, la del proceso si la hay", () => revertida(sql, async (tx) => {
    const gth = await procesoId(tx, "GTH");
    await sinFichasDocumentales(tx, [gth]);
    await etapasEn2091(tx);
    const admin = await sesionAdmin(tx);
    expect(de(await leer(tx, admin), "etapas")).toMatchObject({ numerador: 3, denominador: 4, meta: 90, cumple: false, ficha: null });

    const entidad = await indicadorDePrueba(tx, { calculo: { clave: "etapas", alcance: "entidad" }, meta: "70" });
    const r = await leer(tx, admin);
    expect(de(r, "etapas")).toMatchObject({ numerador: 3, denominador: 4, meta: 70, cumple: true, ficha: { codigo: entidad.codigo } });
    // Las demás tarjetas siguen con su meta de Configuración documental.
    expect(de(r, "acuses")).toMatchObject({ meta: (await obtenerConfigDocumental({ sql: tx })).metas.acusesPct, ficha: null });
    const html = renderToStaticMarkup(createElement(TarjetasIndicadores, { indicadores: r.indicadores, tramites: r.tramites }));
    expect(html).toContain(`Ver ficha ${entidad.codigo}`);
    expect(html).toContain(`href="/indicadores/${encodeURIComponent(entidad.codigo)}?vista=ficha"`);

    // La ficha es de la entidad: con un proceso elegido, la meta de Configuración documental.
    expect(de(await leer(tx, admin, gth), "etapas")).toMatchObject({ numerador: 3, denominador: 4, meta: 90, cumple: false, ficha: null });
    const delProceso = await indicadorDePrueba(tx, { procesoId: gth, calculo: { clave: "etapas", alcance: "proceso" }, meta: "60" });
    expect(de(await leer(tx, admin, gth), "etapas")).toMatchObject({ meta: 60, cumple: true, ficha: { codigo: delProceso.codigo } });
    // La del proceso no gobierna la tarjeta de la entidad, ni la de otro proceso.
    expect(de(await leer(tx, admin), "etapas")).toMatchObject({ meta: 70, ficha: { codigo: entidad.codigo } });
    const cex = await procesoId(tx, "CEX");
    await liberarCalculo(tx, "etapas", "proceso", cex);
    expect(de(await leer(tx, admin, cex), "etapas")).toMatchObject({ meta: 90, ficha: null });
  }));

  it("la meta programada para el periodo en curso manda sobre la de la ficha; sin meta en la ficha, no manda ninguna", () => revertida(sql, async (tx) => {
    await sinFichasDocumentales(tx);
    await etapasEn2091(tx);
    const admin = await sesionAdmin(tx);
    const ficha = await indicadorDePrueba(tx, { calculo: { clave: "etapas", alcance: "entidad" }, meta: "80" });
    const enCurso = periodoQueContiene("mensual", ahora, ZONA).clave;
    const programar = (indicadorId: number, periodo: string, meta: string) =>
      tx`INSERT INTO indicador_metas (indicador_id, periodo, meta, programada_por) VALUES (${indicadorId}, ${periodo}, ${meta}, ${admin.usuarioId})`;
    // Una meta programada para otro periodo no rige hoy.
    await programar(ficha.id, "2026-10", "50");
    expect(de(await leer(tx, admin), "etapas")).toMatchObject({ meta: 80, cumple: false });
    await programar(ficha.id, enCurso, "70");
    expect(de(await leer(tx, admin), "etapas")).toMatchObject({ meta: 70, cumple: true, ficha: { codigo: ficha.codigo } });
    expect(await fichaActivaDelCalculo(tx, { clave: "etapas", alcance: "entidad", procesoId: null, ahora })).toEqual({
      indicadorId: ficha.id,
      codigo: ficha.codigo,
      meta: "70",
    });

    // Una ficha sin meta no gobierna la tarjeta, aunque tenga una meta programada (la regla de `reglaDelPeriodo`).
    const sinMeta = await indicadorDePrueba(tx, { calculo: { clave: "etapas", alcance: "entidad" }, meta: null });
    await programar(sinMeta.id, enCurso, "70");
    expect(await fichaActivaDelCalculo(tx, { clave: "etapas", alcance: "entidad", procesoId: null, ahora })).toMatchObject({ codigo: sinMeta.codigo, meta: null });
    expect(de(await leer(tx, admin), "etapas")).toMatchObject({ meta: 90, cumple: false, ficha: null });
    expect(await metasQueFijaUnaFicha({ sql: tx, ahora })).toEqual({});
  }));

  it("una ficha restringida: quien no la ve no recibe su código, ni en la tarjeta ni en Distribución, y la meta se aplica igual", () => revertida(sql, async (tx) => {
    const cex = await procesoId(tx, "CEX");
    await sinFichasDocumentales(tx);
    await etapasEn2091(tx);
    const admin = await sesionAdmin(tx);
    // Un líder de otro proceso: tiene la pestaña de indicadores, pero no ve un restringido de GTH.
    const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [cex] });
    const consulta = await usuarioDePrueba(tx, { rol: "consulta" });
    const etapas = await indicadorDePrueba(tx, { calculo: { clave: "etapas", alcance: "entidad" }, meta: "70", nivelAcceso: "restringido" });
    const conformidad = await indicadorDePrueba(tx, { calculo: { clave: "conformidad_fecha", alcance: "entidad" }, meta: "90", nivelAcceso: "restringido" });

    const deAdmin = await leer(tx, admin);
    const deLider = await leer(tx, lider);
    expect(de(deAdmin, "etapas")).toMatchObject({ meta: 70, ficha: { codigo: etapas.codigo } });
    expect(de(deLider, "etapas")).toMatchObject({ meta: 70, ficha: null });
    expect(de(deLider, "conformidad")).toMatchObject({ meta: 90, ficha: null });
    const html = renderToStaticMarkup(createElement(TarjetasIndicadores, { indicadores: deLider.indicadores, tramites: deLider.tramites }));
    expect(html).not.toContain(etapas.codigo);
    expect(html).not.toContain(conformidad.codigo);
    expect(html).not.toContain("Ver ficha");

    // El Excel: la columna «Ficha», vacía para quien no la ve.
    const fichaEnExcel = async (r: ResultadoIndicadores) => {
      const libro = new ExcelJS.Workbook();
      await libro.xlsx.load((await construirExcelIndicadores(r, { hospital: "Entidad", generadoEn: "hoy", proceso: "todos", zona: ZONA })) as unknown as ArrayBuffer);
      const filas: unknown[][] = [];
      libro.getWorksheet("Indicadores")!.eachRow((f) => filas.push((f.values as unknown[]).slice(1)));
      const columna = filas.find((f) => f[0] === "Indicador")!.indexOf("Ficha");
      expect(columna).toBeGreaterThan(0);
      return filas.find((f) => f[0] === de(r, "etapas").nombre)![columna] ?? null;
    };
    expect(await fichaEnExcel(deAdmin)).toBe(etapas.codigo);
    expect(await fichaEnExcel(deLider)).toBeNull();

    for (const sujeto of [consulta, lider]) {
      expect(await metaDeConformidad(60, sujeto, { sql: tx, ahora })).toEqual({ umbral: 90, ficha: null });
      const puntos = await estadoDePuntos(sujeto, { sql: tx, ahora });
      expect(puntos.conformidad).toMatchObject({ umbral: 90, ficha: null });
      const texto = renderToStaticMarkup(createElement(TarjetaConformidad, { etiqueta: "Conformidad actual", c: puntos.conformidad }));
      expect(texto).toContain("Umbral 90 %");
      expect(texto).not.toContain("lo fija la ficha");
      expect(texto).not.toContain(conformidad.codigo);
    }
    expect(await metaDeConformidad(60, admin, { sql: tx, ahora })).toEqual({ umbral: 90, ficha: conformidad.codigo });
    const deAdminEnPuntos = (await estadoDePuntos(admin, { sql: tx, ahora })).conformidad;
    expect(renderToStaticMarkup(createElement(TarjetaConformidad, { etiqueta: "Conformidad actual", c: deAdminEnPuntos }))).toContain(
      `Umbral 90 % · lo fija la ficha ${conformidad.codigo}`,
    );
  }));
});

describe("la conformidad en puntos de uso: metaDeConformidad", () => {
  it("sin ficha, el umbral de Configuración documental; con la ficha de conformidad a la fecha, su meta, en Distribución y en Vigencia", () => revertida(sql, async (tx) => {
    await sinFichasDocumentales(tx);
    await fijarConfig(tx, "umbral_conformidad_pct", "60");
    const admin = await sesionAdmin(tx);
    // Sin procesos, el líder ve solo los puntos de los que es responsable: los del test. Dos conformes de tres: 66 %.
    const lider = await usuarioDePrueba(tx, { rol: "lider_proceso" });
    for (const respuesta of ["conforme", "conforme", "no_conforme"] as const) {
      const punto = await puntoDePrueba(tx, { responsable: lider });
      await verificarPunto(tx, { verificador: admin, punto, ahora, respuesta });
    }
    const anio = periodoDe("2026", ZONA)!;
    const historial = () => historialVerificaciones(lider, { desde: anio.desde, hasta: new Date(anio.hasta.getTime() + 1) }, { sql: tx, ahora });

    expect(await metaDeConformidad(60, lider, { sql: tx, ahora })).toEqual({ umbral: 60, ficha: null });
    expect((await estadoDePuntos(lider, { sql: tx, ahora })).conformidad).toEqual({ porcentaje: 66, cumple: true, umbral: 60, puntos: 3, ficha: null });
    expect((await historial()).conformidad).toEqual({ porcentaje: 66, cumple: true, umbral: 60, puntos: 3, ficha: null });

    const ficha = await indicadorDePrueba(tx, { calculo: { clave: "conformidad_fecha", alcance: "entidad" }, meta: "90" });
    expect(await metaDeConformidad(60, lider, { sql: tx, ahora })).toEqual({ umbral: 90, ficha: ficha.codigo });
    const puntos = (await estadoDePuntos(lider, { sql: tx, ahora })).conformidad;
    expect(puntos).toEqual({ porcentaje: 66, cumple: false, umbral: 90, puntos: 3, ficha: ficha.codigo });
    expect((await historial()).conformidad).toEqual({ porcentaje: 66, cumple: false, umbral: 90, puntos: 3, ficha: ficha.codigo });

    // La tarjeta de Vigencia dice lo mismo que Distribución, también con un proceso elegido.
    const r = (await indicadoresDocumentales(lider, { periodo: "2026" }, { sql: tx, ahora }))!;
    expect(de(r, "conformidad")).toMatchObject({ valor: 66, meta: 90, cumple: false, ficha: { codigo: ficha.codigo } });
    const gth = await procesoId(tx, "GTH");
    const conProceso = (await indicadoresDocumentales(admin, { periodo: "2026", procesoId: gth }, { sql: tx, ahora }))!;
    const deAdmin = (await estadoDePuntos(admin, { sql: tx, ahora })).conformidad;
    expect(de(conProceso, "conformidad")).toMatchObject({ valor: deAdmin.porcentaje, meta: 90, cumple: deAdmin.cumple, ficha: { codigo: ficha.codigo } });
  }));
});

describe("Configuración documental: el campo que fija una ficha", () => {
  const aGuardar = (c: ConfigDocumental) => ({
    formatoCodigo: c.formatoCodigo ?? FORMATO_CODIGO_DEFECTO,
    plazos: c.plazos,
    escalamientoDias: c.escalamientoDias,
    publicacionDirecta: c.publicacionDirecta,
    formatoActa: c.formatoActa,
    distribucion: c.distribucion,
    vigencia: c.vigencia,
    metas: c.metas,
  });

  it("dice qué ficha fija cada campo y con qué meta, y el guardado no lo cambia, venga lo que venga", () => revertida(sql, async (tx) => {
    await sinFichasDocumentales(tx);
    const admin = await sesionAdmin(tx);
    expect(await metasQueFijaUnaFicha({ sql: tx, ahora })).toEqual({});
    const etapas = await indicadorDePrueba(tx, { calculo: { clave: "etapas", alcance: "entidad" }, meta: "80" });
    const conformidad = await indicadorDePrueba(tx, { calculo: { clave: "conformidad_fecha", alcance: "entidad" }, meta: "90" });
    // Una ficha de un proceso no fija nada de Configuración documental.
    await indicadorDePrueba(tx, { calculo: { clave: "acuses", alcance: "proceso" }, meta: "85" });
    expect(await metasQueFijaUnaFicha({ sql: tx, ahora })).toEqual({
      etapasPlazoPct: { codigo: etapas.codigo, meta: "80" },
      umbralConformidadPct: { codigo: conformidad.codigo, meta: "90" },
    });
    // La meta que rige hoy: la programada para el periodo en curso manda.
    await tx`INSERT INTO indicador_metas (indicador_id, periodo, meta, programada_por)
      VALUES (${etapas.id}, ${periodoQueContiene("mensual", ahora, ZONA).clave}, 75, ${admin.usuarioId})`;
    expect((await metasQueFijaUnaFicha({ sql: tx, ahora })).etapasPlazoPct).toEqual({ codigo: etapas.codigo, meta: "75" });

    await fijarConfig(tx, "meta_etapas_plazo_pct", "85");
    await fijarConfig(tx, "umbral_conformidad_pct", "70");
    await fijarConfig(tx, "meta_acuses_pct", "90");
    const antes = await obtenerConfigDocumental({ sql: tx });
    await guardarConfigDocumentalEn(
      tx,
      {
        ...aGuardar(antes),
        distribucion: { ...antes.distribucion, umbralConformidadPct: 99 },
        metas: { ...antes.metas, etapasPlazoPct: 55, acusesPct: 80 },
      },
      admin.usuarioId,
    );
    const despues = await obtenerConfigDocumental({ sql: tx });
    expect(despues.metas).toMatchObject({ etapasPlazoPct: 85, acusesPct: 80 });
    expect(despues.distribucion.umbralConformidadPct).toBe(70);
    const [{ detalle }] = await tx`SELECT detalle FROM auditoria WHERE usuario_id = ${admin.usuarioId} AND accion = 'editar_config_documental' ORDER BY id DESC LIMIT 1`;
    expect(Object.keys(detalle.cambios)).toEqual(["meta_acuses_pct"]);

    // El formulario los manda deshabilitados, sin valor: también se conserva el guardado.
    const distribucion = { ...antes.distribucion, umbralConformidadPct: undefined };
    const metas = { ...antes.metas, etapasPlazoPct: undefined };
    await guardarConfigDocumentalEn(tx, { ...aGuardar(antes), distribucion, metas }, admin.usuarioId);
    const otraVez = await obtenerConfigDocumental({ sql: tx });
    expect(otraVez.metas.etapasPlazoPct).toBe(85);
    expect(otraVez.distribucion.umbralConformidadPct).toBe(70);
  }));
});
