/**
 * Geometría pura de las gráficas en estilo «Tubos» (Fase 14A, Tarea 14; spec §11): la escala, la altura de cada
 * valor, un tubo por periodo, los trazos de la tendencia en miniatura y el rótulo corto del eje. Sin DOM ni BD.
 */
import { describe, expect, it } from "vitest";
import {
  anchoDeFranja,
  anchoDeLienzo,
  calcularTubos,
  columnaInicial,
  cambiosDeAnio,
  escala,
  puntosDeTendencia,
  rotuloCorto,
  yDe,
} from "@/componentes/ui/geometria-tubos";
import { doce } from "./utiles/tubos";

const G = { ancho: 540, alto: 214, margen: { izq: 34, der: 100, arriba: 18, abajo: 36 } };

describe("escala", () => {
  it("la escala de un porcentaje va de 0 a 100 y crece en pasos de 25 si algo la pasa", () => {
    expect(escala([88, 91, 58], [85, 59.5], true)).toEqual({ min: 0, max: 100, marcas: [0, 50, 100] });
    expect(escala([120], [100], true)).toEqual({ min: 0, max: 125, marcas: [0, 62.5, 125] });
  });

  it("la escala de otra unidad deja aire sobre el mayor valor o referencia", () => {
    expect(escala([28, 44], [30, 42.86], false)).toEqual({ min: 0, max: 50, marcas: [0, 25, 50] });
  });

  it("un porcentaje que llega justo a 100 no crece; uno negativo baja en pasos de 25 y la marca del medio es el cero", () => {
    expect(escala([100], [90], true)).toEqual({ min: 0, max: 100, marcas: [0, 50, 100] });
    expect(escala([-10, 40], [], true)).toEqual({ min: -25, max: 100, marcas: [-25, 0, 100] });
    expect(escala([-3, 8], [], false)).toEqual({ min: -4, max: 10, marcas: [-4, 0, 10] });
  });

  it("sin valores ni referencias, o todo en cero, la escala no se degenera", () => {
    expect(escala([], [], true)).toEqual({ min: 0, max: 100, marcas: [0, 50, 100] });
    expect(escala([0, 0], [], false)).toEqual({ min: 0, max: 1, marcas: [0, 0.5, 1] });
    expect(escala([Number.NaN], [], false)).toEqual({ min: 0, max: 1, marcas: [0, 0.5, 1] });
  });

  it("los pasos son redondos, también con decimales y con miles", () => {
    expect(escala([0.27], [], false)).toEqual({ min: 0, max: 0.3, marcas: [0, 0.15, 0.3] });
    expect(escala([1234], [], false)).toEqual({ min: 0, max: 1500, marcas: [0, 750, 1500] });
  });
});

describe("yDe", () => {
  const e = { min: 0, max: 100 };

  it("el mínimo va en la base de la pista y el máximo en su tope", () => {
    expect(yDe(0, G, e)).toBe(178);
    expect(yDe(100, G, e)).toBe(18);
    expect(yDe(50, G, e)).toBe(98);
  });

  it("un valor fuera de la escala se queda en su borde, y una escala vacía no da NaN", () => {
    expect(yDe(150, G, e)).toBe(18);
    expect(yDe(-5, G, e)).toBe(178);
    expect(yDe(3, G, { min: 0, max: 0 })).toBe(178);
  });
});

describe("calcularTubos", () => {
  it("un tubo por punto, de ancho fijo y centrado en su franja; sin valor, sin relleno", () => {
    const t = calcularTubos(doce, { ancho: 540, alto: 214, margen: { izq: 34, der: 100, arriba: 18, abajo: 36 } }, { min: 0, max: 100 });
    expect(t).toHaveLength(12);
    expect(t.every((x) => x.ancho <= 24)).toBe(true);
    expect(t[6].altoRelleno).toBe(0); // julio, sin dato
    expect(t[1].altoRelleno).toBeGreaterThan(t[7].altoRelleno); // 91 contra 58
  });

  it("cada tubo queda dentro de su franja, todos del mismo ancho, y el relleno llega a la altura de su valor", () => {
    const t = calcularTubos(doce, G, { min: 0, max: 100 });
    const franja = anchoDeFranja(12, G);
    expect(franja).toBeCloseTo(406 / 12);
    t.forEach((tubo, i) => {
      expect(tubo.centro).toBeCloseTo(34 + franja * (i + 0.5));
      expect(tubo.x).toBeGreaterThanOrEqual(34 + franja * i);
      expect(tubo.x + tubo.ancho).toBeLessThanOrEqual(34 + franja * (i + 1));
      expect(tubo.ancho).toBe(t[0].ancho);
      expect(tubo.yRelleno + tubo.altoRelleno).toBeCloseTo(178);
    });
    expect(t[0].yRelleno).toBeCloseTo(yDe(88, G, { min: 0, max: 100 }));
    expect([t[10].altoRelleno, t[11].altoRelleno]).toEqual([0, 0]); // «no aplica» y el mes que no llega
  });

  it("un valor fuera de la escala no se sale de la pista ni da un alto negativo", () => {
    const fuera = [{ ...doce[0], valor: 150 }, { ...doce[1], valor: -20 }];
    const t = calcularTubos(fuera, G, { min: 0, max: 100 });
    expect(t.map((x) => x.altoRelleno)).toEqual([160, 0]);
  });

  it("sin periodos, ningún tubo; con uno, centrado en el lienzo y con el ancho máximo", () => {
    expect(calcularTubos([], G, { min: 0, max: 100 })).toEqual([]);
    const [solo] = calcularTubos([doce[0]], G, { min: 0, max: 100 });
    expect(solo.centro).toBe(34 + 406 / 2);
    expect(solo.ancho).toBe(24);
    expect(Object.values(solo).every(Number.isFinite)).toBe(true);
  });
});

describe("calcularTubos con negativos", () => {
  const e = { min: -25, max: 100 };
  const tres = [{ ...doce[0], valor: 50 }, { ...doce[1], valor: -10 }, { ...doce[2], valor: 0 }];

  it("cuando la escala incluye el cero, el relleno parte de él: un positivo sube y un negativo baja", () => {
    const [positivo, negativo] = calcularTubos(tres, G, e);
    expect(yDe(0, G, e)).toBe(146);
    expect(positivo.yRelleno).toBeCloseTo(82);
    expect(positivo.altoRelleno).toBeCloseTo(64);
    expect(negativo.yRelleno).toBe(146);
    expect(negativo.altoRelleno).toBeCloseTo(12.8);
  });

  it("un cero no tiene relleno, y una escala que no incluye el cero parte de su base", () => {
    expect(calcularTubos(tres, G, e)[2].altoRelleno).toBe(0);
    const [solo] = calcularTubos([{ ...doce[0], valor: 75 }], G, { min: 50, max: 100 });
    expect(solo.yRelleno).toBe(98);
    expect(solo.altoRelleno).toBe(80);
  });
});

describe("puntosDeTendencia", () => {
  const g = { ancho: 64, alto: 18, margen: 3 };

  it("un trazo por tramo seguido: el periodo sin dato corta la línea", () => {
    const { tramos, ultimo } = puntosDeTendencia([80, 82, null, 78, 85, 87], g);
    expect(tramos.map((t) => t.length)).toEqual([2, 3]);
    expect(ultimo).toEqual(tramos[1][2]);
    // El mayor arriba, el menor abajo, todo dentro del lienzo.
    const todos = tramos.flat();
    expect(Math.min(...todos.map((p) => p.y))).toBe(3);
    expect(Math.max(...todos.map((p) => p.y))).toBe(15);
    expect(todos.every((p) => p.x >= 3 && p.x <= 61)).toBe(true);
  });

  it("todo igual da una línea plana en el medio; un solo valor, un punto en el centro", () => {
    const plana = puntosDeTendencia([5, 5, 5], g);
    expect(plana.tramos[0].map((p) => p.y)).toEqual([9, 9, 9]);
    expect(puntosDeTendencia([7], g)).toEqual({ tramos: [[{ x: 32, y: 9 }]], ultimo: { x: 32, y: 9 } });
  });

  it("el último punto es el del último periodo: si ese no tiene dato, no hay punto final", () => {
    expect(puntosDeTendencia([1, 2, null], g).ultimo).toBeNull();
    expect(puntosDeTendencia([null, null], g)).toEqual({ tramos: [], ultimo: null });
    expect(puntosDeTendencia([], g)).toEqual({ tramos: [], ultimo: null });
  });
});

describe("rotuloCorto", () => {
  it("el mes en tres letras y los demás periodos por su clave", () => {
    expect(rotuloCorto("2026-03", "marzo")).toBe("Mar");
    expect(rotuloCorto("2026-09", "septiembre")).toBe("Sep");
    expect(rotuloCorto("2026-T2", "segundo trimestre")).toBe("T2");
    expect(rotuloCorto("2026-B6", "sexto bimestre")).toBe("B6");
    expect(rotuloCorto("2026-S1", "primer semestre")).toBe("S1");
    expect(rotuloCorto("2026", "2026")).toBe("2026");
    expect(rotuloCorto("otra", "Otra cosa")).toBe("Otra cosa");
  });
});

describe("cambiosDeAnio", () => {
  it("con más de un año, el primer periodo de cada año; con uno solo, nada", () => {
    expect(cambiosDeAnio(["2025-11", "2025-12", "2026-01", "2026-02"])).toEqual([
      { indice: 0, anio: "2025" },
      { indice: 2, anio: "2026" },
    ]);
    expect(cambiosDeAnio(["2025-T3", "2025-T4", "2026-T1", "2026-T2", "2026-T3", "2026-T4", "2027-T1"])).toEqual([
      { indice: 0, anio: "2025" },
      { indice: 2, anio: "2026" },
      { indice: 6, anio: "2027" },
    ]);
    expect(cambiosDeAnio(["2025", "2026"])).toEqual([
      { indice: 0, anio: "2025" },
      { indice: 1, anio: "2026" },
    ]);
    expect(cambiosDeAnio(doce.map((p) => p.clave))).toEqual([]);
    expect(cambiosDeAnio([])).toEqual([]);
  });
});

describe("el ancho del lienzo y la columna inicial (ronda 1 de la Tarea 19, D-2)", () => {
  it("el lienzo mide los márgenes más un paso por periodo; sin periodos, uno", () => {
    expect(anchoDeLienzo(4, { izq: 6, der: 150 }, 34)).toBe(6 + 150 + 4 * 34);
    expect(anchoDeLienzo(12, { izq: 6, der: 150 }, 34)).toBe(6 + 150 + 12 * 34);
    expect(anchoDeLienzo(0, { izq: 6, der: 6 }, 30)).toBe(42);
  });

  it("la columna inicial es la del último periodo con valor; sin valores, ninguna", () => {
    expect(columnaInicial([{ valor: 5 }, { valor: 3 }, { valor: null }])).toBe(1);
    expect(columnaInicial([{ valor: null }, { valor: 7 }, { valor: null }, { valor: null }])).toBe(1);
    expect(columnaInicial([{ valor: 0 }])).toBe(0);
    expect(columnaInicial([{ valor: null }, { valor: null }])).toBeNull();
    expect(columnaInicial([])).toBeNull();
  });
});
