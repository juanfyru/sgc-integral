import { describe, expect, it } from "vitest";
import { fraccion } from "@/lib/indicadores/formula/fraccion";
import {
  errorDeRangos,
  limiteDeRangos,
  rangosATexto,
  rangosDeLaRegla,
  rangosDeTexto,
  semaforoDeRangos,
  type RangosEnTexto,
} from "@/lib/indicadores/rangos";

const f = (t: string) => fraccion(t)!;
const asc: RangosEnTexto = { bien: [{ signo: ">=", valor: "91" }], atencion: [{ signo: "entre", valor: "41", hasta: "90" }], critico: [{ signo: "<=", valor: "40" }] };
const colores = (t: RangosEnTexto, tendencia: "ascendente" | "descendente" | "constante", valores: string[]) =>
  valores.map((v) => semaforoDeRangos(f(v), rangosDeTexto(t)!, tendencia));
const err = (t: RangosEnTexto) => errorDeRangos(rangosDeTexto(t)!, "ascendente", f("100"), null);

describe("rangos del semáforo", () => {
  it("el ejemplo del hospital, más es mejor, meta 100", () => {
    const r = rangosDeTexto(asc)!;
    expect(["95", "91", "90,5", "90", "41", "40,5", "40", "0", "105"].map((v) => semaforoDeRangos(f(v), r, "ascendente")))
      .toEqual(["bien", "bien", "atencion", "atencion", "atencion", "critico", "critico", "critico", "bien"]);
    expect(errorDeRangos(r, "ascendente", f("100"), null)).toBeNull();
  });
  it("menos es mejor sin Atención: Bien ≤ 30 · Crítico > 30", () => {
    const t: RangosEnTexto = { bien: [{ signo: "<=", valor: "30" }], atencion: [], critico: [{ signo: ">", valor: "30" }] };
    expect(colores(t, "descendente", ["30", "30,5", "0"])).toEqual(["bien", "critico", "bien"]);
    expect(errorDeRangos(rangosDeTexto(t)!, "descendente", f("30"), null)).toBeNull();
  });
  it("menos es mejor con Atención: Bien ≤ 30 · Atención entre 31 y 45 · Crítico > 45", () => {
    const t: RangosEnTexto = { bien: [{ signo: "<=", valor: "30" }], atencion: [{ signo: "entre", valor: "31", hasta: "45" }], critico: [{ signo: ">", valor: "45" }] };
    expect(colores(t, "descendente", ["30,5", "45", "45,5"])).toEqual(["atencion", "atencion", "critico"]);
    expect(errorDeRangos(rangosDeTexto(t)!, "descendente", f("30"), null)).toBeNull();
  });
  it("Atención de un solo signo: Bien ≥ 95 · Atención ≥ 85,5 · Crítico < 85,5", () => {
    const t: RangosEnTexto = { bien: [{ signo: ">=", valor: "95" }], atencion: [{ signo: ">=", valor: "85,5" }], critico: [{ signo: "<", valor: "85,5" }] };
    expect(colores(t, "ascendente", ["95", "94,99", "85,5", "85,49"])).toEqual(["bien", "atencion", "atencion", "critico"]);
    expect(errorDeRangos(rangosDeTexto(t)!, "ascendente", f("95"), null)).toBeNull();
  });
  it("una fila de un solo signo no pasa por encima de un Bien con dos extremos", () => {
    const t: RangosEnTexto = { bien: [{ signo: "<=", valor: "30" }], atencion: [{ signo: "<=", valor: "33" }], critico: [{ signo: ">", valor: "33" }] };
    expect(colores(t, "descendente", ["-5", "30", "31", "33", "34"])).toEqual(["bien", "bien", "atencion", "atencion", "critico"]);
    const acotado: RangosEnTexto = { ...t, bien: [{ signo: "entre", valor: "10", hasta: "30" }] };
    expect(colores(acotado, "descendente", ["5", "10", "30", "31"])).toEqual(["bien", "bien", "bien", "atencion"]);
    expect(errorDeRangos(rangosDeTexto(acotado)!, "descendente", f("20"), null)).toBeNull();
  });
  it("mantenerse en un rango", () => {
    const t: RangosEnTexto = {
      bien: [{ signo: "entre", valor: "85", hasta: "95" }],
      atencion: [{ signo: "entre", valor: "80", hasta: "84" }, { signo: "entre", valor: "96", hasta: "100" }],
      critico: [{ signo: "<", valor: "80" }, { signo: ">", valor: "100" }],
    };
    expect(colores(t, "constante", ["90", "84,5", "82", "79", "95,5", "101"])).toEqual(["bien", "atencion", "atencion", "critico", "atencion", "critico"]);
    expect(errorDeRangos(rangosDeTexto(t)!, "constante", f("85"), f("95"))).toBeNull();
    expect(errorDeRangos(rangosDeTexto(t)!, "constante", f("85"), f("97"))).toBe("La meta debe quedar dentro del rango de Bien");
    expect(errorDeRangos(rangosDeTexto({ ...t, bien: [{ signo: ">=", valor: "85" }] })!, "constante", f("85"), f("95")))
      .toBe("Para mantenerse en un rango, Bien va con «entre»");
    expect(errorDeRangos(rangosDeTexto({ ...t, atencion: [{ signo: "entre", valor: "80", hasta: "84" }, { signo: "<", valor: "70" }] })!, "constante", f("85"), f("95")))
      .toBe("Para mantenerse en un rango, Atención y Crítico van a cada lado de Bien");
  });
  it("errores", () => {
    expect(err({ ...asc, atencion: [{ signo: "entre", valor: "41", hasta: "95" }] })).toBe("Los rangos de Atención y Bien se cruzan");
    expect(err({ ...asc, atencion: [{ signo: ">=", valor: "95" }] })).toBe("El rango de Atención queda dentro del de Bien");
    expect(err({ ...asc, atencion: [{ signo: "entre", valor: "60", hasta: "90" }] })).toBe("Entre Crítico y Atención queda un hueco de más de una unidad");
    expect(err({ ...asc, bien: [{ signo: "entre", valor: "91", hasta: "99" }] })).toBe("La meta debe quedar dentro del rango de Bien");
    expect(err({ ...asc, bien: [{ signo: "<=", valor: "91" }] })).toBe("En «más es mejor», Bien va con ≥, > o «entre»");
    expect(err({ ...asc, critico: [{ signo: ">=", valor: "40" }] })).toBe("En «más es mejor», Crítico va con ≤, < o «entre»");
    expect(err({ ...asc, atencion: [{ signo: "entre", valor: "90", hasta: "41" }] })).toBe("En «entre», el primer número no puede ser mayor que el segundo");
    expect(err({ ...asc, bien: [] })).toBe("Escriba el rango de Bien");
    expect(err({ ...asc, critico: [] })).toBe("Escriba el rango de Crítico");
    expect(err({ ...asc, atencion: [{ signo: ">=", valor: "50" }, { signo: "<", valor: "50" }] })).toBe("Cada estado lleva una sola fila");
    const d: RangosEnTexto = { bien: [{ signo: ">=", valor: "30" }], atencion: [], critico: [{ signo: ">", valor: "40" }] };
    expect(errorDeRangos(rangosDeTexto(d)!, "descendente", f("30"), null)).toBe("En «menos es mejor», Bien va con ≤, < o «entre»");
    expect(errorDeRangos(rangosDeTexto({ ...d, bien: [{ signo: "<=", valor: "30" }], critico: [{ signo: "<", valor: "40" }] })!, "descendente", f("30"), null))
      .toBe("En «menos es mejor», Crítico va con ≥, > o «entre»");
  });
  it("el orden sobre el eje sigue la tendencia, también con «entre»", () => {
    const e = (bien: [string, string], atencion: [string, string] | null, critico: [string, string], meta: string, tendencia: "ascendente" | "descendente") =>
      errorDeRangos(
        rangosDeTexto({
          bien: [{ signo: "entre", valor: bien[0], hasta: bien[1] }],
          atencion: atencion ? [{ signo: "entre", valor: atencion[0], hasta: atencion[1] }] : [],
          critico: [{ signo: "entre", valor: critico[0], hasta: critico[1] }],
        })!,
        tendencia,
        f(meta),
        null,
      );
    const MAS = "En «más es mejor», Crítico va abajo, Atención en medio y Bien arriba";
    expect(e(["50", "100"], null, ["101", "200"], "60", "ascendente")).toBe(MAS);
    expect(e(["0", "40"], null, ["41", "100"], "20", "ascendente")).toBe(MAS);
    expect(e(["91", "95"], ["96", "100"], ["0", "90"], "93", "ascendente")).toBe(MAS);
    expect(e(["10", "30"], null, ["0", "9"], "20", "descendente")).toBe("En «menos es mejor», Bien va abajo, Atención en medio y Crítico arriba");
    const c = errorDeRangos(
      rangosDeTexto({
        bien: [{ signo: "entre", valor: "85", hasta: "95" }],
        atencion: [{ signo: "entre", valor: "70", hasta: "79" }],
        critico: [{ signo: "entre", valor: "80", hasta: "84" }],
      })!,
      "constante",
      f("85"),
      f("95"),
    );
    expect(c).toBe("Para mantenerse en un rango, Bien va en medio, Atención a cada lado y Crítico afuera");
  });
  it("una fila de un solo signo hacia lo mejor no entra en un Bien que ya empezó", () => {
    const t = (bien: RangosEnTexto["bien"], atencion: RangosEnTexto["atencion"], critico: RangosEnTexto["critico"]): RangosEnTexto => ({ bien, atencion, critico });
    const e = (x: RangosEnTexto, tendencia: "ascendente" | "descendente", meta: string) => errorDeRangos(rangosDeTexto(x)!, tendencia, f(meta), null);
    const CRUCE = "Los rangos de Atención y Bien se cruzan";
    expect(e(t([{ signo: "entre", valor: "91", hasta: "100" }], [{ signo: ">=", valor: "95" }], [{ signo: "<=", valor: "90" }]), "ascendente", "95")).toBe(CRUCE);
    expect(e(t([{ signo: "entre", valor: "50", hasta: "100" }], [{ signo: ">=", valor: "60" }], [{ signo: "<", valor: "50" }]), "ascendente", "70")).toBe(CRUCE);
    expect(e(t([{ signo: "entre", valor: "50", hasta: "100" }], [{ signo: ">=", valor: "50" }], [{ signo: "<", valor: "50" }]), "ascendente", "70"))
      .toBe("El rango de Atención queda dentro del de Bien");
    expect(e(t([{ signo: "entre", valor: "10", hasta: "30" }], [{ signo: "<=", valor: "20" }], [{ signo: ">", valor: "30" }]), "descendente", "20")).toBe(CRUCE);
    expect(e(t([{ signo: ">=", valor: "91" }], [{ signo: ">=", valor: "41" }], [{ signo: "<", valor: "41" }]), "ascendente", "100")).toBeNull();
    expect(e(t([{ signo: ">=", valor: "95" }], [{ signo: ">=", valor: "85,5" }], [{ signo: "<", valor: "85,5" }]), "ascendente", "95")).toBeNull();
  });
  it("límite de crítico", () => {
    expect(limiteDeRangos(rangosDeTexto(asc)!, "ascendente")).toEqual(f("40"));
    expect(limiteDeRangos(rangosDeTexto({ ...asc, critico: [{ signo: "<", valor: "41" }] })!, "ascendente")).toEqual(f("41"));
    const d: RangosEnTexto = { bien: [{ signo: "<=", valor: "30" }], atencion: [], critico: [{ signo: ">", valor: "30" }] };
    expect(limiteDeRangos(rangosDeTexto(d)!, "descendente")).toEqual(f("30"));
    expect(limiteDeRangos(rangosDeTexto(asc)!, "constante")).toBeNull();
  });
  it("la regla aprobada del hospital", () => {
    expect(rangosATexto(rangosDeLaRegla(f("95"), "ascendente", 90, 110))).toEqual({ bien: [{ signo: ">=", valor: "95" }], atencion: [{ signo: ">=", valor: "85.5" }], critico: [{ signo: "<", valor: "85.5" }] });
    expect(rangosATexto(rangosDeLaRegla(f("30"), "descendente", 90, 110))).toEqual({ bien: [{ signo: "<=", valor: "30" }], atencion: [{ signo: "<=", valor: "33" }], critico: [{ signo: ">", valor: "33" }] });
    expect(rangosATexto(rangosDeLaRegla(f("0"), "descendente", 90, 110))).toEqual({ bien: [{ signo: "<=", valor: "0" }], atencion: [], critico: [{ signo: ">", valor: "0" }] });
  });
  it("texto: ida y vuelta, y un número ilegible es null", () => {
    expect(rangosATexto(rangosDeTexto(asc)!)).toEqual(asc);
    expect(rangosDeTexto({ ...asc, bien: [{ signo: ">=", valor: "abc" }] })).toBeNull();
    expect(rangosDeTexto({ ...asc, atencion: [{ signo: "entre", valor: "1" }] })).toBeNull();
  });
});
