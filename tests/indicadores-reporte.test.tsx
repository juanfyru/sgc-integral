/**
 * La pantalla de reporte de una medición (Fase 14A, Tarea 9; spec §8.2 y §12.5, maqueta 3) y la tabla del año en la
 * página del indicador. Los componentes, en render estático con datos de muestra; las páginas, contra la BD de
 * desarrollo dentro de una transacción que se revierte (el cliente de la app se sustituye por ella).
 */
import { existsSync } from "node:fs";
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
vi.mock("@/app/acciones-indicadores", () => ({
  crearIndicadorAccion: vi.fn(),
  guardarBorradorAccion: vi.fn(),
  abrirCambioAccion: vi.fn(),
  enviarAAprobacionAccion: vi.fn(),
  aprobarFichasAccion: vi.fn(),
  devolverFichaAccion: vi.fn(),
  descartarBorradorAccion: vi.fn(),
  designarAccion: vi.fn(),
  cambiarOperacionAccion: vi.fn(),
  duplicarAccion: vi.fn(),
  retirarAccion: vi.fn(),
  descartarIndicadorAccion: vi.fn(),
  borrarIndicadorAccion: vi.fn(),
  reportarAccion: vi.fn(),
  marcarNoAplicaAccion: vi.fn(),
  quitarNoAplicaAccion: vi.fn(),
}));

import PaginaIndicador from "@/app/(app)/indicadores/[codigo]/page";
import PaginaReportar from "@/app/(app)/indicadores/[codigo]/reportar/[periodo]/page";
import { FormularioReporte } from "@/componentes/indicadores/medicion/FormularioReporte";
import { ResultadoEnVivo } from "@/componentes/indicadores/medicion/ResultadoEnVivo";
import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { reportar, type DatosDeReporte } from "@/db/consultas/indicadores/mediciones";
import { EsquemaReporte } from "@/lib/esquemas/indicadores";
import type { SesionValida } from "@/lib/sesion";
import { parsearFormulario } from "@/lib/validacion";
import { indicadorDePrueba } from "./utiles/indicadores";
import { sesionAdmin, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();
/** Aprobado a mediados de enero de 2026: sus trimestres de 2026 son ordinarios. */
const APROBADA = new Date("2026-01-15T15:00:00Z");

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

beforeEach(() => {
  contexto.sesion = null;
});

const DATOS: DatosDeReporte = {
  medicionId: 41,
  indicadorId: 7,
  codigo: "SGC-IND-01",
  nombre: "Cumplimiento del Programa de Auditorías Internas",
  periodo: "2026-T3",
  etiqueta: "Tercer trimestre de 2026",
  vence: "10 de octubre de 2026",
  vencida: false,
  estado: "abierta",
  historica: false,
  noAplica: false,
  motivo: null,
  reportada: false,
  soporteObligatorio: true,
  soportes: 0,
  sinMedidor: false,
  variables: [
    {
      letra: "A",
      nombre: "Auditorías ejecutadas",
      descripcion: "Auditorías internas hechas en el periodo",
      fuente: "Informes de auditoría",
      capturaMin: null,
      capturaMax: null,
      admiteNegativos: false,
      valor: null,
    },
    {
      letra: "B",
      nombre: "Auditorías programadas",
      descripcion: "Auditorías del programa para el periodo",
      fuente: "Programa de Auditorías Internas",
      capturaMin: null,
      capturaMax: null,
      admiteNegativos: false,
      valor: null,
    },
  ],
  calculo: { formula: "A / B * 100", letras: ["A", "B"], resultadoMin: null, resultadoMax: null },
  formulaEnPalabras: "(Auditorías ejecutadas ÷ Auditorías programadas) × 100",
  regla: { tendencia: "ascendente", meta: "90", metaMax: null, modo: "relativo", umbralPct: 70, limite: null, tolerancia: null },
  unidad: { sufijo: " %", decimales: 1 },
  rangos: "Bien desde 90 % · Atención de 63 a 89,9 % · Crítico por debajo de 63 %",
  resultado: null,
  semaforo: null,
  anterior: { clave: "2026-T2", etiqueta: "segundo trimestre de 2026", resultado: "250/3" },
  variacionPct: 30,
};

const enVivo = (valores: Record<string, string>) =>
  renderToStaticMarkup(
    <ResultadoEnVivo
      calculo={DATOS.calculo}
      regla={DATOS.regla}
      unidad={DATOS.unidad}
      variables={DATOS.variables}
      valores={valores}
      rangos={DATOS.rangos}
      anterior={DATOS.anterior}
      variacionPct={DATOS.variacionPct}
    />,
  );

describe("FormularioReporte y ResultadoEnVivo", () => {
  it("pinta un campo por variable con su nombre, su descripción y su fuente", () => {
    const html = renderToStaticMarkup(<FormularioReporte datos={DATOS} volver="/indicadores/SGC-IND-01" />);
    for (const v of DATOS.variables) {
      expect(html).toMatch(new RegExp(`<label[^>]*for="reporte-${v.letra}"[^>]*>${v.nombre}</label>`));
      expect(html).toContain(v.descripcion!);
      expect(html).toContain(`Fuente: ${v.fuente}`);
      expect(html).toContain(`id="reporte-${v.letra}"`);
    }
    expect(html).toContain('inputMode="decimal"');
    expect(html).toContain('<input type="hidden" name="id" value="41"/>');
    expect(html).toContain('name="volver" value="/indicadores/SGC-IND-01"');
    // Cada botón dice qué se quiso hacer (`intencion`).
    expect(html).toMatch(/<button(?=[^>]*type="submit")(?=[^>]*name="intencion")(?=[^>]*value="parcial")[^>]*>Guardar sin reportar<\/button>/);
    expect(html).toMatch(/<button(?=[^>]*type="submit")(?=[^>]*name="intencion")(?=[^>]*value="reportar")[^>]*>Reportar<\/button>/);
    // El soporte obligatorio se dice antes de reportar.
    expect(html).toContain("Este indicador exige un soporte");
    // Hay un control «No aplica en este periodo», con su motivo.
    expect(html).toContain(">No aplica en este periodo</summary>");
    expect(html).toContain('name="motivo"');
  });

  it("ResultadoEnVivo con 3 y 5: 60 %, «Crítico» y la frase", () => {
    const html = enVivo({ A: "3", B: "5" });
    expect(html).toContain(">60 %<");
    expect(html).toContain(">Crítico<");
    expect(html).toContain("No cumple: 60 % frente a una meta de 90 %.");
    expect(html).toContain("(3 ÷ 5) × 100");
    expect(html).toContain("Bien desde 90 %");
    expect(html).toContain('aria-live="polite"');
  });

  it("ResultadoEnVivo pide confirmar un salto grande, dice la división por cero y espera los datos", () => {
    expect(enVivo({ A: "2", B: "5" })).toContain(
      "El resultado baja 43,3 puntos frente al segundo trimestre de 2026. ¿Los datos son correctos?",
    );
    expect(enVivo({ A: "4", B: "5" })).not.toContain("¿Los datos son correctos?");
    expect(enVivo({ A: "0", B: "0" })).toContain("No se puede calcular: división por cero. Si no hubo casos, marque «No aplica en este periodo».");
    expect(enVivo({ A: "3" })).toContain("Con todos los datos, aquí sale el resultado.");
    expect(enVivo({ A: "abc", B: "5" })).toContain("Corrija los datos para ver el resultado.");
  });

  it("un valor que no sirve se dice junto a su campo", () => {
    const html = renderToStaticMarkup(
      <FormularioReporte datos={{ ...DATOS, variables: [{ ...DATOS.variables[0], valor: "abc" }, DATOS.variables[1]] }} volver="/x" />,
    );
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="reporte-A-ayuda reporte-A-error"');
    expect(html).toContain("«Auditorías ejecutadas» debe ser un número");
  });

  it("un salto grande frente al periodo anterior pide marcar «Sí, los datos son correctos»", () => {
    const html = renderToStaticMarkup(
      <FormularioReporte datos={{ ...DATOS, variables: DATOS.variables.map((v) => ({ ...v, valor: v.letra === "A" ? "2" : "5" })) }} volver="/x" />,
    );
    expect(html).toContain('name="confirmado"');
    expect(html).toContain("Sí, los datos son correctos");
    // La pregunta se dice una vez, junto al resultado.
    expect(html.split("¿Los datos son correctos?").length - 1).toBe(1);
  });

  it("ya reportada, ofrece guardar la corrección; con «no aplica», quitarlo", () => {
    const corregir = renderToStaticMarkup(
      <FormularioReporte
        datos={{ ...DATOS, reportada: true, soportes: 1, variables: DATOS.variables.map((v) => ({ ...v, valor: "5" })) }}
        volver="/indicadores/SGC-IND-01"
      />,
    );
    expect(corregir).toContain(">Guardar la corrección</button>");
    expect(corregir).not.toContain(">Guardar sin reportar</button>");
    expect(corregir).toContain('value="5"');
    const noAplica = renderToStaticMarkup(
      <FormularioReporte datos={{ ...DATOS, noAplica: true, motivo: "No hubo auditorías programadas", reportada: true }} volver="/x" />,
    );
    expect(noAplica).toContain("No aplica en este periodo: No hubo auditorías programadas");
    expect(noAplica).toContain(">Quitar «No aplica»</button>");
    expect(noAplica).not.toContain(">Guardar la corrección</button>");
  });
});

describe("EsquemaReporte", () => {
  const formulario = (campos: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries({ id: "41", volver: "/x", ...campos })) f.append(k, v);
    return f;
  };
  const leer = (campos: Record<string, string>) => parsearFormulario(formulario(campos), EsquemaReporte, { omitir: ["id", "volver"] });

  it("lee los valores por letra, qué botón se pulsó y la confirmación", () => {
    expect(leer({ valores: '{"A":"3","B":"5,5"}', intencion: "parcial" })).toEqual({
      valores: { A: "3", B: "5,5" },
      intencion: "parcial",
      confirmado: false,
    });
    expect(leer({ valores: '{"A":"3"}', intencion: "reportar", confirmado: "on" })).toMatchObject({ confirmado: true });
    expect(() => leer({ valores: "{roto" })).toThrow("Los valores no tienen un formato válido");
    expect(() => leer({ valores: '{"a":"3"}' })).toThrow("Los valores no tienen un formato válido");
    expect(() => leer({ valores: "{}", otro: "x" })).toThrow();
  });
});

const valida = (s: SesionFlujo): SesionValida => ({
  ...s,
  totpActivo: false,
  factorPendiente: false,
  debeCambiarClave: false,
  aceptoDatos: true,
  tema: "sistema",
});

const enTransaccion = (prueba: (tx: TransactionSql) => Promise<void>) =>
  revertida(sql, async (tx) => {
    contexto.sql = tx;
    try {
      await prueba(tx);
    } finally {
      contexto.sql = null;
    }
  });

const pagina = async (codigo: string, sp: Record<string, string> = {}) =>
  renderToStaticMarkup(await PaginaIndicador({ params: Promise.resolve({ codigo }), searchParams: Promise.resolve(sp) }));
const reporte = async (codigo: string, periodo: string) =>
  renderToStaticMarkup(await PaginaReportar({ params: Promise.resolve({ codigo, periodo }) }));

describe("las páginas", () => {
  it("/indicadores/[codigo]/reportar/[periodo]: abre los periodos, pinta el formulario a quien mide y no existe para los demás", () =>
    enTransaccion(async (tx) => {
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      const ind = await indicadorDePrueba(tx, { periodicidad: "trimestral", inicioMedicion: "2026-T1", aprobadaEn: APROBADA, mide: [mide.usuarioId] });
      contexto.sesion = valida(mide);
      const html = await reporte(ind.codigo, "2026-T1");
      expect(html).toContain("Primer trimestre de 2026");
      expect(html).toContain(">Casos que cumplen</label>");
      expect(html).toContain(">Reportar</button>");
      expect((await tx`SELECT id FROM mediciones WHERE indicador_id = ${ind.id} AND periodo = '2026-T1'`).length).toBe(1);

      await expect(reporte(ind.codigo, "2099-T1")).rejects.toThrow("NO_ENCONTRADA");
      await expect(reporte(ind.codigo, "otra")).rejects.toThrow("NO_ENCONTRADA");
      await expect(reporte("ZZ-NO-EXISTE-1", "2026-T1")).rejects.toThrow("NO_ENCONTRADA");
      contexto.sesion = valida(await usuarioDePrueba(tx, { rol: "consulta" }));
      await expect(reporte(ind.codigo, "2026-T1")).rejects.toThrow("NO_ENCONTRADA");

      // Cerrada: se dice, sin formulario.
      await tx`UPDATE mediciones SET estado = 'cerrada' WHERE indicador_id = ${ind.id} AND periodo = '2026-T1'`;
      contexto.sesion = valida(mide);
      const cerrada = await reporte(ind.codigo, "2026-T1");
      expect(cerrada).toContain("La medición está cerrada: pida al Administrador del SGC que la reabra");
      expect(cerrada).not.toContain(">Reportar</button>");
    }));

  it("/indicadores/[codigo]: Resultados por omisión, con la tabla del año y «Reportar» para quien mide", () =>
    enTransaccion(async (tx) => {
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      const ind = await indicadorDePrueba(tx, { periodicidad: "trimestral", inicioMedicion: "2026-T1", aprobadaEn: APROBADA, mide: [mide.usuarioId] });
      contexto.sesion = valida(mide);
      const html = await pagina(ind.codigo);
      expect(html).toMatch(/aria-current="page"[^>]*>Resultados</);
      expect(html).toContain("Primer trimestre de 2026");
      expect(html).toContain(`href="/indicadores/${ind.codigo}/reportar/2026-T1"`);
      expect(html).toMatch(/>Reportar el primer trimestre de 2026</);

      const [t1] = await tx`SELECT id FROM mediciones WHERE indicador_id = ${ind.id} AND periodo = '2026-T1'`;
      await reportar(mide, { medicionId: Number(t1.id), valores: { A: "9", B: "10" }, parcial: false, confirmado: true }, { sql: tx });
      const reportado = await pagina(ind.codigo, { vista: "resultados", anio: "2026" });
      expect(reportado).toContain(">90 %<");
      expect(reportado).toContain(">Bien<");

      // Quien solo ve el indicador no tiene «Reportar».
      contexto.sesion = valida(await usuarioDePrueba(tx, { rol: "consulta" }));
      const deOtro = await pagina(ind.codigo);
      expect(deOtro).toMatch(/aria-current="page"[^>]*>Resultados</);
      expect(deOtro).not.toContain("/reportar/");
      expect(deOtro).toContain(">90 %<");
      await expect(pagina(ind.codigo, { anio: "abc" })).rejects.toThrow("NO_ENCONTRADA");

      // Sin ficha aprobada (un borrador), la ficha técnica sigue siendo la vista por omisión y Resultados no existe.
      const admin = await sesionAdmin(tx);
      const borrador = await indicadorDePrueba(tx, { estado: "borrador" });
      contexto.sesion = valida(admin);
      expect(await pagina(borrador.codigo)).toMatch(/aria-current="page"[^>]*>Ficha técnica</);
      await expect(pagina(borrador.codigo, { vista: "resultados" })).rejects.toThrow("NO_ENCONTRADA");
    }));
});
