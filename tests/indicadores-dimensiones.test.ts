/**
 * El maestro de dimensiones y sus categorías (Fase 14C, Tarea 5; anexo 14C, §5.1): crear, renombrar, ordenar, activar,
 * desactivar y borrar; lo que ya se usó no se borra; una dimensión de una ficha vigente no se queda sin categorías activas.
 * Contra la BD de desarrollo, dentro de una transacción que se revierte.
 */
import { existsSync } from "node:fs";
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import {
  borrarCategoria,
  borrarDimension,
  cambiarEstadoDeCategoria,
  cambiarEstadoDeDimension,
  guardarCategoria,
  guardarDimension,
  listarDimensiones,
  maestroDeCategorias,
  moverCategoria,
} from "@/db/consultas/indicadores/dimensiones";
import { ErrorIndicador } from "@/lib/indicadores/tipos";
import { ErrorPermiso } from "@/lib/permisos";
import { datoDePrueba, dimensionDePrueba, indicadorDePrueba } from "./utiles/indicadores";
import { sesionAdmin, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

const DIMENSION_REPETIDA = "Ya hay una dimensión con ese nombre";
const CATEGORIA_REPETIDA = "Ya hay una categoría con ese nombre en esta dimensión";
const YA_SE_USO = "Ya se usó: desactívela";
const SIN_CATEGORIAS = "Esta dimensión la usa una ficha vigente: no puede quedar sin categorías activas";

let consecutivo = 0;
const unico = () => `${Date.now() % 100_000_000}${++consecutivo}`;

async function categoriasDe(tx: TransactionSql, dimensionId: number): Promise<string[]> {
  return (await listarDimensiones({ sql: tx })).find((d) => d.id === dimensionId)!.categorias.map((c) => c.nombre);
}

/** Un indicador activo cuya última versión aprobada cita la dimensión (una aprobada ya no admite cambios: se cita en borrador). */
async function fichaQueCita(tx: TransactionSql, dimensionId: number, nombreDimension: string) {
  const ind = await indicadorDePrueba(tx, { estado: "borrador" });
  await tx`UPDATE indicador_versiones SET dimension_id = ${dimensionId}, dimension_nombre = ${nombreDimension} WHERE id = ${ind.versionId}`;
  const aprobadora = await usuarioDePrueba(tx, { rol: "gerencia" });
  await tx`UPDATE indicador_versiones SET estado = 'aprobada', elaborada_por = aprobada_por_borrador.u, elaborada_en = now(),
      huella = ${"0".repeat(64)}, rige_desde = '2026-01', aprobada_por = ${aprobadora.usuarioId}, aprobada_en = now()
    FROM (SELECT creado_por AS u FROM indicadores WHERE id = ${ind.id}) aprobada_por_borrador WHERE id = ${ind.versionId}`;
  await tx`UPDATE indicadores SET estado = 'activo' WHERE id = ${ind.id}`;
  return ind;
}

describe("crear y ordenar", () => {
  it("las categorías salen en el orden de creación; los nombres son únicos sin distinguir mayúsculas", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const nombre = `ZZ Sede ${unico()}`;
      const { id } = await guardarDimension(admin, { nombre }, { sql: tx });
      for (const c of ["Norte", "Sur", "Centro", "Oriente"]) await guardarCategoria(admin, { dimensionId: id, nombre: c }, { sql: tx });
      expect(await categoriasDe(tx, id)).toEqual(["Norte", "Sur", "Centro", "Oriente"]);

      await expect(guardarDimension(admin, { nombre: nombre.toUpperCase() }, { sql: tx })).rejects.toThrow(DIMENSION_REPETIDA);
      await expect(guardarCategoria(admin, { dimensionId: id, nombre: "norte" }, { sql: tx })).rejects.toThrow(CATEGORIA_REPETIDA);
      // El mismo nombre en otra dimensión sí vale.
      const otra = await guardarDimension(admin, { nombre: `ZZ Servicio ${unico()}` }, { sql: tx });
      await guardarCategoria(admin, { dimensionId: otra.id, nombre: "Norte" }, { sql: tx });
    }));

  it("renombrar conserva el lugar y no choca consigo misma", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const { id } = await guardarDimension(admin, { nombre: `ZZ Sede ${unico()}` }, { sql: tx });
      const norte = await guardarCategoria(admin, { dimensionId: id, nombre: "Norte" }, { sql: tx });
      await guardarCategoria(admin, { dimensionId: id, nombre: "Sur" }, { sql: tx });
      await guardarCategoria(admin, { id: norte.id, dimensionId: id, nombre: "NORTE" }, { sql: tx });
      expect(await categoriasDe(tx, id)).toEqual(["NORTE", "Sur"]);
      await expect(guardarCategoria(admin, { id: norte.id, dimensionId: id, nombre: "sur" }, { sql: tx })).rejects.toThrow(CATEGORIA_REPETIDA);
      await expect(guardarCategoria(admin, { dimensionId: id, nombre: "x" }, { sql: tx })).rejects.toBeInstanceOf(ErrorIndicador);
    }));

  it("subir la tercera la deja segunda; subir la primera no cambia nada", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const { id, categorias } = await dimensionDePrueba(tx, `ZZ Sede ${unico()}`, ["A1", "B2", "C3", "D4"]);
      await moverCategoria(admin, { id: categorias[2], sentido: "arriba" }, { sql: tx });
      expect(await categoriasDe(tx, id)).toEqual(["A1", "C3", "B2", "D4"]);
      await moverCategoria(admin, { id: categorias[0], sentido: "arriba" }, { sql: tx });
      expect(await categoriasDe(tx, id)).toEqual(["A1", "C3", "B2", "D4"]);
      await moverCategoria(admin, { id: categorias[3], sentido: "abajo" }, { sql: tx });
      expect(await categoriasDe(tx, id)).toEqual(["A1", "C3", "B2", "D4"]);
      await moverCategoria(admin, { id: categorias[0], sentido: "abajo" }, { sql: tx });
      expect(await categoriasDe(tx, id)).toEqual(["C3", "A1", "B2", "D4"]);
    }));
});

describe("activar y desactivar", () => {
  it("desactivar una categoría pone desactivada_en y activarla lo quita; la dimensión también se desactiva", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const { id, categorias } = await dimensionDePrueba(tx, `ZZ Sede ${unico()}`, ["Norte", "Sur"]);
      const ahora = new Date("2026-11-10T15:00:00Z");
      await cambiarEstadoDeCategoria(admin, { id: categorias[0], activo: false }, { sql: tx, ahora });
      let maestro = await maestroDeCategorias(tx, id);
      expect(maestro[0]).toMatchObject({ nombre: "Norte", activo: false, desactivadaEn: ahora });
      expect(maestro[1]).toMatchObject({ nombre: "Sur", activo: true, desactivadaEn: null });
      expect((await listarDimensiones({ sql: tx, soloActivas: true })).find((d) => d.id === id)!.categorias.map((c) => c.nombre)).toEqual(["Sur"]);

      await cambiarEstadoDeCategoria(admin, { id: categorias[0], activo: true }, { sql: tx });
      maestro = await maestroDeCategorias(tx, id);
      expect(maestro[0]).toMatchObject({ activo: true, desactivadaEn: null });

      await cambiarEstadoDeDimension(admin, { id, activo: false }, { sql: tx });
      expect((await listarDimensiones({ sql: tx })).find((d) => d.id === id)!.activo).toBe(false);
      expect((await listarDimensiones({ sql: tx, soloActivas: true })).some((d) => d.id === id)).toBe(false);
      await cambiarEstadoDeDimension(admin, { id, activo: true }, { sql: tx });
      expect((await listarDimensiones({ sql: tx })).find((d) => d.id === id)!.activo).toBe(true);
    }));

  it("la última categoría activa de una dimensión que usa una ficha vigente no se desactiva ni se borra", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const nombre = `ZZ Sede ${unico()}`;
      const { id, categorias } = await dimensionDePrueba(tx, nombre, ["Norte", "Sur"]);
      await cambiarEstadoDeCategoria(admin, { id: categorias[0], activo: false }, { sql: tx });
      // Sin ficha que la use, la última sí se puede desactivar.
      await cambiarEstadoDeCategoria(admin, { id: categorias[1], activo: false }, { sql: tx });
      await cambiarEstadoDeCategoria(admin, { id: categorias[1], activo: true }, { sql: tx });

      await fichaQueCita(tx, id, nombre);
      await expect(cambiarEstadoDeCategoria(admin, { id: categorias[1], activo: false }, { sql: tx })).rejects.toThrow(SIN_CATEGORIAS);
      await expect(borrarCategoria(admin, categorias[1], { sql: tx })).rejects.toThrow(SIN_CATEGORIAS);
      // Con otra activa, sí.
      await cambiarEstadoDeCategoria(admin, { id: categorias[0], activo: true }, { sql: tx });
      await cambiarEstadoDeCategoria(admin, { id: categorias[1], activo: false }, { sql: tx });
    }));
});

describe("borrar", () => {
  it("una categoría que aparece en mediciones.categorias, en variable_valores.categorias o en un valor no se borra", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const { categorias } = await dimensionDePrueba(tx, `ZZ Sede ${unico()}`, ["Norte", "Sur", "Centro"]);
      const ind = await indicadorDePrueba(tx);
      const [m] = await tx`INSERT INTO mediciones (indicador_id, version_id, periodo, desde, hasta, vence_en)
        VALUES (${ind.id}, ${ind.versionId}, '2026-01', '2026-01-01', '2026-01-31', '2026-02-10') RETURNING id`;
      const medicionId = Number(m.id);
      await tx`UPDATE mediciones SET categorias = ${tx.json([{ id: categorias[0], nombre: "Norte", orden: 1, noAplica: false }])} WHERE id = ${medicionId}`;
      await expect(borrarCategoria(admin, categorias[0], { sql: tx })).rejects.toThrow(YA_SE_USO);
      expect((await listarDimensiones({ sql: tx })).flatMap((d) => d.categorias).find((c) => c.id === categorias[0])!.usada).toBe(true);
      expect((await listarDimensiones({ sql: tx })).flatMap((d) => d.categorias).find((c) => c.id === categorias[2])!.usada).toBe(false);

      const datoId = await datoDePrueba(tx, { procesoId: ind.procesoId });
      await tx`INSERT INTO variable_valores (variable_id, periodo, desde, hasta, vence_en, categorias)
        VALUES (${datoId}, '2026-01', '2026-01-01', '2026-01-31', '2026-02-10',
          ${tx.json([{ id: categorias[1], nombre: "Sur", orden: 2, noAplica: false }])})`;
      await expect(borrarCategoria(admin, categorias[1], { sql: tx })).rejects.toThrow(YA_SE_USO);
      await borrarCategoria(admin, categorias[2], { sql: tx });
      expect((await tx`SELECT 1 FROM dimension_categorias WHERE id = ${categorias[2]}`).length).toBe(0);
    }));

  it("una dimensión sin uso se borra con sus categorías; una citada por una ficha no", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const libre = await dimensionDePrueba(tx, `ZZ Libre ${unico()}`, ["Uno", "Dos"]);
      await borrarDimension(admin, libre.id, { sql: tx });
      expect((await tx`SELECT 1 FROM dimensiones WHERE id = ${libre.id}`).length).toBe(0);
      expect((await tx`SELECT 1 FROM dimension_categorias WHERE dimension_id = ${libre.id}`).length).toBe(0);

      const nombre = `ZZ Citada ${unico()}`;
      const citada = await dimensionDePrueba(tx, nombre, ["Uno"]);
      await fichaQueCita(tx, citada.id, nombre);
      expect((await listarDimensiones({ sql: tx })).find((d) => d.id === citada.id)!.usada).toBe(true);
      await expect(borrarDimension(admin, citada.id, { sql: tx })).rejects.toThrow(YA_SE_USO);
    }));
});

describe("permiso y bitácora", () => {
  it("sin indicadores.administrar, todas lanzan", () =>
    revertida(sql, async (tx) => {
      const gerencia = await usuarioDePrueba(tx, { rol: "gerencia" });
      const { id, categorias } = await dimensionDePrueba(tx, `ZZ Sede ${unico()}`, ["Norte", "Sur"]);
      const o = { sql: tx };
      const todas = [
        guardarDimension(gerencia, { nombre: "Otra dimensión" }, o),
        guardarCategoria(gerencia, { dimensionId: id, nombre: "Otra" }, o),
        moverCategoria(gerencia, { id: categorias[1], sentido: "arriba" }, o),
        cambiarEstadoDeDimension(gerencia, { id, activo: false }, o),
        cambiarEstadoDeCategoria(gerencia, { id: categorias[0], activo: false }, o),
        borrarCategoria(gerencia, categorias[0], o),
        borrarDimension(gerencia, id, o),
      ];
      for (const r of await Promise.allSettled(todas)) {
        expect(r.status).toBe("rejected");
        expect((r as PromiseRejectedResult).reason).toBeInstanceOf(ErrorPermiso);
      }
    }));

  it("cada acción deja su entrada con el nombre", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const o = { sql: tx };
      const dim = await guardarDimension(admin, { nombre: `ZZ Sede ${unico()}` }, o);
      await guardarDimension(admin, { id: dim.id, nombre: `ZZ Sede B ${unico()}` }, o);
      const a = await guardarCategoria(admin, { dimensionId: dim.id, nombre: "Norte" }, o);
      const b = await guardarCategoria(admin, { dimensionId: dim.id, nombre: "Sur" }, o);
      await moverCategoria(admin, { id: b.id, sentido: "arriba" }, o);
      await cambiarEstadoDeCategoria(admin, { id: a.id, activo: false }, o);
      await cambiarEstadoDeCategoria(admin, { id: a.id, activo: true }, o);
      await cambiarEstadoDeDimension(admin, { id: dim.id, activo: false }, o);
      await cambiarEstadoDeDimension(admin, { id: dim.id, activo: true }, o);
      await borrarCategoria(admin, a.id, o);
      await borrarDimension(admin, dim.id, o);

      const filas = await tx`SELECT accion, entidad, detalle FROM auditoria
        WHERE usuario_id = ${admin.usuarioId} AND entidad IN ('dimension', 'dimension_categoria') ORDER BY id`;
      expect(filas.map((f) => f.accion)).toEqual([
        "dimension_guardada",
        "dimension_guardada",
        "categoria_guardada",
        "categoria_guardada",
        "categoria_movida",
        "categoria_desactivada",
        "categoria_activada",
        "dimension_desactivada",
        "dimension_activada",
        "categoria_borrada",
        "dimension_borrada",
      ]);
      expect(filas[0].detalle).toMatchObject({ creada: true });
      expect(filas[1].detalle).toMatchObject({ creada: false });
      expect(filas[2].detalle).toMatchObject({ nombre: "Norte", creada: true });
      expect(filas[4].detalle).toMatchObject({ nombre: "Sur", sentido: "arriba" });
      expect(filas[10].detalle).toMatchObject({ categorias: 1 });
    }));
});
