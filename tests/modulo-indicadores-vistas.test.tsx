/**
 * Las vistas del módulo de indicadores (Fase 14A, Tarea 15; spec §11, §12.2, §12.3 y §12.7; maquetas 2, 4 y 5): la lista
 * con su barra de estados, el resultado principal y la matriz del año, en render estático con datos de muestra; y las tres
 * páginas contra la BD de desarrollo, dentro de una transacción que se revierte (el cliente de la app se sustituye por
 * ella).
 */
import { existsSync, readFileSync } from "node:fs";
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
  volverACalcularAccion: vi.fn(),
  registrarConstanciaAccion: vi.fn(),
  corregirConstanciaAccion: vi.fn(),
  quitarSoporteDeConstanciaAccion: vi.fn(),
  resolverImpactoNoAfectaAccion: vi.fn(),
}));

import PaginaIndicador from "@/app/(app)/indicadores/[codigo]/page";
import PaginaMatriz from "@/app/(app)/indicadores/matriz/page";
import PaginaObjetivos from "@/app/(app)/indicadores/objetivos/page";
import PaginaIndicadores from "@/app/(app)/indicadores/page";
import { InsigniaSemaforo } from "@/componentes/indicadores/InsigniaSemaforo";
import { ListaIndicadores } from "@/componentes/indicadores/ListaIndicadores";
import { LeyendaDeMatriz, MatrizDelAnio } from "@/componentes/indicadores/MatrizDelAnio";
import { Objetivos } from "@/componentes/indicadores/Objetivos";
import { columnasDeVariables, TablaDelAnio } from "@/componentes/indicadores/medicion/TablaDelAnio";
import { ResultadoPrincipal } from "@/componentes/indicadores/ResultadoPrincipal";
import { anclaDeConstancia, esAnclaDeConstancia, esClicDeNavegacion } from "@/componentes/indicadores/vistas/FormulariosDeConstancia";
import { ReportesAlEnte, type DatosDeReportes } from "@/componentes/indicadores/vistas/ReportesAlEnte";
import { obtenerSql } from "@/db/cliente";
import { registrarArchivo } from "@/db/consultas/admin";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import type { Constancia } from "@/db/consultas/indicadores/constancias";
import { PERIODICIDAD_EXTERNA_NO_CONTIENE } from "@/lib/indicadores/constancias";
import type { FilaDelAnio, UltimoResultado } from "@/db/consultas/indicadores/lectura";
import type { FilaDeLista } from "@/db/consultas/indicadores/lista";
import type { CeldaDeMatriz, MatrizLeida } from "@/db/consultas/indicadores/matriz";
import { asegurarMediciones, reportar } from "@/db/consultas/indicadores/mediciones";
import type { ObjetivoLeido } from "@/db/consultas/indicadores/objetivos";
import { periodoDe } from "@/lib/indicadores-documentales/periodo";
import { fechaLimiteDeReporte } from "@/lib/indicadores/periodos";
import type { SesionValida } from "@/lib/sesion";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
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
  automatico: false,
  estado: "activo",
  cambioEnCurso: null,
  periodo: "2026-T3",
  etiquetaPeriodo: "Tercer trimestre de 2026",
  resultado: "60 %",
  meta: "≥ 90 %",
  semaforo: "critico",
  noAplica: false,
  cumple: false,
  tendencia: [100, 83.3, 60],
  flecha: "baja",
  mejora: false,
  reporte: { texto: "Reportado", vencida: false },
  envio: null,
  enCritico: null,
  dimension: null,
};

const ULTIMO: UltimoResultado = {
  periodo: "2026-T3",
  etiqueta: "Tercer trimestre de 2026",
  resultado: "60 %",
  semaforo: "critico",
  noAplica: false,
  frase: "No cumple: 60 % frente a una meta de 90 %.",
  comparacion: { texto: "23,3 puntos menos que en el segundo trimestre", flecha: "baja", mejora: false },
  cumple: false,
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
  cumple: null,
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
      { ...FILA, id: 3, codigo: "AIN-IND-01", nombre: "Tiempo de espera", semaforo: "bien", cumple: true, resultado: "28 min", subproceso: "Urgencias", flecha: "baja", mejora: true },
    ];
    const html = renderToStaticMarkup(
      <ListaIndicadores filas={filas} resumen={{ bien: 19, bienSinAlcanzar: 0, atencion: 7, critico: 3, sinDato: 3, noAplica: 0, vencidos: 2 }} />,
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

  it("Bien que no alcanza la meta lo dice con letras, con la misma variante de color (spec 14A §3.1)", () => {
    const sin = renderToStaticMarkup(<InsigniaSemaforo semaforo="bien" cumple={false} />);
    expect(sin).toMatch(/data-variante="bien"[^>]*>Bien · no alcanza la meta</);
    for (const cumple of [true, null, undefined]) {
      expect(renderToStaticMarkup(<InsigniaSemaforo semaforo="bien" cumple={cumple} />)).toMatch(/data-variante="bien"[^>]*>Bien</);
    }
    // Solo Bien lo dice: Atención y Crítico ya son «no cumple».
    expect(renderToStaticMarkup(<InsigniaSemaforo semaforo="atencion" cumple={false} />)).toMatch(/>Atención</);
  });

  it("la lista, el resultado principal y la tabla del año escriben «Bien · no alcanza la meta» y «No» en «Cumple»", () => {
    const lista = renderToStaticMarkup(
      <ListaIndicadores
        filas={[{ ...FILA, semaforo: "bien", cumple: false, resultado: "92 %" }]}
        resumen={{ bien: 1, bienSinAlcanzar: 0, atencion: 0, critico: 0, sinDato: 0, noAplica: 0, vencidos: 0 }}
      />,
    );
    expect(lista).toContain("Bien · no alcanza la meta");
    const principal = renderToStaticMarkup(<ResultadoPrincipal ultimo={{ ...ULTIMO, semaforo: "bien", cumple: false, resultado: "92 %" }} periodosSinCumplir={3} />);
    expect(principal).toContain("Bien · no alcanza la meta");
    const fila: FilaDelAnio = {
      periodo: "2026-T3",
      etiqueta: "Tercer trimestre de 2026",
      version: 1,
      medicionId: 5,
      estado: "reportada",
      vencida: false,
      vence: null,
      historica: false,
      noAplica: false,
      motivo: null,
      valores: [],
      resultado: "92 %",
      semaforo: "bien",
      meta: "≥ 95 %",
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
      automatica: false,
      fotoEn: null,
      seCalcula: null,
      recalculable: false,
      enCritico: null,
      dimension: null,
    };
    const tabla = renderToStaticMarkup(<TablaDelAnio filas={[fila]} variables={[]} anio={2026} codigo="ZZ-1" puedeMedir={false} />);
    expect(tabla).toContain("Bien · no alcanza la meta");
    expect(tabla).toMatch(/<td class="[^"]*">No<\/td>/);
  });

  it("la matriz marca con «✓*» el Bien que no alcanza la meta, lo nombra así y la leyenda lo explica", () => {
    const enlace = "/indicadores/X?vista=resultados&anio=2026#periodo-2026-T1";
    const procesos: MatrizLeida["procesos"] = [
      {
        id: 1,
        nombre: "Gestión",
        filas: [
          {
            codigo: "A-1",
            nombre: "A-1",
            retirado: false,
            celdas: [
              celda(1, 3, { texto: "92 %", estado: "bien", cumple: false, nombre: "primer trimestre: 92 %, Bien, no alcanza la meta", enlace }),
              celda(4, 6, { texto: "96 %", estado: "bien", cumple: true, nombre: "segundo trimestre: 96 %, Bien", enlace }),
            ],
            anio: celda(1, 12, { texto: "94 %", estado: "bien", cumple: false, nombre: "Año 2026: 94 %, Bien, no alcanza la meta", enlace }),
          },
        ],
      },
    ];
    const html = renderToStaticMarkup(<MatrizDelAnio anio={2026} procesos={procesos} />);
    expect(html).toContain('aria-label="primer trimestre: 92 %, Bien, no alcanza la meta"');
    expect(html.match(/data-glifo="bien-sin-alcanzar"/g)).toHaveLength(2);
    expect(html.match(/data-glifo="bien"/g)).toHaveLength(1);
    expect(html).toMatch(/data-glifo="bien-sin-alcanzar"[^>]*>(?:(?!<\/svg>)[^])*<\/svg><span aria-hidden="true"[^>]*>\*<\/span>/);
    const leyenda = renderToStaticMarkup(<LeyendaDeMatriz />);
    expect(leyenda).toMatch(/data-glifo="bien-sin-alcanzar"[^]*?<span>Bien, sin alcanzar la meta<\/span>/);
  });

  it("la lista escribe la flecha aunque la miniatura tenga un solo periodo", () => {
    const html = renderToStaticMarkup(
      <ListaIndicadores
        filas={[{ ...FILA, tendencia: [null, null, null, null, null, 87], semaforo: "bien", resultado: "87 %", flecha: "sube", mejora: true }]}
        resumen={{ bien: 1, bienSinAlcanzar: 0, atencion: 0, critico: 0, sinDato: 0, noAplica: 0, vencidos: 0 }}
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
      automatica: false,
      fotoEn: null,
      seCalcula: null,
      recalculable: false,
      enCritico: null,
      dimension: null,
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

  it("la tabla del año no ofrece reportar ni corregir lo que calcula el sistema; a quien analiza, «Ver»", () => {
    const fila = (periodo: string, o: Partial<FilaDelAnio>): FilaDelAnio => ({
      periodo,
      etiqueta: periodo,
      version: 1,
      medicionId: Number(periodo.slice(-1)),
      estado: "por_reportar",
      vencida: false,
      vence: "10 de octubre de 2026",
      historica: false,
      noAplica: false,
      motivo: null,
      valores: [],
      resultado: null,
      semaforo: null,
      meta: "≥ 90 %",
      cumple: null,
      frase: null,
      requiereAccion: false,
      repetido: false,
      corregida: false,
      metaTardia: false,
      sinAnalisis: false,
      analisis: null,
      causa: null,
      accionPropuesta: null,
      automatica: false,
      fotoEn: null,
      seCalcula: null,
      recalculable: false,
      enCritico: null,
      dimension: null,
      ...o,
    });
    // Manual el primero; desde el segundo lo calcula el sistema: uno sin dato y otro ya calculado.
    const filas = [
      fila("2026-T1", {}),
      fila("2026-T2", { automatica: true, estado: "falta_dato" }),
      fila("2026-T3", { automatica: true, estado: "reportada", resultado: "95 %", semaforo: "bien", cumple: true }),
    ];
    const tabla = (puedeAnalizar: boolean) =>
      renderToStaticMarkup(<TablaDelAnio filas={filas} variables={[]} anio={2026} codigo="ZZ-1" puedeMedir puedeAnalizar={puedeAnalizar} />);

    const deQuienMide = tabla(false);
    expect(deQuienMide).toContain('href="/indicadores/ZZ-1/reportar/2026-T1"');
    expect(deQuienMide).not.toContain("/reportar/2026-T2");
    expect(deQuienMide).not.toContain("/reportar/2026-T3");
    expect(deQuienMide).not.toContain(">Corregir<");
    expect(deQuienMide).not.toContain(">Ver<");

    const deQuienAnaliza = tabla(true);
    expect(deQuienAnaliza).toMatch(/href="\/indicadores\/ZZ-1\/reportar\/2026-T1"[^>]*>Reportar</);
    for (const periodo of ["2026-T2", "2026-T3"]) {
      expect(deQuienAnaliza).toMatch(new RegExp(`href="/indicadores/ZZ-1/reportar/${periodo}"[^>]*>Ver<span class="sr-only"> ${periodo}</span>`));
    }
    expect(deQuienAnaliza).not.toContain(">Corregir<");

    // Cuándo calcula el sistema (anexo 14B, §5.4): la fecha de la foto o la de la espera; mientras espera, esa es su fecha.
    const conFotos = [
      fila("2026-T2", { automatica: true, estado: "falta_dato", seCalcula: new Date("2026-07-11T04:59:59.999Z") }),
      fila("2026-T3", {
        automatica: true,
        estado: "falta_analisis",
        resultado: "50 %",
        semaforo: "critico",
        cumple: false,
        fotoEn: new Date("2026-10-11T12:12:00Z"),
        recalculable: true,
      }),
    ];
    const conFoto = (administra: boolean) =>
      renderToStaticMarkup(
        <TablaDelAnio filas={conFotos} variables={[]} anio={2026} codigo="ZZ-1" puedeMedir={false} puedeAnalizar puedeVolverACalcular={administra} />,
      );
    const deQuienAdministra = conFoto(true);
    expect(deQuienAdministra).toContain("Se calcula el 10 de julio");
    expect(deQuienAdministra).toContain("Calculado por el sistema · foto del 11 de octubre, 7:12 a. m.");
    // El plazo del análisis sale con la foto; el de la espera no se repite.
    expect(deQuienAdministra.match(/Plazo hasta el/g)).toHaveLength(1);
    // «Volver a calcular» solo en la foto de flujo sin cerrar ni reabrir, y solo a quien administra.
    expect(deQuienAdministra.match(/>Volver a calcular</g)).toHaveLength(1);
    expect(deQuienAdministra).toMatch(/>Volver a calcular<span class="sr-only"> 2026-T3<\/span>/);
    expect(conFoto(false)).not.toContain("Volver a calcular");
  });

  it("la lista marca con «Automático» el indicador que calcula el sistema", () => {
    const lista = (automatico: boolean) =>
      renderToStaticMarkup(
        <ListaIndicadores filas={[{ ...FILA, automatico }]} resumen={{ bien: 0, bienSinAlcanzar: 0, atencion: 1, critico: 0, sinDato: 0, noAplica: 0, vencidos: 0 }} />,
      );
    expect(lista(true)).toContain(">Automático<");
    expect(lista(false)).not.toContain("Automático");
  });

  it("la lista dice «Envío pendiente» y «Envío vencido» con una insignia de texto (anexo 14B, §8)", () => {
    const lista = (envio: FilaDeLista["envio"]) =>
      renderToStaticMarkup(
        <ListaIndicadores filas={[{ ...FILA, envio }]} resumen={{ bien: 0, bienSinAlcanzar: 0, atencion: 0, critico: 1, sinDato: 0, noAplica: 0, vencidos: 0 }} />,
      );
    expect(lista("pendiente")).toMatch(/data-variante="atencion"[^>]*>Envío pendiente</);
    expect(lista("vencido")).toMatch(/data-variante="critico"[^>]*>Envío vencido</);
    expect(lista(null)).not.toContain("Envío");
  });

  it("Objetivos: por clase, cada objetivo en su tarjeta con su estado escrito y su tabla de indicadores (anexo 14B, §7)", () => {
    const objetivos: ObjetivoLeido[] = [
      {
        id: 1,
        clase: "calidad",
        enunciado: "Mejorar la oportunidad de la atención",
        estado: "no_cumplido",
        indicadores: [
          { codigo: "SGC-IND-01", nombre: "Cumplimiento del programa de auditorías", proceso: "Sistema de Gestión de Calidad", periodo: "Tercer trimestre de 2026", resultado: "60 %", semaforo: "critico", cumple: false, cuenta: true },
          { codigo: "AIN-ID-002", nombre: "Oportunidad de la cita", proceso: "Atención integral", periodo: "Septiembre de 2026", resultado: "88 %", semaforo: "bien", cumple: false, cuenta: true },
          { codigo: "AIN-ID-003", nombre: "Quejas resueltas", proceso: "Atención integral", periodo: null, resultado: null, semaforo: null, cumple: null, cuenta: true },
        ],
      },
      { id: 2, clase: "calidad", enunciado: "Fortalecer la cultura de seguridad", estado: "sin_medicion", indicadores: [] },
      {
        id: 3,
        clase: "institucional",
        enunciado: "Sostener las finanzas",
        estado: "cumplido",
        indicadores: [{ codigo: "GFI-ID-001", nombre: "Recaudo", proceso: "Gestión financiera", periodo: "2026", resultado: "97 %", semaforo: "bien", cumple: true, cuenta: true }],
      },
    ];
    const html = renderToStaticMarkup(<Objetivos objetivos={objetivos} />);
    // Por clase, con su título, los de calidad antes.
    expect(html).toMatch(/<h2[^>]*>Objetivos de calidad<\/h2>[\s\S]*<h2[^>]*>Objetivos institucionales<\/h2>/);
    // Cada tarjeta, con su enunciado y su estado escrito, nunca solo el color.
    expect(html).toMatch(/<h3[^>]*>Mejorar la oportunidad de la atención<\/h3>/);
    expect(html).toMatch(/data-variante="critico"[^>]*>No cumplido</);
    expect(html).toMatch(/data-variante="sin-dato"[^>]*>Sin medición</);
    expect(html).toMatch(/data-variante="bien"[^>]*>Cumplido</);
    // La tabla: código enlazado, nombre, proceso, periodo y el resultado con su estado y la salvedad.
    expect(html).toContain('href="/indicadores/SGC-IND-01"');
    expect(html).toContain(">Oportunidad de la cita<");
    expect(html).toContain(">Atención integral<");
    expect(html).toContain(">Septiembre de 2026<");
    expect(html).toContain(">88 %<");
    expect(html).toContain(">Bien · no alcanza la meta<");
    expect(html).toMatch(/data-variante="sin-dato"[^>]*>Sin dato</);
    // Sin indicadores visibles, lo dice, sin tabla.
    expect(html).toContain("Sin indicadores que mostrar");
    // Cada tabla es una región enfocable con su propio nombre.
    const regiones = [...html.matchAll(/role="region" aria-label="([^"]+)" tabindex="0"/g)].map((m) => m[1]);
    expect(regiones).toHaveLength(2);
    expect(new Set(regiones).size).toBe(2);
  });

  it("Objetivos en el celular: la tabla desde md y, por debajo, una lista con todo lo de cada indicador a la vista", () => {
    const renglon = "No cuenta para el estado de este objetivo: es el indicador que resume los objetivos.";
    const objetivo: ObjetivoLeido = {
      id: 7,
      clase: "calidad",
      enunciado: "Mejorar la oportunidad de la atención",
      estado: "no_cumplido",
      indicadores: [
        { codigo: "SGC-IND-01", nombre: "Cumplimiento del programa de auditorías", proceso: "Sistema de Gestión de Calidad", periodo: "Tercer trimestre de 2026", resultado: "60 %", semaforo: "critico", cumple: false, cuenta: true },
        { codigo: "AIN-ID-002", nombre: "Oportunidad de la cita", proceso: "Atención integral", periodo: "Septiembre de 2026", resultado: "88 %", semaforo: "bien", cumple: false, cuenta: true },
        { codigo: "AIN-ID-003", nombre: "Quejas resueltas", proceso: "Atención integral", periodo: null, resultado: null, semaforo: null, cumple: null, cuenta: true },
        { codigo: "SGC-ID-009", nombre: "Objetivos cumplidos", proceso: "Sistema de Gestión de Calidad", periodo: "2026", resultado: "50 %", semaforo: "atencion", cumple: false, cuenta: false },
      ],
    };
    const html = renderToStaticMarkup(<Objetivos objetivos={[objetivo]} />);
    const titulo = "Indicadores del objetivo: Mejorar la oportunidad de la atención";

    // Desde md, la tabla de siempre; por debajo, la lista, con el mismo nombre.
    expect(html).toMatch(new RegExp(`<div class="hidden md:block"><div role="region" aria-label="${titulo}"`));
    const lista = new RegExp(`<ul(?=[^>]*\\bmd:hidden\\b)(?=[^>]*aria-label="${titulo}")[^>]*>([\\s\\S]*?)</ul>`).exec(html)?.[1] ?? "";
    const elementos = [...lista.matchAll(/<li[^>]*>[\s\S]*?<\/li>/g)].map((m) => m[0]);
    expect(elementos).toHaveLength(4);
    const cuerpo = html.slice(html.indexOf("<tbody"), html.indexOf("</tbody>"));
    const filas = [...cuerpo.matchAll(/<tr>[\s\S]*?<\/tr>/g)].map((m) => m[0]);
    expect(filas).toHaveLength(4);

    // Cada elemento: el código enlazado, el nombre, el proceso, el periodo, el resultado y su estado escrito.
    const [critico, bienSinAlcanzar, sinMedicion, resume] = elementos;
    expect(critico).toContain('href="/indicadores/SGC-IND-01">SGC-IND-01</a>');
    expect(critico).toContain(">Cumplimiento del programa de auditorías<");
    expect(critico).toContain(">Sistema de Gestión de Calidad<");
    expect(critico).toContain(">Tercer trimestre de 2026<");
    expect(critico).toContain(">60 %<");
    expect(critico).toMatch(/data-variante="critico"[^>]*>Crítico</);
    expect(bienSinAlcanzar).toContain('href="/indicadores/AIN-ID-002">AIN-ID-002</a>');
    expect(bienSinAlcanzar).toContain(">88 %<");
    expect(bienSinAlcanzar).toMatch(/data-variante="bien"[^>]*>Bien · no alcanza la meta</);
    // Sin medición: el periodo no se pinta y el resultado dice «sin dato».
    expect(sinMedicion).toContain('href="/indicadores/AIN-ID-003">AIN-ID-003</a>');
    expect(sinMedicion).not.toContain(">Periodo<");
    expect(sinMedicion).toContain(">sin dato<");
    expect(sinMedicion).toMatch(/data-variante="sin-dato"[^>]*>Sin dato</);
    expect(resume).toContain('href="/indicadores/SGC-ID-009">SGC-ID-009</a>');
    expect(resume).toContain(">50 %<");
    expect(resume).toMatch(/data-variante="atencion"[^>]*>Atención</);
    // El renglón del que no cuenta, en la lista y en la tabla, y solo en su elemento y en su fila.
    expect(elementos.map((e) => e.includes(renglon))).toEqual([false, false, false, true]);
    expect(filas.map((f) => f.includes(renglon))).toEqual([false, false, false, true]);
    // Cada dato con su nombre escrito, para quien no ve las columnas.
    for (const dato of ["Proceso", "Periodo", "Resultado", "Estado"]) expect(critico).toContain(`<dt class="text-muted-foreground">${dato}</dt>`);
  });
});

describe("la vista «Reportes al ente» (anexo 14B, §8)", () => {
  const ENTE = "Superintendencia Nacional de Salud";
  const base: Constancia = {
    id: 13,
    periodo: "2026-T3",
    etiqueta: "Tercer trimestre de 2026",
    ente: ENTE,
    venceEn: new Date("2026-12-01T04:59:59.999Z"),
    estado: "pendiente",
    vencida: false,
    fechaEnvio: null,
    radicado: null,
    resultadoEnviado: null,
    parcial: false,
    nota: null,
    registradaPor: null,
    registradaEn: null,
    corregida: false,
  };
  const pendiente = base;
  const vencida: Constancia = { ...base, id: 12, periodo: "2026-T2", etiqueta: "Segundo trimestre de 2026", venceEn: new Date("2026-07-16T04:59:59.999Z"), vencida: true };
  const corregida: Constancia = {
    ...base,
    id: 11,
    periodo: "2026-T1",
    etiqueta: "Primer trimestre de 2026",
    venceEn: new Date("2026-04-16T04:59:59.999Z"),
    estado: "registrada",
    fechaEnvio: "2026-04-10",
    radicado: "SNS-2026-0001",
    resultadoEnviado: "86,7 %",
    parcial: true,
    nota: "Por correo",
    registradaPor: "Ana Pérez",
    registradaEn: new Date("2026-04-10T15:00:00Z"),
    corregida: true,
  };
  const soporte = (id: number, nombre: string) => ({ id, nombre, mime: "application/pdf", tamano: 2048 });
  const datos = (o: Partial<DatosDeReportes> = {}): DatosDeReportes => ({
    codigo: "CEX-ID-001",
    ente: { ente: ENTE, seReporta: true, incompleto: false, conConstancias: true },
    constancias: [pendiente, vencida, corregida],
    soportes: new Map([
      [13, [soporte(70, "radicado-t3.pdf")]],
      [11, [soporte(71, "radicado-t1.pdf")]],
    ]),
    historial: new Map([
      [
        11,
        [
          { tipo: "registro", quien: "Ana Pérez", cuando: new Date("2026-04-10T15:00:00Z"), texto: "Registró el envío del 10 de abril de 2026 con el radicado SNS-2026-0010: 86,7 % (parcial)" },
          { tipo: "correccion", quien: "Ana Pérez", cuando: new Date("2026-04-11T15:00:00Z"), texto: "Corrigió el envío (radicado SNS-2026-0010 → SNS-2026-0001). Por qué: Las cifras estaban invertidas" },
        ],
      ],
    ]),
    registro: {
      hoy: "2026-11-14",
      soportesEditables: true,
      resultados: new Map([
        [13, { texto: "86,7 %", exacto: "260/3", parcial: true, faltan: [], sinCerrar: ["septiembre de 2026"], desde: "agosto de 2026" }],
        [12, { texto: null, exacto: null, parcial: true, faltan: ["abril de 2026", "mayo de 2026", "junio de 2026"], sinCerrar: ["abril de 2026", "mayo de 2026", "junio de 2026"], desde: null }],
      ]),
    },
    ...o,
  });

  it("una pendiente, una vencida y una registrada corregida: su estado escrito, sus datos, sus soportes y su historial", () => {
    const html = renderToStaticMarkup(<ReportesAlEnte {...datos()} />);
    expect(html).toContain(">Reportes al ente</h2>");
    expect(html).toContain(`Se reporta a ${ENTE}.`);
    // El estado, siempre con texto.
    expect(html).toMatch(/data-variante="atencion"[^>]*>Pendiente</);
    expect(html).toMatch(/data-variante="critico"[^>]*>Vencida</);
    expect(html).toMatch(/data-variante="bien"[^>]*>Registrada · corregida</);
    // La fecha límite, cuándo se envió, el radicado, el resultado (con «parcial») y quién lo registró.
    expect(html).toContain("30 nov 2026");
    expect(html).toContain("15 jul 2026");
    expect(html).toContain("10 abr 2026");
    expect(html).toContain("SNS-2026-0001");
    expect(html).toContain("86,7 % (parcial)");
    expect(html).toContain("Ana Pérez");
    // Tabla con su región en pantalla ancha; en el celular, una tarjeta por constancia.
    expect(html).toMatch(/role="region" aria-label="Constancias de envío" tabindex="0"/);
    expect(html).toContain(">Soportes</th>");
    expect(html).toMatch(/<ul[^>]*aria-label="Constancias de envío"/);
    // Los soportes, siempre como descarga por la ruta de soportes del indicador, y el historial.
    expect(html).toContain('href="/indicadores/CEX-ID-001/soportes/70/radicado-t3.pdf"');
    expect(html).toContain('href="/indicadores/CEX-ID-001/soportes/71/radicado-t1.pdf"');
    expect(html).toContain("Ver el historial");
    expect(html).toContain("Corrigió el envío (radicado SNS-2026-0010 → SNS-2026-0001). Por qué: Las cifras estaban invertidas");
  });

  it("a quien registra: «Registrar el envío» de cada pendiente con el resultado del periodo y, si es parcial, el aviso; «Corregir» de la registrada", () => {
    const html = renderToStaticMarkup(<ReportesAlEnte {...datos()} />);
    expect(html.match(/>Registrar el envío</g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain('id="constancia-13"');
    expect(html).toContain('id="constancia-12"');
    expect(html).toContain('id="constancia-11"');
    expect(html).toContain('href="#constancia-13"');
    // El resultado del periodo, antes de registrar, y el aviso de parcial.
    expect(html).toContain("Resultado del periodo: 86,7 %");
    // La ficha cambió de versión dentro del periodo: desde dónde acumula va primero.
    expect(html).toContain(
      "El resultado es parcial: solo acumula desde agosto de 2026 (la ficha cambió de versión); no está cerrado septiembre de 2026. Puede registrarlo así.",
    );
    expect(html).toContain("Resultado del periodo: sin resultado");
    expect(html).toContain("El resultado es parcial: faltan abril de 2026, mayo de 2026 y junio de 2026. Puede registrarlo así.");
    // Los campos, con un id por constancia, y la fecha de envío que no puede ser futura.
    for (const id of [13, 12]) {
      expect(html).toMatch(new RegExp(`<input[^>]*id="envio-fecha-${id}"[^>]*name="fechaEnvio"`));
      expect(html).toMatch(new RegExp(`id="envio-radicado-${id}"[^>]*name="radicado"`));
      expect(html).toMatch(new RegExp(`id="envio-nota-${id}"[^>]*name="nota"`));
    }
    expect(html).toMatch(/<input[^>]*type="date"[^>]*max="2026-11-14"/);
    // La zona de carga es la de las evidencias: PDF o imagen, nunca Excel.
    expect(html).toContain("o haga clic para elegirlos (PDF o imagen, máx. 25 MB c/u)");
    expect(html).not.toContain(".xlsx");
    // Un soporte de una pendiente se quita; uno de una registrada, no.
    expect(html).toContain('aria-label="Quitar el soporte radicado-t3.pdf"');
    expect(html).not.toContain('aria-label="Quitar el soporte radicado-t1.pdf"');
    // Cada zona de carga y cada «Corregir» se nombran con el periodo de su constancia: no se repite un nombre.
    const zonas = [...html.matchAll(/role="button"[^>]*aria-label="([^"]*Zona de carga[^"]*)"|aria-label="([^"]*Zona de carga[^"]*)"[^>]*role="button"/g)].map((m) => m[1] ?? m[2]);
    expect(zonas).toEqual([
      "Zona de carga de los soportes del reporte de tercer trimestre de 2026: arrastre archivos o presione para elegirlos",
      "Zona de carga de los soportes del reporte de segundo trimestre de 2026: arrastre archivos o presione para elegirlos",
      "Zona de carga de los soportes del reporte de primer trimestre de 2026: arrastre archivos o presione para elegirlos",
    ]);
    expect(html).toMatch(/<details[^>]*aria-label="Corregir el envío · Primer trimestre de 2026"/);
    // «Corregir» la registrada: con lo que tiene y la justificación.
    expect(html).toMatch(/<summary[^>]*>Corregir/);
    expect(html).toMatch(/id="corregir-radicado-11"[^>]*name="radicado"[^>]*value="SNS-2026-0001"|value="SNS-2026-0001"[^>]*id="corregir-radicado-11"/);
    expect(html).toMatch(/id="corregir-justificacion-11"[^>]*name="justificacion"/);
    // Un solo h2 de la vista y sus subtítulos debajo.
    expect(html.match(/<h2[\s>]/g)).toHaveLength(1);
  });

  it("el enlace «Corregir» de la fila apunta al <details> de su constancia, cuyo <summary> recibe el foco", () => {
    const html = renderToStaticMarkup(<ReportesAlEnte {...datos()} />);
    // Los enlaces de la tabla y de la tarjeta del celular llevan al `id` del desplegable (o de la sección de registro).
    const destinos = [...html.matchAll(/<a[^>]*href="#(constancia-\d+)"/g)].map((m) => m[1]);
    expect(destinos.sort()).toEqual(["constancia-11", "constancia-11", "constancia-12", "constancia-12", "constancia-13", "constancia-13"]);
    for (const d of new Set(destinos)) expect(html.match(new RegExp(`id="${d}"`, "g"))).toHaveLength(1);
    const desplegable = /<details(?=[^>]*id="constancia-11")[^>]*>\s*<summary([^>]*)>Corregir el envío · Primer trimestre de 2026<\/summary>/.exec(html);
    expect(desplegable).not.toBeNull();
    // El <summary> es enfocable (no lo saca del orden de tabulación) y su foco se ve.
    expect(desplegable![1]).not.toContain("tabindex");
    expect(desplegable![1]).toContain("focus-visible:outline-2");
    // Cerrado al pintar: lo abre el efecto al llegar por el ancla.
    expect(html).not.toMatch(/<details[^>]*id="constancia-11"[^>]*open/);
  });

  it("esAnclaDeConstancia: el hash de la constancia, y solo ese", () => {
    expect(anclaDeConstancia(11)).toBe("constancia-11");
    expect(esAnclaDeConstancia("#constancia-11", 11)).toBe(true);
    expect(esAnclaDeConstancia("#constancia-110", 11)).toBe(false);
    expect(esAnclaDeConstancia("#constancia-11", 110)).toBe(false);
    expect(esAnclaDeConstancia("#constancia-1", 11)).toBe(false);
    expect(esAnclaDeConstancia("constancia-11", 11)).toBe(false);
    expect(esAnclaDeConstancia("", 11)).toBe(false);
    expect(esAnclaDeConstancia("#indicador-reportes", 11)).toBe(false);
  });

  it("«Corregir» con el `hash` ya puesto: solo un clic que sigue el enlace en esta pestaña abre el desplegable, y su foco espera al salto", () => {
    const clic = { defaultPrevented: false, button: 0, ctrlKey: false, metaKey: false, shiftKey: false };
    expect(esClicDeNavegacion(clic)).toBe(true);
    // Abrir en otra pestaña o ventana (Ctrl, Meta, Mayús, el botón del medio) o un clic que otro escucha ya atendió: no.
    for (const otro of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { button: 1 }, { defaultPrevented: true }]) {
      expect(esClicDeNavegacion({ ...clic, ...otro }), JSON.stringify(otro)).toBe(false);
    }
    // Sin DOM: el foco del clic va después de que el navegador procese el salto al fragmento (se comprueba en navegador).
    const fuente = readFileSync("src/componentes/indicadores/vistas/FormulariosDeConstancia.tsx", "utf8");
    expect(fuente).toContain("setTimeout(enfocar, 0)");
  });

  it("quien no ve soportes no recibe archivos ni historial; quien no registra, ningún formulario", () => {
    const html = renderToStaticMarkup(<ReportesAlEnte {...datos({ soportes: null, historial: null, registro: null })} />);
    expect(html).toMatch(/data-variante="bien"[^>]*>Registrada · corregida</);
    expect(html).toContain("SNS-2026-0001");
    expect(html).not.toContain("/soportes/");
    expect(html).not.toContain(">Soportes</th>");
    expect(html).not.toContain("Ver el historial");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("Registrar el envío");
    expect(html).not.toContain("Corregir");
    expect(html).not.toContain("Zona de carga");
  });

  it("en un indicador retirado, quien registra recibe los formularios sin zona de carga ni «Quitar», y lo dice", () => {
    const html = renderToStaticMarkup(<ReportesAlEnte {...datos({ registro: { ...datos().registro!, soportesEditables: false } })} />);
    expect(html).toMatch(/<h3[^>]*>Registrar el envío · Tercer trimestre de 2026</);
    expect(html).toMatch(/<summary[^>]*>Corregir el envío · Primer trimestre de 2026</);
    expect(html).toMatch(/id="envio-fecha-13"/);
    expect(html).toMatch(/id="corregir-justificacion-11"/);
    expect(html).not.toContain("Zona de carga");
    expect(html).not.toContain("Quitar el soporte");
    // Los soportes que tiene siguen como descarga.
    expect(html).toContain('href="/indicadores/CEX-ID-001/soportes/70/radicado-t3.pdf"');
    // Donde iría la zona de carga, lo que el retiro impide.
    expect(html.match(/El indicador está retirado: no se pueden adjuntar ni quitar soportes\. Puede registrar el envío con los que ya tiene\./g)).toHaveLength(2);
    expect(html.match(/El indicador está retirado: no se pueden adjuntar soportes nuevos\./g)).toHaveLength(1);
  });

  it("la ficha con el ente incompleto lo dice, y sin constancias no promete que nazcan", () => {
    for (const ente of [
      { ente: ENTE, seReporta: false, incompleto: true, conConstancias: false },
      { ente: ENTE, seReporta: false, incompleto: false, conConstancias: false },
    ]) {
      const html = renderToStaticMarkup(<ReportesAlEnte {...datos({ ente, constancias: [], soportes: new Map(), historial: new Map() })} />);
      expect(html).toContain(">Aún no hay constancias.</p>");
      expect(html).not.toContain("la primera nace");
    }
    const incompleto = renderToStaticMarkup(
      <ReportesAlEnte {...datos({ ente: { ente: ENTE, seReporta: false, incompleto: true, conConstancias: false }, constancias: [], soportes: new Map(), historial: new Map() })} />,
    );
    expect(incompleto).toContain("Complete el ente, su periodicidad y su plazo en la ficha para llevar las constancias.");
    const alReves = renderToStaticMarkup(
      <ReportesAlEnte {...datos({ ente: { ente: ENTE, seReporta: false, incompleto: false, conConstancias: false }, constancias: [], soportes: new Map(), historial: new Map() })} />,
    );
    expect(alReves).toContain(`${PERIODICIDAD_EXTERNA_NO_CONTIENE}: corríjala en la ficha para llevar las constancias.`);
    // Con la ficha que se reporta, el vacío dice cuándo nace la primera.
    const alDia = renderToStaticMarkup(<ReportesAlEnte {...datos({ constancias: [], soportes: new Map(), historial: new Map() })} />);
    expect(alDia).toContain("Aún no hay constancias: la primera nace cuando termina el primer periodo del ente.");
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
const objetivosPagina = async (sp: Record<string, string | string[]> = {}) => renderToStaticMarkup(await PaginaObjetivos({ searchParams: Promise.resolve(sp) }));

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

  it("/indicadores/[codigo]?vista=reportes: la pestaña sale con el ente en la ficha o con constancias; sin ellos, «no encontrada»", () =>
    enTransaccion(async (tx) => {
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      const ind = await indicadorDePrueba(tx, {
        periodicidad: "mensual",
        inicioMedicion: "2026-01",
        aprobadaEn: new Date("2026-01-10T15:00:00Z"),
        ente: { nombre: "Superintendencia Nacional de Salud", periodicidad: "trimestral", plazoDias: 15 },
        mide: [mide.usuarioId],
      });
      contexto.sesion = valida(mide);
      const resultados = await pagina(ind.codigo);
      expect(resultados).toContain(`href="/indicadores/${ind.codigo}?vista=reportes"`);
      expect(resultados).toContain(">Reportes al ente</a>");

      // La vista abre antes las constancias (la tarea enlaza aquí): el primer trimestre de 2026 ya terminó.
      const html = await pagina(ind.codigo, { vista: "reportes" });
      estructuraAccesible(html);
      expect(html).toMatch(/aria-current="page"[^>]*>Reportes al ente</);
      expect(html).toContain(">Reportes al ente</h2>");
      expect(html).toContain("Primer trimestre de 2026");
      expect(html).toContain("Registrar el envío");
      expect(html).toContain("Resultado del periodo:");

      // Quien solo ve el indicador ve la tabla, sin formularios, soportes ni historial.
      contexto.sesion = valida(await usuarioDePrueba(tx, { rol: "consulta" }));
      const ajena = await pagina(ind.codigo, { vista: "reportes" });
      expect(ajena).toContain("Primer trimestre de 2026");
      expect(ajena).not.toContain("Registrar el envío");
      expect(ajena).not.toContain(">Soportes</th>");
      expect(ajena).not.toContain("Ver el historial");

      // Gerencia ve los soportes y el historial, y no registra: sin formularios.
      const [t1] = await tx`SELECT id FROM reportes_externos WHERE indicador_id = ${ind.id} AND periodo = '2026-T1'`;
      await registrarArchivo(
        {
          versionId: null,
          rol: "evidencia",
          contexto: "reporte_externo",
          contextoId: Number(t1.id),
          ruta: `reportes-externos/${t1.id}/radicado.pdf`,
          nombreOriginal: "radicado.pdf",
          extension: "pdf",
          mime: "application/pdf",
          tamanoBytes: 4,
          hashSha256: "c".repeat(64),
        },
        mide.usuarioId,
        { sql: tx },
      );
      contexto.sesion = valida(await usuarioDePrueba(tx, { rol: "gerencia" }));
      const gerencia = await pagina(ind.codigo, { vista: "reportes" });
      expect(gerencia).toContain(">Soportes</th>");
      expect(gerencia).toContain(`href="/indicadores/${ind.codigo}/soportes/`);
      expect(gerencia).toContain("Ver el historial");
      expect(gerencia).toContain("Subió el soporte «radicado.pdf»");
      expect(gerencia).not.toContain("Registrar el envío");
      expect(gerencia).not.toContain("Corregir el envío");

      // Retirado (la constancia con soporte se conserva): quien administra la termina de registrar, sin adjuntar ni quitar.
      await tx`UPDATE indicadores SET estado = 'retirado', baja_por = ${mide.usuarioId}, baja_en = now(), baja_motivo = 'Ya no se mide' WHERE id = ${ind.id}`;
      contexto.sesion = valida(await sesionAdmin(tx));
      const retirado = await pagina(ind.codigo, { vista: "reportes" });
      expect(retirado).toContain("Primer trimestre de 2026");
      expect(retirado).toContain(">Soportes</th>");
      expect(retirado).toMatch(/<h3[^>]*>Registrar el envío · Primer trimestre de 2026</);
      expect(retirado).toContain("El indicador está retirado: no se pueden adjuntar ni quitar soportes. Puede registrar el envío con los que ya tiene.");
      expect(retirado).not.toContain("Zona de carga");
      expect(retirado).not.toContain("Quitar el soporte");
      // Gerencia sigue sin formularios.
      contexto.sesion = valida(await usuarioDePrueba(tx, { rol: "gerencia" }));
      const gerenciaRetirado = await pagina(ind.codigo, { vista: "reportes" });
      expect(gerenciaRetirado).toContain(">Soportes</th>");
      expect(gerenciaRetirado).not.toContain("Registrar el envío");
      expect(gerenciaRetirado).not.toContain("El indicador está retirado: no se pueden");
      contexto.sesion = valida(mide);

      // Sin ente ni constancias: ni pestaña ni vista.
      const sinEnte = await indicadorDePrueba(tx, { periodicidad: "mensual", inicioMedicion: "2026-01", aprobadaEn: new Date("2026-01-10T15:00:00Z") });
      expect(await pagina(sinEnte.codigo)).not.toContain("?vista=reportes");
      await expect(pagina(sinEnte.codigo, { vista: "reportes" })).rejects.toThrow("NO_ENCONTRADA");
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
      for (const nombre of ["proceso", "subproceso", "clasificacion", "tipo", "semaforo", "reporte", "participo", "texto", "retirados", "envio"]) {
        expect(html).toMatch(new RegExp(`name="${nombre}"`));
      }
      // El filtro de los enlaces de las constancias de envío al ente sigue elegido al volver a filtrar.
      expect(html).toMatch(/<input(?=[^>]*name="envio")(?=[^>]*value="pendiente")(?![^>]*checked)[^>]*>/);
      expect(await listaPagina({ envio: "pendiente", texto: ind.codigo })).toMatch(/<input(?=[^>]*name="envio")(?=[^>]*value="pendiente")(?=[^>]*checked="")[^>]*>/);
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

  it("/indicadores/objetivos: la pestaña después de la matriz, el selector de periodo y la tarjeta de cada objetivo (anexo 14B, §7)", () =>
    enTransaccion(async (tx) => {
      // La página lee el reloj: el caso mide en enero del año en curso, que siempre está dentro del año.
      const zona = zonaHoraria();
      const anio = fechaEnZona(new Date(), zona).slice(0, 4);
      const enunciado = `Objetivo de la página ${Date.now()}`;
      const [o] = await tx`INSERT INTO objetivos (clase, enunciado, orden) VALUES ('calidad', ${enunciado}, 900) RETURNING id`;
      const ind = await indicadorDePrueba(tx, { periodicidad: "mensual", inicioMedicion: `${anio}-01`, objetivoId: Number(o.id) });
      const p = periodoDe(`${anio}-01`, zona)!;
      await tx`INSERT INTO mediciones (indicador_id, version_id, periodo, desde, hasta, vence_en, estado, resultado_exacto, resultado, semaforo, cumple,
          meta_aplicada, reportada_en)
        VALUES (${ind.id}, ${ind.versionId}, ${p.clave}, ${p.desde}, ${p.hasta}, ${fechaLimiteDeReporte(p, 10, zona)}, 'reportada', '95/1', 95, 'bien',
          false, 90, now())`;
      contexto.sesion = valida(await usuarioDePrueba(tx, { rol: "consulta" }));

      const html = await objetivosPagina();
      estructuraAccesible(html);
      expect(html).toMatch(new RegExp(`<h1[^>]*>Objetivos · ${anio}</h1>`));
      // La pestaña, para toda sesión, después de «Matriz del año».
      expect(html).toMatch(/aria-current="page"[^>]*>Objetivos</);
      expect(html.indexOf(">Matriz del año<")).toBeLessThan(html.indexOf('href="/indicadores/objetivos"'));
      // El selector de periodo en un formulario GET, con el año en curso elegido.
      expect(html).toMatch(/<form(?=[^>]*method="get")(?=[^>]*action="\/indicadores\/objetivos")[^>]*>/);
      expect(html).toMatch(/<select[^>]*name="periodo"/);
      expect(html).toContain(`<option value="${anio}" selected="">${anio}</option>`);
      expect(html).toContain(`value="${anio}-T1"`);
      // La tarjeta del objetivo: su estado y su indicador, con la salvedad del Bien que no alcanza la meta.
      const desde = html.indexOf(enunciado);
      const tarjeta = html.slice(desde, html.indexOf("</article>", desde));
      expect(tarjeta).toMatch(/data-variante="critico"[^>]*>No cumplido</);
      expect(tarjeta).toContain(`href="/indicadores/${ind.codigo}"`);
      expect(tarjeta).toContain(">Bien · no alcanza la meta<");

      // Un periodo que no se ofrece (o repetido) es el año en curso; uno ofrecido, el suyo.
      for (const periodo of ["abc", "2999", "1999-T1", [`${anio}-T1`, `${anio}-T2`]]) {
        expect(await objetivosPagina({ periodo })).toContain(`>Objetivos · ${anio}</h1>`);
      }
      expect(await objetivosPagina({ periodo: `${anio}-T1` })).toContain(`>Objetivos · Primer trimestre de ${anio}</h1>`);

      // Sin objetivos activos, el estado vacío.
      await tx`UPDATE objetivos SET activo = false WHERE activo`;
      const vacia = await objetivosPagina();
      expect(vacia).toContain(">Aún no hay objetivos</h2>");
      expect(vacia).toContain("Se crean en Configuración de indicadores.");
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
