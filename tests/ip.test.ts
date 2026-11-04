import { describe, expect, it } from "vitest";
import { ipDePeticion } from "@/lib/ip";

describe("ipDePeticion", () => {
  it("sin confianza devuelve null aunque llegue X-Forwarded-For", () =>
    expect(ipDePeticion(new Headers({ "x-forwarded-for": "9.9.9.9" }), false)).toBeNull());
  it("con confianza toma el ULTIMO elemento de X-Forwarded-For", () =>
    expect(ipDePeticion(new Headers({ "x-forwarded-for": "1.1.1.1, 10.0.0.5 " }), true)).toBe("10.0.0.5"));
  it("con confianza y sin XFF usa X-Real-IP; sin nada, null", () => {
    expect(ipDePeticion(new Headers({ "x-real-ip": "10.0.0.7" }), true)).toBe("10.0.0.7");
    expect(ipDePeticion(new Headers(), true)).toBeNull();
  });
  it("ignora elementos vacios al final", () =>
    expect(ipDePeticion(new Headers({ "x-forwarded-for": "1.1.1.1, ," }), true)).toBe("1.1.1.1"));
  it("devuelve null si el valor no es una IP válida (evita romper columnas inet)", () => {
    expect(ipDePeticion(new Headers({ "x-forwarded-for": "1.2.3.4:5678" }), true)).toBeNull();
    expect(ipDePeticion(new Headers({ "x-forwarded-for": "unknown" }), true)).toBeNull();
    expect(ipDePeticion(new Headers({ "x-real-ip": "basura" }), true)).toBeNull();
  });
  it("acepta IPv6", () =>
    expect(ipDePeticion(new Headers({ "x-forwarded-for": "2001:db8::1" }), true)).toBe("2001:db8::1"));
});
