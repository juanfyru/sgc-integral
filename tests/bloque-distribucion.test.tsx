/**
 * El bloque «Copias controladas» de la ficha, pintado sobre la BD de desarrollo dentro de una transacción
 * que se revierte: el botón de emitir sin PDF (spec 13B §8.1) y la frase de la jornada para quien solo ve el
 * documento (§10.4 y §13.3).
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderToReadableStream } from "react-dom/server";
import type { TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const contexto = vi.hoisted(() => ({ tx: null as unknown }));

vi.mock("@/db/cliente", async (importar) => {
  const real = await importar<typeof import("@/db/cliente")>();
  return { ...real, obtenerSql: () => contexto.tx ?? real.obtenerSql() };
});
vi.mock("@/app/acciones-distribucion", () => ({
  emitirCopiaAccion: vi.fn(),
  pedirAcusesAccion: vi.fn(),
  reemplazarCopiasAccion: vi.fn(),
}));

import { BloqueDistribucion } from "@/componentes/distribucion/BloqueDistribucion";
import { obtenerSql } from "@/db/cliente";
import { registrarArchivo } from "@/db/consultas/admin";
import { registrarJornada } from "@/db/consultas/distribucion/jornadas";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { vigenteConPdf } from "./utiles/distribucion";
import { sesionAdmin, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();
const T0 = new Date("2026-11-12T15:00:00Z");
const SIN_PDF = "Para emitir copias controladas el archivo principal debe ser PDF";

let almacen: string;
const previo = process.env.ALMACEN_RUTA;

beforeAll(() => {
  almacen = mkdtempSync(path.join(tmpdir(), "sgc-bloque-"));
  process.env.ALMACEN_RUTA = almacen;
});

afterAll(async () => {
  if (previo === undefined) delete process.env.ALMACEN_RUTA;
  else process.env.ALMACEN_RUTA = previo;
  rmSync(almacen, { recursive: true, force: true });
  await sql.end();
  globalThis.__sql = undefined;
});

/** El bloque como lo recibe `sesion`, leyendo por la transacción del test. */
async function bloque(tx: TransactionSql, documento: { id: number; codigo: string; titulo: string }, sesion: SesionFlujo) {
  contexto.tx = tx;
  try {
    const elemento = await BloqueDistribucion({ documento, sesion });
    if (elemento === null) return "";
    const flujo = await renderToReadableStream(elemento);
    await flujo.allReady;
    // Sin los separadores que React pone entre textos contiguos.
    return (await new Response(flujo).text()).replaceAll("<!-- -->", "");
  } finally {
    contexto.tx = null;
  }
}

describe("BloqueDistribucion", () => {
  it("con un principal que no es PDF, el botón de emitir sale deshabilitado y dice por qué", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const v = await vigenteConPdf(tx, { proceso: "GTH", tipo: "PR" });
      try {
        const conPdf = await bloque(tx, v.documento, admin);
        expect(conPdf).toMatch(/<button[^>]*aria-haspopup="dialog"[^>]*>Emitir copia controlada<\/button>/);
        expect(conPdf).not.toContain(SIN_PDF);

        await tx`UPDATE archivos SET mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          WHERE version_id = ${v.versionId} AND rol = 'principal'`;
        const sinPdf = await bloque(tx, v.documento, admin);
        expect(sinPdf).toMatch(/<button[^>]*disabled=""[^>]*aria-describedby="emitir-sin-pdf"[^>]*>Emitir copia controlada<\/button>/);
        expect(sinPdf).toMatch(new RegExp(`<p id="emitir-sin-pdf"[^>]*>${SIN_PDF}</p>`));
        expect(sinPdf).not.toContain('aria-haspopup="dialog"');

        // Quien no emite sobre el documento (un líder de otro proceso) no ve ninguno de los dos.
        const [ate] = await tx`SELECT id FROM procesos WHERE sigla = 'ATE'`;
        const ajeno = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [Number(ate.id)] });
        const html = await bloque(tx, v.documento, ajeno);
        expect(html).toContain("Copias controladas");
        expect(html).not.toContain("Emitir copia controlada");
      } finally {
        await v.limpiar();
      }
    }));

  it("quien solo ve el documento ve la frase de la jornada, sin el acta; el Admin SGC, con el enlace", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const consulta = await usuarioDePrueba(tx, { rol: "consulta" });
      const asistente = await usuarioDePrueba(tx, { rol: "consulta" });
      const v = await vigenteConPdf(tx, { proceso: "GTH", tipo: "PR" });
      try {
        expect(await bloque(tx, v.documento, consulta)).toBe("");

        const { jornadaId } = await registrarJornada(
          admin,
          {
            fecha: "2026-11-10",
            modalidad: "reunion_servicio",
            facilitadorId: admin.usuarioId,
            versionIds: [v.versionId],
            asistenteIds: [asistente.usuarioId],
            asistentesExternos: null,
            observaciones: null,
          },
          { sql: tx, ahora: T0 },
        );
        await registrarArchivo(
          {
            versionId: null, contexto: "jornada", contextoId: jornadaId, rol: "evidencia", ruta: `jornadas/${jornadaId}/acta`,
            nombreOriginal: "acta.pdf", extension: "pdf", mime: "application/pdf", tamanoBytes: 10, hashSha256: "a".repeat(64),
          },
          admin.usuarioId,
          { sql: tx },
        );
        const frase = "Jornada del 10 nov 2026 · reunión de servicio · 1 asistente · ";

        const deConsulta = await bloque(tx, v.documento, consulta);
        expect(deConsulta).toContain("Socialización");
        expect(deConsulta).toContain(`${frase}acta adjunta`);
        expect(deConsulta).not.toContain("/distribucion/socializaciones/");
        expect(deConsulta).not.toContain("Copias controladas");
        expect(deConsulta).not.toContain("Acuses");

        const deAdmin = await bloque(tx, v.documento, admin);
        expect(deAdmin).toContain(frase);
        expect(deAdmin).toContain(`href="/distribucion/socializaciones/${jornadaId}"`);
        expect(deAdmin).toContain("Esta versión no se marcó para socializar.");

        // Una jornada anulada ya no se cuenta.
        await tx`UPDATE jornadas SET anulada_en = ${T0}, anulada_por = ${admin.usuarioId}, motivo_anulacion = 'Se registró dos veces'
          WHERE id = ${jornadaId}`;
        expect(await bloque(tx, v.documento, consulta)).toBe("");
      } finally {
        await v.limpiar();
      }
    }));
});
