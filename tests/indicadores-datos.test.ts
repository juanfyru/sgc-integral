/**
 * El catálogo de datos compartidos (Fase 14C, Tarea 4; anexo 14C, §4.1, §4.4 y §4.7): crearlo y editarlo, lo que se
 * congela cuando una ficha aprobada lo cita, sus responsables, activarlo, desactivarlo y borrarlo; quién lo ve y quién lo
 * reporta. Contra la BD de desarrollo, dentro de una transacción que se revierte: ninguna ficha aprobada queda confirmada.
 */
import { existsSync } from "node:fs";
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import {
  borrarDato,
  cambiarEstadoDeDato,
  datoPorId,
  datosParaFicha,
  designarResponsablesDeDato,
  guardarDato,
  listarDatos,
} from "@/db/consultas/indicadores/datos";
import { puedeReportarDato, puedeVerDato, responsablesDeDato, type SujetoVisibilidad } from "@/lib/alcance";
import { EsquemaResponsablesDeDato } from "@/lib/esquemas/indicadores-datos";
import { periodoDe } from "@/lib/indicadores-documentales/periodo";
import { ErrorIndicador } from "@/lib/indicadores/tipos";
import { ErrorPermiso } from "@/lib/permisos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { datoDePrueba, indicadorDePrueba, versionTrimestral } from "./utiles/indicadores";
import { sesionAdmin, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

const NOMBRE_REPETIDO = "Ya hay un dato con ese nombre en ese proceso";
const YA_LO_CITA =
  "Este dato ya lo cita una ficha aprobada: su periodicidad, cómo se junta y su dimensión no se pueden cambiar. Cree otro dato";
const EN_USO = "Lo usa un indicador activo: cambie antes su ficha";
const CON_HISTORIA = "Este dato ya tiene historia: desactívelo";
const DIMENSION_INACTIVA = "Elija una dimensión activa";

let consecutivo = 0;
const unico = () => `${Date.now() % 100_000_000}${++consecutivo}`;

/** Un proceso que solo existe en la transacción: sin líderes, salvo los que la prueba le asigne. */
async function procesoNuevo(tx: TransactionSql): Promise<number> {
  const sigla = `Z${unico()}`;
  const [macro] = await tx`SELECT id FROM macroprocesos ORDER BY id LIMIT 1`;
  const [p] = await tx`INSERT INTO procesos (macroproceso_id, nombre, sigla, slug, icono, orden)
    VALUES (${macro.id}, ${`Proceso ${sigla}`}, ${sigla}, ${sigla.toLowerCase()}, 'circle', 99) RETURNING id`;
  return Number(p.id);
}

async function dimensionNueva(tx: TransactionSql, activo = true): Promise<number> {
  const [d] = await tx`INSERT INTO dimensiones (nombre, orden, activo) VALUES (${`ZZ Dimensión ${unico()}`}, 99, ${activo}) RETURNING id`;
  return Number(d.id);
}

type Dato = Parameters<typeof guardarDato>[1];

const base = (procesoId: number, cambios: Partial<Dato> = {}): Dato => ({
  procesoId,
  nombre: "Total facturado",
  periodicidad: "mensual",
  consolidacion: "suma",
  admiteNegativos: false,
  plazoReporteDias: 10,
  ...cambios,
});

const ids = (lista: { id: number }[]) => lista.map((x) => x.id);

describe("guardar un dato del catálogo", () => {
  it("solo quien administra; con el plazo dado; el nombre es único en su proceso sin distinguir mayúsculas", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const gerencia = await usuarioDePrueba(tx, { rol: "gerencia" });
      const p1 = await procesoNuevo(tx);
      const p2 = await procesoNuevo(tx);
      await expect(guardarDato(gerencia, base(p1), { sql: tx })).rejects.toBeInstanceOf(ErrorPermiso);

      const { id } = await guardarDato(
        admin,
        base(p1, { plazoReporteDias: 15, fuente: "Sistema de facturación", unidad: "pesos", capturaMin: "0", descripcion: "Sin notas crédito" }),
        { sql: tx },
      );
      const [proceso] = await tx`SELECT nombre FROM procesos WHERE id = ${p1}`;
      expect(await datoPorId(admin, id, { sql: tx })).toEqual({
        id,
        procesoId: p1,
        proceso: proceso.nombre,
        nombre: "Total facturado",
        descripcion: "Sin notas crédito",
        fuente: "Sistema de facturación",
        unidad: "pesos",
        periodicidad: "mensual",
        consolidacion: "suma",
        capturaMin: "0",
        capturaMax: null,
        admiteNegativos: false,
        plazoReporteDias: 15,
        dimensionId: null,
        dimension: null,
        activa: true,
        citado: false,
        responsables: [],
      });
      const [fila] = await tx`SELECT creado_por FROM variables_compartidas WHERE id = ${id}`;
      expect(Number(fila.creado_por)).toBe(admin.usuarioId);

      await expect(guardarDato(admin, base(p1, { nombre: "TOTAL FACTURADO" }), { sql: tx })).rejects.toThrow(
        new ErrorIndicador(NOMBRE_REPETIDO),
      );
      const { id: enOtro } = await guardarDato(admin, base(p2, { nombre: "TOTAL FACTURADO" }), { sql: tx });
      expect(enOtro).not.toBe(id);
      // Renombrar a uno que ya existe en el proceso tampoco; conservar su propio nombre, sí.
      const { id: recaudado } = await guardarDato(admin, base(p1, { nombre: "Total recaudado" }), { sql: tx });
      await expect(guardarDato(admin, { ...base(p1, { nombre: "total facturado" }), id: recaudado }, { sql: tx })).rejects.toThrow(
        new ErrorIndicador(NOMBRE_REPETIDO),
      );
      await guardarDato(admin, { ...base(p1, { nombre: "TOTAL RECAUDADO" }), id: recaudado }, { sql: tx });

      const bitacora = await tx`SELECT accion, usuario_id, detalle FROM auditoria WHERE entidad = 'dato_compartido' AND entidad_id = ${id}`;
      expect(bitacora.map((f) => f.accion)).toEqual(["dato_compartido_guardado"]);
      expect(Number(bitacora[0].usuario_id)).toBe(admin.usuarioId);
      expect(bitacora[0].detalle).toMatchObject({ nombre: "Total facturado", proceso: proceso.nombre, creado: true, antes: null });
    }));

  it("los límites de captura y el proceso", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const p = await procesoNuevo(tx);
      await expect(guardarDato(admin, base(p, { capturaMin: "10", capturaMax: "5" }), { sql: tx })).rejects.toThrow(
        new ErrorIndicador("El mínimo de captura no puede pasar del máximo"),
      );
      await expect(guardarDato(admin, base(p, { plazoReporteDias: 91 }), { sql: tx })).rejects.toThrow(
        new ErrorIndicador("El plazo de reporte debe estar entre 0 y 90"),
      );
      const { id } = await guardarDato(admin, base(p), { sql: tx });
      await tx`UPDATE procesos SET activo = false WHERE id = ${p}`;
      // El proceso que ya tenía sigue valiendo; uno nuevo debe estar activo.
      await guardarDato(admin, { ...base(p, { fuente: "Cartera" }), id }, { sql: tx });
      await expect(guardarDato(admin, base(p, { nombre: "Otro" }), { sql: tx })).rejects.toThrow(
        new ErrorIndicador("El proceso no existe o está inactivo"),
      );
      await expect(guardarDato(admin, { ...base(p), id: 999_999_999 }, { sql: tx })).rejects.toThrow(new ErrorIndicador("El dato no existe"));
    }));

  it("una ficha aprobada que lo cita congela su periodicidad, cómo se junta y su dimensión; un borrador no", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const p = await procesoNuevo(tx);
      const dim1 = await dimensionNueva(tx);
      const dim2 = await dimensionNueva(tx);
      const { id } = await guardarDato(admin, base(p, { dimensionId: dim1 }), { sql: tx });

      // Con solo un borrador que lo cita, todo se puede cambiar.
      await indicadorDePrueba(tx, { procesoId: p, estado: "borrador", variables: { A: { datoId: id } } });
      const actual = base(p, { periodicidad: "trimestral", consolidacion: "promedio", dimensionId: dim2 });
      await guardarDato(admin, { ...actual, id }, { sql: tx });
      expect(await datoPorId(admin, id, { sql: tx })).toMatchObject({
        periodicidad: "trimestral",
        consolidacion: "promedio",
        dimensionId: dim2,
        citado: false,
      });

      await indicadorDePrueba(tx, { procesoId: p, variables: { A: { datoId: id } } });
      expect((await datoPorId(admin, id, { sql: tx }))?.citado).toBe(true);
      const congelados: Partial<Dato>[] = [{ periodicidad: "mensual" }, { consolidacion: "suma" }, { dimensionId: dim1 }, { dimensionId: undefined }];
      for (const cambio of congelados) {
        await expect(guardarDato(admin, { ...actual, ...cambio, id }, { sql: tx })).rejects.toThrow(new ErrorIndicador(YA_LO_CITA));
      }
      // Lo demás se edita siempre, también con la dimensión desactivada después.
      await tx`UPDATE dimensiones SET activo = false WHERE id = ${dim2}`;
      await guardarDato(
        admin,
        { ...actual, id, nombre: "Total facturado neto", fuente: "Cartera", capturaMin: "0", capturaMax: "1000000", plazoReporteDias: 20 },
        { sql: tx },
      );
      const [dimension] = await tx`SELECT nombre FROM dimensiones WHERE id = ${dim2}`;
      expect(await datoPorId(admin, id, { sql: tx })).toMatchObject({
        nombre: "Total facturado neto",
        fuente: "Cartera",
        capturaMin: "0",
        capturaMax: "1000000",
        plazoReporteDias: 20,
        periodicidad: "trimestral",
        consolidacion: "promedio",
        dimensionId: dim2,
        dimension: dimension.nombre,
        citado: true,
      });
      const [edicion] = await tx`SELECT detalle FROM auditoria
        WHERE entidad = 'dato_compartido' AND entidad_id = ${id} AND accion = 'dato_compartido_guardado' ORDER BY id DESC LIMIT 1`;
      expect(edicion.detalle).toMatchObject({
        creado: false,
        antes: { nombre: "Total facturado", plazoReporteDias: 10, capturaMax: null },
        despues: { nombre: "Total facturado neto", plazoReporteDias: 20, capturaMax: "1000000" },
      });
    }));

  it("una dimensión nueva o cambiada debe estar activa", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const p = await procesoNuevo(tx);
      const inactiva = await dimensionNueva(tx, false);
      await expect(guardarDato(admin, base(p, { dimensionId: inactiva }), { sql: tx })).rejects.toThrow(new ErrorIndicador(DIMENSION_INACTIVA));
      await expect(guardarDato(admin, base(p, { dimensionId: 999_999_999 }), { sql: tx })).rejects.toThrow(
        new ErrorIndicador(DIMENSION_INACTIVA),
      );
      const { id } = await guardarDato(admin, base(p), { sql: tx });
      await expect(guardarDato(admin, { ...base(p, { dimensionId: inactiva }), id }, { sql: tx })).rejects.toThrow(
        new ErrorIndicador(DIMENSION_INACTIVA),
      );
    }));
});

describe("activar y desactivar un dato", () => {
  it("no se desactiva si lo cita la ficha vigente de un indicador activo", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const p = await procesoNuevo(tx);
      const dato = await datoDePrueba(tx, { procesoId: p });
      const ind = await indicadorDePrueba(tx, { procesoId: p, variables: { A: { datoId: dato } } });
      await expect(cambiarEstadoDeDato(admin, { datoId: dato, activa: false }, { sql: tx })).rejects.toThrow(new ErrorIndicador(EN_USO));

      // Retirado, ya no lo usa.
      await tx`UPDATE indicadores SET estado = 'retirado', baja_por = ${admin.usuarioId}, baja_en = now(), baja_motivo = 'Prueba de retiro'
        WHERE id = ${ind.id}`;
      await cambiarEstadoDeDato(admin, { datoId: dato, activa: false }, { sql: tx });
      expect((await datoPorId(admin, dato, { sql: tx }))?.activa).toBe(false);
    }));

  it("ni si rige una medición sin cerrar con una versión que lo cita, aunque la vigente ya no lo cite", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const p = await procesoNuevo(tx);
      const dato = await datoDePrueba(tx, { procesoId: p });
      const ind = await indicadorDePrueba(tx, { procesoId: p, variables: { A: { datoId: dato } }, aprobadaEn: new Date("2026-01-02T15:00:00Z") });
      await versionTrimestral(tx, { indicadorId: ind.id, usuarioId: admin.usuarioId, rigeDesde: "2026-T3", aprobadaEn: new Date("2026-06-15T15:00:00Z") });
      const zona = zonaHoraria();
      const medicion = async (periodo: string, historica: boolean) => {
        const pe = periodoDe(periodo, zona)!;
        const [m] = await tx`INSERT INTO mediciones (indicador_id, version_id, periodo, desde, hasta, vence_en, historica)
          VALUES (${ind.id}, ${ind.versionId}, ${periodo}, ${pe.desde}, ${pe.hasta}, ${pe.hasta}, ${historica}) RETURNING id`;
        return Number(m.id);
      };
      // Un histórico se digita completo: no usa el dato.
      await medicion("2025-12", true);
      const mayo = await medicion("2026-05", false);
      await expect(cambiarEstadoDeDato(admin, { datoId: dato, activa: false }, { sql: tx })).rejects.toThrow(new ErrorIndicador(EN_USO));

      await tx`UPDATE mediciones SET estado = 'cerrada' WHERE id = ${mayo}`;
      await cambiarEstadoDeDato(admin, { datoId: dato, activa: false }, { sql: tx });
      expect((await datoPorId(admin, dato, { sql: tx }))?.activa).toBe(false);
    }));

  it("sin uso pasa, con su bitácora; la lista y el formulario de la ficha dejan de ofrecerlo", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const gerencia = await usuarioDePrueba(tx, { rol: "gerencia" });
      const p = await procesoNuevo(tx);
      const dim = await dimensionNueva(tx);
      const activo = await datoDePrueba(tx, { procesoId: p, nombre: "ZZ Dato activo", periodicidad: "trimestral", consolidacion: "ultimo", dimensionId: dim });
      const dato = await datoDePrueba(tx, { procesoId: p });
      await expect(cambiarEstadoDeDato(gerencia, { datoId: dato, activa: false }, { sql: tx })).rejects.toBeInstanceOf(ErrorPermiso);

      await cambiarEstadoDeDato(admin, { datoId: dato, activa: false }, { sql: tx });
      // Pedir el estado que ya tiene no escribe nada.
      await cambiarEstadoDeDato(admin, { datoId: dato, activa: false }, { sql: tx });
      expect(ids(await listarDatos(admin, { sql: tx, soloActivos: true }))).not.toContain(dato);
      expect(ids(await listarDatos(admin, { sql: tx, soloActivos: true }))).toContain(activo);
      expect(ids(await listarDatos(admin, { sql: tx }))).toContain(dato);

      const ficha = await datosParaFicha(tx);
      expect(ids(ficha)).not.toContain(dato);
      const [proceso] = await tx`SELECT nombre FROM procesos WHERE id = ${p}`;
      const [dimension] = await tx`SELECT nombre FROM dimensiones WHERE id = ${dim}`;
      expect(ficha.find((x) => x.id === activo)).toEqual({
        id: activo,
        nombre: "ZZ Dato activo",
        proceso: proceso.nombre,
        periodicidad: "trimestral",
        consolidacion: "ultimo",
        dimensionId: dim,
        dimension: dimension.nombre,
      });

      await cambiarEstadoDeDato(admin, { datoId: dato, activa: true }, { sql: tx });
      expect(ids(await datosParaFicha(tx))).toContain(dato);
      const bitacora = await tx`SELECT accion, detalle FROM auditoria WHERE entidad = 'dato_compartido' AND entidad_id = ${dato} ORDER BY id`;
      expect(bitacora.map((f) => f.accion)).toEqual(["dato_compartido_desactivado", "dato_compartido_activado"]);
      const [fila] = await tx`SELECT nombre FROM variables_compartidas WHERE id = ${dato}`;
      expect(bitacora[0].detalle).toMatchObject({ nombre: fila.nombre });
    }));
});

describe("borrar un dato", () => {
  it("con citas o periodos ya tiene historia; uno nuevo se borra con sus responsables", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const gerencia = await usuarioDePrueba(tx, { rol: "gerencia" });
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const p = await procesoNuevo(tx);

      const citado = await datoDePrueba(tx, { procesoId: p });
      await indicadorDePrueba(tx, { procesoId: p, variables: { A: { datoId: citado } } });
      await expect(borrarDato(admin, citado, { sql: tx })).rejects.toThrow(new ErrorIndicador(CON_HISTORIA));

      const enBorrador = await datoDePrueba(tx, { procesoId: p });
      await indicadorDePrueba(tx, { procesoId: p, estado: "borrador", variables: { B: { datoId: enBorrador } } });
      await expect(borrarDato(admin, enBorrador, { sql: tx })).rejects.toThrow(new ErrorIndicador(CON_HISTORIA));

      const conPeriodo = await datoDePrueba(tx, { procesoId: p });
      const pe = periodoDe("2026-10", zonaHoraria())!;
      await tx`INSERT INTO variable_valores (variable_id, periodo, desde, hasta, vence_en)
        VALUES (${conPeriodo}, '2026-10', ${pe.desde}, ${pe.hasta}, ${pe.hasta})`;
      await expect(borrarDato(admin, conPeriodo, { sql: tx })).rejects.toThrow(new ErrorIndicador(CON_HISTORIA));

      const nuevo = await datoDePrueba(tx, { procesoId: p, nombre: "ZZ Dato que se borra", responsables: [responsable.usuarioId] });
      await expect(borrarDato(gerencia, nuevo, { sql: tx })).rejects.toBeInstanceOf(ErrorPermiso);
      await borrarDato(admin, nuevo, { sql: tx });
      expect(await datoPorId(admin, nuevo, { sql: tx })).toBeNull();
      expect(await tx`SELECT 1 FROM variable_responsables WHERE variable_id = ${nuevo}`).toHaveLength(0);
      const bitacora = await tx`SELECT accion, detalle FROM auditoria WHERE entidad = 'dato_compartido' AND entidad_id = ${nuevo}`;
      expect(bitacora.map((f) => f.accion)).toEqual(["dato_compartido_borrado"]);
      expect(bitacora[0].detalle).toMatchObject({ nombre: "ZZ Dato que se borra" });
      await expect(borrarDato(admin, nuevo, { sql: tx })).rejects.toThrow(new ErrorIndicador("El dato no existe"));
    }));
});

describe("los responsables de un dato", () => {
  it("la lista completa, solo usuarios activos y con su bitácora", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const gerencia = await usuarioDePrueba(tx, { rol: "gerencia" });
      const [a, b, c, d] = [
        await usuarioDePrueba(tx, { rol: "consulta" }),
        await usuarioDePrueba(tx, { rol: "consulta" }),
        await usuarioDePrueba(tx, { rol: "lider_proceso" }),
        await usuarioDePrueba(tx, { rol: "consulta" }),
      ];
      const p = await procesoNuevo(tx);
      const dato = await datoDePrueba(tx, { procesoId: p });
      await expect(
        designarResponsablesDeDato(gerencia, { datoId: dato, usuarioIds: [a.usuarioId] }, { sql: tx }),
      ).rejects.toBeInstanceOf(ErrorPermiso);

      const ahora = new Date("2026-11-10T15:00:00Z");
      await designarResponsablesDeDato(admin, { datoId: dato, usuarioIds: [a.usuarioId, b.usuarioId, a.usuarioId] }, { sql: tx, ahora });
      const filas = await tx`SELECT usuario_id, designado_por, designado_en FROM variable_responsables WHERE variable_id = ${dato} ORDER BY usuario_id`;
      expect(filas.map((f) => [Number(f.usuario_id), Number(f.designado_por), new Date(f.designado_en).toISOString()])).toEqual([
        [a.usuarioId, admin.usuarioId, ahora.toISOString()],
        [b.usuarioId, admin.usuarioId, ahora.toISOString()],
      ]);

      // Quien se queda conserva su fila aunque se haya desactivado; a un inactivo no se le designa.
      await tx`UPDATE usuarios SET activo = false WHERE id IN (${b.usuarioId}, ${d.usuarioId})`;
      await designarResponsablesDeDato(admin, { datoId: dato, usuarioIds: [b.usuarioId, c.usuarioId] }, { sql: tx });
      const responsables = (await datoPorId(admin, dato, { sql: tx }))!.responsables;
      expect([...responsables].sort((x, y) => x.id - y.id)).toEqual([
        { id: b.usuarioId, nombre: b.nombre, activo: false },
        { id: c.usuarioId, nombre: c.nombre, activo: true },
      ]);
      await expect(
        designarResponsablesDeDato(admin, { datoId: dato, usuarioIds: [c.usuarioId, d.usuarioId] }, { sql: tx }),
      ).rejects.toThrow(new ErrorIndicador("Solo se puede designar a usuarios activos"));
      const veintiuno = Array.from({ length: 21 }, (_, i) => i + 1);
      await expect(designarResponsablesDeDato(admin, { datoId: dato, usuarioIds: veintiuno }, { sql: tx })).rejects.toThrow(
        new ErrorIndicador("Elija hasta 20 personas"),
      );
      // El tope cuenta antes de quitar los repetidos, como `EsquemaResponsablesDeDato` (`listaDeIds`).
      const conRepetido = [...veintiuno.slice(0, 20), 1];
      expect(EsquemaResponsablesDeDato.safeParse({ usuarioIds: JSON.stringify(conRepetido) }).error?.issues[0].message).toBe(
        "Elija hasta 20 personas",
      );
      await expect(designarResponsablesDeDato(admin, { datoId: dato, usuarioIds: conRepetido }, { sql: tx })).rejects.toThrow(
        new ErrorIndicador("Elija hasta 20 personas"),
      );

      const bitacora = await tx`SELECT detalle FROM auditoria
        WHERE entidad = 'dato_compartido' AND entidad_id = ${dato} AND accion = 'dato_compartido_responsables' ORDER BY id`;
      expect(bitacora.map((f) => [f.detalle.antes, f.detalle.despues])).toEqual([
        [[], [a.usuarioId, b.usuarioId]],
        [[a.usuarioId, b.usuarioId], [b.usuarioId, c.usuarioId]],
      ]);
      expect(bitacora[1].detalle.nombresDespues).toEqual([b.nombre, c.nombre]);
    }));
});

describe("quién reporta un dato", () => {
  it("sus responsables y los líderes del proceso dueño; el Admin SGC solo si no hay ninguno activo", () =>
    revertida(sql, async (tx) => {
      const conLider = await procesoNuevo(tx);
      const sinNadie = await procesoNuevo(tx);
      const otro = await procesoNuevo(tx);
      const admin = await sesionAdmin(tx);
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [conLider] });
      const liderOtro = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [otro] });
      const cualquiera = await usuarioDePrueba(tx, { rol: "consulta", procesos: [conLider] });

      const dato = await datoDePrueba(tx, { procesoId: conLider, responsables: [responsable.usuarioId] });
      const reporta = (datoId: number, u: SujetoVisibilidad) => puedeReportarDato(datoId, u, { sql: tx });
      const si = { puede: true, sinMedidor: false };
      const no = { puede: false, sinMedidor: false };
      expect(await reporta(dato, responsable)).toEqual(si);
      expect(await reporta(dato, lider)).toEqual(si);
      expect(await reporta(dato, admin)).toEqual(no);
      expect(await reporta(dato, liderOtro)).toEqual(no);
      expect(await reporta(dato, cualquiera)).toEqual(no);
      expect(await reporta(999_999_999, admin)).toEqual(no);
      expect(await responsablesDeDato(tx, dato)).toEqual([responsable.usuarioId]);

      const huerfano = await datoDePrueba(tx, { procesoId: sinNadie, responsables: [responsable.usuarioId] });
      expect(await reporta(huerfano, admin)).toEqual(no);
      await tx`UPDATE usuarios SET activo = false WHERE id = ${responsable.usuarioId}`;
      expect(await reporta(huerfano, admin)).toEqual({ puede: true, sinMedidor: true });
      expect(await reporta(huerfano, cualquiera)).toEqual(no);
      expect(await reporta(huerfano, responsable)).toEqual(no);

      // Sin responsable activo, los líderes; sin líder, los Admin SGC activos.
      expect(await responsablesDeDato(tx, dato)).toEqual([lider.usuarioId]);
      const respaldo = await responsablesDeDato(tx, huerfano);
      expect(respaldo).toContain(admin.usuarioId);
      expect(respaldo).not.toContain(responsable.usuarioId);

      // El Admin SGC que es responsable reporta como cualquiera de ellos.
      const suyo = await datoDePrueba(tx, { procesoId: sinNadie, responsables: [admin.usuarioId] });
      expect(await reporta(suyo, admin)).toEqual(si);
    }));
});

describe("quién ve un dato", () => {
  it("quien administra, Gerencia, Control Interno, los líderes del proceso dueño y sus responsables; para los demás no existe", () =>
    revertida(sql, async (tx) => {
      const p = await procesoNuevo(tx);
      const otro = await procesoNuevo(tx);
      const admin = await sesionAdmin(tx);
      const gerencia = await usuarioDePrueba(tx, { rol: "gerencia" });
      const control = await usuarioDePrueba(tx, { rol: "control_interno" });
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [p] });
      const liderOtro = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [otro] });
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      // Estar asignado al proceso sin liderarlo no basta.
      const consulta = await usuarioDePrueba(tx, { rol: "consulta", procesos: [p] });
      const dato = await datoDePrueba(tx, { procesoId: p, responsables: [responsable.usuarioId] });

      expect(await listarDatos(consulta, { sql: tx })).toEqual([]);
      expect(await datoPorId(consulta, dato, { sql: tx })).toBeNull();
      expect(await puedeVerDato(dato, consulta, { sql: tx })).toBe(false);
      expect(await datoPorId(liderOtro, dato, { sql: tx })).toBeNull();
      expect(ids(await listarDatos(liderOtro, { sql: tx }))).not.toContain(dato);

      for (const u of [admin, gerencia, control, lider, responsable]) {
        expect(ids(await listarDatos(u, { sql: tx }))).toContain(dato);
        expect((await datoPorId(u, dato, { sql: tx }))?.id).toBe(dato);
        expect(await puedeVerDato(dato, u, { sql: tx })).toBe(true);
      }
      expect((await datoPorId(gerencia, dato, { sql: tx }))?.responsables).toEqual([
        { id: responsable.usuarioId, nombre: responsable.nombre, activo: true },
      ]);
      expect(await datoPorId(admin, 999_999_999, { sql: tx })).toBeNull();
    }));
});
