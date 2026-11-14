/**
 * El límite de crítico de la gráfica de un indicador (ronda 1 de la Tarea 19, defectos D-7 y D-8): una sola frase para
 * el límite (la de «Así quedará el semáforo») en la etiqueta y en el pie accesible, y un límite por periodo, escalonado
 * como la meta, cuando una meta programada lo mueve. Reglas puras y render estático, sin BD.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GraficoTubos } from "@/componentes/ui/GraficoTubos";
import type { PuntoDeSerie } from "@/componentes/ui/geometria-tubos";
import { fraccion } from "@/lib/indicadores/formula/fraccion";
import { limiteDeLaGrafica, textoDelLimite } from "@/lib/indicadores/resultados";
import { rangosDeTexto, type RangosEnTexto } from "@/lib/indicadores/rangos";
import { limiteDeCritico, rangosEnPalabras, type Regla } from "@/lib/indicadores/semaforo";

const MINUTOS = { sufijo: " min", decimales: 0 };
const regla = (meta: string): Regla => ({
  tendencia: "descendente",
  meta: fraccion(meta),
  metaMax: null,
  modo: "relativo",
  umbralPct: 70,
  limite: null,
  tolerancia: null,
});

const mes = (clave: string, etiqueta: string, valor: number | null): PuntoDeSerie =>
  valor === null
    ? { clave, etiqueta, valor: null, texto: "s. d.", estado: "sin-dato", nombreEstado: "Sin dato" }
    : { clave, etiqueta, valor, texto: `${valor} min`, estado: valor <= 30 ? "bien" : "atencion", nombreEstado: valor <= 30 ? "Bien" : "Atención" };

const serie = [mes("2026-08", "agosto de 2026", 38), mes("2026-09", "septiembre de 2026", 50), mes("2026-10", "octubre de 2026", 38)];

describe("el texto del límite de crítico", () => {
  it("la etiqueta, el pie accesible y «Así quedará el semáforo» dicen el mismo número (D-7)", () => {
    const limite = limiteDeCritico(regla("30"))!;
    const texto = textoDelLimite(limite, regla("30"), MINUTOS);
    expect(texto).toBe("Crítico por encima de 42,85 min");
    expect(rangosEnPalabras(regla("30"), MINUTOS)).toContain("Crítico por encima de 42,85 min");
    const html = renderToStaticMarkup(
      <GraficoTubos
        serie={serie}
        titulo="Resultado por mes, 2026"
        meta={{ valor: 30, texto: "Meta 30 min" }}
        limite={{ valor: 30 / 0.7, texto }}
        unidad={MINUTOS}
        columnas={["Mes", "Resultado", "Estado"]}
      />,
    );
    expect(html).toContain("<caption>Resultado por mes, 2026: meta 30 min, crítico por encima de 42,85 min</caption>");
    expect(html).toContain(">Crítico por encima de 42,85 min<");
    expect(html).not.toContain("42,86");
  });
});

describe("el texto del límite con los rangos escritos (spec 14A §3.5)", () => {
  const PORCENTAJE = { sufijo: " %", decimales: 0 };
  const conRangos = (tendencia: Regla["tendencia"], meta: string, rangos: RangosEnTexto): Regla => ({
    tendencia,
    meta: fraccion(meta),
    metaMax: null,
    modo: "rangos",
    umbralPct: null,
    limite: null,
    tolerancia: null,
    rangos: rangosDeTexto(rangos),
  });
  const texto = (r: Regla, u = PORCENTAJE) => textoDelLimite(limiteDeCritico(r)!, r, u);

  it("un borde cerrado de Crítico no se rotula «por debajo de» ni «por encima de»: lo contradiría", () => {
    // «Crítico ≤ 40»: el 40 es Crítico.
    const hospital = conRangos("ascendente", "100", {
      bien: [{ signo: ">=", valor: "91" }],
      atencion: [{ signo: "entre", valor: "41", hasta: "90" }],
      critico: [{ signo: "<=", valor: "40" }],
    });
    expect(texto(hospital)).toBe("Crítico hasta 40 %");
    expect(texto(conRangos("ascendente", "100", { bien: [{ signo: ">=", valor: "91" }], atencion: [{ signo: "entre", valor: "41", hasta: "90" }], critico: [{ signo: "entre", valor: "0", hasta: "40" }] }))).toBe(
      "Crítico hasta 40 %",
    );
    // En «menos es mejor», el espejo: «Crítico ≥ 34» es «desde 34».
    expect(texto(conRangos("descendente", "30", { bien: [{ signo: "<=", valor: "30" }], atencion: [{ signo: "entre", valor: "31", hasta: "33" }], critico: [{ signo: ">=", valor: "34" }] }), MINUTOS)).toBe(
      "Crítico desde 34 min",
    );
  });

  it("un borde compartido que gana la fila mejor se rotula «por debajo de» o «por encima de»: ese número no es de Crítico", () => {
    // «Atención ≥ 63 · Crítico ≤ 63»: el 63 es Atención.
    expect(texto(conRangos("ascendente", "90", { bien: [{ signo: ">=", valor: "90" }], atencion: [{ signo: ">=", valor: "63" }], critico: [{ signo: "<=", valor: "63" }] }))).toBe(
      "Crítico por debajo de 63 %",
    );
    // «Bien ≥ 90 · Crítico ≤ 90» con meta 90: el 90 es Bien.
    expect(texto(conRangos("ascendente", "90", { bien: [{ signo: ">=", valor: "90" }], atencion: [], critico: [{ signo: "<=", valor: "90" }] }))).toBe(
      "Crítico por debajo de 90 %",
    );
    // En «menos es mejor»: «Atención ≤ 43 · Crítico ≥ 43».
    expect(texto(conRangos("descendente", "30", { bien: [{ signo: "<=", valor: "30" }], atencion: [{ signo: "<=", valor: "43" }], critico: [{ signo: ">=", valor: "43" }] }), MINUTOS)).toBe(
      "Crítico por encima de 43 min",
    );
    // Con borde propio sigue siendo «desde».
    expect(texto(conRangos("descendente", "30", { bien: [{ signo: "<=", valor: "30" }], atencion: [], critico: [{ signo: ">=", valor: "34" }] }), MINUTOS)).toBe(
      "Crítico desde 34 min",
    );
  });

  it("un borde abierto sigue diciendo «por debajo de» o «por encima de», como la regla vieja", () => {
    expect(texto(conRangos("ascendente", "95", { bien: [{ signo: ">=", valor: "95" }], atencion: [{ signo: ">=", valor: "85.5" }], critico: [{ signo: "<", valor: "85.5" }] }), { sufijo: " %", decimales: 1 })).toBe(
      "Crítico por debajo de 85,5 %",
    );
    expect(texto(conRangos("descendente", "30", { bien: [{ signo: "<=", valor: "30" }], atencion: [], critico: [{ signo: ">", valor: "30" }] }), MINUTOS)).toBe(
      "Crítico por encima de 30 min",
    );
  });
});

describe("el límite que sigue a la meta de cada periodo (D-8)", () => {
  const limites = ["30", "30", "40"].map((m) => {
    const l = limiteDeCritico(regla(m))!;
    return { valor: Number(m) / 0.7, texto: textoDelLimite(l, regla(m), MINUTOS) };
  });

  it("uno solo si es el mismo en todos los periodos; si cambia, uno por periodo; sin ninguno, nada", () => {
    expect(limiteDeLaGrafica([limites[0], limites[0]])).toEqual(limites[0]);
    expect(limiteDeLaGrafica(limites)).toEqual({
      porPeriodo: limites.map((l) => l.valor),
      textos: ["Crítico por encima de 42,85 min", "Crítico por encima de 42,85 min", "Crítico por encima de 57,14 min"],
      texto: "Crítico por encima de 57,14 min",
    });
    // Un periodo sin meta no tiene límite: queda un hueco.
    expect(limiteDeLaGrafica([limites[0], null])).toMatchObject({ porPeriodo: [limites[0].valor, null] });
    expect(limiteDeLaGrafica([null, null])).toBeNull();
  });

  it("la punteada se escalona con la meta y el pie dice cómo cambia", () => {
    const limite = limiteDeLaGrafica(limites)!;
    const html = renderToStaticMarkup(
      <GraficoTubos
        serie={serie}
        titulo="Resultado por mes, 2026"
        meta={{ porPeriodo: [30, 30, 40], texto: "Meta" }}
        limite={limite}
        unidad={MINUTOS}
        columnas={["Mes", "Resultado", "Estado"]}
      />,
    );
    const punteada = /<path(?=[^>]*class="tubo-limite)(?=[^>]*stroke-dasharray="3 3")[^>]*\sd="([^"]+)"/.exec(html);
    expect(punteada).not.toBeNull();
    // Un tramo por periodo y dos alturas: la de agosto y septiembre, y la de octubre.
    const alturas = [...punteada![1].matchAll(/(?:,|V)([\d.]+)/g)].map((m) => Number(m[1]));
    expect(alturas).toHaveLength(3);
    expect(alturas[0]).toBe(alturas[1]);
    expect(alturas[2]).not.toBe(alturas[1]);
    expect(html).not.toMatch(/<line(?=[^>]*class="tubo-limite)/);
    expect(html).toContain(
      "el límite de crítico cambia por periodo (crítico por encima de 42,85 min de agosto de 2026 a septiembre de 2026; crítico por encima de 57,14 min en octubre de 2026)",
    );
    // La etiqueta es la del último periodo.
    expect(html).toContain(">Crítico por encima de 57,14 min<");
  });
});
