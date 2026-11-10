/** Vencimientos de la distribucion: copias, lecturas, socializaciones y hallazgos avisan y escalan una sola vez. */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { abrirHallazgo } from "@/db/consultas/distribucion/hallazgos";
import { transicionar } from "@/db/consultas/tramites-flujo";
import { revisarVencimientos } from "@/db/consultas/vencimientos";
import { pdfDePrueba } from "./utiles/pdf";
import { copiaSobreVigente, puntoDePrueba, silenciarDistribucion } from "./utiles/distribucion";
import { silenciarImpactos } from "./utiles/normograma";
import { silenciarRevisionAnual, silenciarVigencia } from "./utiles/vigencia";
import { opc, sesionAdmin, tramiteEn, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();

let almacen: string;
const previo = process.env.ALMACEN_RUTA;

beforeAll(() => {
  almacen = mkdtempSync(path.join(tmpdir(), "sgc-dist-venc-"));
  process.env.ALMACEN_RUTA = almacen;
});

afterAll(async () => {
  if (previo === undefined) delete process.env.ALMACEN_RUTA;
  else process.env.ALMACEN_RUTA = previo;
  rmSync(almacen, { recursive: true, force: true });
  await sql.end();
  globalThis.__sql = undefined;
});

/** Lo demas (tramites, distribucion y vigencia de la demo) queda silenciado antes de crear los datos del test. */
async function silenciar(tx: TransactionSql) {
  await tx`UPDATE tramites SET aviso_vencido_en = now(), escalado_en = now()`;
  await silenciarDistribucion(tx);
  await silenciarVigencia(tx);
  await silenciarImpactos(tx);
  await silenciarRevisionAnual(tx);
}

const correr = (tx: TransactionSql, ahora: string) => revisarVencimientos({ sql: tx, ahora: new Date(ahora) });
const gth = async (tx: TransactionSql) => Number((await tx`SELECT id FROM procesos WHERE sigla = 'GTH'`)[0].id);
const avisosDe = (tx: TransactionSql, usuarioId: number, tipo: string) =>
  tx`SELECT titulo, cuerpo, enlace FROM notificaciones WHERE usuario_id = ${usuarioId} AND tipo = ${tipo} ORDER BY id`;

describe("acuses vencidos", () => {
  it("un aviso por persona y uno por jefe con los nombres, sin titulo ni enlace, una sola vez", () =>
    revertida(sql, async (tx) => {
      await silenciar(tx);
      const proceso = await gth(tx);
      const jefe = await usuarioDePrueba(tx, { rol: "consulta" });
      const a = await usuarioDePrueba(tx, { rol: "consulta", procesos: [proceso], jefeId: jefe.usuarioId });
      const b = await usuarioDePrueba(tx, { rol: "consulta", procesos: [proceso], jefeId: jefe.usuarioId });
      const t = await tramiteEn(tx, "publicacion", { principal: await pdfDePrueba([[612, 792]]) });
      try {
        await transicionar(
          t.admin,
          { tramiteId: t.tramiteId, etapaEsperada: "publicacion", rondaEsperada: t.ronda, accion: "publicar", credenciales: { clave: "x" } },
          opc(tx, "2026-11-01T15:00:00Z"),
        ); // vence el 16/11
        await tx`UPDATE tramites SET aviso_vencido_en = now(), escalado_en = now()`;

        const r1 = await correr(tx, "2026-11-17T15:00:00Z");
        expect(r1.avisados).toBeGreaterThanOrEqual(2);
        expect(await avisosDe(tx, jefe.usuarioId, "distribucion.escalado")).toHaveLength(0);
        const [deA] = await avisosDe(tx, a.usuarioId, "distribucion.vencido");
        expect(deA.titulo).toBe(`${t.codigo} v2: su lectura venció hace 1 día`);
        expect(deA.enlace).toMatch(/^\/acuses\/\d+$/);
        expect(await avisosDe(tx, b.usuarioId, "distribucion.vencido")).toHaveLength(1);

        const r2 = await correr(tx, "2026-11-20T15:00:00Z");
        expect(r2.escalados).toBeGreaterThanOrEqual(1);
        const delJefe = await avisosDe(tx, jefe.usuarioId, "distribucion.escalado");
        expect(delJefe).toHaveLength(1);
        const [aviso] = delJefe;
        expect(aviso.enlace).toBeNull();
        expect(aviso.titulo).not.toContain(t.codigo);
        expect(`${aviso.titulo} ${aviso.cuerpo}`).not.toContain(t.titulo);
        expect(aviso.cuerpo).toContain(a.nombre);
        expect(aviso.cuerpo).toContain(b.nombre);
        expect(aviso.cuerpo).toMatch(/^2 lecturas vencidas de /);

        const r3 = await correr(tx, "2026-11-21T15:00:00Z"); // no repite
        expect(r3).toEqual({ avisados: 0, escalados: 0 });
        expect(await avisosDe(tx, a.usuarioId, "distribucion.vencido")).toHaveLength(1);
        expect(await avisosDe(tx, jefe.usuarioId, "distribucion.escalado")).toHaveLength(1);
        // Ni la revision del sistema deja fila en la bitacora.
        expect(await tx`SELECT 1 FROM auditoria WHERE accion LIKE '%vencid%' AND entidad = 'acuse'`).toHaveLength(0);
      } finally {
        await t.limpiar();
      }
    }));
});

describe("copias vencidas", () => {
  it("sin recibido avisa al responsable y a quien emitio; por recoger vencida, solo al responsable; y escala una vez", () =>
    revertida(sql, async (tx) => {
      await silenciar(tx);
      const jefe = await usuarioDePrueba(tx, { rol: "consulta" });
      const resp = await usuarioDePrueba(tx, { rol: "consulta", jefeId: jefe.usuarioId });
      const emisor = await sesionAdmin(tx);
      const punto = await puntoDePrueba(tx, { responsable: resp, procesos: ["GTH"] });
      const t = await tramiteEn(tx, "elaboracion");
      const c = await copiaSobreVigente(tx, { emisor, codigo: t.codigo, punto, ahora: new Date("2026-11-01T15:00:00Z") });
      try {
        await tx`UPDATE tramites SET aviso_vencido_en = now(), escalado_en = now()`;
        const [{ vence_en: vence }] = await tx`SELECT vence_en FROM copias_controladas WHERE id = ${c.copiaId}`;
        expect(vence).toBeInstanceOf(Date);

        const dia = 86_400_000;
        const tras = (dias: number) => new Date(vence.getTime() + dias * dia).toISOString();
        expect((await correr(tx, new Date(vence.getTime() - dia).toISOString())).avisados).toBe(0);
        expect((await correr(tx, tras(1))).avisados).toBe(1);
        const [aResp] = await avisosDe(tx, resp.usuarioId, "distribucion.vencido");
        expect(aResp.titulo).toBe(`La copia N.º 01 de ${t.codigo} v1 en ${punto.nombre} sigue sin recibido`);
        expect(aResp.enlace).toBe(`/distribucion/copias/${c.copiaId}`);
        expect(await avisosDe(tx, emisor.usuarioId, "distribucion.vencido")).toHaveLength(1);
        expect(await avisosDe(tx, jefe.usuarioId, "distribucion.escalado")).toHaveLength(0);

        expect((await correr(tx, tras(5))).escalados).toBe(1);
        const [delJefe] = await avisosDe(tx, jefe.usuarioId, "distribucion.escalado");
        expect(delJefe.enlace).toBeNull();
        expect(delJefe.titulo).not.toContain(t.codigo);
        expect(delJefe.cuerpo).toContain(resp.nombre);
        expect(await correr(tx, tras(9))).toEqual({ avisados: 0, escalados: 0 });

        // Por recoger: solo el responsable.
        const nuevoEmisor = await sesionAdmin(tx);
        const t2 = await tramiteEn(tx, "elaboracion");
        const c2 = await copiaSobreVigente(tx, { emisor: nuevoEmisor, codigo: t2.codigo, punto, ahora: new Date("2026-11-01T15:00:00Z") });
        try {
          await tx`UPDATE copias_controladas SET estado = 'por_recoger', por_recoger_en = ${new Date("2026-11-02T15:00:00Z")},
            motivo_por_recoger = 'nueva_version', vence_en = ${new Date("2026-11-10T04:59:59Z")} WHERE id = ${c2.copiaId}`;
          const antes = (await avisosDe(tx, resp.usuarioId, "distribucion.vencido")).length;
          expect((await correr(tx, "2026-11-11T15:00:00Z")).avisados).toBe(1);
          const nuevos = await avisosDe(tx, resp.usuarioId, "distribucion.vencido");
          expect(nuevos).toHaveLength(antes + 1);
          expect(nuevos.at(-1)!.titulo).toBe(`La copia N.º 01 de ${t2.codigo} v1 en ${punto.nombre} sigue sin recogerse`);
          expect(await avisosDe(tx, nuevoEmisor.usuarioId, "distribucion.vencido")).toHaveLength(0);
        } finally {
          await c2.limpiar();
          await t2.limpiar();
        }
      } finally {
        await c.limpiar();
        await t.limpiar();
      }
    }));
});

describe("socializacion y hallazgos vencidos", () => {
  it("la socializacion requerida avisa a los lideres del propietario y escala a sus jefes una sola vez", () =>
    revertida(sql, async (tx) => {
      await silenciar(tx);
      const proceso = await gth(tx);
      const jefe = await usuarioDePrueba(tx, { rol: "consulta" });
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [proceso], jefeId: jefe.usuarioId });
      const t = await tramiteEn(tx, "publicacion", { principal: await pdfDePrueba([[612, 792]]), aceptar: { requiereSocializacion: true } });
      try {
        await transicionar(
          t.admin,
          { tramiteId: t.tramiteId, etapaEsperada: "publicacion", rondaEsperada: t.ronda, accion: "publicar", credenciales: { clave: "x" } },
          opc(tx, "2026-11-01T15:00:00Z"),
        ); // 30 dias por defecto: vence el 01/12
        await tx`UPDATE tramites SET aviso_vencido_en = now(), escalado_en = now()`;
        await tx`UPDATE acuses SET aviso_vencido_en = now(), escalado_en = now()`;
        const [{ id: socId }] = await tx`SELECT id FROM socializaciones_requeridas WHERE version_id = ${t.versionId}`;

        expect((await correr(tx, "2026-11-30T15:00:00Z")).avisados).toBe(0);
        expect((await correr(tx, "2026-12-02T15:00:00Z")).avisados).toBe(1);
        const [aviso] = await avisosDe(tx, lider.usuarioId, "distribucion.vencido");
        expect(aviso.titulo).toBe(`Socialización de ${t.codigo} v2: venció el plazo para registrarla`);
        expect(aviso.enlace).toBe(`/distribucion/socializaciones/nueva?version=${t.versionId}`);
        expect(await avisosDe(tx, jefe.usuarioId, "distribucion.escalado")).toHaveLength(0);

        expect((await correr(tx, "2026-12-06T15:00:00Z")).escalados).toBe(1);
        const [delJefe] = await avisosDe(tx, jefe.usuarioId, "distribucion.escalado");
        expect(delJefe.enlace).toBeNull();
        expect(delJefe.cuerpo).toContain(lider.nombre);
        expect(await correr(tx, "2026-12-09T15:00:00Z")).toEqual({ avisados: 0, escalados: 0 });
        const [marcas] = await tx`SELECT aviso_vencido_en, escalado_en FROM socializaciones_requeridas WHERE id = ${socId}`;
        expect(marcas.aviso_vencido_en).toEqual(new Date("2026-12-02T15:00:00Z"));
        expect(marcas.escalado_en).toEqual(new Date("2026-12-06T15:00:00Z"));
      } finally {
        await t.limpiar();
      }
    }));

  it("el hallazgo abierto vencido avisa al responsable actual del punto y escala una sola vez", () =>
    revertida(sql, async (tx) => {
      await silenciar(tx);
      const jefe = await usuarioDePrueba(tx, { rol: "consulta" });
      const resp = await usuarioDePrueba(tx, { rol: "consulta", jefeId: jefe.usuarioId });
      const punto = await puntoDePrueba(tx, { responsable: resp });
      const { hallazgoId } = await abrirHallazgo(tx, {
        puntoId: punto.id,
        origen: "recogida",
        descripcion: "La copia no estaba",
        retiradoEnElActo: false,
        responsableId: resp.usuarioId,
        ahora: new Date("2026-11-01T15:00:00Z"),
        plazoDias: 5,
      }); // vence el 06/11
      const nuevoResp = await usuarioDePrueba(tx, { rol: "consulta", jefeId: jefe.usuarioId });
      await tx`UPDATE puntos_uso SET responsable_id = ${nuevoResp.usuarioId} WHERE id = ${punto.id}`;

      expect(await correr(tx, "2026-11-06T15:00:00Z")).toEqual({ avisados: 0, escalados: 0 });
      expect((await correr(tx, "2026-11-07T15:00:00Z")).avisados).toBe(1);
      const [aviso] = await avisosDe(tx, nuevoResp.usuarioId, "distribucion.vencido");
      expect(aviso.titulo).toBe(`Hallazgo vencido en ${punto.nombre}: La copia no estaba`);
      expect(await avisosDe(tx, resp.usuarioId, "distribucion.vencido")).toHaveLength(0);

      expect((await correr(tx, "2026-11-12T15:00:00Z")).escalados).toBe(1);
      const delJefe = await avisosDe(tx, jefe.usuarioId, "distribucion.escalado");
      expect(delJefe).toHaveLength(1);
      expect(delJefe[0].enlace).toBeNull();
      expect(delJefe[0].cuerpo).toContain(nuevoResp.nombre);
      expect(await correr(tx, "2026-11-20T15:00:00Z")).toEqual({ avisados: 0, escalados: 0 });

      // Cerrado, ya no se revisa.
      const [{ n }] = await tx`SELECT count(*)::int AS n FROM hallazgos WHERE id = ${hallazgoId} AND aviso_vencido_en IS NOT NULL`;
      expect(n).toBe(1);
    }));
});
