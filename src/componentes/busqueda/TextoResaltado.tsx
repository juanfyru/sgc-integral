import { MARCA_FIN, MARCA_INICIO } from "@/lib/marcas-busqueda";

// Los marcadores de ts_headline se parten en nodos de texto React (nunca
// innerHTML): el contenido del documento jamás se interpreta como HTML.
const PATRON_MARCAS = new RegExp(`${MARCA_INICIO}(.+?)${MARCA_FIN}`, "g");

/** Renderiza el texto de ts_headline convirtiendo las marcas en <mark>. */
export function TextoResaltado({ texto }: { texto: string }) {
  const partes = texto.split(PATRON_MARCAS);
  return (
    <>
      {partes.map((parte, i) =>
        i % 2 === 1 ? (
          <mark
            key={i}
            className="rounded-sm bg-verde/15 px-0.5 text-inherit"
          >
            {parte}
          </mark>
        ) : (
          parte
        ),
      )}
    </>
  );
}
