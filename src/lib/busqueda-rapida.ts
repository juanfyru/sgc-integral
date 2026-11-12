import { MARCA_FIN, MARCA_INICIO } from "@/lib/marcas-busqueda";

export const LARGO_MAXIMO_CONSULTA = 120;
export const LARGO_MINIMO_CONSULTA = 2;

/**
 * Un resultado de la paleta: un documento (código, título resaltado y sigla del tipo) o una norma (su nombre
 * «Resolución 3100 de 2019» en `codigo`, su título y su estado en `tipo`) o un indicador (su código, su nombre y, en
 * `tipo`, su proceso o «Retirado»).
 */
export type ResultadoRapido = {
  grupo: "documento" | "norma" | "indicador";
  codigo: string;
  titulo: string;
  tituloResaltado: string | null;
  tipo: string;
  ruta: string;
};

/** Hasta cuántas normas trae la paleta, debajo de los documentos (spec 13C §10.6). */
export const NORMAS_EN_LA_PALETA = 4;

/** Hasta cuántos indicadores trae la paleta, debajo de las normas (spec 14 §12.8). */
export const INDICADORES_EN_LA_PALETA = 4;

/** Hasta cuántos indicadores trae la página «Buscar», debajo de las normas. */
export const INDICADORES_EN_LA_BUSQUEDA = 5;

/** Los grupos de la paleta en su orden: los documentos, las normas y los indicadores (las flechas recorren ese orden). */
export function gruposDeResultados(resultados: ResultadoRapido[]): {
  documentos: ResultadoRapido[];
  normas: ResultadoRapido[];
  indicadores: ResultadoRapido[];
} {
  return {
    documentos: resultados.filter((r) => r.grupo === "documento"),
    normas: resultados.filter((r) => r.grupo === "norma"),
    indicadores: resultados.filter((r) => r.grupo === "indicador"),
  };
}

/** Las marcas ⟦⟧ son de ts_headline: si el usuario las teclea, romperían el resaltado. */
export function normalizarConsulta(q: string): string {
  return q.replaceAll(MARCA_INICIO, "").replaceAll(MARCA_FIN, "").trim().slice(0, LARGO_MAXIMO_CONSULTA);
}

export type EstadoBusqueda = "inactivo" | "cargando" | "listo" | "error";

/** Respuesta guardada junto a la consulta que la produjo; `resultados: null` es un error de red. */
export type RespuestaRapida = { consulta: string; resultados: ResultadoRapido[] | null };

/** El estado se deriva de la consulta actual: una respuesta de otra consulta cuenta como pendiente. */
export function estadoDeBusqueda(consulta: string, respuesta: RespuestaRapida | null): EstadoBusqueda {
  if (consulta.length < LARGO_MINIMO_CONSULTA) return "inactivo";
  if (!respuesta || respuesta.consulta !== consulta) return "cargando";
  return respuesta.resultados === null ? "error" : "listo";
}
