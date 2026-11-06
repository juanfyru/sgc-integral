/**
 * Consultas de la navegación en profundidad (Fase 4), contra la BD dev
 * sembrada (D19). Casos de diseño del seed:
 *  - SGC-FO-01 (acta): principal en SGC + secundaria en GES/GTH/GBS/SCI.
 *  - SGC-FO-03: solo borrador → invisible al público.
 *  - SGC-PR-01 ↔ SGC-FO-03: relación cuyo destino no está vigente.
 *  - GTH: documentos propios directos y en subprocesos (toggle D10).
 */
import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { obtenerFichaDocumento } from "@/db/consultas/documentos";
import {
  obtenerDetalleProceso,
  obtenerDetalleSubproceso,
  obtenerDocumentosDeProceso,
  obtenerDocumentosDeSubproceso,
} from "@/db/consultas/procesos";
import { obtenerSql } from "@/db/cliente";
import type { SujetoVisibilidad } from "@/lib/alcance";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

afterAll(async () => {
  await obtenerSql().end();
});

// Estos tests prueban otra cosa que la visibilidad: quien pregunta lo ve todo.
const ADMIN: SujetoVisibilidad = { usuarioId: 0, rol: "admin_sgc", verHistorial: false };

describe("obtenerFichaDocumento", () => {
  it("trae la ficha completa del formato de acta con sus 5 ubicaciones", async () => {
    const ficha = await obtenerFichaDocumento("sgc-fo-01", ADMIN);
    expect(ficha).not.toBeNull();
    expect(ficha!.codigo).toBe("SGC-FO-01");
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
    expect(await obtenerFichaDocumento("sgc-fo-03", ADMIN)).toBeNull();
  });

  it("devuelve null para un documento anulado", async () => {
    expect(await obtenerFichaDocumento("gic-in-02", ADMIN)).toBeNull();
  });

  it("no lista documentos relacionados que no estén vigentes", async () => {
    // SGC-PR-01 relaciona a SGC-FO-03 (borrador): no debe aparecer.
    const ficha = await obtenerFichaDocumento("sgc-pr-01", ADMIN);
    expect(ficha).not.toBeNull();
    expect(
      ficha!.relacionados.map((r) => r.codigo),
    ).not.toContain("SGC-FO-03");
  });

  it("la relación procedimiento↔formato es navegable en ambas direcciones", async () => {
    const procedimiento = await obtenerFichaDocumento("gth-pr-01", ADMIN);
    expect(procedimiento!.relacionados.map((r) => r.codigo)).toContain(
      "GTH-FO-01",
    );
    const formato = await obtenerFichaDocumento("gth-fo-01", ADMIN);
    expect(formato!.relacionados.map((r) => r.codigo)).toContain("GTH-PR-01");
  });
});

describe("obtenerDocumentosDeProceso", () => {
  it("SGC sin subprocesos: propios vigentes y ningún borrador", async () => {
    const proceso = await obtenerDetalleProceso("sistema-de-gestion-de-calidad", ADMIN);
    const docs = await obtenerDocumentosDeProceso(proceso!.id, false, ADMIN);
    const codigos = docs.map((d) => d.codigo);
    expect(codigos).toContain("SGC-MN-01");
    expect(codigos).toContain("SGC-FO-01");
    expect(codigos).not.toContain("SGC-FO-03"); // borrador
  });

  it("GTH: el toggle de subprocesos agrega los documentos de Ingreso/Desarrollo", async () => {
    const proceso = await obtenerDetalleProceso("gestion-del-talento-humano", ADMIN);
    const directos = await obtenerDocumentosDeProceso(proceso!.id, false, ADMIN);
    const conSubs = await obtenerDocumentosDeProceso(proceso!.id, true, ADMIN);
    expect(directos.map((d) => d.codigo)).not.toContain("GTH-PR-01");
    expect(conSubs.map((d) => d.codigo)).toContain("GTH-PR-01");
    const prGth = conSubs.find((d) => d.codigo === "GTH-PR-01");
    expect(prGth?.subproceso?.nombre).toBe("Ingreso");
    expect(conSubs.length).toBeGreaterThan(directos.length);
  });

  it("distingue el documento propio del que 'también aplica aquí'", async () => {
    const gth = await obtenerDetalleProceso("gestion-del-talento-humano", ADMIN);
    const docs = await obtenerDocumentosDeProceso(gth!.id, false, ADMIN);
    const acta = docs.find((d) => d.codigo === "SGC-FO-01");
    expect(acta).toBeDefined();
    expect(acta!.esPrincipal).toBe(false); // su dueño es SGC
    const caracterizacion = docs.find((d) => d.codigo === "GTH-CA-01");
    expect(caracterizacion!.esPrincipal).toBe(true);
    expect(caracterizacion!.version).toBe(3); // la vigente, no las obsoletas
  });
});

describe("detalle de proceso y subproceso", () => {
  it("arma hermanos anterior/siguiente dentro del macroproceso", async () => {
    const cex = await obtenerDetalleProceso("consulta-externa", ADMIN);
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
    const docs = await obtenerDocumentosDeSubproceso(sub!.id, ADMIN);
    expect(docs.map((d) => d.codigo).sort()).toEqual([
      "GTH-FO-01",
      "GTH-PR-01",
    ]);
    expect(sub!.anterior?.nombre).toBe("Planeación del TH");
    expect(sub!.siguiente?.nombre).toBe("Desarrollo");
  });

  it("devuelve null para slugs inexistentes o inactivos", async () => {
    expect(await obtenerDetalleProceso("no-existe", ADMIN)).toBeNull();
    expect(
      await obtenerDetalleSubproceso("gestion-del-talento-humano", "no-existe"),
    ).toBeNull();
  });
});

describe("documento restringido con asociación directa al proceso", () => {
  const CODIGO = `ZZ-VIS-${Date.now()}`;
  const sql = () => obtenerSql();
  const AJENO: SujetoVisibilidad = { usuarioId: 0, rol: "consulta", verHistorial: false };
  let lider: SujetoVisibilidad;
  let procesoId: number;
  let documentoId: number;

  beforeAll(async () => {
    const [{ id: tipoId }] = await sql()`SELECT id FROM tipos_documento WHERE activo LIMIT 1`;
    [{ id: procesoId }] = await sql()`SELECT id FROM procesos WHERE sigla = 'GTH'`;
    const [u] = await sql()`SELECT id FROM usuarios WHERE usuario = 'lider.gth'`;
    lider = { usuarioId: u.id, rol: "lider_proceso", verHistorial: false };
    [{ id: documentoId }] = await sql()`INSERT INTO documentos (codigo, titulo, tipo_id, nivel_acceso)
      VALUES (${CODIGO}, 'Restringido directo', ${tipoId}, 'restringido') RETURNING id`;
    await sql()`INSERT INTO documento_versiones
        (documento_id, numero, estado, fecha_elaboracion, aprobo, fecha_aprobacion)
      VALUES (${documentoId}, 1, 'vigente', '2026-01-01', 'Dir. Calidad', '2026-01-10')`;
    await sql()`INSERT INTO documento_proceso (documento_id, proceso_id, es_principal)
      VALUES (${documentoId}, ${procesoId}, true)`;
  });

  afterAll(async () => {
    await sql()`DELETE FROM documento_proceso WHERE documento_id = ${documentoId}`;
    await sql()`DELETE FROM documento_versiones WHERE documento_id = ${documentoId}`;
    await sql()`DELETE FROM documentos WHERE id = ${documentoId}`;
  });

  it.each([false, true])("la regla vale para las dos ramas del listado (subprocesos: %s)", async (conSubprocesos) => {
    const codigos = async (s: SujetoVisibilidad) =>
      (await obtenerDocumentosDeProceso(procesoId, conSubprocesos, s)).map((d) => d.codigo);
    expect(await codigos(lider)).toContain(CODIGO);
    expect(await codigos(AJENO)).not.toContain(CODIGO);
  });
});
