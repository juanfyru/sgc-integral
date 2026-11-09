import type { FilaNormaExcel } from "@/db/consultas/normograma/lectura";
import { construirHoja, type Columna } from "@/lib/distribucion/hoja-excel";
import { ETIQUETA_ESTADO_NORMA, fechaDeNorma } from "./tipos";

/** `alcance`: «Institucional · …» o «Proceso: Consulta Externa · …», con los filtros; con proceso va «Requisito». */
export type MetaNormograma = { hospital: string; generadoEn: string; alcance: string; total: number; conRequisito?: boolean };

const lista = (valores: string[]) => (valores.length > 0 ? valores.join(", ") : null);

function columnas(conRequisito: boolean): Array<Columna<FilaNormaExcel>> {
  return [
    { cab: "Tipo", ancho: 14, valor: (f) => f.tipo },
    { cab: "Número", ancho: 12, valor: (f) => f.numero },
    { cab: "Año", ancho: 8, valor: (f) => f.anio },
    { cab: "Fecha de expedición", ancho: 14, valor: (f) => (f.fechaExpedicion ? fechaDeNorma(f.fechaExpedicion) : null) },
    { cab: "Entidad emisora", ancho: 30, valor: (f) => f.entidadEmisora },
    { cab: "Título", ancho: 48, valor: (f) => f.titulo },
    { cab: "Tema", ancho: 40, valor: (f) => f.tema },
    { cab: "Estado", ancho: 12, valor: (f) => ETIQUETA_ESTADO_NORMA[f.estado] },
    { cab: "Fecha del estado", ancho: 14, valor: (f) => (f.estadoEn ? fechaDeNorma(f.estadoEn) : null) },
    { cab: "Relaciones", ancho: 40, valor: (f) => lista(f.relaciones) },
    { cab: "Procesos", ancho: 36, valor: (f) => lista(f.procesos) },
    ...(conRequisito ? [{ cab: "Requisito", ancho: 48, valor: (f: FilaNormaExcel) => f.requisito }] : []),
    { cab: "Documentos internos", ancho: 30, valor: (f) => lista(f.internos) },
    { cab: "Documentos externos", ancho: 30, valor: (f) => lista(f.externos) },
    { cab: "Enlace oficial", ancho: 40, valor: (f) => f.enlaceOficial },
  ];
}

/**
 * El normograma institucional o el de un proceso (spec 13C §10.6): tipo, número, año, fecha, emisor, título, tema,
 * estado y su fecha, relaciones, procesos (y el requisito en el del proceso), documentos y externos enlazados y enlace;
 * con el encabezado institucional y las celdas neutralizadas (`construirHoja`). Función pura.
 */
export function construirExcelNormograma(filas: FilaNormaExcel[], meta: MetaNormograma): Promise<Buffer> {
  return construirHoja("Normograma", "Normograma", columnas(meta.conRequisito === true), filas, {
    hospital: meta.hospital,
    generadoEn: meta.generadoEn,
    detalle: `${meta.alcance} — Total: ${meta.total}`,
  });
}
