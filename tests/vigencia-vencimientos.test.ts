/**
 * La pasada de documentos con revisión vencida (spec 13C §7.5 y §13.3): un aviso por persona y proceso con el
 * conteo, el escalamiento al jefe y la exclusión de la revisión anual abierta; y la de los externos con la verificación
 * vencida; y la de los impactos normativos vencidos. Cada caso silencia los documentos, los externos y los impactos que
 * ya hay en la base y cuenta solo los suyos.
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
import { aplicarPublicacion } from "@/db/consultas/admin";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import { revisarVencimientos } from "@/db/consultas/vencimientos";
import { registrarVerificacion } from "@/db/consultas/vigencia/externos";
import { revisarVencimientosDeVigencia } from "@/db/consultas/vigencia/vencimientos";
import { asociarProceso, enlazarDocumento } from "@/db/consultas/normograma/asociaciones";
import { cambiarEstadoNorma } from "@/db/consultas/normograma/normas";
import { enlaceDeImpacto } from "@/lib/normograma/tipos";
import { silenciarDistribucion } from "./utiles/distribucion";
import { normaDePrueba, silenciarImpactos } from "./utiles/normograma";
import { sesionAdmin, sesionDe, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";
import {
  enRevisionAbierta,
  externoDePrueba,
  procesoSinLider,
  silenciarVigencia,
  sinFechaDeRevision,
  sinRevisionAbierta,
  vigenteFuera,
} from "./utiles/vigencia";

const sql = obtenerSql();
const ahora = new Date("2026-11-08T15:00:00Z");
const DIA = 86_400_000;

let almacen: string;
const previo = process.env.ALMACEN_RUTA;

beforeAll(() => {
  almacen = mkdtempSync(path.join(tmpdir(), "sgc-vigencia-vencimientos-"));
  process.env.ALMACEN_RUTA = almacen;
});

afterAll(async () => {
  if (previo === undefined) delete process.env.ALMACEN_RUTA;
  else process.env.ALMACEN_RUTA = previo;
  rmSync(almacen, { recursive: true, force: true });
  await sql.end();
  globalThis.__sql = undefined;
});

/** Antes de crear sus datos: sin revisión abierta, sin otros documentos ni impactos por avisar, y el último aviso. */
async function preparar(tx: TransactionSql): Promise<number> {
  await sinRevisionAbierta(tx);
  await silenciarVigencia(tx);
  await silenciarImpactos(tx);
  const [{ id }] = await tx`SELECT COALESCE(max(id), 0) AS id FROM notificaciones`;
  return Number(id);
}

const avisosDe = async (tx: TransactionSql, usuarioId: number, desde: number) => [
  ...(await tx`SELECT tipo, titulo, cuerpo, enlace, entidad, entidad_id FROM notificaciones
    WHERE usuario_id = ${usuarioId} AND id > ${desde} AND tipo LIKE 'vigencia.%' ORDER BY id`),
];

describe("revisarVencimientosDeVigencia", () => {
  it("avisa una vez por persona y proceso, con el conteo, y marca las filas", () =>
    revertida(sql, async (tx) => {
      const desde = await preparar(tx);
      const config = await obtenerConfigDocumental({ sql: tx });
      const liderGth = await sesionDe(tx, "lider.gth");
      const admin = await sesionAdmin(tx);
      const a = await vigenteFuera(tx, { fechaAprobacion: "2025-01-10", proceso: "GTH" });
      const b = await vigenteFuera(tx, { fechaAprobacion: "2025-02-10", proceso: "GTH" });
      const actualizados = async () => [...(await tx`SELECT id, actualizado_en FROM documentos WHERE id IN (${a.id}, ${b.id}) ORDER BY id`)];
      const antes = await actualizados();

      const r = await revisarVencimientosDeVigencia({ sql: tx, ahora, config });
      expect(r.avisados).toBe(2);
      const avisos = await tx`SELECT titulo FROM notificaciones
        WHERE tipo = 'vigencia.vencida' AND usuario_id = ${liderGth.usuarioId} AND id > ${desde}`;
      expect(avisos).toHaveLength(1);
      expect(avisos[0].titulo).toMatch(/^2 documentos con revisión vencida en/);

      // El líder y los Admin SGC, aunque el proceso tenga líder: el mismo aviso, con el semáforo filtrado y sin códigos.
      for (const usuarioId of [liderGth.usuarioId, admin.usuarioId]) {
        const [aviso, ...otros] = await avisosDe(tx, usuarioId, desde);
        expect(otros).toEqual([]);
        expect(aviso).toMatchObject({
          tipo: "vigencia.vencida",
          titulo: "2 documentos con revisión vencida en Gestión del Talento Humano",
          enlace: `/vigencia/semaforo?estado=vencida&proceso=${a.procesoId}`,
          entidad: "proceso",
        });
        expect(Number(aviso.entidad_id)).toBe(a.procesoId);
        for (const d of [a, b]) {
          expect(`${aviso.titulo} ${aviso.cuerpo ?? ""}`).not.toContain(d.codigo);
          expect(`${aviso.titulo} ${aviso.cuerpo ?? ""}`).not.toContain(d.titulo);
        }
      }

      expect((await tx`SELECT 1 FROM documentos WHERE id IN (${a.id}, ${b.id}) AND revision_aviso_en IS NULL`).length).toBe(0);
      // La marca no es un cambio del documento.
      expect(await actualizados()).toEqual(antes);
      expect((await revisarVencimientosDeVigencia({ sql: tx, ahora, config })).avisados).toBe(0);
    }));

  it("escala al jefe a los días configurados, sin título ni enlace", () =>
    revertida(sql, async (tx) => {
      const desde = await preparar(tx);
      const config = { ...(await obtenerConfigDocumental({ sql: tx })), escalamientoDias: 3 };
      const jefe = await usuarioDePrueba(tx, { rol: "consulta" });
      const [gth] = await tx`SELECT id FROM procesos WHERE sigla = 'GTH'`;
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [Number(gth.id)], jefeId: jefe.usuarioId });
      // La próxima revisión fue ayer, el 7 nov 2026.
      const d = await vigenteFuera(tx, { fechaAprobacion: "2025-11-07", proceso: "GTH" });

      expect(await revisarVencimientosDeVigencia({ sql: tx, ahora, config })).toEqual({ avisados: 1, escalados: 0 });
      expect(await avisosDe(tx, jefe.usuarioId, desde)).toEqual([]);
      const enCuatro = new Date(ahora.getTime() + 4 * DIA);
      expect(await revisarVencimientosDeVigencia({ sql: tx, ahora: enCuatro, config })).toEqual({ avisados: 0, escalados: 1 });
      expect(await revisarVencimientosDeVigencia({ sql: tx, ahora: new Date(ahora.getTime() + 5 * DIA), config })).toEqual({
        avisados: 0,
        escalados: 0,
      });

      const delJefe = await avisosDe(tx, jefe.usuarioId, desde);
      expect(delJefe).toHaveLength(1);
      expect(delJefe[0]).toMatchObject({ tipo: "vigencia.escalado", enlace: null });
      expect(`${delJefe[0].titulo} ${delJefe[0].cuerpo ?? ""}`).not.toContain(d.codigo);
      expect(`${delJefe[0].titulo} ${delJefe[0].cuerpo ?? ""}`).not.toContain(d.titulo);
      expect(delJefe[0].cuerpo).toContain(lider.nombre);
      const [marcas] = await tx`SELECT revision_escalado_en FROM documentos WHERE id = ${d.id}`;
      expect(marcas.revision_escalado_en).toEqual(enCuatro);
      expect(await avisosDe(tx, lider.usuarioId, desde)).toMatchObject([
        { tipo: "vigencia.vencida", titulo: "1 documento con revisión vencida en Gestión del Talento Humano" },
      ]);
    }));

  it("sin fecha de revisión no es vencido, y el vencido de un proceso sin líder avisa a los Admin SGC", () =>
    revertida(sql, async (tx) => {
      const desde = await preparar(tx);
      const config = await obtenerConfigDocumental({ sql: tx });
      const admin = await sesionAdmin(tx);
      const sinLider = await procesoSinLider(tx);
      const sinFecha = await vigenteFuera(tx, { fechaAprobacion: "2025-01-10", proceso: "GTH" });
      await sinFechaDeRevision(tx, sinFecha);
      const huerfano = await vigenteFuera(tx, { fechaAprobacion: "2025-01-10", proceso: sinLider.sigla });

      expect((await revisarVencimientosDeVigencia({ sql: tx, ahora, config })).avisados).toBe(1);
      const [marca] = await tx`SELECT revision_aviso_en FROM documentos WHERE id = ${sinFecha.id}`;
      expect(marca.revision_aviso_en).toBeNull();
      expect(await avisosDe(tx, admin.usuarioId, desde)).toMatchObject([
        {
          tipo: "vigencia.vencida",
          titulo: `1 documento con revisión vencida en ${sinLider.nombre}`,
          enlace: `/vigencia/semaforo?estado=vencida&proceso=${huerfano.procesoId}`,
        },
      ]);
    }));

  it("no avisa de los documentos de la revisión anual abierta", () =>
    revertida(sql, async (tx) => {
      await preparar(tx);
      const config = await obtenerConfigDocumental({ sql: tx });
      const enCampana = await vigenteFuera(tx, { fechaAprobacion: "2025-01-10", proceso: "GTH" });
      await enRevisionAbierta(tx, enCampana, 2096);

      expect(await revisarVencimientosDeVigencia({ sql: tx, ahora, config })).toEqual({ avisados: 0, escalados: 0 });
      const [marca] = await tx`SELECT revision_aviso_en FROM documentos WHERE id = ${enCampana.id}`;
      expect(marca.revision_aviso_en).toBeNull();

      // El helper cierra la revisión abierta dentro de la transacción: el documento vuelve a avisarse.
      await sinRevisionAbierta(tx);
      expect((await tx`SELECT 1 FROM revisiones_anuales WHERE estado = 'abierta'`).length).toBe(0);
      expect((await revisarVencimientosDeVigencia({ sql: tx, ahora, config })).avisados).toBe(1);
    }));
});

describe("sin jefe ni destinatario, la marca queda para cuando los haya", () => {
  it("un líder sin jefe no escala ni marca el escalamiento; cuando tiene jefe, la pasada siguiente escala", () =>
    revertida(sql, async (tx) => {
      const desde = await preparar(tx);
      const config = { ...(await obtenerConfigDocumental({ sql: tx })), escalamientoDias: 3 };
      const sinLider = await procesoSinLider(tx);
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [sinLider.id] });
      const d = await vigenteFuera(tx, { fechaAprobacion: "2025-01-10", proceso: sinLider.sigla });

      expect(await revisarVencimientosDeVigencia({ sql: tx, ahora, config })).toEqual({ avisados: 1, escalados: 0 });
      const marcas = async () => (await tx`SELECT revision_aviso_en, revision_escalado_en FROM documentos WHERE id = ${d.id}`)[0];
      expect(await marcas()).toMatchObject({ revision_aviso_en: ahora, revision_escalado_en: null });

      const jefe = await usuarioDePrueba(tx, { rol: "consulta" });
      await tx`UPDATE usuarios SET jefe_inmediato_id = ${jefe.usuarioId} WHERE id = ${lider.usuarioId}`;
      const despues = new Date(ahora.getTime() + DIA);
      expect(await revisarVencimientosDeVigencia({ sql: tx, ahora: despues, config })).toEqual({ avisados: 0, escalados: 1 });
      expect(await marcas()).toMatchObject({ revision_aviso_en: ahora, revision_escalado_en: despues });
      expect(await avisosDe(tx, jefe.usuarioId, desde)).toMatchObject([{ tipo: "vigencia.escalado", enlace: null }]);
    }));

  it("sin líder ni Admin SGC activos no avisa ni marca; con un Admin SGC, la pasada siguiente avisa", () =>
    revertida(sql, async (tx) => {
      const desde = await preparar(tx);
      const config = await obtenerConfigDocumental({ sql: tx });
      const sinLider = await procesoSinLider(tx);
      await tx`UPDATE usuarios SET activo = false WHERE rol = 'admin_sgc' AND activo`;
      const d = await vigenteFuera(tx, { fechaAprobacion: "2025-01-10", proceso: sinLider.sigla });

      expect(await revisarVencimientosDeVigencia({ sql: tx, ahora, config })).toEqual({ avisados: 0, escalados: 0 });
      const [marca] = await tx`SELECT revision_aviso_en, revision_escalado_en FROM documentos WHERE id = ${d.id}`;
      expect(marca).toMatchObject({ revision_aviso_en: null, revision_escalado_en: null });

      const admin = await sesionAdmin(tx);
      expect((await revisarVencimientosDeVigencia({ sql: tx, ahora, config })).avisados).toBe(1);
      expect(await avisosDe(tx, admin.usuarioId, desde)).toMatchObject([{ tipo: "vigencia.vencida" }]);
    }));
});

describe("publicar una versión nueva", () => {
  /** Un borrador listo para publicarse sobre la vigente del documento. */
  async function borrador(tx: TransactionSql, documentoId: number): Promise<number> {
    const [v] = await tx`INSERT INTO documento_versiones (documento_id, numero, estado, aprobo, fecha_aprobacion)
      VALUES (${documentoId}, 2, 'borrador', 'Prueba', '2026-11-08') RETURNING id`;
    return Number(v.id);
  }

  it("borra la fecha fijada a mano y reinicia las marcas del aviso", () =>
    revertida(sql, async (tx) => {
      await sinRevisionAbierta(tx);
      const admin = await sesionAdmin(tx);
      const d = await vigenteFuera(tx, { fechaAprobacion: "2025-01-10", proceso: "GTH" });
      await tx`UPDATE documentos SET proxima_revision_fijada = '2026-12-15', fijada_por = ${admin.usuarioId}, fijada_en = now(),
          fijada_nota = 'Carga inicial', revision_aviso_en = now(), revision_escalado_en = now()
        WHERE id = ${d.id}`;
      await aplicarPublicacion(tx, await borrador(tx, d.id), "plataforma", admin.usuarioId, ahora);
      const [f] = await tx`SELECT proxima_revision_fijada, fijada_por, fijada_en, fijada_nota, revision_aviso_en, revision_escalado_en,
          actualizado_en
        FROM documentos WHERE id = ${d.id}`;
      expect(f).toEqual({
        proxima_revision_fijada: null,
        fijada_por: null,
        fijada_en: null,
        fijada_nota: null,
        revision_aviso_en: null,
        revision_escalado_en: null,
        actualizado_en: ahora,
      });
    }));

  it("avisado, se publica una versión nueva, vuelve a vencer y la pasada avisa otra vez", () =>
    revertida(sql, async (tx) => {
      const desde = await preparar(tx);
      const config = await obtenerConfigDocumental({ sql: tx });
      const admin = await sesionAdmin(tx);
      const liderGth = await sesionDe(tx, "lider.gth");
      const d = await vigenteFuera(tx, { fechaAprobacion: "2025-01-10", proceso: "GTH" });
      expect((await revisarVencimientosDeVigencia({ sql: tx, ahora, config })).avisados).toBe(1);

      await aplicarPublicacion(tx, await borrador(tx, d.id), "plataforma", admin.usuarioId, ahora);
      expect((await revisarVencimientosDeVigencia({ sql: tx, ahora, config })).avisados).toBe(0);
      // Publicada el 8 nov 2026: la próxima revisión es el 8 nov 2027, vencida un mes después.
      const otroAnio = new Date("2027-12-08T15:00:00Z");
      expect((await revisarVencimientosDeVigencia({ sql: tx, ahora: otroAnio, config })).avisados).toBe(1);
      expect((await avisosDe(tx, liderGth.usuarioId, desde)).map((a) => a.titulo)).toEqual([
        "1 documento con revisión vencida en Gestión del Talento Humano",
        "1 documento con revisión vencida en Gestión del Talento Humano",
      ]);
    }));
});

describe("revisarVencimientos con la vigencia", () => {
  it("corre la pasada de vigencia después de la distribución y suma lo suyo", () =>
    revertida(sql, async (tx) => {
      const desde = await preparar(tx);
      await tx`UPDATE tramites SET aviso_vencido_en = now(), escalado_en = now()`;
      await silenciarDistribucion(tx);
      const liderGth = await sesionDe(tx, "lider.gth");
      await vigenteFuera(tx, { fechaAprobacion: "2025-01-10", proceso: "GTH" });

      expect((await revisarVencimientos({ sql: tx, ahora })).avisados).toBe(1);
      expect(await avisosDe(tx, liderGth.usuarioId, desde)).toMatchObject([
        { tipo: "vigencia.vencida", titulo: "1 documento con revisión vencida en Gestión del Talento Humano" },
      ]);
    }));
});

describe("externos con la verificación vencida", () => {
  const avisosExternos = async (tx: TransactionSql, usuarioId: number, desde: number) => [
    ...(await tx`SELECT tipo, titulo, cuerpo, enlace, entidad, entidad_id FROM notificaciones
      WHERE usuario_id = ${usuarioId} AND id > ${desde} AND tipo LIKE 'externos.%' ORDER BY id`),
  ];
  const marcasDe = async (tx: TransactionSql, documentoId: number) =>
    (await tx`SELECT aviso_vencido_en, escalado_en FROM externos WHERE documento_id = ${documentoId}`)[0];

  it("un externo vencido avisa una vez al responsable, nombrándolo; a los Admin SGC por proceso sin códigos; y escala a su jefe sin título ni enlace", () =>
    revertida(sql, async (tx) => {
      const desde = await preparar(tx);
      const config = { ...(await obtenerConfigDocumental({ sql: tx })), escalamientoDias: 3 };
      const lider = await sesionDe(tx, "lider.cex");
      const admin = await sesionAdmin(tx);
      const jefe = await usuarioDePrueba(tx, { rol: "consulta" });
      const responsable = await usuarioDePrueba(tx, { rol: "consulta", jefeId: jefe.usuarioId });
      // Adoptado el 7 nov 2025: la próxima verificación fue ayer, el 7 nov 2026.
      const e = await externoDePrueba(tx, lider, {
        proceso: "CEX",
        edicion: "2017",
        responsableId: responsable.usuarioId,
        ahora: new Date("2025-11-07T15:00:00Z"),
      });
      try {
        expect(await revisarVencimientosDeVigencia({ sql: tx, ahora, config })).toEqual({ avisados: 1, escalados: 0 });
        expect(await avisosExternos(tx, responsable.usuarioId, desde)).toEqual([
          {
            tipo: "externos.vencida",
            titulo: `${e.codigo} · ${e.titulo}: la verificación de vigencia venció hace 1 día`,
            cuerpo: "Consulte la fuente oficial y registre la verificación.",
            enlace: `/vigencia/externos/${e.documentoId}`,
            entidad: "documento",
            entidad_id: e.documentoId,
          },
        ]);
        const [delAdmin, ...otros] = await avisosExternos(tx, admin.usuarioId, desde);
        expect(otros).toEqual([]);
        expect(delAdmin).toMatchObject({
          tipo: "externos.vencida",
          titulo: "1 documento externo con la verificación de vigencia vencida en Consulta Externa",
          enlace: `/vigencia/externos?estado=vencida&proceso=${e.procesoId}`,
          entidad: "proceso",
        });
        expect(`${delAdmin.titulo} ${delAdmin.cuerpo ?? ""}`).not.toContain(e.codigo);
        // Nadie más: ni el líder (no es el responsable técnico) ni el jefe todavía.
        expect(await avisosExternos(tx, lider.usuarioId, desde)).toEqual([]);
        expect(await avisosExternos(tx, jefe.usuarioId, desde)).toEqual([]);
        expect((await marcasDe(tx, e.documentoId)).aviso_vencido_en).toEqual(ahora);

        // La misma pasada no repite; a los cuatro días escala una vez, al jefe del responsable.
        expect(await revisarVencimientosDeVigencia({ sql: tx, ahora, config })).toEqual({ avisados: 0, escalados: 0 });
        const enCuatro = new Date(ahora.getTime() + 4 * DIA);
        expect(await revisarVencimientosDeVigencia({ sql: tx, ahora: enCuatro, config })).toEqual({ avisados: 0, escalados: 1 });
        expect(await revisarVencimientosDeVigencia({ sql: tx, ahora: new Date(ahora.getTime() + 5 * DIA), config })).toEqual({
          avisados: 0,
          escalados: 0,
        });
        const delJefe = await avisosExternos(tx, jefe.usuarioId, desde);
        expect(delJefe).toHaveLength(1);
        expect(delJefe[0]).toMatchObject({ tipo: "externos.escalado", enlace: null });
        expect(`${delJefe[0].titulo} ${delJefe[0].cuerpo ?? ""}`).not.toContain(e.codigo);
        expect(`${delJefe[0].titulo} ${delJefe[0].cuerpo ?? ""}`).not.toContain(e.titulo);
        expect(delJefe[0].cuerpo).toContain(responsable.nombre);
        expect((await marcasDe(tx, e.documentoId)).escalado_en).toEqual(enCuatro);
      } finally {
        await e.limpiar();
      }
    }));

  it("verificar reinicia las marcas y no vuelve a avisar hasta que venza otra vez; sin jefe no escala ni marca", () =>
    revertida(sql, async (tx) => {
      const desde = await preparar(tx);
      const config = { ...(await obtenerConfigDocumental({ sql: tx })), escalamientoDias: 3 };
      const lider = await sesionDe(tx, "lider.cex");
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const e = await externoDePrueba(tx, lider, {
        proceso: "CEX",
        edicion: "2017",
        responsableId: responsable.usuarioId,
        ahora: new Date("2025-08-14T15:00:00Z"),
      });
      try {
        expect(await revisarVencimientosDeVigencia({ sql: tx, ahora, config })).toEqual({ avisados: 1, escalados: 0 });
        // Vencido hace más de tres días, pero el responsable no tiene jefe: la marca del escalamiento queda vacía.
        expect(await marcasDe(tx, e.documentoId)).toMatchObject({ aviso_vencido_en: ahora, escalado_en: null });

        await registrarVerificacion(
          responsable,
          { documentoId: e.documentoId, resultado: "vigente", fuente: "https://www.minsalud.gov.co/normatividad", nota: null },
          { sql: tx, ahora },
        );
        expect(await marcasDe(tx, e.documentoId)).toMatchObject({ aviso_vencido_en: null, escalado_en: null });
        expect(await revisarVencimientosDeVigencia({ sql: tx, ahora, config })).toEqual({ avisados: 0, escalados: 0 });
        expect((await avisosExternos(tx, responsable.usuarioId, desde)).map((a) => a.tipo)).toEqual(["externos.vencida"]);
      } finally {
        await e.limpiar();
      }
    }));

  it("un restringido que el responsable no ve no lo nombra ante él: el aviso va solo a los Admin SGC", () =>
    revertida(sql, async (tx) => {
      const desde = await preparar(tx);
      const config = await obtenerConfigDocumental({ sql: tx });
      const lider = await sesionDe(tx, "lider.cex");
      const admin = await sesionAdmin(tx);
      const [cex] = await tx`SELECT id FROM procesos WHERE sigla = 'CEX'`;
      const responsable = await usuarioDePrueba(tx, { rol: "consulta", procesos: [Number(cex.id)] });
      const e = await externoDePrueba(tx, lider, {
        proceso: "CEX",
        edicion: "2017",
        responsableId: responsable.usuarioId,
        nivelAcceso: "restringido",
        ahora: new Date("2025-08-14T15:00:00Z"),
      });
      try {
        await tx`DELETE FROM usuario_procesos WHERE usuario_id = ${responsable.usuarioId}`;
        expect((await revisarVencimientosDeVigencia({ sql: tx, ahora, config })).avisados).toBe(1);
        expect(await avisosExternos(tx, responsable.usuarioId, desde)).toEqual([]);
        expect(await avisosExternos(tx, admin.usuarioId, desde)).toMatchObject([{ tipo: "externos.vencida", entidad: "proceso" }]);
      } finally {
        await e.limpiar();
      }
    }));
});

describe("impactos normativos vencidos", () => {
  const avisosNormograma = async (tx: TransactionSql, usuarioId: number, desde: number) => [
    ...(await tx`SELECT tipo, titulo, cuerpo, enlace, entidad, entidad_id FROM notificaciones
      WHERE usuario_id = ${usuarioId} AND id > ${desde} AND tipo IN ('normograma.impacto_vencido', 'normograma.escalado') ORDER BY id`),
  ];

  it("un impacto vencido avisa una vez al líder y a los Admin SGC, sin nombrar el documento, y a los días configurados escala a su jefe sin enlace", () =>
    revertida(sql, async (tx) => {
      const desde = await preparar(tx);
      const config = { ...(await obtenerConfigDocumental({ sql: tx })), escalamientoDias: 3 };
      const admin = await sesionAdmin(tx);
      const proceso = await procesoSinLider(tx);
      const jefe = await usuarioDePrueba(tx, { rol: "consulta" });
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [proceso.id], jefeId: jefe.usuarioId });
      const doc = await vigenteFuera(tx, { fechaAprobacion: "2026-10-01", proceso: proceso.sigla });
      const n = await normaDePrueba(tx, admin);
      await enlazarDocumento(admin, { normaId: n.id, documentoId: doc.id }, { sql: tx });
      // El cambio se registró hace 17 días: con el plazo de 15, el impacto venció hace dos.
      const { cambioId } = await cambiarEstadoNorma(
        admin,
        { normaId: n.id, estado: "derogada", fecha: "2026-10-20", nota: null },
        { sql: tx, ahora: new Date(ahora.getTime() - 17 * DIA) },
      );
      const marcas = async () => (await tx`SELECT aviso_vencido_en, escalado_en FROM impactos_normativos WHERE cambio_id = ${cambioId}`)[0];
      try {
        expect(await revisarVencimientosDeVigencia({ sql: tx, ahora, config })).toEqual({ avisados: 1, escalados: 0 });
        const esperado = {
          tipo: "normograma.impacto_vencido",
          titulo: `Venció la revisión del impacto de ${n.nombre} en ${proceso.nombre}`,
          enlace: enlaceDeImpacto(cambioId!, proceso.id),
          entidad: "proceso",
          entidad_id: proceso.id,
        };
        const [delLider, ...otrosDelLider] = await avisosNormograma(tx, lider.usuarioId, desde);
        expect(otrosDelLider).toEqual([]);
        expect(delLider).toMatchObject(esperado);
        const [delAdmin, ...otrosDelAdmin] = await avisosNormograma(tx, admin.usuarioId, desde);
        expect(otrosDelAdmin).toEqual([]);
        expect(delAdmin).toMatchObject(esperado);
        for (const aviso of [delLider, delAdmin]) {
          expect(`${aviso.titulo} ${aviso.cuerpo ?? ""}`).not.toContain(doc.codigo);
          expect(`${aviso.titulo} ${aviso.cuerpo ?? ""}`).not.toContain(doc.titulo);
        }
        expect(await avisosNormograma(tx, jefe.usuarioId, desde)).toEqual([]);
        expect((await marcas()).aviso_vencido_en).toEqual(ahora);

        // La misma pasada no repite; a los cuatro días de vencido (más de tres) escala una vez, al jefe del líder.
        expect(await revisarVencimientosDeVigencia({ sql: tx, ahora, config })).toEqual({ avisados: 0, escalados: 0 });
        const enDos = new Date(ahora.getTime() + 2 * DIA);
        expect(await revisarVencimientosDeVigencia({ sql: tx, ahora: enDos, config })).toEqual({ avisados: 0, escalados: 1 });
        expect(await revisarVencimientosDeVigencia({ sql: tx, ahora: new Date(ahora.getTime() + 3 * DIA), config })).toEqual({
          avisados: 0,
          escalados: 0,
        });
        const delJefe = await avisosNormograma(tx, jefe.usuarioId, desde);
        expect(delJefe).toHaveLength(1);
        expect(delJefe[0]).toMatchObject({ tipo: "normograma.escalado", titulo: `Impactos normativos vencidos en ${proceso.nombre}`, enlace: null });
        expect(`${delJefe[0].titulo} ${delJefe[0].cuerpo ?? ""}`).not.toContain(doc.codigo);
        expect(`${delJefe[0].titulo} ${delJefe[0].cuerpo ?? ""}`).not.toContain(doc.titulo);
        expect(delJefe[0].cuerpo).toContain(lider.nombre);
        expect((await marcas()).escalado_en).toEqual(enDos);
        // Solo el líder y los Admin SGC recibieron el aviso de vencido: una vez cada uno.
        expect((await avisosNormograma(tx, lider.usuarioId, desde)).map((a) => a.tipo)).toEqual(["normograma.impacto_vencido"]);
      } finally {
        await doc.limpiar();
      }
    }));

  it("revisarVencimientos también corre la pasada de los impactos", () =>
    revertida(sql, async (tx) => {
      const desde = await preparar(tx);
      await tx`UPDATE tramites SET aviso_vencido_en = now(), escalado_en = now()`;
      await silenciarDistribucion(tx);
      const admin = await sesionAdmin(tx);
      const proceso = await procesoSinLider(tx);
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [proceso.id] });
      const n = await normaDePrueba(tx, admin);
      await asociarProceso(admin, { normaId: n.id, procesoId: proceso.id, requisito: null }, { sql: tx });
      await cambiarEstadoNorma(admin, { normaId: n.id, estado: "modificada", fecha: "2026-10-20", nota: null }, {
        sql: tx,
        ahora: new Date(ahora.getTime() - 17 * DIA),
      });

      expect((await revisarVencimientos({ sql: tx, ahora })).avisados).toBe(1);
      expect((await avisosNormograma(tx, lider.usuarioId, desde)).map((a) => a.titulo)).toEqual([
        `Venció la revisión del impacto de ${n.nombre} en ${proceso.nombre}`,
      ]);
    }));
});
