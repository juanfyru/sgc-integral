/**
 * Las vistas del módulo de indicadores (Fase 14A, Tarea 15; spec §11, §12.2, §12.3 y §12.7; maquetas 2, 4 y 5): la lista
 * con su barra de estados, el resultado principal y la matriz del año, en render estático con datos de muestra; y las tres
 * páginas contra la BD de desarrollo, dentro de una transacción que se revierte (el cliente de la app se sustituye por
 * ella).
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
import PaginaMatriz from "@/app/(app)/indicadores/matriz/page";
import PaginaIndicadores from "@/app/(app)/indicadores/page";
import { InsigniaSemaforo } from "@/componentes/indicadores/InsigniaSemaforo";
import { ListaIndicadores } from "@/componentes/indicadores/ListaIndicadores";
import { LeyendaDeMatriz, MatrizDelAnio } from "@/componentes/indicadores/MatrizDelAnio";
import { columnasDeVariables, TablaDelAnio } from "@/componentes/indicadores/medicion/TablaDelAnio";
import { ResultadoPrincipal } from "@/componentes/indicadores/ResultadoPrincipal";
import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import type { FilaDelAnio, UltimoResultado } from "@/db/consultas/indicadores/lectura";
import type { FilaDeLista } from "@/db/consultas/indicadores/lista";
import type { CeldaDeMatriz, MatrizLeida } from "@/db/consultas/indicadores/matriz";
import { asegurarMediciones, reportar } from "@/db/consultas/indicadores/mediciones";
import type { SesionValida } from "@/lib/sesion";
import { indicadorDePrueba } from "./utiles/indicadores";
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

const FILA: FilaDeLista = {
  id: 1,
  codigo: "SGC-IND-01",
  nombre: "Cumplimiento del programa de auditorías",
  proceso: "Sistema de Gestión de Calidad",
  subproceso: null,
  subprocesoId: null,
  periodicidad: "trimestral",
  restringido: false,
  retirado: false,
  estado: "activo",
  cambioEnCurso: null,
  periodo: "2026-T3",
  etiquetaPeriodo: "Tercer trimestre de 2026",
  resultado: "60 %",
  meta: "≥ 90 %",
  semaforo: "critico",
  noAplica: false,
  tendencia: [100, 83.3, 60],
  flecha: "baja",
  mejora: false,
  reporte: { texto: "Reportado", vencida: false },
};

const ULTIMO: UltimoResultado = {
  periodo: "2026-T3",
  etiqueta: "Tercer trimestre de 2026",
  resultado: "60 %",
  semaforo: "critico",
  noAplica: false,
  frase: "No cumple: 60 % frente a una meta de 90 %.",
  comparacion: { texto: "23,3 puntos menos que en el segundo trimestre", flecha: "baja", mejora: false },
  requiereAccion: true,
  repetido: false,
};

const celda = (desdeMes: number, hastaMes: number, o: Partial<CeldaDeMatriz>): CeldaDeMatriz => ({
  desdeMes,
  hastaMes,
  texto: "—",
  estado: "futuro",
  nombre: "por venir",
  enlace: null,
  ...o,
});

describe("los componentes", () => {
  it("InsigniaSemaforo siempre lleva el estado escrito", () => {
    expect(renderToStaticMarkup(<InsigniaSemaforo semaforo="critico" />)).toMatch(/data-variante="critico"[^>]*>Crítico</);
    expect(renderToStaticMarkup(<InsigniaSemaforo semaforo={null} noAplica />)).toContain(">No aplica<");
    expect(renderToStaticMarkup(<InsigniaSemaforo semaforo={null} conResultado />)).toContain(">Sin meta<");
    expect(renderToStaticMarkup(<InsigniaSemaforo semaforo={null} />)).toContain(">Sin dato<");
  });

  it("ListaIndicadores pinta la barra de estados con su lectura en texto y una InsigniaSemaforo con texto en cada fila", () => {
    const filas: FilaDeLista[] = [
      FILA,
      { ...FILA, id: 2, codigo: "GTH-IND-03", nombre: "Rotación de personal", restringido: true, resultado: null, semaforo: null, tendencia: [null], flecha: null, mejora: null, reporte: { texto: "Vencido hace 6 días", vencida: true } },
      { ...FILA, id: 3, codigo: "AIN-IND-01", nombre: "Tiempo de espera", semaforo: "bien", resultado: "28 min", subproceso: "Urgencias", flecha: "baja", mejora: true },
    ];
    const html = renderToStaticMarkup(
      <ListaIndicadores filas={filas} resumen={{ bien: 19, atencion: 7, critico: 3, sinDato: 3, vencidos: 2 }} />,
    );
    expect(html).toContain("19 bien, ");
    expect(html).toContain("7 en atención, ");
    expect(html).toContain("3 críticos, ");
    expect(html).toContain("3 sin dato");
    expect(html).toContain("2 reportes vencidos");
    // Cada fila con su estado escrito, nunca solo el color.
    expect(html.match(/data-variante="critico"[^>]*>Crítico</g)).toHaveLength(1);
    expect(html).toMatch(/data-variante="sin-dato"[^>]*>Sin dato</);
    expect(html).toMatch(/data-variante="bien"[^>]*>Bien</);
    expect(html).toContain('href="/indicadores/SGC-IND-01"');
    expect(html).toContain(">Restringido<");
    expect(html).toContain("Sistema de Gestión de Calidad › Urgencias · Trimestral");
    expect(html).toContain("Vencido hace 6 días");
    // La tendencia: la miniatura con su nombre y la flecha escrita.
    expect(html).toContain('role="img" aria-label="Tendencia de los últimos 3 periodos"');
    expect(html).toContain("baja · mejora");
    expect(html).toContain("baja · empeora");
    // La tabla es una región enfocable con nombre.
    expect(html).toMatch(/role="region" aria-label="Indicadores" tabindex="0"/);
  });

  it("ResultadoPrincipal pinta el valor, el estado, la frase y la comparación", () => {
    const html = renderToStaticMarkup(<ResultadoPrincipal ultimo={ULTIMO} periodosSinCumplir={3} />);
    expect(html).toContain(">60 %<");
    expect(html).toMatch(/data-variante="critico"[^>]*>Crítico</);
    expect(html).toContain(">Requiere acción de mejora<");
    expect(html).toContain("No cumple: 60 % frente a una meta de 90 %.");
    expect(html).toContain("Tercer trimestre de 2026");
    expect(html).toContain("23,3 puntos menos que en el segundo trimestre");
    expect(html).toContain("empeora");
    expect(renderToStaticMarkup(<ResultadoPrincipal ultimo={{ ...ULTIMO, repetido: true }} periodosSinCumplir={3} />)).toContain(">3 periodos sin cumplir<");
    expect(renderToStaticMarkup(<ResultadoPrincipal ultimo={null} periodosSinCumplir={3} />)).toContain("Aún no hay resultados");
  });

  it("MatrizDelAnio usa colSpan={3} para un trimestre, escribe «s. d.» y «n. a.» y da nombre accesible a cada celda", () => {
    const procesos: MatrizLeida["procesos"] = [
      {
        id: 7,
        nombre: "Sistema de Gestión de Calidad",
        filas: [
          {
            codigo: "SGC-IND-01",
            nombre: "Auditorías internas",
            retirado: false,
            celdas: [
              celda(1, 3, { texto: "100 %", estado: "bien", nombre: "primer trimestre: 100 %, Bien", enlace: "/indicadores/SGC-IND-01?vista=resultados&anio=2026#periodo-2026-T1" }),
              celda(4, 6, { texto: "s. d.", estado: "sin-dato", nombre: "segundo trimestre: sin dato", enlace: "/indicadores/SGC-IND-01?vista=resultados&anio=2026#periodo-2026-T2" }),
              celda(7, 9, { texto: "n. a.", estado: "no-aplica", nombre: "tercer trimestre: no aplica", enlace: "/indicadores/SGC-IND-01?vista=resultados&anio=2026#periodo-2026-T3" }),
              celda(10, 12, { nombre: "cuarto trimestre: por venir" }),
            ],
            anio: celda(1, 12, { texto: "100 %", estado: "bien", nombre: "Año 2026: 100 %, Bien", enlace: "/indicadores/SGC-IND-01?vista=resultados&anio=2026" }),
          },
        ],
      },
    ];
    const html = renderToStaticMarkup(<MatrizDelAnio anio={2026} procesos={procesos} />);
    expect(html.match(/colSpan="3"/gi)).toHaveLength(4);
    expect(html).toContain(">s. d.<");
    expect(html).toContain(">n. a.<");
    for (const nombre of ["primer trimestre: 100 %, Bien", "segundo trimestre: sin dato", "tercer trimestre: no aplica", "Año 2026: 100 %, Bien"]) {
      expect(html).toContain(`aria-label="${nombre}"`);
    }
    // Sin enlace, el nombre va en texto para lectores de pantalla.
    expect(html).toContain('<span class="sr-only">cuarto trimestre: por venir</span>');
    expect(html).toContain('href="/indicadores/SGC-IND-01?vista=resultados&amp;anio=2026#periodo-2026-T1"');
    // Agrupada por proceso (el encabezado del grupo de filas), con el indicador como encabezado de su fila.
    expect(html).toMatch(/<th[^>]*scope="rowgroup"[^>]*>Sistema de Gestión de Calidad<\/th>/);
    expect(html).not.toContain('scope="colgroup"');
    expect(html).toMatch(/<th[^>]*scope="row"/);
    expect(html).toMatch(/role="region" aria-label="Matriz de 2026" tabindex="0"/);
    // El nombre lo dice el enlace: la celda no lo repite en un `title`.
    expect(html).not.toMatch(/<td[^>]*\stitle=/);
    // Un activo no lleva la marca; un retirado, sí, junto al nombre (ronda 1 de la Tarea 19, D-9).
    expect(html).not.toContain(">Retirado<");
    const conRetirado = renderToStaticMarkup(
      <MatrizDelAnio anio={2026} procesos={[{ ...procesos[0], filas: [{ ...procesos[0].filas[0], retirado: true }] }]} />,
    );
    expect(conRetirado).toMatch(/Auditorías internas<\/span>(?:(?!<\/th>)[\s\S])*>Retirado</);
  });

  it("MatrizDelAnio: Bien, Atención y Crítico se distinguen también por su forma, y la leyenda la repite", () => {
    const fila = (codigo: string, celdas: CeldaDeMatriz[]): MatrizLeida["procesos"][number]["filas"][number] => ({
      codigo,
      nombre: codigo,
      retirado: false,
      celdas,
      anio: celda(1, 12, { texto: "s. d.", estado: "sin-dato", nombre: "Año 2026: sin dato", enlace: `/indicadores/${codigo}?vista=resultados&anio=2026` }),
    });
    const enlace = "/indicadores/X?vista=resultados&anio=2026#periodo-2026";
    const procesos: MatrizLeida["procesos"] = [
      {
        id: 1,
        nombre: "Gestión",
        filas: [
          fila("A-1", [
            celda(1, 3, { texto: "91,6 %", estado: "bien", nombre: "primer trimestre: 91,6 %, Bien", enlace }),
            celda(4, 6, { texto: "81,4 %", estado: "atencion", nombre: "segundo trimestre: 81,4 %, Atención", enlace }),
            celda(7, 9, { texto: "60 %", estado: "critico", nombre: "tercer trimestre: 60 %, Crítico" }),
            celda(10, 12, { texto: "12", estado: "sin-meta", nombre: "cuarto trimestre: 12, sin meta", enlace }),
          ]),
        ],
      },
    ];
    const html = renderToStaticMarkup(<MatrizDelAnio anio={2026} procesos={procesos} />);
    // Cada celda con valor y estado lleva su glifo, decorativo; sin meta no lleva ninguno.
    for (const estado of ["bien", "atencion", "critico"]) {
      expect(html).toMatch(new RegExp(`<svg(?=[^>]*aria-hidden="true")(?=[^>]*data-glifo="${estado}")[^>]*>`));
      expect(html.match(new RegExp(`data-glifo="${estado}"`, "g"))).toHaveLength(1);
    }
    expect(html).not.toContain('data-glifo="sin-meta"');
    // La celda «Año» sin acumulado es un dato que falta, no un periodo por venir.
    expect(html).toContain('aria-label="Año 2026: sin dato"');
    expect(html).toMatch(/aria-label="Año 2026: sin dato"[^>]*>s\. d\.</);

    const leyenda = renderToStaticMarkup(<LeyendaDeMatriz />);
    for (const [estado, texto] of [["bien", "Bien"], ["atencion", "Atención"], ["critico", "Crítico"]]) {
      expect(leyenda).toMatch(new RegExp(`data-glifo="${estado}"[^]*?<span>${texto}</span>`));
    }
    expect(leyenda).toContain("<span>Por venir</span>");
  });

  it("la lista escribe la flecha aunque la miniatura tenga un solo periodo", () => {
    const html = renderToStaticMarkup(
      <ListaIndicadores
        filas={[{ ...FILA, tendencia: [null, null, null, null, null, 87], semaforo: "bien", resultado: "87 %", flecha: "sube", mejora: true }]}
        resumen={{ bien: 1, atencion: 0, critico: 0, sinDato: 0, vencidos: 0 }}
      />,
    );
    expect(html).toContain("un solo periodo");
    expect(html).not.toContain('aria-label="Tendencia de');
    expect(html).toContain("sube · mejora");
  });

  it("la tabla del año: las columnas son la unión de las letras y una celda dice el nombre que tiene en su ficha si es otro", () => {
    const fila = (periodo: string, valores: FilaDelAnio["valores"]): FilaDelAnio => ({
      periodo,
      etiqueta: periodo,
      version: 1,
      medicionId: null,
      estado: "cerrada",
      vencida: false,
      vence: null,
      historica: false,
      noAplica: false,
      motivo: null,
      valores,
      resultado: "80 %",
      semaforo: "atencion",
      meta: "≥ 90 %",
      cumple: false,
      frase: null,
      requiereAccion: false,
      repetido: false,
      corregida: false,
      metaTardia: false,
      sinAnalisis: false,
      analisis: null,
      causa: null,
      accionPropuesta: null,
    });
    const filas = [
      fila("2026-05", [
        { letra: "A", nombre: "Atenciones a tiempo", valor: "8", numero: 8 },
        { letra: "B", nombre: "Atenciones", valor: "10", numero: 10 },
      ]),
      fila("2026-07", [
        { letra: "A", nombre: "Casos oportunos", valor: "4", numero: 4 },
        { letra: "B", nombre: "Atenciones", valor: "10", numero: 10 },
        { letra: "C", nombre: "Casos recuperados", valor: "4", numero: 4 },
      ]),
    ];
    // La unión, en orden de aparición, con el nombre de la versión más reciente que tiene la letra.
    expect(columnasDeVariables(filas)).toEqual([
      { letra: "A", nombre: "Casos oportunos" },
      { letra: "B", nombre: "Atenciones" },
      { letra: "C", nombre: "Casos recuperados" },
    ]);
    const html = renderToStaticMarkup(
      <TablaDelAnio filas={filas} variables={columnasDeVariables(filas)} anio={2026} codigo="ZZ-1" puedeMedir={false} />,
    );
    // Mayo tenía otro nombre para A: se lee bajo el valor, sin cursor; julio no repite el del encabezado.
    expect(html).toContain('8<span class="block text-xs font-normal text-muted-foreground">(Atenciones a tiempo)</span>');
    expect(html).not.toContain("(Casos oportunos)");
    expect(html).not.toContain("(Atenciones)");
    // Mayo no tiene C: «—».
    expect(html).toMatch(/<td class="[^"]*">—<\/td>/);
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
const listaPagina = async (sp: Record<string, string> = {}) => renderToStaticMarkup(await PaginaIndicadores({ searchParams: Promise.resolve(sp) }));
const matrizPagina = async (sp: Record<string, string> = {}) => renderToStaticMarkup(await PaginaMatriz({ searchParams: Promise.resolve(sp) }));

/** Un solo `h1` por página, y cada región desplazable con nombre y enfocable. */
function estructuraAccesible(html: string) {
  expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
  const regiones = html.match(/<[a-z]+[^>]*role="region"[^>]*>/g) ?? [];
  for (const r of regiones) {
    expect(r).toMatch(/aria-label="[^"]+"/);
    expect(r).toContain('tabindex="0"');
  }
}

/** Un trimestral de 2026 con los tres primeros trimestres reportados por quien mide. */
async function conResultados(tx: TransactionSql) {
  const mide = await usuarioDePrueba(tx, { rol: "consulta" });
  const ind = await indicadorDePrueba(tx, {
    periodicidad: "trimestral",
    inicioMedicion: "2026-T1",
    aprobadaEn: new Date("2025-12-15T15:00:00Z"),
    mide: [mide.usuarioId],
  });
  await asegurarMediciones({ sql: tx, indicadorId: ind.id });
  for (const [periodo, valores] of [["2026-T1", { A: "5", B: "5" }], ["2026-T2", { A: "5", B: "6" }], ["2026-T3", { A: "3", B: "5" }]] as const) {
    const [m] = await tx`SELECT id FROM mediciones WHERE indicador_id = ${ind.id} AND periodo = ${periodo}`;
    await reportar(mide, { medicionId: Number(m.id), valores, parcial: false, confirmado: true }, { sql: tx });
  }
  return { mide, ind };
}

describe("las páginas", () => {
  it("/indicadores/[codigo]: Resultados con el último resultado, la gráfica de tubos, el acumulado, las variables y la tabla del año", () =>
    enTransaccion(async (tx) => {
      const { mide, ind } = await conResultados(tx);
      contexto.sesion = valida(mide);
      const html = await pagina(ind.codigo, { anio: "2026" });
      estructuraAccesible(html);
      expect(html).toContain("No cumple: 60 % frente a una meta de 90 %.");
      expect(html).toContain(">Acumulado del año</h2>");
      expect(html).toContain("81,3 %");
      expect(html).toContain("Crítico por debajo de 63 %");
      expect(html).toContain(">Sus variables</h2>");
      expect(html).toContain('aria-label="Casos que cumplen"');
      // El selector de rango de la gráfica y el del año de la tabla.
      expect(html).toContain("&amp;rango=dos");
      expect(html).toContain("&amp;rango=todo");
      expect(html).toMatch(/<select[^>]*name="anio"/);
      // El selector ofrece los años con mediciones (y el en curso), no un año sin nada que mostrar.
      const opciones = [...(/<select[^>]*name="anio"[^>]*>(.*?)<\/select>/.exec(html)?.[1] ?? "").matchAll(/value="(\d{4})"/g)].map((m) => Number(m[1]));
      expect(opciones).toContain(2026);
      expect(opciones.every((a) => a >= 2026)).toBe(true);
      // La fila del periodo tiene su ancla: la matriz enlaza a ella.
      expect(html).toContain('id="periodo-2026-T3"');
      await expect(pagina(ind.codigo, { anio: "2026", rango: "siempre" })).rejects.toThrow("NO_ENCONTRADA");
      expect(await pagina(ind.codigo, { anio: "2026", rango: "todo" })).toContain(">Resultados de 2026</h2>");
    }));

  it("la página del indicador no pinta la columna de soportes ni la pestaña Observaciones a quien no las ve", () =>
    enTransaccion(async (tx) => {
      const { mide, ind } = await conResultados(tx);
      contexto.sesion = valida(await usuarioDePrueba(tx, { rol: "consulta" }));
      const ajena = await pagina(ind.codigo, { anio: "2026" });
      expect(ajena).not.toContain(">Soportes</th>");
      expect(ajena).not.toContain("Observaciones ·");
      expect(ajena).not.toContain("?vista=observaciones");
      await expect(pagina(ind.codigo, { vista: "observaciones" })).rejects.toThrow("NO_ENCONTRADA");

      contexto.sesion = valida(mide);
      const propia = await pagina(ind.codigo, { anio: "2026" });
      expect(propia).toContain(">Soportes</th>");
      expect(propia).toContain(">Observaciones · 0</a>");
      const observaciones = await pagina(ind.codigo, { vista: "observaciones" });
      estructuraAccesible(observaciones);
      expect(observaciones).toContain(">Observaciones</h2>");
    }));

  it("/indicadores: la lista con su barra, sus filtros en un formulario GET y lo que la persona ve", () =>
    enTransaccion(async (tx) => {
      const { mide, ind } = await conResultados(tx);
      const restringido = await indicadorDePrueba(tx, { nivelAcceso: "restringido" });
      contexto.sesion = valida(mide);
      const html = await listaPagina();
      estructuraAccesible(html);
      expect(html).toMatch(/<form(?=[^>]*method="get")(?=[^>]*action="\/indicadores")[^>]*>/);
      // A 390 px, dos selectores por fila; desde `sm`, la fila que se envuelve.
      expect(html).toMatch(/<form(?=[^>]*class="[^"]*\bgrid-cols-2\b)(?=[^>]*class="[^"]*\bsm:flex\b)[^>]*action="\/indicadores"/);
      for (const nombre of ["proceso", "subproceso", "clasificacion", "tipo", "semaforo", "reporte", "participo", "texto", "retirados"]) {
        expect(html).toMatch(new RegExp(`name="${nombre}"`));
      }
      expect(html).toContain(ind.codigo);
      expect(html).not.toContain(restringido.codigo);
      expect(html).toMatch(/aria-current="page"[^>]*>Lista</);
      expect(html).toContain('href="/indicadores/matriz"');
      // Los filtros elegidos siguen elegidos; uno inválido se ignora.
      const filtrada = await listaPagina({ semaforo: "critico", texto: ind.codigo, reporte: "nada" });
      expect(filtrada).toMatch(/<option value="critico" selected="">/);
      expect(filtrada).toContain(`value="${ind.codigo}"`);
      // «reporte=nada» no filtra: la fila sigue (solo con el texto, que no depende del reloj).
      expect(await listaPagina({ texto: ind.codigo, reporte: "nada" })).toContain(`href="/indicadores/${ind.codigo}"`);
      // Sin coincidencias, el estado vacío.
      expect(await listaPagina({ texto: "zz-no-hay-ninguno" })).toContain("Ningún indicador coincide");
      // Si lo que deja cero filas es el semáforo, la barra (contada antes) sigue: dice lo que la persona ve.
      const porSemaforo = await listaPagina({ texto: ind.codigo, semaforo: "bien" });
      expect(porSemaforo).toContain("Ningún indicador coincide");
      expect(porSemaforo).toContain("0 bien, ");
      expect(porSemaforo).not.toContain(`href="/indicadores/${ind.codigo}"`);
    }));

  it("/indicadores/matriz: filtros de año, proceso y clasificación, leyenda con texto y cada celda enlazada", () =>
    enTransaccion(async (tx) => {
      const { mide, ind } = await conResultados(tx);
      contexto.sesion = valida(mide);
      const html = await matrizPagina({ anio: "2026", proceso: String(ind.procesoId) });
      estructuraAccesible(html);
      expect(html).toMatch(/aria-current="page"[^>]*>Matriz del año</);
      expect(html).toMatch(/<select[^>]*name="anio"/);
      expect(html).toMatch(/<select[^>]*name="proceso"/);
      expect(html).toMatch(/<select[^>]*name="clasificacion"/);
      for (const t of ["Bien", "Atención", "Crítico", "Sin dato"]) expect(html).toContain(`>${t}<`);
      expect(html).toContain(`href="/indicadores/${ind.codigo}?vista=resultados&amp;anio=2026#periodo-2026-T1"`);
      expect(html).toContain('aria-label="primer trimestre: 100 %, Bien"');
      // Sin la comilla de cierre: desde 2027 el nombre añade «Acumulado parcial: falta el cuarto trimestre».
      expect(html).toContain('aria-label="Año 2026: 81,3 %, Atención');
      await expect(matrizPagina({ anio: "abc" })).rejects.toThrow("NO_ENCONTRADA");
      await expect(matrizPagina({ anio: "2999" })).rejects.toThrow("NO_ENCONTRADA");
      // Un año sin nada medido: el estado vacío.
      expect(await matrizPagina({ anio: "2026", proceso: String(ind.procesoId), clasificacion: "999999" })).toContain("Ningún indicador");
    }));

  it("quien administra ve el borrador en la lista, con su enlace", () =>
    enTransaccion(async (tx) => {
      const admin = await sesionAdmin(tx);
      const borrador = await indicadorDePrueba(tx, { estado: "borrador" });
      contexto.sesion = valida(admin);
      const html = await listaPagina({ texto: borrador.codigo });
      expect(html).toContain(`href="/indicadores/${borrador.codigo}"`);
      expect(html).toContain(">Borrador<");
    }));
});
