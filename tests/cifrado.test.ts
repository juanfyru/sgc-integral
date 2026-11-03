import { describe, expect, it } from "vitest";
import { appSecretoValido, cifrar, claveDeEntorno, descifrar } from "@/lib/cifrado";

it("cifra y descifra; cambia el iv en cada llamada; detecta manipulacion", () => {
  const k = Buffer.alloc(32, 7);
  const c1 = cifrar("secreto", k), c2 = cifrar("secreto", k);
  expect(c1).not.toBe(c2);
  expect(descifrar(c1, k)).toBe("secreto");
  expect(() => descifrar(c1.slice(0, -2) + "zz", k)).toThrow();
});

it("en produccion exige APP_SECRETO; en desarrollo avisa y sigue", () => {
  expect(() => claveDeEntorno({ NODE_ENV: "production" })).toThrow(/APP_SECRETO/);
  expect(claveDeEntorno({ NODE_ENV: "development" })).toHaveLength(32);
  expect(claveDeEntorno({ APP_SECRETO: Buffer.alloc(32, 1).toString("base64") })).toHaveLength(32);
});

it("un APP_SECRETO presente pero invalido lanza aun en desarrollo", () => {
  expect(() => claveDeEntorno({ APP_SECRETO: "corto", NODE_ENV: "development" })).toThrow(/APP_SECRETO/);
});

describe("appSecretoValido", () => {
  it("acepta 32 bytes en base64 estandar", () => {
    expect(appSecretoValido(Buffer.alloc(32, 1).toString("base64"))).toBe(true);
    expect(appSecretoValido("EydHcw1DuRRigzlQG5UXcwVA+SHK+ScJTToKXv6qQic=")).toBe(true);
  });
  it("rechaza base64url", () => {
    const url = Buffer.from(Array.from({ length: 32 }, () => 0xfb)).toString("base64url");
    expect(url).toMatch(/[-_]/);
    expect(appSecretoValido(url)).toBe(false);
  });
  it("rechaza longitud incorrecta", () => {
    expect(appSecretoValido(Buffer.alloc(31, 1).toString("base64"))).toBe(false);
    expect(appSecretoValido(Buffer.alloc(33, 1).toString("base64"))).toBe(false);
  });
  it("rechaza basura y vacio", () => {
    expect(appSecretoValido("cambiar-esta-clave-por-otra-secreta-de-32bb")).toBe(false);
    expect(appSecretoValido("")).toBe(false);
    expect(appSecretoValido(undefined)).toBe(false);
  });
});
