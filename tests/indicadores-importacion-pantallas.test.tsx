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
import { FormularioImportacion } from "@/componentes/indicadores/importacion/FormularioImportacion";
import { ResumenDeImportacion } from "@/componentes/indicadores/importacion/ResumenDeImportacion";
import { TablaVistaPrevia } from "@/componentes/indicadores/importacion/TablaVistaPrevia";
import { FormularioFirma } from "@/componentes/tramites/DialogoFirma";
import { EsquemaImportarLote, EsquemaVistaPreviaImportacion, juntarImportacion } from "@/lib/esquemas/indicadores";
import { camposDeLaImportacion, camposDeLaVista, claveDeCorrespondencia, codigosDeLaVista } from "@/lib/indicadores/importacion/formulario";
import { normalizar } from "@/lib/lote-usuarios";
import { parsearFormulario } from "@/lib/validacion";
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
    expect(html).toMatch(/<label[^>]*for="corr-subproceso-0-laboratorio-clinico"[^>]*>[^<]*Laboratorio Clínico/);
    expect(html).toMatch(/<select[^>]*id="corr-subproceso-0-laboratorio-clinico"/);
    expect(html).toContain("Gestión de calidad › Laboratorio");
  });

  it("la tabla muestra el código, la fórmula, la meta, los rangos en palabras, el acumulado, el problema y el aviso", async () => {
    const html = await lote();
    expect(html).toContain("GC-ID-01");
    expect(html).toContain("Documentos vigentes");
    expect(html).toContain("Gestión de calidad › Laboratorio");
    // La forma con su fórmula, en la misma celda.
    expect(html).toMatch(/Porcentaje<\/span><span[^>]*>\(A \/ B\) \* 100/);
    // Los rangos en palabras, en la celda de rangos (no un «Atención» cualquiera de la página).
    expect(html).toMatch(/<td[^>]*>Bien: ≥ 95 %[^<]*Atención: 85,5 a 94,99 %[^<]*Crítico: &lt; 85,5 %<\/td>/);
    expect(html).toMatch(/<td[^>]*>95 %<\/td>/);
    expect(html).toContain("suma de los periodos");
    expect(html).toContain("el del último periodo");
    expect(html).toContain("La meta no es un número");
    expect(html).toContain("La meta parece una fracción");
    expect(html).toContain("Aprobado");
  });

  it("con la aprobación previa sin llenar, «Importar» está deshabilitado y dice por qué", async () => {
    c.vistaPrevia.mockResolvedValue(vista({ pendientes: [] }));
    const html = await lote();
    const boton = /<button[^>]*>Importar 1 ficha<\/button>/.exec(html)?.[0] ?? "";
    expect(boton).toMatch(/\sdisabled[\s=>]/);
    expect(boton).toContain('aria-describedby="motivo-importar"');
    expect(html).toMatch(/id="motivo-importar"[^>]*>Complete los datos de la aprobación previa/);
    expect(html).not.toContain("Importar 1 fichas");
    expect(html).toMatch(/role="status"[^>]*>1 de 2 filas están listas/);
  });

  it("con la aprobación previa llena, «Importar» abre el diálogo de la clave", () => {
    const html = renderToStaticMarkup(
      <FormularioImportacion
        loteId={7}
        vistaInicial={vista({ pendientes: [] })}
        pideCodigo={false}
        valoresIniciales={{ documento: "SGC-TI-002 v1", aprobadoPor: "Gerente", fecha: "2026-09-11" }}
      />,
    );
    const boton = /<button[^>]*>Importar 1 ficha<\/button>/.exec(html)?.[0] ?? "";
    expect(boton).toContain('aria-haspopup="dialog"');
    expect(boton).not.toMatch(/\sdisabled[\s=>]/);
    expect(html).toContain("<dialog");
  });

  it("el diálogo de la clave lista lo que se firma: fichas, aprobación previa, regla y siglas", () => {
    const html = renderToStaticMarkup(
      <FormularioFirma
        titulo="Importar 2 fichas de indicadores"
        etiquetaBoton="Importar 2 fichas"
        accion={vi.fn()}
        ocultos={{ id: "7" }}
        pideCodigo={false}
        alCancelar={() => {}}
      >
        <ResumenDeImportacion
          fichas={2}
          documento="SGC-TI-002 v1"
          aprobadoPor="Gerente"
          fecha="2026-09-11"
          pctAscendente="90"
          pctDescendente="110"
          siglas={[{ sigla: "CNT", subproceso: "Gestión Contable" }]}
        />
      </FormularioFirma>,
    );
    expect(html).toContain("Su clave");
    expect(html).toContain("SGC-TI-002 v1");
    expect(html).toContain("Gerente");
    expect(html).toMatch(/Atención desde el 90 % de la meta[^<]*110 %/);
    expect(html).toContain("CNT");
    expect(html).toContain("Gestión Contable");
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
    expect(html).not.toContain("importaron 2 fichas aprobadas y 1 en borrador.");
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
  it("cada fila dice si está lista o con problemas, en su celda de estado", () => {
    const html = renderToStaticMarkup(<TablaVistaPrevia vista={vista()} />);
    expect(html).toMatch(/GC-ID-01[\s\S]*?<span[^>]*>Lista<\/span>[\s\S]*?GC-ID-02[\s\S]*?<span[^>]*>Con problemas<\/span>/);
    expect(codigosDeLaVista(vista().filas)).toBe("gc-id-01");
  });

  it("una tasa muestra su factor y la meta con el sufijo de su unidad", () => {
    const v = vista();
    v.filas = [
      { numero: 2, codigo: "T-ID-01", ficha: ficha({ forma: "tasa", factor: 1000, formula: "(A / B) * 1000", metaMax: "100" }) as never, problemas: [], avisos: [], pendientes: [] },
    ];
    const html = renderToStaticMarkup(<TablaVistaPrevia vista={v} />);
    expect(html).toMatch(/Tasa \(× 1\.000\)<\/span>/);
    expect(html).toContain("meta hasta 100 %");
  });

  it("avisa mientras la vista no refleje el formulario", () => {
    expect(renderToStaticMarkup(<TablaVistaPrevia vista={vista()} desactualizada />)).toContain(
      "La vista previa no refleja los cambios del formulario: pulse Actualizar",
    );
    expect(renderToStaticMarkup(<TablaVistaPrevia vista={vista()} />)).not.toContain("no refleja");
  });

  it("una correspondencia pendiente de unidad dice «la unidad»", () => {
    const v = vista();
    v.filas = [{ numero: 2, codigo: "U-ID-01", ficha: null, problemas: [], avisos: [], pendientes: [{ tipo: "unidad", texto: "porcentual" }] }];
    expect(renderToStaticMarkup(<TablaVistaPrevia vista={v} />)).toContain("Falta elegir la unidad de «porcentual»");
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

describe("el singular de los resultados", () => {
  it("una sola ficha aprobada, una sola omitida", async () => {
    c.resumenDeLote.mockResolvedValue(resumen({ estado: "importado", aprobadas: 1, borradores: 0, omitidas: 1, importadoEn: new Date("2026-11-11T15:00:00Z") }));
    const html = await lote();
    expect(html).toContain("Se importó 1 ficha aprobada y 0 en borrador");
    expect(html).toContain("1 fila omitida");
  });

  it("la lista de lotes dice «1 aprobada»", async () => {
    c.lotesRecientes.mockResolvedValue([
      { id: 7, cargadoEn: new Date("2026-11-10T15:00:00Z"), cargadoPor: "Ana", estado: "importado", archivo: "a.xlsx", aprobadas: 1, borradores: 1 },
    ]);
    expect(renderToStaticMarkup(await PaginaImportar())).toContain("1 aprobada, 1 en borrador");
  });

  it("un id de lote de más de nueve cifras no existe", async () => {
    await expect(lote("1234567890")).rejects.toThrow("NO_ENCONTRADA");
  });
});

describe("los selects de las correspondencias", () => {
  it("dos textos que se parecen no comparten id", () => {
    const v = vista({ pendientes: [{ tipo: "cargo", texto: "Gestión-Calidad" }, { tipo: "cargo", texto: "Gestión Calidad" }] });
    const html = renderToStaticMarkup(<FormularioImportacion loteId={7} vistaInicial={v} pideCodigo={false} />);
    const ids = [...html.matchAll(/<select[^>]*id="(corr-[^"]+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
});

describe("el formulario que viaja al servidor", () => {
  const estado = {
    loteId: 7,
    pctAscendente: "90",
    pctDescendente: "110",
    elegidas: { "subproceso:laboratorio clinico": { valor: "8" }, "cargo:jefe de area": { valor: "" } },
    documento: "SGC-TI-002 v1",
    aprobadoPor: "Gerente",
    fecha: "2026-09-11",
    siglas: { 8: "CNT" },
    codigos: "gc-id-01\ngc-id-03",
  };
  const formData = (campos: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.set(k, v);
    return f;
  };

  it("ida y vuelta: lo que arma el cliente lo lee el esquema de importar", () => {
    const campos = { ...camposDeLaImportacion(estado), clave: "secreta" };
    expect(Object.keys(campos)).toEqual(
      expect.arrayContaining(["corr:subproceso:laboratorio clinico", "sigla:8", "codigos", "pctAscendente", "documento"]),
    );
    expect(campos).not.toHaveProperty(["corr:cargo:jefe de area"]);
    const d = parsearFormulario(juntarImportacion(formData(campos)), EsquemaImportarLote, { omitir: ["id"] });
    expect(d).toMatchObject({
      correspondencias: { subprocesos: { "laboratorio clinico": 8 }, cargos: {}, tipos: {}, unidades: {} },
      siglas: { "8": "CNT" },
      documento: "SGC-TI-002 v1",
      aprobadoPor: "Gerente",
      fecha: "2026-09-11",
      pctAscendente: "90",
      pctDescendente: "110",
      codigos: "gc-id-01\ngc-id-03",
      clave: "secreta",
    });
  });

  it("la vista previa manda solo lo que su esquema estricto admite", () => {
    const d = parsearFormulario(juntarImportacion(formData(camposDeLaVista(estado))), EsquemaVistaPreviaImportacion, { omitir: ["id"] });
    expect(d.correspondencias?.subprocesos).toEqual({ "laboratorio clinico": 8 });
    expect(d.pctDescendente).toBe("110");
  });

  it("el servidor normaliza la clave de la correspondencia aunque el cliente la mande distinta", () => {
    const d = parsearFormulario(juntarImportacion(formData({ "corr:subproceso:Laboratorio  Clínico": "8" })), EsquemaVistaPreviaImportacion);
    expect(d.correspondencias?.subprocesos).toEqual({ "laboratorio clinico": 8 });
  });

  it("la clave del cliente es la misma que la del servidor", () => {
    for (const t of ["Laboratorio  Clínico", "  ÁREA de Gestión ", "x", "Ñandú\tAzul"]) expect(claveDeCorrespondencia(t)).toBe(normalizar(t));
  });
});
