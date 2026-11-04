import { expect, it } from "vitest";
import { mensajeDeParametro, rutaInterna } from "@/lib/rutas";

it("mensajeDeParametro solo devuelve mensajes propios del mapa (M2)", () => {
  const mapa = { factor: "Se agotaron los intentos." };
  expect(mensajeDeParametro(mapa, "factor")).toBe("Se agotaron los intentos.");
  for (const heredada of ["__proto__", "constructor", "toString", "hasOwnProperty", "valueOf"]) {
    expect(mensajeDeParametro(mapa, heredada), heredada).toBeUndefined();
  }
  expect(mensajeDeParametro(mapa, undefined)).toBeUndefined();
  expect(mensajeDeParametro(mapa, ["factor"])).toBeUndefined(); // ?motivo=factor&motivo=x llega como lista
});

it("rutaInterna acepta solo rutas internas", () => {
  expect(rutaInterna("/procesos/calidad?x=1")).toBe("/procesos/calidad?x=1");
  expect(rutaInterna("//evil.com")).toBe("/");
  expect(rutaInterna("https://evil.com")).toBe("/");
  expect(rutaInterna("/\\evil.com")).toBe("/");
  expect(rutaInterna(null, "/admin")).toBe("/admin");
  expect(rutaInterna("/\t/evil.com")).toBe("/");
  expect(rutaInterna("/\n/evil.com")).toBe("/");
  expect(rutaInterna("/\r/evil.com")).toBe("/");
  expect(rutaInterna("/procesos/con espacio")).toBe("/procesos/con espacio");
});
