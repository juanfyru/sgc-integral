# Fase 8 — Listado Maestro + estadísticas + bitácora — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar el bloque de reportes del panel admin: Listado Maestro de Documentos (exportable a Excel y PDF), dashboard de estadísticas y vista filtrable de la bitácora.

**Architecture:** Tres vistas nuevas en `src/app/admin/(panel)/`, cada una con su capa de datos aislada en `src/db/consultas/`. Server Components con filtros server-driven por `searchParams` (patrón de `/buscar`, Fase 5). Islas cliente mínimas. Lógica pura extraída a `src/lib/` (constructor de Excel, descripción legible de auditoría) y a helpers de geometría del gráfico, todo unit-testeable sin BD.

**Tech Stack:** Next.js 16 (App Router), TypeScript estricto, Drizzle/`postgres.js` (SQL crudo con `obtenerSql()`), Tailwind 4, `exceljs` (nueva dependencia runtime, JS puro), Vitest.

## Global Constraints

- **ARM64 obligatorio.** `exceljs` es JS puro (sin binarios nativos); tras añadirla, el build de imagen `linux/arm64` debe seguir verde. Ninguna otra dependencia nueva.
- **Cero dependencias externas en runtime.** Nada de CDNs/fuentes/íconos remotos. El gráfico es SVG generado en el servidor, sin librería de charts. Export PDF por `window.print()`, nunca Puppeteer.
- **Público sin acceso.** Todas las rutas de esta fase viven bajo `/admin`; el guard de dos capas (`proxy.ts` optimista + `validarSesion`/`requerirSesion` real) las cubre. El route handler de Excel llama `requerirSesion` como primera línea.
- **Solo lectura salvo el registro de export.** Las tres vistas son de lectura. La única escritura es un `INSERT` en `auditoria` al emitir el Excel (`accion: "exporto_maestro"`).
- **Trazabilidad (regla ISO 5).** El export de Excel queda en la bitácora con quién/qué/cuándo.
- **Sin HTML crudo del contenido.** El `detalle` de auditoría y los términos de búsqueda se renderizan como texto (React los escapa), nunca `dangerouslySetInnerHTML`.
- **TypeScript estricto**, sin `any` salvo justificación. Dominio y UI en español.
- **Convención de commits:** en español, terminando con `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## File Structure

**Nuevos:**
- `src/db/consultas/maestro.ts` — consulta del Listado Maestro.
- `src/lib/maestro-excel.ts` — constructor puro del workbook.
- `src/app/admin/(panel)/maestro/page.tsx` — página del listado.
- `src/app/admin/(panel)/maestro/excel/route.ts` — route handler del export Excel (guard propio).
- `src/componentes/admin/maestro/BotonImprimir.tsx` — isla cliente `window.print()`.
- `src/db/consultas/estadisticas.ts` — consulta del dashboard.
- `src/componentes/admin/estadisticas/geometria.ts` — helper puro de geometría de barras.
- `src/componentes/admin/estadisticas/GraficoBarras.tsx` — SVG (Server Component).
- `src/app/admin/(panel)/estadisticas/page.tsx` — página del dashboard.
- `src/lib/bitacora-detalle.ts` — descripción legible pura de un evento de auditoría.
- `src/db/consultas/bitacora.ts` — consulta de la bitácora.
- `src/app/admin/(panel)/bitacora/page.tsx` — página de la bitácora.
- Tests: `tests/maestro.test.ts`, `tests/maestro-excel.test.ts`, `tests/estadisticas.test.ts`, `tests/bitacora-detalle.test.ts`, `tests/bitacora.test.ts`.

**Modificados:**
- `src/app/admin/(panel)/layout.tsx` — tres entradas de nav (una por página, en su tarea).
- `tests/guardia.test.ts` — el route handler de Excel rechaza sin sesión.
- `package.json` / `package-lock.json` — dependencia `exceljs`.

**Referencia de tipos compartidos** (definidos en su tarea, consumidos por otras):

```ts
// maestro.ts
export type FilaMaestro = {
  codigo: string; titulo: string; tipo: string;
  version: number | null; estado: string;
  fechaElaboracion: string | null; fechaRevision: string | null; fechaAprobacion: string | null;
  elaboro: string | null; reviso: string | null; aprobo: string | null;
  propietario: string;
};
export async function obtenerListadoMaestro(
  opciones: { incluir: "vigentes" | "todos" },
): Promise<FilaMaestro[]>;

// maestro-excel.ts
export type MetaMaestro = { hospital: string; generadoEn: string; alcance: string; total: number };
export async function construirExcelMaestro(filas: FilaMaestro[], meta: MetaMaestro): Promise<Buffer>;

// estadisticas.ts
export type Rango = "7" | "30" | "90" | "todo";
export type DocConteo = { codigo: string; titulo: string; conteo: number };
export type TerminoConteo = { termino: string; veces: number };
export type PuntoSerie = { fecha: string; conteo: number };
export type Estadisticas = {
  totalVistas: number; totalDescargas: number;
  masVistos: DocConteo[]; masDescargados: DocConteo[];
  sinResultados: TerminoConteo[]; serie: PuntoSerie[];
};
export async function obtenerEstadisticas(opciones: { rango: Rango; ahora?: Date }): Promise<Estadisticas>;

// geometria.ts
export type Barra = { x: number; y: number; ancho: number; alto: number; fecha: string; conteo: number };
export function calcularBarras(
  serie: PuntoSerie[], opciones: { ancho: number; alto: number; separacion: number },
): Barra[];

// bitacora-detalle.ts
export type EventoAuditoria = {
  accion: string; entidad: string; entidadId: number | null;
  detalle: Record<string, unknown>; codigoDocumento?: string | null;
};
export function describirEvento(e: EventoAuditoria): string;

// bitacora.ts
export type FiltrosBitacora = {
  accion?: string; entidad?: string; desde?: string; hasta?: string; texto?: string; pagina?: number;
};
export type FilaBitacora = {
  id: number; usuario: string; accion: string; entidad: string; entidadId: number | null;
  detalle: Record<string, unknown>; codigoDocumento: string | null; creadoEn: string;
};
export type RespuestaBitacora = {
  filas: FilaBitacora[]; total: number; pagina: number; totalPaginas: number;
  acciones: string[]; entidades: string[];
};
export async function obtenerBitacora(filtros: FiltrosBitacora): Promise<RespuestaBitacora>;
```

---

## Task 1: Consulta del Listado Maestro

**Files:**
- Create: `src/db/consultas/maestro.ts`
- Test: `tests/maestro.test.ts`

**Interfaces:**
- Consumes: `obtenerSql` de `@/db/cliente`.
- Produces: `FilaMaestro`, `obtenerListadoMaestro({ incluir })` (ver referencia de tipos).

**Contexto del esquema:** `documentos(codigo, titulo, tipo_id)`, `tipos_documento(nombre)`, `documento_versiones(documento_id, numero, estado, fecha_*, elaboro, reviso, aprobo)`, `documento_proceso(documento_id, proceso_id, subproceso_id, es_principal)` con índice único parcial `WHERE es_principal` (exactamente una principal por documento). El propietario cuelga de `proceso_id` directo o de `subproceso_id` (→ su `proceso` padre). `incluir: "vigentes"` filtra a documentos con una versión `estado='vigente'`; `"todos"` incluye documentos sin vigente, describiendo su versión de mayor `numero`.

- [ ] **Step 1: Write the failing test**

En `tests/maestro.test.ts` (mismo arranque que `tests/publicar.test.ts`: carga `.env.local`, usa `obtenerSql`, marcador `ZZ-MST-` y `limpiar()` en before/after). El fixture crea: un documento con versión vigente y asociación principal a un **proceso**; otro con principal a un **subproceso**; y uno con solo borrador (sin vigente).

```ts
import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
if (!process.env.DATABASE_URL && existsSync(".env.local")) process.loadEnvFile(".env.local");
import { obtenerSql } from "@/db/cliente";
import { obtenerListadoMaestro } from "@/db/consultas/maestro";

const sql = () => obtenerSql();
let tipoId: number, procesoId: number, subprocesoId: number, procesoDelSub: string;

async function limpiar() {
  await sql()`DELETE FROM documento_proceso WHERE documento_id IN
    (SELECT id FROM documentos WHERE codigo LIKE 'ZZ-MST-%')`;
  await sql()`DELETE FROM documento_versiones WHERE documento_id IN
    (SELECT id FROM documentos WHERE codigo LIKE 'ZZ-MST-%')`;
  await sql()`DELETE FROM documentos WHERE codigo LIKE 'ZZ-MST-%'`;
}

async function crearDoc(codigo: string, estado: string, asoc: "proceso" | "subproceso") {
  const [d] = await sql()`INSERT INTO documentos (codigo, titulo, tipo_id)
    VALUES (${codigo}, ${"Título " + codigo}, ${tipoId}) RETURNING id`;
  const aprob = estado === "vigente" ? sql()`, 'Dir. Calidad', '2026-01-10'` : sql()``;
  await sql()`INSERT INTO documento_versiones
      (documento_id, numero, estado, fecha_elaboracion, aprobo, fecha_aprobacion)
    VALUES (${d.id}, 1, ${estado}, '2026-01-01'
      ${estado === "vigente" ? sql()`, 'Dir. Calidad', '2026-01-10'` : sql()`, NULL, NULL`})`;
  if (asoc === "proceso")
    await sql()`INSERT INTO documento_proceso (documento_id, proceso_id, es_principal)
      VALUES (${d.id}, ${procesoId}, true)`;
  else
    await sql()`INSERT INTO documento_proceso (documento_id, subproceso_id, es_principal)
      VALUES (${d.id}, ${subprocesoId}, true)`;
  return d.id as number;
}

beforeAll(async () => {
  await limpiar();
  [{ id: tipoId }] = await sql()`SELECT id FROM tipos_documento WHERE activo LIMIT 1`;
  [{ id: procesoId }] = await sql()`SELECT id FROM procesos WHERE activo LIMIT 1`;
  const [s] = await sql()`SELECT s.id, p.nombre AS proceso FROM subprocesos s
    JOIN procesos p ON p.id = s.proceso_id WHERE s.activo LIMIT 1`;
  subprocesoId = s.id; procesoDelSub = s.proceso;
  await crearDoc("ZZ-MST-001", "vigente", "proceso");
  await crearDoc("ZZ-MST-002", "vigente", "subproceso");
  await crearDoc("ZZ-MST-003", "borrador", "proceso");
});
afterAll(async () => { await limpiar(); await sql().end(); });

describe("obtenerListadoMaestro", () => {
  it("solo vigentes por defecto, una fila por documento", async () => {
    const filas = await obtenerListadoMaestro({ incluir: "vigentes" });
    const mios = filas.filter((f) => f.codigo.startsWith("ZZ-MST-"));
    expect(mios.map((f) => f.codigo).sort()).toEqual(["ZZ-MST-001", "ZZ-MST-002"]);
    expect(mios.filter((f) => f.codigo === "ZZ-MST-001")).toHaveLength(1);
  });

  it("resuelve el propietario desde subproceso", async () => {
    const filas = await obtenerListadoMaestro({ incluir: "vigentes" });
    const sub = filas.find((f) => f.codigo === "ZZ-MST-002")!;
    expect(sub.propietario).toContain(procesoDelSub);
    expect(sub.version).toBe(1);
    expect(sub.aprobo).toBe("Dir. Calidad");
  });

  it("incluir:'todos' agrega los que no tienen vigente", async () => {
    const filas = await obtenerListadoMaestro({ incluir: "todos" });
    const codigos = filas.map((f) => f.codigo);
    expect(codigos).toContain("ZZ-MST-003");
    const borr = filas.find((f) => f.codigo === "ZZ-MST-003")!;
    expect(borr.estado).toBe("borrador");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- maestro.test`
Expected: FAIL — `obtenerListadoMaestro` no existe / módulo no encontrado.

- [ ] **Step 3: Write minimal implementation**

`src/db/consultas/maestro.ts`:

```ts
import { obtenerSql } from "@/db/cliente";

export type FilaMaestro = {
  codigo: string; titulo: string; tipo: string;
  version: number | null; estado: string;
  fechaElaboracion: string | null; fechaRevision: string | null; fechaAprobacion: string | null;
  elaboro: string | null; reviso: string | null; aprobo: string | null;
  propietario: string;
};

/**
 * Listado Maestro (ISO 7.5): una fila por documento, contada UNA sola vez por
 * su asociación principal (D6). Por defecto solo documentos con versión
 * vigente; `incluir:'todos'` agrega los que no la tienen (borrador/anulado),
 * describiendo su versión de mayor número.
 */
export async function obtenerListadoMaestro(
  opciones: { incluir: "vigentes" | "todos" },
): Promise<FilaMaestro[]> {
  const sql = obtenerSql();
  const soloVigentes = opciones.incluir === "vigentes";

  // La versión "representativa": la vigente si existe; si no y se piden todos,
  // la de mayor número.
  const filas = await sql`
    SELECT d.codigo, d.titulo, t.nombre AS tipo,
           v.numero AS version, v.estado,
           v.fecha_elaboracion::text AS fecha_elaboracion,
           v.fecha_revision::text AS fecha_revision,
           v.fecha_aprobacion::text AS fecha_aprobacion,
           v.elaboro, v.reviso, v.aprobo,
           COALESCE(
             pd.nombre,
             ps.nombre || ' › ' || sp.nombre
           ) AS propietario
    FROM documentos d
    JOIN tipos_documento t ON t.id = d.tipo_id
    JOIN LATERAL (
      SELECT * FROM documento_versiones vv
      WHERE vv.documento_id = d.id
        ${soloVigentes ? sql`AND vv.estado = 'vigente'` : sql``}
      ORDER BY (vv.estado = 'vigente') DESC, vv.numero DESC
      LIMIT 1
    ) v ON true
    JOIN documento_proceso dp ON dp.documento_id = d.id AND dp.es_principal
    LEFT JOIN procesos pd ON pd.id = dp.proceso_id
    LEFT JOIN subprocesos sp ON sp.id = dp.subproceso_id
    LEFT JOIN procesos ps ON ps.id = sp.proceso_id
    ORDER BY d.codigo`;

  return filas.map((f) => ({
    codigo: f.codigo as string,
    titulo: f.titulo as string,
    tipo: f.tipo as string,
    version: (f.version as number | null) ?? null,
    estado: f.estado as string,
    fechaElaboracion: (f.fecha_elaboracion as string | null) ?? null,
    fechaRevision: (f.fecha_revision as string | null) ?? null,
    fechaAprobacion: (f.fecha_aprobacion as string | null) ?? null,
    elaboro: (f.elaboro as string | null) ?? null,
    reviso: (f.reviso as string | null) ?? null,
    aprobo: (f.aprobo as string | null) ?? null,
    propietario: f.propietario as string,
  }));
}
```

Nota: cuando `soloVigentes`, el `JOIN LATERAL` sin filas descarta el documento (INNER). Con `incluir:'todos'` siempre hay una versión representativa (todo documento tiene ≥1 versión).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- maestro.test`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/db/consultas/maestro.ts tests/maestro.test.ts
git commit -m "feat: consulta del Listado Maestro (una fila por documento, D6)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: Constructor de Excel del Listado Maestro

**Files:**
- Modify: `package.json` (dependencia `exceljs`)
- Create: `src/lib/maestro-excel.ts`
- Test: `tests/maestro-excel.test.ts`

**Interfaces:**
- Consumes: `FilaMaestro` de `@/db/consultas/maestro`.
- Produces: `MetaMaestro`, `construirExcelMaestro(filas, meta)` (ver referencia).

- [ ] **Step 1: Instalar exceljs**

```bash
npm install exceljs
```

Expected: se añade a `dependencies`; `package-lock.json` actualizado.

- [ ] **Step 2: Write the failing test**

`tests/maestro-excel.test.ts` (test puro, sin BD):

```ts
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { construirExcelMaestro } from "@/lib/maestro-excel";
import type { FilaMaestro } from "@/db/consultas/maestro";

const FILA: FilaMaestro = {
  codigo: "PR-GTH-001", titulo: "Procedimiento de Ingreso", tipo: "Procedimiento",
  version: 3, estado: "vigente",
  fechaElaboracion: "2025-01-01", fechaRevision: "2025-02-01", fechaAprobacion: "2025-03-01",
  elaboro: "Ana", reviso: "Beto", aprobo: "Carla", propietario: "Gestión del Talento Humano",
};

async function abrir(buf: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb.worksheets[0];
}

describe("construirExcelMaestro", () => {
  it("incluye encabezado institucional y una fila por documento", async () => {
    const buf = await construirExcelMaestro([FILA], {
      hospital: "ESE Hospital Nuestra Señora de Fátima de Suaza",
      generadoEn: "2026-07-18 10:30", alcance: "Documentos vigentes", total: 1,
    });
    const hoja = await abrir(buf);
    const textoTodo = JSON.stringify(hoja.getSheetValues());
    expect(textoTodo).toContain("ESE Hospital Nuestra Señora de Fátima de Suaza");
    expect(textoTodo).toContain("Listado Maestro de Documentos");
    expect(textoTodo).toContain("2026-07-18 10:30");
    expect(textoTodo).toContain("PR-GTH-001");
    expect(textoTodo).toContain("Gestión del Talento Humano");
  });

  it("la fila de encabezados de columna trae todas las columnas", async () => {
    const buf = await construirExcelMaestro([FILA], {
      hospital: "H", generadoEn: "x", alcance: "Todos los documentos", total: 1,
    });
    const hoja = await abrir(buf);
    const encabezados = JSON.stringify(hoja.getSheetValues());
    for (const c of ["Código", "Título", "Tipo", "Versión", "Estado", "Elaboró", "Revisó", "Aprobó", "Proceso propietario"])
      expect(encabezados).toContain(c);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- maestro-excel.test`
Expected: FAIL — `construirExcelMaestro` no existe.

- [ ] **Step 4: Write minimal implementation**

`src/lib/maestro-excel.ts`:

```ts
import ExcelJS from "exceljs";
import type { FilaMaestro } from "@/db/consultas/maestro";

export type MetaMaestro = {
  hospital: string; generadoEn: string; alcance: string; total: number;
};

const COLUMNAS: Array<{ cab: string; ancho: number; valor: (f: FilaMaestro) => string | number | null }> = [
  { cab: "Código", ancho: 16, valor: (f) => f.codigo },
  { cab: "Título", ancho: 42, valor: (f) => f.titulo },
  { cab: "Tipo", ancho: 18, valor: (f) => f.tipo },
  { cab: "Versión", ancho: 9, valor: (f) => f.version },
  { cab: "Estado", ancho: 12, valor: (f) => f.estado },
  { cab: "Elaboración", ancho: 14, valor: (f) => f.fechaElaboracion },
  { cab: "Revisión", ancho: 14, valor: (f) => f.fechaRevision },
  { cab: "Aprobación", ancho: 14, valor: (f) => f.fechaAprobacion },
  { cab: "Elaboró", ancho: 20, valor: (f) => f.elaboro },
  { cab: "Revisó", ancho: 20, valor: (f) => f.reviso },
  { cab: "Aprobó", ancho: 20, valor: (f) => f.aprobo },
  { cab: "Proceso propietario", ancho: 32, valor: (f) => f.propietario },
];

/**
 * Construye el workbook del Listado Maestro. Función pura: recibe filas y
 * metadatos (incluida la fecha ya formateada) y devuelve el Buffer del xlsx.
 * Sin acceso a BD ni al reloj: determinista y testeable.
 */
export async function construirExcelMaestro(
  filas: FilaMaestro[], meta: MetaMaestro,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const hoja = wb.addWorksheet("Listado Maestro");
  const ultima = COLUMNAS.length;

  hoja.columns = COLUMNAS.map((c) => ({ width: c.ancho }));

  const tituloFila = hoja.addRow([meta.hospital]);
  tituloFila.font = { bold: true, size: 14 };
  hoja.mergeCells(1, 1, 1, ultima);
  const sub = hoja.addRow(["Listado Maestro de Documentos"]);
  sub.font = { bold: true, size: 12 };
  hoja.mergeCells(2, 1, 2, ultima);
  hoja.addRow([`Generado: ${meta.generadoEn}`]);
  hoja.mergeCells(3, 1, 3, ultima);
  hoja.addRow([`Alcance: ${meta.alcance} — Total: ${meta.total}`]);
  hoja.mergeCells(4, 1, 4, ultima);
  hoja.addRow([]);

  const cabecera = hoja.addRow(COLUMNAS.map((c) => c.cab));
  cabecera.font = { bold: true };
  cabecera.eachCell((celda) => {
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1B4E8E" } };
    celda.font = { bold: true, color: { argb: "FFFFFFFF" } };
  });
  hoja.autoFilter = { from: { row: cabecera.number, column: 1 }, to: { row: cabecera.number, column: ultima } };

  for (const f of filas) hoja.addRow(COLUMNAS.map((c) => c.valor(f)));

  const ab = await wb.xlsx.writeBuffer();
  return Buffer.from(ab as ArrayBuffer);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- maestro-excel.test`
Expected: PASS (2 tests).

- [ ] **Step 6: Verify ARM64 build still green (lint + build local)**

Run: `npm run lint && npm run build`
Expected: ambos limpios. (El build de imagen ARM64 se verifica en CI al pushear; `exceljs` es JS puro, sin binarios.)

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/lib/maestro-excel.ts tests/maestro-excel.test.ts
git commit -m "feat: constructor puro del Excel del Listado Maestro (exceljs)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: Route handler del export Excel

**Files:**
- Create: `src/app/admin/(panel)/maestro/excel/route.ts`
- Modify: `tests/guardia.test.ts` (el GET rechaza sin sesión)

**Interfaces:**
- Consumes: `requerirSesion` de `@/lib/sesion-actual`; `obtenerListadoMaestro`; `construirExcelMaestro`; `registrarAuditoria` de `@/db/consultas/admin`; `obtenerSql`.
- Produces: `GET(request: Request): Promise<Response>`.

**Contexto:** `requerirSesion()` valida contra BD y lanza (o devuelve) según su contrato; revisar cómo lo usan los handlers existentes en `src/app/admin/api/archivos/route.ts` para replicar el manejo de "sin sesión → 401". La fecha se formatea aquí (no en la función pura) para pasarla como `generadoEn`.

- [ ] **Step 1: Write the failing test (extensión de guardia)**

En `tests/guardia.test.ts`, agregar el import y un caso en el `describe("handlers de archivos sin sesión", ...)` o en un `describe` nuevo:

```ts
import { GET as excelMaestro } from "@/app/admin/(panel)/maestro/excel/route";
// ...
describe("export del maestro sin sesión", () => {
  it("GET /admin/maestro/excel sin cookie responde 401", async () => {
    const res = await excelMaestro(
      new Request("http://localhost:3000/admin/maestro/excel"),
    );
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- guardia.test`
Expected: FAIL — módulo `.../maestro/excel/route` no existe.

- [ ] **Step 3: Write minimal implementation**

Revisar primero `src/app/admin/api/archivos/route.ts` para copiar el patrón exacto de guard (cómo obtiene la cookie y devuelve 401). Luego `src/app/admin/(panel)/maestro/excel/route.ts`:

```ts
import { cookies } from "next/headers";
import { COOKIE_SESION, validarSesion } from "@/lib/sesion";
import { obtenerSql } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { obtenerListadoMaestro } from "@/db/consultas/maestro";
import { construirExcelMaestro } from "@/lib/maestro-excel";

function formatoFecha(d: Date): string {
  return d.toISOString().slice(0, 16).replace("T", " ");
}

export async function GET(request: Request): Promise<Response> {
  const almacen = await cookies();
  const sesion = await validarSesion(almacen.get(COOKIE_SESION)?.value);
  if (!sesion) return new Response("No autorizado", { status: 401 });

  const url = new URL(request.url);
  const incluir = url.searchParams.get("incluir") === "todos" ? "todos" : "vigentes";
  const filas = await obtenerListadoMaestro({ incluir });
  const ahora = new Date();
  const buffer = await construirExcelMaestro(filas, {
    hospital: "ESE Hospital Nuestra Señora de Fátima de Suaza",
    generadoEn: formatoFecha(ahora),
    alcance: incluir === "todos" ? "Todos los documentos" : "Documentos vigentes",
    total: filas.length,
  });

  await registrarAuditoria(obtenerSql(), {
    usuarioId: sesion.usuarioId, accion: "exporto_maestro", entidad: "listado_maestro",
    entidadId: null, detalle: { formato: "excel", incluir, total: filas.length },
  });

  const nombre = `listado-maestro-${ahora.toISOString().slice(0, 10).replace(/-/g, "")}.xlsx`;
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}
```

Ajustar el mecanismo de guard si `api/archivos/route.ts` usa un helper distinto (p. ej. `requerirSesion`); usar el mismo que ya existe en el repo en vez de duplicar lógica de cookie.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- guardia.test`
Expected: PASS (incluye el caso nuevo del 401).

- [ ] **Step 5: Commit**

```bash
git add "src/app/admin/(panel)/maestro/excel/route.ts" tests/guardia.test.ts
git commit -m "feat: export Excel del Listado Maestro con auditoria y guard

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 4: Página del Listado Maestro (UI + PDF por impresión + nav)

**Files:**
- Create: `src/app/admin/(panel)/maestro/page.tsx`
- Create: `src/componentes/admin/maestro/BotonImprimir.tsx`
- Modify: `src/app/admin/(panel)/layout.tsx` (link "Listado Maestro")

**Interfaces:**
- Consumes: `obtenerListadoMaestro`; `FilaMaestro`.
- Produces: página en `/admin/maestro`.

**Nota de verificación:** las páginas RSC de este proyecto se verifican en navegador (patrón de Fases 4–7), no con tests de componente. El deliverable de esta tarea es la vista funcionando + `lint`/`build` limpios.

- [ ] **Step 1: Isla cliente del botón imprimir**

`src/componentes/admin/maestro/BotonImprimir.tsx`:

```tsx
"use client";

export function BotonImprimir() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted print:hidden"
    >
      Imprimir / Guardar PDF
    </button>
  );
}
```

- [ ] **Step 2: Página del listado**

`src/app/admin/(panel)/maestro/page.tsx`. Lee `?incluir=`, renderiza encabezado institucional (visible en pantalla discreto y en impresión como cabecera), controles de filtro y export (ocultos en impresión con `print:hidden`), y la tabla. Fecha de generación formateada en el servidor.

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { obtenerListadoMaestro } from "@/db/consultas/maestro";
import { BotonImprimir } from "@/componentes/admin/maestro/BotonImprimir";

export const metadata: Metadata = { title: "Listado Maestro — Administración SGC" };

export default async function PaginaMaestro({
  searchParams,
}: {
  searchParams: Promise<{ incluir?: string }>;
}) {
  const { incluir: incluirParam } = await searchParams;
  const incluir = incluirParam === "todos" ? "todos" : "vigentes";
  const filas = await obtenerListadoMaestro({ incluir });
  const generadoEn = new Date().toISOString().slice(0, 16).replace("T", " ");

  return (
    <main>
      <header className="mb-4">
        <p className="text-sm text-muted-foreground">
          ESE Hospital Nuestra Señora de Fátima de Suaza
        </p>
        <h1 className="font-display text-2xl font-semibold">Listado Maestro de Documentos</h1>
        <p className="text-sm text-muted-foreground">
          Generado: {generadoEn} · Alcance:{" "}
          {incluir === "todos" ? "Todos los documentos" : "Documentos vigentes"} · Total: {filas.length}
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-3 print:hidden">
        <div className="flex gap-2 text-sm">
          <Link
            href="/admin/maestro"
            className={`rounded-md border px-3 py-1 ${incluir === "vigentes" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            Solo vigentes
          </Link>
          <Link
            href="/admin/maestro?incluir=todos"
            className={`rounded-md border px-3 py-1 ${incluir === "todos" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            Todos
          </Link>
        </div>
        <a
          href={`/admin/maestro/excel${incluir === "todos" ? "?incluir=todos" : ""}`}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Descargar Excel
        </a>
        <BotonImprimir />
      </div>

      <div className="overflow-x-auto rounded-lg border print:border-0">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left print:bg-transparent">
            <tr>
              {["Código", "Título", "Tipo", "Ver.", "Estado", "Aprobación", "Elaboró", "Revisó", "Aprobó", "Proceso propietario"].map((c) => (
                <th key={c} className="px-3 py-2">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.codigo} className="border-t">
                <td className="px-3 py-2 font-mono">{f.codigo}</td>
                <td className="px-3 py-2">{f.titulo}</td>
                <td className="px-3 py-2">{f.tipo}</td>
                <td className="px-3 py-2">{f.version ?? "—"}</td>
                <td className="px-3 py-2">{f.estado}</td>
                <td className="px-3 py-2">{f.fechaAprobacion ?? "—"}</td>
                <td className="px-3 py-2">{f.elaboro ?? "—"}</td>
                <td className="px-3 py-2">{f.reviso ?? "—"}</td>
                <td className="px-3 py-2">{f.aprobo ?? "—"}</td>
                <td className="px-3 py-2">{f.propietario}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filas.length === 0 && (
          <p className="px-3 py-8 text-center text-muted-foreground">No hay documentos para este alcance.</p>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Agregar el link al nav**

En `src/app/admin/(panel)/layout.tsx`, dentro del `<nav>`, tras "Tipos de documento":

```tsx
<Link href="/admin/maestro" className="hover:underline">Listado Maestro</Link>
```

- [ ] **Step 4: Verificación en navegador**

Con `npm run dev` y BD dev arriba, sesión iniciada:
- `/admin/maestro` muestra la tabla (solo vigentes) con el encabezado institucional.
- El link "Todos" agrega los no vigentes; el botón "Descargar Excel" baja el `.xlsx` (respeta el filtro) y abre limpio.
- "Imprimir / Guardar PDF" abre el diálogo de impresión con el nav y los controles ocultos y el encabezado visible.

Run: `npm run lint && npm run build`
Expected: limpios.

- [ ] **Step 5: Commit**

```bash
git add "src/app/admin/(panel)/maestro/page.tsx" "src/componentes/admin/maestro/BotonImprimir.tsx" "src/app/admin/(panel)/layout.tsx"
git commit -m "feat: pagina del Listado Maestro con export Excel y PDF por impresion

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 5: Consulta de estadísticas

**Files:**
- Create: `src/db/consultas/estadisticas.ts`
- Test: `tests/estadisticas.test.ts`

**Interfaces:**
- Consumes: `obtenerSql`.
- Produces: `Rango`, `DocConteo`, `TerminoConteo`, `PuntoSerie`, `Estadisticas`, `obtenerEstadisticas({ rango, ahora })`.

**Contexto:** `eventos_consulta(tipo IN ('vista','descarga'), documento_id, creado_en)`; `busquedas(termino, cantidad_resultados, creado_en)`. Reloj inyectable `ahora` (default `new Date()`) para tests deterministas — mismo espíritu que `crearLimitador` (Fase 5). `desde` se calcula en JS: `rango='todo'` → sin cota inferior; si no, `ahora − N días`. La serie agrupa por día (`date_trunc('day', creado_en)`), solo días con datos.

- [ ] **Step 1: Write the failing test**

`tests/estadisticas.test.ts` (BD; el fixture inserta eventos y búsquedas con `creado_en` controlado y limpia por marcador de documento `ZZ-EST-`):

```ts
import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
if (!process.env.DATABASE_URL && existsSync(".env.local")) process.loadEnvFile(".env.local");
import { obtenerSql } from "@/db/cliente";
import { obtenerEstadisticas } from "@/db/consultas/estadisticas";

const sql = () => obtenerSql();
let docA: number, docB: number;
const AHORA = new Date("2026-07-18T12:00:00Z");
const TERMINO = "zz-est-fantasma";

async function limpiar() {
  await sql()`DELETE FROM eventos_consulta WHERE documento_id IN
    (SELECT id FROM documentos WHERE codigo LIKE 'ZZ-EST-%')`;
  await sql()`DELETE FROM busquedas WHERE termino = ${TERMINO}`;
  await sql()`DELETE FROM documento_versiones WHERE documento_id IN
    (SELECT id FROM documentos WHERE codigo LIKE 'ZZ-EST-%')`;
  await sql()`DELETE FROM documentos WHERE codigo LIKE 'ZZ-EST-%'`;
}

beforeAll(async () => {
  await limpiar();
  let tipoId: number;
  [{ id: tipoId }] = await sql()`SELECT id FROM tipos_documento LIMIT 1`;
  [{ id: docA }] = await sql()`INSERT INTO documentos (codigo, titulo, tipo_id)
    VALUES ('ZZ-EST-001', 'Doc A', ${tipoId}) RETURNING id`;
  [{ id: docB }] = await sql()`INSERT INTO documentos (codigo, titulo, tipo_id)
    VALUES ('ZZ-EST-002', 'Doc B', ${tipoId}) RETURNING id`;
  // docA: 3 vistas recientes; docB: 1 vista reciente + 2 descargas recientes.
  const reciente = "2026-07-17T10:00:00Z";
  const viejo = "2026-05-01T10:00:00Z";
  for (let i = 0; i < 3; i++)
    await sql()`INSERT INTO eventos_consulta (tipo, documento_id, creado_en)
      VALUES ('vista', ${docA}, ${reciente})`;
  await sql()`INSERT INTO eventos_consulta (tipo, documento_id, creado_en)
    VALUES ('vista', ${docB}, ${reciente})`;
  for (let i = 0; i < 2; i++)
    await sql()`INSERT INTO eventos_consulta (tipo, documento_id, creado_en)
      VALUES ('descarga', ${docB}, ${reciente})`;
  // Una vista vieja de docA (fuera del rango 7 días).
  await sql()`INSERT INTO eventos_consulta (tipo, documento_id, creado_en)
    VALUES ('vista', ${docA}, ${viejo})`;
  // Búsqueda sin resultados, 2 veces.
  for (let i = 0; i < 2; i++)
    await sql()`INSERT INTO busquedas (termino, cantidad_resultados, creado_en)
      VALUES (${TERMINO}, 0, ${reciente})`;
});
afterAll(async () => { await limpiar(); await sql().end(); });

describe("obtenerEstadisticas", () => {
  it("cuenta vistas/descargas del rango y ordena Top-N", async () => {
    const e = await obtenerEstadisticas({ rango: "7", ahora: AHORA });
    const a = e.masVistos.find((d) => d.codigo === "ZZ-EST-001");
    expect(a?.conteo).toBe(3); // no incluye la vista vieja
    const b = e.masDescargados.find((d) => d.codigo === "ZZ-EST-002");
    expect(b?.conteo).toBe(2);
    expect(e.totalVistas).toBeGreaterThanOrEqual(4);
  });

  it("agrupa búsquedas sin resultados por término", async () => {
    const e = await obtenerEstadisticas({ rango: "30", ahora: AHORA });
    const t = e.sinResultados.find((x) => x.termino === TERMINO);
    expect(t?.veces).toBe(2);
  });

  it("rango 'todo' incluye eventos viejos", async () => {
    const e = await obtenerEstadisticas({ rango: "todo", ahora: AHORA });
    const a = e.masVistos.find((d) => d.codigo === "ZZ-EST-001");
    expect(a?.conteo).toBe(4); // 3 recientes + 1 vieja
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- estadisticas.test`
Expected: FAIL — `obtenerEstadisticas` no existe.

- [ ] **Step 3: Write minimal implementation**

`src/db/consultas/estadisticas.ts`:

```ts
import { obtenerSql } from "@/db/cliente";

export type Rango = "7" | "30" | "90" | "todo";
export type DocConteo = { codigo: string; titulo: string; conteo: number };
export type TerminoConteo = { termino: string; veces: number };
export type PuntoSerie = { fecha: string; conteo: number };
export type Estadisticas = {
  totalVistas: number; totalDescargas: number;
  masVistos: DocConteo[]; masDescargados: DocConteo[];
  sinResultados: TerminoConteo[]; serie: PuntoSerie[];
};

const DIAS: Record<Exclude<Rango, "todo">, number> = { "7": 7, "30": 30, "90": 90 };

export async function obtenerEstadisticas(
  opciones: { rango: Rango; ahora?: Date },
): Promise<Estadisticas> {
  const sql = obtenerSql();
  const ahora = opciones.ahora ?? new Date();
  const desde =
    opciones.rango === "todo"
      ? null
      : new Date(ahora.getTime() - DIAS[opciones.rango] * 86_400_000).toISOString();
  const cota = desde ? sql`AND ec.creado_en >= ${desde}` : sql``;

  const [totales, masVistos, masDescargados, sinResultados, serie] = await Promise.all([
    sql`SELECT
          count(*) FILTER (WHERE ec.tipo = 'vista')::int AS vistas,
          count(*) FILTER (WHERE ec.tipo = 'descarga')::int AS descargas
        FROM eventos_consulta ec WHERE true ${cota}`,
    sql`SELECT d.codigo, d.titulo, count(*)::int AS conteo
        FROM eventos_consulta ec JOIN documentos d ON d.id = ec.documento_id
        WHERE ec.tipo = 'vista' ${cota}
        GROUP BY d.codigo, d.titulo ORDER BY conteo DESC, d.codigo LIMIT 10`,
    sql`SELECT d.codigo, d.titulo, count(*)::int AS conteo
        FROM eventos_consulta ec JOIN documentos d ON d.id = ec.documento_id
        WHERE ec.tipo = 'descarga' ${cota}
        GROUP BY d.codigo, d.titulo ORDER BY conteo DESC, d.codigo LIMIT 10`,
    sql`SELECT lower(trim(b.termino)) AS termino, count(*)::int AS veces
        FROM busquedas b
        WHERE b.cantidad_resultados = 0
          ${desde ? sql`AND b.creado_en >= ${desde}` : sql``}
        GROUP BY lower(trim(b.termino)) ORDER BY veces DESC, termino LIMIT 10`,
    sql`SELECT to_char(date_trunc('day', ec.creado_en), 'YYYY-MM-DD') AS fecha,
               count(*)::int AS conteo
        FROM eventos_consulta ec WHERE true ${cota}
        GROUP BY 1 ORDER BY 1`,
  ]);

  return {
    totalVistas: (totales[0]?.vistas as number) ?? 0,
    totalDescargas: (totales[0]?.descargas as number) ?? 0,
    masVistos: masVistos.map(aDoc),
    masDescargados: masDescargados.map(aDoc),
    sinResultados: sinResultados.map((f) => ({
      termino: f.termino as string, veces: f.veces as number,
    })),
    serie: serie.map((f) => ({ fecha: f.fecha as string, conteo: f.conteo as number })),
  };
}

function aDoc(f: Record<string, unknown>): DocConteo {
  return { codigo: f.codigo as string, titulo: f.titulo as string, conteo: f.conteo as number };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- estadisticas.test`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/db/consultas/estadisticas.ts tests/estadisticas.test.ts
git commit -m "feat: consulta de estadisticas (top vistos/descargados, sin resultados, serie)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 6: Helper de geometría del gráfico + componente GráficoBarras

**Files:**
- Create: `src/componentes/admin/estadisticas/geometria.ts`
- Create: `src/componentes/admin/estadisticas/GraficoBarras.tsx`
- Test: incluir en `tests/estadisticas.test.ts` un `describe` extra (o `tests/geometria.test.ts`)

**Interfaces:**
- Consumes: `PuntoSerie` de `@/db/consultas/estadisticas`.
- Produces: `Barra`, `calcularBarras(serie, { ancho, alto, separacion })`; componente `GraficoBarras`.

- [ ] **Step 1: Write the failing test**

`tests/geometria.test.ts` (puro):

```ts
import { describe, expect, it } from "vitest";
import { calcularBarras } from "@/componentes/admin/estadisticas/geometria";

describe("calcularBarras", () => {
  it("la barra de mayor conteo ocupa todo el alto y ninguna se sale", () => {
    const serie = [
      { fecha: "2026-07-01", conteo: 2 },
      { fecha: "2026-07-02", conteo: 10 },
      { fecha: "2026-07-03", conteo: 0 },
    ];
    const barras = calcularBarras(serie, { ancho: 300, alto: 100, separacion: 4 });
    expect(barras).toHaveLength(3);
    const alta = barras[1];
    expect(alta.alto).toBeCloseTo(100);
    expect(alta.y).toBeCloseTo(0);
    for (const b of barras) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.ancho).toBeLessThanOrEqual(300 + 0.001);
      expect(b.y + b.alto).toBeLessThanOrEqual(100 + 0.001);
    }
  });

  it("serie vacía devuelve arreglo vacío", () => {
    expect(calcularBarras([], { ancho: 300, alto: 100, separacion: 4 })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- geometria.test`
Expected: FAIL — `calcularBarras` no existe.

- [ ] **Step 3: Write minimal implementation**

`src/componentes/admin/estadisticas/geometria.ts`:

```ts
import type { PuntoSerie } from "@/db/consultas/estadisticas";

export type Barra = {
  x: number; y: number; ancho: number; alto: number; fecha: string; conteo: number;
};

/** Geometría pura de las barras: mapea la serie a rectángulos SVG. */
export function calcularBarras(
  serie: PuntoSerie[],
  opciones: { ancho: number; alto: number; separacion: number },
): Barra[] {
  if (serie.length === 0) return [];
  const max = Math.max(...serie.map((p) => p.conteo), 1);
  const anchoBanda = opciones.ancho / serie.length;
  const anchoBarra = Math.max(anchoBanda - opciones.separacion, 1);
  return serie.map((p, i) => {
    const alto = (p.conteo / max) * opciones.alto;
    return {
      x: i * anchoBanda + opciones.separacion / 2,
      y: opciones.alto - alto,
      ancho: anchoBarra,
      alto,
      fecha: p.fecha,
      conteo: p.conteo,
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- geometria.test`
Expected: PASS (2 tests).

- [ ] **Step 5: Componente SVG accesible**

`src/componentes/admin/estadisticas/GraficoBarras.tsx` (Server Component, sin `'use client'`):

```tsx
import type { PuntoSerie } from "@/db/consultas/estadisticas";
import { calcularBarras } from "./geometria";

const ANCHO = 640;
const ALTO = 140;

export function GraficoBarras({ serie }: { serie: PuntoSerie[] }) {
  const barras = calcularBarras(serie, { ancho: ANCHO, alto: ALTO, separacion: 3 });
  const total = serie.reduce((s, p) => s + p.conteo, 0);

  if (serie.length === 0)
    return <p className="text-sm text-muted-foreground">Sin consultas en el periodo.</p>;

  return (
    <figure className="w-full">
      <svg
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        className="h-36 w-full"
        role="img"
        aria-label={`Consultas por día en el periodo: ${total} en total, ${serie.length} días con actividad.`}
        preserveAspectRatio="none"
      >
        {barras.map((b) => (
          <rect
            key={b.fecha}
            x={b.x} y={b.y} width={b.ancho} height={b.alto}
            className="fill-primary/70"
          >
            <title>{`${b.fecha}: ${b.conteo}`}</title>
          </rect>
        ))}
      </svg>
      <figcaption className="sr-only">
        <table>
          <caption>Consultas por día</caption>
          <thead><tr><th>Fecha</th><th>Consultas</th></tr></thead>
          <tbody>
            {serie.map((p) => (
              <tr key={p.fecha}><td>{p.fecha}</td><td>{p.conteo}</td></tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add src/componentes/admin/estadisticas/geometria.ts src/componentes/admin/estadisticas/GraficoBarras.tsx tests/geometria.test.ts
git commit -m "feat: grafico de barras SVG accesible con geometria pura testeada

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 7: Página de estadísticas (UI + nav)

**Files:**
- Create: `src/app/admin/(panel)/estadisticas/page.tsx`
- Modify: `src/app/admin/(panel)/layout.tsx` (link "Estadísticas")

**Interfaces:**
- Consumes: `obtenerEstadisticas`, `Rango`; `GraficoBarras`.
- Produces: página en `/admin/estadisticas`.

- [ ] **Step 1: Página**

`src/app/admin/(panel)/estadisticas/page.tsx`. Lee `?rango=` (default `30`); selector de rango por links; KPIs; gráfico; tres listas (más vistos/descargados enlazan a `/documentos/[codigo]`).

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { obtenerEstadisticas, type Rango } from "@/db/consultas/estadisticas";
import { GraficoBarras } from "@/componentes/admin/estadisticas/GraficoBarras";

export const metadata: Metadata = { title: "Estadísticas — Administración SGC" };

const RANGOS: Array<{ clave: Rango; etiqueta: string }> = [
  { clave: "7", etiqueta: "7 días" },
  { clave: "30", etiqueta: "30 días" },
  { clave: "90", etiqueta: "90 días" },
  { clave: "todo", etiqueta: "Todo" },
];

export default async function PaginaEstadisticas({
  searchParams,
}: {
  searchParams: Promise<{ rango?: string }>;
}) {
  const { rango: rangoParam } = await searchParams;
  const rango = (["7", "30", "90", "todo"].includes(rangoParam ?? "") ? rangoParam : "30") as Rango;
  const e = await obtenerEstadisticas({ rango });

  return (
    <main className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold">Estadísticas</h1>
        <div className="flex gap-2 text-sm">
          {RANGOS.map((r) => (
            <Link
              key={r.clave}
              href={`/admin/estadisticas?rango=${r.clave}`}
              className={`rounded-md border px-3 py-1 ${rango === r.clave ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              {r.etiqueta}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:max-w-md">
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Vistas</p>
          <p className="font-display text-3xl font-semibold">{e.totalVistas}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Descargas</p>
          <p className="font-display text-3xl font-semibold">{e.totalDescargas}</p>
        </div>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Consultas por día</h2>
        <GraficoBarras serie={e.serie} />
      </section>

      <div className="grid gap-8 lg:grid-cols-3">
        <ListaDocs titulo="Más vistos" docs={e.masVistos} />
        <ListaDocs titulo="Más descargados" docs={e.masDescargados} />
        <section>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Búsquedas sin resultados</h2>
          {e.sinResultados.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguna en el periodo.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {e.sinResultados.map((t) => (
                <li key={t.termino} className="flex justify-between gap-2">
                  <span className="truncate">{t.termino}</span>
                  <span className="text-muted-foreground">{t.veces}×</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

function ListaDocs({ titulo, docs }: { titulo: string; docs: { codigo: string; titulo: string; conteo: number }[] }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-medium text-muted-foreground">{titulo}</h2>
      {docs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin datos en el periodo.</p>
      ) : (
        <ol className="space-y-1 text-sm">
          {docs.map((d) => (
            <li key={d.codigo} className="flex justify-between gap-2">
              <Link href={`/documentos/${d.codigo}`} className="truncate hover:underline">
                <span className="font-mono">{d.codigo}</span> {d.titulo}
              </Link>
              <span className="text-muted-foreground">{d.conteo}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Link en el nav**

En `src/app/admin/(panel)/layout.tsx`, tras "Listado Maestro":

```tsx
<Link href="/admin/estadisticas" className="hover:underline">Estadísticas</Link>
```

- [ ] **Step 3: Verificación en navegador**

Con `npm run dev` + BD dev: `/admin/estadisticas` muestra KPIs, el gráfico y las tres listas; el selector de rango cambia los datos; los documentos enlazan a su ficha pública. (Para ver datos, navegar/descargar algo público antes, ya que el seed no siembra eventos.)

Run: `npm run lint && npm run build`
Expected: limpios.

- [ ] **Step 4: Commit**

```bash
git add "src/app/admin/(panel)/estadisticas/page.tsx" "src/app/admin/(panel)/layout.tsx"
git commit -m "feat: dashboard de estadisticas (KPIs, grafico y top-N por rango)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 8: Descripción legible de eventos de auditoría

**Files:**
- Create: `src/lib/bitacora-detalle.ts`
- Test: `tests/bitacora-detalle.test.ts`

**Interfaces:**
- Produces: `EventoAuditoria`, `describirEvento(e)` (ver referencia).

**Contexto — acciones reales y su `detalle`** (de `src/db/consultas/admin.ts` y `mapa-admin.ts`):
`ingreso`/`salida` (sesion, `{}`); `crear_documento` (`{codigo, titulo}`); `crear_version`/`publicar_version` (`{documentoId, numero}`); `editar_documento` (`{codigoAnterior, codigo, titulo}`); `editar_version` (datos de versión); `subir_archivo` (`{versionId, rol, nombre}`); `eliminar_archivo` (`{nombre}`); `anular_documento` (`{versionAnulada}`); `exporto_maestro` (`{formato, incluir, total}`); acciones de mapa dinámicas `reordenar_/activar_/desactivar_/borrar_<singular>` (`{direccion}` o `{nombre}` o `{}`); `crear_/editar_<entidad>` de mapa (datos de la entidad, con `nombre`/`texto`); `editar_configuracion` (`{claves}`). El código del documento, cuando aplica, llega ya resuelto por la consulta en `codigoDocumento`.

- [ ] **Step 1: Write the failing test**

`tests/bitacora-detalle.test.ts` (puro):

```ts
import { describe, expect, it } from "vitest";
import { describirEvento } from "@/lib/bitacora-detalle";

describe("describirEvento", () => {
  it("crear_documento usa código y título del detalle", () => {
    expect(describirEvento({
      accion: "crear_documento", entidad: "documento", entidadId: 5,
      detalle: { codigo: "PR-GTH-001", titulo: "Ingreso" },
    })).toBe("Creó el documento PR-GTH-001 — Ingreso");
  });

  it("publicar_version usa el código resuelto y el número", () => {
    expect(describirEvento({
      accion: "publicar_version", entidad: "documento_version", entidadId: 9,
      detalle: { documentoId: 5, numero: 2 }, codigoDocumento: "PR-GTH-001",
    })).toBe("Publicó la versión 2 de PR-GTH-001");
  });

  it("anular_documento describe la versión anulada", () => {
    expect(describirEvento({
      accion: "anular_documento", entidad: "documento", entidadId: 5,
      detalle: { versionAnulada: 3 }, codigoDocumento: "PR-GTH-001",
    })).toBe("Anuló PR-GTH-001 (versión vigente 3)");
  });

  it("desactivar de mapa usa el nombre", () => {
    expect(describirEvento({
      accion: "desactivar_proceso", entidad: "procesos", entidadId: 7,
      detalle: { nombre: "Vigilancia Epidemiológica" },
    })).toBe("Desactivó el proceso «Vigilancia Epidemiológica»");
  });

  it("exporto_maestro describe formato y alcance", () => {
    expect(describirEvento({
      accion: "exporto_maestro", entidad: "listado_maestro", entidadId: null,
      detalle: { formato: "excel", incluir: "vigentes", total: 42 },
    })).toBe("Emitió el Listado Maestro (excel, vigentes)");
  });

  it("acción desconocida no rompe: fallback genérico", () => {
    const frase = describirEvento({
      accion: "algo_raro", entidad: "cosa", entidadId: 1, detalle: { x: 1 },
    });
    expect(frase).toContain("algo_raro");
    expect(typeof frase).toBe("string");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- bitacora-detalle.test`
Expected: FAIL — `describirEvento` no existe.

- [ ] **Step 3: Write minimal implementation**

`src/lib/bitacora-detalle.ts`:

```ts
export type EventoAuditoria = {
  accion: string; entidad: string; entidadId: number | null;
  detalle: Record<string, unknown>; codigoDocumento?: string | null;
};

const SINGULAR: Record<string, string> = {
  macroprocesos: "macroproceso", procesos: "proceso", subprocesos: "subproceso",
  tipos_documento: "tipo de documento", elementos_perifericos: "elemento periférico",
};

function texto(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * Traduce un evento de auditoría a una frase en español legible. Función pura;
 * nunca vuelca JSON crudo ni interpreta el detalle como HTML. Fallback seguro
 * para acciones no mapeadas: el registro sigue siendo inteligible.
 */
export function describirEvento(e: EventoAuditoria): string {
  const d = e.detalle ?? {};
  const cod = e.codigoDocumento ?? texto(d.codigo);
  const nombre = texto(d.nombre) ?? texto(d.texto);

  switch (e.accion) {
    case "ingreso": return "Inició sesión";
    case "salida": return "Cerró sesión";
    case "crear_documento":
      return `Creó el documento ${cod ?? "?"} — ${texto(d.titulo) ?? ""}`.trimEnd();
    case "editar_documento":
      return `Editó el documento ${cod ?? "?"}`;
    case "crear_version":
      return `Creó la versión ${d.numero ?? "?"} de ${cod ?? "un documento"}`;
    case "publicar_version":
      return `Publicó la versión ${d.numero ?? "?"} de ${cod ?? "un documento"}`;
    case "editar_version":
      return `Editó una versión de ${cod ?? "un documento"}`;
    case "subir_archivo":
      return `Subió el archivo «${texto(d.nombre) ?? "?"}»`;
    case "eliminar_archivo":
      return `Eliminó el archivo «${texto(d.nombre) ?? "?"}»`;
    case "anular_documento":
      return `Anuló ${cod ?? "un documento"} (versión vigente ${d.versionAnulada ?? "?"})`;
    case "exporto_maestro":
      return `Emitió el Listado Maestro (${texto(d.formato) ?? "?"}, ${texto(d.incluir) ?? "?"})`;
    case "editar_configuracion":
      return "Editó los textos institucionales";
  }

  // Acciones de mapa dinámicas: <verbo>_<singular>.
  const verbos: Record<string, string> = {
    reordenar: "Reordenó", activar: "Activó", desactivar: "Desactivó",
    borrar: "Borró", crear: "Creó", editar: "Editó",
  };
  const m = /^(reordenar|activar|desactivar|borrar|crear|editar)_(.+)$/.exec(e.accion);
  if (m) {
    const tipo = SINGULAR[e.entidad] ?? m[2].replace(/_/g, " ");
    const suf = nombre ? ` «${nombre}»` : "";
    return `${verbos[m[1]]} el ${tipo}${suf}`;
  }

  return `Acción «${e.accion}» sobre ${e.entidad}${e.entidadId ? ` #${e.entidadId}` : ""}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- bitacora-detalle.test`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/bitacora-detalle.ts tests/bitacora-detalle.test.ts
git commit -m "feat: descripcion legible de eventos de auditoria (funcion pura)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 9: Consulta de la bitácora

**Files:**
- Create: `src/db/consultas/bitacora.ts`
- Test: `tests/bitacora.test.ts`

**Interfaces:**
- Consumes: `obtenerSql`.
- Produces: `FiltrosBitacora`, `FilaBitacora`, `RespuestaBitacora`, `obtenerBitacora(filtros)`.

**Contexto:** `auditoria(usuario_id, accion, entidad, entidad_id, detalle jsonb, creado_en)`; join a `usuarios(nombre)` (`usuario_id` puede ser null → "sistema"). El código del documento se resuelve por LATERAL: `entidad='documento'` → `documentos.id = entidad_id`; `entidad='documento_version'` → `documentos.id = (detalle->>'documentoId')::bigint`. Paginación de **50** por página con `count(*) OVER()`. Filtro `texto` matchea `entidad_id::text`, el código resuelto, o `detalle::text` (ILIKE). Las listas `acciones`/`entidades` son los valores distintos presentes (para poblar selectores).

- [ ] **Step 1: Write the failing test**

`tests/bitacora.test.ts` (BD; inserta filas de auditoría con marcador y limpia):

```ts
import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
if (!process.env.DATABASE_URL && existsSync(".env.local")) process.loadEnvFile(".env.local");
import { obtenerSql } from "@/db/cliente";
import { obtenerBitacora } from "@/db/consultas/bitacora";

const sql = () => obtenerSql();
const MARCA = "ZZ_BIT_ACCION";

async function limpiar() {
  await sql()`DELETE FROM auditoria WHERE accion = ${MARCA}`;
}

beforeAll(async () => {
  await limpiar();
  for (let i = 0; i < 3; i++)
    await sql()`INSERT INTO auditoria (usuario_id, accion, entidad, entidad_id, detalle)
      VALUES (NULL, ${MARCA}, 'prueba', ${i}, ${sql().json({ n: i })})`;
});
afterAll(async () => { await limpiar(); await sql().end(); });

describe("obtenerBitacora", () => {
  it("filtra por acción y ordena más reciente primero", async () => {
    const r = await obtenerBitacora({ accion: MARCA });
    expect(r.filas).toHaveLength(3);
    expect(r.filas[0].creadoEn >= r.filas[2].creadoEn).toBe(true);
    expect(r.filas[0].usuario).toBe("sistema");
    expect(r.acciones).toContain(MARCA);
  });

  it("pagina con tamaño fijo", async () => {
    const r = await obtenerBitacora({ accion: MARCA, pagina: 2 });
    expect(r.pagina).toBe(2);
    expect(r.total).toBe(3);
    expect(r.filas).toHaveLength(0); // 3 caben en la página 1 (tamaño 50)
  });

  it("busca por texto en el detalle", async () => {
    const r = await obtenerBitacora({ accion: MARCA, texto: "2" });
    expect(r.filas.some((f) => (f.detalle as { n: number }).n === 2)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- bitacora.test`
Expected: FAIL — `obtenerBitacora` no existe.

- [ ] **Step 3: Write minimal implementation**

`src/db/consultas/bitacora.ts`:

```ts
import { obtenerSql } from "@/db/cliente";

export type FiltrosBitacora = {
  accion?: string; entidad?: string; desde?: string; hasta?: string;
  texto?: string; pagina?: number;
};
export type FilaBitacora = {
  id: number; usuario: string; accion: string; entidad: string;
  entidadId: number | null; detalle: Record<string, unknown>;
  codigoDocumento: string | null; creadoEn: string;
};
export type RespuestaBitacora = {
  filas: FilaBitacora[]; total: number; pagina: number; totalPaginas: number;
  acciones: string[]; entidades: string[];
};

const TAMANO = 50;
const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export async function obtenerBitacora(
  filtros: FiltrosBitacora,
): Promise<RespuestaBitacora> {
  const sql = obtenerSql();
  const pagina = Math.max(filtros.pagina ?? 1, 1);
  const desde = filtros.desde && PATRON_FECHA.test(filtros.desde) ? filtros.desde : null;
  const hasta = filtros.hasta && PATRON_FECHA.test(filtros.hasta) ? filtros.hasta : null;
  const texto = filtros.texto?.trim() ? `%${filtros.texto.trim()}%` : null;

  const cond = sql`
    ${filtros.accion ? sql`AND a.accion = ${filtros.accion}` : sql``}
    ${filtros.entidad ? sql`AND a.entidad = ${filtros.entidad}` : sql``}
    ${desde ? sql`AND a.creado_en >= ${desde}` : sql``}
    ${hasta ? sql`AND a.creado_en < (${hasta}::date + 1)` : sql``}
    ${texto ? sql`AND (a.entidad_id::text ILIKE ${texto} OR cd.codigo ILIKE ${texto} OR a.detalle::text ILIKE ${texto})` : sql``}`;

  const codigoLateral = sql`
    LEFT JOIN LATERAL (
      SELECT d.codigo FROM documentos d
      WHERE d.id = CASE
        WHEN a.entidad = 'documento' THEN a.entidad_id
        WHEN a.entidad = 'documento_version' THEN (a.detalle->>'documentoId')::bigint
        ELSE NULL END
      LIMIT 1
    ) cd ON true`;

  const [filas, acciones, entidades] = await Promise.all([
    sql`
      SELECT a.id, COALESCE(u.nombre, 'sistema') AS usuario, a.accion, a.entidad,
             a.entidad_id, a.detalle, cd.codigo AS codigo_documento,
             to_char(a.creado_en, 'YYYY-MM-DD HH24:MI') AS creado_en,
             count(*) OVER ()::int AS total
      FROM auditoria a
      LEFT JOIN usuarios u ON u.id = a.usuario_id
      ${codigoLateral}
      WHERE true ${cond}
      ORDER BY a.creado_en DESC, a.id DESC
      LIMIT ${TAMANO} OFFSET ${(pagina - 1) * TAMANO}`,
    sql`SELECT DISTINCT accion FROM auditoria ORDER BY accion`,
    sql`SELECT DISTINCT entidad FROM auditoria ORDER BY entidad`,
  ]);

  const total = (filas[0]?.total as number | undefined) ?? 0;
  return {
    filas: filas.map((f) => ({
      id: f.id as number,
      usuario: f.usuario as string,
      accion: f.accion as string,
      entidad: f.entidad as string,
      entidadId: (f.entidad_id as number | null) ?? null,
      detalle: (f.detalle ?? {}) as Record<string, unknown>,
      codigoDocumento: (f.codigo_documento as string | null) ?? null,
      creadoEn: f.creado_en as string,
    })),
    total,
    pagina,
    totalPaginas: Math.max(Math.ceil(total / TAMANO), 1),
    acciones: acciones.map((a) => a.accion as string),
    entidades: entidades.map((e) => e.entidad as string),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- bitacora.test`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/db/consultas/bitacora.ts tests/bitacora.test.ts
git commit -m "feat: consulta de la bitacora con filtros, paginacion y codigo resuelto

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 10: Página de la bitácora (UI + nav)

**Files:**
- Create: `src/app/admin/(panel)/bitacora/page.tsx`
- Modify: `src/app/admin/(panel)/layout.tsx` (link "Bitácora")

**Interfaces:**
- Consumes: `obtenerBitacora`; `describirEvento`.
- Produces: página en `/admin/bitacora`.

- [ ] **Step 1: Página**

`src/app/admin/(panel)/bitacora/page.tsx`. Lee filtros de `searchParams`; form GET con selectores (poblados desde `acciones`/`entidades`), inputs de fecha y campo de texto; tabla con quién/qué/cuándo (la frase por `describirEvento`); paginación por links que preservan los filtros.

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { obtenerBitacora } from "@/db/consultas/bitacora";
import { describirEvento } from "@/lib/bitacora-detalle";

export const metadata: Metadata = { title: "Bitácora — Administración SGC" };

export default async function PaginaBitacora({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const pagina = Number(sp.pagina) > 0 ? Number(sp.pagina) : 1;
  const r = await obtenerBitacora({
    accion: sp.accion || undefined,
    entidad: sp.entidad || undefined,
    desde: sp.desde || undefined,
    hasta: sp.hasta || undefined,
    texto: sp.texto || undefined,
    pagina,
  });

  const conservar = (nueva: number) => {
    const q = new URLSearchParams();
    for (const k of ["accion", "entidad", "desde", "hasta", "texto"])
      if (sp[k]) q.set(k, sp[k]!);
    q.set("pagina", String(nueva));
    return `/admin/bitacora?${q.toString()}`;
  };

  return (
    <main>
      <h1 className="mb-4 font-display text-2xl font-semibold">Bitácora</h1>

      <form method="GET" className="mb-4 flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">Acción</span>
          <select name="accion" defaultValue={sp.accion ?? ""} className="rounded-md border px-2 py-1">
            <option value="">Todas</option>
            {r.acciones.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">Entidad</span>
          <select name="entidad" defaultValue={sp.entidad ?? ""} className="rounded-md border px-2 py-1">
            <option value="">Todas</option>
            {r.entidades.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">Desde</span>
          <input type="date" name="desde" defaultValue={sp.desde ?? ""} className="rounded-md border px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">Hasta</span>
          <input type="date" name="hasta" defaultValue={sp.hasta ?? ""} className="rounded-md border px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">Texto (código…)</span>
          <input type="text" name="texto" defaultValue={sp.texto ?? ""} className="rounded-md border px-2 py-1" />
        </label>
        <button type="submit" className="rounded-md bg-primary px-4 py-1.5 font-medium text-primary-foreground">
          Filtrar
        </button>
        <Link href="/admin/bitacora" className="px-2 py-1.5 text-muted-foreground hover:underline">Limpiar</Link>
      </form>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th className="px-3 py-2">Cuándo</th>
              <th className="px-3 py-2">Quién</th>
              <th className="px-3 py-2">Qué</th>
            </tr>
          </thead>
          <tbody>
            {r.filas.map((f) => (
              <tr key={f.id} className="border-t align-top">
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-muted-foreground">{f.creadoEn}</td>
                <td className="px-3 py-2">{f.usuario}</td>
                <td className="px-3 py-2">{describirEvento(f)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {r.filas.length === 0 && (
          <p className="px-3 py-8 text-center text-muted-foreground">Sin registros para estos filtros.</p>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{r.total} registros · página {r.pagina} de {r.totalPaginas}</span>
        <div className="flex gap-2">
          {r.pagina > 1 && <Link href={conservar(r.pagina - 1)} className="rounded-md border px-3 py-1 hover:bg-muted">Anterior</Link>}
          {r.pagina < r.totalPaginas && <Link href={conservar(r.pagina + 1)} className="rounded-md border px-3 py-1 hover:bg-muted">Siguiente</Link>}
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Link en el nav**

En `src/app/admin/(panel)/layout.tsx`, tras "Estadísticas":

```tsx
<Link href="/admin/bitacora" className="hover:underline">Bitácora</Link>
```

- [ ] **Step 3: Verificación en navegador**

Con `npm run dev` + BD dev: `/admin/bitacora` lista los eventos más recientes con frases legibles; filtrar por acción/entidad/fecha/texto acota; la paginación conserva los filtros. Hacer una acción admin previa (crear/publicar/desactivar) y verla aparecer. Buscar por un código y ver su rastro.

Run: `npm run lint && npm run build`
Expected: limpios.

- [ ] **Step 4: Commit**

```bash
git add "src/app/admin/(panel)/bitacora/page.tsx" "src/app/admin/(panel)/layout.tsx"
git commit -m "feat: vista de bitacora con filtros y detalle legible

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 11: Cierre de la fase — verificación integral, CONTEXT y push

**Files:**
- Modify: `CONTEXT.md`

- [ ] **Step 1: Suite completa**

Run: `npm test`
Expected: los tests nuevos en verde; los 5 rojos preexistentes del seed (`PR-GTH-991`) siguen igual (no regresión; **no borrar `PR-GTH-991`**).

- [ ] **Step 2: Lint + build**

Run: `npm run lint && npm run build`
Expected: limpios.

- [ ] **Step 3: Demo integral en navegador**

Con `npm run dev` + BD dev + sesión: recorrer Listado Maestro (filtro + Excel + PDF), Estadísticas (rango + gráfico + top-N enlazando a fichas) y Bitácora (filtros + frase legible + búsqueda por código). Confirmar que el export de Excel aparece en la bitácora como "Emitió el Listado Maestro".

- [ ] **Step 4: Actualizar CONTEXT.md**

Añadir el bloque "Hecho (Fase 8)" con lo construido, marcar la fase como completada pendiente de veredicto, refrescar el punto de reanudación (próxima: Fase 9 — pulido visual/accesibilidad), y registrar las decisiones B1–B5 en una tabla "Decisiones adicionales (Fase 8)". Anotar la dependencia nueva `exceljs`.

- [ ] **Step 5: Commit del cierre**

```bash
git add CONTEXT.md
git commit -m "docs: cierre de la Fase 8 (Listado Maestro + estadisticas + bitacora)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Push (dispara el CI ARM64)**

```bash
git push origin main
```

Verificar que el CI (build `linux/arm64` con `exceljs`) queda en verde con el token de `git credential fill` contra la API de GitHub (no hay `gh` CLI).

---

## Self-Review (completado por el autor del plan)

**Cobertura del spec:**
- Listado Maestro (vigentes + filtro, D6, columnas, encabezado institucional) → Tasks 1–4. ✅
- Export Excel con exceljs + auditoría → Tasks 2–3. ✅
- Export PDF por `window.print()` + estilos `print:` → Task 4. ✅
- Dashboard (KPIs, Top-10 vistos/descargados, sin resultados, mini-gráfico SVG, rango) → Tasks 5–7. ✅
- Bitácora (filtros acción/entidad/fecha/texto, paginación 50, detalle legible, código resuelto) → Tasks 8–10. ✅
- Pruebas TDD por unidad → cada task trae su test; guardia extendido en Task 3. ✅
- Nav del panel → Tasks 4/7/10. ✅

**Placeholders:** sin TBD/TODO; `describirEvento` (Task 8) quedó con el mapa `verbos` como fuente única, sin código muerto.

**Consistencia de tipos:** `FilaMaestro`, `MetaMaestro`, `Estadisticas`/`Rango`/`PuntoSerie`, `EventoAuditoria`/`describirEvento`, `FiltrosBitacora`/`RespuestaBitacora` se definen una vez (sección File Structure) y se consumen con las mismas firmas en páginas y route handler. `describirEvento` recibe `FilaBitacora` (que extiende la forma de `EventoAuditoria` con `codigoDocumento`) en Task 10 — compatible.
</content>
