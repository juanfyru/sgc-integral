import { expect, it } from "vitest";
import { origenValido } from "@/lib/origen";

it("sin Origin pasa; Origin igual al host pasa; distinto falla; X-Forwarded-Host manda", () => {
  expect(origenValido(new Headers({ host: "sgc.local" }))).toBe(true);
  expect(origenValido(new Headers({ host: "sgc.local", origin: "https://sgc.local" }))).toBe(true);
  expect(origenValido(new Headers({ host: "sgc.local", origin: "https://malo.com" }))).toBe(false);
  expect(origenValido(new Headers({ host: "app:3080", "x-forwarded-host": "sgc.hospital.gov.co", origin: "https://sgc.hospital.gov.co" }))).toBe(true);
  expect(origenValido(new Headers({ host: "sgc.local", origin: "basura" }))).toBe(false);
});
