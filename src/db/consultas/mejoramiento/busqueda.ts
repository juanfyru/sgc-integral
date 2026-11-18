/**
 * Los hallazgos en la búsqueda global (spec 15 §16.2, F15-DC30): la paleta Ctrl K y la página «Buscar». Una consulta, con la
 * visibilidad de la lista (`filtroHallazgos`): quien no ve un hallazgo no lo encuentra ni por su código. La paleta consulta
 * mientras se teclea; liviano, como `espera.ts`, que da «Por evaluar la eficacia» con la regla de la lista.
 */
import { obtenerSql, type Cliente } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { escaparLike } from "@/db/consultas/normograma/busqueda";
import { filtroHallazgos } from "@/lib/alcance";
import { etiquetaDeEstado } from "@/lib/mejoramiento/estados";
import { TERMINALES, type EstadoHallazgo, type ResultadoCierre } from "@/lib/mejoramiento/tipos";
import { evaluablesDesde } from "./espera";

type Opciones = { sql?: Cliente; ahora?: Date };

export type ResultadoHallazgo = { id: number; codigo: string; titulo: string; etiqueta: string };

/**
 * Hasta `limite` hallazgos que la persona ve cuyo código o título contiene el texto, sin tildes ni mayúsculas (`%` y `_` son
 * texto); primero los que empiezan por él en el código, después los abiertos y, entre ellos, los más recientes. La etiqueta es la
 * del estado, como en la lista. Con menos de 2 caracteres, ninguno.
 */
export async function buscarHallazgos(q: string, sesion: SesionFlujo, limite: number, opciones?: Opciones): Promise<ResultadoHallazgo[]> {
  const texto = q.trim();
  if (texto.length < 2) return [];
  const sql = opciones?.sql ?? obtenerSql();
  const contiene = `%${escaparLike(texto)}%`;
  const empieza = `${escaparLike(texto)}%`;
  const filas = await sql`
    SELECT h.id, h.codigo, h.titulo, h.estado, h.resultado_cierre, h.correccion_requerida
    FROM mejora_hallazgos h
    WHERE ${filtroHallazgos(sql, sesion)}
      AND (unaccent(h.codigo) ILIKE unaccent(${contiene}) OR unaccent(h.titulo) ILIKE unaccent(${contiene}))
    ORDER BY (unaccent(h.codigo) ILIKE unaccent(${empieza})) DESC, (h.estado IN ${sql([...TERMINALES])}) ASC, h.id DESC
    LIMIT ${Math.min(Math.max(Math.trunc(limite), 1), 50)}`;
  const enEspera = filas.filter((f) => f.estado === "en_espera").map((f) => Number(f.id));
  const evaluables = enEspera.length > 0 ? await evaluablesDesde(sql, enEspera, opciones?.ahora ?? new Date()) : new Map();
  return filas.map((f) => ({
    id: Number(f.id),
    codigo: f.codigo as string,
    titulo: f.titulo as string,
    etiqueta: etiquetaDeEstado(
      {
        estado: f.estado as EstadoHallazgo,
        resultadoCierre: (f.resultado_cierre as ResultadoCierre | null) ?? null,
        correccionRequerida: (f.correccion_requerida as boolean | null) ?? null,
      },
      { yaSePuedeEvaluar: evaluables.get(Number(f.id))?.yaSePuede === true },
    ),
  }));
}
