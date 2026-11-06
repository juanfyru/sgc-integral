/**
 * Las pantallas del camino directo: qué ofrece cada formulario según lo que §8.6 permite.
 * Las reglas las aplica el servidor (tests/camino-directo.test.ts); aquí se comprueba que la
 * persona vea lo mismo y que el formulario envíe lo que la acción valida.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FormularioCatalogo, FormularioControl, FormularioDocumento } from "@/componentes/admin/FormularioDocumento";
import { documentosRelacionables, edicionDeControl, type FilaDocumentoAdmin, type SituacionDocumento } from "@/db/consultas/admin";
import {
  EsquemaCatalogo,
  EsquemaDatosVersion,
  EsquemaDeshacerCarga,
  EsquemaDocumentoNuevo,
  EsquemaNuevaVersion,
} from "@/lib/esquemas/documentos";
import { parsearFormulario } from "@/lib/validacion";

const accion = vi.fn(async () => null);
const TIPOS = [{ id: 1, nombre: "Formato", sigla: "FO" }];
const PROCESOS = [{ id: 7, nombre: "Calidad", subprocesos: [{ id: 70, nombre: "Auditorías" }] }];
const DOCUMENTOS = [
  { id: 1, codigo: "GTH-PR-01", titulo: "Ingreso del personal" },
  { id: 2, codigo: "GTH-FO-02", titulo: "Acta de reunión" },
];
const VALORES = { codigo: "SGC-FO-01", titulo: "Formato de actas", tipoId: 1, tipoNombre: "Formato" };
const CONTROL = { accion, tipos: TIPOS, documentoId: 9, valores: VALORES };
const CATALOGO = {
  accion,
  procesos: PROCESOS,
  documentos: DOCUMENTOS,
  documentoId: 9,
  codigo: "SGC-FO-01",
  valores: {
    descripcion: null,
    palabrasClave: null,
    nivelAcceso: "restringido",
    asociaciones: [{ procesoId: 7, subprocesoId: null, esPrincipal: true }],
    relacionados: [2],
  },
};

const LIBRE: SituacionDocumento = { publicado: false, anulado: false, origenVigente: null, creacionCancelada: false, tramiteAbierto: null };

describe("edicionDeControl (spec 13A §8.6)", () => {
  it("sin versión publicada se corrige todo", () => {
    expect(edicionDeControl(LIBRE, true)).toEqual({ codigoYTipo: null, titulo: null });
    expect(edicionDeControl(LIBRE, false)).toEqual({ codigoYTipo: null, titulo: null });
  });

  it("de lo cargado fuera, con la carga abierta, solo el título", () => {
    const situacion = { ...LIBRE, publicado: true, origenVigente: "fuera" as const };
    expect(edicionDeControl(situacion, true)).toEqual({ codigoYTipo: expect.stringContaining("no cambian"), titulo: null });
    expect(edicionDeControl(situacion, false).titulo).toMatch(/se cambia con un trámite/);
  });

  it("lo aprobado en la plataforma, o lo que ya no está vigente, no se toca", () => {
    expect(edicionDeControl({ ...LIBRE, publicado: true, origenVigente: "plataforma" }, true).titulo).toMatch(/se cambia con un trámite/);
    expect(edicionDeControl({ ...LIBRE, publicado: true, anulado: true }, true).titulo).toMatch(/se cambia con un trámite/);
  });

  it("con un trámite abierto todo se corrige desde el trámite", () => {
    const { codigoYTipo, titulo } = edicionDeControl({ ...LIBRE, tramiteAbierto: { id: 1, numero: "SOL-2026-001" } }, true);
    expect(codigoYTipo).toMatch(/desde el trámite/);
    expect(titulo).toBe(codigoYTipo);
  });
});

describe("FormularioControl", () => {
  it("sin restricciones ofrece los tres campos y no dice nada de más", () => {
    const html = renderToStaticMarkup(<FormularioControl {...CONTROL} edicion={{ codigoYTipo: null, titulo: null }} />);
    expect(html).toContain("Guardar datos de control");
    expect(html).not.toMatch(/ disabled=""| readOnly=""/);
  });

  it("deshabilitado, muestra la razón escrita y no ofrece guardar", () => {
    const razon = "Este documento tiene un trámite abierto: sus datos de control se corrigen desde el trámite";
    const html = renderToStaticMarkup(<FormularioControl {...CONTROL} edicion={{ codigoYTipo: razon, titulo: razon }} />);
    expect(html).toMatch(/<fieldset[^>]* disabled/);
    expect(html.split(razon)).toHaveLength(2); // una sola vez
    expect(html).not.toContain("Guardar datos de control");
  });

  it("si solo se corrige el título, el código y el tipo siguen viajando", () => {
    const edicion = { codigoYTipo: "El código y el tipo no cambian: el documento ya fue publicado", titulo: null };
    const html = renderToStaticMarkup(<FormularioControl {...CONTROL} edicion={edicion} />);
    expect(html).toContain("Guardar datos de control");
    expect(html).toContain(edicion.codigoYTipo);
    expect(html).toMatch(/<input[^>]* readOnly=""[^>]* name="codigo"/);
    expect(html).toMatch(/<select[^>]*disabled/);
    expect(html).toMatch(/<input type="hidden" name="tipoId" value="1"/);
    expect(html).not.toMatch(/<fieldset[^>]* disabled/);
  });

  it("el tipo inactivo del documento se sigue mostrando", () => {
    const valores = { ...VALORES, tipoId: 5, tipoNombre: "Registro viejo" };
    const html = renderToStaticMarkup(<FormularioControl {...CONTROL} valores={valores} edicion={{ codigoYTipo: null, titulo: null }} />);
    expect(html).toContain("Registro viejo (inactivo)");
  });
});

describe("FormularioCatalogo", () => {
  it("marca lo que ya tiene el documento y lista los relacionados para filtrar", () => {
    const html = renderToStaticMarkup(<FormularioCatalogo {...CATALOGO} />);
    expect(html).toContain("Guardar datos de catálogo");
    expect(html).toContain('name="relacionados" checked="" value="2"');
    expect(html).toContain('name="relacionados" value="1"');
    expect(html).toContain("Filtrar documentos relacionados");
    expect(html).toContain('name="principal" checked="" value="p:7"');
    expect(html).toContain('<option value="restringido" selected="">');
  });

  it("con el propietario fijo lo dice, lo envía y no deja elegir otro", () => {
    const html = renderToStaticMarkup(
      <FormularioCatalogo {...CATALOGO} propietarioFijo={{ nombre: "Calidad", razon: "No cambia: es parte del código." }} />,
    );
    expect(html).toContain("No cambia: es parte del código.");
    expect(html).toMatch(/<input type="hidden" name="principal" value="p:7"/);
    expect(html).not.toContain('type="radio"');
  });

  it("una asociación a un proceso desactivado no se pierde al guardar", () => {
    const valores = {
      ...CATALOGO.valores,
      asociaciones: [...CATALOGO.valores.asociaciones, { procesoId: 99, subprocesoId: null, esPrincipal: false }],
    };
    const html = renderToStaticMarkup(<FormularioCatalogo {...CATALOGO} valores={valores} />);
    expect(html).toMatch(/<input type="hidden" name="asociaciones" value="p:99"/);
  });
});

describe("FormularioDocumento", () => {
  it("el alta pide la versión con la que entra, el nivel de acceso y los relacionados", () => {
    const html = renderToStaticMarkup(
      <FormularioDocumento accion={accion} tipos={TIPOS} procesos={PROCESOS} documentos={DOCUMENTOS} formatoCodigo="{PROCESO}-{TIPO}-{NN}" />,
    );
    expect(html).toContain("Versión con la que entra");
    expect(html).toMatch(/<input[^>]*max="999"[^>]*name="numeroInicial"|<input[^>]*name="numeroInicial"[^>]*max="999"/);
    expect(html).toContain("Nivel de acceso");
    expect(html).toContain("Documentos relacionados");
    expect(html).toContain("Formato: {PROCESO}-{TIPO}-{NN}.");
    expect(html).not.toContain("SGC-FO-02");
  });
});

describe("documentosRelacionables", () => {
  const fila = (id: number, codigo: string, versionVigente: number | null) =>
    ({ id, codigo, titulo: `Título ${id}`, versionVigente }) as FilaDocumentoAdmin;
  const filas = [fila(1, "B-02", 1), fila(2, "A-01", 1), fila(3, "C-03", null), fila(4, "D-04", null)];

  it("ofrece los vigentes, por código", () => {
    expect(documentosRelacionables(filas).map((d) => d.id)).toEqual([2, 1]);
  });

  it("no ofrece el propio documento y conserva lo que ya estaba relacionado", () => {
    expect(documentosRelacionables(filas, { id: 1, relacionados: [3] }).map((d) => d.id)).toEqual([2, 3]);
  });
});

describe("esquemas del camino directo", () => {
  const formulario = (campos: [string, string][]) => {
    const datos = new FormData();
    for (const [campo, valor] of campos) datos.append(campo, valor);
    return datos;
  };
  const ALTA: [string, string][] = [
    ["codigo", " sgc-fo-09 "],
    ["titulo", "Formato nuevo"],
    ["tipoId", "1"],
    ["numeroInicial", "4"],
    ["nivelAcceso", "general"],
    ["descripcion", "   "],
    ["principal", "p:7"],
    ["asociaciones", "s:70"],
    ["relacionados", "2"],
    ["relacionados", "1"],
  ];

  it("el alta llega con el dominio: código en mayúsculas, asociaciones y números", () => {
    expect(parsearFormulario(formulario(ALTA), EsquemaDocumentoNuevo)).toEqual({
      codigo: "SGC-FO-09",
      titulo: "Formato nuevo",
      tipoId: 1,
      numeroInicial: 4,
      nivelAcceso: "general",
      descripcion: null,
      palabrasClave: null,
      relacionados: [2, 1],
      asociaciones: [{ procesoId: 7, esPrincipal: true }, { subprocesoId: 70, esPrincipal: false }],
    });
  });

  it("los esquemas son estrictos, y la versión va de 1 a 999", () => {
    expect(() => parsearFormulario(formulario([...ALTA, ["estado", "vigente"]]), EsquemaDocumentoNuevo)).toThrow();
    expect(() => parsearFormulario(formulario([["numero", "1000"]]), EsquemaNuevaVersion)).toThrow(/entre 1 y 999/);
    expect(() => parsearFormulario(formulario([["numero", "0"]]), EsquemaNuevaVersion)).toThrow(/entre 1 y 999/);
    expect(parsearFormulario(formulario([["numero", "3"]]), EsquemaNuevaVersion)).toEqual({ numero: 3 });
    expect(parsearFormulario(formulario([]), EsquemaNuevaVersion)).toEqual({});
  });

  it("el catálogo admite no marcar relacionados ni otros procesos", () => {
    const datos = formulario([["documentoId", "9"], ["codigo", "SGC-FO-01"], ["nivelAcceso", "restringido"], ["principal", "p:7"]]);
    expect(parsearFormulario(datos, EsquemaCatalogo, { omitir: ["documentoId", "codigo"] })).toEqual({
      descripcion: null,
      palabrasClave: null,
      nivelAcceso: "restringido",
      relacionados: [],
      asociaciones: [{ procesoId: 7, esPrincipal: true }],
    });
  });

  it("los datos de la versión vacíos quedan en null, y una fecha mala se rechaza", () => {
    expect(parsearFormulario(formulario([["aprobo", " Gerente "]]), EsquemaDatosVersion)).toEqual({
      fechaElaboracion: null,
      fechaRevision: null,
      fechaAprobacion: null,
      elaboro: null,
      reviso: null,
      aprobo: "Gerente",
      resumenCambios: null,
    });
    expect(() => parsearFormulario(formulario([["fechaAprobacion", "ayer"]]), EsquemaDatosVersion)).toThrow(/fechaAprobacion/);
  });

  it("deshacer exige un motivo de verdad", () => {
    expect(() => parsearFormulario(formulario([["motivo", "   "]]), EsquemaDeshacerCarga)).toThrow();
    expect(parsearFormulario(formulario([["motivo", " Archivo equivocado. "]]), EsquemaDeshacerCarga)).toEqual({ motivo: "Archivo equivocado." });
  });
});
