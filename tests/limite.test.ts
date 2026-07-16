/**
 * Rate limiting en memoria (Fase 5): instancia única en el NAS, sin Redis.
 * El reloj se inyecta para probar la ventana deslizante sin timers falsos.
 */
import { describe, expect, it } from "vitest";
import { crearLimitador } from "@/lib/limite";

describe("crearLimitador", () => {
  it("permite hasta el límite dentro de la ventana y rechaza el excedente", () => {
    const permitir = crearLimitador({ limite: 3, ventanaMs: 60_000 });
    expect(permitir("1.2.3.4", 0)).toBe(true);
    expect(permitir("1.2.3.4", 1_000)).toBe(true);
    expect(permitir("1.2.3.4", 2_000)).toBe(true);
    expect(permitir("1.2.3.4", 3_000)).toBe(false);
  });

  it("vuelve a permitir cuando las peticiones viejas salen de la ventana", () => {
    const permitir = crearLimitador({ limite: 2, ventanaMs: 10_000 });
    expect(permitir("ip", 0)).toBe(true);
    expect(permitir("ip", 1_000)).toBe(true);
    expect(permitir("ip", 2_000)).toBe(false);
    // A los 10 001 ms la petición del instante 0 ya no cuenta.
    expect(permitir("ip", 10_001)).toBe(true);
  });

  it("las claves son independientes entre sí", () => {
    const permitir = crearLimitador({ limite: 1, ventanaMs: 60_000 });
    expect(permitir("a", 0)).toBe(true);
    expect(permitir("a", 1)).toBe(false);
    expect(permitir("b", 2)).toBe(true);
  });

  it("una clave nula (IP desconocida) se agrupa y también se limita", () => {
    const permitir = crearLimitador({ limite: 1, ventanaMs: 60_000 });
    expect(permitir(null, 0)).toBe(true);
    expect(permitir(null, 1)).toBe(false);
  });
});
