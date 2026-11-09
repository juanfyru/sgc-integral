/** La tarea «Revisar la vigencia» de «Mis tareas» (spec 13C §7.5 y §13.1): quién la recibe, su título y la exclusión de la revisión anual. */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { columnasDeVigencia } from "@/db/consultas/vigencia/fragmentos";
import { tareasDeVigencia } from "@/db/consultas/vigencia/tareas";
import { sesionAdmin, sesionDe, tramiteEn, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";
import { enRevisionAbierta, procesoSinLider, sinFechaDeRevision, sinRevisionAbierta, vigenteFuera } from "./utiles/vigencia";

const sql = obtenerSql();
const ahora = new Date("2026-11-08T15:00:00Z");

let almacen: string;
const previo = process.env.ALMACEN_RUTA;

beforeAll(() => {
  almacen = mkdtempSync(path.join(tmpdir(), "sgc-vigencia-tareas-"));
  process.env.ALMACEN_RUTA = almacen;
});

afterAll(async () => {
  if (previo === undefined) delete process.env.ALMACEN_RUTA;
  else process.env.ALMACEN_RUTA = previo;
  rmSync(almacen, { recursive: true, force: true });
  await sql.end();
  globalThis.__sql = undefined;
});

const ids = (tareas: { id: string }[]) => tareas.map((t) => t.id);

describe("tareasDeVigencia", () => {
  it("el líder recibe la tarea de un vencido suyo; el Admin la de un proceso sin líder; nadie la de un al día", () =>
    revertida(sql, async (tx) => {
      await sinRevisionAbierta(tx);
      const lider = await sesionDe(tx, "lider.gth");
      const admin = await sesionAdmin(tx);
      const sinLider = await procesoSinLider(tx);
      const vencido = await vigenteFuera(tx, { fechaAprobacion: "2025-08-14", proceso: "GTH" });
      const huerfano = await vigenteFuera(tx, { fechaAprobacion: "2025-08-14", proceso: sinLider.sigla });
      const alDia = await vigenteFuera(tx, { fechaAprobacion: "2026-10-01", proceso: "GTH" });

      const delLider = await tareasDeVigencia(lider, { sql: tx, ahora });
      expect(ids(delLider)).toContain(`vigencia:${vencido.id}`);
      expect(ids(delLider)).not.toContain(`vigencia:${huerfano.id}`);
      expect(delLider.find((t) => t.id === `vigencia:${vencido.id}`)).toEqual({
        id: `vigencia:${vencido.id}`,
        modulo: "documentos",
        titulo: `Revisar la vigencia de ${vencido.codigo} v1 · vencida hace 86 días`,
        detalle: vencido.titulo,
        vence: expect.any(Date),
        enlace: `/documentos/${vencido.codigo.toLowerCase()}`,
      });

      const delAdmin = await tareasDeVigencia(admin, { sql: tx, ahora });
      expect(ids(delAdmin)).toContain(`vigencia:${huerfano.id}`);
      // GTH tiene líder: su vencido es tarea del líder, no del Admin SGC.
      expect(ids(delAdmin)).not.toContain(`vigencia:${vencido.id}`);

      for (const sesion of [lider, admin]) {
        expect(ids(await tareasDeVigencia(sesion, { sql: tx, ahora }))).not.toContain(`vigencia:${alDia.id}`);
      }
      // Ni la consulta ni la gerencia reciben tareas de vigencia.
      const consulta = await usuarioDePrueba(tx, { rol: "consulta", procesos: [vencido.procesoId] });
      expect(await tareasDeVigencia(consulta, { sql: tx, ahora })).toEqual([]);
      expect(await tareasDeVigencia(await sesionDe(tx, "gerente"), { sql: tx, ahora })).toEqual([]);
    }));

  it("en atención dice cuándo vence, y sin fecha de revisión lo dice", () =>
    revertida(sql, async (tx) => {
      await sinRevisionAbierta(tx);
      const lider = await sesionDe(tx, "lider.gth");
      const pronto = await vigenteFuera(tx, { fechaAprobacion: "2025-12-14", proceso: "GTH" });
      const sinFecha = await vigenteFuera(tx, { fechaAprobacion: "2025-12-14", proceso: "GTH" });
      await sinFechaDeRevision(tx, sinFecha);
      const tareas = await tareasDeVigencia(lider, { sql: tx, ahora });
      expect(tareas.find((t) => t.id === `vigencia:${pronto.id}`)).toMatchObject({
        titulo: `Revisar la vigencia de ${pronto.codigo} v1 · vence el 14 dic 2026`,
        vence: expect.any(Date),
      });
      expect(tareas.find((t) => t.id === `vigencia:${sinFecha.id}`)).toMatchObject({
        titulo: `Revisar la vigencia de ${sinFecha.codigo} v1 · sin fecha de revisión`,
        vence: null,
      });
    }));

  it("con un trámite abierto, la tarea es la del trámite", () =>
    revertida(sql, async (tx) => {
      await sinRevisionAbierta(tx);
      const t = await tramiteEn(tx, "elaboracion");
      try {
        const [{ documento_id: documentoId }] = await tx`SELECT documento_id FROM tramites WHERE id = ${t.tramiteId}`;
        await tx`UPDATE documento_versiones SET fecha_aprobacion = '2025-08-14', origen_aprobacion = 'fuera'
          WHERE documento_id = ${documentoId} AND estado = 'vigente'`;
        const [fila] = await columnasDeVigencia(tx, tx`d.id = ${documentoId}`, ahora);
        expect(fila.vigencia.estado).toBe("en_tramite");
        const admin = await sesionAdmin(tx);
        const lider = await sesionDe(tx, "lider.gth");
        for (const sesion of [admin, lider]) {
          expect(ids(await tareasDeVigencia(sesion, { sql: tx, ahora }))).not.toContain(`vigencia:${documentoId}`);
        }
      } finally {
        await t.limpiar();
      }
    }));

  it("un documento de la revisión anual abierta no da tarea: la de la campaña lo cubre", () =>
    revertida(sql, async (tx) => {
      await sinRevisionAbierta(tx);
      const lider = await sesionDe(tx, "lider.gth");
      const enCampana = await vigenteFuera(tx, { fechaAprobacion: "2025-08-14", proceso: "GTH" });
      const fuera = await vigenteFuera(tx, { fechaAprobacion: "2025-08-14", proceso: "GTH" });
      await enRevisionAbierta(tx, enCampana);
      const tareas = ids(await tareasDeVigencia(lider, { sql: tx, ahora }));
      expect(tareas).not.toContain(`vigencia:${enCampana.id}`);
      expect(tareas).toContain(`vigencia:${fuera.id}`);
      // El helper cierra la revisión abierta dentro de la transacción: el documento vuelve a dar tarea.
      await sinRevisionAbierta(tx);
      expect((await tx`SELECT 1 FROM revisiones_anuales WHERE estado = 'abierta'`).length).toBe(0);
      expect(ids(await tareasDeVigencia(lider, { sql: tx, ahora }))).toContain(`vigencia:${enCampana.id}`);
    }));
});
