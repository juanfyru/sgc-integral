/**
 * La ficha impresa de un indicador (Fase 14A, Tarea 16; spec §7.8, maqueta 7): `FichaImpresa` en render estático con los
 * datos que lee `impresionDelAnio`, y la página `/indicadores/[codigo]/imprimir`. Contra la BD de desarrollo, dentro de
 * una transacción que se revierte: cada caso crea su proceso y sus indicadores, con la hora inyectada.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { TransactionSql } from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const contexto = vi.hoisted(() => ({ sql: null as unknown, sesion: null as unknown }));

vi.mock("@/db/cliente", async (original) => {
  const real = await original<typeof import("@/db/cliente")>();
  return { ...real, obtenerSql: () => (contexto.sql ?? real.obtenerSql()) as ReturnType<typeof real.obtenerSql> };
});
vi.mock("@/lib/paginas", () => ({ exigirSesion: async () => contexto.sesion }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NO_ENCONTRADA");
  },
  redirect: (destino: string) => {
    throw new Error(`REDIRECT:${destino}`);
  },
  usePathname: () => "/indicadores",
}));

import PaginaImprimir from "@/app/(app)/indicadores/[codigo]/imprimir/page";
import ExcelJS from "exceljs";
import { FichaImpresa } from "@/componentes/indicadores/ficha/FichaImpresa";
import { ControlDeCambios } from "@/componentes/indicadores/ficha/ControlDeCambios";
import { FichaTecnica } from "@/componentes/indicadores/ficha/FichaTecnica";
import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { analizar } from "@/db/consultas/indicadores/analisis";
import { impresionDelAnio } from "@/db/consultas/indicadores/impresion";
import { asegurarMediciones, reportar } from "@/db/consultas/indicadores/mediciones";
import { observar } from "@/db/consultas/indicadores/observaciones";
import { retirar } from "@/db/consultas/indicadores/operacion";
import type { FichaLeida } from "@/db/consultas/indicadores/aprobacion";
import { construirExcelDeIndicador } from "@/lib/indicadores/excel";
import { camposDeFicha, fechaYHora } from "@/lib/indicadores/ficha-en-texto";
import type { SesionValida } from "@/lib/sesion";
import { indicadorDePrueba, versionTrimestral, type IndicadorDePrueba } from "./utiles/indicadores";
import { sesionAdmin, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

beforeEach(() => {
  contexto.sesion = null;
});

/** Mediados de octubre de 2026: el tercer trimestre terminó; el cuarto empezó y no ha terminado. */
const AHORA = new Date("2026-10-20T15:00:00Z");
/** Aprobado antes de 2026: ningún periodo de 2026 es histórico. */
const APROBADA = new Date("2025-12-15T15:00:00Z");
const opc = (tx: TransactionSql, ahora = AHORA) => ({ sql: tx, ahora });
const ENTIDAD = "Entidad Zeta de Prueba";
const META = { hospital: ENTIDAD, generadoEn: "2026-10-20 10:00", detalle: "Año: 2025" };

/** Una ficha con todos los campos que pueden faltar llenos: así la pantalla y la impresa los nombran todos. */
function fichaCompleta(): FichaLeida {
  const variable = (letra: string, nombre: string): FichaLeida["contenido"]["variables"][number] => ({
    letra,
    nombre,
    descripcion: null,
    fuente: null,
    unidad: null,
    consolidacion: "suma",
    origen: "propia",
    variableCompartidaId: null,
    indicadorOrigenId: null,
    toma: null,
    capturaMin: null,
    capturaMax: null,
    admiteNegativos: false,
  });
  return {
    versionId: 1,
    indicadorId: 1,
    numero: 1,
    estado: "aprobada",
    tipoCambio: "inicial",
    rigeDesde: "2026-T1",
    motivo: null,
    notaDevolucion: null,
    elaboradaEn: null,
    contenido: {
      nombre: "Cumplimiento de auditorías",
      proposito: "Saber si se cumple el programa",
      requisito: "NTC ISO 9001:2015, numeral 9.2",
      tipoNombre: "Eficacia",
      clasificacionId: 1,
      clasificacionNombre: "Operativo",
      objetivoNombre: "Mejorar la calidad",
      procesoNombre: "Gestión de calidad",
      subprocesoNombre: "Auditoría",
      procedimientoDocumentoId: 9,
      puntoControl: "PC-13",
      origenDato: "manual",
      calculo: null,
      calculoAlcance: null,
      forma: "porcentaje",
      factor: null,
      formula: "A / B * 100",
      unidadId: 1,
      unidadNombre: "Porcentaje",
      unidadSufijo: " %",
      decimales: 1,
      periodicidad: "trimestral",
      tendencia: "ascendente",
      meta: "90",
      metaMax: null,
      semaforoModo: "relativo",
      umbralAtencionPct: 70,
      limiteCritico: null,
      tolerancia: null,
      resultadoMin: "0",
      resultadoMax: "100",
      lineaBaseValor: "80",
      lineaBasePeriodo: "2025",
      lineaBaseNota: "Del informe de 2025",
      sustentoMeta: "La meta de la gerencia",
      ente: "Supersalud",
      periodicidadExterna: "anual",
      plazoExternoDias: 30,
      dimensionId: null,
      variables: [variable("A", "Ejecutadas"), variable("B", "Programadas")],
      responsables: [
        { cargoNombre: "Líder de Calidad", funcion: "medir" },
        { cargoNombre: "Gerente", funcion: "analizar" },
      ],
      normas: [{ normaNombre: "Resolución 1 de 2020" }],
    },
    procedimiento: { id: 9, codigo: "SGC-PR-01", titulo: "Auditorías internas" },
    firmas: { elaboro: null, aprobo: null },
    aprueba: false,
  };
}

const valida = (s: SesionFlujo): SesionValida => ({
  ...s,
  totpActivo: false,
  factorPendiente: false,
  debeCambiarClave: false,
  aceptoDatos: true,
  tema: "sistema",
});

let consecutivo = 0;

/** Un proceso que solo existe en la transacción. */
async function proceso(tx: TransactionSql): Promise<{ id: number; nombre: string }> {
  consecutivo += 1;
  const sigla = `P${Date.now() % 100_000_000}${consecutivo}`;
  const [macro] = await tx`SELECT id FROM macroprocesos ORDER BY id LIMIT 1`;
  const nombre = `Proceso de impresión ${sigla}`;
  const [p] = await tx`INSERT INTO procesos (macroproceso_id, nombre, sigla, slug, icono, orden)
    VALUES (${macro.id}, ${nombre}, ${sigla}, ${sigla.toLowerCase()}, 'circle', 99) RETURNING id`;
  return { id: Number(p.id), nombre };
}

/** Abre los periodos del indicador y reporta los de `valores` a nombre de `quien`. */
async function medir(tx: TransactionSql, quien: SesionFlujo, ind: { id: number }, valores: Record<string, Record<string, string>>, ahora = AHORA) {
  await asegurarMediciones({ sql: tx, ahora, indicadorId: ind.id });
  const ids: Record<string, number> = {};
  for (const [periodo, v] of Object.entries(valores)) {
    const [m] = await tx`SELECT id FROM mediciones WHERE indicador_id = ${ind.id} AND periodo = ${periodo}`;
    await reportar(quien, { medicionId: Number(m.id), valores: v, parcial: false, confirmado: true }, opc(tx, ahora));
    ids[periodo] = Number(m.id);
  }
  return ids;
}

/** Las firmas «Elaboró» y «Revisó y aprobó» de la versión, como las deja la aprobación (nombre y cargo congelados). */
async function firmar(tx: TransactionSql, versionId: number) {
  const elaboro = await sesionAdmin(tx);
  const aprobo = await usuarioDePrueba(tx, { rol: "gerencia" });
  const [v] = await tx`SELECT huella FROM indicador_versiones WHERE id = ${versionId}`;
  const filas = [
    { u: elaboro.usuarioId, firma: "elaboro", nombre: "Ana Elaboradora", cargo: "Líder de Calidad", en: new Date("2025-12-10T15:00:00Z") },
    { u: aprobo.usuarioId, firma: "aprobo", nombre: "Juan Aprobador", cargo: "Gerente", en: new Date("2025-12-15T15:00:00Z") },
  ];
  for (const f of filas) {
    await tx`INSERT INTO firmas (tramite_id, version_id, indicador_version_id, usuario_id, firma, ronda, hash_sha256,
        nombre_firmante, cargo_firmante, metodo, creado_en)
      VALUES (NULL, NULL, ${versionId}, ${f.u}, ${f.firma}, 0, ${v.huella as string}, ${f.nombre}, ${f.cargo}, 'clave', ${f.en})`;
  }
}

/** Una versión 2 menor aprobada en octubre de 2026: rige los mismos periodos que la 1, con otro nombre. */
async function cambioMenor(tx: TransactionSql, ind: IndicadorDePrueba): Promise<number> {
  const admin = await sesionAdmin(tx);
  const [v2] = await tx`INSERT INTO indicador_versiones (indicador_id, numero, estado, tipo_cambio, nombre, proposito, tipo_id, tipo_nombre,
      clasificacion_id, clasificacion_nombre, proceso_nombre, origen_dato, calculo, forma, formula, unidad_id, unidad_nombre, unidad_sufijo,
      decimales, periodicidad, tendencia, meta, semaforo_modo, umbral_atencion_pct, motivo_cambio, creado_por)
    SELECT indicador_id, 2, 'borrador', 'menor', ${`Nombre corregido ${ind.codigo}`}, proposito, tipo_id, tipo_nombre, clasificacion_id,
      clasificacion_nombre, proceso_nombre, origen_dato, calculo, forma, formula, unidad_id, unidad_nombre, unidad_sufijo, decimales,
      periodicidad, tendencia, meta, semaforo_modo, umbral_atencion_pct, 'Aclarar el nombre', ${admin.usuarioId}
    FROM indicador_versiones WHERE id = ${ind.versionId} RETURNING id`;
  await tx`SELECT id FROM indicador_versiones WHERE id = ${v2.id} FOR UPDATE`;
  await tx`INSERT INTO indicador_variables (version_id, letra, nombre, descripcion, fuente, consolidacion, origen, orden)
    SELECT ${v2.id}, letra, nombre, descripcion, fuente, consolidacion, origen, orden FROM indicador_variables WHERE version_id = ${ind.versionId}`;
  await tx`UPDATE indicador_versiones SET estado = 'aprobada', elaborada_por = ${admin.usuarioId}, huella = ${"2".repeat(64)},
      rige_desde = '2026-T1', aprobada_en = ${new Date("2026-10-05T15:00:00Z")} WHERE id = ${v2.id}`;
  return Number(v2.id);
}

/** Un trimestral firmado del proceso, con sus nombres de variable y su fuente, medido de enero a septiembre de 2026. */
async function trimestralMedido(tx: TransactionSql) {
  const p = await proceso(tx);
  const quien = await usuarioDePrueba(tx, { rol: "consulta" });
  const ind = await indicadorDePrueba(tx, {
    procesoId: p.id,
    periodicidad: "trimestral",
    inicioMedicion: "2026-T1",
    aprobadaEn: APROBADA,
    mide: [quien.usuarioId],
    analiza: [quien.usuarioId],
    variables: { A: { nombre: "Auditorías ejecutadas", fuente: "Informes de auditoría" }, B: { nombre: "Auditorías programadas" } },
  });
  await firmar(tx, ind.versionId);
  const ids = await medir(tx, quien, ind, { "2026-T1": { A: "5", B: "5" }, "2026-T2": { A: "5", B: "6" }, "2026-T3": { A: "3", B: "5" } });
  await analizar(quien, { medicionId: ids["2026-T2"], analisis: "La auditoría de Farmacia se aplazó a julio" }, opc(tx));
  return { p, quien, ind, ids };
}

async function impreso(tx: TransactionSql, sesion: SesionFlujo, ind: IndicadorDePrueba, anio = 2026) {
  const datos = await impresionDelAnio(sesion, ind.codigo, anio, opc(tx));
  expect(datos).not.toBeNull();
  return renderToStaticMarkup(<FichaImpresa entidad={ENTIDAD} logo={null} {...datos!} />);
}

/** La posición de cada texto en el impreso: deben ir en este orden. */
function enOrden(html: string, textos: string[]) {
  let desde = -1;
  for (const t of textos) {
    const i = html.indexOf(t, desde + 1);
    expect(i, `«${t}» después de lo anterior`).toBeGreaterThan(desde);
    desde = i;
  }
}

describe("FichaImpresa", () => {
  it("sigue el orden de la ficha del usuario", () =>
    revertida(sql, async (tx) => {
      const { ind } = await trimestralMedido(tx);
      const html = await impreso(tx, await usuarioDePrueba(tx, { rol: "consulta" }), ind);
      enOrden(html, [
        ENTIDAD,
        "Ficha técnica de indicador",
        ind.codigo,
        "Versión",
        "Vigente desde",
        "Identificación",
        `Indicador de prueba ${ind.codigo}`,
        "Estructura de medición",
        "(Auditorías ejecutadas ÷ Auditorías programadas) × 100",
        "Bien desde 90 %",
        "Firmas",
        "Control de cambios",
        "Datos de operación",
        "Seguimiento y medición",
        "Representación gráfica",
      ]);
      expect(html).toContain("Fuente: Informes de auditoría");
      // Un solo h1 en la página: el de su encabezado; la hoja titula sus bloques con h2.
      expect(html).not.toContain("<h1");
    }));

  it("las firmas son las de la tabla firmas: nombre, cargo y fecha", () =>
    revertida(sql, async (tx) => {
      const { ind } = await trimestralMedido(tx);
      const html = await impreso(tx, await usuarioDePrueba(tx, { rol: "consulta" }), ind);
      const firmas = html.slice(html.indexOf(">Firmas<"), html.indexOf(">Control de cambios<"));
      // La fecha y la hora de cada firma, con el formato de las fechas de la app y en la zona de la instalación.
      enOrden(firmas, [
        "Elaboró", "Ana Elaboradora", "Líder de Calidad", "Firmado el 10 dic 2025, 10:00",
        "Revisó y aprobó", "Juan Aprobador", "Gerente", "Firmado el 15 dic 2025, 10:00",
      ]);
      expect(firmas).not.toContain("2025-12-1");
      // La fecha de la aprobación es la de «Vigente desde» en el encabezado, con el formato de un día de la app.
      expect(html.slice(0, html.indexOf(">Identificación<"))).toContain(">15 dic 2025<");
      expect(html.slice(0, html.indexOf(">Identificación<"))).not.toContain("2025-12-15");
    }));

  it("los datos de operación van después de las firmas, rotulados como tales", () =>
    revertida(sql, async (tx) => {
      const { ind, quien } = await trimestralMedido(tx);
      const html = await impreso(tx, await usuarioDePrueba(tx, { rol: "consulta" }), ind);
      enOrden(html, [">Firmas<", ">Datos de operación<", "No son contenido de la ficha", "Quién mide", quien.nombre, "Plazo de reporte", ">Seguimiento y medición"]);
    }));

  it("la tabla trae solo los periodos de la periodicidad, dice con qué versión se calculó y cierra con el acumulado", () =>
    revertida(sql, async (tx) => {
      const { ind } = await trimestralMedido(tx);
      const html = await impreso(tx, await usuarioDePrueba(tx, { rol: "consulta" }), ind);
      const tabla = html.slice(html.indexOf(">Seguimiento y medición"), html.indexOf(">Representación gráfica<"));
      enOrden(tabla, [
        "Calculado con la versión 1 de la ficha",
        "Primer trimestre de 2026",
        "100 %",
        "Segundo trimestre de 2026",
        "83,3 %",
        "La auditoría de Farmacia se aplazó a julio",
        "Tercer trimestre de 2026",
        "60 %",
        "Cuarto trimestre de 2026",
        "Acumulado del año",
        "81,3 %",
      ]);
      expect(tabla).not.toMatch(/enero|Enero de 2026/);
      expect(tabla).toContain("<thead");
      // Cumple y el estado van escritos, nunca solo en color.
      expect(tabla).toContain(">Sí<");
      expect(tabla).toContain(">Crítico<");
      // La gráfica escribe el valor y el estado sobre cada columna al imprimir.
      expect(html).toContain('class="tubo-impreso"');
    }));

  it("tras un cambio menor, cada bloque dice la versión con que se calculó: la que quedó en la medición", () =>
    revertida(sql, async (tx) => {
      const { ind, quien } = await trimestralMedido(tx);
      // Una versión 2 menor (rige los mismos periodos) aprobada en octubre; el tercer trimestre se corrige después, con ella.
      const v2 = { id: await cambioMenor(tx, ind) };
      const [t3] = await tx`SELECT id, version_id FROM mediciones WHERE indicador_id = ${ind.id} AND periodo = '2026-T3'`;
      expect(Number(t3.version_id)).toBe(ind.versionId);
      await reportar(quien, { medicionId: Number(t3.id), valores: { A: "4", B: "5" }, parcial: false, confirmado: true }, opc(tx));
      const [corregida] = await tx`SELECT version_id FROM mediciones WHERE id = ${t3.id}`;
      expect(Number(corregida.version_id)).toBe(Number(v2.id));

      const html = await impreso(tx, await usuarioDePrueba(tx, { rol: "consulta" }), ind);
      // El encabezado es el de la versión que rige el último periodo empezado: la 2.
      expect(html).toContain(`Nombre corregido ${ind.codigo}`);
      const tabla = html.slice(html.indexOf(">Seguimiento y medición"), html.indexOf(">Representación gráfica<"));
      enOrden(tabla, [
        "Calculado con la versión 1 de la ficha",
        "Primer trimestre de 2026",
        "Segundo trimestre de 2026",
        "Calculado con la versión 2 de la ficha",
        "Tercer trimestre de 2026",
        "Cuarto trimestre de 2026",
        "Acumulado del año",
      ]);
      const cambios = html.slice(html.indexOf(">Control de cambios<"), html.indexOf(">Datos de operación<"));
      expect(cambios).toContain("Aclarar el nombre");
    }));

  it("lo de otra periodicidad va en el orden del calendario, en el tramo de su versión, marcado", () =>
    revertida(sql, async (tx) => {
      const p = await proceso(tx);
      const quien = await usuarioDePrueba(tx, { rol: "consulta" });
      const admin = await sesionAdmin(tx);
      const ind = await indicadorDePrueba(tx, { procesoId: p.id, inicioMedicion: "2026-01", aprobadaEn: APROBADA, mide: [quien.usuarioId] });
      await medir(tx, quien, ind, { "2026-06": { A: "9", B: "10" }, "2026-07": { A: "1", B: "10" } }, new Date("2026-08-15T15:00:00Z"));
      await versionTrimestral(tx, { indicadorId: ind.id, usuarioId: admin.usuarioId, rigeDesde: "2026-T3", aprobadaEn: new Date("2026-07-20T15:00:00Z") });
      await medir(tx, quien, ind, { "2026-T3": { A: "8", B: "10" } });

      const html = await impreso(tx, quien, ind);
      const tabla = html.slice(html.indexOf(">Seguimiento y medición"), html.indexOf(">Representación gráfica<"));
      // Los tramos siguen el calendario: cambian solo entre filas con resultado de otra versión.
      enOrden(tabla, [
        "Calculado con la versión 1 de la ficha",
        "Enero de 2026",
        "Junio de 2026",
        "Calculado con la versión 2 de la ficha",
        "Tercer trimestre de 2026",
        "Calculado con la versión 1 de la ficha",
        "Julio de 2026",
        "Periodicidad anterior",
        "Cuarto trimestre de 2026",
      ]);
      expect(tabla.match(/Calculado con la versión/g)).toHaveLength(3);
      // El encabezado, el de la versión 2 (rige el último periodo empezado).
      expect(html.slice(0, html.indexOf(">Identificación<"))).toMatch(/Versión[^0-9]*2/);

      // 2025 no se mide (empieza en enero de 2026): no hay impreso de ese año.
      expect(await impresionDelAnio(quien, ind.codigo, 2025, opc(tx))).toBeNull();
    }));

  it("la tabla va en el orden del calendario: un periodo corregido tras un cambio menor y uno vencido sin reportar no la desordenan", () =>
    revertida(sql, async (tx) => {
      const p = await proceso(tx);
      const quien = await usuarioDePrueba(tx, { rol: "consulta" });
      const ind = await indicadorDePrueba(tx, {
        procesoId: p.id,
        periodicidad: "trimestral",
        inicioMedicion: "2026-T1",
        aprobadaEn: APROBADA,
        mide: [quien.usuarioId],
      });
      // El segundo trimestre vence sin reportarse; el primero se corrige con la versión 2 menor.
      const ids = await medir(tx, quien, ind, { "2026-T1": { A: "9", B: "10" }, "2026-T3": { A: "8", B: "10" } });
      await cambioMenor(tx, ind);
      await reportar(quien, { medicionId: ids["2026-T1"], valores: { A: "10", B: "10" }, parcial: false, confirmado: true }, opc(tx));

      const html = await impreso(tx, quien, ind);
      const tabla = html.slice(html.indexOf(">Seguimiento y medición"), html.indexOf(">Representación gráfica<"));
      enOrden(tabla, [
        "Calculado con la versión 2 de la ficha",
        "Primer trimestre de 2026",
        "Segundo trimestre de 2026",
        "Calculado con la versión 1 de la ficha",
        "Tercer trimestre de 2026",
        "Cuarto trimestre de 2026",
        "Acumulado del año",
      ]);
      expect(tabla.match(/Calculado con la versión/g)).toHaveLength(2);
    }));

  it("un año anterior imprime la versión que regía: un cambio mayor que rige después no entra ni en la ficha ni en el Excel", () =>
    revertida(sql, async (tx) => {
      const p = await proceso(tx);
      const quien = await usuarioDePrueba(tx, { rol: "consulta" });
      const ind = await indicadorDePrueba(tx, {
        procesoId: p.id,
        periodicidad: "trimestral",
        inicioMedicion: "2025-T1",
        aprobadaEn: new Date("2024-12-15T15:00:00Z"),
        mide: [quien.usuarioId],
      });
      await firmar(tx, ind.versionId);
      await medir(tx, quien, ind, { "2025-T3": { A: "9", B: "10" } }, new Date("2025-10-20T15:00:00Z"));
      // La versión 2 (mayor, «Trimestral») rige desde 2026: en 2025 regía la 1.
      const admin = await sesionAdmin(tx);
      const v2 = await versionTrimestral(tx, { indicadorId: ind.id, usuarioId: admin.usuarioId, rigeDesde: "2026-T1", aprobadaEn: new Date("2025-12-01T15:00:00Z") });
      await tx`INSERT INTO firmas (tramite_id, version_id, indicador_version_id, usuario_id, firma, ronda, hash_sha256, nombre_firmante,
          cargo_firmante, metodo, creado_en)
        VALUES (NULL, NULL, ${v2}, ${admin.usuarioId}, 'elaboro', 0, ${"1".repeat(64)}, 'Zoe Segunda', 'Asesora', 'clave', ${new Date("2025-11-20T15:00:00Z")})`;

      const datos = await impresionDelAnio(quien, ind.codigo, 2025, opc(tx));
      expect(datos?.ficha.numero).toBe(1);
      const html = renderToStaticMarkup(<FichaImpresa entidad={ENTIDAD} logo={null} {...datos!} />);
      const encabezado = html.slice(0, html.indexOf(">Identificación<"));
      expect(encabezado).toMatch(/Versión<\/dt><dd[^>]*>1</);
      expect(html.slice(html.indexOf(">Identificación<"), html.indexOf(">Estructura de medición<"))).toContain(`Indicador de prueba ${ind.codigo}`);
      const cambios = html.slice(html.indexOf(">Control de cambios<"), html.indexOf(">Datos de operación<"));
      expect(cambios).toContain("1 · Inicial");
      expect(cambios).not.toContain("2 · Mayor");
      const firmas = html.slice(html.indexOf(">Firmas<"), html.indexOf(">Control de cambios<"));
      expect(firmas).toContain("Ana Elaboradora");
      expect(html).not.toContain("Zoe Segunda");

      const libro = new ExcelJS.Workbook();
      await libro.xlsx.load((await construirExcelDeIndicador(datos!, META)) as unknown as ArrayBuffer);
      const ficha: string[] = [];
      libro.getWorksheet("Ficha")!.eachRow((fila) => ficha.push((fila.values as unknown[]).slice(1).map((v) => String(v ?? "")).join(" | ")));
      expect(ficha).toContain("Encabezado | Versión | 1");
      expect(ficha).toContain(`Identificación | Nombre | Indicador de prueba ${ind.codigo}`);
      expect(ficha.join("\n")).toContain("Firmas | Elaboró | Ana Elaboradora");
      expect(ficha.join("\n")).not.toContain("Zoe Segunda");

      // Y el año en curso, la versión 2.
      expect((await impresionDelAnio(quien, ind.codigo, 2026, opc(tx)))?.ficha.numero).toBe(2);
    }));

  it("imprime un indicador retirado y uno anual", () =>
    revertida(sql, async (tx) => {
      const { ind } = await trimestralMedido(tx);
      const admin = await sesionAdmin(tx);
      await retirar(admin, { indicadorId: ind.id, motivo: "Se reemplaza por otro indicador" }, opc(tx));
      const retirado = await impreso(tx, await usuarioDePrueba(tx, { rol: "consulta" }), ind);
      enOrden(retirado, ["Ficha técnica de indicador", "Primer trimestre de 2026", "100 %", "Acumulado del año", "81,3 %"]);

      const p = await proceso(tx);
      const quien = await usuarioDePrueba(tx, { rol: "consulta" });
      const anual = await indicadorDePrueba(tx, {
        procesoId: p.id,
        periodicidad: "anual",
        inicioMedicion: "2025",
        aprobadaEn: new Date("2024-12-15T15:00:00Z"),
        mide: [quien.usuarioId],
      });
      await medir(tx, quien, anual, { "2025": { A: "7", B: "10" } }, new Date("2026-01-20T15:00:00Z"));
      const html = await impreso(tx, quien, anual, 2025);
      const tabla = html.slice(html.indexOf(">Seguimiento y medición"), html.indexOf(">Representación gráfica<"));
      enOrden(tabla, ["Calculado con la versión 1 de la ficha", ">2025<", "70 %", "Acumulado del año", "70 %"]);
      expect(tabla.match(/<th scope="row"/g)).toHaveLength(2);
    }));

  it("en pantalla, las firmas y el control de cambios dicen la fecha como el resto de la app (ronda 1 de la Tarea 19, D-5)", () => {
    const firmado = new Date("2026-07-08T14:05:00Z");
    const aprobado = new Date("2026-07-15T15:00:00Z");
    const ficha = { ...fichaCompleta(), firmas: { elaboro: { nombre: "Persona A", cargo: "Líder", fecha: firmado }, aprobo: { nombre: "Persona B", cargo: "Gerente", fecha: aprobado } } };
    const pantalla = renderToStaticMarkup(<FichaTecnica ficha={ficha} operacion={null} />);
    const cambios = renderToStaticMarkup(
      <ControlDeCambios
        versiones={[{ id: 1, numero: 1, tipoCambio: "inicial", rigeDesde: "2026-T1", motivo: null, cambios: [], elaboro: "Persona A", elaboradaEn: firmado, aprobo: "Persona B", aprobadaEn: aprobado }]}
        vigente={1}
      />,
    );
    for (const html of [pantalla, cambios]) {
      expect(html).not.toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
      expect(html).toContain(fechaYHora(firmado));
      expect(html).toContain(fechaYHora(aprobado));
    }
    expect(fechaYHora(firmado)).toMatch(/^\d{1,2} [a-z]{3} 2026, \d{2}:\d{2}$/);
  });

  it("la ficha impresa y la ficha en pantalla nombran los mismos campos", () => {
    const ficha = fichaCompleta();
    const pantalla = renderToStaticMarkup(<FichaTecnica ficha={ficha} operacion={null} />);
    const seccion = (inicio: string, fin: string) =>
      [...pantalla.slice(pantalla.indexOf(`>${inicio}<`), pantalla.indexOf(`>${fin}<`)).matchAll(/<dt[^>]*>([^<]+)<\/dt>/g)].map((m) => m[1]);
    const { identificacion, estructura } = camposDeFicha(ficha);
    // La impresa da una fila por variable; la pantalla, una lista en «Variables».
    const rotulos = (campos: { termino: string }[]) => [...new Set(campos.map((c) => (/^Variable [A-Z]$/.test(c.termino) ? "Variables" : c.termino)))];
    expect(rotulos(identificacion)).toEqual(seccion("Identificación", "Estructura de medición"));
    expect(rotulos(estructura)).toEqual(seccion("Estructura de medición", "Firmas"));
  });

  it("no imprime soportes ni observaciones, ni el nombre de la entidad escrito en el código", () =>
    revertida(sql, async (tx) => {
      const { ind, ids } = await trimestralMedido(tx);
      const control = await usuarioDePrueba(tx, { rol: "control_interno" });
      await observar(control, { medicionId: ids["2026-T3"], texto: "Observación secreta zz-1734" }, opc(tx));
      await tx`INSERT INTO archivos (version_id, contexto, contexto_id, rol, ruta, nombre_original, extension, mime, tamano_bytes, hash_sha256)
        VALUES (NULL, 'medicion', ${ids["2026-T3"]}, 'evidencia', 'mediciones/x/soporte.pdf', 'Soporte secreto zz-1734.pdf', 'pdf',
          'application/pdf', 4, ${"a".repeat(64)})`;
      // Quien más ve: Admin SGC ve los soportes y las observaciones en la página, pero no en el impreso.
      const html = await impreso(tx, await sesionAdmin(tx), ind);
      expect(html).toContain(ENTIDAD);
      expect(html).not.toContain("zz-1734");
      expect(html).not.toMatch(/Soportes|Observaciones/);
      const fuente = readFileSync(path.resolve(import.meta.dirname, "../src/componentes/indicadores/ficha/FichaImpresa.tsx"), "utf8");
      expect(fuente).not.toMatch(/Hospital|E\.S\.E|Suaza|Fátima/i);
      // La gráfica impresa no arrastra la vista de resultados (sus formularios y la edición de históricos).
      expect(fuente).not.toContain("vistas/VistaResultados");
    }));
});

describe("/indicadores/[codigo]/imprimir", () => {
  const pagina = async (codigo: string, sp: Record<string, string> = {}) =>
    renderToStaticMarkup(await PaginaImprimir({ params: Promise.resolve({ codigo }), searchParams: Promise.resolve(sp) }));

  it("la imprime quien ve el indicador, con un solo h1 y el botón que no se imprime; a los demás, no encontrada", () =>
    revertida(sql, async (tx) => {
      contexto.sql = tx;
      try {
        const p = await proceso(tx);
        const general = await indicadorDePrueba(tx, { procesoId: p.id, periodicidad: "trimestral", inicioMedicion: "2026-T1", aprobadaEn: APROBADA });
        const restringido = await indicadorDePrueba(tx, {
          procesoId: p.id,
          periodicidad: "trimestral",
          inicioMedicion: "2026-T1",
          aprobadaEn: APROBADA,
          nivelAcceso: "restringido",
        });
        contexto.sesion = valida(await usuarioDePrueba(tx, { rol: "consulta" }));

        const html = await pagina(general.codigo.toLowerCase(), { anio: "2026" });
        expect(html.match(/<h1/g)).toHaveLength(1);
        expect(html).toContain("Ficha técnica de indicador");
        expect(html).toMatch(/<button[^>]*print:hidden[^>]*>.*?Imprimir<\/button>/);
        expect(html).toContain(`href="/indicadores/${general.codigo}?vista=resultados&amp;anio=2026"`);

        await expect(pagina(restringido.codigo)).rejects.toThrow("NO_ENCONTRADA");
        await expect(pagina("ZZ-NO-EXISTE-1")).rejects.toThrow("NO_ENCONTRADA");
        await expect(pagina(general.codigo, { anio: "abc" })).rejects.toThrow("NO_ENCONTRADA");
        await expect(pagina(general.codigo, { anio: "2025" })).rejects.toThrow("NO_ENCONTRADA");
        await expect(pagina(general.codigo, { anio: "2999" })).rejects.toThrow("NO_ENCONTRADA");
      } finally {
        contexto.sql = null;
      }
    }));
});
