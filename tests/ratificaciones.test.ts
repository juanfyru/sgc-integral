/** La ratificación firmada (spec 13C §7.3): quién puede, qué escribe y qué no cambia. */
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { reunirDatosActa } from "@/db/consultas/actas";
import { registrarFirma } from "@/db/consultas/firmas";
import { leerFormatoCongelado } from "@/db/consultas/formato-acta";
import { ErrorFirma, type SesionFlujo } from "@/db/consultas/tramites-flujo";
import { ratificacionesDe, ratificar, validarRatificacion } from "@/db/consultas/vigencia/ratificaciones";
import { fijarProximaRevision, vigenciaDeDocumento } from "@/db/consultas/vigencia/semaforo";
import { generarActa } from "@/lib/acta";
import { hashearClave } from "@/lib/clave";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { sesionAdmin, sesionDe, tramiteEn } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";
import { firmaDePrueba, rutaAbsolutaDelPrincipal, sinRevisionAbierta, vigenteFuera } from "./utiles/vigencia";

const sql = obtenerSql();
const ZONA = "America/Bogota";
const ahora = new Date("2026-11-08T15:00:00Z");

const fallaCon = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: { code?: string }) => e.code ?? "sin-codigo",
  );

let almacen: string;
const previo = process.env.ALMACEN_RUTA;

beforeAll(() => {
  almacen = mkdtempSync(path.join(tmpdir(), "sgc-ratificaciones-"));
  process.env.ALMACEN_RUTA = almacen;
});

afterAll(async () => {
  if (previo === undefined) delete process.env.ALMACEN_RUTA;
  else process.env.ALMACEN_RUTA = previo;
  rmSync(almacen, { recursive: true, force: true });
  await sql.end();
  globalThis.__sql = undefined;
});

const ok = { clave: "ok" };

describe("ratificación", () => {
  it("el líder ratifica con clave: firma sin trámite, fila inmutable, reloj reiniciado y fecha fijada borrada", () =>
    revertida(sql, async (tx) => {
      await sinRevisionAbierta(tx);
      const d = await vigenteFuera(tx, { fechaAprobacion: "2025-08-14", proceso: "GTH" });
      const lider = await sesionDe(tx, "lider.gth");
      await fijarProximaRevision(await sesionAdmin(tx), { documentoIds: [d.id], fecha: "2027-03-01", nota: "x carga" }, { sql: tx, ahora });
      await tx`UPDATE documentos SET revision_aviso_en = now(), revision_escalado_en = now() WHERE id = ${d.id}`;
      const [{ actualizado_en: antes }] = await tx`SELECT actualizado_en FROM documentos WHERE id = ${d.id}`;

      const r = await ratificar(lider, { documentoId: d.id, nota: "Sin cambios", credenciales: ok }, { sql: tx, ahora, verificar: firmaDePrueba });
      expect(fechaEnZona(r.proximaRevision, ZONA)).toBe("2027-11-08");
      const [f] = await tx`SELECT tramite_id, firma, ronda, version_id, hash_sha256, metodo, usuario_id FROM firmas
        WHERE id = (SELECT firma_id FROM ratificaciones WHERE id = ${r.ratificacionId})`;
      expect(f).toMatchObject({ tramite_id: null, firma: "ratifico", ronda: 0, version_id: d.versionId, hash_sha256: d.hash, metodo: "clave", usuario_id: lider.usuarioId });
      const [doc] = await tx`SELECT proxima_revision_fijada, fijada_por, fijada_en, fijada_nota, revision_aviso_en, revision_escalado_en, actualizado_en
        FROM documentos WHERE id = ${d.id}`;
      expect(doc).toMatchObject({
        proxima_revision_fijada: null,
        fijada_por: null,
        fijada_en: null,
        fijada_nota: null,
        revision_aviso_en: null,
        revision_escalado_en: null,
      });
      // Ratificar no cambia el documento.
      expect(doc.actualizado_en).toEqual(antes);
      const [rat] = await tx`SELECT nota, proxima_revision::text AS proxima, revision_anual_id FROM ratificaciones WHERE id = ${r.ratificacionId}`;
      expect(rat).toEqual({ nota: "Sin cambios", proxima: "2027-11-08", revision_anual_id: null });
      expect(await fallaCon(tx.savepoint((s) => s`UPDATE ratificaciones SET nota = 'y' WHERE id = ${r.ratificacionId}`))).toBe("42501");

      const [a] = await tx`SELECT detalle FROM auditoria WHERE accion = 'documento_ratificado' AND entidad_id = ${d.id}`;
      expect(a.detalle).toEqual({ codigo: d.codigo, version: 1, nota: "Sin cambios", proximaRevision: "2027-11-08" });

      const lista = await ratificacionesDe(d.versionId, { sql: tx });
      expect(lista).toHaveLength(1);
      expect(lista[0]).toMatchObject({ id: r.ratificacionId, versionId: d.versionId, version: 1, nombre: lider.nombre, nota: "Sin cambios", revisionAnualId: null });
      expect(fechaEnZona(lista[0].proximaRevision, ZONA)).toBe("2027-11-08");

      const v = await vigenciaDeDocumento(d.id, lider, { sql: tx, ahora });
      expect(v!.ultimaRevision).toMatchObject({ clase: "ratificacion", quien: lider.nombre });
      expect(fechaEnZona(v!.proximaRevision!, ZONA)).toBe("2027-11-08");
      expect(v!.vigencia.estado).toBe("al_dia");
      expect(v!.ratificaciones.map((x) => x.id)).toEqual([r.ratificacionId]);
    }));

  it("Gerencia ratifica solo estratégicos; consulta y un líder ajeno no; con trámite abierto nadie", () =>
    revertida(sql, async (tx) => {
      await sinRevisionAbierta(tx);
      const gerente = await sesionDe(tx, "gerente");
      const operativo = await vigenteFuera(tx, { fechaAprobacion: "2025-08-14", proceso: "GTH" });
      const estrategico = await vigenteFuera(tx, { fechaAprobacion: "2025-08-14", proceso: "GTH", autoridad: "estrategico" });
      const deCex = await vigenteFuera(tx, { fechaAprobacion: "2025-08-14", proceso: "CEX" });
      const opciones = { sql: tx, ahora, verificar: firmaDePrueba };
      const intento = (s: SesionFlujo, documentoId: number) => ratificar(s, { documentoId, nota: null, credenciales: ok }, opciones);

      await expect(intento(gerente, operativo.id)).rejects.toThrow("No puede ratificar este documento");
      expect((await intento(gerente, estrategico.id)).ratificacionId).toBeGreaterThan(0);
      await expect(intento(await sesionDe(tx, "consulta"), deCex.id)).rejects.toThrow("No puede ratificar este documento");
      await expect(intento(await sesionDe(tx, "lider.cex"), operativo.id)).rejects.toThrow("No puede ratificar este documento");
      expect((await intento(await sesionDe(tx, "lider.cex"), deCex.id)).ratificacionId).toBeGreaterThan(0);

      // Con trámite abierto, ni el Admin SGC: el trámite ya es su revisión.
      await tramiteEn(tx, "elaboracion", { codigo: operativo.codigo });
      await expect(intento(await sesionAdmin(tx), operativo.id)).rejects.toThrow("El documento tiene un trámite abierto: el trámite ya es su revisión");

      // Lo que no se ve, un externo o lo que no está vigente no existe.
      await tx`UPDATE documentos SET nivel_acceso = 'restringido' WHERE id = ${deCex.id}`;
      await expect(intento(await sesionDe(tx, "lider.gth"), deCex.id)).rejects.toThrow("El documento no existe");
      await tx`UPDATE documentos SET origen = 'externo' WHERE id = ${estrategico.id}`;
      await expect(intento(await sesionAdmin(tx), estrategico.id)).rejects.toThrow("El documento no existe");
      await expect(intento(await sesionAdmin(tx), 999_999_999)).rejects.toThrow("El documento no existe");

      const sinPrincipal = await vigenteFuera(tx, { fechaAprobacion: "2025-08-14", proceso: "GTH" });
      await tx`DELETE FROM archivos WHERE version_id = ${sinPrincipal.versionId} AND rol = 'principal'`;
      await expect(validarRatificacion(tx, await sesionAdmin(tx), sinPrincipal.id)).rejects.toThrow("El documento no tiene archivo principal");
      // Ningún rechazo dejó firma; las dos que pasaron dejaron una cada una.
      expect((await tx`SELECT 1 FROM firmas WHERE version_id = ${operativo.versionId} AND firma = 'ratifico'`).length).toBe(0);
      const deGerencia = await tx`SELECT version_id FROM firmas WHERE usuario_id = ${gerente.usuarioId} AND firma = 'ratifico' AND version_id IN (${operativo.versionId}, ${estrategico.versionId}, ${deCex.versionId})`;
      expect(deGerencia.map((x) => x.version_id)).toEqual([estrategico.versionId]);
    }));

  it("una clave errada no escribe nada y cuenta como firma fallida", async () => {
    // La verificación real escribe en `usuarios` y `accesos` desde otra conexión: la cuenta va fuera de la
    // transacción, con nombre único, y no se borra; al terminar queda inactiva (su clave está en este archivo).
    const usuario = `zz_ratifica_${Date.now()}`;
    const [u] = await sql`INSERT INTO usuarios (usuario, nombre, hash_clave, rol, acepto_datos_en)
      VALUES (${usuario}, 'Prueba ratificación', ${await hashearClave("Clave-Ratifica-13C")}, 'admin_sgc', now()) RETURNING id`;
    const sesion: SesionFlujo = { sesionId: `prueba-${u.id}`, usuarioId: Number(u.id), usuario, nombre: "Prueba ratificación", rol: "admin_sgc", verHistorial: false };
    try {
      await revertida(sql, async (tx) => {
        await sinRevisionAbierta(tx);
        const d = await vigenteFuera(tx, { fechaAprobacion: "2025-08-14" });
        await fijarProximaRevision(await sesionAdmin(tx), { documentoIds: [d.id], fecha: "2027-03-01", nota: "carga inicial" }, { sql: tx, ahora });
        const fallo = await ratificar(sesion, { documentoId: d.id, nota: null, credenciales: { clave: "mala-clave-larga" } }, { sql: tx, ahora }).catch((e: unknown) => e);
        expect(fallo).toBeInstanceOf(ErrorFirma);
        expect(fallo).toMatchObject({ message: "Clave o código incorrectos", sesionCerrada: false });
        expect((await tx`SELECT 1 FROM ratificaciones WHERE version_id = ${d.versionId}`).length).toBe(0);
        expect((await tx`SELECT 1 FROM firmas WHERE version_id = ${d.versionId}`).length).toBe(0);
        expect((await tx`SELECT 1 FROM auditoria WHERE accion = 'documento_ratificado' AND entidad_id = ${d.id}`).length).toBe(0);
        const [doc] = await tx`SELECT proxima_revision_fijada::text AS fijada FROM documentos WHERE id = ${d.id}`;
        expect(doc.fijada).toBe("2027-03-01");

        // Con la verificación de prueba tampoco escribe, y el verificador sí se consultó.
        const verificar = vi.fn(firmaDePrueba);
        await expect(ratificar(sesion, { documentoId: d.id, nota: null, credenciales: { clave: "mala" } }, { sql: tx, ahora, verificar })).rejects.toBeInstanceOf(ErrorFirma);
        expect(verificar).toHaveBeenCalledTimes(1);
        expect((await tx`SELECT 1 FROM ratificaciones WHERE version_id = ${d.versionId}`).length).toBe(0);
      });
      const [acceso] = await sql`SELECT resultado FROM accesos WHERE usuario_id = ${u.id} ORDER BY id DESC LIMIT 1`;
      expect(acceso.resultado).toBe("firma_fallo");
      const [cuenta] = await sql`SELECT intentos_fallidos FROM usuarios WHERE id = ${u.id}`;
      expect(cuenta.intentos_fallidos).toBe(1);
    } finally {
      await sql`UPDATE usuarios SET activo = false WHERE id = ${u.id}`;
    }
  });

  it("si el archivo en disco cambió, rechaza y deja ratificacion_rechazada", () =>
    revertida(sql, async (tx) => {
      await sinRevisionAbierta(tx);
      const d = await vigenteFuera(tx, { fechaAprobacion: "2025-08-14" });
      try {
        await writeFile(rutaAbsolutaDelPrincipal(d), new Uint8Array([1, 2, 3]));
        const enDisco = createHash("sha256").update(new Uint8Array([1, 2, 3])).digest("hex");
        await expect(
          ratificar(await sesionAdmin(tx), { documentoId: d.id, nota: null, credenciales: ok }, { sql: tx, ahora, verificar: firmaDePrueba }),
        ).rejects.toThrow("El archivo en disco no coincide con el registrado; avise al Administrador del SGC");
        const [a] = await tx`SELECT detalle FROM auditoria WHERE accion = 'ratificacion_rechazada' AND entidad_id = ${d.id}`;
        expect(a).toBeTruthy();
        expect(a.detalle).toEqual({ codigo: d.codigo, huellaRegistrada: d.hash, huellaEnDisco: enDisco });
        expect((await tx`SELECT 1 FROM firmas WHERE version_id = ${d.versionId} AND firma = 'ratifico'`).length).toBe(0);
        expect((await tx`SELECT 1 FROM ratificaciones WHERE version_id = ${d.versionId}`).length).toBe(0);
      } finally {
        await d.limpiar();
      }
    }));

  it("el acta registrada de un trámite no cambia con firmas sin trámite en la base", async (ctx) => {
    // El membrete del acta vive en el almacén real, no en la carpeta temporal de este archivo.
    const temporal = process.env.ALMACEN_RUTA;
    if (previo === undefined) delete process.env.ALMACEN_RUTA;
    else process.env.ALMACEN_RUTA = previo;
    try {
      await revertida(sql, async (tx) => {
        const actas = await tx`SELECT t.id AS tramite_id, t.numero, t.version_id, t.ronda, a.hash_sha256
          FROM tramites t
          JOIN archivos a ON a.version_id = t.version_id AND a.rol = 'acta_aprobacion'
          WHERE t.etapa = 'publicado'
          ORDER BY t.id`;
        let probada: string | null = null;
        for (const acta of actas) {
          // Firmas «Ratificó» sobre la misma versión del acta: la que deja una ratificación (ronda 0) y una con
          // la ronda del trámite, que el acta tomaría si mirara la versión en lugar del trámite.
          const admin = await sesionAdmin(tx);
          for (const ronda of [0, Number(acta.ronda)]) {
            await registrarFirma(tx, {
              tramiteId: null,
              versionId: Number(acta.version_id),
              usuarioId: admin.usuarioId,
              firma: "ratifico",
              ronda,
              hashSha256: "0".repeat(64),
              metodo: "clave",
              contexto: { ip: null, userAgent: null },
              ahora,
            });
          }
          const datos = await reunirDatosActa(Number(acta.tramite_id), { sql: tx });
          if (!datos) continue;
          const membrete = datos.formato ? await leerFormatoCongelado(datos.formato, { sql: tx }) : null;
          if (datos.formato && !membrete) continue;
          const bytes = await generarActa(datos, membrete);
          expect(createHash("sha256").update(bytes).digest("hex"), `acta de ${acta.numero}`).toBe(acta.hash_sha256);
          probada = acta.numero;
          break;
        }
        if (!probada) ctx.skip("No hay en la base un acta registrada que se pueda regenerar (falta el acta o su membrete).");
      });
    } finally {
      process.env.ALMACEN_RUTA = temporal;
    }
  });
});
