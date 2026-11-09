/** El día de la etapa en curso de un trámite: una sola regla para su encabezado y para el semáforo. */
import { describe, expect, it } from "vitest";
import { finDeFecha } from "@/lib/tramites/plazos";
import { EVENTOS_SIN_CAMBIO_DE_ETAPA, diaDeEtapa, entradaDeEtapa } from "@/lib/tramites/dia-de-etapa";

const ZONA = "America/Bogota";
const entrada = new Date("2026-11-05T15:00:00Z");
const ahora = new Date("2026-11-08T15:00:00Z");

describe("diaDeEtapa", () => {
  it("entrada el 5 de noviembre y hoy 8: día 3 de la etapa", () => {
    expect(diaDeEtapa({ etapa: "elaboracion", venceEn: finDeFecha("2026-11-10", ZONA), entrada }, ahora, ZONA)).toEqual({ dia: 3, total: 5 });
    expect(diaDeEtapa({ etapa: "elaboracion", venceEn: finDeFecha("2026-11-20", ZONA), entrada }, ahora, ZONA)).toEqual({ dia: 3, total: 15 });
  });

  it("el día del vencimiento es el último, y después sigue contando", () => {
    expect(diaDeEtapa({ etapa: "revision", venceEn: finDeFecha("2026-11-08", ZONA), entrada }, ahora, ZONA)).toEqual({ dia: 3, total: 3 });
    expect(diaDeEtapa({ etapa: "revision", venceEn: finDeFecha("2026-11-06", ZONA), entrada }, ahora, ZONA)).toEqual({ dia: 3, total: 1 });
  });

  it("el día de la entrada es el día 1", () => {
    expect(diaDeEtapa({ etapa: "aprobacion", venceEn: finDeFecha("2026-11-10", ZONA), entrada }, entrada, ZONA)).toEqual({ dia: 1, total: 5 });
  });

  it("sin fecha límite o fuera de una etapa de trabajo no hay día", () => {
    expect(diaDeEtapa({ etapa: "elaboracion", venceEn: null, entrada }, ahora, ZONA)).toBeNull();
    expect(diaDeEtapa({ etapa: "publicado", venceEn: finDeFecha("2026-11-10", ZONA), entrada }, ahora, ZONA)).toBeNull();
  });
});

describe("entradaDeEtapa", () => {
  const creado = new Date("2026-11-01T15:00:00Z");
  const paso = { tipo: "aceptar", creadoEn: entrada };

  it("es el último evento que cambió la etapa; una reasignación o una corrección no cuentan", () => {
    expect(EVENTOS_SIN_CAMBIO_DE_ETAPA).toEqual(["reasignar", "corregir_datos"]);
    const despues = new Date("2026-11-07T15:00:00Z");
    expect(entradaDeEtapa([paso, { tipo: "reasignar", creadoEn: despues }, { tipo: "corregir_datos", creadoEn: despues }], creado)).toBe(entrada);
    expect(entradaDeEtapa([paso, { tipo: "enviar_a_revision", creadoEn: despues }], creado)).toBe(despues);
  });

  it("sin eventos que cambien la etapa, la creación del trámite", () => {
    expect(entradaDeEtapa([], creado)).toBe(creado);
    expect(entradaDeEtapa([{ tipo: "reasignar", creadoEn: entrada }], creado)).toBe(creado);
  });
});
