/** `misTareas` junta las tareas de trámites, copias, lecturas, socialización, verificación y hallazgos, en ese orden. */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { misTareas } from "@/lib/tareas";
import { abrirHallazgo } from "@/db/consultas/distribucion/hallazgos";
import { copiaDePrueba, puntoDePrueba, verificarPunto, vigenteConPdf } from "./utiles/distribucion";
import { sesionAdmin, tramiteEn, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();
let almacen: string;
const previo = process.env.ALMACEN_RUTA;

beforeAll(() => {
  almacen = mkdtempSync(path.join(tmpdir(), "sgc-tareas-"));
  process.env.ALMACEN_RUTA = almacen;
});

afterAll(async () => {
  if (previo === undefined) delete process.env.ALMACEN_RUTA;
  else process.env.ALMACEN_RUTA = previo;
  rmSync(almacen, { recursive: true, force: true });
  await sql.end();
  globalThis.__sql = undefined;
});

describe("misTareas con copias", () => {
  it("la tarea de copia llega después de las de trámites, con su id y su módulo", () =>
    revertida(sql, async (tx) => {
      const t = await tramiteEn(tx, "publicacion");
      const v = await vigenteConPdf(tx, { proceso: "GTH", tipo: "PR" });
      try {
        // El administrador de la publicación también recibe la copia: dos fuentes en una sola lista.
        const punto = await puntoDePrueba(tx, { responsable: t.admin, procesos: ["GTH"] });
        const emisor = await sesionAdmin(tx);
        const { copiaId } = await copiaDePrueba(tx, { emisor, documento: v.documento, punto });
        const { tareas, total } = await misTareas(t.admin, { sql: tx });
        expect(total).toBe(tareas.length);
        const iTramite = tareas.findIndex((x) => x.id === `tramite:${t.tramiteId}`);
        const iCopia = tareas.findIndex((x) => x.id === `copia:${copiaId}`);
        expect(iTramite).toBeGreaterThanOrEqual(0);
        expect(iCopia).toBeGreaterThan(iTramite);
        expect(tareas[iCopia]).toMatchObject({
          modulo: "documentos",
          titulo: `Recibir la copia N.º 01 de ${v.documento.codigo} v1 en ${punto.nombre}`,
          detalle: v.documento.titulo,
          enlace: `/distribucion/copias/${copiaId}`,
        });
        expect(tareas[iCopia].vence).toBeInstanceOf(Date);
        // Los trámites van primero, todos antes que cualquier copia.
        const primeraCopia = tareas.findIndex((x) => x.id.startsWith("copia:"));
        expect(tareas.slice(0, primeraCopia).every((x) => x.id.startsWith("tramite:"))).toBe(true);
      } finally {
        await t.limpiar();
        await v.limpiar();
      }
    }));

  it("quien no responde por ningún punto no tiene tareas de copias", () =>
    revertida(sql, async (tx) => {
      const nadie = await usuarioDePrueba(tx, { rol: "consulta" });
      expect(await misTareas(nadie, { sql: tx })).toEqual({ tareas: [], total: 0 });
    }));
});

describe("tareas de verificar y de corregir", () => {
  const AHORA = new Date("2026-11-20T15:00:00Z");

  it("el admin ve verificar un punto nunca verificado, no uno verificado hace 10 dias, y si pasan los dias vuelve a verlo", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const resp = await usuarioDePrueba(tx, { rol: "consulta" });
      const nuevo = await puntoDePrueba(tx, { responsable: resp });
      const reciente = await puntoDePrueba(tx, { responsable: resp });
      await verificarPunto(tx, { verificador: admin, punto: reciente, ahora: new Date("2026-11-10T15:00:00Z") });

      const { tareas } = await misTareas(admin, { sql: tx, ahora: AHORA });
      const de = (punto: { id: number }) => tareas.find((x) => x.id === `verificacion:${punto.id}`);
      expect(de(nuevo)).toMatchObject({
        titulo: `Verificar ${nuevo.nombre}: nunca verificado`,
        vence: null,
        enlace: `/distribucion/verificaciones/nueva?punto=${nuevo.id}`,
        modulo: "documentos",
      });
      expect(de(reciente)).toBeUndefined();

      const despues = new Date("2027-02-18T15:00:00Z"); // 100 dias despues
      const tarea = (await misTareas(admin, { sql: tx, ahora: despues })).tareas.find((x) => x.id === `verificacion:${reciente.id}`);
      expect(tarea?.titulo).toBe(`Verificar ${reciente.nombre}: última hace 100 días`);
      expect(tarea?.vence).toEqual(new Date("2027-02-08T15:00:00Z"));

      // Solo quien realiza verificaciones; un punto inactivo no cuenta.
      expect((await misTareas(resp, { sql: tx, ahora: AHORA })).tareas.some((x) => x.id.startsWith("verificacion:"))).toBe(false);
      await tx`UPDATE puntos_uso SET activo = false WHERE id = ${nuevo.id}`;
      expect((await misTareas(admin, { sql: tx, ahora: AHORA })).tareas.some((x) => x.id === `verificacion:${nuevo.id}`)).toBe(false);
    }));

  it("el responsable actual del punto ve corregir el hallazgo, con la descripcion recortada a 80, despues de las demas fuentes", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const resp = await usuarioDePrueba(tx, { rol: "consulta" });
      const punto = await puntoDePrueba(tx, { responsable: resp });
      const larga = "x".repeat(120);
      const { verificacionId } = await verificarPunto(tx, { verificador: admin, punto, ahora: new Date("2026-11-10T15:00:00Z"), respuesta: "no_conforme" });
      const { hallazgoId: deRecogida } = await abrirHallazgo(tx, {
        puntoId: punto.id,
        origen: "recogida",
        descripcion: larga,
        retiradoEnElActo: false,
        responsableId: resp.usuarioId,
        ahora: new Date("2026-11-10T15:00:00Z"),
        plazoDias: 5,
      });
      const [{ id: deVerificacion }] = await tx`SELECT id FROM hallazgos WHERE verificacion_id = ${verificacionId} ORDER BY id LIMIT 1`;

      const { tareas } = await misTareas(resp, { sql: tx, ahora: AHORA });
      const corregir = tareas.filter((x) => x.id.startsWith("hallazgo:"));
      expect(corregir).toHaveLength(4); // tres de la verificacion y el de la recogida
      const a = corregir.find((x) => x.id === `hallazgo:${deVerificacion}`)!;
      expect(a.titulo.startsWith(`Corregir hallazgo en ${punto.nombre}: `)).toBe(true);
      expect(a.enlace).toBe(`/distribucion/verificaciones/${verificacionId}`);
      expect(a.vence).toBeInstanceOf(Date);
      const b = corregir.find((x) => x.id === `hallazgo:${deRecogida}`)!;
      expect(b.titulo).toBe(`Corregir hallazgo en ${punto.nombre}: ${"x".repeat(79)}…`);
      expect(b.enlace).toBe("/distribucion/verificaciones");
      // Nadie mas los ve, y al final de la lista.
      expect((await misTareas(admin, { sql: tx, ahora: AHORA })).tareas.some((x) => x.id.startsWith("hallazgo:"))).toBe(false);
      const ultimos = tareas.slice(-corregir.length);
      expect(ultimos.every((x) => x.id.startsWith("hallazgo:"))).toBe(true);
    }));
});
