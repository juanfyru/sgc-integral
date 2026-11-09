/**
 * La pestaña «Indicadores» de Vigencia (spec 13C §11.4): sus piezas sin BD y la página real contra la BD de
 * desarrollo, dentro de una transacción que se revierte (el cliente de la app se sustituye por ella). Los PDF van a un
 * almacén temporal.
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { TransactionSql } from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
}));

import PaginaVigencia from "@/app/(app)/vigencia/page";
import PaginaIndicadores from "@/app/(app)/vigencia/indicadores/page";
import { BarrasPorProceso } from "@/componentes/vigencia/indicadores/BarrasPorProceso";
import { FiltroPeriodo, periodosDelFiltro } from "@/componentes/vigencia/indicadores/FiltroPeriodo";
import { TablaPorProceso } from "@/componentes/vigencia/indicadores/TablaPorProceso";
import { TarjetasIndicadores } from "@/componentes/vigencia/indicadores/TarjetasIndicadores";
import { pestanasVisibles } from "@/componentes/vigencia/PestanasVigencia";
import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { INDICADORES, NOMBRE_INDICADOR, UNIDAD, type IndicadorMedido, type ResultadoIndicadores } from "@/lib/indicadores-documentales/metas";
import { MATRIZ } from "@/lib/permisos";
import type { SesionValida } from "@/lib/sesion";
import { finDeFecha } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { GraficoBarras } from "@/componentes/ui/GraficoBarras";
import { sesionAdmin, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";
import { vigenteFuera } from "./utiles/vigencia";

const sql = obtenerSql();
const ZONA = zonaHoraria();

let almacen: string;
const previo = process.env.ALMACEN_RUTA;

beforeAll(() => {
  almacen = mkdtempSync(path.join(tmpdir(), "sgc-indicadores-pantalla-"));
  process.env.ALMACEN_RUTA = almacen;
});

afterAll(async () => {
  if (previo === undefined) delete process.env.ALMACEN_RUTA;
  else process.env.ALMACEN_RUTA = previo;
  rmSync(almacen, { recursive: true, force: true });
  await sql.end();
  globalThis.__sql = undefined;
});

beforeEach(() => {
  contexto.sesion = null;
});

const medido = (clave: IndicadorMedido["clave"], m: Partial<IndicadorMedido>): IndicadorMedido => ({
  clave,
  nombre: NOMBRE_INDICADOR[clave],
  unidad: UNIDAD[clave],
  valor: null,
  numerador: 0,
  denominador: 0,
  meta: 0,
  cumple: null,
  detalle: null,
  ...m,
});

describe("TarjetasIndicadores", () => {
  const html = renderToStaticMarkup(
    <TarjetasIndicadores
      indicadores={[
        medido("dentro_plazo", { valor: 94, numerador: 94, denominador: 100, meta: 95, cumple: false, detalle: "2 documentos sin fecha de revisión" }),
        medido("aprobacion", { valor: 24, numerador: 432, denominador: 18, meta: 30, cumple: true, detalle: "mediana 21 días · desde la solicitud: 27 días" }),
        medido("vencidos", { valor: 7, numerador: 7, denominador: 100, meta: 0, cumple: false }),
        medido("acuses", { meta: 90 }),
        medido("externos", { valor: 95, numerador: 18, denominador: 19, meta: 95, cumple: false }),
      ]}
      tramites={{ publicados: 18, enCurso: 4 }}
    />,
  );

  it("cada tarjeta dice su valor, la meta y si cumple, con texto en la insignia y no solo con color", () => {
    expect(html).toContain(NOMBRE_INDICADOR.dentro_plazo);
    expect(html).toContain(">94 %<");
    expect(html).toMatch(/data-variante="critico"[^>]*>meta ≥ 95 % · no cumple</);
    expect(html).toContain('data-estado="critico"');
    expect(html).toContain("2 documentos sin fecha de revisión");
    expect(html).toContain(">24 días<");
    expect(html).toMatch(/data-variante="bien"[^>]*>meta ≤ 30 días · cumple</);
    expect(html).toContain("mediana 21 días · desde la solicitud: 27 días");
    expect(html).toMatch(/>meta 0 · no cumple</);
  });

  it("18 de 19 frente a «≥ 95 %» no se redondea a la meta: «94,7 %» y no cumple", () => {
    expect(html).toContain(">94,7 %<");
    expect(html).not.toContain(">95 %<");
  });

  it("sin valor dice «Sin dato» y la insignia gris lo repite con la meta: no hay con qué decir si cumple", () => {
    expect(html).toContain(">Sin dato<");
    expect(html).toMatch(/data-variante="sin-dato"[^>]*>meta ≥ 90 % · sin dato</);
    expect(html).toContain('data-estado="sin-dato"');
  });

  it("la última tarjeta cuenta los trámites publicados en el periodo y los que siguen en curso", () => {
    expect(html).toContain("Trámites publicados en el periodo");
    expect(html).toContain(">18<");
    expect(html).toContain("4 en curso");
  });
});

describe("BarrasPorProceso", () => {
  it("pinta una barra por proceso con su tabla equivalente y sus propios textos", () => {
    const html = renderToStaticMarkup(
      <BarrasPorProceso
        filas={[
          { procesoId: 1, sigla: "GTH", proceso: "Gestión del Talento Humano", vencidos: 3 },
          { procesoId: 2, sigla: "AIN", proceso: "Atención Integral", vencidos: 2 },
        ]}
      />,
    );
    expect(html).toContain("<caption>Documentos con revisión vencida por proceso</caption>");
    expect(html).toContain("<th>Proceso</th><th>Vencidos</th>");
    expect(html).toContain("<td>GTH</td><td>3</td>");
    expect(html).toContain('aria-label="Documentos con revisión vencida por proceso: 5 en 2 procesos."');
    expect(html).not.toContain("Consultas");
    expect(html.match(/<rect /g)).toHaveLength(2);
  });

  /** Posición y ancho de cada barra, en el orden en que se pintan. */
  const barras = (html: string) => [...html.matchAll(/<rect x="([\d.]+)" y="[\d.]+" width="([\d.]+)"/g)].map((m) => ({ x: Number(m[1]), ancho: Number(m[2]) }));

  it("dos procesos con la misma cifra se ven como dos barras, con un hueco visible entre ellas", () => {
    const [a, b] = barras(
      renderToStaticMarkup(
        <BarrasPorProceso
          filas={[
            { procesoId: 1, sigla: "GTH", proceso: "Gestión del Talento Humano", vencidos: 3 },
            { procesoId: 2, sigla: "SGC", proceso: "Sistema de Gestión de Calidad", vencidos: 3 },
          ]}
        />,
      ),
    );
    // Cada barra ocupa la mitad del ancho (640); entre las dos queda al menos una quinta parte de esa mitad.
    expect(b.x - (a.x + a.ancho)).toBeGreaterThanOrEqual(64);
  });

  it("el gráfico de consultas por día no cambia: tres unidades entre barra y barra", () => {
    const [a, b] = barras(renderToStaticMarkup(<GraficoBarras serie={[{ fecha: "2026-11-01", conteo: 2 }, { fecha: "2026-11-02", conteo: 2 }]} />));
    expect([a, b]).toEqual([{ x: 1.5, ancho: 317 }, { x: 321.5, ancho: 317 }]);
  });

  it("sin vencidos lo dice en texto", () => {
    const html = renderToStaticMarkup(<BarrasPorProceso filas={[]} />);
    expect(html).toContain("Ningún documento de su alcance tiene la revisión vencida.");
    expect(html).not.toContain("<svg");
  });
});

describe("TablaPorProceso", () => {
  const filas: ResultadoIndicadores["dentroPorProceso"] = [
    { procesoId: 1, sigla: "GTH", proceso: "Gestión del Talento Humano", vigentes: 14, alDia: 11, valor: 79, cumple: false, sinFecha: 0 },
    { procesoId: 2, sigla: "SGC", proceso: "Sistema de Gestión de Calidad", vigentes: 9, alDia: 9, valor: 100, cumple: true, sinFecha: 0 },
    { procesoId: 3, sigla: "GBS", proceso: "Gestión de Bienes y Servicios", vigentes: 1, alDia: 0, valor: null, cumple: null, sinFecha: 1 },
    { procesoId: 4, sigla: "CEX", proceso: "Consulta Externa", vigentes: 19, alDia: 18, valor: 95, cumple: false, sinFecha: 0 },
  ];
  const html = renderToStaticMarkup(<TablaPorProceso filas={filas} meta={95} />);

  it("dice el porcentaje y si cumple con texto, en la tabla y en las tarjetas del celular", () => {
    expect(html.match(/79 % · no cumple/g)).toHaveLength(2);
    expect(html.match(/100 % · cumple/g)).toHaveLength(2);
    expect(html.match(/>sin dato</g)).toHaveLength(2);
    expect(html).toContain('aria-label="Dentro del plazo, por proceso"');
    expect(html).toContain("hidden md:block");
    expect(html).toContain("md:hidden");
  });

  it("18 de 19 frente a la meta de 95 se lee «94,7 %» y no cumple, en la tabla y en las tarjetas", () => {
    expect(html.match(/94,7 % · no cumple/g)).toHaveLength(2);
    expect(html).not.toContain("95 % · no cumple");
  });

  it("la insignia del porcentaje no se parte en dos renglones", () => {
    expect(html.match(/class="whitespace-nowrap">79 % · no cumple</g)).toHaveLength(2);
    expect(html.match(/class="whitespace-nowrap">sin dato</g)).toHaveLength(2);
  });

  it("en las tarjetas del celular la insignia va siempre en su renglón, bajo el nombre", () => {
    const tarjetas = html.slice(html.indexOf("<ul"));
    expect(tarjetas.match(/<div class="flex flex-col items-start gap-1"><span class="[^"]*">[A-Z]{3} · /g)).toHaveLength(filas.length);
  });
});

describe("FiltroPeriodo", () => {
  const ahora = finDeFecha("2026-11-09", ZONA);

  it("ofrece el año, los semestres, los trimestres y los meses ya empezados del año en curso, y todos los del anterior", () => {
    const [actual, anterior] = periodosDelFiltro(ahora, ZONA);
    expect(actual.anio).toBe(2026);
    expect(actual.opciones.map((o) => o.clave)).toEqual([
      "2026", "2026-S1", "2026-S2", "2026-T1", "2026-T2", "2026-T3", "2026-T4",
      "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11",
    ]);
    expect(anterior.anio).toBe(2025);
    expect(anterior.opciones).toHaveLength(19);
    expect(actual.opciones.find((o) => o.clave === "2026")!.etiqueta).toBe("Año 2026");
    expect(actual.opciones.find((o) => o.clave === "2026-S2")!.etiqueta).toBe("Segundo semestre de 2026");
    expect(actual.opciones.find((o) => o.clave === "2026-11")!.etiqueta).toBe("Noviembre de 2026");
  });

  it("marca el periodo y el proceso elegidos, y solo ofrece los procesos que recibe", () => {
    const procesos = [{ id: 7, nombre: "Gestión del Talento Humano", sigla: "GTH" }];
    const html = renderToStaticMarkup(<FiltroPeriodo periodo="2026-T4" procesoId={7} procesos={procesos} ahora={ahora} />);
    expect(html).toContain('<option value="2026-T4" selected="">Cuarto trimestre de 2026</option>');
    expect(html).toContain('<option value="7" selected="">GTH · Gestión del Talento Humano</option>');
    // Las opciones de proceso dicen «SIGLA · nombre»; las del periodo, no.
    expect(html.match(/<option value="\d+"(?: selected="")?>[^<]* · /g)).toHaveLength(1);
    expect(html).toContain('action="/vigencia/indicadores"');
    // En pantallas estrechas los dos selectores ocupan todo el ancho; desde `sm`, el suyo.
    expect(html.match(/<div class="flex w-full min-w-0 flex-col gap-1 sm:w-auto sm:max-w-full">/g)).toHaveLength(2);
    // Un periodo válido fuera de la lista (otro año) sigue a la vista y elegido.
    const viejo = renderToStaticMarkup(<FiltroPeriodo periodo="2019" procesoId={null} procesos={procesos} ahora={ahora} />);
    expect(viejo).toContain('<option value="2019" selected="">Año 2019</option>');
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

const procesoId = async (tx: TransactionSql, sigla: string) => Number((await tx`SELECT id FROM procesos WHERE sigla = ${sigla}`)[0].id);
const pagina = async (consulta: Record<string, string> = {}) =>
  renderToStaticMarkup(await PaginaIndicadores({ searchParams: Promise.resolve(consulta) }));

describe("la página /vigencia/indicadores", () => {
  it("al Admin SGC le pinta las siete tarjetas, el enlace al semáforo filtrado y el Excel con el periodo y el proceso", () =>
    enTransaccion(async (tx) => {
      const gth = await procesoId(tx, "GTH");
      const d = await vigenteFuera(tx, { fechaAprobacion: "2025-01-10", proceso: "GTH" });
      await tx`UPDATE documentos SET meses_revision = 12 WHERE id = ${d.id}`;
      contexto.sesion = valida(await sesionAdmin(tx));
      const html = await pagina({ periodo: "2026-T4", proceso: String(gth) });

      for (const clave of INDICADORES) expect(html).toContain(NOMBRE_INDICADOR[clave]);
      expect(html).toContain(`href="/vigencia/indicadores/excel?periodo=2026-T4&amp;proceso=${gth}"`);
      expect(html).toMatch(new RegExp(`href="/vigencia/semaforo\\?estado=vencida&amp;proceso=${gth}"[^>]*>Ver (el vencido|los \\d+ vencidos) en el Semáforo<`));
      expect(html).toMatch(/aria-current="page"[^>]*>Indicadores</);
      expect(html).toContain("Periodo: cuarto trimestre de 2026");
      expect(html).toContain("Documentos con revisión vencida por proceso");
      // El gráfico y la tabla, uno debajo del otro y lado a lado solo desde 2xl; cada uno con su altura.
      expect(html).toContain('<div class="grid grid-cols-1 items-start gap-6 2xl:grid-cols-2">');
      expect(html).toContain('aria-label="Dentro del plazo, por proceso"');
      expect(html).not.toContain("Consultas por día");
    }));

  it("Consulta no la ve; al líder, un proceso ajeno es «no encontrado» y el filtro le ofrece solo los suyos", () =>
    enTransaccion(async (tx) => {
      contexto.sesion = valida(await usuarioDePrueba(tx, { rol: "consulta" }));
      await expect(pagina()).rejects.toThrow("NO_ENCONTRADA");

      const gth = await procesoId(tx, "GTH");
      const cex = await procesoId(tx, "CEX");
      contexto.sesion = valida(await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [gth] }));
      await expect(pagina({ proceso: String(cex) })).rejects.toThrow("NO_ENCONTRADA");
      const html = await pagina();
      expect(html).toContain(`<option value="${gth}">`);
      expect(html).not.toContain(`<option value="${cex}">`);
    }));

  it("/vigencia lleva a Indicadores a quien tiene ese permiso sin `vigencia.ver`, y la pestaña se enciende sola", () =>
    enTransaccion(async (tx) => {
      // Hoy los dos permisos tienen los mismos roles: se le quita `vigencia.ver` a Gerencia solo en esta prueba.
      const original = MATRIZ["vigencia.ver"];
      MATRIZ["vigencia.ver"] = original.filter((r) => r !== "gerencia");
      try {
        expect(pestanasVisibles({ rol: "gerencia" }, false)).toEqual(["indicadores"]);
        expect(pestanasVisibles({ rol: "gerencia" }, true)).toEqual(["externos", "indicadores"]);
        contexto.sesion = valida(await usuarioDePrueba(tx, { rol: "gerencia" }));
        await expect(PaginaVigencia()).rejects.toThrow("REDIRECT:/vigencia/indicadores");
        expect(await pagina()).toMatch(/aria-current="page"[^>]*>Indicadores</);
      } finally {
        MATRIZ["vigencia.ver"] = original;
      }
      expect(pestanasVisibles({ rol: "lider_proceso" }, false)).toEqual(["semaforo", "revision-anual", "externos", "indicadores"]);
      contexto.sesion = valida(await usuarioDePrueba(tx, { rol: "gerencia" }));
      await expect(PaginaVigencia()).rejects.toThrow("REDIRECT:/vigencia/semaforo");
    }));
});
