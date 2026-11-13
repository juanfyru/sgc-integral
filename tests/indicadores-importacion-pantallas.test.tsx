/**
 * Las pantallas de la importación de indicadores (Fase 14A, Tarea 10): la lista de lotes y «Nueva importación», y la
 * página de un lote con los datos de la aprobación previa, la regla, las correspondencias, la vista previa y el diálogo
 * de la clave. Sin base: las consultas y las acciones se sustituyen.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const c = vi.hoisted(() => ({
  vistaPrevia: vi.fn(),
  resumenDeLote: vi.fn(),
  lotesRecientes: vi.fn(),
}));

vi.mock("@/lib/paginas", () => ({
  exigirPermiso: vi.fn(async () => ({ usuarioId: 1, rol: "admin_sgc", permisos: [] })),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NO_ENCONTRADA");
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/indicadores/importar",
}));
vi.mock("@/app/admin/acciones-indicadores", () => ({
  crearLoteAccion: vi.fn(),
  vistaPreviaAccion: vi.fn(),
  importarLoteAccion: vi.fn(),
}));
vi.mock("@/db/consultas/indicadores/importacion", () => ({
  vistaPrevia: c.vistaPrevia,
  resumenDeLote: c.resumenDeLote,
  lotesRecientes: c.lotesRecientes,
}));

import PaginaImportar from "@/app/(app)/admin/(panel)/indicadores/importar/page";
import PaginaLote from "@/app/(app)/admin/(panel)/indicadores/importar/[id]/page";
import { TablaVistaPrevia } from "@/componentes/indicadores/importacion/TablaVistaPrevia";
import type { VistaPrevia } from "@/db/consultas/indicadores/importacion";
import { ErrorIndicador } from "@/lib/indicadores/tipos";

const ficha = (extra: Record<string, unknown> = {}) => ({
  codigo: "GC-ID-01",
  nombre: "Documentos vigentes",
  procesoId: 3,
  subprocesoId: 8,
  tipoId: 1,
  clasificacionId: 1,
  nivel: null,
  proposito: null,
  forma: "porcentaje",
  factor: null,
  formula: "(A / B) * 100",
  variables: [
    { letra: "A", nombre: "Vigentes", fuente: null, consolidacion: "suma" },
    { letra: "B", nombre: "Listado maestro", fuente: null, consolidacion: "ultimo" },
  ],
  unidadId: 1,
  meta: "95",
  metaMax: null,
  tendencia: "ascendente",
  periodicidad: "mensual",
  cargoId: null,
  riesgoAsociado: null,
  requisito: null,
  inicioMedicion: "2026-01",
  estado: "aprobado",
  rangos: {
    bien: [{ signo: ">=", valor: "95" }],
    atencion: [{ signo: "entre", valor: "85.5", hasta: "94.99" }],
    critico: [{ signo: "<", valor: "85.5" }],
  },
  siglaParaSubproceso: null,
  ...extra,
});

function vista(extra: Partial<VistaPrevia> = {}): VistaPrevia {
  return {
    filas: [
      { numero: 2, codigo: "GC-ID-01", ficha: ficha() as never, problemas: [], avisos: ["La meta parece una fracción"], pendientes: [] },
      { numero: 3, codigo: "GC-ID-02", ficha: null, problemas: ["La meta no es un número"], avisos: [], pendientes: [] },
    ],
    pendientes: [{ tipo: "subproceso", texto: "Laboratorio Clínico" }],
    opciones: {
      subprocesos: [{ id: 8, procesoId: 3, proceso: "Gestión de calidad", nombre: "Laboratorio" }],
      cargos: [{ id: 4, nombre: "Coordinador" }],
      tipos: [{ id: 1, nombre: "Eficacia" }],
      unidades: [{ id: 1, nombre: "Porcentaje", sufijo: " %", decimales: 1 }],
      procesos: [{ id: 3, sigla: "GC", nombre: "Gestión de calidad" }],
    },
    ...extra,
  } as VistaPrevia;
}

const resumen = (extra: Record<string, unknown> = {}) => ({
  id: 7,
  cargadoEn: new Date("2026-11-10T15:00:00Z"),
  cargadoPor: "Ana Pérez",
  estado: "por_importar",
  archivo: "indicadores.xlsx",
  aprobadas: 0,
  borradores: 0,
  omitidas: 0,
  importadoEn: null,
  ...extra,
});

async function lote(id = "7", searchParams: Record<string, string> = {}) {
  return renderToStaticMarkup(await PaginaLote({ params: Promise.resolve({ id }), searchParams: Promise.resolve(searchParams) }));
}

beforeEach(() => {
  c.vistaPrevia.mockReset();
  c.resumenDeLote.mockReset();
  c.lotesRecientes.mockReset();
  c.resumenDeLote.mockResolvedValue(resumen());
  c.vistaPrevia.mockResolvedValue(vista());
});

describe("la página de un lote por importar", () => {
  it("pide los datos de la aprobación previa, la regla con 90 y 110 y un select rotulado por correspondencia", async () => {
    const html = await lote();
    expect(html).toContain("Documento");
    expect(html).toContain("Quién aprobó");
    expect(html).toContain("Fecha");
    expect(html).toMatch(/Atención desde el[\s\S]*?value="90"[\s\S]*?% de la meta, en ascendente/);
    expect(html).toMatch(/Atención hasta el[\s\S]*?value="110"[\s\S]*?% de la meta, en descendente/);
    // Un select por texto pendiente, con su label.
    expect(html).toMatch(/<label[^>]*for="corr-subproceso-laboratorio-clinico"[^>]*>[^<]*Laboratorio Clínico/);
    expect(html).toMatch(/<select[^>]*id="corr-subproceso-laboratorio-clinico"/);
    expect(html).toContain("Gestión de calidad › Laboratorio");
  });

  it("la tabla muestra el código, la fórmula, la meta, los rangos en palabras, el acumulado, el problema y el aviso", async () => {
    const html = await lote();
    expect(html).toContain("GC-ID-01");
    expect(html).toContain("Documentos vigentes");
    expect(html).toContain("Gestión de calidad › Laboratorio");
    expect(html).toContain("(A / B) * 100");
    expect(html).toContain("Bien");
    expect(html).toContain("Atención");
    expect(html).toContain("suma de los periodos");
    expect(html).toContain("el del último periodo");
    expect(html).toContain("La meta no es un número");
    expect(html).toContain("La meta parece una fracción");
    expect(html).toContain("Aprobado");
  });

  it("la clave se pide en un diálogo y el botón dice cuántas fichas entran", async () => {
    c.vistaPrevia.mockResolvedValue(vista({ pendientes: [] }));
    const html = await lote();
    expect(html).toContain("Importar 1 ficha");
    expect(html).not.toContain("Importar 1 fichas");
  });

  it("con varias fichas, el botón va en plural", async () => {
    const dos = vista({
      pendientes: [],
      filas: [
        { numero: 2, codigo: "A-ID-01", ficha: ficha({ codigo: "A-ID-01" }) as never, problemas: [], avisos: [], pendientes: [] },
        { numero: 3, codigo: "A-ID-02", ficha: ficha({ codigo: "A-ID-02" }) as never, problemas: [], avisos: [], pendientes: [] },
      ],
    });
    c.vistaPrevia.mockResolvedValue(dos);
    expect(await lote()).toContain("Importar 2 fichas");
  });

  it("ofrece la sigla del código a un subproceso sin ella", async () => {
    c.vistaPrevia.mockResolvedValue(
      vista({ pendientes: [], filas: [{ numero: 2, codigo: "CNT-ID-01", ficha: ficha({ codigo: "CNT-ID-01", siglaParaSubproceso: "CNT" }) as never, problemas: [], avisos: [], pendientes: [] }] }),
    );
    const html = await lote();
    expect(html).toContain("CNT");
    expect(html).toContain('name="sigla:8"');
  });

  it("un lote que no existe o sin plantilla es «no encontrado»", async () => {
    c.resumenDeLote.mockResolvedValue(null);
    await expect(lote()).rejects.toThrow("NO_ENCONTRADA");
    await expect(lote("abc")).rejects.toThrow("NO_ENCONTRADA");
    c.resumenDeLote.mockResolvedValue(resumen());
    c.vistaPrevia.mockResolvedValue(null);
    await expect(lote()).rejects.toThrow("NO_ENCONTRADA");
  });

  it("un archivo que no es la plantilla se dice en una alerta y se ofrece «Nueva importación»", async () => {
    c.vistaPrevia.mockRejectedValue(new ErrorIndicador("El archivo no es la plantilla de la importación"));
    const html = await lote();
    expect(html).toMatch(/role="alert"[^>]*>[^<]*El archivo no es la plantilla de la importación/);
    expect(html).toContain("Nueva importación");
    expect(html).not.toContain("Importar 1 ficha");
  });

  it("un error inesperado no se traga: sigue de largo", async () => {
    c.vistaPrevia.mockRejectedValue(new Error("fallo de la base"));
    await expect(lote()).rejects.toThrow("fallo de la base");
  });

  it("deja un lugar para «Deshacer la importación» solo en un lote importado", async () => {
    expect(await lote()).not.toContain('id="deshacer-importacion"');
  });
});

describe("la página de un lote ya importado", () => {
  it("lee las cifras del evento y no de la dirección", async () => {
    c.resumenDeLote.mockResolvedValue(resumen({ estado: "importado", aprobadas: 2, borradores: 1, omitidas: 3, importadoEn: new Date("2026-11-11T15:00:00Z") }));
    const html = await lote("7", { aprobadas: "99", borradores: "98" });
    expect(html).toContain("Se importaron 2 fichas aprobadas y 1 en borrador");
    expect(html).not.toContain("99");
    expect(html).toContain("3 filas omitidas");
    expect(html).toContain('href="/indicadores"');
    expect(html).toContain('id="deshacer-importacion"');
    expect(c.vistaPrevia).not.toHaveBeenCalled();
  });

  it("un lote deshecho lo dice y no se vuelve a importar", async () => {
    c.resumenDeLote.mockResolvedValue(resumen({ estado: "deshecho", aprobadas: 2, borradores: 1, importadoEn: new Date("2026-11-11T15:00:00Z") }));
    const html = await lote();
    expect(html).toContain("deshizo");
    expect(html).not.toContain("Importar 1 ficha");
    expect(c.vistaPrevia).not.toHaveBeenCalled();
  });

  it("un lote sin plantilla (la subida falló) ofrece una importación nueva", async () => {
    c.resumenDeLote.mockResolvedValue(resumen({ estado: "sin_archivo", archivo: null }));
    const html = await lote();
    expect(html).toContain("no tiene plantilla");
    expect(html).toContain("Nueva importación");
    expect(c.vistaPrevia).not.toHaveBeenCalled();
  });
});

describe("la página de importación", () => {
  it("ofrece la plantilla, «Nueva importación» y la lista de lotes con su estado", async () => {
    c.lotesRecientes.mockResolvedValue([
      { id: 7, cargadoEn: new Date("2026-11-10T15:00:00Z"), cargadoPor: "Ana Pérez", estado: "importado", archivo: "indicadores.xlsx", aprobadas: 2, borradores: 1 },
      { id: 6, cargadoEn: new Date("2026-11-09T15:00:00Z"), cargadoPor: "Luis Gómez", estado: "por_importar", archivo: "otra.xlsx", aprobadas: 0, borradores: 0 },
    ]);
    const html = renderToStaticMarkup(await PaginaImportar());
    expect(html).toContain("Descargar la plantilla");
    expect(html).toContain('href="/admin/indicadores/importar/plantilla"');
    expect(html).toContain("Nueva importación");
    expect(html).toContain("indicadores.xlsx");
    expect(html).toContain("Importado");
    expect(html).toContain("Por importar");
    expect(html).toContain('href="/admin/indicadores/importar/7"');
  });

  it("sin lotes, un estado vacío", async () => {
    c.lotesRecientes.mockResolvedValue([]);
    expect(renderToStaticMarkup(await PaginaImportar())).toContain("Aún no hay importaciones");
  });
});

describe("TablaVistaPrevia", () => {
  it("una fila con problemas dice por qué y no cuenta como importable", () => {
    const html = renderToStaticMarkup(<TablaVistaPrevia vista={vista()} />);
    expect(html).toContain("Con problemas");
    expect(html).toContain("Lista");
  });

  it("el acumulado distingue las variables cuando se juntan distinto", () => {
    const html = renderToStaticMarkup(<TablaVistaPrevia vista={vista()} />);
    expect(html).toMatch(/A: suma de los periodos/);
    expect(html).toMatch(/B: el del último periodo/);
  });

  it("el promedio se dice «el promedio de los periodos»", () => {
    const v = vista();
    const f = ficha({ variables: [{ letra: "A", nombre: "x", fuente: null, consolidacion: "promedio" }], forma: "conteo" });
    v.filas = [{ numero: 2, codigo: "P-ID-01", ficha: f as never, problemas: [], avisos: [], pendientes: [] }];
    expect(renderToStaticMarkup(<TablaVistaPrevia vista={v} />)).toContain("el promedio de los periodos");
  });
});
