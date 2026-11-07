/**
 * Lo que decide el handler del acta una vez hay sesión. La visibilidad y la generación se prueban
 * contra la BD en acta.test.ts; aquí van simuladas, para que un trámite real no deje filas en `sgc`.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { asegurarActa, versionDeActa, puedeVerVersion, sesionDePeticion, obtenerTramite } = vi.hoisted(() => ({
  obtenerTramite: vi.fn(),
  asegurarActa: vi.fn(),
  versionDeActa: vi.fn(),
  puedeVerVersion: vi.fn(),
  sesionDePeticion: vi.fn(),
}));

vi.mock("@/db/consultas/actas", () => ({ asegurarActa, versionDeActa }));
vi.mock("@/db/consultas/tramites", () => ({ obtenerTramite }));
vi.mock("@/lib/alcance", () => ({ puedeVerVersion }));
vi.mock("@/lib/sesion-actual", () => ({ sesionDePeticion }));

import { GET } from "@/app/(app)/tramites/[id]/acta/route";

const SESION = { usuarioId: 5, rol: "consulta", verHistorial: false };
const PDF = new TextEncoder().encode("%PDF-1.4\n%acta de prueba\n%%EOF");

let almacen: string;
const previo = process.env.ALMACEN_RUTA;

beforeAll(() => {
  almacen = mkdtempSync(path.join(tmpdir(), "sgc-acta-"));
  process.env.ALMACEN_RUTA = almacen;
  writeFileSync(path.join(almacen, "SOL-2026-014.pdf"), PDF);
});

afterAll(() => {
  if (previo === undefined) delete process.env.ALMACEN_RUTA;
  else process.env.ALMACEN_RUTA = previo;
  rmSync(almacen, { recursive: true, force: true });
});

beforeEach(() => {
  vi.clearAllMocks();
  sesionDePeticion.mockResolvedValue(SESION);
  versionDeActa.mockResolvedValue({ versionId: 9, numero: "SOL-2026-014", clase: "aprobacion" });
  puedeVerVersion.mockResolvedValue(true);
  obtenerTramite.mockResolvedValue(null);
  asegurarActa.mockResolvedValue({ archivoId: 31, ruta: "SOL-2026-014.pdf" });
});

const pedir = (id = "7") =>
  GET(new NextRequest(`http://sgc.local/tramites/${id}/acta`), { params: Promise.resolve({ id }) });

describe("GET /tramites/[id]/acta", () => {
  it("sin sesión responde 401 y no toca nada", async () => {
    sesionDePeticion.mockResolvedValue(null);
    expect((await pedir()).status).toBe(401);
    expect(versionDeActa).not.toHaveBeenCalled();
  });

  it("sirve el PDF tal cual, sin marca de agua, como vista en el navegador", async () => {
    const res = await pedir();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toMatch(/^inline; filename="Acta SOL-2026-014\.pdf"/);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(Buffer.from(await res.arrayBuffer()).equals(Buffer.from(PDF))).toBe(true);
    expect(puedeVerVersion).toHaveBeenCalledWith(9, SESION);
    expect(asegurarActa).toHaveBeenCalledWith(7, { usuarioId: SESION.usuarioId });
  });

  it("un trámite sin acta (abierto, rechazado o cancelado) responde 404 sin generar nada", async () => {
    versionDeActa.mockResolvedValue(null);
    expect((await pedir()).status).toBe(404);
    expect(asegurarActa).not.toHaveBeenCalled();
  });

  it("quien no ve la versión ni el trámite recibe 404, no 403, y no se genera nada", async () => {
    puedeVerVersion.mockResolvedValue(false);
    obtenerTramite.mockResolvedValue(null);
    expect((await pedir()).status).toBe(404);
    expect(obtenerTramite).toHaveBeenCalledWith(7, SESION);
    expect(asegurarActa).not.toHaveBeenCalled();
  });

  it("quien aprobó una versión ya obsoleta, o una eliminación, ve el acta aunque no vea la versión", async () => {
    puedeVerVersion.mockResolvedValue(false);
    obtenerTramite.mockResolvedValue({ id: 7 });
    const res = await pedir();
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).equals(Buffer.from(PDF))).toBe(true);
    expect(asegurarActa).toHaveBeenCalledWith(7, { usuarioId: SESION.usuarioId });
  });

  it("quien ve la versión no consulta el trámite", async () => {
    expect((await pedir()).status).toBe(200);
    expect(obtenerTramite).not.toHaveBeenCalled();
  });

  it("un trámite cancelado no tiene acta aunque se vea", async () => {
    versionDeActa.mockResolvedValue(null);
    puedeVerVersion.mockResolvedValue(false);
    obtenerTramite.mockResolvedValue({ id: 7 });
    expect((await pedir()).status).toBe(404);
    expect(asegurarActa).not.toHaveBeenCalled();
  });

  it("un id que no es un número responde 404", async () => {
    expect((await pedir("7abc")).status).toBe(404);
    expect(versionDeActa).not.toHaveBeenCalled();
  });

  it("si el acta no se pudo dejar, responde 404", async () => {
    asegurarActa.mockResolvedValue(null);
    expect((await pedir()).status).toBe(404);
  });
});
