/**
 * La revisión anual con los documentos externos (spec 13C §9.3 y §8.4): manda el acto más reciente (verificar, adoptar,
 * retirar), la adopción mueve la fila a la versión adoptada y el informe dice qué pasó con el externo. Y los insumos que
 * se congelan al cerrar (spec 13C §15.2 y §9.2). Todo corre dentro de una transacción que se revierte, con campañas de
 * 2090 (el año es único: no chocan con una revisión de la demo).
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import type { TransactionSql } from "postgres";
import { obtenerSql } from "@/db/cliente";
import { enlazarDocumento } from "@/db/consultas/normograma/asociaciones";
import { cambiarEstadoNorma } from "@/db/consultas/normograma/normas";
import { crearSolicitud } from "@/db/consultas/tramites-flujo";
import { abrirEdicion, adoptarEdicion, registrarVerificacion, retirarExterno } from "@/db/consultas/vigencia/externos";
import { cerrarRevision, datosDelInforme, informeCongelado, obtenerRevision } from "@/db/consultas/vigencia/revision-anual";
import type { ResultadoVerificacion } from "@/lib/vigencia/tipos";
import { puntoDePrueba } from "./utiles/distribucion";
import { normaDePrueba } from "./utiles/normograma";
import { sesionAdmin, sesionDe, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";
import { externoDePrueba, firmaDePrueba, revisionDePrueba, sinRevisionAbierta, vigenteFuera, type ExternoDePrueba } from "./utiles/vigencia";

const sql = obtenerSql();
const ahora = new Date("2090-03-10T15:00:00Z");
const adoptadoEn = new Date("2089-01-15T15:00:00Z");
const FUENTE = "https://www.minsalud.gov.co/guias";

let almacen: string;
const previo = process.env.ALMACEN_RUTA;

beforeAll(() => {
  almacen = mkdtempSync(path.join(tmpdir(), "sgc-revision-externos-"));
  process.env.ALMACEN_RUTA = almacen;
});

afterAll(async () => {
  if (previo === undefined) delete process.env.ALMACEN_RUTA;
  else process.env.ALMACEN_RUTA = previo;
  rmSync(almacen, { recursive: true, force: true });
  await sql.end();
  globalThis.__sql = undefined;
});

async function filaDe(tx: TransactionSql, revisionId: number, documentoId: number) {
  const [f] = await tx`SELECT decision, usuario_id, verificacion_id, version_id, insumos
    FROM revision_anual_decisiones WHERE revision_id = ${revisionId} AND documento_id = ${documentoId}`;
  return f
    ? {
        decision: f.decision as string,
        usuarioId: f.usuario_id === null ? null : Number(f.usuario_id),
        verificacionId: f.verificacion_id === null ? null : Number(f.verificacion_id),
        versionId: Number(f.version_id),
        insumos: f.insumos as unknown,
      }
    : null;
}

describe("los externos en la campaña", () => {
  it("manda el acto más reciente: «sigue vigente» tras «edición nueva» ratifica, al revés actualiza, y un retiro elimina", () =>
    revertida(sql, async (tx) => {
      await sinRevisionAbierta(tx);
      const admin = await sesionAdmin(tx);
      const lider = await sesionDe(tx, "lider.cex");
      const externos: ExternoDePrueba[] = [];
      for (const edicion of ["2017", "2018", "2019"]) externos.push(await externoDePrueba(tx, lider, { proceso: "CEX", edicion, ahora: adoptadoEn }));
      const [e1, e2, e3] = externos;
      const { revisionId } = await revisionDePrueba(tx, admin, { ahora });
      const verificar = async (e: ExternoDePrueba, resultado: ResultadoVerificacion) =>
        (await registrarVerificacion(lider, { documentoId: e.documentoId, resultado, fuente: FUENTE, nota: null }, { sql: tx, ahora })).verificacionId;

      const nueva = await verificar(e1, "edicion_nueva");
      const vigente = await verificar(e1, "vigente");
      expect(await filaDe(tx, revisionId, e1.documentoId)).toMatchObject({ decision: "ratificar", verificacionId: vigente });
      const [a] = await tx`SELECT detalle FROM auditoria
        WHERE accion = 'revision_anual_decision' AND entidad_id = ${revisionId} AND detalle->>'documentoId' = ${String(e1.documentoId)}
        ORDER BY id DESC LIMIT 1`;
      expect(a.detalle).toMatchObject({
        antes: { decision: "actualizar", verificacionId: nueva },
        despues: { decision: "ratificar", verificacionId: vigente },
      });

      await verificar(e2, "vigente");
      const despues = await verificar(e2, "edicion_nueva");
      expect(await filaDe(tx, revisionId, e2.documentoId)).toMatchObject({ decision: "actualizar", verificacionId: despues });

      await verificar(e3, "vigente");
      await retirarExterno(lider, { documentoId: e3.documentoId, motivo: "Derogada por la guía nueva" }, { sql: tx, ahora });
      expect(await filaDe(tx, revisionId, e3.documentoId)).toMatchObject({ decision: "eliminar", verificacionId: null, usuarioId: lider.usuarioId });
    }));

  it("adoptar tras la verificación mueve la fila a la versión adoptada y el informe dice «Edición adoptada»; sin adoptar, «Pendiente de adoptar»; retirado, «Retirado»", () =>
    revertida(sql, async (tx) => {
      await sinRevisionAbierta(tx);
      const admin = await sesionAdmin(tx);
      const lider = await sesionDe(tx, "lider.cex");
      const adoptado = await externoDePrueba(tx, lider, { proceso: "CEX", edicion: "2017", ahora: adoptadoEn });
      const pendiente = await externoDePrueba(tx, lider, { proceso: "CEX", edicion: "2018", ahora: adoptadoEn });
      const retirado = await externoDePrueba(tx, lider, { proceso: "CEX", edicion: "2019", ahora: adoptadoEn });
      const interno = await vigenteFuera(tx, { fechaAprobacion: "2025-01-10", proceso: "CEX" });
      const { revisionId } = await revisionDePrueba(tx, admin, { ahora });
      const o = { sql: tx, ahora };
      const verificar = async (e: ExternoDePrueba, resultado: ResultadoVerificacion) =>
        (await registrarVerificacion(lider, { documentoId: e.documentoId, resultado, fuente: FUENTE, nota: "Consultada" }, o)).verificacionId;

      const verificacionId = await verificar(adoptado, "edicion_nueva");
      expect(await filaDe(tx, revisionId, adoptado.documentoId)).toMatchObject({ decision: "actualizar", versionId: adoptado.versionId });
      const { versionId } = await abrirEdicion(lider, adoptado.documentoId, { edicion: "2024", fechaEdicion: null, resumenCambios: "Metas de 2024" }, o);
      await adoptarEdicion(
        lider,
        { versionId, pedirAcuses: false, requiereSocializacion: false, credenciales: { clave: "ok" }, verificacionId },
        { ...o, verificar: firmaDePrueba },
      );
      expect(await filaDe(tx, revisionId, adoptado.documentoId)).toMatchObject({ decision: "actualizar", verificacionId, versionId });
      const [a] = await tx`SELECT detalle FROM auditoria
        WHERE accion = 'revision_anual_decision' AND entidad_id = ${revisionId} AND detalle->>'documentoId' = ${String(adoptado.documentoId)}
        ORDER BY id DESC LIMIT 1`;
      expect(a.detalle).toMatchObject({ antes: { versionId: adoptado.versionId }, despues: { decision: "actualizar", verificacionId, versionId } });

      await verificar(pendiente, "edicion_nueva");
      await verificar(retirado, "retirado");
      // El informe nombra un externo por la edición de su fila (la adoptada, si la hubo), también el parcial.
      const parcial = await datosDelInforme(tx, revisionId, ahora);
      expect(parcial.decisiones.find((d) => d.codigo === adoptado.codigo)).toMatchObject({ edicion: "2024" });
      expect(parcial.decisiones.find((d) => d.codigo === interno.codigo)).not.toHaveProperty("edicion");
      await cerrarRevision(admin, { revisionId, credenciales: { clave: "ok" } }, { ...o, verificar: firmaDePrueba });
      const informe = (await informeCongelado(revisionId, { sql: tx }))!;
      const de = (codigo: string) => informe.decisiones.find((d) => d.codigo === codigo)!;
      expect(de(adoptado.codigo)).toMatchObject({ decision: "actualizar", version: 2, estadoExterno: "Edición adoptada" });
      expect(de(pendiente.codigo)).toMatchObject({ decision: "actualizar", version: 1, estadoExterno: "Pendiente de adoptar" });
      expect(de(retirado.codigo)).toMatchObject({ decision: "eliminar", estadoExterno: "Retirado" });
      expect(de(interno.codigo)).not.toHaveProperty("estadoExterno");
      expect(de(adoptado.codigo)).toMatchObject({ edicion: "2024" });
      expect(de(pendiente.codigo)).toMatchObject({ edicion: "2018" });
      expect(de(retirado.codigo)).toMatchObject({ edicion: "2019" });
      expect(de(interno.codigo)).not.toHaveProperty("edicion");
    }));
});

describe("los insumos al cerrar", () => {
  it("se congelan en cada fila, con los trámites del año, y lo que cambia después no cambia los de la revisión cerrada", () =>
    revertida(sql, async (tx) => {
      await sinRevisionAbierta(tx);
      const admin = await sesionAdmin(tx);
      const lider = await sesionDe(tx, "lider.gth");
      const con = await vigenteFuera(tx, { fechaAprobacion: "2025-01-10", proceso: "GTH" });
      const sin = await vigenteFuera(tx, { fechaAprobacion: "2025-01-10", proceso: "GTH" });
      const enElAnio = new Date("2090-02-01T15:00:00Z");
      // Los acuses de la vigente: uno confirmado y uno pendiente.
      const [u1, u2] = [await usuarioDePrueba(tx, { rol: "consulta" }), await usuarioDePrueba(tx, { rol: "consulta" })];
      await tx`INSERT INTO acuses (version_id, usuario_id, origen, estado, modo, confirmado_en, vence_en) VALUES
        (${con.versionId}, ${u1.usuarioId}, 'publicacion', 'confirmado', 'individual', ${enElAnio}, ${enElAnio}),
        (${con.versionId}, ${u2.usuarioId}, 'publicacion', 'pendiente', NULL, NULL, ${enElAnio})`;
      // Un hallazgo del año sobre el documento.
      const punto = await puntoDePrueba(tx, { responsable: admin });
      await tx`INSERT INTO hallazgos (punto_uso_id, origen, documento_id, descripcion, responsable_id, vence_en, creado_en)
        VALUES (${punto.id}, 'recogida', ${con.id}, 'Copia sin sello de control', ${admin.usuarioId}, ${enElAnio}, ${enElAnio})`;
      // Una norma enlazada que cambió de estado en el año.
      const norma = await normaDePrueba(tx, admin);
      await enlazarDocumento(admin, { normaId: norma.id, documentoId: con.id }, { sql: tx });
      await cambiarEstadoNorma(admin, { normaId: norma.id, estado: "derogada", fecha: "2090-02-01", nota: null }, { sql: tx, ahora: enElAnio });
      // Una consulta y un trámite del año.
      await tx`INSERT INTO eventos_consulta (tipo, documento_id, version_id, creado_en) VALUES ('vista', ${con.id}, ${con.versionId}, ${enElAnio})`;
      await crearSolicitud(lider, { tipo: "modificar", motivo: "mejora", justificacion: "Se ajusta al proceso.", documentoId: con.id }, { sql: tx, ahora: enElAnio });

      const { revisionId } = await revisionDePrueba(tx, admin, { ahora });
      const esperado = { acuses: { confirmados: 1, total: 2, porcentaje: 50 }, hallazgos: 1, normasCambiadas: [norma.nombre], consultas: 1, tramites: 1 };
      const vacio = { acuses: null, hallazgos: 0, normasCambiadas: [], consultas: 0, tramites: 0 };
      // Abierta, se calculan al mostrar.
      const abierta = (await obtenerRevision(revisionId, admin, { sql: tx, ahora }))!;
      expect(abierta.documentos.find((d) => d.documentoId === con.id)!.insumos).toEqual(esperado);
      expect(abierta.documentos.find((d) => d.documentoId === sin.id)!.insumos).toEqual(vacio);

      await cerrarRevision(admin, { revisionId, credenciales: { clave: "ok" } }, { sql: tx, ahora, verificar: firmaDePrueba });
      expect((await filaDe(tx, revisionId, con.id))!.insumos).toEqual(esperado);
      expect((await filaDe(tx, revisionId, sin.id))!.insumos).toEqual(vacio);
      const [{ sinCongelar }] = await tx`SELECT count(*)::int AS "sinCongelar" FROM revision_anual_decisiones
        WHERE revision_id = ${revisionId} AND NOT (insumos ? 'tramites')`;
      expect(sinCongelar).toBe(0);

      // Después del cierre: una consulta nueva no cambia lo que se muestra de la revisión cerrada.
      await tx`INSERT INTO eventos_consulta (tipo, documento_id, version_id, creado_en)
        VALUES ('descarga', ${con.id}, ${con.versionId}, ${new Date("2090-04-20T15:00:00Z")})`;
      const cerrada = (await obtenerRevision(revisionId, admin, { sql: tx, ahora: new Date("2090-04-21T15:00:00Z") }))!;
      expect(cerrada.documentos.find((d) => d.documentoId === con.id)!.insumos).toEqual(esperado);
    }));
});
