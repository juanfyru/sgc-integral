/**
 * El informe de la revisión anual en PDF (spec 13C §9.5, maqueta 6): sin BD. El membrete, los márgenes, la tabla de
 * decisiones que sigue en otra hoja con su cabecera, la firma del cierre y el informe de ejemplo.
 */
import { createHash } from "node:crypto";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { datosDeEjemplo, generarInformeAnual, type DatosInforme } from "@/lib/informe-anual";
import type { Decision } from "@/lib/vigencia/tipos";
import { pdfDeFormato } from "./utiles/formato";
import { contenidoPorPagina, contieneTexto } from "./utiles/pdf";

const ZONA = "America/Bogota";
const FORMATO = { archivoId: 1, hash: "x", codigo: "SGC-RG-06", version: 1, margenSuperiorCm: 6, margenInferiorCm: 4 };
const cm = (x: number) => (x * 72) / 2.54;

const CICLO: Decision[] = ["ratificar", "actualizar", "eliminar", "reciente", "en_tramite", "sin_revisar"];
const PROCESOS = ["Consulta Externa", "Gestión del Talento Humano", "Sistema de Gestión de Calidad"];

/** Un informe cerrado con `decisiones` filas repartidas en tres procesos y en las seis decisiones. */
function datosDePrueba(o: { decisiones: number; formato?: DatosInforme["formato"] }): DatosInforme {
  const decisiones: DatosInforme["decisiones"] = Array.from({ length: o.decisiones }, (_, i) => {
    const decision = CICLO[i % CICLO.length];
    const conSolicitud = decision === "actualizar" || decision === "eliminar" || decision === "en_tramite";
    return {
      codigo: `CEX-PR-${String(i + 1).padStart(2, "0")}`,
      titulo: `Documento de prueba ${i + 1}`,
      version: 1 + (i % 3),
      proceso: PROCESOS[Math.floor((i * PROCESOS.length) / o.decisiones)],
      decision,
      responsable: decision === "sin_revisar" || decision === "reciente" ? null : "Luz Dary Ortiz Trujillo",
      solicitud: conSolicitud
        ? {
            numero: `SOL-2090-${String(i + 1).padStart(3, "0")}`,
            venceEn: new Date("2090-12-22T15:00:00Z"),
            estadoAlCierre: i % 2 === 0 ? "Publicado" : "En curso: Elaboración",
          }
        : null,
      fecha: decision === "sin_revisar" ? null : new Date("2090-11-06T15:00:00Z"),
    };
  });
  const totales = Object.fromEntries(CICLO.map((d) => [d, decisiones.filter((x) => x.decision === d).length])) as Record<Decision, number>;
  return {
    entidad: "ESE Hospital de la prueba",
    anio: 2090,
    abiertaEn: new Date("2090-11-01T13:00:00Z"),
    prorrogas: [{ fecha: new Date("2090-12-01T13:00:00Z"), dias: 10, motivo: "Auditoría externa en curso", por: "María Fernanda Perdomo" }],
    cerradaEn: new Date("2090-12-19T19:32:00Z"),
    cerradaPor: { nombre: "María Fernanda Perdomo", cargo: "Administradora del SGC" },
    metodo: "clave",
    alcance: { documentos: decisiones.length, internos: decisiones.length - 1, externos: 1, procesos: PROCESOS.length },
    totales,
    decisiones: [
      ...decisiones,
      {
        codigo: "CEX-DE-01",
        titulo: "Guía externa",
        version: 2,
        proceso: "Consulta Externa",
        decision: "actualizar",
        responsable: "Luz Dary Ortiz Trujillo",
        solicitud: null,
        fecha: new Date("2090-11-07T15:00:00Z"),
        estadoExterno: "Edición adoptada",
      },
    ],
    normograma: {
      cambios: [{ norma: "Resolución 3100 de 2019", estado: "Derogada", fecha: new Date("2090-03-12T05:00:00Z"), documentos: 4, resueltos: 3, noAfecta: 1 }],
      porProceso: [
        { proceso: "Consulta Externa", resultado: "Con cambios", nota: "Falta la Resolución 1995 de 1999." },
        { proceso: "Gestión del Talento Humano", resultado: "Sin novedad", nota: null },
        { proceso: "Sistema de Gestión de Calidad", resultado: null, nota: null },
      ],
    },
    otros: { acusesPct: 88, conformidadPct: 86, externosAlDia: { alDia: 6, total: 6 } },
    formato: o.formato ?? null,
    zona: ZONA,
    revisionId: 77,
  };
}

/** Por cada página, si lleva un objeto incrustado: el membrete es el único que el informe incrusta. */
const conFondo = async (bytes: Uint8Array) =>
  (await PDFDocument.load(bytes)).getPages().map((p) => {
    const objetos = p.node.Resources()?.lookup(PDFName.of("XObject"));
    return objetos instanceof PDFDict && objetos.keys().length > 0;
  });

/** Las posiciones (x, y) de cada texto dibujado en la página: `pdf-lib` escribe `1 0 0 1 x y Tm` antes de cada uno. */
const posiciones = (pagina: string) =>
  [...pagina.matchAll(/\b1 0 0 1 (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) Tm/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));

const huella = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

describe("generarInformeAnual", () => {
  it("imprime título, cifras, cada decisión con su estado al cierre y la firma, sobre el membrete y sin él", async () => {
    for (const [formato, membrete] of [
      [null, null],
      [FORMATO, await pdfDeFormato(1)],
    ] as const) {
      const datos = datosDePrueba({ decisiones: 40, formato });
      const bytes = await generarInformeAnual(datos, membrete);
      const paginas = await contenidoPorPagina(bytes);
      const todo = paginas.join("\n");
      expect(paginas.length).toBeGreaterThan(1);
      expect(contieneTexto(paginas[0], "INFORME DE REVISI")).toBe(true);
      expect(contieneTexto(paginas[0], "Revisión anual 2090")).toBe(true);
      expect(paginas.some((p) => contieneTexto(p, "Sin revisar"))).toBe(true);
      expect(contieneTexto(paginas[paginas.length - 1], "Cerr")).toBe(true);
      // Cada decisión con su código, su solicitud y el estado de su trámite al cierre; el externo, con el de la adopción.
      for (const d of datos.decisiones) expect(contieneTexto(todo, `${d.codigo} v${d.version}`), d.codigo).toBe(true);
      expect(contieneTexto(todo, "SOL-2090-002")).toBe(true);
      expect(contieneTexto(todo, "En curso: Elaboración")).toBe(true);
      expect(contieneTexto(todo, "Edición adoptada")).toBe(true);
      // Las cifras por decisión, los cambios normativos, el normograma por proceso y los otros insumos.
      expect(contieneTexto(todo, "Ratificados")).toBe(true);
      expect(contieneTexto(todo, "Resolución 3100 de 2019")).toBe(true);
      expect(contieneTexto(todo, "Falta la Resolución 1995 de 1999.")).toBe(true);
      expect(contieneTexto(todo, "Sin confirmar")).toBe(true);
      expect(contieneTexto(todo, "88 %")).toBe(true);
      expect(contieneTexto(todo, "6 de 6")).toBe(true);
      expect(contieneTexto(todo, "Auditoría externa en curso")).toBe(true);
      // La firma: quién, con qué cargo, cuándo y la huella que el PDF no puede llevar dentro.
      const ultima = paginas[paginas.length - 1];
      expect(contieneTexto(ultima, "María Fernanda Perdomo · Administradora del SGC · 19/12/2090 14:32")).toBe(true);
      expect(contieneTexto(ultima, "Se calcula al registrar el archivo")).toBe(true);
      expect(contieneTexto(ultima, "Revisión n.º 77, cerrada el 19/12/2090 14:32")).toBe(true);
      // El membrete va bajo cada hoja; con él, la entidad ya está en su encabezado.
      expect(await conFondo(bytes)).toEqual(paginas.map(() => formato !== null));
      expect(contieneTexto(paginas[0], datos.entidad)).toBe(formato === null);
      for (const [i, p] of paginas.entries()) expect(contieneTexto(p, `Página ${i + 1} de ${paginas.length}`)).toBe(true);
    }
  });

  it("respeta los márgenes del formato en cada hoja", async () => {
    const datos = datosDePrueba({ decisiones: 60, formato: FORMATO });
    const paginas = await contenidoPorPagina(await generarInformeAnual(datos, await pdfDeFormato(1)));
    expect(paginas.length).toBeGreaterThan(2);
    for (const [i, pagina] of paginas.entries()) {
      const ps = posiciones(pagina);
      expect(ps.length, `hoja ${i + 1}`).toBeGreaterThan(0);
      expect(Math.max(...ps.map((p) => p.y)), `hoja ${i + 1}`).toBeLessThanOrEqual(792 - cm(FORMATO.margenSuperiorCm));
      expect(Math.min(...ps.map((p) => p.y)), `hoja ${i + 1}`).toBeGreaterThanOrEqual(cm(FORMATO.margenInferiorCm));
      expect(Math.min(...ps.map((p) => p.x)), `hoja ${i + 1}`).toBeGreaterThanOrEqual(48);
      expect(Math.max(...ps.map((p) => p.x)), `hoja ${i + 1}`).toBeLessThan(612 - 48);
    }
  });

  it("la tabla de decisiones que sigue en otra hoja repite su cabecera", async () => {
    const paginas = await contenidoPorPagina(await generarInformeAnual(datosDePrueba({ decisiones: 90, formato: FORMATO }), await pdfDeFormato(1)));
    const conDecisiones = paginas.filter((p) => contieneTexto(p, "CEX-PR-"));
    expect(conDecisiones.length).toBeGreaterThan(1);
    for (const p of conDecisiones) {
      expect(contieneTexto(p, "Responsable")).toBe(true);
      expect(contieneTexto(p, "Estado al cierre")).toBe(true);
    }
  });

  it("generarlo otra vez da los mismos bytes, fechados al cierre", async () => {
    const datos = datosDePrueba({ decisiones: 12, formato: FORMATO });
    const membrete = await pdfDeFormato(1);
    const a = await generarInformeAnual(datos, membrete);
    expect(huella(await generarInformeAnual(datos, membrete))).toBe(huella(a));
    const doc = await PDFDocument.load(a);
    expect(doc.getCreationDate()).toEqual(datos.cerradaEn);
    expect(doc.getTitle()).toBe("Informe de revisión anual 2090");
  });

  it("lo que la fuente no puede imprimir sale como «?» y el informe lo dice", async () => {
    const datos = datosDePrueba({ decisiones: 6 });
    const limpio = (await contenidoPorPagina(await generarInformeAnual(datos, null))).join("\n");
    expect(contieneTexto(limpio, "Algunos caracteres no se pudieron imprimir")).toBe(false);
    const conEmoji = { ...datos, normograma: { ...datos.normograma, porProceso: [{ proceso: "Consulta Externa", resultado: "Con cambios", nota: "Falta 📄 una" }] } };
    const texto = (await contenidoPorPagina(await generarInformeAnual(conEmoji, null))).join("\n");
    expect(contieneTexto(texto, "Falta ? una")).toBe(true);
    expect(contieneTexto(texto, "Algunos caracteres no se pudieron imprimir")).toBe(true);
  });

  it("el ejemplo lleva la marca EJEMPLO, SIN VALOR en cada hoja, sobre el formato dado", async () => {
    const ejemplo = datosDeEjemplo("Entidad de la prueba", ZONA, FORMATO);
    expect(ejemplo).toMatchObject({ ejemplo: true, entidad: "Entidad de la prueba", zona: ZONA, formato: FORMATO });
    expect(ejemplo.decisiones.length).toBeGreaterThanOrEqual(30);
    const bytes = await generarInformeAnual(ejemplo, await pdfDeFormato(1));
    const paginas = await contenidoPorPagina(bytes);
    expect(paginas.length).toBeGreaterThanOrEqual(2);
    for (const p of paginas) expect(contieneTexto(p, "EJEMPLO, SIN VALOR")).toBe(true);
    expect(await conFondo(bytes)).not.toContain(false);
    // Sin la marca, el informe real no la lleva; el de ejemplo sin formato sale con el diseño básico.
    const real = (await contenidoPorPagina(await generarInformeAnual(datosDePrueba({ decisiones: 6 }), null))).join("\n");
    expect(contieneTexto(real, "EJEMPLO")).toBe(false);
    const basico = await generarInformeAnual(datosDeEjemplo("Entidad de la prueba", ZONA, null), null);
    expect(await conFondo(basico)).not.toContain(true);
    expect(contieneTexto((await contenidoPorPagina(basico))[0], "Entidad de la prueba")).toBe(true);
  });
});
