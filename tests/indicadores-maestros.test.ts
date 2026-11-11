/**
 * Los maestros de indicadores (tipos, clasificaciones, unidades y objetivos) y sus cinco parámetros (Fase 14A, Tarea 5).
 * Contra la BD de desarrollo, dentro de una transacción que se revierte.
 */
import { existsSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import {
  activarEnMaestro,
  borrarDeMaestro,
  guardarEnMaestro,
  guardarParametros,
  listarMaestro,
  obtenerParametros,
  PARAMETROS_DEFECTO,
  type DatosMaestro,
} from "@/db/consultas/indicadores/maestros";
import { crearTipo, editarTipo } from "@/db/consultas/mapa-admin";
import { ErrorPermiso } from "@/lib/permisos";
import { ErrorIndicador } from "@/lib/indicadores/tipos";
import { indicadorDePrueba } from "./utiles/indicadores";
import { sesionAdmin, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

const nombres = (filas: { nombre: string }[]) => filas.map((f) => f.nombre);

describe("maestros de indicadores", () => {
  it("los tres maestros nacen sembrados", () =>
    revertida(sql, async (tx) => {
      const tipos = await listarMaestro("tipos", { sql: tx });
      expect(nombres(tipos)).toEqual(["Eficacia", "Eficiencia", "Efectividad"]);
      const clasificaciones = await listarMaestro("clasificaciones", { sql: tx });
      expect(clasificaciones.map((c) => [c.nombre, c.aprueba, c.exigeNorma])).toEqual([
        ["Estratégico", "gerencia", false],
        ["Operativo", "lider", false],
        ["Regulatorio", "gerencia", true],
      ]);
      expect((await listarMaestro("unidades", { sql: tx })).length).toBe(7);
    }));

  it("crear, editar, desactivar; nombre repetido sin distinguir mayúsculas", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const { id } = await guardarEnMaestro(admin, "tipos", { nombre: "ZZ Tipo nuevo" }, { sql: tx });
      expect((await listarMaestro("tipos", { sql: tx })).at(-1)).toMatchObject({ id, nombre: "ZZ Tipo nuevo", activo: true });

      await guardarEnMaestro(admin, "tipos", { id, nombre: "ZZ Tipo renombrado" }, { sql: tx });
      expect((await listarMaestro("tipos", { sql: tx })).at(-1)?.nombre).toBe("ZZ Tipo renombrado");

      await expect(guardarEnMaestro(admin, "tipos", { nombre: "eficacia" }, { sql: tx })).rejects.toThrow(
        new ErrorIndicador("Ya existe «Eficacia»"),
      );
      await expect(guardarEnMaestro(admin, "tipos", { id, nombre: "EFICIENCIA" }, { sql: tx })).rejects.toBeInstanceOf(ErrorIndicador);

      await activarEnMaestro(admin, "tipos", id, false, { sql: tx });
      expect(nombres(await listarMaestro("tipos", { sql: tx, soloActivos: true }))).not.toContain("ZZ Tipo renombrado");
      expect(nombres(await listarMaestro("tipos", { sql: tx }))).toContain("ZZ Tipo renombrado");
      await activarEnMaestro(admin, "tipos", id, true, { sql: tx });
      expect(nombres(await listarMaestro("tipos", { sql: tx, soloActivos: true }))).toContain("ZZ Tipo renombrado");

      const auditoria = await tx`SELECT accion FROM auditoria WHERE entidad = 'tipos_indicador' AND entidad_id = ${id} ORDER BY id`;
      expect(auditoria.map((f) => f.accion)).toEqual([
        "indicador_maestro_guardado",
        "indicador_maestro_guardado",
        "indicador_maestro_activado",
        "indicador_maestro_activado",
      ]);
    }));

  it("una clasificación dice quién aprueba y si exige norma; una unidad, su sufijo y sus decimales", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const c = await guardarEnMaestro(admin, "clasificaciones", { nombre: "ZZ Clase", aprueba: "lider", exigeNorma: true }, { sql: tx });
      expect((await listarMaestro("clasificaciones", { sql: tx })).find((f) => f.id === c.id)).toMatchObject({
        aprueba: "lider",
        exigeNorma: true,
      });
      await expect(
        guardarEnMaestro(admin, "clasificaciones", { nombre: "ZZ Mala", aprueba: "otro", exigeNorma: false } as unknown as DatosMaestro, { sql: tx }),
      ).rejects.toBeInstanceOf(ErrorIndicador);

      const u = await guardarEnMaestro(admin, "unidades", { nombre: "ZZ Minutos", sufijo: " min", decimales: 1 }, { sql: tx });
      expect((await listarMaestro("unidades", { sql: tx })).find((f) => f.id === u.id)).toMatchObject({ sufijo: " min", decimales: 1 });
      await expect(
        guardarEnMaestro(admin, "unidades", { nombre: "ZZ Mala", sufijo: "", decimales: 5 }, { sql: tx }),
      ).rejects.toBeInstanceOf(ErrorIndicador);
    }));

  it("un objetivo es de calidad o institucional", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const { id } = await guardarEnMaestro(admin, "objetivos", { clase: "calidad", enunciado: "Mejorar la satisfacción del usuario" }, { sql: tx });
      expect((await listarMaestro("objetivos", { sql: tx })).find((f) => f.id === id)).toMatchObject({
        clase: "calidad",
        enunciado: "Mejorar la satisfacción del usuario",
      });
      await expect(
        guardarEnMaestro(admin, "objetivos", { clase: "otra", enunciado: "Algo" } as unknown as DatosMaestro, { sql: tx }),
      ).rejects.toBeInstanceOf(ErrorIndicador);
      await expect(guardarEnMaestro(admin, "objetivos", { clase: "calidad", enunciado: "" }, { sql: tx })).rejects.toBeInstanceOf(ErrorIndicador);
    }));

  it("borrar solo si ninguna ficha lo usa", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      await indicadorDePrueba(tx);
      const [eficacia] = (await listarMaestro("tipos", { sql: tx })).filter((t) => t.nombre === "Eficacia");
      await expect(borrarDeMaestro(admin, "tipos", eficacia.id, { sql: tx })).rejects.toThrow(
        new ErrorIndicador("No se puede borrar: lo usa algún indicador. Desactívelo."),
      );
      const { id } = await guardarEnMaestro(admin, "tipos", { nombre: "ZZ Sin uso" }, { sql: tx });
      await borrarDeMaestro(admin, "tipos", id, { sql: tx });
      expect(nombres(await listarMaestro("tipos", { sql: tx }))).not.toContain("ZZ Sin uso");
      const [aud] = await tx`SELECT accion FROM auditoria WHERE entidad = 'tipos_indicador' AND entidad_id = ${id} ORDER BY id DESC LIMIT 1`;
      expect(aud.accion).toBe("indicador_maestro_borrado");
    }));

  it("solo administra quien tiene indicadores.administrar", () =>
    revertida(sql, async (tx) => {
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso" });
      await expect(guardarEnMaestro(lider, "tipos", { nombre: "ZZ No" }, { sql: tx })).rejects.toBeInstanceOf(ErrorPermiso);
      await expect(activarEnMaestro(lider, "tipos", 1, false, { sql: tx })).rejects.toBeInstanceOf(ErrorPermiso);
      await expect(borrarDeMaestro(lider, "tipos", 1, { sql: tx })).rejects.toBeInstanceOf(ErrorPermiso);
      await expect(guardarParametros(lider, PARAMETROS_DEFECTO, { sql: tx })).rejects.toBeInstanceOf(ErrorPermiso);
    }));
});

describe("parámetros de indicadores", () => {
  it("valores de omisión, rangos y valor inválido en la base", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      expect(await obtenerParametros({ sql: tx })).toEqual({
        umbralAtencionPct: 70,
        avisoPrevioDias: 3,
        plazoReporteDias: 10,
        incumplimientoPeriodos: 3,
        variacionConfirmarPct: 30,
      });

      await guardarParametros(admin, { umbralAtencionPct: 80, avisoPrevioDias: 0, plazoReporteDias: 90, incumplimientoPeriodos: 12, variacionConfirmarPct: 500 }, { sql: tx });
      expect(await obtenerParametros({ sql: tx })).toEqual({
        umbralAtencionPct: 80,
        avisoPrevioDias: 0,
        plazoReporteDias: 90,
        incumplimientoPeriodos: 12,
        variacionConfirmarPct: 500,
      });
      const [aud] = await tx`SELECT detalle FROM auditoria WHERE accion = 'indicador_parametros_guardados' ORDER BY id DESC LIMIT 1`;
      expect(aud.detalle.cambios.ind_umbral_atencion_pct).toEqual({ antes: "70", despues: "80" });

      for (const malo of [
        { umbralAtencionPct: 100 },
        { umbralAtencionPct: 0 },
        { avisoPrevioDias: 31 },
        { plazoReporteDias: 91 },
        { incumplimientoPeriodos: 1 },
        { incumplimientoPeriodos: 13 },
        { variacionConfirmarPct: 4 },
        { variacionConfirmarPct: 501 },
        { umbralAtencionPct: 70.5 },
      ]) {
        await expect(guardarParametros(admin, { ...PARAMETROS_DEFECTO, ...malo }, { sql: tx })).rejects.toBeInstanceOf(ErrorIndicador);
      }

      await tx`UPDATE configuracion SET valor = 'abc' WHERE clave = 'ind_umbral_atencion_pct'`;
      await tx`UPDATE configuracion SET valor = '999' WHERE clave = 'ind_plazo_reporte_dias'`;
      expect(await obtenerParametros({ sql: tx })).toMatchObject({ umbralAtencionPct: 70, plazoReporteDias: 10 });
    }));
});

describe("sigla reservada", () => {
  it("la sigla IND no se puede usar en un tipo de documento", async () => {
    const [{ id: usuarioId }] = await sql`SELECT id FROM usuarios WHERE rol = 'admin_sgc' LIMIT 1`;
    const base = { nombre: "ZZ Tipo IND", esDiligenciable: false, autoridad: "operativo" as const, plantillaDocumentoId: null, mesesRevision: 12 };
    const mensaje = "La sigla IND está reservada para los indicadores";
    await expect(crearTipo({ ...base, sigla: "IND" }, Number(usuarioId))).rejects.toThrow(mensaje);
    await expect(crearTipo({ ...base, sigla: "ind" }, Number(usuarioId))).rejects.toThrow(mensaje);
    const [tipo] = await sql`SELECT id, nombre, sigla, es_diligenciable, autoridad, plantilla_documento_id, meses_revision FROM tipos_documento LIMIT 1`;
    const datos = {
      nombre: tipo.nombre, esDiligenciable: tipo.es_diligenciable, autoridad: tipo.autoridad,
      plantillaDocumentoId: tipo.plantilla_documento_id === null ? null : Number(tipo.plantilla_documento_id),
      mesesRevision: tipo.meses_revision,
    };
    await expect(editarTipo(Number(tipo.id), { ...datos, sigla: "IND" }, Number(usuarioId))).rejects.toThrow(mensaje);
    await expect(editarTipo(Number(tipo.id), { ...datos, sigla: "Ind" }, Number(usuarioId))).rejects.toThrow(mensaje);
  });
});
