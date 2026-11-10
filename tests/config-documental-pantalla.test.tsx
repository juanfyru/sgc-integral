/**
 * La sección Formato del acta de Configuración documental: el documento elegido no se pierde aunque
 * ya no sirva, y un fallo al revisarlo no rompe la página.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { obtenerConfigDocumental, documentosParaFormato, revisarFormatoActa, listarItemsVerificacion } = vi.hoisted(() => ({
  obtenerConfigDocumental: vi.fn(),
  documentosParaFormato: vi.fn(),
  revisarFormatoActa: vi.fn(),
  listarItemsVerificacion: vi.fn(),
}));

vi.mock("@/app/admin/acciones-config-documental", () => ({
  guardarConfigDocumentalAccion: vi.fn(),
  alternarItemVerificacionAccion: vi.fn(),
  crearItemVerificacionAccion: vi.fn(),
  editarItemVerificacionAccion: vi.fn(),
  moverItemVerificacionAccion: vi.fn(),
}));
vi.mock("@/lib/paginas", () => ({ exigirPermiso: async () => ({ usuarioId: 1 }) }));
vi.mock("@/db/consultas/config-documental", () => ({ obtenerConfigDocumental }));
vi.mock("@/db/consultas/formato-acta", () => ({ documentosParaFormato, revisarFormatoActa }));
vi.mock("@/db/consultas/revision", () => ({ listarItemsVerificacion }));

import PaginaConfiguracionDocumental from "@/app/(app)/admin/(panel)/configuracion-documental/page";

const config = (documentoId: number | null = null) => ({
  formatoCodigo: "{PROCESO}-{TIPO}-{NN}",
  plazos: { visto_bueno: 3, aceptacion: 3, elaboracion: 15, ajustes: 5, revision: 5, aprobacion: 5, publicacion: 2 },
  escalamientoDias: 3,
  publicacionDirecta: true,
  formatoActa: { documentoId, margenSuperiorCm: 5.5, margenInferiorCm: 3.5 },
  distribucion: {
    plazoRecibidoDias: 3, plazoRecogidaDias: 5, plazoAcuseDias: 15, plazoSocializacionDias: 30, plazoCorreccionDias: 5,
    verificacionCadaDias: 90, umbralConformidadPct: 95, selloFranjaCm: 1, selloQrCm: 1.5,
  },
  vigencia: {
    atencionDias: 90, revisionAnualPlazoDias: 60, revisionAnualVentanaMeses: 6, externosVerificacionMeses: 12, impactoPlazoDias: 15,
    formatoInforme: { documentoId: null, margenSuperiorCm: 5.5, margenInferiorCm: 3.5 },
  },
  metas: { dentroPlazoPct: 95, aprobacionDias: 30, vencidos: 0, acusesPct: 90, externosPct: 95, etapasPlazoPct: 90 },
});

const pagina = async () => renderToStaticMarkup(await PaginaConfiguracionDocumental());
const entrada = (html: string, nombre: string) => html.match(new RegExp(`<input[^>]*name="${nombre}"[^>]*>`))?.[0];
const BASICO = "Las actas saldrán con el diseño básico.";
const PERDIDO = "No se podrán generar actas hasta restaurar el archivo del formato.";

beforeEach(() => {
  obtenerConfigDocumental.mockResolvedValue(config());
  documentosParaFormato.mockResolvedValue([{ id: 31, codigo: "SGC-FO-06", titulo: "Acta de control documental" }]);
  revisarFormatoActa.mockResolvedValue({ estado: "sin_formato" });
  listarItemsVerificacion.mockResolvedValue([]);
});

describe("Distribución", () => {
  it("va después del formato del acta, con los nueve campos y sus valores", async () => {
    const html = await pagina();
    expect(html.indexOf(">Distribución<")).toBeGreaterThan(html.indexOf("Formato del acta"));
    expect(entrada(html, "plazoAcuseDias")).toMatch(/value="15"/);
    expect(entrada(html, "umbralConformidadPct")).toMatch(/value="95"/);
    expect(entrada(html, "selloFranjaCm")).toMatch(/value="1"/);
    expect(entrada(html, "selloQrCm")).toMatch(/value="1,5"/);
    expect(html).toContain("Tamaño del código QR (cm)");
  });
});

describe("Vigencia e Indicadores documentales", () => {
  it("van después de Distribución, con los cinco plazos, los márgenes y el informe de ejemplo", async () => {
    const html = await pagina();
    expect(html.indexOf(">Vigencia<")).toBeGreaterThan(html.indexOf(">Distribución<"));
    expect(html.indexOf(">Indicadores documentales<")).toBeGreaterThan(html.indexOf(">Vigencia<"));
    expect(entrada(html, "atencionDias")).toMatch(/value="90"/);
    expect(entrada(html, "revisionAnualPlazoDias")).toMatch(/value="60"/);
    expect(entrada(html, "revisionAnualVentanaMeses")).toMatch(/min="0"/);
    expect(entrada(html, "revisionAnualVentanaMeses")).toMatch(/value="6"/);
    expect(entrada(html, "externosVerificacionMeses")).toMatch(/value="12"/);
    expect(entrada(html, "impactoPlazoDias")).toMatch(/value="15"/);
    expect(entrada(html, "informeMargenSuperiorCm")).toMatch(/value="5.5"/);
    expect(entrada(html, "informeMargenInferiorCm")).toMatch(/value="3.5"/);
    expect(html).toContain("Documento del formato del informe");
    expect(html).toContain("Ver informe de ejemplo");
    // Conectado: abre el informe de ejemplo en otra pestaña, como el acta de ejemplo.
    expect(html.match(/<a [^>]*href="\/admin\/api\/informe-ejemplo"[^>]*>/)?.[0]).toMatch(/target="_blank"/);
    expect(html).not.toContain("disponible más adelante");
  });

  it("las ayudas dicen lo que hace el código (F-I2 de la revisión final)", async () => {
    const html = (await pagina()).replaceAll("&quot;", '"');
    // Entran todos los vigentes; la ventana decide cuáles quedan «revisado recientemente» (`abrirRevision`).
    expect(html).toContain(
      "Al abrir la revisión anual entran todos los documentos vigentes; los revisados dentro de estos meses (publicados, aprobados, ratificados o verificados) quedan «Revisado recientemente». Cero: ninguno.",
    );
    expect(html).not.toContain("Cero: solo los ya vencidos");
    // El estado del semáforo se llama «Atención».
    expect(html).toContain("Desde cuántos días antes de vencer su plazo un documento aparece en «Atención».");
    expect(html).not.toContain("«Por vencer»");
    // El indicador mide desde la aceptación (`tiempoDeAprobacion`).
    expect(html).toContain("Días que, como mucho, debe tardar un trámite desde que se acepta hasta que se publica.");
    // Sin formato propio, el informe sale sobre el formato del acta (`revision-anual/cierre.ts`).
    expect(html).toMatch(/<select[^>]*name="formatoInformeDocumentoId"[^>]*>(<option[^>]*>[^<]*<\/option>)*?<option value=""[^>]*>Sin formato propio: el del acta<\/option>/);
  });

  it("las seis metas llevan su valor y su unidad", async () => {
    const html = await pagina();
    expect(entrada(html, "metaDentroPlazoPct")).toMatch(/value="95"/);
    expect(entrada(html, "metaAprobacionDias")).toMatch(/value="30"/);
    expect(entrada(html, "metaVencidos")).toMatch(/value="0"/);
    expect(entrada(html, "metaVencidos")).toMatch(/max="999"/);
    expect(entrada(html, "metaAcusesPct")).toMatch(/value="90"/);
    expect(entrada(html, "metaExternosPct")).toMatch(/value="95"/);
    expect(entrada(html, "metaEtapasPlazoPct")).toMatch(/value="90"/);
    expect(html).toContain("Documentos dentro de plazo (%)");
    expect(html).toContain("Días de aprobación (máximo)");
  });

  it("el documento del informe guardado se pide aparte y sigue elegido", async () => {
    const base = config(31);
    obtenerConfigDocumental.mockResolvedValue({ ...base, vigencia: { ...base.vigencia, formatoInforme: { ...base.vigencia.formatoInforme, documentoId: 52 } } });
    documentosParaFormato.mockImplementation(async (o: { incluir: number }) =>
      o.incluir === 52 ? [{ id: 52, codigo: "SGC-FO-09", titulo: "Informe" }] : [{ id: 31, codigo: "SGC-FO-06", titulo: "Acta" }]);
    const html = await pagina();
    expect(documentosParaFormato).toHaveBeenCalledWith({ incluir: 52 });
    expect(html).toMatch(/<option value="52" selected="">SGC-FO-09 — Informe<\/option>/);
  });
});

describe("Formato del acta", () => {
  it("va después de Publicación directa, con sus campos, su ayuda y el acta de ejemplo", async () => {
    const html = await pagina();
    expect(html.indexOf("Formato del acta")).toBeGreaterThan(html.indexOf("Publicación directa"));
    expect(html).toContain("Documento del formato");
    expect(html).toContain("Espacio del encabezado (cm)");
    expect(html).toContain("Espacio del pie (cm)");
    expect(entrada(html, "margenSuperiorCm")).toMatch(/type="number"/);
    expect(entrada(html, "margenSuperiorCm")).toMatch(/step="0.1"/);
    expect(entrada(html, "margenSuperiorCm")).toMatch(/value="5.5"/);
    expect(entrada(html, "margenInferiorCm")).toMatch(/value="3.5"/);
    expect(html).toContain("Un PDF de una página, tamaño carta, con el cuerpo en blanco. Guarde y use Ver acta de ejemplo para comprobar los espacios.");
    expect(html.match(/<a [^>]*href="\/admin\/api\/acta-ejemplo"[^>]*>/)?.[0]).toMatch(/target="_blank"/);
    expect(html).toContain("Ver acta de ejemplo");
  });

  it("sin formato no avisa nada y queda elegida la opción vacía", async () => {
    const html = await pagina();
    expect(html).not.toContain(BASICO);
    expect(html).not.toContain(PERDIDO);
    expect(html).toMatch(/<option value="" selected="">Sin formato: diseño básico<\/option>/);
  });

  it("pide la lista con el documento guardado, para que siga elegido aunque ya no sirva", async () => {
    obtenerConfigDocumental.mockResolvedValue(config(44));
    documentosParaFormato.mockResolvedValue([{ id: 44, codigo: "GTH-FO-01", titulo: "Ya restringido" }]);
    revisarFormatoActa.mockResolvedValue({ estado: "no_sirve", motivo: "El documento del formato es restringido" });
    const html = await pagina();
    expect(documentosParaFormato).toHaveBeenCalledWith({ incluir: 44 });
    expect(html).toMatch(/<option value="44" selected="">GTH-FO-01 — Ya restringido<\/option>/);
  });

  it("un formato listo dice cuál se usa", async () => {
    obtenerConfigDocumental.mockResolvedValue(config(31));
    revisarFormatoActa.mockResolvedValue({ estado: "listo", codigo: "SGC-FO-06", version: 2 });
    const html = await pagina();
    expect(html).toContain("SGC-FO-06, versión 2");
    expect(html).not.toContain(BASICO);
  });

  it("uno que no sirve avisa con su motivo, en texto y como estado", async () => {
    obtenerConfigDocumental.mockResolvedValue(config(31));
    revisarFormatoActa.mockResolvedValue({ estado: "no_sirve", motivo: "El formato debe tener una sola página" });
    const html = await pagina();
    expect(html).toMatch(/role="status"[^>]*>(?:(?!<\/div>)[\s\S])*Las actas saldrán con el diseño básico\./);
    expect(html).toContain("El formato debe tener una sola página");
    expect(html).toContain("bg-estado-atencion-fondo");
  });

  it("uno perdido avisa que no se podrán generar actas", async () => {
    obtenerConfigDocumental.mockResolvedValue(config(31));
    revisarFormatoActa.mockResolvedValue({ estado: "perdido" });
    const html = await pagina();
    expect(html).toMatch(/role="status"[^>]*>(?:(?!<\/div>)[\s\S])*No se podrán generar actas/);
    expect(html).toContain("bg-estado-critico-fondo");
  });

  it("si la revisión falla, la página carga con el aviso de perdido", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      obtenerConfigDocumental.mockResolvedValue(config(31));
      revisarFormatoActa.mockRejectedValue(new Error("se cayó"));
      expect(await pagina()).toContain(PERDIDO);
      expect(error).toHaveBeenCalledOnce();
    } finally {
      error.mockRestore();
    }
  });
});
