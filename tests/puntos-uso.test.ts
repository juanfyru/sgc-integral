/** Catálogo de puntos de uso contra la BD de desarrollo, dentro de transacciones que se revierten. */
import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import {
  alternarPuntoUso,
  crearPuntoUso,
  editarPuntoUso,
  esResponsableDePuntos,
  listarPuntosUso,
  obtenerPuntoUso,
  puntosDeResponsable,
} from "@/db/consultas/distribucion/puntos-uso";
import { cambiarActivo } from "@/db/consultas/usuarios";
import { puntoDePrueba } from "./utiles/distribucion";
import { revertida } from "./utiles/transaccion";
import { documentoLibre, sesionAdmin, sesionDe, usuarioDePrueba } from "./utiles/tramites";

const sql = obtenerSql();
beforeAll(async () => {
  await sql`SELECT 1`;
});
afterAll(async () => {
  await sql.end({ timeout: 5 });
});

describe("puntos de uso", () => {
  it("crea, edita y lista con alcance", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const resp = await usuarioDePrueba(tx, { rol: "consulta" });
      const [{ id: ate }] = await tx`SELECT id FROM procesos WHERE sigla = 'ATE'`;
      const { id } = await crearPuntoUso(
        { nombre: `zz Farmacia ${Date.now()}`, sede: null, ubicacion: null, responsableId: resp.usuarioId, procesoIds: [Number(ate)] },
        admin.usuarioId,
        { sql: tx },
      );
      expect((await listarPuntosUso(await sesionDe(tx, "lider.cex"), { sql: tx })).map((p) => p.id)).not.toContain(id);
      expect((await listarPuntosUso(resp, { sql: tx })).map((p) => p.id)).toEqual([id]);
      expect(await obtenerPuntoUso(id, await sesionDe(tx, "gerente"), { sql: tx })).toMatchObject({
        responsable: { id: resp.usuarioId },
        copiasVivas: 0,
      });
      expect(await obtenerPuntoUso(id, await sesionDe(tx, "lider.cex"), { sql: tx })).toBeNull();

      await editarPuntoUso(
        id,
        { nombre: `zz Farmacia B ${Date.now()}`, sede: "Sede 2", ubicacion: "Piso 1", responsableId: resp.usuarioId, procesoIds: [] },
        admin.usuarioId,
        { sql: tx },
      );
      expect(await obtenerPuntoUso(id, admin, { sql: tx })).toMatchObject({ sede: "Sede 2", ubicacion: "Piso 1", procesos: [] });
      const acciones = await tx`SELECT accion FROM auditoria WHERE entidad = 'puntos_uso' AND entidad_id = ${id} ORDER BY id`;
      expect(acciones.map((a) => a.accion)).toEqual(["crear_punto_uso", "editar_punto_uso"]);
    }));

  it("el nombre es único por sede, sin distinguir mayúsculas", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const resp = await usuarioDePrueba(tx, { rol: "consulta" });
      const nombre = `zz Farmacia ${Date.now()}`;
      const datos = { nombre, sede: null, ubicacion: null, responsableId: resp.usuarioId, procesoIds: [] };
      await crearPuntoUso(datos, admin.usuarioId, { sql: tx });
      await expect(crearPuntoUso({ ...datos, nombre: nombre.toUpperCase() }, admin.usuarioId, { sql: tx })).rejects.toThrow(
        "Ya existe un punto de uso con ese nombre en esa sede",
      );
    }));

  it("exige responsable activo", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const resp = await usuarioDePrueba(tx, { rol: "consulta" });
      await tx`UPDATE usuarios SET activo = false WHERE id = ${resp.usuarioId}`;
      await expect(
        crearPuntoUso(
          { nombre: `zz inactivo ${Date.now()}`, sede: null, ubicacion: null, responsableId: resp.usuarioId, procesoIds: [] },
          admin.usuarioId,
          { sql: tx },
        ),
      ).rejects.toThrow(/responsable/i);
    }));

  it("no se desactiva con copias vivas ni se desactiva a su responsable", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const resp = await usuarioDePrueba(tx, { rol: "consulta" });
      const punto = await puntoDePrueba(tx, { responsable: resp });
      expect(await esResponsableDePuntos(resp.usuarioId, { sql: tx })).toBe(true);
      expect(await puntosDeResponsable(resp.usuarioId, { sql: tx })).toEqual([{ id: punto.id, nombre: punto.nombre }]);
      await expect(cambiarActivo(resp.usuarioId, false, admin.usuarioId, { sql: tx })).rejects.toThrow(
        /responsable de 1 puntos de uso activos/,
      );
      const doc = await documentoLibre(tx, { proceso: "ATE", tipo: "PR" });
      const [v] = await tx`SELECT id FROM documento_versiones WHERE documento_id = ${doc.id}`;
      await tx`INSERT INTO copias_controladas (version_id, numero, punto_uso_id, responsable_id, responsable_nombre, emitida_por, hash_principal, emitida_en)
        VALUES (${v.id}, 1, ${punto.id}, ${resp.usuarioId}, 'Prueba', ${admin.usuarioId}, 'x', now())`;
      await expect(alternarPuntoUso(punto.id, false, admin.usuarioId, { sql: tx })).rejects.toThrow(
        /1 copias por recibir o por recoger/,
      );
    }));

  it("desactivado el punto, su responsable ya puede desactivarse", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const resp = await usuarioDePrueba(tx, { rol: "consulta" });
      const punto = await puntoDePrueba(tx, { responsable: resp });
      await alternarPuntoUso(punto.id, false, admin.usuarioId, { sql: tx });
      expect(await esResponsableDePuntos(resp.usuarioId, { sql: tx })).toBe(false);
      await cambiarActivo(resp.usuarioId, false, admin.usuarioId, { sql: tx });
      const [{ activo }] = await tx`SELECT activo FROM usuarios WHERE id = ${resp.usuarioId}`;
      expect(activo).toBe(false);
    }));

  it("el responsable nuevo debe ver los restringidos con copias vivas", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const resp = await usuarioDePrueba(tx, { rol: "consulta" });
      const otro = await usuarioDePrueba(tx, { rol: "consulta" });
      const punto = await puntoDePrueba(tx, { responsable: resp });
      const doc = await documentoLibre(tx, { proceso: "ATE", tipo: "PR" });
      await tx`UPDATE documentos SET nivel_acceso = 'restringido' WHERE id = ${doc.id}`;
      const [v] = await tx`SELECT id FROM documento_versiones WHERE documento_id = ${doc.id}`;
      await tx`INSERT INTO copias_controladas (version_id, numero, punto_uso_id, responsable_id, responsable_nombre, emitida_por, hash_principal, emitida_en)
        VALUES (${v.id}, 1, ${punto.id}, ${resp.usuarioId}, 'Prueba', ${admin.usuarioId}, 'x', now())`;
      const datos = { nombre: punto.nombre, sede: null, ubicacion: null, responsableId: otro.usuarioId, procesoIds: [] };
      await expect(editarPuntoUso(punto.id, datos, admin.usuarioId, { sql: tx })).rejects.toThrow(
        `El responsable nuevo no tiene acceso a ${doc.codigo}: recoja o anule esas copias antes`,
      );
      const [ate] = await tx`SELECT id FROM procesos WHERE sigla = 'ATE'`;
      await tx`INSERT INTO usuario_procesos (usuario_id, proceso_id) VALUES (${otro.usuarioId}, ${ate.id})`;
      await editarPuntoUso(punto.id, datos, admin.usuarioId, { sql: tx });
    }));
});
