import type { FilaSemaforo } from "@/db/consultas/vigencia/semaforo";
import { construirHoja, type Columna } from "@/lib/distribucion/hoja-excel";
import { ETIQUETA_ETAPA } from "@/lib/tramites/tipos";
import { textoFecha } from "@/lib/vigencia/plazo";
import { textoUltimaRevision, textoVigenciaDeFila } from "@/lib/vigencia/semaforo";

export type MetaSemaforo = { hospital: string; generadoEn: string; filtro: string; total: number; zona: string };

function columnas(zona: string): Array<Columna<FilaSemaforo>> {
  const fecha = (d: Date | null) => (d ? textoFecha(d, zona) : null);
  return [
    { cab: "Código", ancho: 16, valor: (f) => f.codigo },
    { cab: "Versión", ancho: 10, valor: (f) => (f.origen === "externo" && f.version.edicion ? `ed. ${f.version.edicion}` : f.version.numero) },
    { cab: "Título", ancho: 42, valor: (f) => f.titulo },
    { cab: "Tipo", ancho: 18, valor: (f) => f.tipo },
    { cab: "Origen", ancho: 10, valor: (f) => (f.origen === "externo" ? "Externo" : "Interno") },
    { cab: "Proceso", ancho: 32, valor: (f) => f.proceso.nombre },
    { cab: "Plazo (meses)", ancho: 13, valor: (f) => f.mesesRevision },
    { cab: "Última revisión", ancho: 15, valor: (f) => fecha(f.ultimaRevision?.fecha ?? null) },
    { cab: "Cómo se revisó", ancho: 34, valor: (f) => (f.ultimaRevision ? textoUltimaRevision(f.ultimaRevision) : null) },
    { cab: "Próxima revisión", ancho: 16, valor: (f) => fecha(f.proximaRevision) },
    { cab: "Fijada por", ancho: 30, valor: (f) => (f.fijada ? `${f.fijada.por} el ${textoFecha(f.fijada.en, zona)}` : null) },
    { cab: "Nota de la fecha fijada", ancho: 40, valor: (f) => f.fijada?.nota ?? null },
    { cab: "Vigencia", ancho: 30, valor: (f) => textoVigenciaDeFila(f) },
    { cab: "Trámite abierto", ancho: 26, valor: (f) => (f.tramite ? `${f.tramite.numero} · ${ETIQUETA_ETAPA[f.tramite.etapa]}` : null) },
  ];
}

/** El semáforo filtrado. Función pura: filas y metadatos ya formateados, sin BD ni reloj. */
export function construirExcelSemaforo(filas: FilaSemaforo[], meta: MetaSemaforo): Promise<Buffer> {
  return construirHoja("Semáforo", "Semáforo de vigencia de los documentos", columnas(meta.zona), filas, {
    hospital: meta.hospital,
    generadoEn: meta.generadoEn,
    detalle: `${meta.filtro} — Total: ${meta.total}`,
  });
}
