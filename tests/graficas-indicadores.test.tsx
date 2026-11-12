/**
 * Las gráficas de los indicadores en estilo «Tubos» (Fase 14A, Tarea 14; spec §11), en render estático: la figura con
 * su nombre, un tubo por periodo, la meta y el límite, la tabla equivalente, el foco por columna, las piezas pequeñas,
 * la hoja de estilos (animación e impresión) y la ausencia de colores fijos.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BarraEstados } from "@/componentes/ui/BarraEstados";
import { llevarALaColumnaInicial } from "@/componentes/ui/DesplazableDeTubos";
import { GraficoTubos } from "@/componentes/ui/GraficoTubos";
import { MiniTubos } from "@/componentes/ui/MiniTubos";
import { Tendencia } from "@/componentes/ui/Tendencia";
import { TuboAcumulado } from "@/componentes/ui/TuboAcumulado";
import type { PuntoDeSerie } from "@/componentes/ui/geometria-tubos";
import { doce } from "./utiles/tubos";

const raiz = path.resolve(import.meta.dirname, "..");
const UNIDAD = { sufijo: " %", decimales: 1 };
const COLUMNAS = ["Mes", "Resultado", "Estado"] as const;
const TITULO = "Recaudo de cartera corriente por mes, 2026";
/** Lo que leen las tecnologías de apoyo de la figura y de su tabla: el título, la meta y de qué lado queda el crítico. */
const LECTURA = `${TITULO}: meta 85 %, crítico por debajo de 59,5 %`;

const cuenta = (html: string, re: RegExp) => (html.match(re) ?? []).length;
const sinEtiquetas = (html: string) => html.replace(/<[^>]+>/g, "");
const atributo = (etiqueta: string, nombre: string) => Number(new RegExp(`\\s${nombre}="([^"]*)"`).exec(etiqueta)?.[1]);

/** El `<g …>…</g>` completo que empieza en `desde`, con sus grupos anidados. */
function grupo(html: string, desde: number): string {
  const re = /<g\b|<\/g>/g;
  re.lastIndex = desde;
  let nivel = 0;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    nivel += m[0] === "</g>" ? -1 : 1;
    if (nivel === 0) return html.slice(desde, m.index + 4);
  }
  throw new Error("grupo sin cerrar");
}

/** El contenido de cada bloque `cabecera { … }` de la hoja de estilos, con sus llaves anidadas. */
function bloques(css: string, cabecera: string): string[] {
  const salida: string[] = [];
  for (let i = css.indexOf(cabecera); i !== -1; i = css.indexOf(cabecera, i + 1)) {
    const abre = css.indexOf("{", i);
    let nivel = 0;
    for (let j = abre; j < css.length; j++) {
      if (css[j] === "{") nivel++;
      else if (css[j] === "}" && --nivel === 0) {
        salida.push(css.slice(abre + 1, j));
        break;
      }
    }
  }
  return salida;
}

const principal = (cambios: Partial<Parameters<typeof GraficoTubos>[0]> = {}) =>
  renderToStaticMarkup(
    <GraficoTubos
      serie={doce}
      titulo={TITULO}
      meta={{ valor: 85, texto: "Meta 85 %" }}
      limite={{ valor: 59.5, texto: "Crítico < 59,5 %" }}
      unidad={UNIDAD}
      columnas={COLUMNAS}
      {...cambios}
    />,
  );

describe("GraficoTubos", () => {
  it("GraficoTubos: una figura con nombre, un tubo por periodo, la meta, el límite y su tabla equivalente", () => {
    const html = principal();
    expect(html).toMatch(/^<figure/);
    expect(html).toMatch(new RegExp(`<g(?=[^>]*role="img")(?=[^>]*aria-label="${LECTURA}")[^>]*>`));
    expect(html).not.toContain("NaN");

    // Doce pistas; la del mes que aún no llega, más tenue.
    expect(cuenta(html, /class="tubo-pista /g)).toBe(12);
    expect(cuenta(html, /class="tubo-pista fill-tubo-pista-futura"/g)).toBe(1);
    // El relleno lleva la clase de su estado; sin dato, «no aplica» y el futuro no tienen relleno.
    expect(cuenta(html, /class="tubo-relleno tubo-bien"/g)).toBe(4);
    expect(cuenta(html, /class="tubo-relleno tubo-atencion"/g)).toBe(4);
    expect(cuenta(html, /class="tubo-relleno tubo-critico"/g)).toBe(1);
    expect(cuenta(html, /class="tubo-relleno tubo-neutro"/g)).toBe(0);
    // Cada relleno crece con su propio retardo.
    expect(html).toContain("--i:7");

    // El valor debajo de cada periodo: «s. d.» bajo julio y «n. a.» bajo noviembre.
    expect(cuenta(html, />s\. d\.</g)).toBe(1);
    expect(cuenta(html, />n\. a\.</g)).toBe(1);
    expect(html).toContain(">Mar<");

    // La meta, con su etiqueta en el margen derecho, y el límite de crítico, punteado.
    expect(html).toMatch(/<line(?=[^>]*class="tubo-meta)[^>]*>/);
    expect(html).toMatch(/<line(?=[^>]*class="tubo-limite)(?=[^>]*stroke-dasharray)[^>]*>/);
    expect(html).toContain(">Meta 85 %<");
    expect(html).toContain(">Crítico &lt; 59,5 %<");

    // La tabla equivalente: una fila por periodo con el periodo, el valor y el nombre del estado.
    const tabla = html.slice(html.indexOf('<figcaption class="sr-only">'));
    expect(tabla).toContain(`<caption>${LECTURA}</caption>`);
    expect(tabla).toContain('<th scope="col">Mes</th><th scope="col">Resultado</th><th scope="col">Estado</th>');
    expect(cuenta(tabla, /<tr><th scope="row">/g)).toBe(12);
    expect(tabla).toContain('<tr><th scope="row">marzo</th><td>86 %</td><td>Bien</td></tr>');
    expect(tabla).toContain('<tr><th scope="row">julio</th><td>—</td><td>Sin dato</td></tr>');

    // Al imprimir se leen el valor y el estado sobre cada columna con valor (la hoja de estilos los muestra), en dos
    // líneas; sobre julio (sin dato), noviembre («no aplica») y diciembre (por venir) no se escribe nada: debajo ya lo dicen.
    expect(cuenta(html, /class="tubo-impreso"/g)).toBe(9);
    expect(html).toMatch(/<text class="tubo-impreso"[^>]*><tspan[^>]*>58 %<\/tspan><tspan[^>]*>Crítico<\/tspan><\/text>/);
    expect(html).not.toMatch(/<text class="tubo-impreso"[^>]*>(?:(?!<\/text>).)*(Sin dato|No aplica|Por reportar)/);
    // La letra cabe en el paso de una columna: el estado más largo («Atención») no pasa de su franja.
    const impreso = /<text class="tubo-impreso"[^>]*font-size="([\d.]+)"/.exec(html);
    const franja = atributo(/<rect class="tubo-zona"[^>]*>/.exec(html)![0], "width");
    expect(Number(impreso?.[1]) * 0.56 * "Atención".length).toBeLessThanOrEqual(franja);
  });

  it("cada columna se enfoca con el teclado y dice su valor y su estado", () => {
    const html = principal();
    expect(cuenta(html, /tabindex="0"/g)).toBe(12);
    const marzo = /<rect(?=[^>]*tabindex="0")(?=[^>]*aria-label="marzo: 86 %, Bien")[^>]*>/.exec(html)?.[0];
    expect(marzo).toBeDefined();
    expect(html).toMatch(/<rect(?=[^>]*tabindex="0")(?=[^>]*aria-label="julio: Sin dato")[^>]*>/);
    expect(html).toMatch(/<rect(?=[^>]*tabindex="0")(?=[^>]*aria-label="diciembre: Por reportar")[^>]*>/);
    // La tarjeta lee lo que el periodo trae escrito.
    expect(marzo).toContain('data-periodo="marzo"');
    expect(marzo).toContain('data-valor="86 %"');
    expect(marzo).toContain('data-estado="bien"');
    expect(marzo).toContain('data-nombre="Bien"');
    expect(marzo).toContain('data-meta="Meta 85 %"');

    // Lo enfocable no queda dentro de la figura con role="img" (sus hijos son presentacionales).
    const figura = grupo(html, html.search(/<g(?=[^>]*role="img")/));
    expect(figura).not.toContain("tabindex");

    // El área sensible es toda la franja del periodo, no solo el relleno.
    const pista = /<rect class="tubo-pista [^>]*>/.exec(html)![0];
    expect(atributo(marzo!, "height")).toBe(atributo(pista, "height"));
    expect(atributo(marzo!, "width")).toBeGreaterThan(2 * atributo(pista, "width"));

    // La tarjeta empieza oculta y no se lee: el nombre del periodo ya lo dice.
    expect(html).toMatch(/<div(?=[^>]*class="tubo-tarjeta )(?=[^>]*hidden="")(?=[^>]*aria-hidden="true")[^>]*>/);
  });

  it("sin meta, los tubos van en neutro y no hay líneas", () => {
    const sinMeta: PuntoDeSerie[] = doce.map((p) => (p.valor === null ? p : { ...p, estado: "sin-meta", nombreEstado: "Sin meta" }));
    const html = principal({ serie: sinMeta, meta: undefined, limite: undefined });
    expect(cuenta(html, /class="tubo-relleno tubo-neutro"/g)).toBe(9);
    expect(html).not.toMatch(/class="tubo-relleno tubo-(bien|atencion|critico)"/);
    expect(html).not.toMatch(/class="tubo-(meta|limite|franja)/);
    expect(html).not.toContain("Meta");
    expect(html).toContain('aria-label="marzo: 86 %, Sin meta"');
    expect(html).toMatch(new RegExp(`<g(?=[^>]*role="img")(?=[^>]*aria-label="${TITULO}")[^>]*>`));
  });

  it("la meta que cambia entre periodos es escalonada, la tendencia constante dibuja su franja y sin periodos no hay gráfica", () => {
    const escalonada = principal({
      meta: { porPeriodo: [85, 85, 85, 90, 90, 90, null, 90, 90, 90, 90, 90], texto: "Meta" },
      limite: undefined,
    });
    const trazo = /<path(?=[^>]*class="tubo-meta[ "])[^>]*\sd="([^"]+)"/.exec(escalonada)?.[1] ?? "";
    expect(trazo.match(/M/g)).toHaveLength(2); // el hueco de julio corta la línea
    expect(trazo).toContain("V"); // el escalón de abril
    expect(escalonada).toContain(">Meta 90 %<");
    expect(escalonada).toContain('data-meta="Meta 85 %"');
    expect(escalonada).toContain('aria-label="julio: Sin dato"');
    expect(escalonada).toContain(
      `aria-label="${TITULO}: la meta cambia por periodo (85 % de enero a marzo; 90 % de abril a junio; sin meta en julio; 90 % de agosto a diciembre)"`,
    );

    const constante = principal({ meta: { valor: 100, texto: "Meta 95 a 105 %" }, limite: undefined, rango: { min: 95, max: 105 } });
    expect(constante).toMatch(/<rect(?=[^>]*class="tubo-franja)[^>]*>/);
    // La franja entra en la escala: 105 % pasa de 100, así que el eje llega a 125.
    expect(constante).toContain(">125 %<");
    expect(constante).toContain(`<caption>${TITULO}: meta entre 95 y 105 %</caption>`);

    const vacia = principal({ serie: [] });
    expect(vacia).not.toContain("<svg");
    expect(sinEtiquetas(vacia)).toBe("Sin periodos para mostrar.");
  });
});

describe("GraficoTubos: la escala y lo que aún no llega (ronda 1 de la Tarea 15)", () => {
  it("la escala va en su propio lienzo, fuera de lo que se desplaza, a la misma altura que los tubos", () => {
    const html = principal();
    const eje = /<svg(?=[^>]*class="tubo-eje )[^>]*>(.*?)<\/svg>/.exec(html);
    expect(eje).not.toBeNull();
    expect(eje![0]).toContain('aria-hidden="true"');
    // Los rótulos de la escala (0, 50 y 100 %) están en ese lienzo y no en el que se desplaza.
    for (const r of [">0<", ">50<", ">100 %<"]) expect(eje![1]).toContain(r);
    const desplazable = html.slice(html.indexOf('class="tubo-desplazable'), html.indexOf("<figcaption"));
    expect(desplazable).not.toContain(">100 %<");
    expect(html.indexOf('class="tubo-eje ')).toBeLessThan(html.indexOf('class="tubo-desplazable'));
    // Las dos columnas van en la proporción de sus lienzos: el de la escala, a 1:1 como mínimo.
    expect(html).toMatch(/grid-template-columns:minmax\((\d+)px, \1fr\) minmax\(0, \d+fr\)/);
    // Las líneas de guía siguen en el lienzo de los tubos, una por marca.
    expect(cuenta(desplazable, /<line data-marca=/g)).toBe(3);
  });

  it("bajo un periodo que aún no llega va «—»; su nombre sigue diciendo «Por venir»", () => {
    const serie = doce.map((p) => (p.estado === "futuro" ? { ...p, texto: "por venir", nombreEstado: "Por venir" } : p));
    const html = principal({ serie });
    const visible = html.slice(0, html.indexOf("<figcaption"));
    expect(visible).not.toContain("por venir");
    expect(visible).toMatch(/>—<\/text>/);
    expect(html).toContain('aria-label="diciembre: Por venir"');
    expect(html.slice(html.indexOf("<figcaption"))).toContain("<td>Por venir</td>");

    const mini = renderToStaticMarkup(<MiniTubos titulo="Auditorías ejecutadas" serie={serie} />);
    const dibujo = mini.slice(0, mini.indexOf("<figcaption"));
    expect(dibujo).not.toContain("por venir");
    expect(dibujo).toMatch(/>—<\/text>/);
    expect(mini).toContain('<tr><th scope="row">diciembre</th><td>Por venir</td></tr>');
  });
});

describe("GraficoTubos: el ancho y la columna en que arranca (ronda 1 de la Tarea 19, D-2)", () => {
  const trimestres: PuntoDeSerie[] = [
    { clave: "2026-T1", etiqueta: "primer trimestre", valor: 100, texto: "100 %", estado: "bien", nombreEstado: "Bien" },
    { clave: "2026-T2", etiqueta: "segundo trimestre", valor: 83.3, texto: "83,3 %", estado: "atencion", nombreEstado: "Atención" },
    { clave: "2026-T3", etiqueta: "tercer trimestre", valor: 60, texto: "60 %", estado: "critico", nombreEstado: "Crítico" },
    { clave: "2026-T4", etiqueta: "cuarto trimestre", valor: null, texto: "", estado: "futuro", nombreEstado: "Por venir" },
  ];
  const pintar = (serie: PuntoDeSerie[]) =>
    renderToStaticMarkup(
      <GraficoTubos serie={serie} titulo="Resultado por trimestre, 2026" meta={{ valor: 90, texto: "Meta 90 %" }} unidad={UNIDAD} columnas={COLUMNAS} />,
    );
  const anchoDelLienzo = (html: string) => Number(/<svg viewBox="0 0 (\d+(?:\.\d+)?) [\d.]+" class="tubo-lienzo/.exec(html)?.[1]);

  it("el lienzo mide un paso por periodo más los márgenes: cuatro trimestres no ocupan lo que doce meses", () => {
    const cuatro = anchoDelLienzo(pintar(trimestres));
    const doceMeses = anchoDelLienzo(renderToStaticMarkup(<GraficoTubos serie={doce} titulo={TITULO} meta={{ valor: 85, texto: "Meta 85 %" }} unidad={UNIDAD} columnas={COLUMNAS} />));
    expect(doceMeses - cuatro).toBe(8 * 34);
    expect(cuatro).toBeLessThan(330);
    // El lienzo no se agranda sin fin para llenar una caja ancha.
    expect(pintar(trimestres)).toMatch(/grid-template-columns:[^;"]*;max-width:\d+px/);
  });

  it("el desplazamiento arranca en la columna del último periodo con valor, y cada columna lleva su índice", () => {
    const html = pintar(trimestres);
    expect(html).toMatch(/<div(?=[^>]*class="tubo-desplazable)(?=[^>]*data-inicio="2")[^>]*>/);
    for (let i = 0; i < 4; i++) expect(html).toContain(`data-columna="${i}"`);
    // Sin ningún valor no hay columna inicial: arranca en lo más reciente.
    const vacia = pintar(trimestres.map((p) => ({ ...p, valor: null, texto: "", estado: "sin-dato" as const, nombreEstado: "Sin dato" })));
    expect(vacia).not.toContain("data-inicio=");
  });

  it("al montarse, lleva a la vista la columna inicial solo si quedó cortada a la izquierda", () => {
    const columna = { getBoundingClientRect: () => ({ left: -40, right: -6 }) };
    const contenedor = {
      dataset: { inicio: "2" },
      scrollWidth: 330,
      clientWidth: 288,
      scrollLeft: 0,
      getBoundingClientRect: () => ({ left: 0, right: 288 }),
      querySelector: (sel: string) => (sel === '[data-columna="2"]' ? columna : null),
    };
    llevarALaColumnaInicial(contenedor as unknown as HTMLElement);
    expect(contenedor.scrollLeft).toBe(-294);
    // Si ya se ve entera, no se mueve (las etiquetas de la meta y el límite siguen a la vista).
    const visible = { ...contenedor, scrollLeft: 0, querySelector: () => ({ getBoundingClientRect: () => ({ left: 120, right: 154 }) }) };
    llevarALaColumnaInicial(visible as unknown as HTMLElement);
    expect(visible.scrollLeft).toBe(0);
    // Si no se desplaza, tampoco.
    const cabe = { ...contenedor, scrollLeft: 0, scrollWidth: 288 };
    llevarALaColumnaInicial(cabe as unknown as HTMLElement);
    expect(cabe.scrollLeft).toBe(0);
  });
});

describe("GraficoTubos: lectura, negativos y años", () => {
  it("la lectura dice de qué lado de la meta queda el crítico (menor es mejor: por encima)", () => {
    const minutos = doce.map((p) => (p.valor === null ? p : { ...p, texto: `${p.valor} min` }));
    const html = principal({
      serie: minutos,
      meta: { valor: 30, texto: "Meta 30 min" },
      limite: { valor: 40, texto: "Crítico > 40 min" },
      unidad: { sufijo: " min" },
    });
    expect(html).toContain(`<caption>${TITULO}: meta 30 min, crítico por encima de 40 min</caption>`);
  });

  it("con negativos, el relleno parte del cero: hacia arriba o hacia abajo, y el cero no tiene relleno", () => {
    const punto = (clave: string, etiqueta: string, valor: number): PuntoDeSerie => ({
      clave,
      etiqueta,
      valor,
      texto: String(valor).replace("-", "−"),
      estado: "sin-meta",
      nombreEstado: "Sin meta",
    });
    const serie = [
      punto("2025-11", "noviembre de 2025", 12),
      punto("2025-12", "diciembre de 2025", -8),
      punto("2026-01", "enero de 2026", 0),
      punto("2026-02", "febrero de 2026", 5),
    ];
    const html = principal({ serie, meta: undefined, limite: undefined, unidad: { sufijo: "" } });
    expect(cuenta(html, /class="tubo-relleno tubo-neutro"/g)).toBe(2);
    expect(cuenta(html, /class="tubo-relleno tubo-neutro tubo-negativo"/g)).toBe(1);
    // El relleno negativo cuelga de la línea del cero.
    const cero = /<line data-marca="0"[^>]*\sy1="([^"]+)"/.exec(html)?.[1];
    expect(cero).toBeDefined();
    expect(/<rect class="tubo-relleno tubo-neutro tubo-negativo"[^>]*\sy="([^"]+)"/.exec(html)?.[1]).toBe(cero);
    expect(html).not.toContain("NaN");

    // Más de un año: el año bajo el primer periodo de cada uno y una raya donde cambia.
    expect(html).toMatch(/<text(?=[^>]*class="tubo-anio )[^>]*>2025<\/text>/);
    expect(html).toMatch(/<text(?=[^>]*class="tubo-anio )[^>]*>2026<\/text>/);
    expect(cuenta(html, /<line(?=[^>]*class="tubo-anio )[^>]*>/g)).toBe(1);
    // Un solo año: nada de eso.
    expect(principal()).not.toContain("tubo-anio");
    // Un año largo no cabe en un teléfono y la gráfica arranca en lo más reciente: su año se repite bajo su último periodo.
    const dosAnios = [...doce.map((p) => ({ ...p, clave: p.clave.replace("2026", "2025") })), ...doce];
    const largo = principal({ serie: dosAnios });
    expect(cuenta(largo, /<text(?=[^>]*class="tubo-anio )[^>]*>2025<\/text>/g)).toBe(1);
    expect(cuenta(largo, /<text(?=[^>]*class="tubo-anio )[^>]*>2026<\/text>/g)).toBe(2);
    expect(largo).toMatch(/<text(?=[^>]*class="tubo-anio )(?=[^>]*text-anchor="end")[^>]*>2026<\/text>/);
  });
});

describe("las piezas pequeñas", () => {
  it("TuboAcumulado, MiniTubos, Tendencia y BarraEstados llevan su texto", () => {
    const acumulado = renderToStaticMarkup(
      <TuboAcumulado valor={79.6} texto="79,6 %" estado="atencion" meta={{ valor: 85, texto: "Meta 85 %" }} unidad={UNIDAD} />,
    );
    expect(sinEtiquetas(acumulado)).toContain("79,6 %");
    expect(acumulado).toContain(">Atención<");
    expect(acumulado).toContain(">Meta 85 %<");
    expect(acumulado).toMatch(/class="tubo-relleno tubo-acostado tubo-atencion[^"]*" style="width:79.6%/);
    expect(acumulado).toContain("left:85%");
    const sinMeta = renderToStaticMarkup(<TuboAcumulado valor={12} texto="12" estado="sin-meta" />);
    expect(sinMeta).toContain(">Sin meta<");
    expect(sinMeta).toContain("tubo-neutro");
    expect(sinMeta).not.toContain("Meta ");
    const sinDato = renderToStaticMarkup(<TuboAcumulado valor={null} texto="Sin dato" estado="sin-dato" unidad={UNIDAD} />);
    expect(sinDato).not.toContain("tubo-relleno");
    expect(sinDato).not.toContain("NaN");
    // Un acumulado negativo también parte del cero.
    const negativo = renderToStaticMarkup(<TuboAcumulado valor={-5} texto="−5" estado="sin-meta" />);
    expect(negativo).toContain('style="width:71.428%;margin-left:14.286%"');
    expect(acumulado).toMatch(/^<div class="tubo-color-exacto /);

    const variable: PuntoDeSerie[] = [
      { clave: "2026-T1", etiqueta: "primer trimestre", valor: 5, texto: "5", estado: "sin-meta", nombreEstado: "Sin meta" },
      { clave: "2026-T2", etiqueta: "segundo trimestre", valor: 5, texto: "5", estado: "sin-meta", nombreEstado: "Sin meta" },
      { clave: "2026-T3", etiqueta: "tercer trimestre", valor: 3, texto: "3", estado: "sin-meta", nombreEstado: "Sin meta" },
      { clave: "2026-T4", etiqueta: "cuarto trimestre", valor: null, texto: "", estado: "futuro", nombreEstado: "Por reportar" },
    ];
    const mini = renderToStaticMarkup(<MiniTubos titulo="Auditorías ejecutadas" serie={variable} />);
    expect(mini).toMatch(/<svg(?=[^>]*role="img")(?=[^>]*aria-label="Auditorías ejecutadas")[^>]*>/);
    expect(cuenta(mini, /class="tubo-relleno tubo-neutro"/g)).toBe(3);
    expect(mini).toContain(">T3<");
    expect(mini).toContain(">3<");
    expect(mini).toContain('<tr><th scope="row">tercer trimestre</th><td>3</td></tr>');
    expect(mini).not.toContain("NaN");
    // Nunca por debajo de 1:1: con doce meses el lienzo mide lo que pide y se desplaza desde lo más reciente.
    const mensual = doce.map((p) => (p.valor === null ? p : { ...p, texto: String(p.valor), estado: "sin-meta" as const }));
    const miniMes = renderToStaticMarkup(<MiniTubos titulo="Cartera recaudada" serie={mensual} />);
    expect(miniMes).toMatch(/<svg(?=[^>]*\swidth="372")(?=[^>]*\sheight="64")(?=[^>]*class="[^"]*max-w-none)(?=[^>]*\[direction:ltr\])[^>]*>/);
    expect(miniMes).toMatch(
      /<div(?=[^>]*class="[^"]*overflow-x-auto)(?=[^>]*\[direction:rtl\])(?=[^>]*tabindex="0")(?=[^>]*role="region")(?=[^>]*aria-label="Cartera recaudada")[^>]*>/,
    );
    // El ancho sigue al número de periodos (Tarea 19, D-2): 6 + 6 de márgenes y 30 por columna.
    expect(mini).toMatch(/<svg(?=[^>]*\swidth="132")[^>]*>/);
    // Arranca en la columna del último periodo con valor (T3), no en el que aún no llega.
    expect(mini).toMatch(/<div(?=[^>]*class="tubo-desplazable)(?=[^>]*data-inicio="2")[^>]*>/);
    expect(mini).toContain('data-columna="2"');

    const tendencia = renderToStaticMarkup(
      <Tendencia valores={[80, 82, null, 78, 85, 87]} estadoFinal="bien" descripcion="Tendencia de los últimos seis periodos: sube" />,
    );
    expect(tendencia).toMatch(/<svg(?=[^>]*role="img")(?=[^>]*aria-label="Tendencia de los últimos seis periodos: sube")[^>]*>/);
    expect(cuenta(tendencia, /<polyline/g)).toBe(2);
    expect(tendencia).toMatch(/<circle(?=[^>]*class="[^"]*fill-estado-bien)[^>]*>/);
    const plana = renderToStaticMarkup(<Tendencia valores={[4, 4, 4]} estadoFinal={null} descripcion="Sin cambios" />);
    expect(plana).not.toContain("NaN");
    expect(plana).toMatch(/<circle(?=[^>]*class="[^"]*fill-muted-foreground)[^>]*>/);

    const barra = renderToStaticMarkup(<BarraEstados bien={19} atencion={7} critico={3} sinDato={3} />);
    expect(sinEtiquetas(barra)).toBe("19 bien, 7 en atención, 3 críticos, 3 sin dato");
    expect(barra).toMatch(/<div(?=[^>]*aria-hidden="true")[^>]*><span class="bg-estado-bien" style="width:59.375%"/);
    expect(sinEtiquetas(renderToStaticMarkup(<BarraEstados bien={0} atencion={0} critico={1} sinDato={0} />))).toBe(
      "0 bien, 0 en atención, 1 crítico, 0 sin dato",
    );
    expect(renderToStaticMarkup(<BarraEstados bien={0} atencion={0} critico={0} sinDato={0} />)).not.toContain("NaN");
    expect(barra).toMatch(/^<div class="tubo-color-exacto /);
  });
});

describe("hoja de estilos y colores", () => {
  const css = readFileSync(path.join(raiz, "src/app/globals.css"), "utf8");

  it("la hoja de estilos apaga la animación con prefers-reduced-motion y usa relleno sólido al imprimir", () => {
    const conMovimiento = bloques(css, "@media (prefers-reduced-motion: no-preference)").join("\n");
    expect(conMovimiento).toMatch(/\.tubo-relleno\s*\{[^}]*animation:\s*tubo-crecer\s+0\.75s[^}]*\}/);
    expect(conMovimiento).toMatch(/animation-delay:\s*calc\(var\(--i, 0\) \* \d+ms\)/);
    expect(css).toMatch(/@keyframes tubo-crecer\s*\{/);
    // Fuera de ese bloque, nada anima un tubo: con «reducir movimiento» llegan quietos.
    const fuera = css.replace(/@media \(prefers-reduced-motion: no-preference\)\s*\{(?:[^{}]|\{[^{}]*\})*\}/g, "");
    expect(fuera).not.toMatch(/animation(?:-name)?:\s*tubo-crecer/);

    const impresion = bloques(css, "@media print").join("\n");
    for (const e of ["bien", "atencion", "critico"]) {
      expect(impresion).toMatch(new RegExp(String.raw`\.tubo-relleno\.tubo-${e}\s*\{[^}]*fill:\s*var\(--estado-${e}\)`));
    }
    expect(impresion).toMatch(/\.tubo-relleno\.tubo-neutro\s*\{[^}]*fill:\s*var\(--tubo-neutro\)/);
    expect(impresion).toMatch(/\.tubo-relleno\s*\{[^}]*animation:\s*none/);
    expect(impresion).toMatch(/\.tubo-impreso\s*\{[^}]*display:\s*inline/);
    expect(fuera).toMatch(/\.tubo-impreso\s*\{[^}]*display:\s*none/);
    // «Saltar al contenido» no sale en el papel (es fijo: se repetiría al pie de cada hoja).
    expect(impresion).toMatch(/\.saltar-al-contenido\s*\{[^}]*display:\s*none/);
    // La ficha impresa: los títulos y la fila «Calculado con la versión» no quedan solos al pie, las secciones cortas
    // no se parten y los contenedores flex pasan a bloque para que el navegador los pueda partir.
    expect(impresion).toMatch(/\.ficha-banda[^{]*\{[^}]*break-after:\s*avoid/);
    expect(impresion).toMatch(/\.ficha-tramo[^{]*\{[^}]*break-after:\s*avoid/);
    expect(impresion).toMatch(/\.ficha-corto[^{]*\{[^}]*break-inside:\s*avoid/);
    expect(impresion).toMatch(/\.ficha-impresa[^{]*\{[^}]*display:\s*block/);
    // Sin «gráficos de fondo», las piezas HTML (pista, marca, segmentos) se imprimen igual.
    expect(impresion).toMatch(/\.tubo-color-exacto\s*\{[^}]*print-color-adjust:\s*exact/);
  });

  it("cada franja enfocada dibuja su anillo de foco", () => {
    expect(css).toMatch(/\.tubo-zona:focus-visible\s*\{[^}]*stroke:\s*var\(--ring\);[^}]*stroke-width:\s*2;/);
  });

  it("las dos gráficas comparten el tubo SVG y la pequeña no arrastra la tarjeta de cliente", () => {
    const fuente = (a: string) => readFileSync(path.join(raiz, "src/componentes/ui", a), "utf8");
    expect(fuente("MiniTubos.tsx")).not.toMatch(/from "\.\/(GraficoTubos|TarjetaDeTubo)"/);
    for (const a of ["MiniTubos.tsx", "GraficoTubos.tsx"]) expect(fuente(a)).toMatch(/import \{[^}]*\bTuboSvg\b[^}]*\} from "\.\/TuboSvg"/);
    expect(fuente("TuboSvg.tsx")).not.toMatch(/^\s*["']use client["']/);
  });

  it("Escape descarta la tarjeta también cuando la abrió el cursor: escucha en el documento solo mientras se ve", () => {
    const tarjeta = readFileSync(path.join(raiz, "src/componentes/ui/TarjetaDeTubo.tsx"), "utf8");
    expect(tarjeta).toMatch(/document\.addEventListener\(\s*"keydown"/);
    expect(tarjeta).toMatch(/signal:\s*teclado\.signal/);
    expect(tarjeta).toMatch(/teclado\?\.abort\(\)/);
  });

  it("los tokens de las gráficas tienen su color de Tailwind", () => {
    for (const t of ["tubo-pista", "tubo-pista-futura", "tubo-neutro"]) {
      expect(css).toContain(`--color-${t}: var(--${t});`);
    }
  });

  it("ningún componente de gráfica usa un color fijo", () => {
    const FIJO =
      /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(|\b(?:bg|text|fill|stroke|border|from|via|to)-(?:white|black|gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-\d+)?\b/i;
    const archivos = ["geometria-tubos.ts", "GraficoTubos.tsx", "TuboSvg.tsx", "TarjetaDeTubo.tsx", "TuboAcumulado.tsx", "MiniTubos.tsx", "Tendencia.tsx", "BarraEstados.tsx"];
    for (const a of archivos) {
      const malas = readFileSync(path.join(raiz, "src/componentes/ui", a), "utf8")
        .split("\n")
        .flatMap((l, i) => (FIJO.test(l) ? [`${a}:${i + 1}: ${l.trim()}`] : []));
      expect(malas).toEqual([]);
    }
  });
});
