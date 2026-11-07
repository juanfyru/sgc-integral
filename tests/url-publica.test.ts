import { describe, expect, it } from "vitest";
import { validarUrlPublica } from "@/lib/url-publica";

describe("validarUrlPublica", () => {
  it.each(["https://sgc.hospital.gov.co", "http://192.168.1.20:8443", "https://sgc.hospital.gov.co/"])("acepta %s", (u) =>
    expect(validarUrlPublica(u)).toEqual({ ok: true, url: u.replace(/\/$/, "") }));
  it.each(["javascript:alert(1)", "ftp://x", "https://sgc.gov.co/ruta", "https://sgc.gov.co?x=1", "sgc.gov.co", "https://a b", "https://sgc.gov.co/#x"])(
    "rechaza %s",
    (u) => expect(validarUrlPublica(u).ok).toBe(false),
  );
  it("vacía es válida y queda vacía", () => expect(validarUrlPublica("  ")).toEqual({ ok: true, url: "" }));
  it("el error dice qué se espera", () => {
    const r = validarUrlPublica("ftp://x");
    expect(r.ok === false && r.error).toMatch(/http/);
  });
});
