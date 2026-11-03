import { expect, it } from "vitest";
import { rutaInterna } from "@/lib/rutas";

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
