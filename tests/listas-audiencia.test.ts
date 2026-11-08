/** Listas de distribución y audiencia del documento contra la BD de desarrollo, en transacciones que se revierten. */
import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import {
  audienciaDeDocumento,
  guardarAudiencia,
  leerAudiencia,
  listasDeDocumento,
} from "@/db/consultas/distribucion/audiencia";
import {
  alternarLista,
  crearLista,
  editarLista,
  listarListas,
  obtenerLista,
  resolverLista,
  resumenMiembros,
} from "@/db/consultas/distribucion/listas";
import { revertida } from "./utiles/transaccion";
import { documentoLibre, sesionAdmin, usuarioDePrueba } from "./utiles/tramites";

const sql = obtenerSql();
beforeAll(async () => {
  await sql`SELECT 1`;
});
afterAll(async () => {
  await sql.end({ timeout: 5 });
});

let n = 0;
const nombre = (x = "lista") => `zz ${x} ${Date.now()} ${++n}`;
const porId = (a: number, b: number) => a - b;

describe("listas de distribución", () => {
  it("resuelve una lista por proceso y persona, sin repetir y solo activos", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const [{ id: gth }] = await tx`SELECT id FROM procesos WHERE sigla = 'GTH'`;
      const a = await usuarioDePrueba(tx, { rol: "consulta", procesos: [gth] });
      const b = await usuarioDePrueba(tx, { rol: "consulta" });
      const inactivo = await usuarioDePrueba(tx, { rol: "consulta", procesos: [gth] });
      await tx`UPDATE usuarios SET activo = false WHERE id = ${inactivo.usuarioId}`;
      const { id } = await crearLista(
        {
          nombre: nombre(),
          descripcion: null,
          miembros: [
            { tipo: "proceso", referenciaId: gth },
            { tipo: "usuario", referenciaId: b.usuarioId },
            { tipo: "usuario", referenciaId: a.usuarioId },
          ],
        },
        admin.usuarioId,
        { sql: tx },
      );
      const ids = await resolverLista(tx, id);
      expect(ids).toContain(a.usuarioId);
      expect(ids).toContain(b.usuarioId);
      expect(ids).not.toContain(inactivo.usuarioId);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toEqual([...ids].sort(porId));
    }));

  it("resuelve por área y por cargo", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const [{ id: areaId }] = await tx`INSERT INTO areas (nombre) VALUES (${nombre("area")}) RETURNING id`;
      const [{ id: cargoA }] = await tx`INSERT INTO cargos (nombre, area_id) VALUES (${nombre("ca")}, ${areaId}) RETURNING id`;
      const [{ id: cargoB }] = await tx`INSERT INTO cargos (nombre, area_id) VALUES (${nombre("cb")}, ${areaId}) RETURNING id`;
      const u1 = await usuarioDePrueba(tx, { rol: "consulta" });
      const u2 = await usuarioDePrueba(tx, { rol: "consulta" });
      const u3 = await usuarioDePrueba(tx, { rol: "consulta" });
      await tx`UPDATE usuarios SET cargo_id = ${cargoA} WHERE id = ${u1.usuarioId}`;
      await tx`UPDATE usuarios SET cargo_id = ${cargoB} WHERE id = ${u2.usuarioId}`;
      const porArea = await crearLista(
        { nombre: nombre("a"), descripcion: null, miembros: [{ tipo: "area", referenciaId: Number(areaId) }] },
        admin.usuarioId,
        { sql: tx },
      );
      expect(await resolverLista(tx, porArea.id)).toEqual([u1.usuarioId, u2.usuarioId].sort(porId));
      const porCargo = await crearLista(
        { nombre: nombre("c"), descripcion: null, miembros: [{ tipo: "cargo", referenciaId: Number(cargoA) }] },
        admin.usuarioId,
        { sql: tx },
      );
      const resuelta = await resolverLista(tx, porCargo.id);
      expect(resuelta).toEqual([u1.usuarioId]);
      expect(resuelta).not.toContain(u3.usuarioId);
    }));

  it("una referencia inactiva o inexistente se rechaza; el nombre es único", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const inactivo = await usuarioDePrueba(tx, { rol: "consulta" });
      await tx`UPDATE usuarios SET activo = false WHERE id = ${inactivo.usuarioId}`;
      await expect(
        crearLista(
          { nombre: nombre(), descripcion: null, miembros: [{ tipo: "usuario", referenciaId: inactivo.usuarioId }] },
          admin.usuarioId,
          { sql: tx },
        ),
      ).rejects.toThrow(`La referencia usuario ${inactivo.usuarioId} no existe o está inactiva`);
      await expect(
        crearLista({ nombre: nombre(), descripcion: null, miembros: [{ tipo: "area", referenciaId: 2_000_000_000 }] }, admin.usuarioId, { sql: tx }),
      ).rejects.toThrow("La referencia area 2000000000 no existe o está inactiva");

      const viva = await usuarioDePrueba(tx, { rol: "consulta" });
      const unico = nombre("unica");
      const miembros = [{ tipo: "usuario" as const, referenciaId: viva.usuarioId }];
      await crearLista({ nombre: unico, descripcion: null, miembros }, admin.usuarioId, { sql: tx });
      await expect(
        crearLista({ nombre: unico.toUpperCase(), descripcion: null, miembros }, admin.usuarioId, { sql: tx }),
      ).rejects.toThrow("Ya existe una lista con ese nombre");
    }));

  it("edita, activa y desactiva con auditoría, y lista con miembros y personas", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const u1 = await usuarioDePrueba(tx, { rol: "consulta" });
      const u2 = await usuarioDePrueba(tx, { rol: "consulta" });
      const [{ id: gth }] = await tx`SELECT id FROM procesos WHERE sigla = 'GTH'`;
      const { id } = await crearLista(
        { nombre: nombre(), descripcion: "x", miembros: [{ tipo: "usuario", referenciaId: u1.usuarioId }] },
        admin.usuarioId,
        { sql: tx },
      );
      await editarLista(
        id,
        {
          nombre: nombre("b"),
          descripcion: null,
          miembros: [{ tipo: "usuario", referenciaId: u2.usuarioId }, { tipo: "proceso", referenciaId: Number(gth) }],
        },
        admin.usuarioId,
        { sql: tx },
      );
      const lista = await obtenerLista(id, { sql: tx });
      expect(lista?.miembros.map((m) => m.tipo).sort()).toEqual(["proceso", "usuario"]);
      expect(lista?.miembros.every((m) => m.nombre.length > 0)).toBe(true);
      expect(lista?.resueltas.map((r) => r.id)).toContain(u2.usuarioId);
      expect(lista?.personas).toBe(lista?.resueltas.length);

      await alternarLista(id, false, admin.usuarioId, { sql: tx });
      await alternarLista(id, false, admin.usuarioId, { sql: tx });
      expect((await listarListas({ sql: tx, soloActivas: true })).map((l) => l.id)).not.toContain(id);
      expect((await listarListas({ sql: tx })).map((l) => l.id)).toContain(id);
      await alternarLista(id, true, admin.usuarioId, { sql: tx });
      const acciones = await tx`SELECT accion, detalle FROM auditoria WHERE entidad = 'listas_distribucion' AND entidad_id = ${id} ORDER BY id`;
      expect(acciones.map((a) => a.accion)).toEqual(["crear_lista", "editar_lista", "desactivar_lista", "activar_lista"]);
      expect(Object.keys(acciones[1].detalle.despues).sort()).toEqual(["descripcion", "miembros", "nombre"]);
    }));

  it("resume los miembros por tipo", () => {
    expect(
      resumenMiembros([
        { tipo: "area", referenciaId: 1, nombre: "a" },
        { tipo: "area", referenciaId: 2, nombre: "b" },
        { tipo: "cargo", referenciaId: 1, nombre: "c" },
        { tipo: "usuario", referenciaId: 1, nombre: "u" },
        { tipo: "usuario", referenciaId: 2, nombre: "v" },
        { tipo: "usuario", referenciaId: 3, nombre: "w" },
      ]),
    ).toBe("2 áreas, 1 cargo, 3 personas");
    expect(resumenMiembros([])).toBe("Sin miembros");
  });
});

describe("audiencia del documento", () => {
  it("la audiencia une procesos y listas y respeta el nivel de acceso", () =>
    revertida(sql, async (tx) => {
      const [{ id: gth }] = await tx`SELECT id FROM procesos WHERE sigla = 'GTH'`;
      const dentro = await usuarioDePrueba(tx, { rol: "consulta", procesos: [gth] });
      const fuera = await usuarioDePrueba(tx, { rol: "consulta" });
      const doc = await documentoLibre(tx, { proceso: "GTH", tipo: "PR" });
      const admin = await sesionAdmin(tx);
      const { id: lista } = await crearLista(
        { nombre: nombre(), descripcion: null, miembros: [{ tipo: "usuario", referenciaId: fuera.usuarioId }] },
        admin.usuarioId,
        { sql: tx },
      );
      await guardarAudiencia(doc.id, { listaIds: [lista], lecturaObligatoriaIngreso: false }, admin.usuarioId, { sql: tx });
      const general = await audienciaDeDocumento(tx, doc.id);
      expect(general).toEqual(expect.arrayContaining([dentro.usuarioId, fuera.usuarioId]));
      expect(general).toEqual([...general].sort(porId));
      await tx`UPDATE documentos SET nivel_acceso = 'restringido' WHERE id = ${doc.id}`;
      const restringida = await audienciaDeDocumento(tx, doc.id);
      expect(restringida).toContain(dentro.usuarioId);
      expect(restringida).not.toContain(fuera.usuarioId); // la lista no abre lo restringido
    }));

  it("una lista desactivada y un inactivo no cuentan; un subproceso cuenta por su proceso", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const [{ id: gth }] = await tx`SELECT id FROM procesos WHERE sigla = 'GTH'`;
      const doc = await documentoLibre(tx, { proceso: "GTH", tipo: "PR" });
      const apagada = await usuarioDePrueba(tx, { rol: "consulta" });
      const inactivo = await usuarioDePrueba(tx, { rol: "consulta", procesos: [gth] });
      await tx`UPDATE usuarios SET activo = false WHERE id = ${inactivo.usuarioId}`;
      const { id: lista } = await crearLista(
        { nombre: nombre(), descripcion: null, miembros: [{ tipo: "usuario", referenciaId: apagada.usuarioId }] },
        admin.usuarioId,
        { sql: tx },
      );
      await guardarAudiencia(doc.id, { listaIds: [lista], lecturaObligatoriaIngreso: true }, admin.usuarioId, { sql: tx });
      expect(await audienciaDeDocumento(tx, doc.id)).toContain(apagada.usuarioId);
      await alternarLista(lista, false, admin.usuarioId, { sql: tx });
      const ids = await audienciaDeDocumento(tx, doc.id);
      expect(ids).not.toContain(apagada.usuarioId);
      expect(ids).not.toContain(inactivo.usuarioId);
      expect(await listasDeDocumento(tx, doc.id)).toEqual([{ id: lista, nombre: expect.any(String), activa: false }]);
      expect(await leerAudiencia(tx, doc.id)).toMatchObject({ lecturaObligatoriaIngreso: true });

      const [sub] = await tx`SELECT s.slug FROM subprocesos s WHERE s.proceso_id = ${gth} LIMIT 1`;
      if (sub) {
        const enSub = await documentoLibre(tx, { proceso: "GTH", tipo: "PR", subproceso: sub.slug });
        const miembro = await usuarioDePrueba(tx, { rol: "consulta", procesos: [gth] });
        expect(await audienciaDeDocumento(tx, enSub.id)).toContain(miembro.usuarioId);
      }
    }));

  it("guardarAudiencia reescribe, audita antes y después, y no audita si nada cambió", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const doc = await documentoLibre(tx, { proceso: "GTH", tipo: "PR" });
      const u = await usuarioDePrueba(tx, { rol: "consulta" });
      const miembros = [{ tipo: "usuario" as const, referenciaId: u.usuarioId }];
      const { id: l1 } = await crearLista({ nombre: nombre("1"), descripcion: null, miembros }, admin.usuarioId, { sql: tx });
      const { id: l2 } = await crearLista({ nombre: nombre("2"), descripcion: null, miembros }, admin.usuarioId, { sql: tx });
      await guardarAudiencia(doc.id, { listaIds: [l1], lecturaObligatoriaIngreso: false }, admin.usuarioId, { sql: tx });
      await guardarAudiencia(doc.id, { listaIds: [l1], lecturaObligatoriaIngreso: false }, admin.usuarioId, { sql: tx });
      await guardarAudiencia(doc.id, { listaIds: [l2, l1], lecturaObligatoriaIngreso: true }, admin.usuarioId, { sql: tx });
      expect((await listasDeDocumento(tx, doc.id)).map((l) => l.id)).toEqual([l1, l2]);
      const filas = await tx`SELECT detalle FROM auditoria WHERE accion = 'editar_documento' AND entidad_id = ${doc.id} ORDER BY id`;
      expect(filas).toHaveLength(2);
      expect(filas[1].detalle).toEqual({
        antes: { listas: [l1], lecturaObligatoriaIngreso: false },
        despues: { listas: [l1, l2], lecturaObligatoriaIngreso: true },
      });
      await expect(
        guardarAudiencia(doc.id, { listaIds: [2_000_000_000], lecturaObligatoriaIngreso: false }, admin.usuarioId, { sql: tx }),
      ).rejects.toThrow("La lista elegida no existe");
    }));
});
