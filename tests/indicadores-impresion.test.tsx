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
import { FichaImpresa } from "@/componentes/indicadores/ficha/FichaImpresa";
import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { analizar } from "@/db/consultas/indicadores/analisis";
import { impresionDelAnio } from "@/db/consultas/indicadores/impresion";
import { asegurarMediciones, reportar } from "@/db/consultas/indicadores/mediciones";
import { observar } from "@/db/consultas/indicadores/observaciones";
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
      enOrden(firmas, ["Elaboró", "Ana Elaboradora", "Líder de Calidad", "2025-12-10", "Revisó y aprobó", "Juan Aprobador", "Gerente", "2025-12-15"]);
      // La fecha de la aprobación es la de «Vigente desde» en el encabezado.
      expect(html.slice(0, html.indexOf(">Identificación<"))).toContain("2025-12-15");
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

  it("un año anterior imprime la versión que regía y su control de cambios hasta ella; lo de otra periodicidad va en el bloque de su versión", () =>
    revertida(sql, async (tx) => {
      const p = await proceso(tx);
      const quien = await usuarioDePrueba(tx, { rol: "consulta" });
      const admin = await sesionAdmin(tx);
      const ind = await indicadorDePrueba(tx, { procesoId: p.id, inicioMedicion: "2026-01", aprobadaEn: APROBADA, mide: [quien.usuarioId] });
      await medir(tx, quien, ind, { "2026-06": { A: "9", B: "10" }, "2026-07": { A: "1", B: "10" } }, new Date("2026-08-15T15:00:00Z"));
      await versionTrimestral(tx, { indicadorId: ind.id, usuarioId: admin.usuarioId, rigeDesde: "2026-T3", aprobadaEn: new Date("2026-07-20T15:00:00Z") });

      const html = await impreso(tx, quien, ind);
      const tabla = html.slice(html.indexOf(">Seguimiento y medición"), html.indexOf(">Representación gráfica<"));
      enOrden(tabla, ["Calculado con la versión 1 de la ficha", "Enero de 2026", "Junio de 2026", "Julio de 2026", "Periodicidad anterior", "Calculado con la versión 2 de la ficha", "Tercer trimestre de 2026"]);
      // El encabezado, el de la versión 2 (rige el último periodo empezado).
      expect(html.slice(0, html.indexOf(">Identificación<"))).toMatch(/Versión[^0-9]*2/);

      // 2025 no se mide (empieza en enero de 2026): no hay impreso de ese año.
      expect(await impresionDelAnio(quien, ind.codigo, 2025, opc(tx))).toBeNull();
    }));

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
