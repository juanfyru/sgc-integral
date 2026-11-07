/** La verificación de un punto de uso: lista generada, cierre con hallazgos y recogida, descarte y propio punto. */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import { obtenerCopia } from "@/db/consultas/distribucion/copias";
import { cerrarHallazgo, hallazgosAbiertosDe, hallazgosDe } from "@/db/consultas/distribucion/hallazgos";
import {
  abrirVerificacion,
  agregarItemLibre,
  cerrarVerificacion,
  descartarVerificacion,
  guardarAvance,
  obtenerVerificacion,
  ultimaVerificacionDe,
} from "@/db/consultas/distribucion/verificaciones";
import { alDejarDeSerVigente } from "@/db/consultas/distribucion/version-vigencia";
import { ErrorDistribucion } from "@/lib/distribucion/tipos";
import { ITEMS_FIJOS } from "@/lib/distribucion/verificacion";
import { ErrorPermiso } from "@/lib/permisos";
import { fechaLimite } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { copiaDePrueba, puntoDePrueba, vigenteConPdf } from "./utiles/distribucion";
import { sesionAdmin, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();
const T0 = new Date("2026-11-12T15:00:00Z");
const T1 = new Date("2026-11-20T15:00:00Z");

let almacen: string;
const previo = process.env.ALMACEN_RUTA;

beforeAll(() => {
  almacen = mkdtempSync(path.join(tmpdir(), "sgc-verificaciones-"));
  process.env.ALMACEN_RUTA = almacen;
});

afterAll(async () => {
  if (previo === undefined) delete process.env.ALMACEN_RUTA;
  else process.env.ALMACEN_RUTA = previo;
  rmSync(almacen, { recursive: true, force: true });
  await sql.end();
  globalThis.__sql = undefined;
});

const rechaza = (promesa: Promise<unknown>, mensaje: string) =>
  expect(promesa).rejects.toSatisfy((e) => e instanceof ErrorDistribucion && e.message === mensaje);

const ultimoAviso = async (tx: TransactionSql, usuarioId: number) =>
  (await tx`SELECT tipo, titulo, enlace FROM notificaciones WHERE usuario_id = ${usuarioId} ORDER BY id DESC LIMIT 1`)[0];

describe("abrir", () => {
  it("arma la lista con las copias del punto y los fijos; abrir de nuevo devuelve la misma", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const resp = await usuarioDePrueba(tx, { rol: "consulta" });
      const punto = await puntoDePrueba(tx, { responsable: resp, procesos: ["ATE"] });
      const { documento, limpiar } = await vigenteConPdf(tx, { proceso: "ATE", tipo: "PR" });
      try {
        await copiaDePrueba(tx, { emisor: admin, documento, punto });
        const { verificacionId } = await abrirVerificacion(admin, punto.id, { sql: tx, ahora: T0 });
        expect((await abrirVerificacion(admin, punto.id, { sql: tx })).verificacionId).toBe(verificacionId);
        const v = await obtenerVerificacion(verificacionId, admin, { sql: tx });
        expect(v?.items.map((i) => i.texto)).toEqual([
          `${documento.codigo} v1 · Copia N.º 01: está`,
          `${documento.codigo} v1 · Copia N.º 01: legible`,
          `${documento.codigo} v1 · Copia N.º 01: es la versión vigente`,
          ...ITEMS_FIJOS,
        ]);
        expect(v?.items.map((i) => i.orden)).toEqual([1, 2, 3, 4, 5, 6]);
        expect(v).toMatchObject({
          estado: "abierta",
          propioPunto: false,
          puedeEditar: true,
          punto: { id: punto.id, nombre: punto.nombre },
          responsable: { id: resp.usuarioId },
          abiertaEn: T0,
        });
        expect(v?.items.every((i) => i.respuesta === null && i.fotos.length === 0)).toBe(true);
      } finally {
        await limpiar();
      }
    }));

  it("solo con el permiso y sobre un punto activo", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const resp = await usuarioDePrueba(tx, { rol: "consulta" });
      const punto = await puntoDePrueba(tx, { responsable: resp });
      await expect(abrirVerificacion(await usuarioDePrueba(tx, { rol: "lider_proceso" }), punto.id, { sql: tx })).rejects.toBeInstanceOf(ErrorPermiso);
      await rechaza(abrirVerificacion(admin, 987_654_321, { sql: tx }), "El punto de uso no existe o está inactivo");
      await tx`UPDATE puntos_uso SET activo = false WHERE id = ${punto.id}`;
      await rechaza(abrirVerificacion(admin, punto.id, { sql: tx }), "El punto de uso no existe o está inactivo");
    }));

  it("propio punto: con otro admin activo lanza; sin otro, abre con la marca", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const punto = await puntoDePrueba(tx, { responsable: admin });
      await rechaza(
        abrirVerificacion(admin, punto.id, { sql: tx }),
        "Otro Administrador del SGC debe verificar este punto: usted es su responsable",
      );
      await tx`UPDATE usuarios SET activo = false WHERE rol = 'admin_sgc' AND id <> ${admin.usuarioId}`;
      const { verificacionId } = await abrirVerificacion(admin, punto.id, { sql: tx });
      expect((await obtenerVerificacion(verificacionId, admin, { sql: tx }))?.propioPunto).toBe(true);
    }));
});

describe("llenar", () => {
  it("guarda respuestas y notas, añade ítems libres al final y no acepta ítems ajenos", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const resp = await usuarioDePrueba(tx, { rol: "consulta" });
      const punto = await puntoDePrueba(tx, { responsable: resp });
      const otro = await puntoDePrueba(tx, { responsable: resp });
      const { verificacionId } = await abrirVerificacion(admin, punto.id, { sql: tx });
      const ajena = await abrirVerificacion(admin, otro.id, { sql: tx });

      const { itemId } = await agregarItemLibre(verificacionId, admin, "  Extintor con la carga vigente  ", { sql: tx });
      await rechaza(agregarItemLibre(verificacionId, admin, "abc", { sql: tx }), "El ítem debe tener entre 5 y 200 caracteres");
      const v = await obtenerVerificacion(verificacionId, admin, { sql: tx });
      expect(v?.items.at(-1)).toMatchObject({ id: itemId, origen: "libre", texto: "Extintor con la carga vigente", orden: ITEMS_FIJOS.length + 1 });

      const primero = v!.items[0].id;
      await guardarAvance(verificacionId, admin, [{ itemId: primero, respuesta: "no_conforme", nota: "  Hay una copia sin sello " }], { sql: tx });
      expect((await obtenerVerificacion(verificacionId, admin, { sql: tx }))?.items[0]).toMatchObject({ respuesta: "no_conforme", nota: "Hay una copia sin sello" });
      await guardarAvance(verificacionId, admin, [{ itemId: primero, respuesta: null, nota: null }], { sql: tx });
      expect((await obtenerVerificacion(verificacionId, admin, { sql: tx }))?.items[0]).toMatchObject({ respuesta: null, nota: null });

      const delOtro = (await obtenerVerificacion(ajena.verificacionId, admin, { sql: tx }))!.items[0].id;
      await rechaza(
        guardarAvance(verificacionId, admin, [{ itemId: delOtro, respuesta: "conforme", nota: null }], { sql: tx }),
        "Un ítem no pertenece a esta verificación",
      );
    }));
});

describe("cerrar", () => {
  it("exige todas las respuestas; abre un hallazgo por cada no conforme y recoge la copia obsoleta retirada", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const resp = await usuarioDePrueba(tx, { rol: "consulta" });
      const punto = await puntoDePrueba(tx, { responsable: resp, procesos: ["ATE"] });
      const viva = await vigenteConPdf(tx, { proceso: "ATE", tipo: "PR" });
      const vieja = await vigenteConPdf(tx, { proceso: "ATE", tipo: "FO" });
      try {
        await copiaDePrueba(tx, { emisor: admin, documento: viva.documento, punto, ahora: T0 });
        const { copiaId: obsoleta } = await copiaDePrueba(tx, { emisor: admin, documento: vieja.documento, punto, ahora: T0 });
        await alDejarDeSerVigente(tx, vieja.versionId, "nueva_version", T0);

        const { verificacionId } = await abrirVerificacion(admin, punto.id, { sql: tx, ahora: T0 });
        const v = (await obtenerVerificacion(verificacionId, admin, { sql: tx }))!;
        expect(v.items.map((i) => i.origen)).toEqual(["copia", "copia", "copia", "copia_por_recoger", "fijo", "fijo", "fijo"]);

        await rechaza(cerrarVerificacion(verificacionId, admin, { retirados: [] }, { sql: tx, ahora: T1 }), "Responda todos los ítems antes de cerrar");

        const [esta, legible, vigente, porRecoger, obsoletos, sinSello, plataforma] = v.items;
        await guardarAvance(
          verificacionId,
          admin,
          [
            { itemId: esta.id, respuesta: "conforme", nota: null },
            { itemId: legible.id, respuesta: "no_aplica", nota: null },
            { itemId: vigente.id, respuesta: "no_conforme", nota: null },
            { itemId: porRecoger.id, respuesta: "conforme", nota: null },
            { itemId: obsoletos.id, respuesta: "no_conforme", nota: "Había una guía vieja" },
            { itemId: sinSello.id, respuesta: "conforme", nota: null },
            { itemId: plataforma.id, respuesta: "conforme", nota: null },
          ],
          { sql: tx },
        );
        const resultado = await cerrarVerificacion(verificacionId, admin, { retirados: [obsoletos.id] }, { sql: tx, ahora: T1 });
        expect(resultado).toEqual({ conforme: false, hallazgos: 2 });

        const cerrada = (await obtenerVerificacion(verificacionId, admin, { sql: tx }))!;
        expect(cerrada).toMatchObject({ estado: "cerrada", conforme: false, cerradaEn: T1, cerradaPor: admin.nombre, puedeEditar: false });

        const plazo = (await obtenerConfigDocumental({ sql: tx })).distribucion.plazoCorreccionDias;
        const hallazgos = await tx`SELECT * FROM hallazgos WHERE verificacion_id = ${verificacionId} ORDER BY id`;
        expect(hallazgos).toHaveLength(2);
        expect(hallazgos[0]).toMatchObject({
          origen: "verificacion",
          estado: "abierto",
          retirado_en_el_acto: false,
          descripcion: vigente.texto,
        });
        expect([Number(hallazgos[0].item_id), Number(hallazgos[0].documento_id)]).toEqual([vigente.id, viva.documento.id]);
        expect(hallazgos[1]).toMatchObject({ retirado_en_el_acto: true, descripcion: "Sin documentos obsoletos a la vista: Había una guía vieja", copia_id: null });
        for (const h of hallazgos) {
          expect([Number(h.punto_uso_id), Number(h.responsable_id)]).toEqual([punto.id, resp.usuarioId]);
          expect(h.vence_en).toEqual(fechaLimite(T1, plazo, zonaHoraria()));
        }
        expect(await ultimoAviso(tx, resp.usuarioId)).toEqual({
          tipo: "distribucion.hallazgo",
          titulo: expect.stringContaining(punto.nombre),
          enlace: `/distribucion/verificaciones/${verificacionId}`,
        });

        // La copia obsoleta que ya no estaba queda recogida en la misma operación.
        expect(await obtenerCopia(obsoleta, admin, { sql: tx })).toMatchObject({ estado: "recogida", destinoRecogida: "retirada_en_verificacion" });
        const [evento] = await tx`SELECT usuario_id, detalle, creado_en FROM copia_eventos WHERE copia_id = ${obsoleta} AND tipo = 'recogida'`;
        expect(evento.detalle).toEqual({ usuarioId: admin.usuarioId, destino: "retirada_en_verificacion", verificacionId });
        expect(evento.creado_en).toEqual(T1);

        const [auditoria] = await tx`SELECT detalle FROM auditoria WHERE accion = 'verificacion_cerrada' AND entidad_id = ${verificacionId}`;
        expect(auditoria.detalle).toMatchObject({ puntoId: punto.id, conforme: false, hallazgos: 2 });

        // Cerrada, nada cambia: ni por la función ni por SQL directo (el trigger vale incluso para el dueño).
        await rechaza(guardarAvance(verificacionId, admin, [], { sql: tx }), "La verificación ya está cerrada");
        await rechaza(agregarItemLibre(verificacionId, admin, "Un ítem tardío", { sql: tx }), "La verificación ya está cerrada");
        await rechaza(cerrarVerificacion(verificacionId, admin, { retirados: [] }, { sql: tx }), "La verificación ya está cerrada");
        await expect(
          tx.savepoint((sp) => sp`UPDATE verificaciones SET conforme = true WHERE id = ${verificacionId}`),
        ).rejects.toMatchObject({ code: "42501" });
        await expect(
          tx.savepoint((sp) => sp`UPDATE verificacion_items SET respuesta = 'conforme' WHERE id = ${obsoletos.id}`),
        ).rejects.toMatchObject({ code: "42501" });
        await expect(
          tx.savepoint((sp) => sp`DELETE FROM verificacion_items WHERE id = ${obsoletos.id}`),
        ).rejects.toMatchObject({ code: "42501" });

        expect(await ultimaVerificacionDe(punto.id, { sql: tx })).toEqual({ cerradaEn: T1, conforme: false });
      } finally {
        await viva.limpiar();
        await vieja.limpiar();
      }
    }));

  it("un ítem de copia por recoger no conforme y sin retirar deja la copia por recoger; el no_aplica no cuenta", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const resp = await usuarioDePrueba(tx, { rol: "consulta" });
      const punto = await puntoDePrueba(tx, { responsable: resp, procesos: ["ATE"] });
      const vieja = await vigenteConPdf(tx, { proceso: "ATE", tipo: "FO" });
      try {
        const { copiaId } = await copiaDePrueba(tx, { emisor: admin, documento: vieja.documento, punto, ahora: T0 });
        await alDejarDeSerVigente(tx, vieja.versionId, "nueva_version", T0);
        const { verificacionId } = await abrirVerificacion(admin, punto.id, { sql: tx, ahora: T0 });
        const v = (await obtenerVerificacion(verificacionId, admin, { sql: tx }))!;
        await guardarAvance(
          verificacionId,
          admin,
          v.items.map((i) => ({ itemId: i.id, respuesta: i.origen === "copia_por_recoger" ? "no_conforme" : "no_aplica", nota: null })),
          { sql: tx },
        );
        expect(await cerrarVerificacion(verificacionId, admin, { retirados: [] }, { sql: tx, ahora: T1 })).toEqual({ conforme: false, hallazgos: 1 });
        expect((await obtenerCopia(copiaId, admin, { sql: tx }))?.estado).toBe("por_recoger");
      } finally {
        await vieja.limpiar();
      }
    }));

  it("con todo conforme no abre hallazgos y el punto queda conforme", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const resp = await usuarioDePrueba(tx, { rol: "consulta" });
      const punto = await puntoDePrueba(tx, { responsable: resp });
      const { verificacionId } = await abrirVerificacion(admin, punto.id, { sql: tx, ahora: T0 });
      const v = (await obtenerVerificacion(verificacionId, admin, { sql: tx }))!;
      await guardarAvance(verificacionId, admin, v.items.map((i) => ({ itemId: i.id, respuesta: "conforme", nota: null })), { sql: tx });
      expect(await cerrarVerificacion(verificacionId, admin, { retirados: [] }, { sql: tx, ahora: T1 })).toEqual({ conforme: true, hallazgos: 0 });
      expect(await hallazgosDe({ puntoId: punto.id }, admin, { sql: tx })).toEqual([]);
    }));
});

describe("descartar", () => {
  it("libera el punto y no deja efectos", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const resp = await usuarioDePrueba(tx, { rol: "consulta" });
      const punto = await puntoDePrueba(tx, { responsable: resp, procesos: ["ATE"] });
      const { documento, limpiar } = await vigenteConPdf(tx, { proceso: "ATE", tipo: "PR" });
      try {
        const { copiaId } = await copiaDePrueba(tx, { emisor: admin, documento, punto });
        const { verificacionId } = await abrirVerificacion(admin, punto.id, { sql: tx, ahora: T0 });
        const v = (await obtenerVerificacion(verificacionId, admin, { sql: tx }))!;
        await guardarAvance(verificacionId, admin, [{ itemId: v.items[0].id, respuesta: "no_conforme", nota: "x" }], { sql: tx });

        await rechaza(descartarVerificacion(verificacionId, admin, "no", { sql: tx }), "Escriba el motivo (mínimo 5 caracteres)");
        await descartarVerificacion(verificacionId, admin, "  Se abrió en el punto equivocado ", { sql: tx, ahora: T1 });
        expect(await obtenerVerificacion(verificacionId, admin, { sql: tx })).toMatchObject({
          estado: "descartada",
          motivoDescarte: "Se abrió en el punto equivocado",
          puedeEditar: false,
          conforme: null,
        });
        expect(await tx`SELECT 1 FROM hallazgos WHERE punto_uso_id = ${punto.id}`).toHaveLength(0);
        expect((await obtenerCopia(copiaId, admin, { sql: tx }))?.estado).toBe("emitida");
        const [a] = await tx`SELECT detalle FROM auditoria WHERE accion = 'verificacion_descartada' AND entidad_id = ${verificacionId}`;
        expect(a.detalle).toMatchObject({ motivo: "Se abrió en el punto equivocado", puntoId: punto.id });

        await rechaza(descartarVerificacion(verificacionId, admin, "Otra vez, por favor", { sql: tx }), "La verificación fue descartada");
        await rechaza(guardarAvance(verificacionId, admin, [], { sql: tx }), "La verificación fue descartada");
        // El punto queda libre: la siguiente verificación es otra.
        const siguiente = await abrirVerificacion(admin, punto.id, { sql: tx });
        expect(siguiente.verificacionId).not.toBe(verificacionId);
        expect(await ultimaVerificacionDe(punto.id, { sql: tx })).toBeNull();
      } finally {
        await limpiar();
      }
    }));
});

describe("hallazgos", () => {
  it("el responsable cierra su hallazgo con nota; otro consulta recibe «no existe»", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const resp = await usuarioDePrueba(tx, { rol: "consulta" });
      const ajeno = await usuarioDePrueba(tx, { rol: "consulta" });
      const punto = await puntoDePrueba(tx, { responsable: resp });
      const { verificacionId } = await abrirVerificacion(admin, punto.id, { sql: tx, ahora: T0 });
      const v = (await obtenerVerificacion(verificacionId, admin, { sql: tx }))!;
      await guardarAvance(
        verificacionId,
        admin,
        v.items.map((i, n) => ({ itemId: i.id, respuesta: n === 0 ? "no_conforme" : "conforme", nota: null })),
        { sql: tx },
      );
      await cerrarVerificacion(verificacionId, admin, { retirados: [] }, { sql: tx, ahora: T0 });

      const [abierto] = await hallazgosAbiertosDe(resp.usuarioId, { sql: tx });
      expect(abierto).toMatchObject({ estado: "abierto", verificacionId, responsable: { id: resp.usuarioId } });
      expect(await hallazgosAbiertosDe(ajeno.usuarioId, { sql: tx })).toEqual([]);
      expect(await hallazgosDe({}, ajeno, { sql: tx })).toEqual([]);
      expect((await hallazgosDe({ estado: "abierto" }, resp, { sql: tx })).map((h) => h.id)).toEqual([abierto.id]);

      await rechaza(cerrarHallazgo(abierto.id, ajeno, "Ya se corrigió todo", { sql: tx }), "El hallazgo no existe");
      await rechaza(cerrarHallazgo(abierto.id, resp, "abc", { sql: tx }), "Escriba qué se hizo para corregirlo (mínimo 5 caracteres)");
      await cerrarHallazgo(abierto.id, resp, "  Se retiró la guía vieja  ", { sql: tx, ahora: T1 });
      const [cerrado] = await hallazgosDe({ puntoId: punto.id, estado: "cerrado" }, resp, { sql: tx });
      expect(cerrado.cierre).toEqual({ en: T1, por: resp.nombre, nota: "Se retiró la guía vieja" });
      await rechaza(cerrarHallazgo(abierto.id, resp, "Otra vez, por favor", { sql: tx }), "El hallazgo ya está cerrado");
      expect(await hallazgosAbiertosDe(resp.usuarioId, { sql: tx })).toEqual([]);
      const [a] = await tx`SELECT usuario_id FROM auditoria WHERE accion = 'hallazgo_cerrado' AND entidad_id = ${abierto.id}`;
      expect(Number(a.usuario_id)).toBe(resp.usuarioId);
    }));
});

describe("quién ve la verificación", () => {
  it("Admin, el líder del proceso del punto y su responsable; los demás, nada", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const resp = await usuarioDePrueba(tx, { rol: "consulta" });
      const punto = await puntoDePrueba(tx, { responsable: resp, procesos: ["ATE"] });
      const [{ id: ate }] = await tx`SELECT id FROM procesos WHERE sigla = 'ATE'`;
      const [{ id: gth }] = await tx`SELECT id FROM procesos WHERE sigla = 'GTH'`;
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [Number(ate)] });
      const otroLider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [Number(gth)] });
      const { verificacionId } = await abrirVerificacion(admin, punto.id, { sql: tx });

      for (const sesion of [admin, resp, lider, await usuarioDePrueba(tx, { rol: "gerencia" }), await usuarioDePrueba(tx, { rol: "control_interno" })]) {
        expect((await obtenerVerificacion(verificacionId, sesion, { sql: tx }))?.id).toBe(verificacionId);
      }
      expect((await obtenerVerificacion(verificacionId, resp, { sql: tx }))?.puedeEditar).toBe(false);
      for (const sesion of [otroLider, await usuarioDePrueba(tx, { rol: "consulta" })]) {
        expect(await obtenerVerificacion(verificacionId, sesion, { sql: tx })).toBeNull();
      }
      expect(await obtenerVerificacion(987_654_321, admin, { sql: tx })).toBeNull();
    }));
});
