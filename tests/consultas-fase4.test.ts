/**
 * Consultas de la navegación en profundidad (Fase 4), contra la BD dev
 * sembrada (D19). Casos de diseño del seed:
 *  - FT-CAL-001 (acta): principal en CAL + secundaria en GES/GTH/GBS/SCI.
 *  - FT-CAL-003: solo borrador → invisible al público.
 *  - PR-CAL-001 ↔ FT-CAL-003: relación cuyo destino no está vigente.
 *  - GTH: documentos propios directos y en subprocesos (toggle D10).
 */
import { existsSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { obtenerFichaDocumento } from "@/db/consultas/documentos";
import {
  obtenerDetalleProceso,
  obtenerDetalleSubproceso,
  obtenerDocumentosDeProceso,
  obtenerDocumentosDeSubproceso,
} from "@/db/consultas/procesos";
import { obtenerSql } from "@/db/cliente";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

afterAll(async () => {
  await obtenerSql().end();
});

describe("obtenerFichaDocumento", () => {
  it("trae la ficha completa del formato de acta con sus 5 ubicaciones", async () => {
    const ficha = await obtenerFichaDocumento("ft-cal-001");
    expect(ficha).not.toBeNull();
    expect(ficha!.codigo).toBe("FT-CAL-001");
    expect(ficha!.version.estado).toBe("vigente");
    expect(ficha!.ubicaciones).toHaveLength(5);
    const principales = ficha!.ubicaciones.filter((u) => u.esPrincipal);
    expect(principales).toHaveLength(1);
    expect(principales[0].nombre).toBe("Sistema de Gestión de Calidad");
    // PDF de lectura + DOCX diligenciable
    expect(ficha!.archivos.map((a) => a.rol).sort()).toEqual([
      "editable",
      "principal",
    ]);
  });

  it("devuelve null para un documento sin versión vigente (borrador)", async () => {
    expect(await obtenerFichaDocumento("ft-cal-003")).toBeNull();
  });

  it("devuelve null para un documento anulado", async () => {
    expect(await obtenerFichaDocumento("in-gic-002")).toBeNull();
  });

  it("no lista documentos relacionados que no estén vigentes", async () => {
    // PR-CAL-001 relaciona a FT-CAL-003 (borrador): no debe aparecer.
    const ficha = await obtenerFichaDocumento("pr-cal-001");
    expect(ficha).not.toBeNull();
    expect(
      ficha!.relacionados.map((r) => r.codigo),
    ).not.toContain("FT-CAL-003");
  });

  it("la relación procedimiento↔formato es navegable en ambas direcciones", async () => {
    const procedimiento = await obtenerFichaDocumento("pr-gth-001");
    expect(procedimiento!.relacionados.map((r) => r.codigo)).toContain(
      "FT-GTH-001",
    );
    const formato = await obtenerFichaDocumento("ft-gth-001");
    expect(formato!.relacionados.map((r) => r.codigo)).toContain("PR-GTH-001");
  });
});

describe("obtenerDocumentosDeProceso", () => {
  it("CAL sin subprocesos: propios vigentes y ningún borrador", async () => {
    const proceso = await obtenerDetalleProceso("sistema-de-gestion-de-calidad");
    const docs = await obtenerDocumentosDeProceso(proceso!.id, false);
    const codigos = docs.map((d) => d.codigo);
    expect(codigos).toContain("MN-CAL-001");
    expect(codigos).toContain("FT-CAL-001");
    expect(codigos).not.toContain("FT-CAL-003"); // borrador
  });

  it("GTH: el toggle de subprocesos agrega los documentos de Ingreso/Desarrollo", async () => {
    const proceso = await obtenerDetalleProceso("gestion-del-talento-humano");
    const directos = await obtenerDocumentosDeProceso(proceso!.id, false);
    const conSubs = await obtenerDocumentosDeProceso(proceso!.id, true);
    expect(directos.map((d) => d.codigo)).not.toContain("PR-GTH-001");
    expect(conSubs.map((d) => d.codigo)).toContain("PR-GTH-001");
    const prGth = conSubs.find((d) => d.codigo === "PR-GTH-001");
    expect(prGth?.subproceso?.nombre).toBe("Ingreso");
    expect(conSubs.length).toBeGreaterThan(directos.length);
  });

  it("distingue el documento propio del que 'también aplica aquí'", async () => {
    const gth = await obtenerDetalleProceso("gestion-del-talento-humano");
    const docs = await obtenerDocumentosDeProceso(gth!.id, false);
    const acta = docs.find((d) => d.codigo === "FT-CAL-001");
    expect(acta).toBeDefined();
    expect(acta!.esPrincipal).toBe(false); // su dueño es CAL
    const caracterizacion = docs.find((d) => d.codigo === "CA-GTH-001");
    expect(caracterizacion!.esPrincipal).toBe(true);
    expect(caracterizacion!.version).toBe(2); // la vigente, no la obsoleta
  });
});

describe("detalle de proceso y subproceso", () => {
  it("arma hermanos anterior/siguiente dentro del macroproceso", async () => {
    const cex = await obtenerDetalleProceso("consulta-externa");
    expect(cex!.anterior?.nombre).toBe("Atención al Usuario");
    expect(cex!.siguiente?.nombre).toBe("PYM");
  });

  it("subproceso con documentos agrupables por tipo y sus hermanos", async () => {
    const sub = await obtenerDetalleSubproceso(
      "gestion-del-talento-humano",
      "ingreso",
    );
    expect(sub).not.toBeNull();
    expect(sub!.proceso.nombre).toBe("Gestión del Talento Humano");
    const docs = await obtenerDocumentosDeSubproceso(sub!.id);
    expect(docs.map((d) => d.codigo).sort()).toEqual([
      "FT-GTH-001",
      "PR-GTH-001",
    ]);
    expect(sub!.anterior?.nombre).toBe("Planeación del TH");
    expect(sub!.siguiente?.nombre).toBe("Desarrollo");
  });

  it("devuelve null para slugs inexistentes o inactivos", async () => {
    expect(await obtenerDetalleProceso("no-existe")).toBeNull();
    expect(
      await obtenerDetalleSubproceso("gestion-del-talento-humano", "no-existe"),
    ).toBeNull();
  });
});
