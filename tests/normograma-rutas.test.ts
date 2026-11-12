/**
 * Las rutas de lectura del normograma (spec 13C §10.1, §10.6 y §6.4): el PDF de una norma, para toda sesión y sin
 * marca de agua; el Excel institucional y el del proceso, con su auditoría; y el grupo «Normas» de la búsqueda rápida.
 * Corren contra la BD dentro de una transacción que se revierte (el cliente de la app se sustituye por ella) y escriben
 * solo en un almacén temporal.
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { NextRequest } from "next/server";
import type { TransactionSql } from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const { enCurso, sesionDePeticion } = vi.hoisted(() => ({
  enCurso: { sql: null as unknown },
  sesionDePeticion: vi.fn(),
}));

vi.mock("@/db/cliente", async (original) => {
  const real = await original<typeof import("@/db/cliente")>();
  return { ...real, obtenerSql: () => (enCurso.sql ?? real.obtenerSql()) as ReturnType<typeof real.obtenerSql> };
});
vi.mock("@/lib/sesion-actual", () => ({ sesionDePeticion }));

import { GET as verPdf } from "@/app/(app)/normograma/[id]/archivos/[archivoId]/[[...nombre]]/route";
import { GET as excelNormograma } from "@/app/(app)/normograma/excel/route";
import { GET as buscarRapido } from "@/app/api/buscar/route";
import { POST as subirPdf } from "@/app/api/normas/[id]/archivos/route";
import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { asociarProceso, enlazarDocumento } from "@/db/consultas/normograma/asociaciones";
import { retirarNorma } from "@/db/consultas/normograma/normas";
import { registrarRelacion } from "@/db/consultas/normograma/relaciones";
import type { ResultadoRapido } from "@/lib/busqueda-rapida";
import { normaDePrueba, tipoNormaId } from "./utiles/normograma";
import { contenidoPorPagina, contieneTexto, pdfDePrueba } from "./utiles/pdf";
import { sesionAdmin, sesionDe, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";
import { externoDePrueba, vigenteFuera } from "./utiles/vigencia";

const sql = obtenerSql();

let almacen: string;
const previo = process.env.ALMACEN_RUTA;

beforeAll(() => {
  almacen = mkdtempSync(path.join(tmpdir(), "sgc-normograma-rutas-"));
  process.env.ALMACEN_RUTA = almacen;
});

afterAll(async () => {
  if (previo === undefined) delete process.env.ALMACEN_RUTA;
  else process.env.ALMACEN_RUTA = previo;
  rmSync(almacen, { recursive: true, force: true });
  await sql.end();
  globalThis.__sql = undefined;
});

beforeEach(() => {
  sesionDePeticion.mockReset();
});

const como = (sesion: SesionFlujo | null) => sesionDePeticion.mockResolvedValue(sesion);

/** La prueba con el cliente de la app apuntando a su transacción. */
async function enTx(prueba: (tx: TransactionSql) => Promise<void>) {
  await revertida(sql, async (tx) => {
    enCurso.sql = tx;
    try {
      await prueba(tx);
    } finally {
      enCurso.sql = null;
    }
  });
}

const subir = (normaId: number, bytes: Uint8Array) =>
  subirPdf(
    new NextRequest(`http://localhost:3002/api/normas/${normaId}/archivos`, {
      method: "POST",
      body: bytes as BodyInit,
      duplex: "half",
      headers: {
        origin: "http://localhost:3002",
        host: "localhost:3002",
        "x-nombre-archivo": encodeURIComponent("Resolución 3100.pdf"),
        "content-length": String(bytes.byteLength),
      },
    } as ConstructorParameters<typeof NextRequest>[1]),
    { params: Promise.resolve({ id: String(normaId) }) },
  );

const pedirPdf = (id: string | number, archivoId: string | number, consulta = "") =>
  verPdf(new NextRequest(`http://localhost:3002/normograma/${id}/archivos/${archivoId}/norma.pdf${consulta}`), {
    params: Promise.resolve({ id: String(id), archivoId: String(archivoId), nombre: ["norma.pdf"] }),
  });

describe("GET /normograma/[id]/archivos/[archivoId]", () => {
  it("toda sesión (también Consulta) abre el PDF de la norma en línea, sin caché y sin la marca «COPIA NO CONTROLADA»", () =>
    enTx(async (tx) => {
      const admin = await sesionAdmin(tx);
      const n = await normaDePrueba(tx, admin);
      const original = await pdfDePrueba([[612, 792]]);
      como(admin);
      const subida = await subir(n.id, original);
      expect(subida.status).toBe(201);
      const { id: archivoId } = (await subida.json()) as { id: number };

      como(await usuarioDePrueba(tx, { rol: "consulta" }));
      const r = await pedirPdf(n.id, archivoId);
      expect(r.status).toBe(200);
      expect(r.headers.get("Content-Type")).toBe("application/pdf");
      expect(r.headers.get("Cache-Control")).toBe("no-store");
      expect(r.headers.get("Content-Disposition")).toMatch(/^inline;/);
      const bytes = new Uint8Array(await r.arrayBuffer());
      // Se sirve tal como se subió: no es un documento del hospital, no se estampa.
      expect(Buffer.from(bytes).equals(Buffer.from(original))).toBe(true);
      for (const pagina of await contenidoPorPagina(bytes)) expect(contieneTexto(pagina, "COPIA NO CONTROLADA")).toBe(false);

      const descarga = await pedirPdf(n.id, archivoId, "?descarga=1");
      expect(descarga.headers.get("Content-Disposition")).toMatch(/^attachment;/);
    }));

  it("401 sin sesión; 404 con una norma o un archivo que no existe, con el archivo de otra norma o con un id inválido", () =>
    enTx(async (tx) => {
      const admin = await sesionAdmin(tx);
      const n = await normaDePrueba(tx, admin);
      const otra = await normaDePrueba(tx, admin);
      como(admin);
      const { id: archivoId } = (await (await subir(n.id, await pdfDePrueba([[612, 792]]))).json()) as { id: number };

      como(null);
      expect((await pedirPdf(n.id, archivoId)).status).toBe(401);
      como(await usuarioDePrueba(tx, { rol: "consulta" }));
      expect((await pedirPdf(987_654_321, archivoId)).status).toBe(404);
      expect((await pedirPdf(n.id, 987_654_321)).status).toBe(404);
      expect((await pedirPdf(otra.id, archivoId)).status).toBe(404);
      expect((await pedirPdf("abc", archivoId)).status).toBe(404);
      expect((await pedirPdf(n.id, "1e3")).status).toBe(404);
    }));

  it("el PDF de una norma retirada sigue abriéndose desde su ficha", () =>
    enTx(async (tx) => {
      const admin = await sesionAdmin(tx);
      const n = await normaDePrueba(tx, admin);
      como(admin);
      const { id: archivoId } = (await (await subir(n.id, await pdfDePrueba([[612, 792]]))).json()) as { id: number };
      await retirarNorma(admin, { normaId: n.id, motivo: "Registrada por error" }, { sql: tx });
      como(await usuarioDePrueba(tx, { rol: "consulta" }));
      expect((await pedirPdf(n.id, archivoId)).status).toBe(200);
    }));
});

const pedirExcel = (consulta = "") => excelNormograma(new NextRequest(`http://localhost:3002/normograma/excel${consulta}`));

async function filasDelExcel(res: Response): Promise<string[][]> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(await res.arrayBuffer());
  const filas: string[][] = [];
  libro.worksheets[0].eachRow((fila) => {
    const valores = fila.values as unknown[];
    filas.push(valores.slice(1).map((v) => (v === null || v === undefined ? "" : String(v))));
  });
  return filas;
}

/** La fila de la norma (por su número) y los encabezados de las columnas. */
async function delExcel(res: Response, numero: string) {
  const filas = await filasDelExcel(res);
  const cabecera = filas.find((f) => f[0] === "Tipo")!;
  const fila = filas.find((f) => f[1] === numero);
  const valor = (columna: string) => (fila ? fila[cabecera.indexOf(columna)] : undefined);
  return { filas, cabecera, fila, valor };
}

describe("GET /normograma/excel", () => {
  it("401 sin sesión", async () => {
    como(null);
    expect((await pedirExcel()).status).toBe(401);
  });

  it("Consulta descarga el institucional (200, xlsx sin caché) con las columnas del spec, sin el código de un restringido que no ve, y queda auditado", () =>
    enTx(async (tx) => {
      const admin = await sesionAdmin(tx);
      const consulta = await usuarioDePrueba(tx, { rol: "consulta" });
      const anterior = await normaDePrueba(tx, admin, { titulo: "Habilitación de prestadores (anterior)" });
      const n = await normaDePrueba(tx, admin, {
        titulo: "=HYPERLINK(\"http://malo\")",
        tema: "Habilitación de prestadores de servicios de salud",
        fechaExpedicion: "2019-11-25",
        enlaceOficial: "minsalud.gov.co/Normatividad",
      });
      await registrarRelacion(admin, { normaId: n.id, afectadaId: anterior.id, tipo: "deroga", detalle: null }, { sql: tx });
      const [cex] = await tx`SELECT id, nombre FROM procesos WHERE sigla = 'CEX'`;
      await asociarProceso(admin, { normaId: n.id, procesoId: Number(cex.id), requisito: "Estándar de procesos prioritarios, art. 5" }, { sql: tx });
      const publico = await vigenteFuera(tx, { fechaAprobacion: "2026-10-01", proceso: "GTH" });
      const restringido = await vigenteFuera(tx, { fechaAprobacion: "2026-10-01", proceso: "GTH" });
      await tx`UPDATE documentos SET nivel_acceso = 'restringido' WHERE id = ${restringido.id}`;
      const lider = await sesionDe(tx, "lider.cex");
      const externo = await externoDePrueba(tx, lider, { proceso: "CEX", edicion: "2017" });
      for (const documentoId of [publico.id, restringido.id, externo.documentoId]) {
        await enlazarDocumento(admin, { normaId: n.id, documentoId }, { sql: tx });
      }
      try {
        como(consulta);
        const numero = n.nombre.split(" ")[1];
        const r = await pedirExcel(`?q=${encodeURIComponent(numero)}`);
        expect(r.status).toBe(200);
        expect(r.headers.get("Content-Type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        expect(r.headers.get("Cache-Control")).toBe("no-store");
        expect(r.headers.get("Content-Disposition")).toMatch(/^attachment; filename="normograma-\d{8}\.xlsx"$/);
        const { filas, cabecera, fila, valor } = await delExcel(r, numero);
        expect(cabecera).toEqual([
          "Tipo",
          "Número",
          "Año",
          "Fecha de expedición",
          "Entidad emisora",
          "Título",
          "Tema",
          "Estado",
          "Fecha del estado",
          "Relaciones",
          "Procesos",
          "Documentos internos",
          "Documentos externos",
          "Enlace oficial",
        ]);
        expect(fila).toBeDefined();
        expect(valor("Tipo")).toBe("Resolución");
        expect(valor("Año")).toBe("2020");
        // El Excel conserva el formato de los demás Excel: la fecha `aaaa-mm-dd`.
        expect(valor("Fecha de expedición")).toBe("2019-11-25");
        expect(valor("Tema")).toBe("Habilitación de prestadores de servicios de salud");
        expect(valor("Estado")).toBe("Vigente");
        expect(valor("Relaciones")).toBe(`Deroga a ${anterior.nombre}`);
        expect(valor("Procesos")).toBe(cex.nombre);
        expect(valor("Documentos internos")).toBe(publico.codigo);
        expect(valor("Documentos externos")).toBe(externo.codigo);
        expect(valor("Enlace oficial")).toBe("minsalud.gov.co/Normatividad");
        // Celdas neutralizadas: una fórmula escrita como título queda como texto.
        expect(valor("Título")).toBe("'=HYPERLINK(\"http://malo\")");
        expect(filas.map((f) => f.join(" | ")).join("\n")).not.toContain(restringido.codigo);
        // El encabezado institucional dice el alcance.
        expect(filas.slice(0, 5).map((f) => f.join(" ")).join("\n")).toContain("Institucional");

        const auditoria = await tx`SELECT entidad, detalle FROM auditoria WHERE usuario_id = ${consulta.usuarioId} AND accion = 'exporto_normograma'`;
        expect(auditoria).toHaveLength(1);
        expect(auditoria[0].detalle).toMatchObject({ formato: "excel", alcance: "Institucional", texto: numero, total: 1 });

        // Gerencia ve los restringidos: su Excel sí trae el código.
        como(await sesionDe(tx, "gerente"));
        expect((await delExcel(await pedirExcel(`?q=${encodeURIComponent(numero)}`), numero)).valor("Documentos internos")).toBe(
          [publico.codigo, restringido.codigo].sort().join(", "),
        );
      } finally {
        await publico.limpiar();
        await restringido.limpiar();
        await externo.limpiar();
      }
    }));

  it("con ?proceso=<slug> es el normograma del proceso, con la columna «Requisito»; un proceso que no existe responde 404", () =>
    enTx(async (tx) => {
      const admin = await sesionAdmin(tx);
      const [cex] = await tx`SELECT id, nombre, slug FROM procesos WHERE sigla = 'CEX'`;
      const asociada = await normaDePrueba(tx, admin);
      const ajena = await normaDePrueba(tx, admin);
      await asociarProceso(admin, { normaId: asociada.id, procesoId: Number(cex.id), requisito: "Autoevaluación anual" }, { sql: tx });
      const consulta = await usuarioDePrueba(tx, { rol: "consulta" });
      como(consulta);

      const r = await pedirExcel(`?proceso=${cex.slug}`);
      expect(r.status).toBe(200);
      const { filas, cabecera, valor } = await delExcel(r, asociada.nombre.split(" ")[1]);
      expect(cabecera.indexOf("Requisito")).toBe(cabecera.indexOf("Procesos") + 1);
      expect(valor("Requisito")).toBe("Autoevaluación anual");
      expect(filas.some((f) => f[1] === ajena.nombre.split(" ")[1])).toBe(false);
      expect(filas.slice(0, 5).map((f) => f.join(" ")).join("\n")).toContain(`Proceso: ${cex.nombre}`);
      const [fila] = await tx`SELECT detalle FROM auditoria WHERE usuario_id = ${consulta.usuarioId} AND accion = 'exporto_normograma'`;
      expect(fila.detalle).toMatchObject({ alcance: `Proceso: ${cex.nombre}`, procesoId: Number(cex.id) });

      expect((await pedirExcel("?proceso=no-existe")).status).toBe(404);
    }));

  it("sin «incluir retiradas» no trae las retiradas; quien no administra no puede pedirlas", () =>
    enTx(async (tx) => {
      const admin = await sesionAdmin(tx);
      const n = await normaDePrueba(tx, admin);
      await retirarNorma(admin, { normaId: n.id, motivo: "Registrada por error" }, { sql: tx });
      const numero = n.nombre.split(" ")[1];
      como(await usuarioDePrueba(tx, { rol: "consulta" }));
      expect((await delExcel(await pedirExcel(`?q=${numero}&retiradas=1`), numero)).fila).toBeUndefined();
      como(admin);
      expect((await delExcel(await pedirExcel(`?q=${numero}`), numero)).fila).toBeUndefined();
      expect((await delExcel(await pedirExcel(`?q=${numero}&retiradas=1`), numero)).valor("Estado")).toBe("Retirada");
    }));
});

describe("GET /api/buscar: el grupo «Normas»", () => {
  const buscar = async (q: string) =>
    ((await (await buscarRapido(new NextRequest(`http://localhost:3002/api/buscar?q=${encodeURIComponent(q)}`))).json()) as {
      resultados: ResultadoRapido[];
    }).resultados;

  it("«3100» trae la norma con grupo «norma», su nombre y su estado, y la ruta de su ficha; los documentos van con grupo «documento»", () =>
    enTx(async (tx) => {
      const admin = await sesionAdmin(tx);
      // Un tipo, número y año que la demo no tiene: el test no depende de lo que haya en la base.
      const { id } = await normaDePrueba(tx, admin, { tipoNormaId: await tipoNormaId(tx, "Circular"), numero: "3100", anio: 2099 });
      como(await usuarioDePrueba(tx, { rol: "consulta" }));
      const resultados = await buscar("3100");
      const norma = resultados.find((r) => r.ruta === `/normograma/${id}`);
      expect(norma).toEqual({
        grupo: "norma",
        codigo: "Circular 3100 de 2099",
        titulo: expect.stringMatching(/^Norma de prueba \d+$/),
        tituloResaltado: null,
        tipo: "Vigente",
        ruta: `/normograma/${id}`,
      });
      expect(resultados.filter((r) => r.grupo === "norma").length).toBeLessThanOrEqual(4);
      expect(resultados.every((r) => ["norma", "documento", "indicador"].includes(r.grupo))).toBe(true);
      // Las normas van después de los documentos y los indicadores, después de las normas.
      const primeraNorma = resultados.findIndex((r) => r.grupo === "norma");
      expect(resultados.slice(primeraNorma).every((r) => r.grupo === "norma" || r.grupo === "indicador")).toBe(true);
      const primerIndicador = resultados.findIndex((r) => r.grupo === "indicador");
      if (primerIndicador >= 0) expect(resultados.slice(primerIndicador).every((r) => r.grupo === "indicador")).toBe(true);
    }));

  it("los documentos llevan grupo «documento»; una norma retirada no sale", () =>
    enTx(async (tx) => {
      const admin = await sesionAdmin(tx);
      const doc = await vigenteFuera(tx, { fechaAprobacion: "2026-10-01", proceso: "GTH" });
      const n = await normaDePrueba(tx, admin);
      await retirarNorma(admin, { normaId: n.id, motivo: "Registrada por error" }, { sql: tx });
      try {
        como(await usuarioDePrueba(tx, { rol: "consulta" }));
        expect((await buscar(doc.codigo)).find((r) => r.codigo === doc.codigo)).toMatchObject({
          grupo: "documento",
          ruta: `/documentos/${doc.codigo.toLowerCase()}`,
        });
        expect((await buscar(n.nombre.split(" ")[1])).some((r) => r.ruta === `/normograma/${n.id}`)).toBe(false);
      } finally {
        await doc.limpiar();
      }
    }));
});
