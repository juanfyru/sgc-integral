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
  useRouter: () => ({ refresh: () => {} }),
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
  quitarSoporteAccion: vi.fn(),
  analizarAccion: vi.fn(),
  observarAccion: vi.fn(),
  responderAccion: vi.fn(),
  programarMetaAccion: vi.fn(),
  registrarHistoricosAccion: vi.fn(),
  cerrarMesAccion: vi.fn(),
  reabrirMedicionAccion: vi.fn(),
  cerrarDeNuevoAccion: vi.fn(),
}));

import PaginaIndicador from "@/app/(app)/indicadores/[codigo]/page";
import PaginaReportar from "@/app/(app)/indicadores/[codigo]/reportar/[periodo]/page";
import { DialogoMetas } from "@/componentes/indicadores/medicion/DialogoMetas";
import { FormularioAnalisis } from "@/componentes/indicadores/medicion/FormularioAnalisis";
import { FormularioReporte } from "@/componentes/indicadores/medicion/FormularioReporte";
import { SeccionDeAnalisis } from "@/componentes/indicadores/vistas/VistaResultados";
import { cerrarTrasGuardar } from "@/componentes/indicadores/medicion/cerrar-tras-guardar";
import { Observaciones } from "@/componentes/indicadores/medicion/Observaciones";
import { ResultadoEnVivo } from "@/componentes/indicadores/medicion/ResultadoEnVivo";
import { obtenerSql } from "@/db/cliente";
import type { DatosDeAnalisis } from "@/db/consultas/indicadores/analisis";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { registrarHistoricos } from "@/db/consultas/indicadores/historicos";
import type { DatosDeReporte } from "@/db/consultas/indicadores/lectura";
import { asegurarMediciones, reportar } from "@/db/consultas/indicadores/mediciones";
import type { MetaDelPeriodo } from "@/db/consultas/indicadores/metas";
import { observar } from "@/db/consultas/indicadores/observaciones";
import {
  analisisDelFormulario,
  EsquemaHistoricos,
  EsquemaMeta,
  EsquemaReporte,
  juntarHistoricos,
  juntarValoresDeReporte,
} from "@/lib/esquemas/indicadores";
import { destinoTrasReportar } from "@/lib/indicadores/reporte";
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
      // Cada variable viaja en su propio campo: el formulario funciona igual antes de hidratar.
      expect(html).toMatch(new RegExp(`<input(?=[^>]*id="reporte-${v.letra}")(?=[^>]*name="valor_${v.letra}")[^>]*>`));
    }
    expect(html).not.toContain('name="valores"');
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

  it("ResultadoEnVivo avisa que el análisis es obligatorio cuando no cumple, aunque el color sea Bien", () => {
    const rangos = {
      bien: [{ signo: ">=" as const, valor: "91" }],
      atencion: [{ signo: "entre" as const, valor: "41", hasta: "90" }],
      critico: [{ signo: "<=" as const, valor: "40" }],
    };
    const html = renderToStaticMarkup(
      <ResultadoEnVivo
        calculo={DATOS.calculo}
        regla={{ ...DATOS.regla, meta: "100", modo: "rangos", umbralPct: null, rangos }}
        unidad={DATOS.unidad}
        variables={DATOS.variables}
        valores={{ A: "95", B: "100" }}
        rangos={null}
        anterior={null}
        variacionPct={DATOS.variacionPct}
      />,
    );
    expect(html).toContain(">Bien<");
    expect(html).toContain("No cumple: después de reportar, el análisis es obligatorio.");
    const cumple = renderToStaticMarkup(
      <ResultadoEnVivo
        calculo={DATOS.calculo}
        regla={{ ...DATOS.regla, meta: "100", modo: "rangos", umbralPct: null, rangos }}
        unidad={DATOS.unidad}
        variables={DATOS.variables}
        valores={{ A: "105", B: "100" }}
        rangos={null}
        anterior={null}
        variacionPct={DATOS.variacionPct}
      />,
    );
    expect(cumple).not.toContain("el análisis es obligatorio");
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

  it("el acento de la tarjeta del resultado sigue su estado; sin resultado o sin meta, el borde neutro", () => {
    const tarjeta = (html: string) => /<section[^>]*>/.exec(html)![0];
    expect(tarjeta(enVivo({ A: "3", B: "5" }))).toContain("border-l-estado-critico");
    expect(tarjeta(enVivo({ A: "4", B: "5" }))).toContain("border-l-estado-atencion");
    expect(tarjeta(enVivo({ A: "5", B: "5" }))).toContain("border-l-estado-bien");
    const sinMeta = renderToStaticMarkup(
      <ResultadoEnVivo
        calculo={DATOS.calculo}
        regla={{ ...DATOS.regla, meta: null }}
        unidad={DATOS.unidad}
        variables={DATOS.variables}
        valores={{ A: "3", B: "5" }}
        rangos={null}
        anterior={null}
        variacionPct={DATOS.variacionPct}
      />,
    );
    expect(sinMeta).toContain(">Sin meta<");
    for (const html of [sinMeta, enVivo({ A: "3" }), enVivo({ A: "0", B: "0" }), enVivo({ A: "abc", B: "5" })]) {
      expect(tarjeta(html)).toContain("border-l-border");
      expect(tarjeta(html)).not.toMatch(/border-l-(estado|mod)-/);
    }
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
    expect(() => leer({ valores: "{roto", intencion: "reportar" })).toThrow("Los valores no tienen un formato válido");
    expect(() => leer({ valores: '{"a":"3"}', intencion: "reportar" })).toThrow("Los valores no tienen un formato válido");
    expect(() => leer({ valores: "{}", intencion: "reportar", otro: "x" })).toThrow();
    // Sin el botón pulsado no se adivina: ni reporte ni borrador.
    expect(() => leer({ valores: '{"A":"3"}' })).toThrow("Elija si reporta o guarda sin reportar");
  });

  it("junta los campos de cada variable (`valor_A`…) en los valores que lee el esquema", () => {
    const juntado = juntarValoresDeReporte(formulario({ valor_A: "3", valor_B: "", intencion: "reportar", confirmado: "on" }));
    expect(juntado.has("valor_A")).toBe(false);
    expect(juntado.get("id")).toBe("41");
    expect(parsearFormulario(juntado, EsquemaReporte, { omitir: ["id", "volver"] })).toEqual({
      valores: { A: "3", B: "" },
      intencion: "reportar",
      confirmado: true,
    });
    // Una letra que no es de la A a la Z no pasa: el esquema estricto la rechaza.
    expect(() => parsearFormulario(juntarValoresDeReporte(formulario({ valor_a: "3", intencion: "reportar" })), EsquemaReporte, { omitir: ["id", "volver"] })).toThrow();
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
      // Los soportes, con su zona de carga, antes del cierre.
      expect(html).toContain(">Soportes</h2>");
      expect(html).toContain("Sin soportes adjuntos.");
      expect(html).toContain("Arrastre los archivos aquí");
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
      // Cerrada, los soportes se ven pero ya no se suben ni se quitan.
      expect(cerrada).toContain(">Soportes</h2>");
      expect(cerrada).not.toContain("Arrastre los archivos aquí");
    }));

  it("/indicadores/[codigo]: los soportes salen en la tabla del año solo para quien los ve, y se descargan", () =>
    enTransaccion(async (tx) => {
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      const ind = await indicadorDePrueba(tx, { periodicidad: "trimestral", inicioMedicion: "2026-T1", aprobadaEn: APROBADA, mide: [mide.usuarioId] });
      contexto.sesion = valida(mide);
      await pagina(ind.codigo, { anio: "2026" });
      const [t1] = await tx`SELECT id FROM mediciones WHERE indicador_id = ${ind.id} AND periodo = '2026-T1'`;
      await reportar(mide, { medicionId: Number(t1.id), valores: { A: "9", B: "10" }, parcial: false, confirmado: true }, { sql: tx });
      const [a] = await tx`INSERT INTO archivos (version_id, contexto, contexto_id, rol, ruta, nombre_original, extension, mime, tamano_bytes, hash_sha256)
        VALUES (NULL, 'medicion', ${t1.id}, 'evidencia', ${`mediciones/${t1.id}/informe.pdf`}, 'Informe de auditoría.pdf', 'pdf', 'application/pdf', 4, ${"c".repeat(64)}) RETURNING id`;
      const conSoportes = await pagina(ind.codigo, { vista: "resultados", anio: "2026" });
      expect(conSoportes).toContain(">Soportes</th>");
      expect(conSoportes).toContain(`href="/indicadores/${ind.codigo}/soportes/${a.id}/Informe%20de%20auditor%C3%ADa.pdf"`);
      // Quien ve el indicador pero no sus soportes: ni columna ni enlace.
      contexto.sesion = valida(await usuarioDePrueba(tx, { rol: "consulta" }));
      const sinSoportes = await pagina(ind.codigo, { vista: "resultados", anio: "2026" });
      expect(sinSoportes).not.toContain(">Soportes</th>");
      expect(sinSoportes).not.toContain("/soportes/");
    }));

  it("/indicadores/[codigo]: Resultados por omisión, con la tabla del año y «Reportar» para quien mide", () =>
    enTransaccion(async (tx) => {
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      const ind = await indicadorDePrueba(tx, { periodicidad: "trimestral", inicioMedicion: "2026-T1", aprobadaEn: APROBADA, mide: [mide.usuarioId] });
      contexto.sesion = valida(mide);
      // Sin parámetros, «Resultados» y el botón de la medición más antigua por reportar.
      const html = await pagina(ind.codigo);
      expect(html).toMatch(/aria-current="page"[^>]*>Resultados</);
      expect(html).toMatch(/>Reportar el primer trimestre de 2026</);
      // La tabla de 2026, pedida con su año para no depender del reloj.
      const de2026 = await pagina(ind.codigo, { anio: "2026" });
      expect(de2026).toContain("Primer trimestre de 2026");
      expect(de2026).toContain(`href="/indicadores/${ind.codigo}/reportar/2026-T1"`);

      const [t1] = await tx`SELECT id FROM mediciones WHERE indicador_id = ${ind.id} AND periodo = '2026-T1'`;
      await reportar(mide, { medicionId: Number(t1.id), valores: { A: "9", B: "10" }, parcial: false, confirmado: true }, { sql: tx });
      const reportado = await pagina(ind.codigo, { vista: "resultados", anio: "2026" });
      expect(reportado).toContain(">90 %<");
      expect(reportado).toContain(">Bien<");

      // Quien solo ve el indicador no tiene «Reportar».
      contexto.sesion = valida(await usuarioDePrueba(tx, { rol: "consulta" }));
      expect(await pagina(ind.codigo)).toMatch(/aria-current="page"[^>]*>Resultados</);
      const deOtro = await pagina(ind.codigo, { anio: "2026" });
      expect(deOtro).not.toContain("/reportar/");
      expect(deOtro).toContain(">90 %<");
      await expect(pagina(ind.codigo, { anio: "abc" })).rejects.toThrow("NO_ENCONTRADA");
      // Fuera de [año del inicio de medición, año en curso], la tabla no existe.
      await expect(pagina(ind.codigo, { anio: "2025" })).rejects.toThrow("NO_ENCONTRADA");
      await expect(pagina(ind.codigo, { anio: "2099" })).rejects.toThrow("NO_ENCONTRADA");

      // Sin ficha aprobada (un borrador), la ficha técnica sigue siendo la vista por omisión y Resultados no existe.
      const admin = await sesionAdmin(tx);
      const borrador = await indicadorDePrueba(tx, { estado: "borrador" });
      contexto.sesion = valida(admin);
      expect(await pagina(borrador.codigo)).toMatch(/aria-current="page"[^>]*>Ficha técnica</);
      await expect(pagina(borrador.codigo, { vista: "resultados" })).rejects.toThrow("NO_ENCONTRADA");
    }));
});

// ─────────────────────────────────────────────────────────────────────────────
// Tarea 10: análisis, observaciones, metas por periodo e históricos
// ─────────────────────────────────────────────────────────────────────────────

const ANALISIS: DatosDeAnalisis = {
  medicionId: 41,
  periodo: "2026-T3",
  etiqueta: "Tercer trimestre de 2026",
  exigido: "dos_partes",
  semaforo: "critico",
  repetido: false,
  analisis: null,
  causa: null,
  accionPropuesta: null,
};

describe("FormularioAnalisis y DialogoMetas", () => {
  it("en crítico pide causa y acción propuesta, con el aviso de no escribir nombres", () => {
    const html = renderToStaticMarkup(<FormularioAnalisis datos={ANALISIS} volver="/indicadores/SGC-IND-01" />);
    expect(html).toMatch(/<label[^>]*for="analisis-41-causa"[^>]*>Causa de la desviación<\/label>/);
    expect(html).toMatch(/<label[^>]*for="analisis-41-accionPropuesta"[^>]*>Acción propuesta<\/label>/);
    expect(html).toMatch(/<textarea(?=[^>]*name="causa")(?=[^>]*required)(?=[^>]*minLength="10")[^>]*>/);
    expect(html).toMatch(/<textarea(?=[^>]*name="accionPropuesta")(?=[^>]*required)[^>]*>/);
    expect(html).not.toContain('name="analisis"');
    expect(html.split("No escriba nombres de pacientes ni de funcionarios.").length - 1).toBe(2);
    expect(html).toContain("«Requiere acción de mejora»");
    expect(html).toContain('<input type="hidden" name="id" value="41"/>');
    expect(html).toContain(">Guardar el análisis</button>");
  });

  it("en atención, un campo obligatorio; si cumple, opcional; lo que ya tiene texto se puede editar", () => {
    const simple = renderToStaticMarkup(<FormularioAnalisis datos={{ ...ANALISIS, exigido: "simple", semaforo: "atencion" }} volver="/x" />);
    expect(simple).toMatch(/<textarea(?=[^>]*name="analisis")(?=[^>]*required)(?=[^>]*minLength="10")[^>]*>/);
    expect(simple).not.toContain('name="causa"');
    expect(simple).toContain(">Análisis</label>");
    const opcional = renderToStaticMarkup(<FormularioAnalisis datos={{ ...ANALISIS, exigido: "ninguno", semaforo: "bien" }} volver="/x" />);
    expect(opcional).toContain(">Análisis (opcional)</label>");
    expect(opcional).not.toMatch(/<textarea(?=[^>]*name="analisis")(?=[^>]*required)[^>]*>/);
    const conTexto = renderToStaticMarkup(
      <FormularioAnalisis datos={{ ...ANALISIS, analisis: "Un análisis anterior", causa: "Faltó personal" }} volver="/x" />,
    );
    expect(conTexto).toContain(">Un análisis anterior</textarea>");
    expect(conTexto).toContain(">Faltó personal</textarea>");
  });

  it("DialogoMetas: un renglón por periodo con su meta heredada y un campo; justificación si ya terminó", () => {
    const fila = (m: Partial<MetaDelPeriodo>): MetaDelPeriodo => ({
      periodo: "2026-T1",
      etiqueta: "Primer trimestre de 2026",
      heredada: "90",
      heredadaMax: null,
      textoHeredada: "≥ 90 %",
      programada: null,
      programadaMax: null,
      tardia: false,
      cerrada: false,
      terminado: false,
      historica: false,
      pideJustificacion: false,
      constante: false,
      sufijo: " %",
      ...m,
    });
    const metas = [
      fila({ cerrada: true, terminado: true }),
      fila({ periodo: "2026-T3", etiqueta: "Tercer trimestre de 2026", programada: "80.5", tardia: true, terminado: true, pideJustificacion: true }),
      fila({ periodo: "2026-T4", etiqueta: "Cuarto trimestre de 2026" }),
    ];
    const html = renderToStaticMarkup(<DialogoMetas abierto alCerrar={() => {}} indicadorId={7} codigo="SGC-IND-01" anio={2026} metas={metas} />);
    expect(html).toContain("Programar metas de SGC-IND-01 en 2026");
    expect(html).toContain("Cerrada: reábrala para cambiar su meta.");
    expect(html).toContain(">80,5 %<");
    expect(html).toContain("Meta ajustada después del periodo");
    expect(html).toMatch(/<input(?=[^>]*name="meta")(?=[^>]*value="80,5")[^>]*>/);
    expect(html).toMatch(/<input(?=[^>]*name="meta")(?=[^>]*value="90")[^>]*>/);
    expect(html.split('name="justificacion"').length - 1).toBe(1);
    expect(html.split('name="periodo"').length - 1).toBe(2);
    expect(html).not.toContain('name="metaMax"');
  });
});

describe("Observaciones", () => {
  it("«Responder» se cierra cuando el envío termina sin error, y solo entonces", () => {
    const abierto = () => ({ open: true });
    const error = { ok: false as const, error: "Escriba la respuesta" };
    // Terminó un envío (pendiente pasó de sí a no) sin error: se cierra.
    let p = abierto();
    expect(cerrarTrasGuardar(p, { enviaba: true, pendiente: false, estado: null })).toBe(true);
    expect(p.open).toBe(false);
    // Con error, sigue abierto con lo escrito; mientras envía o sin envío, tampoco se toca.
    p = abierto();
    expect(cerrarTrasGuardar(p, { enviaba: true, pendiente: false, estado: error })).toBe(false);
    expect(cerrarTrasGuardar(p, { enviaba: true, pendiente: true, estado: null })).toBe(false);
    expect(cerrarTrasGuardar(p, { enviaba: false, pendiente: false, estado: null })).toBe(false);
    expect(p.open).toBe(true);
    // Ya cerrado, no hay nada que cerrar.
    expect(cerrarTrasGuardar({ open: false }, { enviaba: true, pendiente: false, estado: null })).toBe(false);
  });

  it("cada «Responder» y cada «Enviar la respuesta» dicen de quién es la observación", () => {
    const html = renderToStaticMarkup(
      <Observaciones
        medicionId={41}
        etiqueta="Tercer trimestre de 2026"
        observaciones={[
          { id: 1, autor: "Ana Pérez", fecha: "5 oct 2026, 10:00", texto: "Revise el denominador", respuestas: [] },
          { id: 2, autor: "Luis Gómez", fecha: "6 oct 2026, 09:00", texto: "Falta el soporte", respuestas: [] },
        ]}
        puedeObservar={false}
        puedeResponder
      />,
    );
    expect(html).toContain('Responder<span class="sr-only"> a Ana Pérez, 5 oct 2026, 10:00</span></summary>');
    expect(html).toContain('Responder<span class="sr-only"> a Luis Gómez, 6 oct 2026, 09:00</span></summary>');
    expect(html).toMatch(/Enviar la respuesta<span class="sr-only"> a Ana Pérez, 5 oct 2026, 10:00<\/span><\/button>/);
    expect(html).toContain("Hasta 2.000 caracteres. Avisa a quien dejó la observación.");
  });
});

describe("los esquemas de la Tarea 10", () => {
  const formulario = (campos: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries({ id: "41", ...campos })) f.append(k, v);
    return f;
  };

  it("el análisis conserva un campo vaciado (lo borra) y no inventa los que no llegan", () => {
    expect(analisisDelFormulario(formulario({ analisis: "", volver: "/x" }))).toEqual({ analisis: "" });
    expect(analisisDelFormulario(formulario({ causa: "Faltó personal", accionPropuesta: "Suplentes" }))).toEqual({
      causa: "Faltó personal",
      accionPropuesta: "Suplentes",
    });
    expect(() => analisisDelFormulario(formulario({ analisis: "x".repeat(2001) }))).toThrow("El análisis no puede pasar de 2000 caracteres");
    expect(() => analisisDelFormulario(formulario({ otro: "x" }))).toThrow();
  });

  it("la meta: coma decimal, máximo vacío y justificación opcional", () => {
    expect(parsearFormulario(formulario({ periodo: "2026-T3", meta: "80,5", metaMax: "" }), EsquemaMeta, { omitir: ["id"] })).toEqual({
      periodo: "2026-T3",
      meta: "80.5",
    });
    expect(() => parsearFormulario(formulario({ periodo: "2026-T9", meta: "80" }), EsquemaMeta, { omitir: ["id"] })).toThrow("El periodo no es válido");
    expect(() => parsearFormulario(formulario({ periodo: "2026-T3", meta: "mucho" }), EsquemaMeta, { omitir: ["id"] })).toThrow(
      "La meta debe ser un número",
    );
  });

  it("los históricos: cada celda en su campo se junta en una fila por periodo", () => {
    const juntado = juntarHistoricos(formulario({ "h_2025-T3_A": "5", "h_2025-T3_B": "5", "h_2025-T4_A": "", "h_2025-T4_B": "", volver: "/x" }));
    expect(juntado.get("volver")).toBe("/x");
    expect(parsearFormulario(juntado, EsquemaHistoricos, { omitir: ["id", "volver"] })).toEqual({
      filas: [
        { periodo: "2025-T3", valores: { A: "5", B: "5" } },
        { periodo: "2025-T4", valores: { A: "", B: "" } },
      ],
    });
    expect(() => parsearFormulario(juntarHistoricos(formulario({ "h_2025-T3_a": "5" })), EsquemaHistoricos, { omitir: ["id"] })).toThrow(
      "Las filas no tienen un formato válido",
    );
    // «No aplica» y su motivo viajan en sus propios campos; sin la casilla, el motivo no cuenta.
    const conNoAplica = juntarHistoricos(
      formulario({ "h_2025-T3_A": "5", "motivo_2025-T3": "Escrito sin marcar", "h_2025-T4_A": "", "na_2025-T4": "on", "motivo_2025-T4": "Sin casos" }),
    );
    expect(parsearFormulario(conNoAplica, EsquemaHistoricos, { omitir: ["id"] })).toEqual({
      filas: [
        { periodo: "2025-T3", valores: { A: "5" } },
        { periodo: "2025-T4", valores: { A: "" }, noAplica: true, motivo: "Sin casos" },
      ],
    });
  });
});

describe("las páginas de la Tarea 10", () => {
  const historico = { periodicidad: "trimestral" as const, inicioMedicion: "2025-T3", aprobadaEn: APROBADA };

  it("/indicadores/[codigo]: quien analiza escribe el análisis que falta; quien solo mide, no", () =>
    enTransaccion(async (tx) => {
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      const analiza = await usuarioDePrueba(tx, { rol: "consulta" });
      const ind = await indicadorDePrueba(tx, { ...historico, inicioMedicion: "2026-T1", mide: [mide.usuarioId], analiza: [analiza.usuarioId] });
      await asegurarMediciones({ sql: tx, indicadorId: ind.id });
      const [t1] = await tx`SELECT id FROM mediciones WHERE indicador_id = ${ind.id} AND periodo = '2026-T1'`;
      await reportar(mide, { medicionId: Number(t1.id), valores: { A: "3", B: "5" }, parcial: false, confirmado: true }, { sql: tx });

      contexto.sesion = valida(analiza);
      const html = await pagina(ind.codigo, { anio: "2026" });
      expect(html).toContain("Análisis: primer trimestre de 2026");
      // La meta y el resultado no se parten en dos líneas.
      expect(html).toMatch(/<td class="[^"]*\bwhitespace-nowrap\b[^"]*">≥ 90 %<\/td>/);
      expect(html).toMatch(/<td class="[^"]*\bwhitespace-nowrap\b[^"]*">60 %<\/td>/);
      expect(html).toContain('name="causa"');
      expect(html).toContain('name="accionPropuesta"');
      expect(html).toContain("No escriba nombres de pacientes ni de funcionarios.");
      expect(html).toContain("?vista=resultados&amp;anio=2026&amp;analizar=2026-T1#analisis");
      // El análisis de un periodo sin resultado no existe.
      await expect(pagina(ind.codigo, { anio: "2026", analizar: "2026-T2" })).rejects.toThrow("NO_ENCONTRADA");

      // Quien solo mide no tiene el formulario ni el enlace, ni lo pide con `?analizar=`.
      contexto.sesion = valida(mide);
      const deMide = await pagina(ind.codigo, { anio: "2026" });
      expect(deMide).not.toContain('name="causa"');
      expect(deMide).not.toContain("analizar=");
      await expect(pagina(ind.codigo, { anio: "2026", analizar: "2026-T1" })).rejects.toThrow("NO_ENCONTRADA");

      // Quien mide y analiza tiene el análisis también debajo del reporte.
      await tx`INSERT INTO indicador_designados (indicador_id, usuario_id, funcion, creado_por)
        VALUES (${ind.id}, ${mide.usuarioId}, 'analiza', ${mide.usuarioId})`;
      const enReporte = await reporte(ind.codigo, "2026-T1");
      expect(enReporte).toContain('id="reporte-analisis"');
      expect(enReporte).toContain('name="causa"');
    }));

  it("/indicadores/[codigo]: los históricos se registran en la tabla del año en modo edición", () =>
    enTransaccion(async (tx) => {
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      const ind = await indicadorDePrueba(tx, { ...historico, mide: [mide.usuarioId] });
      contexto.sesion = valida(mide);
      const html = await pagina(ind.codigo, { anio: "2025" });
      expect(html).toContain("&amp;historicos=editar");
      expect(html).toContain(">Registrar históricos de 2025</a>");
      expect(html).toContain(">Por registrar</span>");
      expect(html).not.toContain("Por reportar");
      // Un histórico no se reporta por «Reportar»: la tabla no lo enlaza y su pantalla lo dice.
      expect(html).not.toContain("/reportar/2025-T3");
      const enReporte = await reporte(ind.codigo, "2025-T3");
      expect(enReporte).toContain("Ese periodo es histórico: se registra en la tabla del año.");
      expect(enReporte).not.toContain(">Reportar</button>");

      const edicion = await pagina(ind.codigo, { anio: "2025", historicos: "editar" });
      for (const campo of ["h_2025-T3_A", "h_2025-T3_B", "h_2025-T4_A", "h_2025-T4_B"]) expect(edicion).toContain(`name="${campo}"`);
      expect(edicion).toContain(">Guardar los históricos</button>");
      expect(edicion).toContain('aria-label="Casos que cumplen, tercer trimestre de 2025"');
      // Cada fila ofrece «No aplica» con su motivo, en campos propios.
      expect(edicion).toMatch(/<input(?=[^>]*type="checkbox")(?=[^>]*name="na_2025-T3")[^>]*>/);
      expect(edicion).toContain('name="motivo_2025-T3"');
      const filas = [{ periodo: "2025-T4", valores: {}, noAplica: true, motivo: "No hubo auditorías programadas" }];
      await registrarHistoricos(mide, { indicadorId: ind.id, filas }, { sql: tx });
      await registrarHistoricos(mide, { indicadorId: ind.id, filas: [{ periodo: "2025-T3", valores: { A: "5", B: "5" } }] }, { sql: tx });
      const conNoAplica = await pagina(ind.codigo, { anio: "2025", historicos: "editar" });
      expect(conNoAplica).toMatch(/<td class="[^"]*\bwhitespace-nowrap\b[^"]*">100 %<\/td>/);
      expect(conNoAplica).toMatch(/<input(?=[^>]*name="na_2025-T4")(?=[^>]*checked="")[^>]*>/);
      expect(conNoAplica).toMatch(/<input(?=[^>]*name="motivo_2025-T4")(?=[^>]*value="No hubo auditorías programadas")[^>]*>/);
      expect(conNoAplica).not.toMatch(/<input(?=[^>]*name="na_2025-T3")(?=[^>]*checked="")[^>]*>/);
      await expect(pagina(ind.codigo, { anio: "2025", historicos: "otra" })).rejects.toThrow("NO_ENCONTRADA");
      // 2026 no tiene históricos.
      await expect(pagina(ind.codigo, { anio: "2026", historicos: "editar" })).rejects.toThrow("NO_ENCONTRADA");
      expect(edicion).toContain("Una fila en blanco no cambia lo ya registrado.");
      expect(await pagina(ind.codigo, { anio: "2025", registrados: "2" })).toMatch(/<p role="status" class="[^"]*text-estado-bien-texto[^"]*">Se registraron 2 históricos\.<\/p>/);
      // «No cambió nada» no es un éxito: va en texto neutro.
      expect(await pagina(ind.codigo, { anio: "2025", registrados: "0" })).toMatch(/<p role="status" class="[^"]*text-muted-foreground[^"]*">No cambió ningún histórico\.<\/p>/);

      // El Admin SGC los registra aunque haya quien mida; quien solo ve el indicador, no.
      contexto.sesion = valida(await sesionAdmin(tx));
      expect(await pagina(ind.codigo, { anio: "2025", historicos: "editar" })).toContain('name="h_2025-T3_A"');
      contexto.sesion = valida(await usuarioDePrueba(tx, { rol: "consulta" }));
      expect(await pagina(ind.codigo, { anio: "2025" })).not.toContain("historicos=editar");
      await expect(pagina(ind.codigo, { anio: "2025", historicos: "editar" })).rejects.toThrow("NO_ENCONTRADA");
    }));

  it("/indicadores/[codigo]: tras un cambio mayor que añade una variable, cada histórico pide solo las de su ficha", () =>
    enTransaccion(async (tx) => {
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      const admin = await sesionAdmin(tx);
      const ind = await indicadorDePrueba(tx, { ...historico, mide: [mide.usuarioId] });
      const [v2] = await tx`INSERT INTO indicador_versiones (indicador_id, numero, estado, tipo_cambio, nombre, forma, formula, periodicidad,
          tendencia, meta, semaforo_modo, umbral_atencion_pct, unidad_sufijo, decimales, creado_por)
        VALUES (${ind.id}, 2, 'borrador', 'mayor', 'Con tres variables', 'libre', '(A + C) / B * 100', 'trimestral', 'ascendente', 90,
          'relativo', 70, ' %', 1, ${admin.usuarioId}) RETURNING id`;
      await tx`SELECT id FROM indicador_versiones WHERE id = ${v2.id} FOR UPDATE`;
      for (const [orden, letra, nombre] of [[1, "A", "Casos que cumplen"], [2, "B", "Casos evaluados"], [3, "C", "Casos recuperados"]] as const) {
        await tx`INSERT INTO indicador_variables (version_id, letra, nombre, orden) VALUES (${v2.id}, ${letra}, ${nombre}, ${orden})`;
      }
      await tx`UPDATE indicador_versiones SET estado = 'aprobada', elaborada_por = ${admin.usuarioId}, huella = ${"2".repeat(64)},
          rige_desde = '2026-T3', aprobada_por = ${admin.usuarioId}, aprobada_en = '2026-06-15T15:00:00Z'
        WHERE id = ${v2.id}`;

      contexto.sesion = valida(mide);
      const edicion = await pagina(ind.codigo, { anio: "2025", historicos: "editar" });
      expect(edicion).toContain(">Casos recuperados<");
      expect(edicion).toContain('name="h_2025-T3_A"');
      expect(edicion).toContain('name="h_2025-T3_B"');
      expect(edicion).not.toContain('name="h_2025-T3_C"');
      expect(edicion).toContain("la ficha de este periodo no tiene esta variable");
      // Lo que el formulario manda se registra con la ficha que rige el periodo.
      const filas = [{ periodo: "2025-T3", valores: { A: "4", B: "5" } }];
      expect(await registrarHistoricos(mide, { indicadorId: ind.id, filas }, { sql: tx })).toEqual({ registrados: 1 });
    }));

  it("/indicadores/[codigo]: una variable que un cambio mayor quitó se nombra como en la ficha del histórico", () =>
    enTransaccion(async (tx) => {
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      const admin = await sesionAdmin(tx);
      const ind = await indicadorDePrueba(tx, { ...historico, mide: [mide.usuarioId] });
      const [v2] = await tx`INSERT INTO indicador_versiones (indicador_id, numero, estado, tipo_cambio, nombre, forma, formula, periodicidad,
          tendencia, meta, semaforo_modo, umbral_atencion_pct, unidad_sufijo, decimales, creado_por)
        VALUES (${ind.id}, 2, 'borrador', 'mayor', 'Con una variable', 'conteo', 'A', 'trimestral', 'ascendente', 5,
          'relativo', 70, '', 0, ${admin.usuarioId}) RETURNING id`;
      await tx`SELECT id FROM indicador_versiones WHERE id = ${v2.id} FOR UPDATE`;
      await tx`INSERT INTO indicador_variables (version_id, letra, nombre, orden) VALUES (${v2.id}, 'A', 'Auditorías hechas', 1)`;
      await tx`UPDATE indicador_versiones SET estado = 'aprobada', elaborada_por = ${admin.usuarioId}, huella = ${"3".repeat(64)},
          rige_desde = '2026-T3', aprobada_por = ${admin.usuarioId}, aprobada_en = '2026-06-15T15:00:00Z'
        WHERE id = ${v2.id}`;
      contexto.sesion = valida(mide);
      const edicion = await pagina(ind.codigo, { anio: "2025", historicos: "editar" });
      expect(edicion).toContain('name="h_2025-T3_B"');
      expect(edicion).toContain(">Casos evaluados<");
      expect(edicion).toContain('aria-label="Casos evaluados, tercer trimestre de 2025"');
      expect(edicion).not.toContain("Variable B");
    }));

  it("/indicadores/[codigo]: «Observaciones» solo para quien ve los soportes", () =>
    enTransaccion(async (tx) => {
      const analiza = await usuarioDePrueba(tx, { rol: "consulta" });
      const ind = await indicadorDePrueba(tx, { ...historico, inicioMedicion: "2026-T1", analiza: [analiza.usuarioId] });
      await asegurarMediciones({ sql: tx, indicadorId: ind.id });
      const [t1] = await tx`SELECT id FROM mediciones WHERE indicador_id = ${ind.id} AND periodo = '2026-T1'`;
      const control = await usuarioDePrueba(tx, { rol: "control_interno" });
      await observar(control, { medicionId: Number(t1.id), texto: "Revise el denominador" }, { sql: tx });

      contexto.sesion = valida(control);
      expect(await pagina(ind.codigo, { anio: "2026" })).toContain(">Observaciones · 1</a>");
      const deControl = await pagina(ind.codigo, { vista: "observaciones" });
      expect(deControl).toContain("Revise el denominador");
      expect(deControl).toMatch(/ · \d{1,2} de [a-z]+ de \d{4}, \d{2}:\d{2}<\/p>/);
      expect(deControl).not.toMatch(/ · \d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
      expect(deControl).toContain(">Sin respuesta<");
      expect(deControl).toMatch(/<option[^>]*value="2026-T1"[^>]*selected=""[^>]*>Primer trimestre de 2026 · 1 observación, 1 sin respuesta<\/option>/);
      expect(deControl).toContain(">Dejar la observación</button>");
      expect(deControl).not.toContain(">Responder<span");

      // Quien analiza la ve y la responde, pero no observa.
      contexto.sesion = valida(analiza);
      const deAnalista = await pagina(ind.codigo, { vista: "observaciones", periodo: "2026-T1" });
      expect(deAnalista).toContain(`>Responder<span class="sr-only"> a ${control.nombre}, `);
      expect(deAnalista).not.toContain(">Dejar la observación</button>");
      await expect(pagina(ind.codigo, { vista: "observaciones", periodo: "2099-T1" })).rejects.toThrow("NO_ENCONTRADA");

      // Quien solo ve el indicador no tiene la pestaña ni la vista.
      contexto.sesion = valida(await usuarioDePrueba(tx, { rol: "consulta" }));
      expect(await pagina(ind.codigo, { anio: "2026" })).not.toContain("Observaciones ·");
      await expect(pagina(ind.codigo, { vista: "observaciones" })).rejects.toThrow("NO_ENCONTRADA");
    }));
});

describe("tras reportar un periodo que pide análisis, el foco va al análisis (ronda 1 de la Tarea 19, D-12)", () => {
  it("el formulario de reporte envía su periodo, y la acción vuelve con `foco=analisis` solo si el análisis falta", () => {
    expect(renderToStaticMarkup(<FormularioReporte datos={DATOS} volver="/indicadores/SGC-IND-01" />)).toContain(
      `<input type="hidden" name="periodo" value="${DATOS.periodo}"/>`,
    );
    const volver = "/indicadores/AIN-IND-01";
    expect(destinoTrasReportar(volver, "2026-09", { estado: "abierta", cumple: false })).toBe(
      "/indicadores/AIN-IND-01?vista=resultados&anio=2026&foco=analisis#analisis",
    );
    expect(destinoTrasReportar(volver, "2026-T3", { estado: "abierta", cumple: false })).toContain("&foco=analisis#analisis");
    // Reportada (cumple o ya tiene el análisis), «sin meta» o una clave rara: vuelve tal cual.
    expect(destinoTrasReportar(volver, "2026-09", { estado: "reportada", cumple: false })).toBe(volver);
    expect(destinoTrasReportar(volver, "2026-09", { estado: "abierta", cumple: true })).toBe(volver);
    expect(destinoTrasReportar(volver, "2026-09", { estado: "abierta", cumple: null })).toBe(volver);
    expect(destinoTrasReportar(volver, "x&y=1", { estado: "abierta", cumple: false })).toBe(volver);
  });

  it("la sección del análisis es un ancla enfocable y, cuando la dirección lo pide, recibe el foco al cargar", () => {
    const sin = renderToStaticMarkup(<SeccionDeAnalisis datos={ANALISIS} volver="/indicadores/SGC-IND-01" enfocar={false} />);
    expect(sin).toMatch(/<section(?=[^>]*id="analisis")(?=[^>]*tabindex="-1")(?=[^>]*aria-labelledby="indicador-analisis")[^>]*>/);
    expect(sin).not.toContain("data-enfocar");
    const con = renderToStaticMarkup(<SeccionDeAnalisis datos={ANALISIS} volver="/indicadores/SGC-IND-01" enfocar />);
    expect(con).toContain('<span hidden="" data-enfocar="analisis"></span>');
    expect(con).toContain(">Análisis: tercer trimestre de 2026</h2>");
  });
});
