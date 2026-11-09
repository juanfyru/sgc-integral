/**
 * La pasada de documentos con revisión vencida (spec 13C §7.5 y §13.3): un aviso por persona y proceso con el
 * conteo, el escalamiento al jefe y la exclusión de la revisión anual abierta. Cada caso silencia los
 * documentos que ya hay en la base y cuenta solo los suyos.
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import type { TransactionSql } from "postgres";
import { obtenerSql } from "@/db/cliente";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import { revisarVencimientos } from "@/db/consultas/vencimientos";
import { revisarVencimientosDeVigencia } from "@/db/consultas/vigencia/vencimientos";
import { silenciarDistribucion } from "./utiles/distribucion";
import { sesionAdmin, sesionDe, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";
import { enRevisionAbierta, procesoSinLider, silenciarVigencia, sinFechaDeRevision, sinRevisionAbierta, vigenteFuera } from "./utiles/vigencia";

const sql = obtenerSql();
const ahora = new Date("2026-11-08T15:00:00Z");
const DIA = 86_400_000;

let almacen: string;
const previo = process.env.ALMACEN_RUTA;

beforeAll(() => {
  almacen = mkdtempSync(path.join(tmpdir(), "sgc-vigencia-vencimientos-"));
  process.env.ALMACEN_RUTA = almacen;
});

afterAll(async () => {
  if (previo === undefined) delete process.env.ALMACEN_RUTA;
  else process.env.ALMACEN_RUTA = previo;
  rmSync(almacen, { recursive: true, force: true });
  await sql.end();
  globalThis.__sql = undefined;
});

/** Antes de crear sus datos: sin revisión abierta, sin otros documentos por avisar, y el último aviso que había. */
async function preparar(tx: TransactionSql): Promise<number> {
  await sinRevisionAbierta(tx);
  await silenciarVigencia(tx);
  const [{ id }] = await tx`SELECT COALESCE(max(id), 0) AS id FROM notificaciones`;
  return Number(id);
}

const avisosDe = async (tx: TransactionSql, usuarioId: number, desde: number) => [
  ...(await tx`SELECT tipo, titulo, cuerpo, enlace, entidad, entidad_id FROM notificaciones
    WHERE usuario_id = ${usuarioId} AND id > ${desde} AND tipo LIKE 'vigencia.%' ORDER BY id`),
];

describe("revisarVencimientosDeVigencia", () => {
  it("avisa una vez por persona y proceso, con el conteo, y marca las filas", () =>
    revertida(sql, async (tx) => {
      const desde = await preparar(tx);
      const config = await obtenerConfigDocumental({ sql: tx });
      const liderGth = await sesionDe(tx, "lider.gth");
      const admin = await sesionAdmin(tx);
      const a = await vigenteFuera(tx, { fechaAprobacion: "2025-01-10", proceso: "GTH" });
      const b = await vigenteFuera(tx, { fechaAprobacion: "2025-02-10", proceso: "GTH" });
      const actualizados = async () => [...(await tx`SELECT id, actualizado_en FROM documentos WHERE id IN (${a.id}, ${b.id}) ORDER BY id`)];
      const antes = await actualizados();

      const r = await revisarVencimientosDeVigencia({ sql: tx, ahora, config });
      expect(r.avisados).toBe(2);
      const avisos = await tx`SELECT titulo FROM notificaciones
        WHERE tipo = 'vigencia.vencida' AND usuario_id = ${liderGth.usuarioId} AND id > ${desde}`;
      expect(avisos).toHaveLength(1);
      expect(avisos[0].titulo).toMatch(/^2 documentos con revisión vencida en/);

      // El líder y los Admin SGC, aunque el proceso tenga líder: el mismo aviso, con el semáforo filtrado y sin códigos.
      for (const usuarioId of [liderGth.usuarioId, admin.usuarioId]) {
        const [aviso, ...otros] = await avisosDe(tx, usuarioId, desde);
        expect(otros).toEqual([]);
        expect(aviso).toMatchObject({
          tipo: "vigencia.vencida",
          titulo: "2 documentos con revisión vencida en Gestión del Talento Humano",
          enlace: `/vigencia/semaforo?estado=vencida&proceso=${a.procesoId}`,
          entidad: "proceso",
        });
        expect(Number(aviso.entidad_id)).toBe(a.procesoId);
        for (const d of [a, b]) {
          expect(`${aviso.titulo} ${aviso.cuerpo ?? ""}`).not.toContain(d.codigo);
          expect(`${aviso.titulo} ${aviso.cuerpo ?? ""}`).not.toContain(d.titulo);
        }
      }

      expect((await tx`SELECT 1 FROM documentos WHERE id IN (${a.id}, ${b.id}) AND revision_aviso_en IS NULL`).length).toBe(0);
      // La marca no es un cambio del documento.
      expect(await actualizados()).toEqual(antes);
      expect((await revisarVencimientosDeVigencia({ sql: tx, ahora, config })).avisados).toBe(0);
    }));

  it("escala al jefe a los días configurados, sin título ni enlace", () =>
    revertida(sql, async (tx) => {
      const desde = await preparar(tx);
      const config = { ...(await obtenerConfigDocumental({ sql: tx })), escalamientoDias: 3 };
      const jefe = await usuarioDePrueba(tx, { rol: "consulta" });
      const [gth] = await tx`SELECT id FROM procesos WHERE sigla = 'GTH'`;
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [Number(gth.id)], jefeId: jefe.usuarioId });
      // La próxima revisión fue ayer, el 7 nov 2026.
      const d = await vigenteFuera(tx, { fechaAprobacion: "2025-11-07", proceso: "GTH" });

      expect(await revisarVencimientosDeVigencia({ sql: tx, ahora, config })).toEqual({ avisados: 1, escalados: 0 });
      expect(await avisosDe(tx, jefe.usuarioId, desde)).toEqual([]);
      const enCuatro = new Date(ahora.getTime() + 4 * DIA);
      expect(await revisarVencimientosDeVigencia({ sql: tx, ahora: enCuatro, config })).toEqual({ avisados: 0, escalados: 1 });
      expect(await revisarVencimientosDeVigencia({ sql: tx, ahora: new Date(ahora.getTime() + 5 * DIA), config })).toEqual({
        avisados: 0,
        escalados: 0,
      });

      const delJefe = await avisosDe(tx, jefe.usuarioId, desde);
      expect(delJefe).toHaveLength(1);
      expect(delJefe[0]).toMatchObject({ tipo: "vigencia.escalado", enlace: null });
      expect(`${delJefe[0].titulo} ${delJefe[0].cuerpo ?? ""}`).not.toContain(d.codigo);
      expect(`${delJefe[0].titulo} ${delJefe[0].cuerpo ?? ""}`).not.toContain(d.titulo);
      expect(delJefe[0].cuerpo).toContain(lider.nombre);
      const [marcas] = await tx`SELECT revision_escalado_en FROM documentos WHERE id = ${d.id}`;
      expect(marcas.revision_escalado_en).toEqual(enCuatro);
      expect(await avisosDe(tx, lider.usuarioId, desde)).toMatchObject([
        { tipo: "vigencia.vencida", titulo: "1 documento con revisión vencida en Gestión del Talento Humano" },
      ]);
    }));

  it("sin fecha de revisión no es vencido, y el vencido de un proceso sin líder avisa a los Admin SGC", () =>
    revertida(sql, async (tx) => {
      const desde = await preparar(tx);
      const config = await obtenerConfigDocumental({ sql: tx });
      const admin = await sesionAdmin(tx);
      const sinLider = await procesoSinLider(tx);
      const sinFecha = await vigenteFuera(tx, { fechaAprobacion: "2025-01-10", proceso: "GTH" });
      await sinFechaDeRevision(tx, sinFecha);
      const huerfano = await vigenteFuera(tx, { fechaAprobacion: "2025-01-10", proceso: sinLider.sigla });

      expect((await revisarVencimientosDeVigencia({ sql: tx, ahora, config })).avisados).toBe(1);
      const [marca] = await tx`SELECT revision_aviso_en FROM documentos WHERE id = ${sinFecha.id}`;
      expect(marca.revision_aviso_en).toBeNull();
      expect(await avisosDe(tx, admin.usuarioId, desde)).toMatchObject([
        {
          tipo: "vigencia.vencida",
          titulo: `1 documento con revisión vencida en ${sinLider.nombre}`,
          enlace: `/vigencia/semaforo?estado=vencida&proceso=${huerfano.procesoId}`,
        },
      ]);
    }));

  it("no avisa de los documentos de la revisión anual abierta", () =>
    revertida(sql, async (tx) => {
      await preparar(tx);
      const config = await obtenerConfigDocumental({ sql: tx });
      const enCampana = await vigenteFuera(tx, { fechaAprobacion: "2025-01-10", proceso: "GTH" });
      await enRevisionAbierta(tx, enCampana, 2096);

      expect(await revisarVencimientosDeVigencia({ sql: tx, ahora, config })).toEqual({ avisados: 0, escalados: 0 });
      const [marca] = await tx`SELECT revision_aviso_en FROM documentos WHERE id = ${enCampana.id}`;
      expect(marca.revision_aviso_en).toBeNull();

      // El helper cierra la revisión abierta dentro de la transacción: el documento vuelve a avisarse.
      await sinRevisionAbierta(tx);
      expect((await tx`SELECT 1 FROM revisiones_anuales WHERE estado = 'abierta'`).length).toBe(0);
      expect((await revisarVencimientosDeVigencia({ sql: tx, ahora, config })).avisados).toBe(1);
    }));
});

describe("revisarVencimientos con la vigencia", () => {
  it("corre la pasada de vigencia después de la distribución y suma lo suyo", () =>
    revertida(sql, async (tx) => {
      const desde = await preparar(tx);
      await tx`UPDATE tramites SET aviso_vencido_en = now(), escalado_en = now()`;
      await silenciarDistribucion(tx);
      const liderGth = await sesionDe(tx, "lider.gth");
      await vigenteFuera(tx, { fechaAprobacion: "2025-01-10", proceso: "GTH" });

      expect((await revisarVencimientos({ sql: tx, ahora })).avisados).toBe(1);
      expect(await avisosDe(tx, liderGth.usuarioId, desde)).toMatchObject([
        { tipo: "vigencia.vencida", titulo: "1 documento con revisión vencida en Gestión del Talento Humano" },
      ]);
    }));
});
