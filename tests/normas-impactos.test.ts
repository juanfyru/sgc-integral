/**
 * El impacto documental de un cambio normativo (spec 13C §10.5 y §13.3): los impactos que nacen al derogar,
 * modificar o retirar una norma, su tarea y su aviso, la marca en el semáforo y en las listas, cómo se resuelven
 * (no afecta, solicitud, verificación de un externo) y la pasada de los vencidos. Contra la BD de desarrollo, dentro
 * de una transacción que se revierte; los PDF de prueba van a un almacén temporal.
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import type { TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const contexto = vi.hoisted(() => ({ tx: null as unknown, sesion: null as unknown }));

vi.mock("@/db/cliente", async (importar) => {
  const real = await importar<typeof import("@/db/cliente")>();
  return { ...real, obtenerSql: () => contexto.tx ?? real.obtenerSql() };
});
vi.mock("@/lib/paginas", () => ({
  exigirSesion: async () => contexto.sesion,
  exigirPermiso: async () => contexto.sesion,
  exigirEntradaPanel: async () => contexto.sesion,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("no encontrada");
  },
  redirect: (ruta: string) => {
    throw new Error(`redirige a ${ruta}`);
  },
}));

import PaginaDocumentosAdmin from "@/app/(app)/admin/(panel)/page";
import VistaProceso from "@/app/(app)/procesos/[slug]/page";
import { obtenerSql } from "@/db/cliente";
import { listarDocumentosAdmin } from "@/db/consultas/admin";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { asociarProceso, enlazarDocumento } from "@/db/consultas/normograma/asociaciones";
import {
  impactoPendienteDe,
  impactosDe,
  impactosVencidos,
  resolverImpacto,
  resolverImpactoPorVerificacion,
  tareasDeImpactos,
} from "@/db/consultas/normograma/impactos";
import { cambiarEstadoNorma, retirarNorma } from "@/db/consultas/normograma/normas";
import { registrarRelacion } from "@/db/consultas/normograma/relaciones";
import { obtenerDocumentosDeProceso } from "@/db/consultas/procesos";
import { crearSolicitud } from "@/db/consultas/tramites-flujo";
import { registrarVerificacion } from "@/db/consultas/vigencia/externos";
import { listarSemaforo, vigenciaDeDocumento } from "@/db/consultas/vigencia/semaforo";
import { fechaLimite } from "@/lib/tramites/plazos";
import { textoVigenciaDeFila } from "@/lib/vigencia/semaforo";
import { zonaHoraria } from "@/lib/zona-horaria";
import { normaDePrueba, silenciarImpactos } from "./utiles/normograma";
import { opc, sesionAdmin, sesionDe, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";
import { externoDePrueba, procesoSinLider, vigenteFuera } from "./utiles/vigencia";

const sql = obtenerSql();
const ahora = new Date("2026-11-08T15:00:00Z");
const DIA = 86_400_000;

let almacen: string;
const previo = process.env.ALMACEN_RUTA;

beforeAll(() => {
  almacen = mkdtempSync(path.join(tmpdir(), "sgc-normas-impactos-"));
  process.env.ALMACEN_RUTA = almacen;
});

afterAll(async () => {
  if (previo === undefined) delete process.env.ALMACEN_RUTA;
  else process.env.ALMACEN_RUTA = previo;
  rmSync(almacen, { recursive: true, force: true });
  await sql.end();
  globalThis.__sql = undefined;
});

type Proceso = { id: number; nombre: string; slug: string };

async function procesoDe(tx: TransactionSql, sigla: string): Promise<Proceso> {
  const [p] = await tx`SELECT id, nombre, slug FROM procesos WHERE sigla = ${sigla}`;
  return { id: Number(p.id), nombre: p.nombre, slug: p.slug };
}

/** Los avisos de `tipo` de la persona; con `normaId`, solo los de esa norma (la demo y la base pueden traer otros). */
async function avisosDe(tx: TransactionSql, usuarioId: number, tipo: string, normaId?: number) {
  return tx`SELECT titulo, cuerpo, enlace FROM notificaciones
    WHERE usuario_id = ${usuarioId} AND tipo = ${tipo} ${normaId === undefined ? tx`` : tx`AND entidad = 'norma' AND entidad_id = ${normaId}`}
    ORDER BY id`;
}

/** Pinta `pagina` con la conexión de la prueba y la sesión dada. */
async function pintar(tx: TransactionSql, sesion: SesionFlujo, pagina: () => Promise<React.ReactElement>): Promise<string> {
  contexto.tx = tx;
  contexto.sesion = sesion;
  try {
    return renderToStaticMarkup(await pagina()).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  } finally {
    contexto.tx = null;
    contexto.sesion = null;
  }
}

describe("nacimiento de los impactos", () => {
  it("derogar una norma con documentos enlazados abre un impacto por documento y uno por proceso sin documentos, con tarea y aviso al líder", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const liderGth = await sesionDe(tx, "lider.gth");
      const liderCex = await sesionDe(tx, "lider.cex");
      const gth = await procesoDe(tx, "GTH");
      const cex = await procesoDe(tx, "CEX");
      const n = await normaDePrueba(tx, admin);
      const doc = await vigenteFuera(tx, { fechaAprobacion: "2026-10-01", proceso: "GTH" });
      await enlazarDocumento(admin, { normaId: n.id, documentoId: doc.id }, { sql: tx });
      // GTH tiene un documento enlazado: su impacto es el del documento, no uno de proceso.
      await asociarProceso(admin, { normaId: n.id, procesoId: gth.id, requisito: null }, { sql: tx });
      await asociarProceso(admin, { normaId: n.id, procesoId: cex.id, requisito: "art. 5" }, { sql: tx });
      expect((await vigenciaDeDocumento(doc.id, admin, { sql: tx, ahora }))!.vigencia.estado).toBe("al_dia");

      const r = await cambiarEstadoNorma(admin, { normaId: n.id, estado: "derogada", fecha: "2026-11-01", nota: null }, { sql: tx, ahora });
      expect(r.impactos).toBe(2);
      const impactos = await tx`SELECT documento_id, proceso_id, estado, vence_en, norma_id FROM impactos_normativos WHERE cambio_id = ${r.cambioId} ORDER BY id`;
      const vence = fechaLimite(ahora, 15, zonaHoraria());
      expect(impactos).toEqual([
        { documento_id: doc.id, proceso_id: gth.id, estado: "pendiente", vence_en: vence, norma_id: n.id },
        { documento_id: null, proceso_id: cex.id, estado: "pendiente", vence_en: vence, norma_id: n.id },
      ]);

      const tareas = await tareasDeImpactos(liderGth, { sql: tx });
      expect(tareas.map((t) => t.id)).toContain(`impacto:${r.cambioId}:${gth.id}`);
      expect(tareas.find((t) => t.id === `impacto:${r.cambioId}:${gth.id}`)).toEqual({
        id: `impacto:${r.cambioId}:${gth.id}`,
        modulo: "documentos",
        titulo: `Revisar el impacto de ${n.nombre} (derogada) en ${gth.nombre} (1)`,
        detalle: expect.any(String),
        vence,
        enlace: `/normograma/impactos/${r.cambioId}?proceso=${gth.id}`,
      });
      expect((await tareasDeImpactos(liderCex, { sql: tx })).map((t) => t.id)).toContain(`impacto:${r.cambioId}:${cex.id}`);
      expect((await tareasDeImpactos(liderCex, { sql: tx })).map((t) => t.id)).not.toContain(`impacto:${r.cambioId}:${gth.id}`);
      // GTH y CEX tienen líder: no son tareas del Admin SGC. Consulta no tiene tareas de impacto.
      expect((await tareasDeImpactos(admin, { sql: tx })).some((t) => t.id.startsWith(`impacto:${r.cambioId}:`))).toBe(false);
      expect(await tareasDeImpactos(await usuarioDePrueba(tx, { rol: "consulta" }), { sql: tx })).toEqual([]);

      expect((await vigenciaDeDocumento(doc.id, admin, { sql: tx, ahora }))!.vigencia.estado).toBe("atencion");
      expect(await impactoPendienteDe(doc.id, { sql: tx })).toEqual({ cambioId: r.cambioId, norma: n.nombre });
      const [aviso] = await tx`SELECT 1 FROM notificaciones
        WHERE tipo = 'normograma.cambio' AND usuario_id = ${liderGth.usuarioId} AND entidad_id = ${n.id}`;
      expect(aviso).toBeTruthy();
      const avisosDelLider = await avisosDe(tx, liderGth.usuarioId, "normograma.cambio", n.id);
      expect(avisosDelLider).toHaveLength(1);
      const [delLider] = avisosDelLider;
      expect(delLider).toMatchObject({
        titulo: `${n.nombre} pasó a derogada: revise su impacto en ${gth.nombre}`,
        enlace: `/normograma/impactos/${r.cambioId}?proceso=${gth.id}`,
      });
      // El aviso nombra la norma y el proceso, nunca el documento.
      expect(`${delLider.titulo} ${delLider.cuerpo ?? ""}`).not.toContain(doc.codigo);
      expect(`${delLider.titulo} ${delLider.cuerpo ?? ""}`).not.toContain(doc.titulo);
      expect(await avisosDe(tx, liderCex.usuarioId, "normograma.cambio", n.id)).toMatchObject([
        { titulo: `${n.nombre} pasó a derogada: revise su impacto en ${cex.nombre}` },
      ]);
    }));

  it("un cambio de estado sobre una norma sin documentos ni procesos no deja impactos ni tareas", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const liderGth = await sesionDe(tx, "lider.gth");
      const n = await normaDePrueba(tx, admin);
      const r = await cambiarEstadoNorma(admin, { normaId: n.id, estado: "derogada", fecha: "2026-11-01", nota: null }, { sql: tx, ahora });
      expect(r).toEqual({ cambioId: expect.any(Number), impactos: 0 });
      expect(await tx`SELECT 1 FROM impactos_normativos WHERE norma_id = ${n.id}`).toHaveLength(0);
      expect(await tx`SELECT 1 FROM notificaciones WHERE tipo = 'normograma.cambio' AND entidad_id = ${n.id}`).toHaveLength(0);
      expect((await tareasDeImpactos(liderGth, { sql: tx })).some((t) => t.id.startsWith(`impacto:${r.cambioId}:`))).toBe(false);
      // Volver a vigente a mano no abre impactos.
      expect((await cambiarEstadoNorma(admin, { normaId: n.id, estado: "vigente", fecha: "2026-11-02", nota: "Por error" }, { sql: tx, ahora })).impactos).toBe(0);
    }));

  it("en un proceso sin líder la tarea y el aviso son de los Admin SGC, salvo de quien hizo el cambio", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const otroAdmin = await sesionAdmin(tx);
      const huerfano = await procesoSinLider(tx);
      const n = await normaDePrueba(tx, admin);
      await asociarProceso(admin, { normaId: n.id, procesoId: huerfano.id, requisito: null }, { sql: tx });
      const { cambioId } = await cambiarEstadoNorma(admin, { normaId: n.id, estado: "modificada", fecha: "2026-11-01", nota: null }, { sql: tx, ahora });
      const id = `impacto:${cambioId}:${huerfano.id}`;
      expect((await tareasDeImpactos(admin, { sql: tx })).map((t) => t.id)).toContain(id);
      expect((await tareasDeImpactos(otroAdmin, { sql: tx })).find((t) => t.id === id)?.titulo).toBe(
        `Revisar el impacto de ${n.nombre} (modificada) en ${huerfano.nombre} (1)`,
      );
      expect(await avisosDe(tx, admin.usuarioId, "normograma.cambio", n.id)).toEqual([]);
      expect(await avisosDe(tx, otroAdmin.usuarioId, "normograma.cambio", n.id)).toMatchObject([
        { titulo: `${n.nombre} pasó a modificada: revise su impacto en ${huerfano.nombre}`, enlace: `/normograma/impactos/${cambioId}?proceso=${huerfano.id}` },
      ]);
    }));

  it("modificar, retirar y relacionar también abren impactos; dos cambios seguidos dan dos tareas", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const liderGth = await sesionDe(tx, "lider.gth");
      const gth = await procesoDe(tx, "GTH");
      const vieja = await normaDePrueba(tx, admin, { anio: 2014 });
      const nueva = await normaDePrueba(tx, admin, { anio: 2019, fechaExpedicion: "2019-11-25" });
      const doc = await vigenteFuera(tx, { fechaAprobacion: "2026-10-01", proceso: "GTH" });
      await enlazarDocumento(admin, { normaId: vieja.id, documentoId: doc.id }, { sql: tx });

      const modifica = await registrarRelacion(admin, { normaId: nueva.id, afectadaId: vieja.id, tipo: "modifica", detalle: null }, { sql: tx, ahora });
      expect(modifica.impactos).toBe(1);
      const retiro = await (async () => {
        await retirarNorma(admin, { normaId: vieja.id, motivo: "Ya no aplica al hospital" }, { sql: tx, ahora });
        const [c] = await tx`SELECT id FROM norma_cambios WHERE norma_id = ${vieja.id} ORDER BY id DESC LIMIT 1`;
        return Number(c.id);
      })();
      expect(await tx`SELECT 1 FROM impactos_normativos WHERE documento_id = ${doc.id} AND estado = 'pendiente'`).toHaveLength(2);
      const ids = (await tareasDeImpactos(liderGth, { sql: tx })).map((t) => t.id);
      expect(ids).toContain(`impacto:${modifica.cambioId}:${gth.id}`);
      expect(ids).toContain(`impacto:${retiro}:${gth.id}`);
      // La marca del semáforo nombra el cambio más reciente.
      expect(await impactoPendienteDe(doc.id, { sql: tx })).toEqual({ cambioId: retiro, norma: vieja.nombre });
    }));
});

describe("la marca en el semáforo y en las listas", () => {
  it("tras derogar una norma enlazada, Gestión de documentos y la página del proceso dicen lo mismo que el semáforo", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const liderGth = await sesionDe(tx, "lider.gth");
      const gth = await procesoDe(tx, "GTH");
      const n = await normaDePrueba(tx, admin);
      const doc = await vigenteFuera(tx, { fechaAprobacion: "2026-10-01", proceso: "GTH" });
      await enlazarDocumento(admin, { normaId: n.id, documentoId: doc.id }, { sql: tx });
      await cambiarEstadoNorma(admin, { normaId: n.id, estado: "derogada", fecha: "2026-11-01", nota: null }, { sql: tx, ahora });

      const fila = (await listarSemaforo(admin, { estado: "todos" }, { sql: tx, ahora })).find((f) => f.documentoId === doc.id)!;
      expect(fila.impacto).toEqual({ cambioId: expect.any(Number), procesoId: gth.id, norma: n.nombre });
      const texto = textoVigenciaDeFila(fila);
      expect(texto).toBe("Atención · revisión por cambio normativo");
      expect((await listarDocumentosAdmin(admin, { sql: tx, ahora })).find((f) => f.id === doc.id)?.vigencia).toMatchObject({ estado: "atencion", texto });
      expect((await obtenerDocumentosDeProceso(gth.id, false, liderGth, { sql: tx, ahora })).find((d) => d.id === doc.id)?.vigencia).toMatchObject({
        estado: "atencion",
        texto,
      });

      expect(await pintar(tx, admin, () => PaginaDocumentosAdmin())).toContain(`${doc.codigo} ${doc.titulo} Procedimiento GTH Vigente ${texto} `);
      expect(
        await pintar(tx, liderGth, () => VistaProceso({ params: Promise.resolve({ slug: gth.slug }), searchParams: Promise.resolve({}) })),
      ).toContain(`${doc.codigo} v1 ${texto}`);
    }));
});

describe("la tarea cuenta lo que la página de impactos muestra", () => {
  it("un documento que el líder dejó de ver no cuenta en su tarea; si solo quedan ocultos, no hay tarea", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const proceso = await procesoSinLider(tx);
      const gth = await procesoDe(tx, "GTH");
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [proceso.id] });
      const visible = await vigenteFuera(tx, { fechaAprobacion: "2026-10-01", proceso: proceso.sigla });
      const oculto = await vigenteFuera(tx, { fechaAprobacion: "2026-10-01", proceso: proceso.sigla });
      await tx`UPDATE documentos SET nivel_acceso = 'restringido' WHERE id = ${oculto.id}`;
      const n = await normaDePrueba(tx, admin);
      for (const documentoId of [visible.id, oculto.id]) await enlazarDocumento(admin, { normaId: n.id, documentoId }, { sql: tx });
      const { cambioId } = await cambiarEstadoNorma(admin, { normaId: n.id, estado: "derogada", fecha: "2026-11-01", nota: null }, { sql: tx, ahora });
      const id = `impacto:${cambioId}:${proceso.id}`;
      const tarea = async () => (await tareasDeImpactos(lider, { sql: tx })).find((t) => t.id === id);
      expect((await tarea())?.titulo).toBe(`Revisar el impacto de ${n.nombre} (derogada) en ${proceso.nombre} (2)`);

      // El restringido pasa a otro proceso: su impacto sigue en el del líder, que ya no lo ve (ni en la página).
      await tx`UPDATE documento_proceso SET proceso_id = ${gth.id}, subproceso_id = NULL WHERE documento_id = ${oculto.id} AND es_principal`;
      expect((await tarea())?.titulo).toBe(`Revisar el impacto de ${n.nombre} (derogada) en ${proceso.nombre} (1)`);
      expect(await impactosDe(cambioId!, proceso.id, lider, { sql: tx })).toHaveLength(1);

      const [delVisible] = await tx`SELECT id FROM impactos_normativos WHERE cambio_id = ${cambioId} AND documento_id = ${visible.id}`;
      await resolverImpacto(lider, { impactoId: Number(delVisible.id), resolucion: "no_afecta", nota: "El documento ya cumple." }, { sql: tx, ahora });
      // Solo queda el oculto: ni tarea ni página (que sería «no encontrada»).
      expect(await tarea()).toBeUndefined();
      // El Admin SGC sí lo ve (ve los restringidos) en la página del proceso.
      expect(await impactosDe(cambioId!, proceso.id, admin, { sql: tx })).toHaveLength(2);
      await visible.limpiar();
      await oculto.limpiar();
    }));
});

describe("resolución de los impactos", () => {
  it("«no afecta» exige nota y quita la marca; una solicitud enlazada resuelve con el trámite; otro líder recibe 404", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const liderGth = await sesionDe(tx, "lider.gth");
      const liderCex = await sesionDe(tx, "lider.cex");
      const gth = await procesoDe(tx, "GTH");
      const cex = await procesoDe(tx, "CEX");
      const n = await normaDePrueba(tx, admin);
      const uno = await vigenteFuera(tx, { fechaAprobacion: "2026-10-01", proceso: "GTH" });
      const dos = await vigenteFuera(tx, { fechaAprobacion: "2026-10-01", proceso: "GTH" });
      const otro = await vigenteFuera(tx, { fechaAprobacion: "2026-10-01", proceso: "GTH" });
      for (const d of [uno, dos]) await enlazarDocumento(admin, { normaId: n.id, documentoId: d.id }, { sql: tx });
      await asociarProceso(admin, { normaId: n.id, procesoId: cex.id, requisito: null }, { sql: tx });
      const { cambioId } = await cambiarEstadoNorma(admin, { normaId: n.id, estado: "derogada", fecha: "2026-11-01", nota: null }, { sql: tx, ahora });

      const lista = (await impactosDe(cambioId!, gth.id, liderGth, { sql: tx }))!;
      expect(lista.map((i) => i.documento?.codigo).sort()).toEqual([uno.codigo, dos.codigo].sort());
      const de = (codigo: string) => lista.find((i) => i.documento?.codigo === codigo)!;
      expect(de(uno.codigo)).toMatchObject({
        cambio: { id: cambioId, norma: { id: n.id, nombre: n.nombre }, estadoNuevo: "derogada", fecha: "2026-11-01" },
        proceso: { id: gth.id, nombre: gth.nombre, sigla: "GTH" },
        documento: { id: uno.id, codigo: uno.codigo, titulo: uno.titulo, origen: "interno", version: 1, tramiteAbierto: null },
        estado: "pendiente",
        resolucion: null,
        tramite: null,
        verificacion: null,
      });

      await expect(resolverImpacto(liderGth, { impactoId: de(uno.codigo).id, resolucion: "no_afecta", nota: "x" }, { sql: tx })).rejects.toThrow("al menos 5");
      await resolverImpacto(liderGth, { impactoId: de(uno.codigo).id, resolucion: "no_afecta", nota: "El procedimiento no cita la norma" }, { sql: tx, ahora });
      expect((await impactosDe(cambioId!, gth.id, liderGth, { sql: tx }))!.find((i) => i.id === de(uno.codigo).id)).toMatchObject({
        estado: "resuelto",
        resolucion: "no_afecta",
        nota: "El procedimiento no cita la norma",
        resueltoPor: liderGth.nombre,
        resueltoEn: ahora,
      });
      expect((await vigenciaDeDocumento(uno.id, admin, { sql: tx, ahora }))!.vigencia.estado).toBe("al_dia");
      await expect(resolverImpacto(liderGth, { impactoId: de(uno.codigo).id, resolucion: "no_afecta", nota: "Otra vez lo mismo" }, { sql: tx })).rejects.toThrow(
        "ya está resuelto",
      );
      const [auditado] = await tx`SELECT entidad, entidad_id, detalle FROM auditoria WHERE accion = 'impacto_resuelto' AND usuario_id = ${liderGth.usuarioId} ORDER BY id DESC LIMIT 1`;
      expect(auditado).toMatchObject({ entidad: "documento", entidad_id: uno.id });
      expect(auditado.detalle).toMatchObject({ norma: n.nombre, codigo: uno.codigo, proceso: gth.nombre, resolucion: "no_afecta" });

      // El trámite de otro documento no resuelve este impacto; el del documento sí.
      const deOtro = await crearSolicitud(liderGth, { tipo: "modificar", motivo: "cambio_normativo", justificacion: "Actualizar por la norma nueva", documentoId: otro.id }, opc(tx));
      await expect(resolverImpacto(liderGth, { impactoId: de(dos.codigo).id, resolucion: "solicitud", tramiteId: deOtro.tramiteId }, { sql: tx })).rejects.toThrow(
        "La solicitud no es de este documento",
      );
      const t = await crearSolicitud(liderGth, { tipo: "modificar", motivo: "cambio_normativo", justificacion: "Actualizar por la derogatoria", documentoId: dos.id }, opc(tx));
      expect((await impactosDe(cambioId!, gth.id, liderGth, { sql: tx }))!.find((i) => i.id === de(dos.codigo).id)?.documento?.tramiteAbierto).toEqual({
        id: t.tramiteId,
        numero: t.numero,
      });
      await resolverImpacto(liderGth, { impactoId: de(dos.codigo).id, resolucion: "solicitud", tramiteId: t.tramiteId }, { sql: tx, ahora });
      expect((await impactosDe(cambioId!, gth.id, liderGth, { sql: tx }))!.find((i) => i.id === de(dos.codigo).id)).toMatchObject({
        estado: "resuelto",
        resolucion: "solicitud",
        tramite: { id: t.tramiteId, numero: t.numero },
      });
      expect((await tareasDeImpactos(liderGth, { sql: tx })).some((x) => x.id === `impacto:${cambioId}:${gth.id}`)).toBe(false);

      // Otro líder no ve el impacto: no existe para él.
      expect(await impactosDe(cambioId!, gth.id, liderCex, { sql: tx })).toBeNull();
      const [deProceso] = (await impactosDe(cambioId!, cex.id, liderCex, { sql: tx }))!;
      expect(deProceso).toMatchObject({ documento: null, proceso: { id: cex.id } });
      await expect(resolverImpacto(liderGth, { impactoId: deProceso.id, resolucion: "no_afecta", nota: "No es de mi proceso" }, { sql: tx })).rejects.toThrow(
        "El impacto no existe",
      );
      await expect(resolverImpacto(await usuarioDePrueba(tx, { rol: "consulta" }), { impactoId: deProceso.id, resolucion: "no_afecta", nota: "Sin permiso alguno" }, { sql: tx })).rejects.toThrow(
        "El impacto no existe",
      );
      expect(await impactosDe(987_654_321, cex.id, admin, { sql: tx })).toBeNull();
      // El impacto de proceso no se resuelve con una verificación ni con la modificación de un documento.
      await expect(
        tx.savepoint((sp) => resolverImpactoPorVerificacion(sp, liderCex.usuarioId, { impactoId: deProceso.id, verificacionId: 1 }, ahora)),
      ).rejects.toThrow("Solo el impacto sobre un documento externo se resuelve con una verificación");
      await expect(resolverImpacto(liderCex, { impactoId: deProceso.id, resolucion: "solicitud", tramiteId: t.tramiteId }, { sql: tx })).rejects.toThrow(
        "La solicitud no es una creación en este proceso",
      );
      // El Admin SGC resuelve cualquiera.
      await resolverImpacto(admin, { impactoId: deProceso.id, resolucion: "no_afecta", nota: "Consulta Externa no aplica" }, { sql: tx, ahora });
      expect(await tareasDeImpactos(liderCex, { sql: tx })).not.toContainEqual(expect.objectContaining({ id: `impacto:${cambioId}:${cex.id}` }));
    }));

  it("el impacto sobre un externo se resuelve con su verificación, también la de un responsable técnico de rol Consulta, y nunca con una solicitud", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const liderCex = await sesionDe(tx, "lider.cex");
      const cex = await procesoDe(tx, "CEX");
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const n = await normaDePrueba(tx, admin);
      const e = await externoDePrueba(tx, liderCex, { proceso: "CEX", edicion: "2017", ahora, responsableId: responsable.usuarioId });
      await enlazarDocumento(liderCex, { normaId: n.id, documentoId: e.documentoId }, { sql: tx });
      const { cambioId } = await cambiarEstadoNorma(admin, { normaId: n.id, estado: "derogada", fecha: "2026-11-01", nota: null }, { sql: tx, ahora });
      const [impacto] = (await impactosDe(cambioId!, cex.id, liderCex, { sql: tx }))!;
      expect(impacto.documento).toMatchObject({ id: e.documentoId, origen: "externo", tramiteAbierto: null });
      expect((await vigenciaDeDocumento(e.documentoId, admin, { sql: tx, ahora }))!.vigencia.estado).toBe("atencion");

      await expect(resolverImpacto(liderCex, { impactoId: impacto.id, resolucion: "solicitud", tramiteId: 1 }, { sql: tx })).rejects.toThrow(
        "Un documento externo no tiene trámite",
      );
      const { verificacionId } = await registrarVerificacion(
        responsable,
        { documentoId: e.documentoId, resultado: "vigente", fuente: "Portal del Ministerio", nota: null, impactoId: impacto.id },
        { sql: tx, ahora },
      );
      expect((await impactosDe(cambioId!, cex.id, liderCex, { sql: tx }))![0]).toMatchObject({
        estado: "resuelto",
        resolucion: "verificacion",
        verificacion: { id: verificacionId, resultado: "vigente" },
        resueltoPor: responsable.nombre,
      });
      expect((await vigenciaDeDocumento(e.documentoId, admin, { sql: tx, ahora }))!.vigencia.estado).toBe("al_dia");
      const [ev] = await tx`SELECT impacto_id FROM externo_verificaciones WHERE id = ${verificacionId}`;
      expect(Number(ev.impacto_id)).toBe(impacto.id);
      // Un formulario viejo con el mismo impacto lo dice; el impacto de otro documento sigue sin existir para este.
      await expect(
        registrarVerificacion(responsable, { documentoId: e.documentoId, resultado: "vigente", fuente: "Portal del Ministerio", nota: null, impactoId: impacto.id }, { sql: tx, ahora }),
      ).rejects.toThrow("Ese impacto ya está resuelto");
      const otro = await vigenteFuera(tx, { fechaAprobacion: "2026-10-01", proceso: "CEX" });
      await enlazarDocumento(admin, { normaId: n.id, documentoId: otro.id }, { sql: tx });
      await cambiarEstadoNorma(admin, { normaId: n.id, estado: "vigente", fecha: "2026-11-02", nota: null }, { sql: tx, ahora });
      const ajeno = await cambiarEstadoNorma(admin, { normaId: n.id, estado: "modificada", fecha: "2026-11-03", nota: null }, { sql: tx, ahora });
      const [deOtro] = await tx`SELECT id FROM impactos_normativos WHERE cambio_id = ${ajeno.cambioId} AND documento_id = ${otro.id}`;
      await expect(
        registrarVerificacion(responsable, { documentoId: e.documentoId, resultado: "vigente", fuente: "Portal del Ministerio", nota: null, impactoId: Number(deOtro.id) }, { sql: tx, ahora }),
      ).rejects.toThrow("El documento no existe");
    }));
});

describe("impactos vencidos", () => {
  it("un impacto vencido avisa una vez a quien tiene la tarea y escala a su jefe, sin nombrar el documento", () =>
    revertida(sql, async (tx) => {
      await silenciarImpactos(tx);
      const admin = await sesionAdmin(tx);
      const gth = await procesoDe(tx, "GTH");
      const jefe = await usuarioDePrueba(tx, { rol: "consulta" });
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [gth.id], jefeId: jefe.usuarioId });
      const n = await normaDePrueba(tx, admin);
      const doc = await vigenteFuera(tx, { fechaAprobacion: "2026-10-01", proceso: "GTH" });
      await enlazarDocumento(admin, { normaId: n.id, documentoId: doc.id }, { sql: tx });
      const { cambioId } = await cambiarEstadoNorma(admin, { normaId: n.id, estado: "derogada", fecha: "2026-11-01", nota: null }, { sql: tx, ahora });

      // Vence el 23 nov: ese día aún no avisa.
      expect(await impactosVencidos({ sql: tx, ahora: new Date(ahora.getTime() + 15 * DIA), escalamientoDias: 3 })).toEqual({ avisados: 0, escalados: 0 });
      const alDiaSiguiente = new Date(ahora.getTime() + 16 * DIA);
      expect(await impactosVencidos({ sql: tx, ahora: alDiaSiguiente, escalamientoDias: 3 })).toEqual({ avisados: 1, escalados: 0 });
      expect(await impactosVencidos({ sql: tx, ahora: alDiaSiguiente, escalamientoDias: 3 })).toEqual({ avisados: 0, escalados: 0 });
      const [aviso] = await avisosDe(tx, lider.usuarioId, "normograma.impacto_vencido");
      expect(aviso).toMatchObject({
        titulo: `Venció la revisión del impacto de ${n.nombre} en ${gth.nombre}`,
        enlace: `/normograma/impactos/${cambioId}?proceso=${gth.id}`,
      });
      expect(`${aviso.titulo} ${aviso.cuerpo}`).not.toContain(doc.codigo);
      expect(`${aviso.titulo} ${aviso.cuerpo}`).not.toContain(doc.titulo);
      expect(await avisosDe(tx, jefe.usuarioId, "normograma.escalado")).toEqual([]);

      // Vencido hace 3 días no escala con escalamientoDias = 3; hace 4, sí.
      expect(await impactosVencidos({ sql: tx, ahora: new Date(ahora.getTime() + 18 * DIA), escalamientoDias: 3 })).toEqual({ avisados: 0, escalados: 0 });
      const despues = new Date(ahora.getTime() + 19 * DIA);
      expect(await impactosVencidos({ sql: tx, ahora: despues, escalamientoDias: 3 })).toEqual({ avisados: 0, escalados: 1 });
      expect(await impactosVencidos({ sql: tx, ahora: despues, escalamientoDias: 3 })).toEqual({ avisados: 0, escalados: 0 });
      const delJefe = await avisosDe(tx, jefe.usuarioId, "normograma.escalado");
      expect(delJefe).toHaveLength(1);
      expect(delJefe[0]).toMatchObject({ titulo: `Impactos normativos vencidos en ${gth.nombre}`, enlace: null });
      expect(delJefe[0].cuerpo).toContain(lider.nombre);
      expect(`${delJefe[0].titulo} ${delJefe[0].cuerpo}`).not.toContain(doc.codigo);
      const [marcas] = await tx`SELECT aviso_vencido_en, escalado_en FROM impactos_normativos WHERE cambio_id = ${cambioId}`;
      expect(marcas).toEqual({ aviso_vencido_en: alDiaSiguiente, escalado_en: despues });
    }));

  it("sin destinatario no hay aviso ni marca, y sin jefe no hay escalamiento ni marca", () =>
    revertida(sql, async (tx) => {
      await silenciarImpactos(tx);
      const admin = await sesionAdmin(tx);
      const huerfano = await procesoSinLider(tx);
      const n = await normaDePrueba(tx, admin);
      await asociarProceso(admin, { normaId: n.id, procesoId: huerfano.id, requisito: null }, { sql: tx });
      const { cambioId } = await cambiarEstadoNorma(admin, { normaId: n.id, estado: "derogada", fecha: "2026-11-01", nota: null }, { sql: tx, ahora });
      // Sin líder en el proceso y sin ningún Admin SGC activo, nadie tiene la tarea.
      await tx`UPDATE usuarios SET activo = false WHERE rol = 'admin_sgc'`;
      const avisos = async () =>
        (await tx`SELECT count(*)::int AS n FROM notificaciones WHERE tipo IN ('normograma.impacto_vencido', 'normograma.escalado')`)[0].n;
      const antes = await avisos();
      expect(await impactosVencidos({ sql: tx, ahora: new Date(ahora.getTime() + 30 * DIA), escalamientoDias: 3 })).toEqual({ avisados: 0, escalados: 0 });
      expect(await avisos()).toBe(antes);
      const [marcas] = await tx`SELECT aviso_vencido_en, escalado_en FROM impactos_normativos WHERE cambio_id = ${cambioId}`;
      expect(marcas).toEqual({ aviso_vencido_en: null, escalado_en: null });
    }));

  it("un impacto resuelto no se avisa", () =>
    revertida(sql, async (tx) => {
      await silenciarImpactos(tx);
      const admin = await sesionAdmin(tx);
      const gth = await procesoDe(tx, "GTH");
      const n = await normaDePrueba(tx, admin);
      await asociarProceso(admin, { normaId: n.id, procesoId: gth.id, requisito: null }, { sql: tx });
      const { cambioId } = await cambiarEstadoNorma(admin, { normaId: n.id, estado: "derogada", fecha: "2026-11-01", nota: null }, { sql: tx, ahora });
      const [impacto] = (await impactosDe(cambioId!, gth.id, admin, { sql: tx }))!;
      await resolverImpacto(admin, { impactoId: impacto.id, resolucion: "no_afecta", nota: "Nada cambia en el proceso" }, { sql: tx, ahora });
      expect(await impactosVencidos({ sql: tx, ahora: new Date(ahora.getTime() + 30 * DIA), escalamientoDias: 3 })).toEqual({ avisados: 0, escalados: 0 });
    }));
});

describe("casos de borde (ronda de corrección 1)", () => {
  it("un documento enlazado sin versión vigente y un proceso asociado inactivo no abren impactos", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const cex = await procesoDe(tx, "CEX");
      const n = await normaDePrueba(tx, admin);
      const sinVigente = await vigenteFuera(tx, { fechaAprobacion: "2026-10-01", proceso: "GTH" });
      await enlazarDocumento(admin, { normaId: n.id, documentoId: sinVigente.id }, { sql: tx });
      await tx`UPDATE documento_versiones SET estado = 'obsoleto' WHERE documento_id = ${sinVigente.id}`;
      await asociarProceso(admin, { normaId: n.id, procesoId: cex.id, requisito: null }, { sql: tx });
      await tx`UPDATE procesos SET activo = false WHERE id = ${cex.id}`;
      const r = await cambiarEstadoNorma(admin, { normaId: n.id, estado: "derogada", fecha: "2026-11-01", nota: null }, { sql: tx, ahora });
      expect(r.impactos).toBe(0);
      expect(await tx`SELECT 1 FROM impactos_normativos WHERE cambio_id = ${r.cambioId}`).toHaveLength(0);
    }));

  it("el impacto de proceso se resuelve con una solicitud de creación en el proceso", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const liderCex = await sesionDe(tx, "lider.cex");
      const cex = await procesoDe(tx, "CEX");
      const n = await normaDePrueba(tx, admin);
      await asociarProceso(admin, { normaId: n.id, procesoId: cex.id, requisito: "art. 7" }, { sql: tx });
      const { cambioId } = await cambiarEstadoNorma(admin, { normaId: n.id, estado: "modificada", fecha: "2026-11-01", nota: null }, { sql: tx, ahora });
      const [impacto] = (await impactosDe(cambioId!, cex.id, liderCex, { sql: tx }))!;
      const [tipo] = await tx`SELECT id FROM tipos_documento WHERE sigla = 'PR'`;
      const creacion = await crearSolicitud(
        liderCex,
        { tipo: "crear", motivo: "cambio_normativo", justificacion: "Procedimiento que exige la norma", procesoId: cex.id, tipoDocumentoId: Number(tipo.id), tituloPropuesto: "Atención según la norma nueva" },
        opc(tx, "2026-11-09T15:00:00Z"),
      );
      await resolverImpacto(liderCex, { impactoId: impacto.id, resolucion: "solicitud", tramiteId: creacion.tramiteId }, { sql: tx, ahora });
      expect((await impactosDe(cambioId!, cex.id, liderCex, { sql: tx }))![0]).toMatchObject({
        estado: "resuelto",
        resolucion: "solicitud",
        tramite: { id: creacion.tramiteId, numero: creacion.numero },
      });
    }));

  it("el trámite que resuelve un impacto está abierto o nació después del cambio; uno cerrado de antes no", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const liderGth = await sesionDe(tx, "lider.gth");
      const gth = await procesoDe(tx, "GTH");
      const n = await normaDePrueba(tx, admin);
      const [cerrado, abierto, posterior] = [
        await vigenteFuera(tx, { fechaAprobacion: "2026-10-01", proceso: "GTH" }),
        await vigenteFuera(tx, { fechaAprobacion: "2026-10-01", proceso: "GTH" }),
        await vigenteFuera(tx, { fechaAprobacion: "2026-10-01", proceso: "GTH" }),
      ];
      const pedir = (documentoId: number, cuando: string) =>
        crearSolicitud(liderGth, { tipo: "modificar", motivo: "mejora", justificacion: "Ajuste de redacción del procedimiento", documentoId }, opc(tx, cuando));
      const viejo = await pedir(cerrado.id, "2026-10-15T15:00:00Z");
      await tx`UPDATE tramites SET etapa = 'cancelado' WHERE id = ${viejo.tramiteId}`;
      const enCurso = await pedir(abierto.id, "2026-10-20T15:00:00Z");
      for (const d of [cerrado, abierto, posterior]) await enlazarDocumento(admin, { normaId: n.id, documentoId: d.id }, { sql: tx });
      const { cambioId } = await cambiarEstadoNorma(admin, { normaId: n.id, estado: "derogada", fecha: "2026-11-01", nota: null }, { sql: tx, ahora });
      const lista = (await impactosDe(cambioId!, gth.id, liderGth, { sql: tx }))!;
      const de = (id: number) => lista.find((i) => i.documento?.id === id)!.id;

      await expect(resolverImpacto(liderGth, { impactoId: de(cerrado.id), resolucion: "solicitud", tramiteId: viejo.tramiteId }, { sql: tx })).rejects.toThrow(
        "La solicitud ya está cerrada y es anterior al cambio de la norma: abra una nueva",
      );
      await resolverImpacto(liderGth, { impactoId: de(abierto.id), resolucion: "solicitud", tramiteId: enCurso.tramiteId }, { sql: tx, ahora });
      // Una nueva, aunque luego se cancele, nació por el cambio.
      const nueva = await pedir(posterior.id, "2026-11-09T15:00:00Z");
      await tx`UPDATE tramites SET etapa = 'cancelado' WHERE id = ${nueva.tramiteId}`;
      await resolverImpacto(liderGth, { impactoId: de(posterior.id), resolucion: "solicitud", tramiteId: nueva.tramiteId }, { sql: tx, ahora });
      expect((await impactosDe(cambioId!, gth.id, liderGth, { sql: tx }))!.filter((i) => i.estado === "resuelto").map((i) => i.documento?.id).sort()).toEqual(
        [abierto.id, posterior.id].sort(),
      );
    }));
});
