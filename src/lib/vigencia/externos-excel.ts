import type { FilaExterno } from "@/db/consultas/vigencia/externos";
import { construirHoja, type Columna } from "@/lib/distribucion/hoja-excel";
import { textoFecha } from "@/lib/vigencia/plazo";
import { textoVigenciaDeExterno } from "@/lib/vigencia/semaforo";
import { ETIQUETA_RESULTADO } from "@/lib/vigencia/tipos";

export type MetaExternos = { hospital: string; generadoEn: string; filtro: string; total: number; zona: string };

function columnas(zona: string): Array<Columna<FilaExterno>> {
  const fecha = (d: Date | null) => (d ? textoFecha(d, zona) : null);
  return [
    { cab: "Código", ancho: 14, valor: (f) => f.codigo },
    { cab: "Título", ancho: 42, valor: (f) => f.titulo },
    { cab: "Título original", ancho: 36, valor: (f) => f.tituloOriginal },
    { cab: "Entidad emisora", ancho: 30, valor: (f) => f.emisor },
    { cab: "Edición", ancho: 14, valor: (f) => f.edicion },
    { cab: "Adopción", ancho: 13, valor: (f) => fecha(f.adoptadaEn) },
    { cab: "Última verificación", ancho: 17, valor: (f) => fecha(f.ultimaVerificacion?.fecha ?? null) },
    { cab: "Resultado", ancho: 24, valor: (f) => (f.ultimaVerificacion ? ETIQUETA_RESULTADO[f.ultimaVerificacion.resultado] : null) },
    { cab: "Verificó", ancho: 26, valor: (f) => f.ultimaVerificacion?.nombre ?? null },
    { cab: "Próxima verificación", ancho: 18, valor: (f) => fecha(f.proximaVerificacion) },
    { cab: "Responsable técnico", ancho: 26, valor: (f) => f.responsable },
    {
      cab: "Vigencia",
      ancho: 34,
      valor: (f) => textoVigenciaDeExterno({ adoptado: f.adoptadaEn !== null, vigencia: f.vigencia, impacto: f.impacto, edicionPendiente: f.edicionPendiente }),
    },
    { cab: "Proceso", ancho: 30, valor: (f) => f.proceso.nombre },
    { cab: "Fuente oficial", ancho: 40, valor: (f) => f.fuenteOficial },
    { cab: "Norma enlazada", ancho: 30, valor: (f) => f.norma },
    { cab: "Copias controladas vivas", ancho: 14, valor: (f) => f.copiasVivas },
  ];
}

/**
 * La matriz de documentos externos SGC-MZ-03 filtrada (spec 13C §8.6): las columnas de la pantalla más la fuente
 * oficial, la norma enlazada y las copias controladas vivas. Función pura: filas y metadatos ya formateados.
 */
export function construirExcelExternos(filas: FilaExterno[], meta: MetaExternos): Promise<Buffer> {
  return construirHoja("Externos", "Matriz de documentos externos (SGC-MZ-03)", columnas(meta.zona), filas, {
    hospital: meta.hospital,
    generadoEn: meta.generadoEn,
    detalle: `${meta.filtro} — Total: ${meta.total}`,
  });
}
