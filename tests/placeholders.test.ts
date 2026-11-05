/**
 * Los archivos placeholder del seed deben ser archivos REALES y válidos: la
 * detección por magic bytes (la misma que usará la carga en Fase 6) tiene que
 * reconocer exactamente el MIME que la semilla guarda en BD (regla 6).
 * No requiere BD.
 */
import { fileTypeFromBuffer } from "file-type";
import { describe, expect, it } from "vitest";
import { generarPlaceholder } from "@/db/placeholders";

const CASOS = [
  { ext: "pdf", mime: "application/pdf" },
  {
    ext: "docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  {
    ext: "xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
] as const;

describe("generarPlaceholder — magic bytes correctos", () => {
  for (const caso of CASOS) {
    it(`genera un ${caso.ext} que file-type detecta como ${caso.mime}`, async () => {
      const buffer = await generarPlaceholder({
        codigo: "GTH-PR-01",
        titulo: "Procedimiento de Ingreso de Personal",
        numeroVersion: 1,
        ext: caso.ext,
        entidad: "Entidad de prueba",
      });
      expect(buffer.length).toBeGreaterThan(0);
      const detectado = await fileTypeFromBuffer(buffer);
      expect(detectado?.mime).toBe(caso.mime);
    });
  }

  it("dos documentos distintos producen contenidos distintos (hashes útiles)", async () => {
    const a = await generarPlaceholder({
      codigo: "SGC-FO-01",
      titulo: "Formato de Acta de Reunión",
      numeroVersion: 1,
      ext: "pdf",
      entidad: "Entidad de prueba",
    });
    const b = await generarPlaceholder({
      codigo: "SGC-FO-02",
      titulo: "Formato de Informe",
      numeroVersion: 1,
      ext: "pdf",
      entidad: "Entidad de prueba",
    });
    expect(a.equals(b)).toBe(false);
  });
});
