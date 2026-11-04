import { MARCA_FIN, MARCA_INICIO } from "@/lib/marcas-busqueda";

export const LARGO_MAXIMO_CONSULTA = 120;
export const LARGO_MINIMO_CONSULTA = 2;

export type ResultadoRapido = {
  codigo: string;
  titulo: string;
  tituloResaltado: string | null;
  tipo: string;
  ruta: string;
};

/** Las marcas ⟦⟧ son de ts_headline: si el usuario las teclea, romperían el resaltado. */
export function normalizarConsulta(q: string): string {
  return q.replaceAll(MARCA_INICIO, "").replaceAll(MARCA_FIN, "").trim().slice(0, LARGO_MAXIMO_CONSULTA);
}
