/**
 * Avisos que dependen de la dirección con que se llega a una pantalla: el bloqueo al firmar en
 * /ingreso y un documento fuera de alcance en /tramites/nueva.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { datosParaSolicitar, sesionActual, guardarConfigDocumental } = vi.hoisted(() => ({
  datosParaSolicitar: vi.fn(),
  sesionActual: vi.fn(),
  guardarConfigDocumental: vi.fn(),
}));

vi.mock("@/app/acciones-cuenta", () => ({ ingresar: vi.fn() }));
vi.mock("@/app/acciones-tramites", () => ({ crearSolicitudAccion: vi.fn() }));
vi.mock("@/lib/paginas", () => ({ exigirPermiso: async () => ({ usuarioId: 1 }) }));
vi.mock("@/lib/sesion-actual", () => ({ sesionActual }));
vi.mock("@/db/consultas/tramites", () => ({ datosParaSolicitar }));
vi.mock("@/componentes/cascaron/PantallaCentrada", () => ({
  PantallaCentrada: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/app/admin/comun", () => ({
  idNumerico: vi.fn(),
  mutacion: (formData: FormData, _permiso: string, fn: (usuarioId: number, datos: FormData) => Promise<string | void>) => fn(1, formData),
}));
vi.mock("@/db/consultas/config-documental", () => ({ guardarConfigDocumental }));
vi.mock("@/db/consultas/revision", () => ({}));

import PaginaNuevaSolicitud from "@/app/(app)/tramites/nueva/page";
import { guardarConfigDocumentalAccion } from "@/app/admin/acciones-config-documental";
import PaginaIngreso from "@/app/ingreso/page";

describe("/ingreso", () => {
  const pagina = async (motivo?: string) =>
    renderToStaticMarkup(await PaginaIngreso({ searchParams: Promise.resolve({ motivo }) }));

  beforeEach(() => sesionActual.mockResolvedValue(null));

  it("explica el bloqueo con un mensaje fijo", async () => {
    expect(await pagina("bloqueo")).toContain("Su cuenta quedó bloqueada al menos 15 minutos por claves erradas");
  });

  it("sin motivo, o con uno que no existe, no dice nada de ninguna cuenta", async () => {
    expect(await pagina()).not.toContain("bloqueada");
    expect(await pagina("cualquiera")).not.toContain("bloqueada");
  });
});

describe("guardar la configuración documental", () => {
  const formulario = (campos: Record<string, string> = {}) => {
    const f = new FormData();
    f.set("formatoCodigo", "{PROCESO}-{TIPO}-{NN}");
    for (const campo of ["plazoVistoBueno", "plazoAceptacion", "plazoElaboracion", "plazoAjustes", "plazoRevision", "plazoAprobacion", "plazoPublicacion", "escalamientoDias"]) f.set(campo, "3");
    f.set("formatoActaDocumentoId", "");
    f.set("margenSuperiorCm", "5.5");
    f.set("margenInferiorCm", "3.5");
    for (const campo of ["plazoRecibidoDias", "plazoRecogidaDias", "plazoAcuseDias", "plazoSocializacionDias", "plazoCorreccionDias", "verificacionCadaDias", "umbralConformidadPct"]) f.set(campo, "10");
    f.set("selloFranjaCm", "1,0");
    f.set("selloQrCm", "1.5");
    for (const [campo, valor] of Object.entries(campos)) f.set(campo, valor);
    return f;
  };
  const formatoGuardado = () => guardarConfigDocumental.mock.lastCall?.[0].formatoActa;

  beforeEach(() => guardarConfigDocumental.mockClear());

  it("no redirige: el formulario debe seguir montado para confirmar en pantalla", async () => {
    expect(await guardarConfigDocumentalAccion(null, formulario())).toBeUndefined();
    expect(guardarConfigDocumental).toHaveBeenCalledOnce();
  });

  it("sin documento elegido no hay formato; con uno, llega su id", async () => {
    await guardarConfigDocumentalAccion(null, formulario());
    expect(formatoGuardado()).toEqual({ documentoId: null, margenSuperiorCm: 5.5, margenInferiorCm: 3.5 });
    await guardarConfigDocumentalAccion(null, formulario({ formatoActaDocumentoId: "31" }));
    expect(formatoGuardado()).toMatchObject({ documentoId: 31 });
  });

  it.each(["5,5", "5.5"])("el margen «%s» vale 5,5", async (margen) => {
    await guardarConfigDocumentalAccion(null, formulario({ margenSuperiorCm: margen, margenInferiorCm: margen }));
    expect(formatoGuardado()).toMatchObject({ margenSuperiorCm: 5.5, margenInferiorCm: 5.5 });
  });

  it("la distribución llega con sus nueve valores, la coma como punto", async () => {
    await guardarConfigDocumentalAccion(null, formulario({ selloFranjaCm: "0,5", umbralConformidadPct: "80" }));
    expect(guardarConfigDocumental.mock.lastCall?.[0].distribucion).toEqual({
      plazoRecibidoDias: 10, plazoRecogidaDias: 10, plazoAcuseDias: 10, plazoSocializacionDias: 10, plazoCorreccionDias: 10,
      verificacionCadaDias: 10, umbralConformidadPct: 80, selloFranjaCm: 0.5, selloQrCm: 1.5,
    });
  });

  it("acepta un margen entero o de cero", async () => {
    await guardarConfigDocumentalAccion(null, formulario({ margenSuperiorCm: "12", margenInferiorCm: "0" }));
    expect(formatoGuardado()).toMatchObject({ margenSuperiorCm: 12, margenInferiorCm: 0 });
  });

  it.each([["margenSuperiorCm", "El espacio del encabezado"], ["margenInferiorCm", "El espacio del pie"]])(
    "%s: más de un decimal, un negativo, un texto o nada se rechazan con mensaje",
    async (campo, nombre) => {
      for (const valor of ["5,55", "5.55", "-1", "abc", "5,", ""]) {
        await expect(guardarConfigDocumentalAccion(null, formulario({ [campo]: valor }))).rejects.toThrow(nombre);
      }
      expect(guardarConfigDocumental).not.toHaveBeenCalled();
    },
  );

  it("un documento que no es un número se rechaza", async () => {
    await expect(guardarConfigDocumentalAccion(null, formulario({ formatoActaDocumentoId: "abc" }))).rejects.toThrow(/documento del formato/i);
    expect(guardarConfigDocumental).not.toHaveBeenCalled();
  });
});

describe("/tramites/nueva", () => {
  const AVISO = "No puede pedir un cambio sobre ese documento";
  const pagina = async (documento?: string) =>
    renderToStaticMarkup(await PaginaNuevaSolicitud({ searchParams: Promise.resolve({ documento }) }));

  beforeEach(() =>
    datosParaSolicitar.mockResolvedValue({
      procesos: [{ id: 1, nombre: "Gestión del Talento Humano", sigla: "GTH", subprocesos: [] }],
      tipos: [],
      documentos: [{ id: 5, codigo: "GTH-PR-01", titulo: "Ingreso", conTramite: false }],
    }),
  );

  it("un documento fuera de su alcance avisa, y no repite lo que vino en la dirección", async () => {
    const html = await pagina("CEX-CA-01");
    expect(html).toContain(AVISO);
    expect(html).not.toContain("CEX-CA-01");
  });

  it("uno de sus documentos abre la modificación, sin aviso", async () => {
    const html = await pagina("gth-pr-01");
    expect(html).not.toContain(AVISO);
    expect(html).toMatch(/<option value="5" selected=""/);
  });

  it("sin documento en la dirección no hay aviso", async () => {
    expect(await pagina()).not.toContain(AVISO);
    expect(await pagina("   ")).not.toContain(AVISO);
  });
});
