import type { Copia } from "@/db/consultas/distribucion/copias";
import { fechaHoraLocal } from "@/lib/zona-horaria";
import { numeroDeCopia } from "./copias";
import { construirHoja, type Columna } from "./hoja-excel";
import { ETIQUETA_DESTINO, ETIQUETA_ESTADO_COPIA } from "./tipos";

export type MetaCopias = {
  hospital: string;
  generadoEn: string;
  filtro: string;
  total: number;
  /** Id de la copia reemplazada → «N.º 01 de GTH-PR-02 v1». */
  reemplazos?: Map<number, string>;
};

const fecha = (d: Date | null) => (d ? fechaHoraLocal(d) : null);

/** Las copias controladas en el alcance de quien exporta. Función pura: sin BD ni reloj. */
export function construirExcelCopias(filas: Copia[], meta: MetaCopias): Promise<Buffer> {
  const columnas: Array<Columna<Copia>> = [
    { cab: "Número", ancho: 9, valor: (c) => numeroDeCopia(c.numero) },
    { cab: "Documento", ancho: 38, valor: (c) => `${c.codigo} ${c.titulo}` },
    { cab: "Versión", ancho: 9, valor: (c) => c.version },
    { cab: "Punto", ancho: 28, valor: (c) => c.punto.nombre },
    { cab: "Sede", ancho: 20, valor: (c) => c.punto.sede },
    { cab: "Entregada a", ancho: 28, valor: (c) => c.responsable.nombre },
    { cab: "Emitida por", ancho: 28, valor: (c) => c.emitidaPor.nombre },
    { cab: "Emitida el", ancho: 18, valor: (c) => fecha(c.emitidaEn) },
    { cab: "Estado", ancho: 13, valor: (c) => ETIQUETA_ESTADO_COPIA[c.estado] },
    { cab: "Recibida el", ancho: 18, valor: (c) => fecha(c.fechas.recibidaEn) },
    { cab: "Por recoger desde", ancho: 18, valor: (c) => fecha(c.fechas.porRecogerEn) },
    { cab: "Recogida el", ancho: 18, valor: (c) => fecha(c.fechas.recogidaEn) },
    { cab: "Destino", ancho: 28, valor: (c) => (c.destinoRecogida ? ETIQUETA_DESTINO[c.destinoRecogida] : null) },
    { cab: "Reemplaza a", ancho: 28, valor: (c) => (c.reemplazaCopiaId === null ? null : (meta.reemplazos?.get(c.reemplazaCopiaId) ?? `Copia ${c.reemplazaCopiaId}`)) },
  ];
  return construirHoja("Copias controladas", "Copias controladas de documentos", columnas, filas, {
    hospital: meta.hospital,
    generadoEn: meta.generadoEn,
    detalle: `${meta.filtro} — Total: ${meta.total}`,
  });
}
