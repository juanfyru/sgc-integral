/**
 * Utilidades compartidas de tests para observar PDFs: generar fixtures y
 * verificar qué texto quedó dibujado en cada página.
 */
import {
  PDFArray,
  PDFDocument,
  PDFRawStream,
  PDFRef,
  decodePDFRawStream,
} from "pdf-lib";

export async function pdfDePrueba(
  paginas: [number, number][],
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const [ancho, alto] of paginas) doc.addPage([ancho, alto]);
  return doc.save();
}

// Los content streams van comprimidos (FlateDecode): para observar el texto
// hay que decodificarlos página por página con las utilidades de pdf-lib.
export async function contenidoPorPagina(
  bytes: Uint8Array,
): Promise<string[]> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((pagina) => {
    const partes: string[] = [];
    const recolectar = (objeto: unknown): void => {
      if (objeto instanceof PDFRef) {
        recolectar(doc.context.lookup(objeto));
      } else if (objeto instanceof PDFArray) {
        for (let i = 0; i < objeto.size(); i++) recolectar(objeto.get(i));
      } else if (objeto instanceof PDFRawStream) {
        // Los streams del seed van sin /Filter: se leen crudos si no hay
        // nada que decodificar.
        try {
          partes.push(
            Buffer.from(decodePDFRawStream(objeto).decode()).toString("latin1"),
          );
        } catch {
          partes.push(Buffer.from(objeto.contents).toString("latin1"));
        }
      }
    };
    recolectar(pagina.node.Contents());
    return partes.join("\n");
  });
}

// El texto de las fuentes estándar se escribe como hex string (<434F...> Tj);
// se acepta también la forma literal entre paréntesis por robustez.
export function contieneTexto(contenido: string, frase: string): boolean {
  const dump = contenido.toUpperCase();
  const hex = Buffer.from(frase, "latin1").toString("hex").toUpperCase();
  return dump.includes(hex) || dump.includes(`(${frase.toUpperCase()})`);
}
