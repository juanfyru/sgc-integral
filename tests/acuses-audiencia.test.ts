/** Acuses fuera de la publicación: pedido manual, ingreso a un proceso, salida de la audiencia, eliminación y porcentajes. */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { editarCatalogo } from "@/db/consultas/admin";
import {
  acusesPendientesDe,
  confirmarLectura,
  pedirAcuses,
  quienFalta,
  resumenAcuses,
} from "@/db/consultas/distribucion/acuses";
import { guardarAudiencia } from "@/db/consultas/distribucion/audiencia";
import { alternarLista, crearLista, editarLista } from "@/db/consultas/distribucion/listas";
import { transicionar } from "@/db/consultas/tramites-flujo";
import { cambiarActivo, crearUsuariosEnLote, editarUsuario } from "@/db/consultas/usuarios";
import { ErrorPermiso } from "@/lib/permisos";
import { pdfDePrueba } from "./utiles/pdf";
import { datosDeUsuario } from "./utiles/distribucion";
import { documentoLibre, opc, sesionAdmin, tramiteEn, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();
const T1 = new Date("2026-11-20T15:00:00Z");
const T2 = new Date("2026-11-27T15:00:00Z");
const PERIODO = { desde: new Date("2026-01-01T05:00:00Z"), hasta: new Date("2027-01-01T05:00:00Z") };

let almacen: string;
const previo = process.env.ALMACEN_RUTA;

beforeAll(() => {
  almacen = mkdtempSync(path.join(tmpdir(), "sgc-acuses-aud-"));
  process.env.ALMACEN_RUTA = almacen;
});

afterAll(async () => {
  if (previo === undefined) delete process.env.ALMACEN_RUTA;
  else process.env.ALMACEN_RUTA = previo;
  rmSync(almacen, { recursive: true, force: true });
  await sql.end();
  globalThis.__sql = undefined;
});

const idDe = async (tx: TransactionSql, sigla: string) => Number((await tx`SELECT id FROM procesos WHERE sigla = ${sigla}`)[0].id);
const delDocumento = (tx: TransactionSql, codigo: string, usuarioId: number) =>
  tx`SELECT a.id, a.estado, a.origen, a.motivo_cierre FROM acuses a
    JOIN documento_versiones v ON v.id = a.version_id JOIN documentos d ON d.id = v.documento_id
    WHERE d.codigo = ${codigo} AND a.usuario_id = ${usuarioId} ORDER BY a.id`;

const publicar = (t: Awaited<ReturnType<typeof tramiteEn>>, ahora: Date, tx: TransactionSql) =>
  transicionar(
    t.admin,
    { tramiteId: t.tramiteId, etapaEsperada: "publicacion", rondaEsperada: t.ronda, accion: "publicar", credenciales: { clave: "x" } },
    opc(tx, ahora.toISOString()),
  );

describe("pedir acuse", () => {
  it("crea solo los que faltan y repetir no duplica", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const doc = await documentoLibre(tx, { proceso: "GTH", tipo: "PR" });
      const nueva = await usuarioDePrueba(tx, { rol: "consulta", procesos: [await idDe(tx, "GTH")] });

      const primero = await pedirAcuses(admin, doc.id, { sql: tx, ahora: T1 });
      expect(primero.creados).toBeGreaterThanOrEqual(1);
      const [acuse] = await acusesPendientesDe(nueva.usuarioId, { sql: tx });
      expect(acuse).toMatchObject({ codigo: doc.codigo, origen: "solicitud_manual", version: 1 });
      const [aviso] = await tx`SELECT titulo, enlace FROM notificaciones WHERE usuario_id = ${nueva.usuarioId} AND tipo = 'distribucion.acuse'`;
      expect(aviso).toEqual({ titulo: `${doc.codigo} v1 ${doc.titulo}: confirme su lectura`, enlace: `/acuses/${acuse.id}` });
      const eventos = await tx`SELECT tipo FROM acuse_eventos WHERE acuse_id = ${acuse.id}`;
      expect(eventos.map((e) => e.tipo)).toEqual(["creado"]);
      const [auditoria] = await tx`SELECT detalle FROM auditoria WHERE accion = 'acuses_pedidos' AND entidad_id = ${doc.id}`;
      expect(auditoria.detalle).toEqual({ codigo: doc.codigo, version: 1, creados: primero.creados });

      expect(await pedirAcuses(admin, doc.id, { sql: tx, ahora: T2 })).toEqual({ creados: 0 });
      expect((await delDocumento(tx, doc.codigo, nueva.usuarioId)).length).toBe(1);

      // Quien ya confirmó no vuelve a recibirlo; quien llega después sí.
      await tx`UPDATE acuses SET estado = 'confirmado', modo = 'individual', confirmado_en = ${T1} WHERE id = ${acuse.id}`;
      const tardia = await usuarioDePrueba(tx, { rol: "consulta", procesos: [await idDe(tx, "GTH")] });
      expect(await pedirAcuses(admin, doc.id, { sql: tx, ahora: T2 })).toEqual({ creados: 1 });
      expect((await delDocumento(tx, doc.codigo, nueva.usuarioId)).length).toBe(1);
      expect((await delDocumento(tx, doc.codigo, tardia.usuarioId)).length).toBe(1);
    }));

  it("exige distribucion.gestionar", () =>
    revertida(sql, async (tx) => {
      const doc = await documentoLibre(tx, { proceso: "GTH", tipo: "PR" });
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [await idDe(tx, "GTH")] });
      await expect(pedirAcuses(lider, doc.id, { sql: tx })).rejects.toBeInstanceOf(ErrorPermiso);
    }));
});

describe("lectura obligatoria al ingresar y salida de la audiencia", () => {
  it("asignar un proceso crea los acuses de los vigentes marcados; quitarlo retira los pendientes", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const gth = await idDe(tx, "GTH");
      const doc = await documentoLibre(tx, { proceso: "GTH", tipo: "PR" });
      await guardarAudiencia(doc.id, { listaIds: [], lecturaObligatoriaIngreso: true }, admin.usuarioId, { sql: tx });
      const sinMarca = await documentoLibre(tx, { proceso: "GTH", tipo: "GU" });
      const persona = await usuarioDePrueba(tx, { rol: "consulta" });
      const datos = await datosDeUsuario(tx, persona.usuarioId);

      await editarUsuario(persona.usuarioId, { ...datos, procesoIds: [gth] }, admin.usuarioId, { sql: tx, ahora: T1 });
      const pendientes = await acusesPendientesDe(persona.usuarioId, { sql: tx });
      expect(pendientes.map((a) => a.codigo)).toContain(doc.codigo);
      expect(pendientes.map((a) => a.codigo)).not.toContain(sinMarca.codigo);
      expect(pendientes.find((a) => a.codigo === doc.codigo)?.origen).toBe("ingreso_proceso");
      const [aviso] = await tx`SELECT 1 AS ok FROM notificaciones WHERE usuario_id = ${persona.usuarioId} AND tipo = 'distribucion.acuse'`;
      expect(aviso).toBeDefined();

      // Editar sin cambiar los procesos no repite nada.
      await editarUsuario(persona.usuarioId, { ...datos, procesoIds: [gth], nombre: "Otro nombre" }, admin.usuarioId, { sql: tx });
      expect((await delDocumento(tx, doc.codigo, persona.usuarioId)).length).toBe(1);

      await editarUsuario(persona.usuarioId, { ...datos, procesoIds: [] }, admin.usuarioId, { sql: tx, ahora: T2 });
      expect(await acusesPendientesDe(persona.usuarioId, { sql: tx })).toEqual([]);
      const [fila] = await delDocumento(tx, doc.codigo, persona.usuarioId);
      expect(fila).toMatchObject({ estado: "retirado", motivo_cierre: "salio_de_audiencia" });
      const eventos = await tx`SELECT tipo FROM acuse_eventos WHERE acuse_id = ${fila.id} ORDER BY id`;
      expect(eventos.map((e) => e.tipo)).toEqual(["creado", "retirado"]);
    }));

  it("un proceso donde aplica también cuenta, y un restringido solo llega a quien lo ve", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const doc = await documentoLibre(tx, { proceso: "GTH", tipo: "PR" });
      await tx`INSERT INTO documento_proceso (documento_id, proceso_id, es_principal)
        SELECT ${doc.id}, id, false FROM procesos WHERE sigla = 'CEX'`;
      await guardarAudiencia(doc.id, { listaIds: [], lecturaObligatoriaIngreso: true }, admin.usuarioId, { sql: tx });
      const persona = await usuarioDePrueba(tx, { rol: "consulta" });
      await editarUsuario(persona.usuarioId, { ...(await datosDeUsuario(tx, persona.usuarioId)), procesoIds: [await idDe(tx, "CEX")] }, admin.usuarioId, { sql: tx });
      expect((await acusesPendientesDe(persona.usuarioId, { sql: tx })).map((a) => a.codigo)).toContain(doc.codigo);

      const ajena = await usuarioDePrueba(tx, { rol: "consulta" });
      const otro = await documentoLibre(tx, { proceso: "GTH", tipo: "GU" });
      await guardarAudiencia(otro.id, { listaIds: [], lecturaObligatoriaIngreso: true }, admin.usuarioId, { sql: tx });
      await tx`UPDATE documentos SET nivel_acceso = 'restringido' WHERE id = ${otro.id}`;
      await editarUsuario(ajena.usuarioId, { ...(await datosDeUsuario(tx, ajena.usuarioId)), procesoIds: [await idDe(tx, "CEX")] }, admin.usuarioId, { sql: tx });
      // El restringido es de GTH y CEX es solo «donde aplica» solo si la asociación existiera; aquí no existe: no llega.
      expect((await acusesPendientesDe(ajena.usuarioId, { sql: tx })).map((a) => a.codigo)).not.toContain(otro.codigo);
    }));

  it("desactivar a la persona retira sus pendientes; volver a asignar el proceso crea uno nuevo (unicidad parcial)", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const gth = await idDe(tx, "GTH");
      const doc = await documentoLibre(tx, { proceso: "GTH", tipo: "PR" });
      await guardarAudiencia(doc.id, { listaIds: [], lecturaObligatoriaIngreso: true }, admin.usuarioId, { sql: tx });
      const persona = await usuarioDePrueba(tx, { rol: "consulta" });
      const datos = await datosDeUsuario(tx, persona.usuarioId);
      await editarUsuario(persona.usuarioId, { ...datos, procesoIds: [gth] }, admin.usuarioId, { sql: tx, ahora: T1 });
      expect((await delDocumento(tx, doc.codigo, persona.usuarioId)).length).toBe(1);

      await cambiarActivo(persona.usuarioId, false, admin.usuarioId, { sql: tx, ahora: T2 });
      expect(await acusesPendientesDe(persona.usuarioId, { sql: tx })).toEqual([]);
      expect((await delDocumento(tx, doc.codigo, persona.usuarioId))[0]).toMatchObject({ estado: "retirado", motivo_cierre: "cuenta_desactivada" });

      await cambiarActivo(persona.usuarioId, true, admin.usuarioId, { sql: tx });
      await editarUsuario(persona.usuarioId, { ...datos, procesoIds: [] }, admin.usuarioId, { sql: tx });
      await editarUsuario(persona.usuarioId, { ...datos, procesoIds: [gth] }, admin.usuarioId, { sql: tx, ahora: T2 });
      const filas = await delDocumento(tx, doc.codigo, persona.usuarioId);
      expect(filas.map((f) => f.estado)).toEqual(["retirado", "pendiente"]);
    }));

  it("sacar a alguien de una lista, apagarla o restringir el documento retira lo que ya no le toca", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const doc = await documentoLibre(tx, { proceso: "GTH", tipo: "PR" });
      const a = await usuarioDePrueba(tx, { rol: "consulta" });
      const b = await usuarioDePrueba(tx, { rol: "consulta" });
      const { id: listaId } = await crearLista(
        { nombre: `zz_lista_${Date.now()}`, descripcion: null, miembros: [{ tipo: "usuario", referenciaId: a.usuarioId }, { tipo: "usuario", referenciaId: b.usuarioId }] },
        admin.usuarioId,
        { sql: tx },
      );
      await guardarAudiencia(doc.id, { listaIds: [listaId], lecturaObligatoriaIngreso: false }, admin.usuarioId, { sql: tx });
      await pedirAcuses(admin, doc.id, { sql: tx, ahora: T1 });
      expect((await acusesPendientesDe(a.usuarioId, { sql: tx })).length).toBe(1);
      expect((await acusesPendientesDe(b.usuarioId, { sql: tx })).length).toBe(1);

      await editarLista(listaId, { nombre: `zz_lista_${Date.now()}b`, descripcion: null, miembros: [{ tipo: "usuario", referenciaId: b.usuarioId }] }, admin.usuarioId, { sql: tx, ahora: T2 });
      expect(await acusesPendientesDe(a.usuarioId, { sql: tx })).toEqual([]);
      expect((await delDocumento(tx, doc.codigo, a.usuarioId))[0]).toMatchObject({ estado: "retirado", motivo_cierre: "salio_de_audiencia" });
      expect((await acusesPendientesDe(b.usuarioId, { sql: tx })).length).toBe(1);

      await alternarLista(listaId, false, admin.usuarioId, { sql: tx, ahora: T2 });
      expect(await acusesPendientesDe(b.usuarioId, { sql: tx })).toEqual([]);

      // Restringir: quien llegó solo por lista y no es de los procesos del documento ya no lo ve.
      const c = await usuarioDePrueba(tx, { rol: "consulta" });
      const otra = await documentoLibre(tx, { proceso: "GTH", tipo: "GU" });
      const { id: lista2 } = await crearLista(
        { nombre: `zz_lista_${Date.now()}c`, descripcion: null, miembros: [{ tipo: "usuario", referenciaId: c.usuarioId }] },
        admin.usuarioId,
        { sql: tx },
      );
      await guardarAudiencia(otra.id, { listaIds: [lista2], lecturaObligatoriaIngreso: false }, admin.usuarioId, { sql: tx });
      await pedirAcuses(admin, otra.id, { sql: tx, ahora: T1 });
      expect((await acusesPendientesDe(c.usuarioId, { sql: tx })).length).toBe(1);
      await editarCatalogo(
        otra.id,
        {
          descripcion: null,
          palabrasClave: null,
          relacionados: [],
          nivelAcceso: "restringido",
          asociaciones: [{ procesoId: await idDe(tx, "GTH"), esPrincipal: true }],
        },
        admin.usuarioId,
        { sql: tx, ahora: T2 },
      );
      expect(await acusesPendientesDe(c.usuarioId, { sql: tx })).toEqual([]);
    }));
});

describe("lote de usuarios", () => {
  it("suma las tareas de lectura de las personas creadas en procesos con documentos marcados", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const gth = await idDe(tx, "GTH");
      const doc = await documentoLibre(tx, { proceso: "GTH", tipo: "PR" });
      await guardarAudiencia(doc.id, { listaIds: [], lecturaObligatoriaIngreso: true }, admin.usuarioId, { sql: tx });
      const [{ n: marcados }] = await tx`SELECT count(*)::int AS n FROM documentos d
        JOIN documento_versiones v ON v.documento_id = d.id AND v.estado = 'vigente'
        WHERE d.lectura_obligatoria_ingreso AND d.nivel_acceso = 'general'
          AND EXISTS (SELECT 1 FROM documento_proceso dp WHERE dp.documento_id = d.id AND dp.proceso_id = ${gth})`;
      const base = { nombre: "Persona de lote", correo: null, rol: "consulta" as const, cargoId: null, jefeInmediatoId: null, verHistorial: false };
      const sufijo = Date.now();
      const r = await crearUsuariosEnLote(
        [
          { linea: 2, datos: { ...base, usuario: `zz_lote_t1_${sufijo}`, procesoIds: [gth] } },
          { linea: 3, datos: { ...base, usuario: `zz_lote_t2_${sufijo}`, procesoIds: [gth] } },
          { linea: 4, datos: { ...base, usuario: `zz_lote_t3_${sufijo}`, procesoIds: [] } },
        ],
        admin.usuarioId,
        [],
        { sql: tx, ahora: T1 },
      );
      expect(r.creados).toHaveLength(3);
      expect(r.tareasDeLectura).toBe(2 * marcados);
      expect(marcados).toBeGreaterThanOrEqual(1);
    }));
});

describe("al eliminar el documento", () => {
  it("avisa a la audiencia sin abrir tarea", () =>
    revertida(sql, async (tx) => {
      const persona = await usuarioDePrueba(tx, { rol: "consulta", procesos: [await idDe(tx, "GTH")] });
      const t = await tramiteEn(tx, "aprobacion", { tipo: "eliminar" });
      await transicionar(
        t.aprobador,
        { tramiteId: t.tramiteId, accion: "aprobar_y_publicar", etapaEsperada: "aprobacion", rondaEsperada: t.ronda, datos: { concepto: "Aprobado." }, credenciales: { clave: "x" } },
        opc(tx, T1.toISOString()),
      );
      const [aviso] = await tx`SELECT titulo, enlace FROM notificaciones WHERE usuario_id = ${persona.usuarioId} AND tipo = 'distribucion.eliminado'`;
      expect(aviso.titulo).toMatch(new RegExp(`^${t.codigo} ${t.titulo} dejó de aplicar: fue eliminado el .+2026`));
      expect(aviso.enlace).toBeNull();
      expect(await acusesPendientesDe(persona.usuarioId, { sql: tx })).toEqual([]);
      expect((await delDocumento(tx, t.codigo, persona.usuarioId)).length).toBe(0);
    }));
});

describe("resumenAcuses y quienFalta", () => {
  it("porcentaje por versión, proceso y entidad; el líder solo ve sus procesos; los superados no cuentan", () =>
    revertida(sql, async (tx) => {
      const gth = await idDe(tx, "GTH");
      const lectora = await usuarioDePrueba(tx, { rol: "consulta", procesos: [gth] });
      const pendiente = await usuarioDePrueba(tx, { rol: "consulta", procesos: [gth] });
      const t = await tramiteEn(tx, "publicacion", { principal: await pdfDePrueba([[612, 792]]) });
      let t2: Awaited<ReturnType<typeof tramiteEn>> | null = null;
      try {
        await publicar(t, T1, tx);
        await tx`INSERT INTO eventos_consulta (tipo, documento_id, version_id, usuario_id)
          SELECT 'vista', documento_id, id, ${lectora.usuarioId} FROM documento_versiones WHERE id = ${t.versionId}`;
        const [{ id: acuseId }] = await acusesPendientesDe(lectora.usuarioId, { sql: tx });
        await confirmarLectura(acuseId, lectora, { sql: tx, ahora: T2 });

        const admin = await sesionAdmin(tx);
        const r = await resumenAcuses(admin, PERIODO, { sql: tx });
        const fila = r.versiones.find((v) => v.versionId === t.versionId)!;
        const [c] = await tx`SELECT count(*) FILTER (WHERE estado = 'confirmado')::int AS c, count(*) FILTER (WHERE estado = 'pendiente')::int AS p,
            count(*) FILTER (WHERE modo = 'firma')::int AS f FROM acuses WHERE version_id = ${t.versionId}`;
        expect(fila).toMatchObject({ confirmados: c.c, pendientes: c.p, porFirma: c.f, porAsistencia: 0, version: 2, codigo: t.codigo });
        expect(fila.porcentaje).toBe(Math.round((c.c / (c.c + c.p)) * 100));
        expect(fila.venceEn).not.toBeNull();
        const proceso = r.porProceso.find((p) => p.nombre === fila.proceso)!;
        expect(proceso.confirmados).toBeGreaterThanOrEqual(fila.confirmados);
        expect(r.entidad.confirmados).toBe(r.porProceso.reduce((s, p) => s + p.confirmados, 0));
        expect(r.entidad.pendientes).toBe(r.porProceso.reduce((s, p) => s + p.pendientes, 0));
        expect(r.entidad.porcentaje).toBe(Math.round((r.entidad.confirmados / (r.entidad.confirmados + r.entidad.pendientes)) * 100));

        // El periodo se mide sobre la publicación.
        const fuera = await resumenAcuses(admin, { desde: new Date("2026-12-01T05:00:00Z"), hasta: new Date("2027-01-01T05:00:00Z") }, { sql: tx });
        expect(fuera.versiones.some((v) => v.versionId === t.versionId)).toBe(false);

        // El líder de GTH lo ve; el de otro proceso, no.
        const liderGth = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [gth] });
        const liderCex = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [await idDe(tx, "CEX")] });
        const delGth = await resumenAcuses(liderGth, PERIODO, { sql: tx });
        expect(delGth.versiones.some((v) => v.versionId === t.versionId)).toBe(true);
        expect(new Set(delGth.versiones.map((v) => v.proceso)).size).toBe(1);
        expect((await resumenAcuses(liderCex, PERIODO, { sql: tx })).versiones.some((v) => v.versionId === t.versionId)).toBe(false);
        expect((await resumenAcuses(liderCex, { ...PERIODO, procesoId: gth }, { sql: tx })).versiones).toEqual([]);

        // Quién falta.
        const faltan = await quienFalta(t.versionId as number, admin, { sql: tx, ahora: new Date("2026-11-25T15:00:00Z") });
        expect(faltan!.find((p) => p.id === pendiente.usuarioId)).toMatchObject({ nombre: pendiente.nombre, desdeHace: 5 });
        expect(faltan!.some((p) => p.id === lectora.usuarioId)).toBe(false);
        expect(await quienFalta(t.versionId as number, lectora, { sql: tx })).toBeNull();
        expect(await quienFalta(t.versionId as number, liderCex, { sql: tx })).toBeNull();
        expect(await quienFalta(t.versionId as number, liderGth, { sql: tx })).not.toBeNull();

        // La versión siguiente supera los pendientes de la anterior: ya no cuentan en ella.
        t2 = await tramiteEn(tx, "publicacion", { codigo: t.codigo, principal: await pdfDePrueba([[612, 792]]) });
        await publicar(t2, T2, tx);
        const despues = await resumenAcuses(admin, PERIODO, { sql: tx });
        const anterior = despues.versiones.find((v) => v.versionId === t.versionId)!;
        expect(anterior.pendientes).toBe(0);
        expect(anterior.confirmados).toBe(c.c);
        expect(anterior.porcentaje).toBe(100);
        expect(despues.versiones.find((v) => v.versionId === t2!.versionId)!.pendientes).toBeGreaterThanOrEqual(2);
      } finally {
        await t.limpiar();
        await t2?.limpiar();
      }
    }));
});
