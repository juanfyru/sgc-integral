/**
 * El cierre de un hallazgo en dos pasos (spec 13C §12.5): el responsable marca «Corregido» y el hallazgo queda por
 * validar; el Admin SGC lo valida o lo reabre, o lo valida sola la siguiente verificación del punto. Contra la BD de
 * desarrollo, dentro de transacciones que se revierten: cada caso crea su punto, su documento y su hallazgo.
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { registrarArchivo } from "@/db/consultas/admin";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import { ErrorTramite, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import {
  autorizarFotoDeHallazgo,
  cerrarHallazgo,
  corregirHallazgo,
  hallazgosDe,
  obtenerHallazgo,
  reabrirHallazgo,
  validarHallazgo,
} from "@/db/consultas/distribucion/hallazgos";
import { tareasDeHallazgos, tareasDeValidacion } from "@/db/consultas/distribucion/tareas";
import {
  abrirVerificacion,
  cerrarVerificacion,
  guardarAvance,
  obtenerVerificacion,
} from "@/db/consultas/distribucion/verificaciones";
import { estadoDePuntos, historialVerificaciones } from "@/db/consultas/distribucion/verificaciones-resumen";
import { ErrorDistribucion, type RespuestaItem } from "@/lib/distribucion/tipos";
import { ErrorPermiso } from "@/lib/permisos";
import { misTareas } from "@/lib/tareas";
import { fechaLimite } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { copiaDePrueba, puntoDePrueba, verificarPunto, vigenteConPdf } from "./utiles/distribucion";
import { sesionAdmin, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();
const T0 = new Date("2026-11-12T15:00:00Z");
const ahora = new Date("2026-11-14T15:00:00Z");
const despues = new Date("2026-11-20T15:00:00Z");

let almacen: string;
const previo = process.env.ALMACEN_RUTA;

beforeAll(() => {
  almacen = mkdtempSync(path.join(tmpdir(), "sgc-hallazgos-"));
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

const avisos = async (tx: TransactionSql, usuarioId: number, tipo: string) =>
  tx`SELECT titulo, enlace, entidad_id FROM notificaciones WHERE usuario_id = ${usuarioId} AND tipo = ${tipo} ORDER BY id`;

/** Cierra una verificación con la respuesta de cada ítem que diga `respuesta` (por defecto, conforme). */
async function verificar(
  tx: TransactionSql,
  verificador: SesionFlujo,
  punto: { id: number },
  cuando: Date,
  respuesta: (i: { copiaId: number | null; texto: string }) => RespuestaItem = () => "conforme",
): Promise<number> {
  const { verificacionId } = await abrirVerificacion(verificador, punto.id, { sql: tx, ahora: cuando });
  const v = (await obtenerVerificacion(verificacionId, verificador, { sql: tx }))!;
  await guardarAvance(verificacionId, verificador, v.items.map((i) => ({ itemId: i.id, respuesta: respuesta(i), nota: null })), { sql: tx });
  await cerrarVerificacion(verificacionId, verificador, { sql: tx, ahora: cuando });
  return verificacionId;
}

/**
 * Un punto con dos copias de documentos distintos y un hallazgo abierto por la primera («está» no conforme), con su
 * responsable, el Admin SGC que verificó y la verificación que lo abrió.
 */
async function hallazgoDePrueba(tx: TransactionSql) {
  const admin = await sesionAdmin(tx);
  const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
  const punto = await puntoDePrueba(tx, { responsable, procesos: ["ATE"] });
  const a = await vigenteConPdf(tx, { proceso: "ATE", tipo: "PR" });
  const b = await vigenteConPdf(tx, { proceso: "ATE", tipo: "FO" });
  const copiaA = await copiaDePrueba(tx, { emisor: admin, documento: a.documento, punto, ahora: T0 });
  const copiaB = await copiaDePrueba(tx, { emisor: admin, documento: b.documento, punto, ahora: T0 });
  const esLaA = (i: { copiaId: number | null; texto: string }) => i.copiaId === copiaA.copiaId && i.texto.endsWith(": está");
  const verificacionId = await verificar(tx, admin, punto, T0, (i) => (esLaA(i) ? "no_conforme" : "conforme"));
  const [h] = await tx`SELECT id FROM hallazgos WHERE verificacion_id = ${verificacionId}`;
  return {
    admin,
    responsable,
    punto,
    verificacionId,
    hallazgoId: Number(h.id),
    copias: { a: copiaA.copiaId, b: copiaB.copiaId },
    documentos: { a: a.documento, b: b.documento },
    limpiar: async () => {
      await a.limpiar();
      await b.limpiar();
    },
  };
}

describe("corregir, validar y reabrir", () => {
  it("el responsable marca corregido, el hallazgo pasa a por validar y el Admin lo valida o lo reabre", () =>
    revertida(sql, async (tx) => {
      const c = await hallazgoDePrueba(tx);
      const { hallazgoId, responsable, admin } = c;
      try {
        const otroAdmin = await sesionAdmin(tx);
        const plazo = (await obtenerConfigDocumental({ sql: tx })).distribucion.plazoCorreccionDias;
        await rechaza(corregirHallazgo(hallazgoId, responsable, "abc", { sql: tx, ahora }), "Escriba qué se hizo para corregirlo (mínimo 5 caracteres)");

        await corregirHallazgo(hallazgoId, responsable, "  Retiré la copia vieja  ", { sql: tx, ahora });
        expect((await tx`SELECT estado FROM hallazgos WHERE id = ${hallazgoId}`)[0].estado).toBe("por_validar");
        const [corregido] = await tx`SELECT corregido_en, corregido_por, nota_correccion FROM hallazgos WHERE id = ${hallazgoId}`;
        expect([corregido.corregido_en, Number(corregido.corregido_por), corregido.nota_correccion]).toEqual([ahora, responsable.usuarioId, "Retiré la copia vieja"]);
        const [auditoria] = await tx`SELECT usuario_id, detalle FROM auditoria WHERE accion = 'hallazgo_corregido' AND entidad_id = ${hallazgoId}`;
        expect(Number(auditoria.usuario_id)).toBe(responsable.usuarioId);
        expect(auditoria.detalle).toMatchObject({
          puntoId: c.punto.id,
          punto: c.punto.nombre,
          verificacionId: c.verificacionId,
          documento: c.documentos.a.codigo,
          copiaId: c.copias.a,
          copia: `N.º 01 de ${c.documentos.a.codigo} v1`,
          nota: "Retiré la copia vieja",
        });
        // El aviso llega a los Admin SGC; nadie se avisa a sí mismo.
        for (const a of [admin, otroAdmin]) {
          expect(await avisos(tx, a.usuarioId, "hallazgo.por_validar")).toEqual([
            { titulo: `Validar la corrección del hallazgo en ${c.punto.nombre}`, enlace: `/distribucion/verificaciones/${c.verificacionId}`, entidad_id: hallazgoId },
          ]);
        }
        expect(await avisos(tx, responsable.usuarioId, "hallazgo.por_validar")).toHaveLength(0);

        const tarea = (await tareasDeValidacion(admin, { sql: tx })).find((t) => t.id === `validar:${hallazgoId}`);
        expect(tarea).toMatchObject({
          titulo: `Validar la corrección del hallazgo en ${c.punto.nombre}`,
          vence: fechaLimite(ahora, plazo, zonaHoraria()),
          enlace: `/distribucion/verificaciones/${c.verificacionId}`,
        });
        expect(await tareasDeValidacion(responsable, { sql: tx })).toEqual([]);
        // «Mis tareas» la suma para quien valida.
        expect((await misTareas(admin, { sql: tx, ahora })).tareas.map((t) => t.id)).toContain(`validar:${hallazgoId}`);
        expect((await tareasDeHallazgos(responsable, { sql: tx })).map((t) => t.id)).not.toContain(`hallazgo:${hallazgoId}`);
        await rechaza(corregirHallazgo(hallazgoId, responsable, "Otra vez lo corregí", { sql: tx, ahora }), "El hallazgo ya está por validar");

        await rechaza(reabrirHallazgo(hallazgoId, admin, "no", { sql: tx, ahora: despues }), "Escriba por qué se reabre (mínimo 5 caracteres)");
        await reabrirHallazgo(hallazgoId, admin, "La copia sigue ahí", { sql: tx, ahora: despues });
        expect((await tx`SELECT estado, reaperturas FROM hallazgos WHERE id = ${hallazgoId}`)[0]).toMatchObject({ estado: "abierto", reaperturas: 1 });
        const [reabierto] = await tx`SELECT vence_en, corregido_en, corregido_por, nota_correccion, aviso_vencido_en, escalado_en
          FROM hallazgos WHERE id = ${hallazgoId}`;
        expect(reabierto).toMatchObject({ vence_en: fechaLimite(despues, plazo, zonaHoraria()), corregido_en: null, corregido_por: null, nota_correccion: null, aviso_vencido_en: null, escalado_en: null });
        const [reapertura] = await tx`SELECT usuario_id, detalle FROM auditoria WHERE accion = 'hallazgo_reabierto' AND entidad_id = ${hallazgoId}`;
        expect(Number(reapertura.usuario_id)).toBe(admin.usuarioId);
        expect(reapertura.detalle).toMatchObject({ nota: "La copia sigue ahí", notaCorreccion: "Retiré la copia vieja", reaperturas: 1, reabiertoPor: "admin", verificacionQueReabre: null });
        const [devuelto] = (await avisos(tx, responsable.usuarioId, "distribucion.hallazgo")).slice(-1);
        expect(devuelto.titulo).toBe(`Se reabrió el hallazgo en ${c.punto.nombre}: La copia sigue ahí`);
        expect((await tareasDeHallazgos(responsable, { sql: tx })).map((t) => t.id)).toContain(`hallazgo:${hallazgoId}`);
        expect((await tareasDeValidacion(admin, { sql: tx })).map((t) => t.id)).not.toContain(`validar:${hallazgoId}`);

        await corregirHallazgo(hallazgoId, responsable, "Ahora sí", { sql: tx, ahora: despues });
        await validarHallazgo(hallazgoId, admin, { sql: tx, ahora: despues });
        expect((await tx`SELECT estado, validacion FROM hallazgos WHERE id = ${hallazgoId}`)[0]).toMatchObject({ estado: "cerrado", validacion: "admin" });
        const [cerrado] = await hallazgosDe({ puntoId: c.punto.id, estado: "cerrado" }, admin, { sql: tx });
        expect(cerrado).toMatchObject({ estado: "cerrado", validacion: "admin", reaperturas: 1, cierre: { en: despues, por: admin.nombre, nota: "Ahora sí" } });
        const [validado] = await tx`SELECT detalle FROM auditoria WHERE accion = 'hallazgo_validado' AND entidad_id = ${hallazgoId}`;
        expect(validado.detalle).toMatchObject({ validacion: "admin", verificacionQueValida: null, nota: "Ahora sí", verificacionId: c.verificacionId });
        expect((await tareasDeValidacion(admin, { sql: tx })).map((t) => t.id)).not.toContain(`validar:${hallazgoId}`);
        await rechaza(validarHallazgo(hallazgoId, admin, { sql: tx }), "El hallazgo no está por validar");
      } finally {
        await c.limpiar();
      }
    }));

  it("validar y reabrir exigen verificaciones.realizar; quien corrigió no valida su propia corrección", () =>
    revertida(sql, async (tx) => {
      const c = await hallazgoDePrueba(tx);
      try {
        await rechaza(validarHallazgo(c.hallazgoId, c.admin, { sql: tx }), "El hallazgo no está por validar");
        await corregirHallazgo(c.hallazgoId, c.responsable, "Retiré la copia vieja", { sql: tx, ahora });
        await expect(validarHallazgo(c.hallazgoId, c.responsable, { sql: tx })).rejects.toBeInstanceOf(ErrorPermiso);
        await expect(reabrirHallazgo(c.hallazgoId, c.responsable, "Sigue igual", { sql: tx })).rejects.toBeInstanceOf(ErrorPermiso);
        await reabrirHallazgo(c.hallazgoId, c.admin, "Falta la foto", { sql: tx, ahora });

        // El Admin SGC corrige como quien gestiona la distribución: otra persona valida.
        await corregirHallazgo(c.hallazgoId, c.admin, "La retiré yo mismo", { sql: tx, ahora });
        expect((await tareasDeValidacion(c.admin, { sql: tx })).map((t) => t.id)).not.toContain(`validar:${c.hallazgoId}`);
        await rechaza(validarHallazgo(c.hallazgoId, c.admin, { sql: tx }), "Quien corrigió el hallazgo no puede validarlo");
        const otro = await sesionAdmin(tx);
        expect((await tareasDeValidacion(otro, { sql: tx })).map((t) => t.id)).toContain(`validar:${c.hallazgoId}`);
        await validarHallazgo(c.hallazgoId, otro, { sql: tx, ahora });
        expect((await tx`SELECT estado FROM hallazgos WHERE id = ${c.hallazgoId}`)[0].estado).toBe("cerrado");
      } finally {
        await c.limpiar();
      }
    }));

  it("cerrar directamente queda para quien gestiona, desde abierto o por validar, con validación del Admin", () =>
    revertida(sql, async (tx) => {
      const c = await hallazgoDePrueba(tx);
      try {
        await expect(cerrarHallazgo(c.hallazgoId, c.responsable, "Ya se corrigió todo", { sql: tx })).rejects.toBeInstanceOf(ErrorPermiso);
        await corregirHallazgo(c.hallazgoId, c.responsable, "Retiré la copia vieja", { sql: tx, ahora });
        await cerrarHallazgo(c.hallazgoId, c.admin, "Cerrado en el comité", { sql: tx, ahora: despues });
        expect((await tx`SELECT estado, validacion, nota_cierre FROM hallazgos WHERE id = ${c.hallazgoId}`)[0]).toMatchObject({
          estado: "cerrado",
          validacion: "admin",
          nota_cierre: "Cerrado en el comité",
        });
        const [a] = await tx`SELECT detalle FROM auditoria WHERE accion = 'hallazgo_cerrado' AND entidad_id = ${c.hallazgoId}`;
        expect(a.detalle).toMatchObject({ estadoPrevio: "por_validar", nota: "Cerrado en el comité" });
        await rechaza(cerrarHallazgo(c.hallazgoId, c.admin, "Otra vez, por favor", { sql: tx }), "El hallazgo ya está cerrado");
      } finally {
        await c.limpiar();
      }
    }));
});

describe("validación por la siguiente verificación", () => {
  it("la siguiente verificación conforme valida sola; una con el mismo documento no conforme lo reabre", () =>
    revertida(sql, async (tx) => {
      const c = await hallazgoDePrueba(tx);
      try {
        await corregirHallazgo(c.hallazgoId, c.responsable, "Retiré la copia vieja", { sql: tx, ahora });
        const siguiente = (await verificarPunto(tx, { verificador: c.admin, punto: c.punto, ahora: despues })).verificacionId;
        expect((await tx`SELECT estado, validacion, validacion_verificacion_id, cerrado_por, cerrado_en, nota_cierre FROM hallazgos WHERE id = ${c.hallazgoId}`)[0]).toMatchObject({
          estado: "cerrado",
          validacion: "verificacion",
          validacion_verificacion_id: siguiente,
          cerrado_por: c.admin.usuarioId,
          cerrado_en: despues,
          nota_cierre: "Retiré la copia vieja",
        });
        const [validado] = await tx`SELECT usuario_id, detalle FROM auditoria WHERE accion = 'hallazgo_validado' AND entidad_id = ${c.hallazgoId}`;
        expect(validado.detalle).toMatchObject({ validacion: "verificacion", verificacionQueValida: siguiente });
        const [cierre] = await tx`SELECT detalle FROM auditoria WHERE accion = 'verificacion_cerrada' AND entidad_id = ${siguiente}`;
        expect(cierre.detalle).toMatchObject({ hallazgosValidados: 1, hallazgosReabiertos: 0 });

        // Otro por validar del mismo punto, y la siguiente verificación vuelve a encontrar no conforme su documento.
        const t2 = new Date("2026-11-21T15:00:00Z");
        const t3 = new Date("2026-11-22T15:00:00Z");
        const segunda = await verificar(tx, c.admin, c.punto, t2, (i) => (i.copiaId === c.copias.b && i.texto.endsWith(": legible") ? "no_conforme" : "conforme"));
        const [otro] = await tx`SELECT id FROM hallazgos WHERE verificacion_id = ${segunda}`;
        await corregirHallazgo(Number(otro.id), c.responsable, "Cambié la copia", { sql: tx, ahora: t2 });
        const tercera = await verificar(tx, c.admin, c.punto, t3, (i) => (i.copiaId === c.copias.b && i.texto.endsWith(": es la versión vigente") ? "no_conforme" : "conforme"));
        expect((await tx`SELECT estado, reaperturas, validacion FROM hallazgos WHERE id = ${otro.id}`)[0]).toMatchObject({ estado: "abierto", reaperturas: 1, validacion: null });
        const [reabierto] = await tx`SELECT detalle FROM auditoria WHERE accion = 'hallazgo_reabierto' AND entidad_id = ${otro.id}`;
        expect(reabierto.detalle).toMatchObject({
          nota: "sigue no conforme en la verificación del 22 nov 2026",
          reabiertoPor: "verificacion",
          verificacionQueReabre: tercera,
          verificacionId: segunda,
        });
        // El ítem no conforme abre además su hallazgo nuevo, que sigue abierto: el mismo cierre no lo valida.
        const nuevos = await tx`SELECT estado, validacion FROM hallazgos WHERE verificacion_id = ${tercera}`;
        expect(nuevos).toEqual([{ estado: "abierto", validacion: null }]);
        const [cierreTercera] = await tx`SELECT detalle FROM auditoria WHERE accion = 'verificacion_cerrada' AND entidad_id = ${tercera}`;
        expect(cierreTercera.detalle).toMatchObject({ hallazgos: 1, hallazgosValidados: 0, hallazgosReabiertos: 1 });
      } finally {
        await c.limpiar();
      }
    }));

  it("un mismo cierre valida unos por validar y reabre otros por sus propios ítems", () =>
    revertida(sql, async (tx) => {
      const c = await hallazgoDePrueba(tx);
      try {
        // Un segundo hallazgo, por la otra copia, abierto en otra verificación.
        const segunda = await verificar(tx, c.admin, c.punto, ahora, (i) => (i.copiaId === c.copias.b && i.texto.endsWith(": está") ? "no_conforme" : "conforme"));
        const [deB] = await tx`SELECT id FROM hallazgos WHERE verificacion_id = ${segunda}`;
        // La segunda verificación no encontró no conforme la copia A: el hallazgo de A, aún abierto, no se toca.
        expect((await tx`SELECT estado FROM hallazgos WHERE id = ${c.hallazgoId}`)[0].estado).toBe("abierto");
        await corregirHallazgo(c.hallazgoId, c.responsable, "Retiré la A", { sql: tx, ahora });
        await corregirHallazgo(Number(deB.id), c.responsable, "Retiré la B", { sql: tx, ahora });
        const tercera = await verificar(tx, c.admin, c.punto, despues, (i) => (i.copiaId === c.copias.b && i.texto.endsWith(": está") ? "no_conforme" : "conforme"));
        expect((await tx`SELECT estado, validacion FROM hallazgos WHERE id = ${c.hallazgoId}`)[0]).toMatchObject({ estado: "cerrado", validacion: "verificacion" });
        expect((await tx`SELECT estado, reaperturas FROM hallazgos WHERE id = ${deB.id}`)[0]).toMatchObject({ estado: "abierto", reaperturas: 1 });
        expect(await tx`SELECT estado FROM hallazgos WHERE verificacion_id = ${tercera}`).toEqual([{ estado: "abierto" }]);
      } finally {
        await c.limpiar();
      }
    }));
});

describe("quién corrige y qué cuenta", () => {
  it("otro usuario no corrige; por validar no cuenta en la conformidad", () =>
    revertida(sql, async (tx) => {
      const c = await hallazgoDePrueba(tx);
      try {
        const ajeno = await usuarioDePrueba(tx, { rol: "consulta" });
        const gerente = await usuarioDePrueba(tx, { rol: "gerencia" });
        await rechaza(corregirHallazgo(c.hallazgoId, ajeno, "Ya se corrigió todo", { sql: tx, ahora }), "El hallazgo no existe");
        await rechaza(corregirHallazgo(c.hallazgoId, gerente, "Ya se corrigió todo", { sql: tx, ahora }), "El hallazgo no existe");
        await rechaza(corregirHallazgo(987_654_321, c.responsable, "Ya se corrigió todo", { sql: tx, ahora }), "El hallazgo no existe");

        const abiertos = async () => (await estadoDePuntos(c.admin, { sql: tx, ahora })).puntos.find((p) => p.puntoId === c.punto.id)?.hallazgosAbiertos;
        const delHistorial = async () =>
          (await historialVerificaciones(c.admin, { puntoId: c.punto.id }, { sql: tx })).filas.find((f) => f.id === c.verificacionId)?.hallazgosAbiertos;
        expect(await abiertos()).toBe(1);
        expect(await delHistorial()).toBe(1);
        await corregirHallazgo(c.hallazgoId, c.responsable, "Retiré la copia vieja", { sql: tx, ahora });
        expect(await abiertos()).toBe(0);
        expect(await delHistorial()).toBe(0);
        expect((await hallazgosDe({ estado: "por_validar" }, c.admin, { sql: tx })).map((h) => h.id)).toContain(c.hallazgoId);

        // Las acciones que ofrece la pantalla de la verificación siguen la misma regla.
        const flags = async (s: SesionFlujo) => {
          const h = (await obtenerVerificacion(c.verificacionId, s, { sql: tx }))?.hallazgos[0];
          return h ? { corregir: h.puedeCorregir, validar: h.puedeValidar, cerrar: h.puedeCerrar } : null;
        };
        expect(await flags(c.responsable)).toEqual({ corregir: false, validar: false, cerrar: false });
        expect(await flags(c.admin)).toEqual({ corregir: false, validar: true, cerrar: true });
        expect(await flags(gerente)).toEqual({ corregir: false, validar: false, cerrar: false });
        await reabrirHallazgo(c.hallazgoId, c.admin, "Falta la foto", { sql: tx, ahora });
        expect(await flags(c.responsable)).toEqual({ corregir: true, validar: false, cerrar: false });
      } finally {
        await c.limpiar();
      }
    }));
});

describe("la foto de la corrección", () => {
  const foto = (hallazgoId: number, ruta: string) => ({
    versionId: null, contexto: "hallazgo", contextoId: hallazgoId, rol: "evidencia", ruta, nombreOriginal: "foto.png",
    extension: "png", mime: "image/png", tamanoBytes: 10, hashSha256: "c".repeat(64),
  });

  it("la sube el responsable o quien gestiona mientras no esté cerrado; la ve quien ve el hallazgo", () =>
    revertida(sql, async (tx) => {
      const c = await hallazgoDePrueba(tx);
      try {
        const ajeno = await usuarioDePrueba(tx, { rol: "consulta" });
        const gerente = await usuarioDePrueba(tx, { rol: "gerencia" });
        const op = { sql: tx };
        expect(await autorizarFotoDeHallazgo(c.hallazgoId, c.responsable, op)).toEqual({ ok: true });
        expect(await autorizarFotoDeHallazgo(c.hallazgoId, c.admin, op)).toEqual({ ok: true });
        expect(await autorizarFotoDeHallazgo(c.hallazgoId, gerente, op)).toEqual({ ok: false, estado: 403 });
        expect(await autorizarFotoDeHallazgo(c.hallazgoId, ajeno, op)).toEqual({ ok: false, estado: 404 });
        expect(await autorizarFotoDeHallazgo(987_654_321, c.admin, op)).toEqual({ ok: false, estado: 404 });

        const { id: fotoId } = await registrarArchivo(foto(c.hallazgoId, `hallazgos/${c.hallazgoId}/foto.png`), c.responsable.usuarioId, op);
        await corregirHallazgo(c.hallazgoId, c.responsable, "Retiré la copia vieja", { sql: tx, ahora });
        // Por validar todavía admite la foto; cerrado, no.
        expect(await autorizarFotoDeHallazgo(c.hallazgoId, c.responsable, op)).toEqual({ ok: true });
        expect((await obtenerHallazgo(c.hallazgoId, gerente, op))?.fotosCorreccion.map((f) => f.id)).toEqual([fotoId]);
        expect(await obtenerHallazgo(c.hallazgoId, ajeno, op)).toBeNull();
        const enLaVerificacion = (await obtenerVerificacion(c.verificacionId, c.admin, op))!.hallazgos[0];
        expect(enLaVerificacion.correccion).toMatchObject({ por: c.responsable.nombre, nota: "Retiré la copia vieja" });
        expect(enLaVerificacion.fotosCorreccion.map((f) => f.id)).toEqual([fotoId]);

        await validarHallazgo(c.hallazgoId, c.admin, { sql: tx, ahora });
        expect(await autorizarFotoDeHallazgo(c.hallazgoId, c.responsable, op)).toEqual({ ok: false, estado: 409 });
        await expect(registrarArchivo(foto(c.hallazgoId, `hallazgos/${c.hallazgoId}/otra.png`), c.responsable.usuarioId, op)).rejects.toSatisfy(
          (e) => e instanceof ErrorTramite && e.message === "El hallazgo ya está cerrado",
        );
      } finally {
        await c.limpiar();
      }
    }));
});
