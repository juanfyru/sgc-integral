/** `misTareas` junta las tareas de trámites y las de copias, en ese orden. */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { misTareas } from "@/lib/tareas";
import { copiaDePrueba, puntoDePrueba, vigenteConPdf } from "./utiles/distribucion";
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
