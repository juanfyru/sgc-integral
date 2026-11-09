/**
 * Las tareas de vigencia de «Mis tareas» (spec 13C §7.5 y §13.1): «Revisar la vigencia» de un interno, «Verificar la
 * vigencia» de un externo y «Adoptar la edición nueva»: quién las recibe, su título y cuándo desaparecen.
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import type { TransactionSql } from "postgres";
import { registrarVerificacion } from "@/db/consultas/vigencia/externos";
import { columnasDeVigencia } from "@/db/consultas/vigencia/fragmentos";
import { tareasDeAdopcion, tareasDeExternos, tareasDeVigencia } from "@/db/consultas/vigencia/tareas";
import { misTareas } from "@/lib/tareas";
import { fechaLimite, finDeFecha } from "@/lib/tramites/plazos";
import { sesionAdmin, sesionDe, tramiteEn, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";
import { enRevisionAbierta, externoDePrueba, procesoSinLider, sinFechaDeRevision, sinRevisionAbierta, vigenteFuera } from "./utiles/vigencia";

const sql = obtenerSql();
const ahora = new Date("2026-11-08T15:00:00Z");

let almacen: string;
const previo = process.env.ALMACEN_RUTA;

beforeAll(() => {
  almacen = mkdtempSync(path.join(tmpdir(), "sgc-vigencia-tareas-"));
  process.env.ALMACEN_RUTA = almacen;
});

afterAll(async () => {
  if (previo === undefined) delete process.env.ALMACEN_RUTA;
  else process.env.ALMACEN_RUTA = previo;
  rmSync(almacen, { recursive: true, force: true });
  await sql.end();
  globalThis.__sql = undefined;
});

const ids = (tareas: { id: string }[]) => tareas.map((t) => t.id);
const ZONA = "America/Bogota";

/** Una verificación de la fuente oficial, sin nota. */
const verificacion = (documentoId: number, resultado: "vigente" | "edicion_nueva") => ({
  documentoId,
  resultado,
  fuente: "https://www.minsalud.gov.co/normatividad",
  nota: null,
});

/** El líder de CEX registra y adopta un externo el día `adoptado`; responde por él `responsableId`. */
async function externoAdoptadoEl(tx: TransactionSql, adoptado: string, responsableId: number, nivelAcceso?: "general" | "restringido") {
  const lider = await sesionDe(tx, "lider.cex");
  const e = await externoDePrueba(tx, lider, {
    proceso: "CEX",
    edicion: "2017",
    responsableId,
    nivelAcceso,
    ahora: new Date(`${adoptado}T15:00:00Z`),
  });
  return { lider, e };
}

describe("tareasDeVigencia", () => {
  it("el líder recibe la tarea de un vencido suyo; el Admin la de un proceso sin líder; nadie la de un al día", () =>
    revertida(sql, async (tx) => {
      await sinRevisionAbierta(tx);
      const lider = await sesionDe(tx, "lider.gth");
      const admin = await sesionAdmin(tx);
      const sinLider = await procesoSinLider(tx);
      const vencido = await vigenteFuera(tx, { fechaAprobacion: "2025-08-14", proceso: "GTH" });
      const huerfano = await vigenteFuera(tx, { fechaAprobacion: "2025-08-14", proceso: sinLider.sigla });
      const alDia = await vigenteFuera(tx, { fechaAprobacion: "2026-10-01", proceso: "GTH" });

      const delLider = await tareasDeVigencia(lider, { sql: tx, ahora });
      expect(ids(delLider)).toContain(`vigencia:${vencido.id}`);
      expect(ids(delLider)).not.toContain(`vigencia:${huerfano.id}`);
      expect(delLider.find((t) => t.id === `vigencia:${vencido.id}`)).toEqual({
        id: `vigencia:${vencido.id}`,
        modulo: "documentos",
        titulo: `Revisar la vigencia de ${vencido.codigo} v1 · vencida hace 86 días`,
        detalle: vencido.titulo,
        vence: expect.any(Date),
        enlace: `/documentos/${vencido.codigo.toLowerCase()}`,
      });

      const delAdmin = await tareasDeVigencia(admin, { sql: tx, ahora });
      expect(ids(delAdmin)).toContain(`vigencia:${huerfano.id}`);
      // GTH tiene líder: su vencido es tarea del líder, no del Admin SGC.
      expect(ids(delAdmin)).not.toContain(`vigencia:${vencido.id}`);

      for (const sesion of [lider, admin]) {
        expect(ids(await tareasDeVigencia(sesion, { sql: tx, ahora }))).not.toContain(`vigencia:${alDia.id}`);
      }
      // Ni la consulta ni la gerencia reciben tareas de vigencia.
      const consulta = await usuarioDePrueba(tx, { rol: "consulta", procesos: [vencido.procesoId] });
      expect(await tareasDeVigencia(consulta, { sql: tx, ahora })).toEqual([]);
      expect(await tareasDeVigencia(await sesionDe(tx, "gerente"), { sql: tx, ahora })).toEqual([]);
    }));

  it("en atención dice cuándo vence, y sin fecha de revisión lo dice", () =>
    revertida(sql, async (tx) => {
      await sinRevisionAbierta(tx);
      const lider = await sesionDe(tx, "lider.gth");
      const pronto = await vigenteFuera(tx, { fechaAprobacion: "2025-12-14", proceso: "GTH" });
      const sinFecha = await vigenteFuera(tx, { fechaAprobacion: "2025-12-14", proceso: "GTH" });
      await sinFechaDeRevision(tx, sinFecha);
      const tareas = await tareasDeVigencia(lider, { sql: tx, ahora });
      expect(tareas.find((t) => t.id === `vigencia:${pronto.id}`)).toMatchObject({
        titulo: `Revisar la vigencia de ${pronto.codigo} v1 · vence el 14 dic 2026`,
        vence: expect.any(Date),
      });
      expect(tareas.find((t) => t.id === `vigencia:${sinFecha.id}`)).toMatchObject({
        titulo: `Revisar la vigencia de ${sinFecha.codigo} v1 · sin fecha de revisión`,
        vence: null,
      });
    }));

  it("con un trámite abierto, la tarea es la del trámite", () =>
    revertida(sql, async (tx) => {
      await sinRevisionAbierta(tx);
      const t = await tramiteEn(tx, "elaboracion");
      try {
        const [{ documento_id: documentoId }] = await tx`SELECT documento_id FROM tramites WHERE id = ${t.tramiteId}`;
        await tx`UPDATE documento_versiones SET fecha_aprobacion = '2025-08-14', origen_aprobacion = 'fuera'
          WHERE documento_id = ${documentoId} AND estado = 'vigente'`;
        const [fila] = await columnasDeVigencia(tx, tx`d.id = ${documentoId}`, ahora);
        expect(fila.vigencia.estado).toBe("en_tramite");
        const admin = await sesionAdmin(tx);
        const lider = await sesionDe(tx, "lider.gth");
        for (const sesion of [admin, lider]) {
          expect(ids(await tareasDeVigencia(sesion, { sql: tx, ahora }))).not.toContain(`vigencia:${documentoId}`);
        }
      } finally {
        await t.limpiar();
      }
    }));

  it("un documento de la revisión anual abierta no da tarea: la de la campaña lo cubre", () =>
    revertida(sql, async (tx) => {
      await sinRevisionAbierta(tx);
      const lider = await sesionDe(tx, "lider.gth");
      const enCampana = await vigenteFuera(tx, { fechaAprobacion: "2025-08-14", proceso: "GTH" });
      const fuera = await vigenteFuera(tx, { fechaAprobacion: "2025-08-14", proceso: "GTH" });
      await enRevisionAbierta(tx, enCampana);
      const tareas = ids(await tareasDeVigencia(lider, { sql: tx, ahora }));
      expect(tareas).not.toContain(`vigencia:${enCampana.id}`);
      expect(tareas).toContain(`vigencia:${fuera.id}`);
      // El helper cierra la revisión abierta dentro de la transacción: el documento vuelve a dar tarea.
      await sinRevisionAbierta(tx);
      expect((await tx`SELECT 1 FROM revisiones_anuales WHERE estado = 'abierta'`).length).toBe(0);
      expect(ids(await tareasDeVigencia(lider, { sql: tx, ahora }))).toContain(`vigencia:${enCampana.id}`);
    }));
});

describe("tareasDeExternos", () => {
  it("el responsable técnico de un externo vencido tiene «Verificar la vigencia», que suma «Mis tareas»; quien no responde por él, no", () =>
    revertida(sql, async (tx) => {
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      // Adoptado el 14 ago 2025 con verificación cada 12 meses: la próxima fue el 14 ago 2026.
      const { lider, e } = await externoAdoptadoEl(tx, "2025-08-14", responsable.usuarioId);
      try {
        const tareas = await tareasDeExternos(responsable, { sql: tx, ahora });
        expect(tareas.find((t) => t.id === `externo:${e.documentoId}`)).toEqual({
          id: `externo:${e.documentoId}`,
          modulo: "documentos",
          titulo: `Verificar la vigencia de ${e.codigo} · ${e.titulo}`,
          detalle: "Verificación vencida hace 86 días",
          vence: finDeFecha("2026-08-14", ZONA),
          enlace: `/vigencia/externos/${e.documentoId}`,
        });
        expect(ids((await misTareas(responsable, { sql: tx, ahora })).tareas)).toContain(`externo:${e.documentoId}`);
        // El líder lo gestiona, pero no es su responsable técnico.
        expect(ids(await tareasDeExternos(lider, { sql: tx, ahora }))).not.toContain(`externo:${e.documentoId}`);
        expect(ids(await tareasDeExternos(await usuarioDePrueba(tx, { rol: "consulta" }), { sql: tx, ahora }))).toEqual([]);
      } finally {
        await e.limpiar();
      }
    }));

  it("se calcula por la fecha de la próxima verificación: en la ventana de atención dice cuándo vence; al día no hay tarea", () =>
    revertida(sql, async (tx) => {
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      // Próxima verificación el 14 dic 2026: a 36 días, dentro de la ventana de atención.
      const pronto = await externoAdoptadoEl(tx, "2025-12-14", responsable.usuarioId);
      const alDia = await externoAdoptadoEl(tx, "2026-10-01", responsable.usuarioId);
      try {
        const tareas = await tareasDeExternos(responsable, { sql: tx, ahora });
        expect(tareas.find((t) => t.id === `externo:${pronto.e.documentoId}`)).toMatchObject({
          titulo: `Verificar la vigencia de ${pronto.e.codigo} · ${pronto.e.titulo}`,
          detalle: "Próxima verificación el 14 dic 2026",
          vence: finDeFecha("2026-12-14", ZONA),
        });
        expect(ids(tareas)).not.toContain(`externo:${alDia.e.documentoId}`);
      } finally {
        await pronto.e.limpiar();
        await alDia.e.limpiar();
      }
    }));

  it("un restringido que el responsable dejó de ver no le da tarea", () =>
    revertida(sql, async (tx) => {
      const [cex] = await tx`SELECT id FROM procesos WHERE sigla = 'CEX'`;
      const responsable = await usuarioDePrueba(tx, { rol: "consulta", procesos: [Number(cex.id)] });
      const { e } = await externoAdoptadoEl(tx, "2025-08-14", responsable.usuarioId, "restringido");
      try {
        expect(ids(await tareasDeExternos(responsable, { sql: tx, ahora }))).toContain(`externo:${e.documentoId}`);
        await tx`DELETE FROM usuario_procesos WHERE usuario_id = ${responsable.usuarioId}`;
        expect(ids(await tareasDeExternos(responsable, { sql: tx, ahora }))).not.toContain(`externo:${e.documentoId}`);
      } finally {
        await e.limpiar();
      }
    }));
});

describe("tareasDeAdopcion", () => {
  it("tras «hay una edición nueva», quien gestiona tiene «Adoptar la edición nueva» a 15 días y el responsable ya no tiene la de verificar", () =>
    revertida(sql, async (tx) => {
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const { lider, e } = await externoAdoptadoEl(tx, "2025-08-14", responsable.usuarioId);
      try {
        expect(ids(await tareasDeAdopcion(lider, { sql: tx, ahora }))).not.toContain(`adopcion:${e.documentoId}`);
        await registrarVerificacion(responsable, verificacion(e.documentoId, "edicion_nueva"), { sql: tx, ahora });

        const delLider = await tareasDeAdopcion(lider, { sql: tx, ahora });
        expect(delLider.find((t) => t.id === `adopcion:${e.documentoId}`)).toEqual({
          id: `adopcion:${e.documentoId}`,
          modulo: "documentos",
          titulo: `Adoptar la edición nueva de ${e.codigo}`,
          detalle: e.titulo,
          vence: fechaLimite(ahora, 15, ZONA),
          enlace: `/vigencia/externos/${e.documentoId}`,
        });
        expect(ids((await misTareas(lider, { sql: tx, ahora })).tareas)).toContain(`adopcion:${e.documentoId}`);
        // La verificación reinició el reloj: la próxima es en un año, y la tarea ahora es adoptar.
        expect(ids(await tareasDeExternos(responsable, { sql: tx, ahora }))).not.toContain(`externo:${e.documentoId}`);
        // El Admin SGC también lo gestiona; ni el responsable de rol Consulta ni el líder de otro proceso.
        expect(ids(await tareasDeAdopcion(await sesionAdmin(tx), { sql: tx, ahora }))).toContain(`adopcion:${e.documentoId}`);
        expect(await tareasDeAdopcion(responsable, { sql: tx, ahora })).toEqual([]);
        expect(ids(await tareasDeAdopcion(await sesionDe(tx, "lider.gth"), { sql: tx, ahora }))).not.toContain(`adopcion:${e.documentoId}`);
        // Una segunda «edición nueva» no mueve el plazo: cuenta desde la primera.
        const despues = new Date("2026-11-20T15:00:00Z");
        await registrarVerificacion(responsable, verificacion(e.documentoId, "edicion_nueva"), { sql: tx, ahora: despues });
        expect((await tareasDeAdopcion(lider, { sql: tx, ahora: despues })).find((t) => t.id === `adopcion:${e.documentoId}`)?.vence).toEqual(
          fechaLimite(ahora, 15, ZONA),
        );
      } finally {
        await e.limpiar();
      }
    }));

  it("una verificación «sigue vigente» posterior borra la marca pendiente y con ella la tarea de adoptar", () =>
    revertida(sql, async (tx) => {
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const { lider, e } = await externoAdoptadoEl(tx, "2025-08-14", responsable.usuarioId);
      try {
        await registrarVerificacion(responsable, verificacion(e.documentoId, "edicion_nueva"), { sql: tx, ahora });
        expect(ids(await tareasDeAdopcion(lider, { sql: tx, ahora }))).toContain(`adopcion:${e.documentoId}`);
        await registrarVerificacion(responsable, verificacion(e.documentoId, "vigente"), { sql: tx, ahora: new Date("2026-11-10T15:00:00Z") });
        const [marca] = await tx`SELECT edicion_nueva_pendiente_desde FROM externos WHERE documento_id = ${e.documentoId}`;
        expect(marca.edicion_nueva_pendiente_desde).toBeNull();
        expect(ids(await tareasDeAdopcion(lider, { sql: tx, ahora }))).not.toContain(`adopcion:${e.documentoId}`);
      } finally {
        await e.limpiar();
      }
    }));
});
