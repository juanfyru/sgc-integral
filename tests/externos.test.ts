/**
 * Los documentos externos (spec 13C §8): alta, edición en borrador, adopción firmada, verificación de vigencia y
 * retiro. Corren dentro de una transacción que se revierte; los archivos van a un almacén temporal. Las funciones
 * del panel que abren su propia transacción (`publicarVersion`, `crearVersionBorrador`, `deshacerCarga`) reciben la
 * del test por `obtenerSql` mientras `enCurso.sql` la tiene.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const { enCurso } = vi.hoisted(() => ({ enCurso: { sql: null as unknown } }));

vi.mock("@/db/cliente", async (original) => {
  const real = await original<typeof import("@/db/cliente")>();
  return { ...real, obtenerSql: () => (enCurso.sql ?? real.obtenerSql()) as ReturnType<typeof real.obtenerSql> };
});

import { obtenerSql } from "@/db/cliente";
import {
  crearDocumento,
  crearVersionBorrador,
  descartarBorrador,
  deshacerCarga,
  editarControl,
  editarVersionBorrador,
  eliminarArchivoBorrador,
  publicarVersion,
  registrarArchivo,
} from "@/db/consultas/admin";
import { crearSolicitud, transicionar } from "@/db/consultas/tramites-flujo";
import { corregirDatosDeControl } from "@/db/consultas/tramites-gestion";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import {
  abrirEdicion,
  adoptarEdicion,
  autorizarArchivoDeEdicion,
  descartarEdicion,
  editarControlExterno,
  editarEdicion,
  esResponsableTecnico,
  listarExternos,
  obtenerExterno,
  registrarExterno,
  registrarVerificacion,
  retirarExterno,
  validarAdopcion,
} from "@/db/consultas/vigencia/externos";
import { vigenciaEnLista, vigenciaPorDocumento } from "@/db/consultas/vigencia/fragmentos";
import { listarSemaforo, vigenciaDeDocumento } from "@/db/consultas/vigencia/semaforo";
import { puedeVerExterno } from "@/lib/alcance";
import { EsquemaAdoptar, EsquemaControlExterno, EsquemaExterno, EsquemaRetirar, EsquemaVerificacion } from "@/lib/esquemas/vigencia";
import { parsearFormulario } from "@/lib/validacion";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { textoVigenciaDeFila } from "@/lib/vigencia/semaforo";
import { copiaDePrueba, puntoDePrueba } from "./utiles/distribucion";
import { aceptarCreacion, archivoPrincipal, opc, sesionAdmin, sesionDe, solicitudDeCreacion, tramiteEn, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";
import { datosExterno, externoDePrueba, firmaDePrueba, sinRevisionAbierta } from "./utiles/vigencia";

const sql = obtenerSql();
const ZONA = "America/Bogota";
const ahora = new Date("2026-11-08T15:00:00Z");
const ok = { clave: "ok" };
const NO_EXISTE = "El documento no existe";

const fallaCon = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: { code?: string }) => e.code ?? "sin-codigo",
  );

let almacen: string;
const previo = process.env.ALMACEN_RUTA;

beforeAll(() => {
  almacen = mkdtempSync(path.join(tmpdir(), "sgc-externos-"));
  process.env.ALMACEN_RUTA = almacen;
});

afterAll(async () => {
  if (previo === undefined) delete process.env.ALMACEN_RUTA;
  else process.env.ALMACEN_RUTA = previo;
  rmSync(almacen, { recursive: true, force: true });
  await sql.end();
  globalThis.__sql = undefined;
});

async function proceso(tx: TransactionSql, sigla: string): Promise<{ id: number }> {
  const [p] = await tx`SELECT id FROM procesos WHERE sigla = ${sigla}`;
  return { id: Number(p.id) };
}

const adoptar = (sesion: SesionFlujo, versionId: number, tx: TransactionSql, extra: { pedirAcuses?: boolean; requiereSocializacion?: boolean } = {}) =>
  adoptarEdicion(
    sesion,
    { versionId, pedirAcuses: extra.pedirAcuses ?? false, requiereSocializacion: extra.requiereSocializacion ?? false, credenciales: ok },
    { sql: tx, ahora, verificar: firmaDePrueba },
  );

const verificacion = (documentoId: number, resultado: "vigente" | "edicion_nueva" | "retirado", nota: string | null = null) => ({
  documentoId,
  resultado,
  fuente: "https://www.minsalud.gov.co/normatividad",
  nota,
});

describe("alta de un externo", () => {
  it("registra un externo con código DE, origen externo y edición, sin depender de la carga directa", () =>
    revertida(sql, async (tx) => {
      await tx`INSERT INTO configuracion (clave, valor) VALUES ('publicacion_directa', '0') ON CONFLICT (clave) DO UPDATE SET valor = '0'`;
      const lider = await sesionDe(tx, "lider.cex");
      const cex = await proceso(tx, "CEX");
      const r = await registrarExterno(
        lider,
        datosExterno({ procesoId: cex.id, responsableId: lider.usuarioId, edicion: "2017", fechaEdicion: "2017-05-02", tituloOriginal: "Guía original" }),
        { sql: tx, ahora },
      );
      expect(r.codigo).toMatch(/^CEX-DE-\d{2}$/);
      const [d] = await tx`SELECT d.origen, d.codigo, t.sigla FROM documentos d JOIN tipos_documento t ON t.id = d.tipo_id WHERE d.id = ${r.documentoId}`;
      expect(d).toMatchObject({ origen: "externo", codigo: r.codigo, sigla: "DE" });
      const [v] = await tx`SELECT numero, estado, edicion_externa, fecha_edicion_externa::text AS fecha FROM documento_versiones WHERE id = ${r.versionId}`;
      expect(v).toMatchObject({ numero: 1, estado: "borrador", edicion_externa: "2017", fecha: "2017-05-02" });
      const [ex] = await tx`SELECT entidad_emisora, titulo_original, responsable_id, verificacion_meses FROM externos WHERE documento_id = ${r.documentoId}`;
      expect(ex).toMatchObject({ entidad_emisora: "Ministerio de Salud y Protección Social", titulo_original: "Guía original", verificacion_meses: 12 });
      expect(Number(ex.responsable_id)).toBe(lider.usuarioId);
      const [a] = await tx`SELECT detalle FROM auditoria WHERE accion = 'externo_registrado' AND entidad_id = ${r.documentoId}`;
      expect(a.detalle).toMatchObject({ codigo: r.codigo, edicion: "2017" });

      // Con la carga directa cerrada también se adopta: la adopción es un camino propio.
      const { limpiar } = await archivoPrincipal(tx, r.versionId);
      try {
        const adopcion = await adoptar(lider, r.versionId, tx);
        expect(adopcion).toMatchObject({ documentoId: r.documentoId, numero: 1, obsoletas: [], acuses: 0 });
        const [vigente] = await tx`SELECT estado, origen_aprobacion, aprobo, fecha_aprobacion::text AS fecha, elaboro, reviso, publicado_en
          FROM documento_versiones WHERE id = ${r.versionId}`;
        expect(vigente).toMatchObject({ estado: "vigente", origen_aprobacion: "externo", fecha: "2026-11-08", elaboro: null, reviso: null });
        expect(vigente.aprobo).toContain(lider.nombre);
        expect(new Date(vigente.publicado_en).getTime()).toBe(ahora.getTime());
      } finally {
        await limpiar();
      }
    }));

  it("sin el tipo «Documento externo» activo no registra", () =>
    revertida(sql, async (tx) => {
      await tx`UPDATE tipos_documento SET activo = false WHERE sigla = 'DE'`;
      const lider = await sesionDe(tx, "lider.cex");
      const cex = await proceso(tx, "CEX");
      await expect(registrarExterno(lider, datosExterno({ procesoId: cex.id, responsableId: lider.usuarioId }), { sql: tx })).rejects.toThrow(
        "Falta el tipo de documento «Documento externo»",
      );
    }));

  it("el líder registra solo en sus procesos, Consulta no registra y el responsable técnico debe estar activo y poder verlo", () =>
    revertida(sql, async (tx) => {
      const lider = await sesionDe(tx, "lider.cex");
      const gth = await proceso(tx, "GTH");
      const cex = await proceso(tx, "CEX");
      await expect(registrarExterno(lider, datosExterno({ procesoId: gth.id, responsableId: lider.usuarioId }), { sql: tx })).rejects.toThrow(
        "Solo puede registrar externos de los procesos que lidera",
      );
      const consulta = await usuarioDePrueba(tx, { rol: "consulta", procesos: [cex.id] });
      await expect(registrarExterno(consulta, datosExterno({ procesoId: cex.id, responsableId: consulta.usuarioId }), { sql: tx })).rejects.toThrow(
        "Sin permiso para esta acción",
      );
      const inactivo = await usuarioDePrueba(tx, { rol: "consulta" });
      await tx`UPDATE usuarios SET activo = false WHERE id = ${inactivo.usuarioId}`;
      await expect(registrarExterno(lider, datosExterno({ procesoId: cex.id, responsableId: inactivo.usuarioId }), { sql: tx })).rejects.toThrow(
        "El responsable técnico debe ser un usuario activo",
      );
      const ajeno = await usuarioDePrueba(tx, { rol: "consulta" });
      await expect(
        registrarExterno(lider, datosExterno({ procesoId: cex.id, responsableId: ajeno.usuarioId, nivelAcceso: "restringido" }), { sql: tx }),
      ).rejects.toThrow("El responsable técnico no tiene acceso a este documento restringido");
    }));
});

describe("adopción", () => {
  it("adoptar la primera edición publica sin acuses; la segunda deja obsoleta la anterior, recoge copias y pide acuses", () =>
    revertida(sql, async (tx) => {
      const lider = await sesionDe(tx, "lider.cex");
      const e = await externoDePrueba(tx, lider, { proceso: "CEX", edicion: "2017", ahora });
      try {
        expect((await tx`SELECT 1 FROM acuses WHERE version_id = ${e.versionId}`).length).toBe(0);
        const [f] = await tx`SELECT firma, tramite_id, ronda, hash_sha256, usuario_id FROM firmas WHERE version_id = ${e.versionId}`;
        expect(f).toMatchObject({ firma: "adopto", tramite_id: null, ronda: 0, hash_sha256: e.hash });
        expect(Number(f.usuario_id)).toBe(lider.usuarioId);

        const punto = await puntoDePrueba(tx, { responsable: await usuarioDePrueba(tx, { rol: "consulta" }), procesos: ["CEX"] });
        await copiaDePrueba(tx, { emisor: lider, documento: { id: e.documentoId, codigo: e.codigo, titulo: e.titulo }, punto, ahora });
        const { versionId } = await abrirEdicion(
          lider,
          e.documentoId,
          { edicion: "2023", fechaEdicion: null, resumenCambios: "Nuevas metas de presión" },
          { sql: tx, ahora },
        );
        const r = await adoptarEdicion(
          lider,
          { versionId, pedirAcuses: false, requiereSocializacion: false, credenciales: ok },
          { sql: tx, ahora, verificar: firmaDePrueba },
        );
        expect(r.numero).toBe(2);
        expect(r.obsoletas).toEqual([1]);
        expect(r.acuses).toBeGreaterThan(0);
        expect((await tx`SELECT 1 FROM acuses WHERE version_id = ${versionId}`).length).toBe(r.acuses);
        const [c] = await tx`SELECT estado, motivo_por_recoger FROM copias_controladas WHERE version_id = ${e.versionId}`;
        expect(c).toMatchObject({ estado: "por_recoger", motivo_por_recoger: "nueva_version" });
        const [anterior] = await tx`SELECT estado FROM documento_versiones WHERE id = ${e.versionId}`;
        expect(anterior.estado).toBe("obsoleto");

        // Sin archivo principal, la firma guarda la huella de los datos de control.
        const [f2] = await tx`SELECT hash_sha256 FROM firmas WHERE version_id = ${versionId} AND firma = 'adopto'`;
        const esperada = createHash("sha256").update(`${e.codigo}|2023|Ministerio de Salud y Protección Social`).digest("hex");
        expect(f2.hash_sha256).toBe(esperada);
        const [a] = await tx`SELECT detalle FROM auditoria WHERE accion = 'externo_adoptado' AND entidad_id = ${e.documentoId} ORDER BY id DESC LIMIT 1`;
        expect(a.detalle).toMatchObject({ codigo: e.codigo, numero: 2, edicion: "2023", obsoletas: [1], acuses: r.acuses, verificacionId: null });
      } finally {
        await e.limpiar();
      }
    }));

  it("la primera adopción pide acuses y socialización solo si se marcan, y reinicia las marcas del externo", () =>
    revertida(sql, async (tx) => {
      const lider = await sesionDe(tx, "lider.cex");
      const cex = await proceso(tx, "CEX");
      const r = await registrarExterno(lider, datosExterno({ procesoId: cex.id, responsableId: lider.usuarioId }), { sql: tx, ahora });
      await tx`UPDATE externos SET edicion_nueva_pendiente_desde = now(), aviso_vencido_en = now(), escalado_en = now() WHERE documento_id = ${r.documentoId}`;
      const a = await adoptar(lider, r.versionId, tx, { pedirAcuses: true, requiereSocializacion: true });
      expect(a.acuses).toBeGreaterThan(0);
      expect((await tx`SELECT 1 FROM socializaciones_requeridas WHERE version_id = ${r.versionId}`).length).toBe(1);
      const [ex] = await tx`SELECT edicion_nueva_pendiente_desde, aviso_vencido_en, escalado_en FROM externos WHERE documento_id = ${r.documentoId}`;
      expect(ex).toMatchObject({ edicion_nueva_pendiente_desde: null, aviso_vencido_en: null, escalado_en: null });
    }));

  it("adoptar dos veces la misma edición falla la segunda; la carga directa rechaza un externo", () =>
    revertida(sql, async (tx) => {
      const lider = await sesionDe(tx, "lider.cex");
      const admin = await sesionAdmin(tx);
      const e = await externoDePrueba(tx, lider, { proceso: "CEX", edicion: "2017", ahora });
      try {
        await expect(adoptar(lider, e.versionId, tx)).rejects.toThrow("La edición ya no está en borrador");
        const { versionId } = await abrirEdicion(lider, e.documentoId, { edicion: "2023", fechaEdicion: null, resumenCambios: "Ajustes" }, { sql: tx, ahora });
        await expect(
          abrirEdicion(lider, e.documentoId, { edicion: "2024", fechaEdicion: null, resumenCambios: "Otra edición" }, { sql: tx, ahora }),
        ).rejects.toThrow("Ya hay una edición pendiente de adoptar");

        enCurso.sql = tx;
        try {
          const MENSAJE = "Un documento externo se adopta desde Vigencia → Externos";
          await expect(publicarVersion(versionId, admin.usuarioId)).rejects.toThrow(MENSAJE);
          await expect(crearVersionBorrador(e.documentoId, admin.usuarioId)).rejects.toThrow(MENSAJE);
          await expect(deshacerCarga(e.documentoId, "Se cargó por error", admin.usuarioId)).rejects.toThrow(MENSAJE);
        } finally {
          enCurso.sql = null;
        }
        const [v] = await tx`SELECT estado FROM documento_versiones WHERE id = ${versionId}`;
        expect(v.estado).toBe("borrador");
      } finally {
        await e.limpiar();
      }
    }));

  it("una edición nueva exige qué cambió, y quien no gestiona el externo no la ve", () =>
    revertida(sql, async (tx) => {
      const lider = await sesionDe(tx, "lider.cex");
      const e = await externoDePrueba(tx, lider, { proceso: "CEX", edicion: "2017", ahora });
      try {
        const { versionId } = await abrirEdicion(lider, e.documentoId, { edicion: "2023", fechaEdicion: null, resumenCambios: "Metas" }, { sql: tx, ahora });
        await expect(editarEdicion(lider, versionId, { edicion: "2023", fechaEdicion: null, resumenCambios: null }, { sql: tx })).rejects.toThrow(
          "Escriba qué cambió en esta edición",
        );
        await editarEdicion(lider, versionId, { edicion: "2023 rev. 1", fechaEdicion: "2023-03-01", resumenCambios: "Metas nuevas" }, { sql: tx });
        const [v] = await tx`SELECT edicion_externa, fecha_edicion_externa::text AS fecha, resumen_cambios FROM documento_versiones WHERE id = ${versionId}`;
        expect(v).toMatchObject({ edicion_externa: "2023 rev. 1", fecha: "2023-03-01", resumen_cambios: "Metas nuevas" });

        const validada = await validarAdopcion(tx, lider, versionId);
        expect(validada).toMatchObject({ documentoId: e.documentoId, codigo: e.codigo, numero: 2, esPrimera: false, hashPrincipal: null });

        const liderGth = await sesionDe(tx, "lider.gth");
        await expect(validarAdopcion(tx, liderGth, versionId)).rejects.toThrow(NO_EXISTE);
        await expect(validarAdopcion(tx, await sesionDe(tx, "gerente"), versionId)).rejects.toThrow(NO_EXISTE);
        await expect(adoptar(liderGth, versionId, tx)).rejects.toThrow(NO_EXISTE);
        // Una clave mala no escribe nada.
        await expect(
          adoptarEdicion(lider, { versionId, pedirAcuses: false, requiereSocializacion: false, credenciales: { clave: "mala" } }, { sql: tx, ahora, verificar: firmaDePrueba }),
        ).rejects.toThrow("Clave o código incorrectos");
        expect((await tx`SELECT 1 FROM firmas WHERE version_id = ${versionId}`).length).toBe(0);
      } finally {
        await e.limpiar();
      }
    }));

  it("un principal que cambió en disco no se adopta y el rechazo queda en la bitácora", () =>
    revertida(sql, async (tx) => {
      const lider = await sesionDe(tx, "lider.cex");
      const cex = await proceso(tx, "CEX");
      const r = await registrarExterno(lider, datosExterno({ procesoId: cex.id, responsableId: lider.usuarioId }), { sql: tx, ahora });
      const { archivoId, limpiar } = await archivoPrincipal(tx, r.versionId);
      try {
        await tx`UPDATE archivos SET hash_sha256 = ${"f".repeat(64)} WHERE id = ${archivoId}`;
        await expect(adoptar(lider, r.versionId, tx)).rejects.toThrow("El archivo en disco no coincide con el registrado; avise al Administrador del SGC");
        const [v] = await tx`SELECT estado FROM documento_versiones WHERE id = ${r.versionId}`;
        expect(v.estado).toBe("borrador");
        expect((await tx`SELECT 1 FROM firmas WHERE version_id = ${r.versionId}`).length).toBe(0);
        expect((await tx`SELECT 1 FROM auditoria WHERE accion = 'adopcion_rechazada' AND entidad_id = ${r.documentoId}`).length).toBe(1);
      } finally {
        await limpiar();
      }
    }));

  it("descartar la edición en borrador la deja descartada y permite abrir otra", () =>
    revertida(sql, async (tx) => {
      const lider = await sesionDe(tx, "lider.cex");
      const e = await externoDePrueba(tx, lider, { proceso: "CEX", edicion: "2017", ahora });
      try {
        const { versionId } = await abrirEdicion(lider, e.documentoId, { edicion: "2023", fechaEdicion: null, resumenCambios: "Metas" }, { sql: tx, ahora });
        const { documentoId } = await descartarEdicion(lider, versionId, { sql: tx });
        expect(documentoId).toBe(e.documentoId);
        const [v] = await tx`SELECT estado FROM documento_versiones WHERE id = ${versionId}`;
        expect(v.estado).toBe("descartado");
        expect((await tx`SELECT 1 FROM auditoria WHERE accion = 'externo_edicion_descartada' AND entidad_id = ${e.documentoId}`).length).toBe(1);
        await expect(descartarEdicion(lider, versionId, { sql: tx })).rejects.toThrow("La edición ya no está en borrador");
        const otra = await abrirEdicion(lider, e.documentoId, { edicion: "2024", fechaEdicion: null, resumenCambios: "Otra edición" }, { sql: tx, ahora });
        const [n] = await tx`SELECT numero FROM documento_versiones WHERE id = ${otra.versionId}`;
        expect(n.numero).toBe(2);
      } finally {
        await e.limpiar();
      }
    }));
});

describe("verificación y retiro", () => {
  it("la verificación la registra el responsable técnico: vigente reinicia; edición nueva avisa a quien gestiona; retirado anula con motivo retirado", () =>
    revertida(sql, async (tx) => {
      await sinRevisionAbierta(tx);
      const lider = await sesionDe(tx, "lider.cex");
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const otro = await usuarioDePrueba(tx, { rol: "consulta" });
      const e = await externoDePrueba(tx, lider, { proceso: "CEX", edicion: "2017", responsableId: responsable.usuarioId, ahora });
      try {
        expect(await puedeVerExterno(e.documentoId, responsable, { sql: tx })).toBe(true);
        expect(await puedeVerExterno(e.documentoId, otro, { sql: tx })).toBe(false);
        expect(await esResponsableTecnico(responsable.usuarioId, { sql: tx })).toBe(true);
        expect(await esResponsableTecnico(otro.usuarioId, { sql: tx })).toBe(false);

        await tx`UPDATE externos SET aviso_vencido_en = now(), escalado_en = now() WHERE documento_id = ${e.documentoId}`;
        const r1 = await registrarVerificacion(responsable, verificacion(e.documentoId, "vigente"), { sql: tx, ahora });
        expect(r1.retirado).toBe(false);
        const [ev] = await tx`SELECT version_id, usuario_id, resultado, fuente_consultada, creado_en FROM externo_verificaciones WHERE id = ${r1.verificacionId}`;
        expect(ev).toMatchObject({ resultado: "vigente", fuente_consultada: "https://www.minsalud.gov.co/normatividad" });
        expect(Number(ev.version_id)).toBe(e.versionId);
        expect(Number(ev.usuario_id)).toBe(responsable.usuarioId);
        const [marcas] = await tx`SELECT aviso_vencido_en, escalado_en FROM externos WHERE documento_id = ${e.documentoId}`;
        expect(marcas).toMatchObject({ aviso_vencido_en: null, escalado_en: null });
        expect((await tx`SELECT 1 FROM auditoria WHERE accion = 'externo_verificado' AND entidad_id = ${e.documentoId}`).length).toBe(1);

        await expect(registrarVerificacion(otro, verificacion(e.documentoId, "vigente"), { sql: tx, ahora })).rejects.toThrow(NO_EXISTE);
        // Gerencia ve los externos, pero ni los gestiona ni es su responsable.
        await expect(registrarVerificacion(await sesionDe(tx, "gerente"), verificacion(e.documentoId, "vigente"), { sql: tx, ahora })).rejects.toThrow(
          NO_EXISTE,
        );
        await expect(
          registrarVerificacion(responsable, { ...verificacion(e.documentoId, "vigente"), fuente: "x" }, { sql: tx, ahora }),
        ).rejects.toThrow("La fuente consultada debe tener entre 3 y 300 caracteres");

        const r2 = await registrarVerificacion(responsable, verificacion(e.documentoId, "edicion_nueva", "Salió la edición 2024"), { sql: tx, ahora });
        expect(r2.retirado).toBe(false);
        const [pendiente] = await tx`SELECT edicion_nueva_pendiente_desde FROM externos WHERE documento_id = ${e.documentoId}`;
        expect(pendiente.edicion_nueva_pendiente_desde).not.toBeNull();
        const avisos = await tx`SELECT titulo, enlace FROM notificaciones
          WHERE tipo = 'externos.edicion_nueva' AND usuario_id = ${lider.usuarioId} AND entidad_id = ${e.documentoId}`;
        expect(avisos).toHaveLength(1);
        expect(avisos[0]).toMatchObject({ titulo: `Adoptar la edición nueva de ${e.codigo} · ${e.titulo}`, enlace: `/vigencia/externos/${e.documentoId}` });

        const punto = await puntoDePrueba(tx, { responsable: await usuarioDePrueba(tx, { rol: "consulta" }), procesos: ["CEX"] });
        await copiaDePrueba(tx, { emisor: lider, documento: { id: e.documentoId, codigo: e.codigo, titulo: e.titulo }, punto, ahora });
        const r3 = await registrarVerificacion(responsable, verificacion(e.documentoId, "retirado", "Derogada por la Resolución 100 de 2026"), { sql: tx, ahora });
        expect(r3.retirado).toBe(true);
        const [v] = await tx`SELECT estado FROM documento_versiones WHERE id = ${e.versionId}`;
        expect(v.estado).toBe("anulado");
        const [c] = await tx`SELECT estado, motivo_por_recoger FROM copias_controladas WHERE version_id = ${e.versionId}`;
        expect(c).toMatchObject({ estado: "por_recoger", motivo_por_recoger: "retirado" });
        const retirado = await tx`SELECT titulo FROM notificaciones
          WHERE tipo = 'externos.retirado' AND usuario_id = ${lider.usuarioId} AND entidad_id = ${e.documentoId}`;
        expect(retirado).toEqual([{ titulo: `${e.codigo} ${e.titulo} dejó de aplicar: el documento externo fue retirado` }]);
        const [a] = await tx`SELECT detalle FROM auditoria WHERE accion = 'externo_retirado' AND entidad_id = ${e.documentoId}`;
        expect(a.detalle).toMatchObject({ codigo: e.codigo, motivo: "Derogada por la Resolución 100 de 2026", verificacionId: r3.verificacionId });
        expect(await esResponsableTecnico(responsable.usuarioId, { sql: tx })).toBe(false);
        await expect(registrarVerificacion(responsable, verificacion(e.documentoId, "vigente"), { sql: tx, ahora })).rejects.toThrow(
          "El documento externo no tiene una edición vigente",
        );
      } finally {
        await e.limpiar();
      }
    }));

  it("quien gestiona y verifica una edición nueva no se avisa; la verificación se enlaza a la revisión abierta y al impacto pendiente", () =>
    revertida(sql, async (tx) => {
      await sinRevisionAbierta(tx);
      const lider = await sesionDe(tx, "lider.cex");
      const e = await externoDePrueba(tx, lider, { proceso: "CEX", edicion: "2017", ahora });
      try {
        await registrarVerificacion(lider, verificacion(e.documentoId, "edicion_nueva"), { sql: tx, ahora });
        expect((await tx`SELECT 1 FROM notificaciones WHERE tipo = 'externos.edicion_nueva' AND entidad_id = ${e.documentoId}`).length).toBe(0);

        const [cerrada] = await tx`SELECT id FROM revisiones_anuales WHERE estado = 'cerrada' ORDER BY id LIMIT 1`;
        if (cerrada) {
          await expect(
            registrarVerificacion(lider, { ...verificacion(e.documentoId, "vigente"), revisionAnualId: Number(cerrada.id) }, { sql: tx, ahora }),
          ).rejects.toThrow("La revisión anual no está abierta");
        }
        const [abierta] = await tx`INSERT INTO revisiones_anuales (anio, plazo_dias, ventana_meses, abierta_por, abierta_en, vence_en)
          VALUES (2096, 60, 6, ${lider.usuarioId}, now(), now() + interval '60 days') RETURNING id`;
        const conRevision = await registrarVerificacion(
          lider,
          { ...verificacion(e.documentoId, "vigente"), revisionAnualId: Number(abierta.id) },
          { sql: tx, ahora },
        );
        const [ev] = await tx`SELECT revision_anual_id FROM externo_verificaciones WHERE id = ${conRevision.verificacionId}`;
        expect(Number(ev.revision_anual_id)).toBe(Number(abierta.id));

        await expect(
          registrarVerificacion(lider, { ...verificacion(e.documentoId, "vigente"), impactoId: 987_654_321 }, { sql: tx, ahora }),
        ).rejects.toThrow(NO_EXISTE);
      } finally {
        await e.limpiar();
      }
    }));

  it("una edición nueva pendiente pone al externo en atención en el semáforo, la ficha, las listas y su página, hasta adoptarla", () =>
    revertida(sql, async (tx) => {
      const lider = await sesionDe(tx, "lider.cex");
      const e = await externoDePrueba(tx, lider, { proceso: "CEX", edicion: "2017", ahora });
      try {
        const antes = await vigenciaDeDocumento(e.documentoId, lider, { sql: tx, ahora });
        expect(antes).toMatchObject({ vigencia: { estado: "al_dia" }, edicionPendiente: null });

        await registrarVerificacion(lider, verificacion(e.documentoId, "edicion_nueva", "Salió la edición 2024"), { sql: tx, ahora });
        const TEXTO = "Atención · edición nueva pendiente de adoptar";
        const enSemaforo = (await listarSemaforo(lider, { estado: "todos", origen: "externo" }, { sql: tx, ahora })).find(
          (f) => f.documentoId === e.documentoId,
        )!;
        expect(enSemaforo.vigencia).toEqual({ estado: "atencion", dias: 365 });
        expect(enSemaforo.edicionPendiente?.desde).toEqual(ahora);
        expect(textoVigenciaDeFila(enSemaforo)).toBe(TEXTO);
        const ficha = await vigenciaDeDocumento(e.documentoId, lider, { sql: tx, ahora });
        expect(ficha?.vigencia.estado).toBe("atencion");
        expect(vigenciaEnLista((await vigenciaPorDocumento(tx, [e.documentoId], ahora)).get(e.documentoId)!).texto).toBe(TEXTO);
        expect((await obtenerExterno(e.documentoId, lider, { sql: tx, ahora }))?.vigencia).toMatchObject({ estado: "atencion", dias: 365 });
        const fila = (await listarExternos(lider, { estado: "atencion" }, { sql: tx, ahora })).find((f) => f.documentoId === e.documentoId);
        expect(fila?.vigencia.estado).toBe("atencion");

        const { versionId } = await abrirEdicion(lider, e.documentoId, { edicion: "2024", fechaEdicion: null, resumenCambios: "Metas 2024" }, { sql: tx, ahora });
        await adoptar(lider, versionId, tx);
        const despues = await vigenciaDeDocumento(e.documentoId, lider, { sql: tx, ahora });
        expect(despues).toMatchObject({ vigencia: { estado: "al_dia" }, edicionPendiente: null });
      } finally {
        await e.limpiar();
      }
    }));

  it("las verificaciones son inmutables y la fecha base del externo es la última verificación", () =>
    revertida(sql, async (tx) => {
      const lider = await sesionDe(tx, "lider.cex");
      const e = await externoDePrueba(tx, lider, { proceso: "CEX", edicion: "2017", ahora: new Date("2026-03-02T15:00:00Z") });
      try {
        const antes = await vigenciaDeDocumento(e.documentoId, lider, { sql: tx, ahora });
        expect(antes?.ultimaRevision).toMatchObject({ clase: "adopcion" });
        expect(fechaEnZona(antes!.proximaRevision!, ZONA)).toBe("2027-03-02");

        const { verificacionId } = await registrarVerificacion(lider, verificacion(e.documentoId, "vigente"), { sql: tx, ahora });
        expect(await fallaCon(tx.savepoint((s) => s`UPDATE externo_verificaciones SET nota = 'x' WHERE id = ${verificacionId}`))).toBe("42501");
        expect(await fallaCon(tx.savepoint((s) => s`DELETE FROM externo_verificaciones WHERE id = ${verificacionId}`))).toBe("42501");

        const despues = await vigenciaDeDocumento(e.documentoId, lider, { sql: tx, ahora });
        expect(despues?.ultimaRevision).toMatchObject({ clase: "verificacion", quien: lider.nombre });
        expect(fechaEnZona(despues!.proximaRevision!, ZONA)).toBe("2027-11-08");
      } finally {
        await e.limpiar();
      }
    }));

  it("retirar desde la ficha exige gestionar y motivo, descarta la edición pendiente y no deja adoptar ni abrir otra", () =>
    revertida(sql, async (tx) => {
      const lider = await sesionDe(tx, "lider.cex");
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const e = await externoDePrueba(tx, lider, { proceso: "CEX", edicion: "2017", responsableId: responsable.usuarioId, ahora });
      try {
        const { versionId } = await abrirEdicion(lider, e.documentoId, { edicion: "2023", fechaEdicion: null, resumenCambios: "Metas" }, { sql: tx, ahora });
        await expect(retirarExterno(responsable, { documentoId: e.documentoId, motivo: "Ya no aplica en el hospital" }, { sql: tx, ahora })).rejects.toThrow(
          NO_EXISTE,
        );
        await expect(retirarExterno(lider, { documentoId: e.documentoId, motivo: "x" }, { sql: tx, ahora })).rejects.toThrow(
          "El motivo debe tener entre 5 y 500 caracteres",
        );
        await retirarExterno(lider, { documentoId: e.documentoId, motivo: "Ya no aplica en el hospital" }, { sql: tx, ahora });
        const estados = await tx`SELECT id, estado FROM documento_versiones WHERE documento_id = ${e.documentoId} ORDER BY numero`;
        expect(estados.map((f) => f.estado)).toEqual(["anulado", "descartado"]);
        await expect(adoptar(lider, versionId, tx)).rejects.toThrow("La edición ya no está en borrador");
        await expect(
          abrirEdicion(lider, e.documentoId, { edicion: "2024", fechaEdicion: null, resumenCambios: "Otra edición" }, { sql: tx, ahora }),
        ).rejects.toThrow("El documento externo fue retirado: si vuelve a aplicar, regístrelo como documento nuevo");
        await expect(retirarExterno(lider, { documentoId: e.documentoId, motivo: "Otra vez retirado" }, { sql: tx, ahora })).rejects.toThrow(
          "El documento externo fue retirado: si vuelve a aplicar, regístrelo como documento nuevo",
        );
      } finally {
        await e.limpiar();
      }
    }));
});

describe("un externo no se toca por los caminos de los internos (spec 13C §8.1)", () => {
  const SE_ADOPTA = "Un documento externo se adopta desde Vigencia → Externos";
  const SIN_TRAMITE = "Un documento externo no tiene trámite: se adopta o se retira desde Vigencia → Externos";
  const SOLO_EXTERNOS = "El tipo «Documento externo» es solo para documentos externos: regístrelo desde Vigencia → Externos";
  const CONSERVA_TIPO = "Un documento externo conserva el tipo «Documento externo»";
  const tipoDe = async (tx: TransactionSql, sigla: string) => Number((await tx`SELECT id FROM tipos_documento WHERE sigla = ${sigla}`)[0].id);

  /** Las funciones del panel que abren su propia transacción reciben la del test mientras corre `prueba`. */
  async function conTransaccionDelPanel(tx: TransactionSql, prueba: () => Promise<void>) {
    enCurso.sql = tx;
    try {
      await prueba();
    } finally {
      enCurso.sql = null;
    }
  }

  it("no se le pide un trámite: ni modificación, ni eliminación, ni una creación convertida en modificación de un externo", () =>
    revertida(sql, async (tx) => {
      const lider = await sesionDe(tx, "lider.cex");
      const e = await externoDePrueba(tx, lider, { proceso: "CEX", edicion: "2017", ahora });
      try {
        const justificacion = "Se ajusta el documento al proceso actual.";
        for (const tipo of ["modificar", "eliminar"] as const) {
          await expect(crearSolicitud(lider, { tipo, motivo: "mejora", justificacion, documentoId: e.documentoId }, opc(tx))).rejects.toThrow(SIN_TRAMITE);
        }
        const { admin, liderCex, tramiteId } = await solicitudDeCreacion(tx, { proceso: "CEX", tipo: "ZP", titulo: "Guía de prueba convertida" });
        const responsables = { elaboradorId: liderCex.usuarioId, revisorId: admin.usuarioId, aprobadorId: admin.usuarioId };
        await expect(
          transicionar(admin, { tramiteId, accion: "aceptar", etapaEsperada: "aceptacion", rondaEsperada: 0,
            datos: aceptarCreacion({ ...responsables, decision: "modificacion", documentoExistenteId: e.documentoId }) }, opc(tx)),
        ).rejects.toThrow(SIN_TRAMITE);
        expect((await tx`SELECT 1 FROM tramites WHERE documento_id = ${e.documentoId}`).length).toBe(0);
      } finally {
        await e.limpiar();
      }
    }));

  it("un interno no se da de alta con el tipo «Documento externo»: ni por la carga directa, ni por una solicitud de creación", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const lider = await sesionDe(tx, "lider.cex");
      const cex = await proceso(tx, "CEX");
      const de = await tipoDe(tx, "DE");
      await tx`INSERT INTO configuracion (clave, valor) VALUES ('publicacion_directa', '1') ON CONFLICT (clave) DO UPDATE SET valor = '1'`;
      await conTransaccionDelPanel(tx, () =>
        expect(
          crearDocumento(
            { codigo: "CEX-DE-99", titulo: "Guía cargada como interna", tipoId: de, descripcion: null, palabrasClave: null,
              asociaciones: [{ procesoId: cex.id, esPrincipal: true }] },
            admin.usuarioId,
          ),
        ).rejects.toThrow(SOLO_EXTERNOS),
      );
      await expect(
        crearSolicitud(lider, { tipo: "crear", motivo: "mejora", justificacion: "Se necesita para la atención.", procesoId: cex.id,
          tipoDocumentoId: de, tituloPropuesto: "Guía pedida como interna" }, opc(tx)),
      ).rejects.toThrow(SOLO_EXTERNOS);
      // Ni al aceptar una creación pedida con otro tipo.
      const { liderCex, tramiteId } = await solicitudDeCreacion(tx, { proceso: "CEX", tipo: "ZP", titulo: "Guía aceptada como externa" });
      await expect(
        transicionar(admin, { tramiteId, accion: "aceptar", etapaEsperada: "aceptacion", rondaEsperada: 0,
          datos: aceptarCreacion({ codigo: "CEX-DE-98", tipoDocumentoId: de, elaboradorId: liderCex.usuarioId, revisorId: admin.usuarioId,
            aprobadorId: admin.usuarioId }) }, opc(tx)),
      ).rejects.toThrow(SOLO_EXTERNOS);
      // Ni al corregir el tipo de una creación en curso.
      const t = await tramiteEn(tx, "elaboracion", { tipo: "crear", codigo: "CEX-ZP-07" });
      try {
        await expect(
          corregirDatosDeControl(t.tramiteId, t.admin, { codigo: "CEX-DE-97", tipoDocumentoId: de }, { etapa: "elaboracion", ronda: 1 }, { sql: tx }),
        ).rejects.toThrow(SOLO_EXTERNOS);
      } finally {
        await t.limpiar();
      }
    }));

  it("el panel no rompe la pareja origen y tipo: un externo conserva su tipo y un interno no pasa a «Documento externo»", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const lider = await sesionDe(tx, "lider.cex");
      const cex = await proceso(tx, "CEX");
      const sinAdoptar = await registrarExterno(lider, datosExterno({ procesoId: cex.id, responsableId: lider.usuarioId }), { sql: tx, ahora });
      const [interno] = await tx`INSERT INTO documentos (codigo, titulo, tipo_id) VALUES ('CEX-PR-99', 'Interno sin publicar', ${await tipoDe(tx, "PR")})
        RETURNING id`;
      await tx`INSERT INTO documento_proceso (documento_id, proceso_id, es_principal) VALUES (${interno.id}, ${cex.id}, true)`;
      await conTransaccionDelPanel(tx, async () => {
        await expect(
          editarControl(sinAdoptar.documentoId, { codigo: sinAdoptar.codigo, titulo: "Guía", tipoId: await tipoDe(tx, "PR") }, admin.usuarioId),
        ).rejects.toThrow(CONSERVA_TIPO);
        await expect(editarControl(Number(interno.id), { codigo: "CEX-PR-99", titulo: "Interno sin publicar", tipoId: await tipoDe(tx, "DE") }, admin.usuarioId))
          .rejects.toThrow(SOLO_EXTERNOS);
      });
    }));

  it("los caminos genéricos del panel no tocan el borrador de un externo; el de externos sí sube y quita sus archivos", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const lider = await sesionDe(tx, "lider.cex");
      const cex = await proceso(tx, "CEX");
      const r = await registrarExterno(lider, datosExterno({ procesoId: cex.id, responsableId: lider.usuarioId }), { sql: tx, ahora });
      const datos = { fechaElaboracion: null, fechaRevision: null, fechaAprobacion: "2026-11-08", elaboro: null, reviso: null, aprobo: "Alguien", resumenCambios: null };
      await expect(editarVersionBorrador(r.versionId, datos, admin.usuarioId, { sql: tx })).rejects.toThrow(SE_ADOPTA);
      await conTransaccionDelPanel(tx, () => expect(descartarBorrador(r.versionId, admin.usuarioId)).rejects.toThrow(SE_ADOPTA));
      const archivo = {
        versionId: r.versionId, rol: "anexo", ruta: `zz-pruebas/${Date.now()}/anexo.pdf`, nombreOriginal: "anexo.pdf",
        extension: "pdf", mime: "application/pdf", tamanoBytes: 10, hashSha256: "a".repeat(64),
      };
      await expect(registrarArchivo(archivo, admin.usuarioId, { sql: tx })).rejects.toThrow(SE_ADOPTA);
      const { id } = await registrarArchivo(archivo, lider.usuarioId, { sql: tx, externo: true });
      await expect(eliminarArchivoBorrador(id, admin.usuarioId, { sql: tx })).rejects.toThrow(SE_ADOPTA);
      await eliminarArchivoBorrador(id, lider.usuarioId, { sql: tx, externo: true });
      const [v] = await tx`SELECT estado, aprobo FROM documento_versiones WHERE id = ${r.versionId}`;
      expect(v).toMatchObject({ estado: "borrador", aprobo: null });
    }));
});

describe("datos de control, ficha y lista", () => {
  it("editar los datos de control audita el antes y el después, y enlaza la norma", () =>
    revertida(sql, async (tx) => {
      const lider = await sesionDe(tx, "lider.cex");
      const e = await externoDePrueba(tx, lider, { proceso: "CEX", edicion: "2017", ahora });
      try {
        const [tipo] = await tx`INSERT INTO tipos_norma (nombre, orden) VALUES (${`zz tipo ${Date.now()}`}, 99) RETURNING id`;
        const [norma] = await tx`INSERT INTO normas (tipo_norma_id, numero, anio, entidad_emisora, titulo, creado_por)
          VALUES (${tipo.id}, '3100', 2019, 'Ministerio de Salud y Protección Social', 'Habilitación', ${lider.usuarioId}) RETURNING id`;
        const nuevo = await usuarioDePrueba(tx, { rol: "consulta" });
        await tx`UPDATE externos SET aviso_vencido_en = now(), escalado_en = now() WHERE documento_id = ${e.documentoId}`;
        await editarControlExterno(
          lider,
          e.documentoId,
          {
            entidadEmisora: "Instituto Nacional de Salud",
            tituloOriginal: null,
            fuenteOficial: "https://www.ins.gov.co",
            responsableId: nuevo.usuarioId,
            verificacionMeses: 6,
            normaId: Number(norma.id),
          },
          { sql: tx, ahora },
        );
        const [ex] = await tx`SELECT entidad_emisora, responsable_id, verificacion_meses, aviso_vencido_en FROM externos WHERE documento_id = ${e.documentoId}`;
        expect(ex).toMatchObject({ entidad_emisora: "Instituto Nacional de Salud", verificacion_meses: 6, aviso_vencido_en: null });
        expect(Number(ex.responsable_id)).toBe(nuevo.usuarioId);
        expect((await tx`SELECT 1 FROM norma_documentos WHERE documento_id = ${e.documentoId} AND norma_id = ${norma.id}`).length).toBe(1);
        const [a] = await tx`SELECT detalle FROM auditoria WHERE accion = 'externo_editado' AND entidad_id = ${e.documentoId}`;
        expect(a.detalle.antes).toMatchObject({ entidadEmisora: "Ministerio de Salud y Protección Social", verificacionMeses: 12, responsable: lider.nombre, norma: null });
        expect(a.detalle.despues).toMatchObject({ entidadEmisora: "Instituto Nacional de Salud", verificacionMeses: 6, responsable: nuevo.nombre });
        expect(a.detalle.antes).not.toHaveProperty("tituloOriginal");

        await expect(
          editarControlExterno(await sesionDe(tx, "lider.gth"), e.documentoId, {
            entidadEmisora: "Otro", tituloOriginal: null, fuenteOficial: null, responsableId: lider.usuarioId, verificacionMeses: 12, normaId: null,
          }, { sql: tx }),
        ).rejects.toThrow(NO_EXISTE);
      } finally {
        await e.limpiar();
      }
    }));

  it("la ficha de control dice qué puede hacer cada quien; un restringido no existe para quien no lo ve", () =>
    revertida(sql, async (tx) => {
      const lider = await sesionDe(tx, "lider.cex");
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const e = await externoDePrueba(tx, lider, { proceso: "CEX", edicion: "2017", responsableId: responsable.usuarioId, ahora });
      try {
        const deLider = await obtenerExterno(e.documentoId, lider, { sql: tx, ahora });
        expect(deLider).toMatchObject({
          documentoId: e.documentoId,
          codigo: e.codigo,
          control: { entidadEmisora: "Ministerio de Salud y Protección Social", responsable: { id: responsable.usuarioId }, verificacionMeses: 12, norma: null },
          vigente: { versionId: e.versionId, numero: 1, edicion: "2017" },
          borrador: null,
          acciones: { editar: true, abrirEdicion: true, adoptar: false, verificar: true, retirar: true },
        });
        expect(deLider?.vigente?.adoptoPor).toContain(lider.nombre);
        expect(deLider?.vigencia.estado).toBe("al_dia");
        const deResponsable = await obtenerExterno(e.documentoId, responsable, { sql: tx, ahora });
        expect(deResponsable?.acciones).toEqual({ editar: false, abrirEdicion: false, adoptar: false, verificar: true, retirar: false });
        const deGerencia = await obtenerExterno(e.documentoId, await sesionDe(tx, "gerente"), { sql: tx, ahora });
        expect(deGerencia?.acciones).toEqual({ editar: false, abrirEdicion: false, adoptar: false, verificar: false, retirar: false });
        expect(await obtenerExterno(e.documentoId, await sesionDe(tx, "lider.gth"), { sql: tx, ahora })).toBeNull();

        const { versionId } = await abrirEdicion(lider, e.documentoId, { edicion: "2023", fechaEdicion: null, resumenCambios: "Metas" }, { sql: tx, ahora });
        const conBorrador = await obtenerExterno(e.documentoId, lider, { sql: tx, ahora });
        expect(conBorrador?.borrador).toMatchObject({ versionId, numero: 2, edicion: "2023", resumenCambios: "Metas", archivos: [] });
        expect(conBorrador?.acciones).toMatchObject({ abrirEdicion: false, adoptar: true });
        expect(conBorrador?.ediciones).toEqual([{ numero: 1, edicion: "2017", estado: "vigente", adoptadaEn: ahora }]);
        expect((await obtenerExterno(e.documentoId, responsable, { sql: tx, ahora }))?.borrador).toBeNull();

        await tx`UPDATE documentos SET nivel_acceso = 'restringido' WHERE id = ${e.documentoId}`;
        const consulta = await sesionDe(tx, "consulta");
        const ajeno = await usuarioDePrueba(tx, { rol: "consulta" });
        await tx`UPDATE externos SET responsable_id = ${ajeno.usuarioId} WHERE documento_id = ${e.documentoId}`;
        expect(await obtenerExterno(e.documentoId, ajeno, { sql: tx, ahora })).toBeNull();
        await expect(registrarVerificacion(ajeno, verificacion(e.documentoId, "vigente"), { sql: tx, ahora })).rejects.toThrow(NO_EXISTE);
        expect(await puedeVerExterno(e.documentoId, consulta, { sql: tx })).toBe(false);
        expect(await obtenerExterno(e.documentoId, await sesionDe(tx, "gerente"), { sql: tx, ahora })).not.toBeNull();
      } finally {
        await e.limpiar();
      }
    }));

  it("la lista de externos: el líder ve los de sus procesos, el responsable los suyos, y un externo sin adoptar sale en atención", () =>
    revertida(sql, async (tx) => {
      const lider = await sesionDe(tx, "lider.cex");
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const cex = await proceso(tx, "CEX");
      const e = await externoDePrueba(tx, lider, { proceso: "CEX", edicion: "2017", responsableId: responsable.usuarioId, ahora });
      try {
        const sinAdoptar = await registrarExterno(lider, datosExterno({ procesoId: cex.id, responsableId: lider.usuarioId, edicion: "v2.0" }), { sql: tx, ahora });
        const deLider = await listarExternos(lider, { estado: "todos" }, { sql: tx, ahora });
        const fila = deLider.find((f) => f.documentoId === e.documentoId);
        expect(fila).toMatchObject({
          codigo: e.codigo,
          emisor: "Ministerio de Salud y Protección Social",
          edicion: "2017",
          adoptadaEn: ahora,
          ultimaVerificacion: null,
          responsable: responsable.nombre,
          copiasVivas: 0,
          vigencia: { estado: "al_dia" },
        });
        expect(fechaEnZona(fila!.proximaVerificacion!, ZONA)).toBe("2027-11-08");
        expect(deLider.find((f) => f.documentoId === sinAdoptar.documentoId)).toMatchObject({
          edicion: null,
          adoptadaEn: null,
          proximaVerificacion: null,
          vigencia: { estado: "atencion", dias: null, proxima: null },
        });
        expect(deLider.every((f) => f.proceso.id === cex.id)).toBe(true);

        const delResponsable = await listarExternos(responsable, {}, { sql: tx, ahora });
        expect(delResponsable.map((f) => f.documentoId)).toEqual([e.documentoId]);
        expect(await listarExternos(await usuarioDePrueba(tx, { rol: "consulta" }), {}, { sql: tx, ahora })).toEqual([]);

        const porTexto = await listarExternos(lider, { q: e.titulo.slice(0, 30), responsableId: responsable.usuarioId }, { sql: tx, ahora });
        expect(porTexto.map((f) => f.documentoId)).toEqual([e.documentoId]);
        const enAtencion = await listarExternos(lider, { estado: "atencion", procesoId: cex.id }, { sql: tx, ahora });
        expect(enAtencion.some((f) => f.documentoId === sinAdoptar.documentoId)).toBe(true);
        expect(enAtencion.some((f) => f.documentoId === e.documentoId)).toBe(false);
      } finally {
        await e.limpiar();
      }
    }));

  it("los archivos de una edición se autorizan solo en borrador y a quien gestiona", () =>
    revertida(sql, async (tx) => {
      const lider = await sesionDe(tx, "lider.cex");
      const e = await externoDePrueba(tx, lider, { proceso: "CEX", edicion: "2017", ahora });
      try {
        expect(await autorizarArchivoDeEdicion(e.versionId, lider, { sql: tx })).toEqual({ ok: false, estado: 409 });
        const { versionId } = await abrirEdicion(lider, e.documentoId, { edicion: "2023", fechaEdicion: null, resumenCambios: "Metas" }, { sql: tx, ahora });
        expect(await autorizarArchivoDeEdicion(versionId, lider, { sql: tx })).toEqual({
          ok: true,
          destino: { versionId, codigo: e.codigo, numero: 2 },
        });
        expect(await autorizarArchivoDeEdicion(versionId, await sesionDe(tx, "lider.gth"), { sql: tx })).toEqual({ ok: false, estado: 404 });
        expect(await autorizarArchivoDeEdicion(versionId, await sesionDe(tx, "gerente"), { sql: tx })).toEqual({ ok: false, estado: 404 });
        expect(await autorizarArchivoDeEdicion(987_654_321, lider, { sql: tx })).toEqual({ ok: false, estado: 404 });
      } finally {
        await e.limpiar();
      }
    }));
});

describe("esquemas de los externos", () => {
  const formulario = (campos: [string, string][]) => {
    const f = new FormData();
    for (const [campo, valor] of campos) f.append(campo, valor);
    return f;
  };

  it("el alta llega con los datos del dominio: los demás procesos como asociaciones no principales y lo vacío como nulo", () => {
    const d = parsearFormulario(
      formulario([
        ["titulo", "  Guía de hipertensión  "],
        ["procesoId", "4"],
        ["otrosProcesos", "p:7"],
        ["otrosProcesos", "s:12"],
        ["nivelAcceso", "general"],
        ["descripcion", "   "],
        ["entidadEmisora", "Ministerio de Salud y Protección Social"],
        ["responsableId", "9"],
        ["verificacionMeses", "12"],
        ["edicion", "2017"],
        ["fechaEdicion", "2017-05-02"],
      ]),
      EsquemaExterno,
    );
    expect(d).toEqual({
      titulo: "Guía de hipertensión",
      procesoId: 4,
      subprocesoId: null,
      otrosProcesos: [
        { procesoId: 7, esPrincipal: false },
        { subprocesoId: 12, esPrincipal: false },
      ],
      nivelAcceso: "general",
      descripcion: null,
      palabrasClave: null,
      entidadEmisora: "Ministerio de Salud y Protección Social",
      tituloOriginal: null,
      fuenteOficial: null,
      responsableId: 9,
      verificacionMeses: 12,
      normaId: null,
      edicion: "2017",
      fechaEdicion: "2017-05-02",
    });
  });

  it("rechaza lo que no es suyo y lo fuera de rango, con mensajes para la persona", () => {
    const base: [string, string][] = [
      ["entidadEmisora", "INS"],
      ["responsableId", "9"],
      ["verificacionMeses", "12"],
    ];
    expect(parsearFormulario(formulario(base), EsquemaControlExterno)).toMatchObject({ normaId: null, tituloOriginal: null });
    expect(() => parsearFormulario(formulario([...base, ["origen", "interno"]]), EsquemaControlExterno)).toThrow();
    expect(() => parsearFormulario(formulario([...base.slice(0, 2), ["verificacionMeses", "61"]]), EsquemaControlExterno)).toThrow(
      "La periodicidad de verificación debe estar entre 1 y 60 meses",
    );
    expect(() => parsearFormulario(formulario([["documentoId", "3"], ["resultado", "vencido"], ["fuente", "INS"]]), EsquemaVerificacion)).toThrow(
      "Elija el resultado de la verificación",
    );
    expect(() => parsearFormulario(formulario([["documentoId", "3"], ["resultado", "vigente"], ["fuente", "x"]]), EsquemaVerificacion)).toThrow(
      "La fuente consultada debe tener al menos 3 caracteres",
    );
    expect(() => parsearFormulario(formulario([["documentoId", "3"], ["motivo", "ya"]]), EsquemaRetirar)).toThrow(
      "El motivo debe tener al menos 5 caracteres",
    );
    expect(parsearFormulario(formulario([["versionId", "5"], ["pedirAcuses", "on"], ["clave", " ok "]]), EsquemaAdoptar)).toEqual({
      versionId: 5,
      pedirAcuses: "on",
      clave: " ok ",
    });
  });
});
