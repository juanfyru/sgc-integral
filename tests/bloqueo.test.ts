import { describe, expect, it } from "vitest";
import { SIN_BLOQUEO, estadoTrasFallo, estaBloqueado, registrarIntentoFallido, type EstadoBloqueo } from "@/lib/bloqueo";

const t0 = new Date("2026-11-03T10:00:00Z");
describe("bloqueo por intentos", () => {
  it("cuatro fallos no bloquean; el quinto bloquea 15 minutos y reinicia el contador", () => {
    let e = SIN_BLOQUEO;
    for (let i = 0; i < 4; i++) e = registrarIntentoFallido(e, t0);
    expect(e).toEqual({ intentosFallidos: 4, bloqueosConsecutivos: 0, bloqueadoHasta: null });
    e = registrarIntentoFallido(e, t0);
    expect(e.intentosFallidos).toBe(0);
    expect(e.bloqueosConsecutivos).toBe(1);
    expect(e.bloqueadoHasta?.getTime()).toBe(t0.getTime() + 15 * 60_000);
  });
  it("cada bloqueo siguiente duplica: 30, 60 minutos… con tope de 24 h", () => {
    let e: EstadoBloqueo = { intentosFallidos: 4, bloqueosConsecutivos: 1, bloqueadoHasta: null };
    e = registrarIntentoFallido(e, t0);
    expect(e.bloqueadoHasta?.getTime()).toBe(t0.getTime() + 30 * 60_000);
    e = { intentosFallidos: 4, bloqueosConsecutivos: 10, bloqueadoHasta: null };
    e = registrarIntentoFallido(e, t0);
    expect(e.bloqueadoHasta?.getTime()).toBe(t0.getTime() + 24 * 3600_000);
  });
  it("estaBloqueado respeta la hora", () => {
    const e = { intentosFallidos: 0, bloqueosConsecutivos: 1, bloqueadoHasta: new Date(t0.getTime() + 60_000) };
    expect(estaBloqueado(e, t0)).toBe(true);
    expect(estaBloqueado(e, new Date(t0.getTime() + 61_000))).toBe(false);
    expect(estaBloqueado(SIN_BLOQUEO, t0)).toBe(false);
  });
});

describe("estadoTrasFallo (R16: sin acumular durante un bloqueo)", () => {
  const bloqueado: EstadoBloqueo = { intentosFallidos: 0, bloqueosConsecutivos: 2, bloqueadoHasta: new Date(t0.getTime() + 30 * 60_000) };
  it("con la cuenta bloqueada el estado no cambia (ni cuenta, ni extiende, ni reemplaza)", () => {
    expect(estadoTrasFallo(bloqueado, t0)).toBe(bloqueado);
    const casiQuinto = { ...bloqueado, intentosFallidos: 4 };
    expect(estadoTrasFallo(casiQuinto, t0)).toBe(casiQuinto);
  });
  it("libre, el fallo cuenta como siempre", () => {
    expect(estadoTrasFallo(SIN_BLOQUEO, t0).intentosFallidos).toBe(1);
    const vencido = { ...bloqueado, bloqueadoHasta: new Date(t0.getTime() - 1) };
    expect(estadoTrasFallo(vencido, t0).intentosFallidos).toBe(1);
  });
});
