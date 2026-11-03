import { expect, it } from "vitest";
import {
  generarCodigoTotp, generarCodigosRecuperacion, generarSecretoTotp,
  hashCodigoRecuperacion, uriTotp, verificarTotp,
} from "@/lib/totp";

it("verifica el codigo actual y el del periodo anterior; rechaza el de hace dos", () => {
  const s = generarSecretoTotp(); const ahora = 1_800_000_000_000;
  expect(verificarTotp(s, generarCodigoTotp(s, ahora), ahora)).toBe(true);
  expect(verificarTotp(s, generarCodigoTotp(s, ahora - 30_000), ahora)).toBe(true);
  expect(verificarTotp(s, generarCodigoTotp(s, ahora - 90_000), ahora)).toBe(false);
  expect(verificarTotp(s, "000000", ahora)).toBe(false);
});

it("la URI lleva emisor y usuario; los codigos de recuperacion tienen formato y hash estable", () => {
  expect(uriTotp("ABC", "ana", "SGC Integral")).toMatch(/^otpauth:\/\/totp\/SGC%20Integral:ana\?/);
  const codigos = generarCodigosRecuperacion();
  expect(codigos).toHaveLength(8);
  expect(new Set(codigos).size).toBe(8);
  for (const c of codigos) expect(c).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
  expect(hashCodigoRecuperacion(" ab2cd-ef3gh ")).toBe(hashCodigoRecuperacion("AB2CDEF3GH"));
});
