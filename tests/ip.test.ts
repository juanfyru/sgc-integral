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
});
