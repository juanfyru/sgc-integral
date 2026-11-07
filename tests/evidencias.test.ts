/** Las evidencias de una jornada o de un ítem de verificación: una solo se alcanza por su contexto. */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { registrarArchivo } from "@/db/consultas/admin";
import { evidenciaServible, evidenciasDe, eliminarEvidencia } from "@/db/consultas/distribucion/evidencias";
import { revertida } from "./utiles/transaccion";
import { sesionAdmin } from "./utiles/tramites";

const sql = obtenerSql();
let almacen: string;
const previo = process.env.ALMACEN_RUTA;

beforeAll(() => {
  almacen = mkdtempSync(path.join(tmpdir(), "sgc-evidencias-"));
  process.env.ALMACEN_RUTA = almacen;
});
afterAll(() => {
  if (previo === undefined) delete process.env.ALMACEN_RUTA;
  else process.env.ALMACEN_RUTA = previo;
  rmSync(almacen, { recursive: true, force: true });
});

const datos = (ruta: string, contexto: string, contextoId: number) => ({
  versionId: null, contexto, contextoId, rol: "evidencia", ruta, nombreOriginal: `${ruta}.png`,
  extension: "png", mime: "image/png", tamanoBytes: 10, hashSha256: "a".repeat(64),
});

describe("evidencias", () => {
  it("evidenciasDe lista solo las de ese contexto e id", async () => {
    await revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const a = await registrarArchivo(datos("jornadas/1/a", "jornada", 1), admin.usuarioId, { sql: tx });
      await registrarArchivo(datos("jornadas/2/b", "jornada", 2), admin.usuarioId, { sql: tx });
      await registrarArchivo(datos("verificaciones/1/items/1/c", "verificacion_item", 1), admin.usuarioId, { sql: tx });

      const lista = await evidenciasDe("jornada", 1, { sql: tx });
      expect(lista.map((e) => e.id)).toEqual([a.id]);
      expect(lista[0]).toMatchObject({ nombreOriginal: "jornadas/1/a.png", mime: "image/png", tamanoBytes: 10 });
      expect(await evidenciasDe("jornada", 3, { sql: tx })).toEqual([]);
      expect((await evidenciasDe("verificacion_item", 1, { sql: tx })).length).toBe(1);
    });
  });

  it("la fila queda sin versión, con contexto, y la auditoría lo dice", async () => {
    await revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const { id } = await registrarArchivo(datos("jornadas/7/a", "jornada", 7), admin.usuarioId, { sql: tx });
      const [f] = await tx`SELECT version_id, contexto, contexto_id, rol FROM archivos WHERE id = ${id}`;
      expect(f).toMatchObject({ version_id: null, contexto: "jornada", rol: "evidencia" });
      expect(Number(f.contexto_id)).toBe(7);
      const [a] = await tx`SELECT detalle FROM auditoria WHERE accion = 'subir_archivo' AND entidad_id = ${id}`;
      expect(a.detalle).toMatchObject({ contexto: "jornada", contextoId: 7, rol: "evidencia" });
    });
  });

  it("evidenciaServible devuelve null para un archivo de otro contexto o de otro id", async () => {
    await revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const { id } = await registrarArchivo(datos("jornadas/1/a", "jornada", 1), admin.usuarioId, { sql: tx });
      expect(await evidenciaServible("jornada", 1, id, { sql: tx })).toEqual({
        ruta: "jornadas/1/a", mime: "image/png", nombreOriginal: "jornadas/1/a.png",
      });
      expect(await evidenciaServible("verificacion_item", 1, id, { sql: tx })).toBeNull();
      expect(await evidenciaServible("jornada", 2, id, { sql: tx })).toBeNull();
    });
  });

  it("eliminarEvidencia borra la fila y el archivo, audita, y no toca el de otro contexto", async () => {
    await revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      mkdirSync(path.join(almacen, "jornadas", "9"), { recursive: true });
      const fisico = path.join(almacen, "jornadas", "9", "a.png");
      writeFileSync(fisico, "x");
      const { id } = await registrarArchivo(datos("jornadas/9/a.png", "jornada", 9), admin.usuarioId, { sql: tx });

      await expect(eliminarEvidencia("verificacion_item", 9, id, admin.usuarioId, { sql: tx })).rejects.toThrow();
      expect(existsSync(fisico)).toBe(true);

      await eliminarEvidencia("jornada", 9, id, admin.usuarioId, { sql: tx });
      expect(existsSync(fisico)).toBe(false);
      expect(await evidenciasDe("jornada", 9, { sql: tx })).toEqual([]);
      const [a] = await tx`SELECT detalle FROM auditoria WHERE accion = 'eliminar_archivo' AND entidad_id = ${id}`;
      expect(a.detalle).toMatchObject({ contexto: "jornada", contextoId: 9 });
    });
  });
});
