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
    expect(html).toMatch(new RegExp(`<g(?=[^>]*role="img")(?=[^>]*aria-label="${TITULO}")[^>]*>`));
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
    expect(tabla).toContain(`<caption>${TITULO}</caption>`);
    expect(tabla).toContain('<th scope="col">Mes</th><th scope="col">Resultado</th><th scope="col">Estado</th>');
    expect(cuenta(tabla, /<tr><th scope="row">/g)).toBe(12);
    expect(tabla).toContain('<tr><th scope="row">marzo</th><td>86 %</td><td>Bien</td></tr>');
    expect(tabla).toContain('<tr><th scope="row">julio</th><td>—</td><td>Sin dato</td></tr>');

    // Al imprimir se leen el valor y el estado sobre cada columna (la hoja de estilos los muestra).
    expect(cuenta(html, /class="tubo-impreso"/g)).toBe(12);
    expect(html).toMatch(/<text class="tubo-impreso"[^>]*><tspan[^>]*>58 %<\/tspan><tspan[^>]*>Crítico<\/tspan><\/text>/);
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

    const constante = principal({ meta: { valor: 100, texto: "Meta 95 a 105 %" }, limite: undefined, rango: { min: 95, max: 105 } });
    expect(constante).toMatch(/<rect(?=[^>]*class="tubo-franja)[^>]*>/);
    // La franja entra en la escala: 105 % pasa de 100, así que el eje llega a 125.
    expect(constante).toContain(">125 %<");

    const vacia = principal({ serie: [] });
    expect(vacia).not.toContain("<svg");
    expect(sinEtiquetas(vacia)).toBe("Sin periodos para mostrar.");
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
  });

  it("los tokens de las gráficas tienen su color de Tailwind", () => {
    for (const t of ["tubo-pista", "tubo-pista-futura", "tubo-neutro"]) {
      expect(css).toContain(`--color-${t}: var(--${t});`);
    }
  });

  it("ningún componente de gráfica usa un color fijo", () => {
    const FIJO =
      /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(|\b(?:bg|text|fill|stroke|border|from|via|to)-(?:white|black|gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-\d+)?\b/i;
    const archivos = ["geometria-tubos.ts", "GraficoTubos.tsx", "TarjetaDeTubo.tsx", "TuboAcumulado.tsx", "MiniTubos.tsx", "Tendencia.tsx", "BarraEstados.tsx"];
    for (const a of archivos) {
      const malas = readFileSync(path.join(raiz, "src/componentes/ui", a), "utf8")
        .split("\n")
        .flatMap((l, i) => (FIJO.test(l) ? [`${a}:${i + 1}: ${l.trim()}`] : []));
      expect(malas).toEqual([]);
    }
  });
});
