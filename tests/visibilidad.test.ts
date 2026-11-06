/**
 * Visibilidad por rol y nivel de acceso (spec 13A §12), contra la demo ya
 * sembrada. No deja nada escrito: lo que necesita otros datos corre en una
 * transacción que se revierte.
 *   GTH-FO-01 → restringido, asociado al subproceso GTH/Ingreso.
 *   SGC-FO-03 → solo borrador, GIC-IN-02 → anulado, GTH-CA-01 → v1 obsoleta.
 */
import { existsSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { listarDocumentosAdmin, obtenerDocumentoAdmin } from "@/db/consultas/admin";
import { buscarDocumentos } from "@/db/consultas/busqueda";
import { obtenerArchivoVigente, obtenerFichaDocumento } from "@/db/consultas/documentos";
import { obtenerListadoMaestro } from "@/db/consultas/maestro";
import { obtenerDatosMapa } from "@/db/consultas/mapa";
import {
  obtenerDetalleProceso,
  obtenerDocumentosDeProceso,
  obtenerDocumentosDeSubproceso,
} from "@/db/consultas/procesos";
import {
  ROLES_VEN_RESTRINGIDO,
  puedeAccederDocumento,
  type SujetoVisibilidad,
} from "@/lib/alcance";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();

const sujeto = async (usuario: string): Promise<SujetoVisibilidad> => {
  const [u] = await sql`SELECT id, rol, ver_historial FROM usuarios WHERE usuario = ${usuario}`;
  return { usuarioId: u.id, rol: u.rol, verHistorial: u.ver_historial };
};
const RESTRINGIDO = "GTH-FO-01"; // Formato Lista de Chequeo Hoja de Vida, subproceso GTH/ingreso
const GTH = "gestion-del-talento-humano";

const idDocumento = async (codigo: string): Promise<number> => {
  const [d] = await sql`SELECT id FROM documentos WHERE codigo = ${codigo}`;
  return d.id as number;
};
const idProceso = async (sigla: string): Promise<number> => {
  const [p] = await sql`SELECT id FROM procesos WHERE sigla = ${sigla}`;
  return p.id as number;
};

afterAll(async () => {
  await sql.end();
});

it.each([["consulta", false], ["lider.cex", false], ["lider.gth", true], ["gerente", true], ["control.interno", true]] as const)(
  "%s ve el documento restringido: %s", async (usuario, ve) => {
    const s = await sujeto(usuario);
    const ficha = await obtenerFichaDocumento(RESTRINGIDO, s);
    expect(ficha !== null).toBe(ve);
    const r = await buscarDocumentos({ q: "hoja de vida" }, s);
    expect(r.resultados.some((x) => x.codigo === RESTRINGIDO)).toBe(ve);
    const [a] = await sql`SELECT a.id FROM archivos a JOIN documento_versiones v ON v.id = a.version_id
      JOIN documentos d ON d.id = v.documento_id WHERE d.codigo = ${RESTRINGIDO} AND v.estado = 'vigente' LIMIT 1`;
    expect((await obtenerArchivoVigente(RESTRINGIDO, a.id, s)) !== null).toBe(ve);
  });

it("un documento general lo ve cualquiera, y el relacionado restringido se oculta", async () => {
  const ficha = await obtenerFichaDocumento("GTH-PR-01", await sujeto("consulta")); // su formato relacionado es GTH-FO-01
  expect(ficha).not.toBeNull();
  expect(ficha!.relacionados.some((r) => r.codigo === RESTRINGIDO)).toBe(false);
  const conAcceso = await obtenerFichaDocumento("GTH-PR-01", await sujeto("lider.gth"));
  expect(conAcceso!.relacionados.some((r) => r.codigo === RESTRINGIDO)).toBe(true);
});

it("el conteo del mapa y la lista del proceso no cuentan lo que el usuario no ve", async () => {
  const contar = async (usuario: string) => {
    const mapa = await obtenerDatosMapa(await sujeto(usuario));
    return mapa.macroprocesos.flatMap((m) => m.procesos).find((p) => p.sigla === "GTH")!.docsVigentes;
  };
  expect(await contar("lider.gth")).toBe((await contar("consulta")) + 1);

  const [consulta, lider] = [await sujeto("consulta"), await sujeto("lider.gth")];
  const procesoLider = (await obtenerDetalleProceso(GTH, lider))!;
  const procesoConsulta = (await obtenerDetalleProceso(GTH, consulta))!;
  const lista = async (s: SujetoVisibilidad) =>
    (await obtenerDocumentosDeProceso(procesoLider.id, true, s)).map((d) => d.codigo);
  expect(await lista(lider)).toContain(RESTRINGIDO);
  expect(await lista(consulta)).not.toContain(RESTRINGIDO);

  const ingreso = procesoLider.subprocesos.find((s) => s.slug === "ingreso")!;
  const delSub = async (s: SujetoVisibilidad) =>
    (await obtenerDocumentosDeSubproceso(ingreso.id, s)).map((d) => d.codigo);
  expect(await delSub(lider)).toContain(RESTRINGIDO);
  expect(await delSub(consulta)).not.toContain(RESTRINGIDO);
  expect(ingreso.docsVigentes).toBe(
    procesoConsulta.subprocesos.find((s) => s.slug === "ingreso")!.docsVigentes + 1,
  );
});

it("las facetas de la búsqueda tampoco cuentan lo que el usuario no ve", async () => {
  const facetas = async (usuario: string) => (await buscarDocumentos({ q: "GTH" }, await sujeto(usuario))).facetas;
  const [consulta, lider] = [await facetas("consulta"), await facetas("lider.gth")];
  const cantidad = (lista: { clave: string; cantidad: number }[], clave: string) =>
    lista.find((f) => f.clave === clave)?.cantidad ?? 0;
  expect(cantidad(lider.tipos, "FO")).toBe(cantidad(consulta.tipos, "FO") + 1);
  expect(cantidad(lider.procesos, GTH)).toBe(cantidad(consulta.procesos, GTH) + 1);
});

it("la ficha informa el nivel de acceso del documento", async () => {
  const lider = await sujeto("lider.gth");
  expect((await obtenerFichaDocumento(RESTRINGIDO, lider))!.nivelAcceso).toBe("restringido");
  expect((await obtenerFichaDocumento("GTH-PR-01", lider))!.nivelAcceso).toBe("general");
});

it("el panel no muestra borradores a quien no administra", async () => {
  const ci = await sujeto("control.interno");
  const doc = await obtenerDocumentoAdmin("SGC-FO-03", ci); // solo tiene una versión en borrador
  expect(doc === null || doc.versiones.every((v) => v.estado !== "borrador")).toBe(true);
  expect((await listarDocumentosAdmin(ci)).some((d) => d.codigo === "SGC-FO-03")).toBe(false);
  const maestro = await obtenerListadoMaestro({ incluir: "todos" });
  expect(maestro.some((f) => f.codigo === "SGC-FO-03")).toBe(false);
  expect(maestro.some((f) => f.codigo === "GIC-IN-02")).toBe(true); // el anulado sí es historial
});

describe("regla de acceso (filtroAcceso y puedeAccederDocumento)", () => {
  it("los roles que ven lo restringido son los tres del spec", () => {
    expect([...ROLES_VEN_RESTRINGIDO].sort()).toEqual(["admin_sgc", "control_interno", "gerencia"]);
  });

  it("la marca individual de historial no da acceso a lo restringido", async () => {
    const marca = { ...(await sujeto("consulta")), verHistorial: true };
    expect(await obtenerFichaDocumento(RESTRINGIDO, marca)).toBeNull();
    expect(await puedeAccederDocumento(await idDocumento(RESTRINGIDO), marca)).toBe(false);
    expect(await obtenerDocumentoAdmin(RESTRINGIDO, marca)).toBeNull();
    expect((await listarDocumentosAdmin(marca)).some((d) => d.codigo === RESTRINGIDO)).toBe(false);
    // La marca da historial: el anulado general sigue a la vista.
    expect((await listarDocumentosAdmin(marca)).some((d) => d.codigo === "GIC-IN-02")).toBe(true);
  });

  it("un documento inexistente no es accesible", async () => {
    expect(await puedeAccederDocumento(2_000_000_000, await sujeto("gerente"))).toBe(false);
  });

  it("la asociación a un subproceso cuenta por su proceso", async () => {
    const id = await idDocumento(RESTRINGIDO);
    expect(await puedeAccederDocumento(id, await sujeto("lider.gth"))).toBe(true);
    expect(await puedeAccederDocumento(id, await sujeto("lider.cex"))).toBe(false);
  });

  it("un proceso inactivo no da acceso", async () => {
    const [id, lider, gth] = [await idDocumento(RESTRINGIDO), await sujeto("lider.gth"), await idProceso("GTH")];
    const accede = await revertida(sql, async (tx) => {
      await tx`UPDATE procesos SET activo = false WHERE id = ${gth}`;
      return puedeAccederDocumento(id, lider, { sql: tx });
    });
    expect(accede).toBe(false);
  });

  it("los procesos asignados valen para cualquier rol", async () => {
    const [id, consulta, gth] = [await idDocumento(RESTRINGIDO), await sujeto("consulta"), await idProceso("GTH")];
    const accede = await revertida(sql, async (tx) => {
      await tx`INSERT INTO usuario_procesos (usuario_id, proceso_id) VALUES (${consulta.usuarioId}, ${gth})`;
      return puedeAccederDocumento(id, consulta, { sql: tx });
    });
    expect(accede).toBe(true);
  });

  it("cuenta también un proceso donde el documento solo aplica (asociación directa, no principal)", async () => {
    const [id, lider, cex] = [await idDocumento(RESTRINGIDO), await sujeto("lider.cex"), await idProceso("CEX")];
    const accede = await revertida(sql, async (tx) => {
      await tx`INSERT INTO documento_proceso (documento_id, proceso_id, es_principal) VALUES (${id}, ${cex}, false)`;
      return puedeAccederDocumento(id, lider, { sql: tx });
    });
    expect(accede).toBe(true);
  });

  it("el OR de la regla va entre paréntesis: no anula los demás filtros de la consulta", async () => {
    const r = await buscarDocumentos({ q: "GTH", tipo: "PR" }, await sujeto("consulta"));
    expect(r.resultados.length).toBeGreaterThan(0);
    expect(r.resultados.every((x) => x.tipo.sigla === "PR" && x.codigo.startsWith("GTH-"))).toBe(true);
    expect(r.resultados.some((x) => x.codigo === RESTRINGIDO)).toBe(false);
  });
});

describe("panel de documentos", () => {
  it("el número del borrador solo llega a quien administra", async () => {
    const fila = async (usuario: string) =>
      (await listarDocumentosAdmin(await sujeto(usuario))).find((d) => d.codigo === "SGC-FO-03");
    expect((await fila("admin"))?.versionBorrador).toBe(1);
    expect(await fila("control.interno")).toBeUndefined();
  });

  it("quien administra ve el borrador; control interno recibe no encontrado si no hay otra versión", async () => {
    expect((await obtenerDocumentoAdmin("SGC-FO-03", await sujeto("admin")))!.versiones.map((v) => v.estado)).toEqual(["borrador"]);
    expect(await obtenerDocumentoAdmin("SGC-FO-03", await sujeto("control.interno"))).toBeNull();
  });

  it("control interno conserva vigentes, obsoletas y anuladas", async () => {
    const ci = await sujeto("control.interno");
    expect(new Set((await obtenerDocumentoAdmin("GTH-CA-01", ci))!.versiones.map((v) => v.estado))).toEqual(new Set(["obsoleto", "vigente"]));
    expect((await obtenerDocumentoAdmin("GIC-IN-02", ci))!.versiones.map((v) => v.estado)).toEqual(["anulado"]);
    expect((await listarDocumentosAdmin(ci)).some((d) => d.codigo === RESTRINGIDO)).toBe(true);
  });
});
