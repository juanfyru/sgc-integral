/**
 * El normograma (spec 13C §10): catálogo de normas y sus tipos, relaciones que cambian el estado, asociaciones con
 * procesos y documentos, retiro y borrado, y la inmutabilidad de `norma_cambios`. Contra la BD de desarrollo, dentro
 * de una transacción que se revierte.
 */
import { existsSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import {
  asociarProceso,
  desasociarProceso,
  desenlazarDocumento,
  enlazarDocumento,
  normasDeDocumento,
  normasDeProceso,
} from "@/db/consultas/normograma/asociaciones";
import { buscarNormas } from "@/db/consultas/normograma/busqueda";
import {
  aniosYEmisores,
  borrarNorma,
  cambiarEstadoNorma,
  crearNorma,
  editarNorma,
  listarNormas,
  normasParaElegir,
  obtenerNorma,
  retirarNorma,
  sugerirEmisores,
  type DatosNorma,
} from "@/db/consultas/normograma/normas";
import { eliminarRelacion, registrarRelacion } from "@/db/consultas/normograma/relaciones";
import { alternarTipoNorma, crearTipoNorma, editarTipoNorma, listarTiposNorma, moverTipoNorma } from "@/db/consultas/normograma/tipos-norma";
import { EsquemaEstadoNorma, EsquemaNorma, EsquemaRelacion, EsquemaResolverImpacto } from "@/lib/esquemas/normograma";
import { ErrorNormograma, nombreDeNorma } from "@/lib/normograma/tipos";
import { ErrorPermiso } from "@/lib/permisos";
import { parsearFormulario } from "@/lib/validacion";
import { normaDePrueba, tipoNormaId } from "./utiles/normograma";
import { documentoLibre, sesionAdmin, sesionDe, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();
const ahora = new Date("2026-11-08T15:00:00Z");

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

const auditoriaDe = (tx: Parameters<Parameters<typeof revertida>[1]>[0], accion: string, normaId: number) =>
  tx`SELECT detalle FROM auditoria WHERE accion = ${accion} AND entidad = 'norma' AND entidad_id = ${normaId} ORDER BY id`;

describe("catálogo de normas", () => {
  it("crea, lista y busca una norma; el duplicado se rechaza", () =>
    revertida(sql, async (tx) => {
      expect(nombreDeNorma({ tipo: "Resolución", numero: "3100", anio: 2019 })).toBe("Resolución 3100 de 2019");
      const admin = await sesionAdmin(tx);
      const resolucion = await tipoNormaId(tx);
      const numero = `zz_${Date.now()}`;
      const emisor = `Superintendencia Nacional de Salud zz${Date.now()}`;
      const datos: DatosNorma = {
        tipoNormaId: resolucion,
        numero,
        anio: 2019,
        fechaExpedicion: "2019-11-25",
        entidadEmisora: emisor,
        titulo: "Procedimientos y condiciones de inscripción y habilitación de servicios de salud",
        tema: "Habilitación de prestadores",
        enlaceOficial: null,
        notas: null,
      };
      const { id } = await crearNorma(admin, datos, { sql: tx });
      const nombre = `Resolución ${numero} de 2019`;

      const fila = (await listarNormas({ q: "zz_" }, admin, { sql: tx })).find((f) => f.id === id);
      expect(fila).toEqual({
        id,
        nombre,
        titulo: datos.titulo,
        entidadEmisora: emisor,
        estado: "vigente",
        estadoEn: null,
        anio: 2019,
        tipo: "Resolución",
        procesos: [],
        documentos: 0,
        requisito: null,
      });
      expect((await listarNormas({ q: numero, anio: 2019, tipoNormaId: resolucion, emisor, estado: "vigente" }, admin, { sql: tx })).map((f) => f.id)).toEqual([id]);
      expect(await listarNormas({ q: numero, anio: 2018 }, admin, { sql: tx })).toEqual([]);
      expect(await listarNormas({ q: numero, estado: "derogada" }, admin, { sql: tx })).toEqual([]);
      // El nombre completo, con o sin tilde, y el título por FTS sin tildes.
      expect((await listarNormas({ q: `Resolucion ${numero}` }, admin, { sql: tx })).map((f) => f.id)).toEqual([id]);

      expect(await buscarNormas(numero, 4, { sql: tx })).toEqual([{ id, nombre, titulo: datos.titulo, estado: "vigente" }]);
      expect((await buscarNormas("habilitacion servicios", 50, { sql: tx })).map((r) => r.id)).toContain(id);
      expect((await buscarNormas("prestadores", 50, { sql: tx })).map((r) => r.id)).toContain(id);
      expect(await buscarNormas("z", 4, { sql: tx })).toEqual([]);

      expect(await sugerirEmisores(emisor.slice(0, -3).toLowerCase(), { sql: tx })).toContain(emisor);
      const { anios, emisores } = await aniosYEmisores({ sql: tx });
      expect(anios).toContain(2019);
      expect(emisores).toContain(emisor);

      await expect(crearNorma(admin, datos, { sql: tx })).rejects.toThrow(`Ya existe ${nombre}`);
      await expect(crearNorma(admin, { ...datos, numero: numero.toUpperCase() }, { sql: tx })).rejects.toThrow(ErrorNormograma);
      // Otro año u otro tipo con el mismo número no es la misma norma.
      await expect(crearNorma(admin, { ...datos, anio: 2020 }, { sql: tx })).resolves.toMatchObject({ id: expect.any(Number) });
      await expect(crearNorma(await usuarioDePrueba(tx, { rol: "lider_proceso" }), { ...datos, anio: 2021 }, { sql: tx })).rejects.toThrow(
        ErrorPermiso,
      );

      const [creada] = await auditoriaDe(tx, "norma_creada", id);
      expect(creada.detalle).toMatchObject({ nombre, titulo: datos.titulo, entidadEmisora: emisor });
    }));

  it("editar deja antes y después en la bitácora; un tipo inactivo no se elige", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const n = await normaDePrueba(tx, admin, { titulo: "Título original", anio: 2020 });
      const [fila] = await tx`SELECT tipo_norma_id, numero FROM normas WHERE id = ${n.id}`;
      const datos: DatosNorma = {
        tipoNormaId: Number(fila.tipo_norma_id),
        numero: fila.numero,
        anio: 2020,
        fechaExpedicion: null,
        entidadEmisora: "Ministerio de Salud y Protección Social",
        titulo: "Título corregido",
        tema: "Tema nuevo",
        enlaceOficial: null,
        notas: null,
      };
      await editarNorma(admin, n.id, datos, { sql: tx });
      const [editada] = await auditoriaDe(tx, "norma_editada", n.id);
      expect(editada.detalle.antes).toMatchObject({ titulo: "Título original", tema: null });
      expect(editada.detalle.despues).toMatchObject({ titulo: "Título corregido", tema: "Tema nuevo" });
      // Sin cambios no hay nada que auditar.
      await editarNorma(admin, n.id, datos, { sql: tx });
      expect(await auditoriaDe(tx, "norma_editada", n.id)).toHaveLength(1);

      const { id: tipoId } = await crearTipoNorma(admin, `Tipo zz ${Date.now()}`, { sql: tx });
      await alternarTipoNorma(admin, tipoId, false, { sql: tx });
      await expect(editarNorma(admin, n.id, { ...datos, tipoNormaId: tipoId }, { sql: tx })).rejects.toThrow("El tipo de norma no existe o está inactivo");
      await expect(normaDePrueba(tx, admin, { tipoNormaId: tipoId })).rejects.toThrow("El tipo de norma no existe o está inactivo");
      await expect(editarNorma(admin, 987_654_321, datos, { sql: tx })).rejects.toThrow("La norma no existe");
    }));

  it("los tipos de norma se crean, renombran, ordenan y desactivan; no se repiten ni se borran", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const marca = Date.now();
      const { id } = await crearTipoNorma(admin, `Ordenanza zz${marca}`, { sql: tx });
      await expect(crearTipoNorma(admin, `ordenanza ZZ${marca}`, { sql: tx })).rejects.toThrow(`Ya existe el tipo de norma «ordenanza ZZ${marca}»`);
      await expect(crearTipoNorma(admin, " ", { sql: tx })).rejects.toThrow(ErrorNormograma);
      await expect(crearTipoNorma(await usuarioDePrueba(tx, { rol: "lider_proceso" }), "Otra zz", { sql: tx })).rejects.toThrow(ErrorPermiso);

      const ultimo = async () => (await listarTiposNorma({ sql: tx })).at(-1)!;
      expect(await ultimo()).toMatchObject({ id, nombre: `Ordenanza zz${marca}`, activo: true, normas: 0 });
      await editarTipoNorma(admin, id, `Ordenanza municipal zz${marca}`, { sql: tx });
      await moverTipoNorma(admin, id, "arriba", { sql: tx });
      const tipos = await listarTiposNorma({ sql: tx });
      expect(tipos.at(-2)).toMatchObject({ id, nombre: `Ordenanza municipal zz${marca}` });
      await alternarTipoNorma(admin, id, false, { sql: tx });
      expect((await listarTiposNorma({ sql: tx, soloActivos: true })).some((t) => t.id === id)).toBe(false);
      expect((await listarTiposNorma({ sql: tx })).find((t) => t.id === id)?.activo).toBe(false);

      const acciones = await tx`SELECT accion FROM auditoria WHERE entidad = 'tipos_norma' AND entidad_id = ${id} ORDER BY id`;
      expect(acciones.map((a) => a.accion)).toEqual(["tipo_norma_creado", "tipo_norma_editado", "tipo_norma_movido", "tipo_norma_alternado"]);
    }));
});

describe("relaciones y estado", () => {
  it("«deroga a» pasa la afectada a derogada con la fecha de la nueva y deja el cambio; consigo misma, repetida o sobre una derogada se rechaza", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const vieja = await normaDePrueba(tx, admin, { anio: 2014 });
      const nueva = await normaDePrueba(tx, admin, { anio: 2019, fechaExpedicion: "2019-11-25" });
      const r = await registrarRelacion(admin, { normaId: nueva.id, afectadaId: vieja.id, tipo: "deroga", detalle: null }, { sql: tx, ahora });
      const [n] = await tx`SELECT estado, estado_en::text FROM normas WHERE id = ${vieja.id}`;
      expect(n).toEqual({ estado: "derogada", estado_en: "2019-11-25" });
      expect(r.cambioId).not.toBeNull();
      expect(r.impactos).toBe(0);
      const [cambio] = await tx`SELECT estado_anterior, estado_nuevo, fecha::text, relacion_id, usuario_id FROM norma_cambios WHERE id = ${r.cambioId}`;
      expect(cambio).toMatchObject({ estado_anterior: "vigente", estado_nuevo: "derogada", fecha: "2019-11-25" });
      expect(Number(cambio.relacion_id)).toBe(r.relacionId);
      expect(Number(cambio.usuario_id)).toBe(admin.usuarioId);

      await expect(registrarRelacion(admin, { normaId: nueva.id, afectadaId: nueva.id, tipo: "modifica", detalle: null }, { sql: tx })).rejects.toThrow("consigo misma");
      await expect(registrarRelacion(admin, { normaId: nueva.id, afectadaId: vieja.id, tipo: "deroga", detalle: null }, { sql: tx })).rejects.toThrow("ya está registrada");
      await expect(registrarRelacion(admin, { normaId: (await normaDePrueba(tx, admin)).id, afectadaId: vieja.id, tipo: "deroga", detalle: null }, { sql: tx })).rejects.toThrow("ya está derogada");
      expect((await tx`SELECT 1 FROM impactos_normativos WHERE norma_id = ${vieja.id}`).length).toBe(0);

      // Las dos direcciones en la ficha.
      const deVieja = await obtenerNorma(vieja.id, admin, { sql: tx });
      expect(deVieja?.relaciones).toEqual([
        { id: r.relacionId, tipo: "deroga", norma: { id: nueva.id, nombre: nueva.nombre, estado: "vigente" }, detalle: null, directa: false },
      ]);
      expect(deVieja?.cambios).toMatchObject([{ estadoAnterior: "vigente", estadoNuevo: "derogada", fecha: "2019-11-25", nota: null }]);
      expect((await obtenerNorma(nueva.id, admin, { sql: tx }))?.relaciones).toMatchObject([
        { tipo: "deroga", norma: { id: vieja.id, estado: "derogada" }, directa: true },
      ]);
      const [auditada] = await auditoriaDe(tx, "norma_relacion", nueva.id);
      expect(auditada.detalle).toMatchObject({ tipo: "deroga", norma: nueva.nombre, afectada: vieja.nombre, cambioId: r.cambioId });
      expect(await auditoriaDe(tx, "norma_estado", vieja.id)).toHaveLength(1);
    }));

  it("«modifica a» pasa una vigente a modificada y una modificada se puede derogar; «reglamenta a» no cambia estados", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const base = await normaDePrueba(tx, admin, { anio: 2010 });
      const modifica = await normaDePrueba(tx, admin, { anio: 2015, fechaExpedicion: "2015-03-02" });
      const deroga = await normaDePrueba(tx, admin, { anio: 2021 });
      const reglamenta = await normaDePrueba(tx, admin, { anio: 2022 });

      const r1 = await registrarRelacion(admin, { normaId: modifica.id, afectadaId: base.id, tipo: "modifica", detalle: "artículos 5 a 9" }, { sql: tx, ahora });
      expect((await tx`SELECT estado, estado_en::text FROM normas WHERE id = ${base.id}`)[0]).toEqual({ estado: "modificada", estado_en: "2015-03-02" });
      // Sin fecha de expedición en la nueva ni fecha dada, la del día.
      const r2 = await registrarRelacion(admin, { normaId: deroga.id, afectadaId: base.id, tipo: "deroga", detalle: null }, { sql: tx, ahora });
      expect((await tx`SELECT estado, estado_en::text FROM normas WHERE id = ${base.id}`)[0]).toEqual({ estado: "derogada", estado_en: "2026-11-08" });
      expect(r2.cambioId).not.toBe(r1.cambioId);

      const r3 = await registrarRelacion(admin, { normaId: reglamenta.id, afectadaId: modifica.id, tipo: "reglamenta", detalle: null, fecha: "2022-01-10" }, { sql: tx, ahora });
      expect(r3).toEqual({ relacionId: expect.any(Number), cambioId: null, impactos: 0 });
      expect((await tx`SELECT estado FROM normas WHERE id = ${modifica.id}`)[0].estado).toBe("vigente");
      // «modifica a» sobre una ya modificada: queda la relación, el estado no cambia y no hay cambio.
      const otra = await normaDePrueba(tx, admin, { anio: 2016 });
      const conModificada = await normaDePrueba(tx, admin, { anio: 2011 });
      await registrarRelacion(admin, { normaId: otra.id, afectadaId: conModificada.id, tipo: "modifica", detalle: null }, { sql: tx, ahora });
      expect(await registrarRelacion(admin, { normaId: modifica.id, afectadaId: conModificada.id, tipo: "modifica", detalle: null }, { sql: tx, ahora })).toMatchObject({
        cambioId: null,
        impactos: 0,
      });

      // Una relación se elimina con motivo, como baja lógica: la fila queda con quién, cuándo y por qué.
      await expect(eliminarRelacion(admin, { relacionId: r3.relacionId, motivo: "no" }, { sql: tx })).rejects.toThrow("El motivo");
      await eliminarRelacion(admin, { relacionId: r3.relacionId, motivo: "Registrada por error" }, { sql: tx, ahora });
      expect((await tx`SELECT eliminada_en, eliminada_por, eliminada_motivo FROM norma_relaciones WHERE id = ${r3.relacionId}`)[0]).toEqual({
        eliminada_en: ahora,
        eliminada_por: admin.usuarioId,
        eliminada_motivo: "Registrada por error",
      });
      const [eliminada] = await auditoriaDe(tx, "norma_relacion_eliminada", reglamenta.id);
      expect(eliminada.detalle).toMatchObject({ tipo: "reglamenta", afectada: modifica.nombre, motivo: "Registrada por error" });
      await expect(eliminarRelacion(admin, { relacionId: r3.relacionId, motivo: "Otra vez por error" }, { sql: tx })).rejects.toThrow(
        "La relación ya está eliminada",
      );
      await expect(eliminarRelacion(admin, { relacionId: 987_654_321, motivo: "Registrada por error" }, { sql: tx })).rejects.toThrow("La relación no existe");
      // Eliminada, la misma relación se vuelve a registrar.
      const otraVez = await registrarRelacion(admin, { normaId: reglamenta.id, afectadaId: modifica.id, tipo: "reglamenta", detalle: null }, { sql: tx, ahora });
      expect(otraVez.relacionId).not.toBe(r3.relacionId);
    }));

  it("eliminar la relación que derogó deja la afectada derogada y el cambio en el historial, marcado; tras restituirla a mano se vuelve a registrar", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const vieja = await normaDePrueba(tx, admin, { anio: 2014 });
      const nueva = await normaDePrueba(tx, admin, { anio: 2019, fechaExpedicion: "2019-11-25" });
      const relacion = { normaId: nueva.id, afectadaId: vieja.id, tipo: "deroga" as const, detalle: null };
      const r = await registrarRelacion(admin, relacion, { sql: tx, ahora });
      await eliminarRelacion(admin, { relacionId: r.relacionId, motivo: "Se registró la norma equivocada" }, { sql: tx, ahora });

      expect((await tx`SELECT estado FROM normas WHERE id = ${vieja.id}`)[0].estado).toBe("derogada");
      const fichaVieja = (await obtenerNorma(vieja.id, admin, { sql: tx }))!;
      expect(fichaVieja.relaciones).toEqual([]);
      expect((await obtenerNorma(nueva.id, admin, { sql: tx }))!.relaciones).toEqual([]);
      expect(fichaVieja.cambios).toMatchObject([
        { estadoNuevo: "derogada", relacion: { id: r.relacionId, tipo: "deroga", norma: { id: nueva.id, nombre: nueva.nombre }, eliminada: true } },
      ]);
      // Registrar y eliminar quedan en la bitácora de las dos normas.
      for (const id of [nueva.id, vieja.id]) {
        expect((await auditoriaDe(tx, "norma_relacion", id))[0].detalle).toMatchObject({ relacionId: r.relacionId, tipo: "deroga" });
        expect((await auditoriaDe(tx, "norma_relacion_eliminada", id))[0].detalle).toMatchObject({
          relacionId: r.relacionId,
          motivo: "Se registró la norma equivocada",
        });
      }

      await expect(registrarRelacion(admin, relacion, { sql: tx })).rejects.toThrow("ya está derogada");
      await cambiarEstadoNorma(admin, { normaId: vieja.id, estado: "vigente", fecha: "2026-11-09", nota: "La derogó otra norma" }, { sql: tx, ahora });
      const otra = await registrarRelacion(admin, relacion, { sql: tx, ahora });
      expect(otra.cambioId).not.toBeNull();
      const despues = (await obtenerNorma(vieja.id, admin, { sql: tx }))!;
      expect(despues.relaciones).toMatchObject([{ id: otra.relacionId, tipo: "deroga", directa: false }]);
      expect(despues.cambios.map((c) => [c.estadoNuevo, c.relacion?.eliminada ?? null])).toEqual([
        ["derogada", true],
        ["vigente", null],
        ["derogada", false],
      ]);
    }));

  it("norma_cambios es inmutable y el enlace oficial se guarda como texto", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const enlace = "https://www.minsalud.gov.co/Normatividad_Nuevo/Resolución No. 3100 de 2019.pdf <b>";
      const n = await normaDePrueba(tx, admin, { enlaceOficial: enlace });
      expect((await obtenerNorma(n.id, admin, { sql: tx }))?.enlaceOficial).toBe(enlace);
      const [guardado] = await tx`SELECT enlace_oficial FROM normas WHERE id = ${n.id}`;
      expect(guardado.enlace_oficial).toBe(enlace);

      const { cambioId } = await cambiarEstadoNorma(admin, { normaId: n.id, estado: "modificada", fecha: "2026-11-01", nota: "Por la 2026" }, { sql: tx, ahora });
      expect(cambioId).not.toBeNull();
      // Sin cambio de estado no se escribe nada.
      expect(await cambiarEstadoNorma(admin, { normaId: n.id, estado: "modificada", fecha: "2026-11-02", nota: null }, { sql: tx, ahora })).toEqual({ cambioId: null, impactos: 0 });
      expect(await tx`SELECT 1 FROM norma_cambios WHERE norma_id = ${n.id}`).toHaveLength(1);
      await expect(cambiarEstadoNorma(admin, { normaId: n.id, estado: "abolida" as never, fecha: "2026-11-02", nota: null }, { sql: tx })).rejects.toThrow(ErrorNormograma);
      // Retirar va solo por «Retirar», que exige el motivo.
      await expect(
        cambiarEstadoNorma(admin, { normaId: n.id, estado: "retirada" as never, fecha: "2026-11-02", nota: null }, { sql: tx }),
      ).rejects.toThrow("Para retirar una norma use «Retirar»");
      expect((await tx`SELECT estado FROM normas WHERE id = ${n.id}`)[0].estado).toBe("modificada");
      await expect(cambiarEstadoNorma(admin, { normaId: n.id, estado: "vigente", fecha: "2026-13-02", nota: null }, { sql: tx })).rejects.toThrow("fecha");
      await expect(
        cambiarEstadoNorma(await usuarioDePrueba(tx, { rol: "lider_proceso" }), { normaId: n.id, estado: "vigente", fecha: "2026-11-02", nota: null }, { sql: tx }),
      ).rejects.toThrow(ErrorPermiso);

      // Cada intento en su punto de guardado: el error del trigger no tumba la transacción del test.
      await expect(tx.savepoint((sp) => sp`UPDATE norma_cambios SET nota = 'otra' WHERE id = ${cambioId}`)).rejects.toMatchObject({ code: "42501" });
      await expect(tx.savepoint((sp) => sp`DELETE FROM norma_cambios WHERE id = ${cambioId}`)).rejects.toMatchObject({ code: "42501" });
      expect((await tx`SELECT nota FROM norma_cambios WHERE id = ${cambioId}`)[0].nota).toBe("Por la 2026");
    }));
});

describe("asociaciones", () => {
  it("el líder asocia su proceso con requisito y enlaza un documento suyo; otro proceso no; el requisito se audita", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const liderGth = await sesionDe(tx, "lider.gth");
      const liderCex = await sesionDe(tx, "lider.cex");
      const [gth] = await tx`SELECT id, nombre, sigla, slug FROM procesos WHERE sigla = 'GTH'`;
      const [cex] = await tx`SELECT id FROM procesos WHERE sigla = 'CEX'`;
      const n = await normaDePrueba(tx, admin);

      await asociarProceso(liderGth, { normaId: n.id, procesoId: Number(gth.id), requisito: "Artículo 5: plan de capacitación" }, { sql: tx });
      expect((await normasDeProceso(Number(gth.id), liderGth, { sql: tx })).find((f) => f.id === n.id)).toMatchObject({
        nombre: n.nombre,
        requisito: "Artículo 5: plan de capacitación",
        procesos: [gth.nombre],
      });
      await asociarProceso(liderGth, { normaId: n.id, procesoId: Number(gth.id), requisito: "Artículos 5 y 6" }, { sql: tx });
      // El mismo requisito otra vez no escribe nada.
      await asociarProceso(liderGth, { normaId: n.id, procesoId: Number(gth.id), requisito: "Artículos 5 y 6" }, { sql: tx });
      expect(await auditoriaDe(tx, "norma_asociada", n.id)).toHaveLength(1);
      const editados = await auditoriaDe(tx, "norma_requisito_editado", n.id);
      expect(editados).toHaveLength(1);
      expect(editados[0].detalle).toMatchObject({ proceso: gth.nombre, antes: "Artículo 5: plan de capacitación", despues: "Artículos 5 y 6" });

      const enCex = asociarProceso(liderGth, { normaId: n.id, procesoId: Number(cex.id), requisito: null }, { sql: tx });
      await expect(enCex).rejects.toThrow(ErrorNormograma);
      await expect(enCex).rejects.toThrow("Solo puede asociar normas a los procesos que lidera");
      await expect(asociarProceso(await usuarioDePrueba(tx, { rol: "consulta" }), { normaId: n.id, procesoId: Number(gth.id), requisito: null }, { sql: tx })).rejects.toThrow(ErrorPermiso);
      await expect(asociarProceso(admin, { normaId: n.id, procesoId: Number(cex.id), requisito: "x".repeat(2001) }, { sql: tx })).rejects.toThrow("2000");

      const deGth = await documentoLibre(tx, { proceso: "GTH", tipo: "PR" });
      const deCex = await documentoLibre(tx, { proceso: "CEX", tipo: "PR" });
      await enlazarDocumento(liderGth, { normaId: n.id, documentoId: deGth.id }, { sql: tx });
      await expect(enlazarDocumento(liderGth, { normaId: n.id, documentoId: deGth.id }, { sql: tx })).rejects.toThrow("ya está enlazado");
      await expect(enlazarDocumento(liderGth, { normaId: n.id, documentoId: deCex.id }, { sql: tx })).rejects.toThrow(
        "Solo puede enlazar documentos de los procesos que lidera",
      );
      await expect(enlazarDocumento(liderGth, { normaId: n.id, documentoId: 987_654_321 }, { sql: tx })).rejects.toThrow("El documento no existe");
      await enlazarDocumento(admin, { normaId: n.id, documentoId: deCex.id }, { sql: tx });
      expect((await normasDeDocumento(deGth.id, liderGth, { sql: tx })).map((f) => f.id)).toEqual([n.id]);
      const [enlazado] = await auditoriaDe(tx, "norma_documento_enlazado", n.id);
      expect(enlazado.detalle).toMatchObject({ documentoId: deGth.id, codigo: deGth.codigo });

      const ficha = (await obtenerNorma(n.id, liderGth, { sql: tx }))!;
      expect(ficha.procesos).toEqual([
        { id: Number(gth.id), nombre: gth.nombre, sigla: gth.sigla, slug: gth.slug, requisito: "Artículos 5 y 6", puedeEditar: true },
      ]);
      expect(ficha.documentos.map((d) => d.codigo).sort()).toEqual([deCex.codigo, deGth.codigo].sort());
      expect(ficha.acciones).toEqual({ administrar: false });
      expect((await obtenerNorma(n.id, liderCex, { sql: tx }))!.procesos[0].puedeEditar).toBe(false);
      expect((await obtenerNorma(n.id, admin, { sql: tx }))!.acciones).toEqual({ administrar: true });
      expect((await listarNormas({ procesoId: Number(gth.id), q: n.nombre.split(" ")[1] }, liderGth, { sql: tx })).map((f) => f.documentos)).toEqual([2]);

      await expect(desenlazarDocumento(liderGth, { normaId: n.id, documentoId: deCex.id }, { sql: tx })).rejects.toThrow(
        "Solo puede quitar el enlace de documentos de los procesos que lidera",
      );
      await asociarProceso(admin, { normaId: n.id, procesoId: Number(cex.id), requisito: null }, { sql: tx });
      await expect(desasociarProceso(liderGth, { normaId: n.id, procesoId: Number(cex.id) }, { sql: tx })).rejects.toThrow(
        "Solo puede quitar normas de los procesos que lidera",
      );
      await desenlazarDocumento(liderGth, { normaId: n.id, documentoId: deGth.id }, { sql: tx });
      await desasociarProceso(liderGth, { normaId: n.id, procesoId: Number(gth.id) }, { sql: tx });
      await expect(desasociarProceso(liderGth, { normaId: n.id, procesoId: Number(gth.id) }, { sql: tx })).rejects.toThrow("no está asociada");
      expect(await normasDeProceso(Number(gth.id), liderGth, { sql: tx })).not.toContainEqual(expect.objectContaining({ id: n.id }));
      expect(await auditoriaDe(tx, "norma_documento_desenlazado", n.id)).toHaveLength(1);
      expect((await auditoriaDe(tx, "norma_desasociada", n.id))[0].detalle).toMatchObject({ proceso: gth.nombre, requisito: "Artículos 5 y 6" });
    }));

  it("un documento restringido enlazado sale sin código ni título a quien no lo ve, y no se le cuenta", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const consulta = await usuarioDePrueba(tx, { rol: "consulta" });
      const gerente = await usuarioDePrueba(tx, { rol: "gerencia" });
      const n = await normaDePrueba(tx, admin);
      const general = await documentoLibre(tx, { proceso: "GTH", tipo: "PR" });
      const restringido = await documentoLibre(tx, { proceso: "GTH", tipo: "PR" });
      await tx`UPDATE documentos SET nivel_acceso = 'restringido' WHERE id = ${restringido.id}`;
      await enlazarDocumento(admin, { normaId: n.id, documentoId: general.id }, { sql: tx });
      await enlazarDocumento(admin, { normaId: n.id, documentoId: restringido.id }, { sql: tx });

      const paraConsulta = (await obtenerNorma(n.id, consulta, { sql: tx }))!.documentos;
      expect(paraConsulta).toContainEqual({ id: general.id, codigo: general.codigo, titulo: general.titulo, origen: "interno", visible: true });
      expect(paraConsulta).toContainEqual({ id: null, codigo: null, titulo: null, origen: "interno", visible: false });
      expect(paraConsulta.some((d) => d.id === restringido.id)).toBe(false);
      expect(JSON.stringify(paraConsulta)).not.toContain(restringido.codigo);
      expect((await obtenerNorma(n.id, gerente, { sql: tx }))!.documentos).toContainEqual(
        expect.objectContaining({ id: restringido.id, codigo: restringido.codigo, visible: true }),
      );

      const numero = n.nombre.split(" ")[1];
      expect((await listarNormas({ q: numero }, consulta, { sql: tx }))[0].documentos).toBe(1);
      expect((await listarNormas({ q: numero }, gerente, { sql: tx }))[0].documentos).toBe(2);
      expect(await normasDeDocumento(restringido.id, consulta, { sql: tx })).toEqual([]);
      expect((await normasDeDocumento(restringido.id, gerente, { sql: tx })).map((f) => f.id)).toEqual([n.id]);
      // Quien no ve el documento no lo enlaza: para él no existe.
      const otra = await normaDePrueba(tx, admin);
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [(await tx`SELECT id FROM procesos WHERE sigla = 'CEX'`)[0].id] });
      await expect(enlazarDocumento(lider, { normaId: otra.id, documentoId: restringido.id }, { sql: tx })).rejects.toThrow("El documento no existe");
    }));
});

describe("normasParaElegir: las opciones de los selectores", () => {
  it("una sola consulta ligera: las no retiradas, sin las ya asociadas al proceso, sin la norma misma y sin las derogadas si se pide", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const [cex] = await tx`SELECT id FROM procesos WHERE sigla = 'CEX'`;
      const asociada = await normaDePrueba(tx, admin, { titulo: "Asociada a CEX" });
      const libre = await normaDePrueba(tx, admin, { titulo: "Libre" });
      const retirada = await normaDePrueba(tx, admin);
      const derogada = await normaDePrueba(tx, admin);
      await asociarProceso(admin, { normaId: asociada.id, procesoId: Number(cex.id), requisito: null }, { sql: tx });
      await retirarNorma(admin, { normaId: retirada.id, motivo: "Registrada por error" }, { sql: tx });
      await cambiarEstadoNorma(admin, { normaId: derogada.id, estado: "derogada", fecha: "2026-11-01", nota: null }, { sql: tx });
      const ids = (filas: { id: number }[]) => filas.map((f) => f.id);

      const delProceso = await normasParaElegir({ sql: tx, sinProceso: Number(cex.id) });
      expect(ids(delProceso)).toEqual(expect.arrayContaining([libre.id, derogada.id]));
      expect(ids(delProceso)).not.toContain(asociada.id);
      expect(ids(delProceso)).not.toContain(retirada.id);
      expect(delProceso.find((f) => f.id === libre.id)).toEqual({ id: libre.id, nombre: libre.nombre, titulo: "Libre" });

      const afectables = await normasParaElegir({ sql: tx, distintaDe: libre.id, sinDerogadas: true });
      expect(ids(afectables)).toContain(asociada.id);
      for (const id of [libre.id, retirada.id, derogada.id]) expect(ids(afectables)).not.toContain(id);
    }));
});

describe("retiro y borrado", () => {
  it("retirar una norma la saca de la lista y la deja en la ficha; borrar solo si está vacía", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const n = await normaDePrueba(tx, admin);
      const numero = n.nombre.split(" ")[1];
      await expect(retirarNorma(admin, { normaId: n.id, motivo: "no" }, { sql: tx })).rejects.toThrow("El motivo");
      await retirarNorma(admin, { normaId: n.id, motivo: "Registrada por error" }, { sql: tx, ahora });

      expect(await listarNormas({ q: numero }, admin, { sql: tx })).toEqual([]);
      expect(await listarNormas({ q: numero, estado: "todas" }, admin, { sql: tx })).toEqual([]);
      expect((await listarNormas({ q: numero, incluirRetiradas: true }, admin, { sql: tx })).map((f) => f.estado)).toEqual(["retirada"]);
      expect((await listarNormas({ q: numero, estado: "retirada" }, admin, { sql: tx })).map((f) => f.id)).toEqual([n.id]);
      expect(await buscarNormas(numero, 4, { sql: tx })).toEqual([]);
      const ficha = await obtenerNorma(n.id, admin, { sql: tx });
      expect(ficha).toMatchObject({ estado: "retirada", estadoEn: "2026-11-08" });
      expect(ficha?.cambios).toMatchObject([{ estadoAnterior: "vigente", estadoNuevo: "retirada", nota: "Registrada por error" }]);
      expect((await auditoriaDe(tx, "norma_retirada", n.id))[0].detalle).toMatchObject({ nombre: n.nombre, motivo: "Registrada por error" });
      // Una norma retirada no recibe asociaciones nuevas.
      const [gth] = await tx`SELECT id FROM procesos WHERE sigla = 'GTH'`;
      await expect(asociarProceso(admin, { normaId: n.id, procesoId: Number(gth.id), requisito: null }, { sql: tx })).rejects.toThrow("está retirada");

      await expect(borrarNorma(admin, n.id, { sql: tx })).rejects.toThrow("La norma tiene historia: retírela");
      const asociada = await normaDePrueba(tx, admin);
      await asociarProceso(admin, { normaId: asociada.id, procesoId: Number(gth.id), requisito: null }, { sql: tx });
      await expect(borrarNorma(admin, asociada.id, { sql: tx })).rejects.toThrow("La norma tiene historia");
      const relacionada = await normaDePrueba(tx, admin);
      await registrarRelacion(admin, { normaId: relacionada.id, afectadaId: asociada.id, tipo: "reglamenta", detalle: null }, { sql: tx });
      await expect(borrarNorma(admin, relacionada.id, { sql: tx })).rejects.toThrow("La norma tiene historia");

      const vacia = await normaDePrueba(tx, admin);
      await expect(borrarNorma(await usuarioDePrueba(tx, { rol: "lider_proceso" }), vacia.id, { sql: tx })).rejects.toThrow(ErrorPermiso);
      await borrarNorma(admin, vacia.id, { sql: tx });
      expect(await obtenerNorma(vacia.id, admin, { sql: tx })).toBeNull();
      expect((await auditoriaDe(tx, "norma_borrada", vacia.id))[0].detalle).toMatchObject({ nombre: vacia.nombre });
      await expect(borrarNorma(admin, vacia.id, { sql: tx })).rejects.toThrow("La norma no existe");
    }));
});

describe("esquemas del normograma", () => {
  const formulario = (campos: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.set(k, v);
    return f;
  };

  it("la norma: el enlace oficial es texto libre, los vacíos son nulos y un campo de más se rechaza", () => {
    const d = parsearFormulario(
      formulario({ tipoNormaId: "3", numero: " 3100 ", anio: "2019", entidadEmisora: "Ministerio de Salud", titulo: "Habilitación", enlaceOficial: "javascript:alert(1)", tema: "  " }),
      EsquemaNorma,
    );
    expect(d).toEqual({
      tipoNormaId: 3,
      numero: "3100",
      anio: 2019,
      fechaExpedicion: null,
      entidadEmisora: "Ministerio de Salud",
      titulo: "Habilitación",
      tema: null,
      enlaceOficial: "javascript:alert(1)",
      notas: null,
    });
    expect(() => parsearFormulario(formulario({ tipoNormaId: "3", numero: "1", anio: "1700", entidadEmisora: "MSPS", titulo: "Ley" }), EsquemaNorma)).toThrow(
      "El año debe estar entre 1800 y 2100",
    );
    expect(() =>
      parsearFormulario(formulario({ tipoNormaId: "3", numero: "1", anio: "2019", entidadEmisora: "MSPS", titulo: "Ley", estado: "derogada" }), EsquemaNorma),
    ).toThrow();
    expect(() => parsearFormulario(formulario({ normaId: "1", estado: "retirada", fecha: "2026-11-09" }), EsquemaEstadoNorma)).toThrow(
      "Elija el estado de la norma",
    );
    expect(parsearFormulario(formulario({ normaId: "1", estado: "derogada", fecha: "2026-11-09" }), EsquemaEstadoNorma)).toMatchObject({ estado: "derogada" });
    expect(parsearFormulario(formulario({ normaId: "1", afectadaId: "2", tipo: "deroga" }), EsquemaRelacion)).toEqual({
      normaId: 1,
      afectadaId: 2,
      tipo: "deroga",
      detalle: null,
    });
  });

  it("resolver un impacto se discrimina por la resolución, cada una con lo suyo", () => {
    expect(parsearFormulario(formulario({ impactoId: "7", resolucion: "no_afecta", nota: "No cita la norma" }), EsquemaResolverImpacto)).toEqual({
      impactoId: 7,
      resolucion: "no_afecta",
      nota: "No cita la norma",
    });
    expect(parsearFormulario(formulario({ impactoId: "7", resolucion: "solicitud", tramiteId: "9" }), EsquemaResolverImpacto)).toEqual({
      impactoId: 7,
      resolucion: "solicitud",
      tramiteId: 9,
    });
    expect(() => parsearFormulario(formulario({ impactoId: "7", resolucion: "no_afecta", nota: "no" }), EsquemaResolverImpacto)).toThrow("al menos 5");
    expect(() => parsearFormulario(formulario({ impactoId: "7", resolucion: "solicitud", tramiteId: "9", nota: "Una nota de más" }), EsquemaResolverImpacto)).toThrow();
    expect(() => parsearFormulario(formulario({ impactoId: "7", resolucion: "otra" }), EsquemaResolverImpacto)).toThrow("Elija cómo se resuelve el impacto");
    // La verificación de un externo lo resuelve desde su página, no desde este formulario.
    expect(() => parsearFormulario(formulario({ impactoId: "7", resolucion: "verificacion", verificacionId: "3" }), EsquemaResolverImpacto)).toThrow(
      "Elija cómo se resuelve el impacto",
    );
  });
});
